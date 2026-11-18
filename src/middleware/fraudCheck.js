/*
  Fraud Check Middleware — Fully Automated 24/7

  Intercepts transfer requests and runs the 3-tier fraud detection system.

  Decision flow:
    LOW (< 30)       → pass through silently (no alert)
    MEDIUM/HIGH      → AI Agent auto-decides, or HOLD for human review
    CRITICAL (≥ 80)  → AUTO-BLOCK + freeze account + email admin

  New "HOLD" flow:
    When the AI Agent can't decide with confidence, the transaction is
    NOT executed. It returns HTTP 202 and queues for the next available admin.
    This is the key safety feature — money doesn't move until someone decides.
*/

const prisma = require('../config/prisma');
const fraudDetection = require('../services/fraudDetection');
const emailService = require('../services/email');
const logger = require('../utils/logger');
const catchAsync = require('../utils/catchAsync');

const fraudCheck = catchAsync(async (req, res, next) => {
    const { fromAccount, toAccount, amount } = req.body;

    // Run the full 3-tier fraud analysis
    const result = await fraudDetection.analyzeTransaction(
        fromAccount, toAccount, amount, req.user.id
    );

    // ─── LOW RISK — no alert, pass through ───
    if (result.riskScore < 30) {
        return next();
    }

    // ─── Create fraud alert record for medium+ risk ───
    const fraudAlert = await prisma.fraudAlert.create({
        data: {
            fromAccountId: fromAccount,
            toAccountId: toAccount,
            amount,
            riskScore: result.riskScore,
            riskLevel: result.riskLevel,
            triggeredRules: result.triggeredRules,
            aiAnalysis: result.aiAnalysis,
            status: 'flagged',
            // AI Agent fields
            autoReviewed: !!(result.agentResult && result.agentResult.confidence >= 70),
            agentConfidence: result.agentResult?.confidence || null,
            agentReasoning: result.agentResult?.reasoning || null
        }
    });

    // ═══════════════════════════════════════════════
    //  BLOCK — auto-blocked by rules OR by AI Agent
    // ═══════════════════════════════════════════════
    if (result.shouldBlock) {
        // Auto-review the alert since it was auto-decided
        if (result.agentResult) {
            await prisma.fraudAlert.update({
                where: { id: fraudAlert.id },
                data: {
                    status: 'confirmed_fraud',
                    autoReviewed: true,
                    resolvedAt: new Date(),
                    reviewNotes: `Auto-blocked by AI Agent (confidence: ${result.agentResult.confidence}%). ${result.agentResult.reasoning}`
                }
            });
        }

        logger.warn('🚫 Transaction BLOCKED by fraud detection', {
            fraudAlertId: fraudAlert.id,
            riskScore: result.riskScore,
            riskLevel: result.riskLevel,
            blockedBy: result.agentResult ? 'AI_AGENT' : 'STATISTICAL_ENGINE',
            fromAccount,
            toAccount,
            amount
        });

        // Notify admin (non-blocking)
        notifyAdmin(fraudAlert, result, 'BLOCKED').catch(err =>
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
                decidedBy: result.agentResult ? 'ai_agent' : 'automated_rules',
                agentAnalysis: result.aiAnalysis
            }
        });
    }

    // ═══════════════════════════════════════════════
    //  HOLD — Agent uncertain, hold for human review
    //  Transaction is NOT executed. Money stays safe.
    // ═══════════════════════════════════════════════
    if (result.shouldHold) {
        logger.info('⏸️ Transaction HELD for human review', {
            fraudAlertId: fraudAlert.id,
            riskScore: result.riskScore,
            agentDecision: result.agentResult?.decision,
            agentConfidence: result.agentResult?.confidence
        });

        // Notify admin urgently
        notifyAdmin(fraudAlert, result, 'HELD_FOR_REVIEW').catch(err =>
            logger.error('Failed to send hold alert email', { error: err.message })
        );

        return res.status(202).json({
            success: false,
            message: 'Transaction is being held for review by our fraud team. You will be notified once it is processed.',
            fraud: {
                alertId: fraudAlert.id,
                riskScore: result.riskScore,
                riskLevel: result.riskLevel,
                status: 'pending_review',
                estimatedReviewTime: getEstimatedReviewTime(),
                agentAnalysis: result.aiAnalysis
            }
        });
    }

    // ═══════════════════════════════════════════════
    //  ALLOW (flagged but allowed by AI Agent)
    // ═══════════════════════════════════════════════
    if (result.agentResult) {
        await prisma.fraudAlert.update({
            where: { id: fraudAlert.id },
            data: {
                status: 'dismissed',
                autoReviewed: true,
                resolvedAt: new Date(),
                reviewNotes: `Auto-approved by AI Agent (confidence: ${result.agentResult.confidence}%). ${result.agentResult.reasoning}`
            }
        });
    }

    logger.info('✅ Transaction allowed (flagged but approved)', {
        fraudAlertId: fraudAlert.id,
        riskScore: result.riskScore,
        decidedBy: result.agentResult ? 'AI_AGENT' : 'RULES'
    });

    // Attach fraud alert to request so the controller can link it to the transaction
    req.fraudAlert = fraudAlert;
    next();
});

// ─── Helper: Estimated review time based on current hour ───
function getEstimatedReviewTime() {
    const hour = new Date().getHours();
    if (hour >= 9 && hour <= 18) return '15-30 minutes';
    if (hour >= 6 || hour <= 22) return '1-2 hours';
    return 'Next business day (by 10:00 AM)';
}

// ─── Helper: Notify admin via email ────────────────────────
async function notifyAdmin(fraudAlert, result, action) {
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

    const emoji = action === 'BLOCKED' ? '🚫' : '⏸️';
    const subject = `${emoji} Fraud Alert — Transaction ${action} [Risk: ${result.riskLevel.toUpperCase()}]`;

    const text = `
FRAUD DETECTION ALERT — ${action}
${'='.repeat(45)}

Alert ID: ${fraudAlert.id}
Risk Score: ${result.riskScore}/100
Risk Level: ${result.riskLevel.toUpperCase()}
Decided By: ${result.agentResult ? 'AI Fraud Agent' : 'Statistical Engine'}
Time: ${new Date().toISOString()}

TRANSACTION DETAILS:
- Sender: ${senderName} (${senderEmail})
- From Account: ${fraudAlert.fromAccountId}
- To Account: ${fraudAlert.toAccountId}
- Amount: ₹${parseFloat(fraudAlert.amount)}

TRIGGERED RULES:
${result.triggeredRules.map(r => `• ${r}`).join('\n')}

${result.aiAnalysis ? `AI AGENT ANALYSIS:\n${result.aiAnalysis}\n` : ''}
${result.agentResult?.riskFactors?.length ? `RISK FACTORS:\n${result.agentResult.riskFactors.map(r => `• ${r}`).join('\n')}\n` : ''}
${result.agentResult?.mitigatingFactors?.length ? `MITIGATING FACTORS:\n${result.agentResult.mitigatingFactors.map(r => `• ${r}`).join('\n')}\n` : ''}

ACCOUNT METADATA:
- Trust Score: ${result.metadata?.trustScore || 'N/A'}/100
- New Account: ${result.metadata?.isNewAccount ? 'Yes' : 'No'}
- Past Transactions: ${result.metadata?.profileTxCount || 0}

${action === 'HELD_FOR_REVIEW' ? `ACTION REQUIRED:
Review and approve/reject: PATCH /api/admin/fraud-alerts/${fraudAlert.id}/review

The transaction has NOT been executed. The user has been informed
their transaction is under review.` : `This was auto-${action.toLowerCase()} by the system — no immediate action needed.
Review: GET /api/admin/fraud-alerts/${fraudAlert.id}`}

— Banking System Fraud Detection Agent
`;

    for (const admin of admins) {
        await emailService.sendEmail(admin.email, subject, text);
    }
}

module.exports = fraudCheck;
