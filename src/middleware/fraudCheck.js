/*
  Fraud Check Middleware
  Intercepts transfer requests and runs fraud detection before the transaction executes.
  - If risk is CRITICAL (score ≥ 80) or AI says FRAUDULENT → BLOCK (403)
  - If risk is MEDIUM/HIGH but allowed → FLAG and attach to request
  - If risk is LOW → pass through silently
*/

const prisma = require('../config/prisma');
const fraudDetection = require('../services/fraudDetection');
const emailService = require('../services/email');
const logger = require('../utils/logger');
const catchAsync = require('../utils/catchAsync');

const fraudCheck = catchAsync(async (req, res, next) => {
    const { fromAccount, toAccount, amount } = req.body;

    // Run fraud analysis
    const result = await fraudDetection.analyzeTransaction(
        fromAccount,
        toAccount,
        amount,
        req.user.id
    );

    // If risk is low (score < 30), skip alert creation entirely
    if (result.riskScore < 30) {
        return next();
    }

    // Create fraud alert record for medium+ risk
    const fraudAlert = await prisma.fraudAlert.create({
        data: {
            fromAccountId: fromAccount,
            toAccountId: toAccount,
            amount,
            riskScore: result.riskScore,
            riskLevel: result.riskLevel,
            triggeredRules: result.triggeredRules,
            aiAnalysis: result.aiAnalysis,
            status: 'flagged'
        }
    });

    // If should block → reject the transaction immediately
    if (result.shouldBlock) {
        logger.warn('🚫 Transaction BLOCKED by fraud detection', {
            fraudAlertId: fraudAlert.id,
            riskScore: result.riskScore,
            riskLevel: result.riskLevel,
            fromAccount,
            toAccount,
            amount
        });

        // Send alert email to admin (non-blocking)
        notifyAdminOfFraud(fraudAlert, result).catch(err =>
            logger.error('Failed to send fraud alert email', { error: err.message })
        );

        return res.status(403).json({
            success: false,
            message: 'Transaction blocked by fraud detection system',
            fraud: {
                alertId: fraudAlert.id,
                riskScore: result.riskScore,
                riskLevel: result.riskLevel,
                triggeredRules: result.triggeredRules,
                aiAnalysis: result.aiAnalysis
            }
        });
    }

    // Medium/high risk but not blocked — flag and continue
    logger.info('⚠️  Transaction flagged but allowed', {
        fraudAlertId: fraudAlert.id,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel
    });

    // Attach fraud alert to request so the controller can link it
    req.fraudAlert = fraudAlert;
    next();
});

// ─── Helper: Notify admin via email ───────────────────────
async function notifyAdminOfFraud(fraudAlert, result) {
    // Find all admin users
    const admins = await prisma.user.findMany({
        where: { role: 'admin' },
        select: { email: true, name: true }
    });

    if (admins.length === 0) {
        logger.warn('No admin users found to notify about fraud alert');
        return;
    }

    const fromAccount = await prisma.account.findUnique({
        where: { id: fraudAlert.fromAccountId },
        include: { user: { select: { name: true, email: true } } }
    });
    const senderName = fromAccount?.user?.name || 'Unknown';
    const senderEmail = fromAccount?.user?.email || 'Unknown';

    const subject = `🚨 Fraud Alert — Transaction Blocked [Risk: ${result.riskLevel.toUpperCase()}]`;
    const text = `
FRAUD DETECTION ALERT
=====================

Alert ID: ${fraudAlert.id}
Risk Score: ${result.riskScore}/100
Risk Level: ${result.riskLevel.toUpperCase()}
Time: ${new Date().toISOString()}

TRANSACTION DETAILS:
- Sender: ${senderName} (${senderEmail})
- From Account: ${fraudAlert.fromAccountId}
- To Account: ${fraudAlert.toAccountId}
- Amount: ₹${parseFloat(fraudAlert.amount)}

TRIGGERED RULES:
${result.triggeredRules.map(r => `• ${r}`).join('\n')}

${result.aiAnalysis ? `AI ANALYSIS:\n${result.aiAnalysis}` : ''}

ACTION REQUIRED:
Review this alert at GET /api/admin/fraud-alerts/${fraudAlert.id}
To review: PATCH /api/admin/fraud-alerts/${fraudAlert.id}/review

— Banking System Fraud Detection Agent
`;

    for (const admin of admins) {
        await emailService.sendEmail(admin.email, subject, text);
    }
}

module.exports = fraudCheck;
