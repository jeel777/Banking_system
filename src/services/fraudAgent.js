/*
  AI Fraud Analyst Agent
  
  Purpose: Investigate borderline fraud cases (score 30-79) by:
    1. Gathering full evidence from the database
    2. Comparing against past confirmed fraud cases
    3. Making an informed allow/block/hold decision
    4. Providing reasoning for the audit trail
  
  Key difference from old approach:
    - OLD: "Here's a transaction, is it fraud?" (no context, no evidence)
    - NEW: "Here's a complete case file with evidence. Investigate and decide." (full context)

  Gemini acts as an INVESTIGATOR, not a predictor.
  It receives the same evidence a human fraud analyst would review.
*/

const prisma = require('../config/prisma');
const { getBalance } = require('../utils/balance');
const logger = require('../utils/logger');

let genAI = null;

function getGeminiClient() {
    if (!genAI) {
        const { GoogleGenAI } = require('@google/genai');
        genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return genAI;
}

// ─── Gather Evidence (what a human analyst would look at) ────

async function gatherEvidence(fromAccountId, toAccountId, amount) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
        senderAccount,
        senderUser,
        recipientAccount,
        senderHistory,
        senderToRecipientHistory,
        senderFraudHistory,
        recipientFraudHistory,
        similarFraudCases,
        recentHighValueTx
    ] = await Promise.all([
        // Sender account details
        prisma.account.findUnique({
            where: { id: fromAccountId },
            select: { id: true, status: true, currency: true, createdAt: true, userId: true }
        }),
        // Sender user info (via account)
        prisma.account.findUnique({
            where: { id: fromAccountId },
            select: { user: { select: { name: true, createdAt: true, role: true } } }
        }).then(a => a?.user),
        // Recipient account details
        prisma.account.findUnique({
            where: { id: toAccountId },
            select: { id: true, status: true, createdAt: true, userId: true }
        }),
        // Sender's last 20 transactions
        prisma.transaction.findMany({
            where: { fromAccountId, status: 'completed' },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { amount: true, createdAt: true, toAccountId: true }
        }),
        // History between these two accounts specifically
        prisma.transaction.count({
            where: { fromAccountId, toAccountId, status: 'completed' }
        }),
        // Sender's past fraud alerts
        prisma.fraudAlert.findMany({
            where: { fromAccountId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                riskScore: true, riskLevel: true, status: true,
                triggeredRules: true, amount: true, createdAt: true
            }
        }),
        // Recipient's past fraud alerts (as receiver)
        prisma.fraudAlert.findMany({
            where: { toAccountId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                riskScore: true, riskLevel: true, status: true,
                amount: true, createdAt: true
            }
        }),
        // Similar past confirmed fraud cases (similar amount range)
        prisma.fraudAlert.findMany({
            where: {
                status: 'confirmed_fraud',
                amount: {
                    gte: amount * 0.5,
                    lte: amount * 2
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                triggeredRules: true, riskScore: true, amount: true
            }
        }),
        // System-wide recent high-value transactions (context)
        prisma.transaction.count({
            where: {
                amount: { gte: amount },
                status: 'completed',
                createdAt: { gte: sevenDaysAgo }
            }
        })
    ]);

    const senderBalance = await getBalance(fromAccountId);
    const senderAgeHours = senderAccount
        ? Math.round((Date.now() - senderAccount.createdAt.getTime()) / (1000 * 60 * 60))
        : 0;

    return {
        sender: {
            accountAge: `${senderAgeHours} hours (${Math.round(senderAgeHours / 24)} days)`,
            userName: senderUser?.name || 'Unknown',
            currentBalance: senderBalance,
            balanceAfterTx: senderBalance - amount,
            accountStatus: senderAccount?.status
        },
        recipient: {
            accountAge: recipientAccount
                ? `${Math.round((Date.now() - recipientAccount.createdAt.getTime()) / (1000 * 60 * 60 * 24))} days`
                : 'Unknown',
            accountStatus: recipientAccount?.status,
            pastFraudAlerts: recipientFraudHistory.length,
            fraudDetails: recipientFraudHistory
        },
        transactionHistory: {
            last20Transactions: senderHistory.map(tx => ({
                amount: parseFloat(tx.amount),
                to: tx.toAccountId.slice(-6),
                date: tx.createdAt.toISOString()
            })),
            previousTransfersToRecipient: senderToRecipientHistory,
            isNewRecipient: senderToRecipientHistory === 0
        },
        fraudHistory: {
            senderPastAlerts: senderFraudHistory,
            recipientPastAlerts: recipientFraudHistory,
            similarConfirmedFrauds: similarFraudCases
        },
        systemContext: {
            similarHighValueTxLast7Days: recentHighValueTx
        }
    };
}

// ─── AI Agent Investigation ─────────────────────────────────

async function investigate(transactionData, ruleScore, triggeredRules, profile) {
    if (!process.env.GEMINI_API_KEY) {
        logger.warn('GEMINI_API_KEY not set — agent cannot investigate');
        return {
            decision: 'HOLD',
            confidence: 0,
            reasoning: 'AI agent unavailable — holding for human review',
            riskFactors: ['AGENT_UNAVAILABLE'],
            mitigatingFactors: []
        };
    }

    try {
        // Step 1: Gather all evidence from the database
        const evidence = await gatherEvidence(
            transactionData.fromAccountId,
            transactionData.toAccountId,
            transactionData.amount
        );

        const ai = getGeminiClient();

        // Step 2: Build the complete case file for the agent
        const prompt = `You are an experienced fraud analyst at a bank. You are investigating a flagged transaction. Your job is to analyze ALL the evidence below and make a decision.

═══ TRANSACTION UNDER REVIEW ═══
Amount: ₹${transactionData.amount}
From Account: ...${transactionData.fromAccountId.slice(-6)}
To Account: ...${transactionData.toAccountId.slice(-6)}
Time: ${new Date().toISOString()}
Statistical Risk Score: ${ruleScore}/100

═══ TRIGGERED RULES ═══
${triggeredRules.map(r => `• ${r}`).join('\n')}

═══ SENDER PROFILE ═══
• Name: ${evidence.sender.userName}
• Account Age: ${evidence.sender.accountAge}
• Current Balance: ₹${evidence.sender.currentBalance}
• Balance After This Transaction: ₹${evidence.sender.balanceAfterTx}
• Account Status: ${evidence.sender.accountStatus}
• Trust Score: ${profile.trustScore}/100
• Total Past Transactions: ${profile.totalTransactions}
${profile.isNew ? '⚠️ NEW ACCOUNT — No behavioral history' : `• Avg Transaction: ₹${Math.round(profile.avgAmount)}
• Max Transaction: ₹${Math.round(profile.maxAmount)}
• Daily Frequency: ${profile.dailyFrequency.toFixed(1)} tx/day`}

═══ RECIPIENT ANALYSIS ═══
• Account Age: ${evidence.recipient.accountAge}
• Account Status: ${evidence.recipient.accountStatus}
• Past Fraud Alerts on Recipient: ${evidence.recipient.pastFraudAlerts}
${evidence.recipient.fraudDetails.length > 0 ? `• Recent Fraud Details: ${JSON.stringify(evidence.recipient.fraudDetails.slice(0, 3))}` : '• No fraud history on recipient'}

═══ TRANSACTION HISTORY ═══
• Previous transfers to this recipient: ${evidence.transactionHistory.previousTransfersToRecipient}
• Is new recipient: ${evidence.transactionHistory.isNewRecipient}
• Last 10 transactions by sender:
${evidence.transactionHistory.last20Transactions.slice(0, 10).map(tx =>
    `  ₹${tx.amount} → ...${tx.to} on ${tx.date.split('T')[0]}`
).join('\n') || '  (none)'}

═══ FRAUD PATTERN DATABASE ═══
• Sender's past fraud alerts: ${evidence.fraudHistory.senderPastAlerts.length}
${evidence.fraudHistory.senderPastAlerts.length > 0 ?
    evidence.fraudHistory.senderPastAlerts.map(a =>
        `  - Score: ${a.riskScore}, Level: ${a.riskLevel}, Status: ${a.status}, Amount: ₹${parseFloat(a.amount)}`
    ).join('\n') : '  (clean history)'}
• Similar confirmed fraud cases in system: ${evidence.fraudHistory.similarConfirmedFrauds.length}
${evidence.fraudHistory.similarConfirmedFrauds.map(f =>
    `  - ₹${parseFloat(f.amount)}, Score: ${f.riskScore}, Rules: ${f.triggeredRules.slice(0, 2).join(', ')}`
).join('\n') || '  (none found)'}
• System-wide similar high-value transactions (last 7d): ${evidence.systemContext.similarHighValueTxLast7Days}

═══ YOUR TASK ═══
Based on ALL the evidence above, make a decision:

1. ALLOW — Evidence suggests this is a legitimate transaction
2. BLOCK — Evidence suggests this is fraudulent
3. HOLD — Evidence is genuinely ambiguous, needs human review

Consider:
- Is the amount consistent with the sender's history?
- Is the recipient trustworthy or suspicious?
- Are there patterns matching confirmed fraud cases?
- Could this be a legitimate large transaction (salary, rent, business)?
- For new accounts: is there anything inherently suspicious beyond being new?

Respond with ONLY this JSON (no markdown, no code blocks):
{
  "decision": "ALLOW" | "BLOCK" | "HOLD",
  "confidence": <number 0-100>,
  "reasoning": "<2-3 sentence explanation citing specific evidence>",
  "risk_factors": ["<list of key risk factors found>"],
  "mitigating_factors": ["<list of factors suggesting legitimacy>"]
}`;

        // Step 3: Get the agent's investigation result
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
        });

        const text = response.text.trim();
        const parsed = JSON.parse(text);

        logger.info('Fraud Agent investigation complete', {
            decision: parsed.decision,
            confidence: parsed.confidence
        });

        return {
            decision: parsed.decision || 'HOLD',
            confidence: parsed.confidence || 0,
            reasoning: parsed.reasoning || 'No reasoning provided',
            riskFactors: parsed.risk_factors || [],
            mitigatingFactors: parsed.mitigating_factors || []
        };
    } catch (error) {
        logger.error('Fraud Agent investigation failed', { error: error.message });

        // On failure, hold for human review (safe default — never allow on error)
        return {
            decision: 'HOLD',
            confidence: 0,
            reasoning: `Agent investigation failed: ${error.message}. Holding for human review.`,
            riskFactors: ['AGENT_FAILURE'],
            mitigatingFactors: []
        };
    }
}

module.exports = { investigate, gatherEvidence };
