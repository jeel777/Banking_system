/*
  Fraud Detection Service — AI Agent
  Hybrid approach:
    1. Rule-based scoring engine (fast, deterministic)
    2. Google Gemini AI for deeper analysis on borderline cases

  Risk Levels:
    0-29   → low      → ALLOW
    30-49  → medium   → ALLOW (flagged for review)
    50-79  → high     → CONSULT AI → block if AI agrees
    80-100 → critical → AUTO-BLOCK
*/

const prisma = require('../config/prisma');
const { getBalance } = require('../utils/balance');
const logger = require('../utils/logger');

// ─── Gemini AI Setup ──────────────────────────────────────
let genAI = null;

function getGeminiClient() {
    if (!genAI) {
        const { GoogleGenAI } = require('@google/genai');
        genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return genAI;
}

// ─── Constants ────────────────────────────────────────────
const THRESHOLDS = {
    HIGH_AMOUNT: 50000,           // ₹50,000
    VERY_HIGH_AMOUNT: 200000,     // ₹2,00,000
    VELOCITY_1H_MAX: 5,           // max transactions in 1 hour
    VELOCITY_10M_MAX: 3,          // max transactions in 10 minutes
    ODD_HOURS_START: 1,           // 1 AM
    ODD_HOURS_END: 5,             // 5 AM
    NEW_ACCOUNT_HOURS: 24,        // account age threshold
    DRAIN_PERCENTAGE: 5,          // less than 5% remaining = near-drain
};

const SCORE_WEIGHTS = {
    HIGH_AMOUNT: 20,
    VERY_HIGH_AMOUNT: 35,
    VELOCITY_1H: 25,
    RAPID_FIRE_10M: 30,
    ODD_HOURS: 15,
    NEW_ACCOUNT: 10,
    NEAR_DRAIN: 20,
};

// ─── Rule-Based Scoring Engine ────────────────────────────
async function runRuleChecks(fromAccountId, amount, userId) {
    const triggeredRules = [];
    let score = 0;

    // 1. High amount check
    if (amount > THRESHOLDS.VERY_HIGH_AMOUNT) {
        score += SCORE_WEIGHTS.VERY_HIGH_AMOUNT;
        triggeredRules.push(`VERY_HIGH_AMOUNT: ₹${amount} exceeds ₹${THRESHOLDS.VERY_HIGH_AMOUNT}`);
    } else if (amount > THRESHOLDS.HIGH_AMOUNT) {
        score += SCORE_WEIGHTS.HIGH_AMOUNT;
        triggeredRules.push(`HIGH_AMOUNT: ₹${amount} exceeds ₹${THRESHOLDS.HIGH_AMOUNT}`);
    }

    // 2. Velocity check — transactions in last 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTxCount1H = await prisma.transaction.count({
        where: {
            fromAccountId,
            createdAt: { gte: oneHourAgo },
            status: 'completed'
        }
    });

    if (recentTxCount1H >= THRESHOLDS.VELOCITY_1H_MAX) {
        score += SCORE_WEIGHTS.VELOCITY_1H;
        triggeredRules.push(`VELOCITY_1H: ${recentTxCount1H} transactions in last hour (limit: ${THRESHOLDS.VELOCITY_1H_MAX})`);
    }

    // 3. Rapid-fire check — transactions in last 10 minutes
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentTxCount10M = await prisma.transaction.count({
        where: {
            fromAccountId,
            createdAt: { gte: tenMinsAgo },
            status: 'completed'
        }
    });

    if (recentTxCount10M >= THRESHOLDS.VELOCITY_10M_MAX) {
        score += SCORE_WEIGHTS.RAPID_FIRE_10M;
        triggeredRules.push(`RAPID_FIRE_10M: ${recentTxCount10M} transactions in last 10 minutes (limit: ${THRESHOLDS.VELOCITY_10M_MAX})`);
    }

    // 4. Odd hours check (1 AM – 5 AM IST)
    const currentHourIST = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false });
    const hour = parseInt(currentHourIST);
    if (hour >= THRESHOLDS.ODD_HOURS_START && hour < THRESHOLDS.ODD_HOURS_END) {
        score += SCORE_WEIGHTS.ODD_HOURS;
        triggeredRules.push(`ODD_HOURS: Transaction at ${hour}:00 IST (suspicious window: ${THRESHOLDS.ODD_HOURS_START}-${THRESHOLDS.ODD_HOURS_END} AM)`);
    }

    // 5. New account check (created < 24 hours ago)
    const fromAccount = await prisma.account.findUnique({ where: { id: fromAccountId } });
    if (fromAccount) {
        const accountAgeHours = (Date.now() - fromAccount.createdAt.getTime()) / (1000 * 60 * 60);
        if (accountAgeHours < THRESHOLDS.NEW_ACCOUNT_HOURS) {
            score += SCORE_WEIGHTS.NEW_ACCOUNT;
            triggeredRules.push(`NEW_ACCOUNT: Account is only ${Math.round(accountAgeHours)} hours old (threshold: ${THRESHOLDS.NEW_ACCOUNT_HOURS}h)`);
        }

        // 6. Near-drain check — would transaction leave < 5% balance?
        const currentBalance = await getBalance(fromAccountId);
        const remainingPercent = ((currentBalance - amount) / currentBalance) * 100;
        if (remainingPercent < THRESHOLDS.DRAIN_PERCENTAGE && currentBalance > 0) {
            score += SCORE_WEIGHTS.NEAR_DRAIN;
            triggeredRules.push(`NEAR_DRAIN: Would leave only ${remainingPercent.toFixed(1)}% balance (threshold: ${THRESHOLDS.DRAIN_PERCENTAGE}%)`);
        }
    }

    // Cap score at 100
    score = Math.min(score, 100);

    return { score, triggeredRules };
}

// ─── Gemini AI Analysis ───────────────────────────────────
async function getAIAnalysis(transactionContext) {
    if (!process.env.GEMINI_API_KEY) {
        logger.warn('GEMINI_API_KEY not set — skipping AI analysis');
        return {
            verdict: 'UNKNOWN',
            explanation: 'AI analysis unavailable: API key not configured'
        };
    }

    try {
        const ai = getGeminiClient();

        const prompt = `You are a fraud detection AI agent for a banking system. Analyze the following transaction and classify it.

TRANSACTION DETAILS:
- Amount: ₹${transactionContext.amount}
- From Account: ${transactionContext.fromAccountId}
- To Account: ${transactionContext.toAccountId}
- Current Balance (sender): ₹${transactionContext.currentBalance}
- Account Age (sender): ${transactionContext.accountAgeHours} hours
- Recent transactions (last 1 hour): ${transactionContext.recentTxCount}
- Time of transaction: ${transactionContext.timestamp}
- Rule-based risk score: ${transactionContext.ruleScore}/100

TRIGGERED RULES:
${transactionContext.triggeredRules.map(r => `- ${r}`).join('\n')}

Based on the above, classify this transaction as one of:
1. SAFE — Normal transaction, no concerns
2. SUSPICIOUS — Unusual pattern, warrants monitoring
3. FRAUDULENT — Strong indicators of fraud, should be blocked

Respond in this exact JSON format:
{
  "verdict": "SAFE" | "SUSPICIOUS" | "FRAUDULENT",
  "confidence": <number 0-100>,
  "explanation": "<brief 1-2 sentence explanation>"
}

IMPORTANT: Respond with ONLY the JSON object, no markdown formatting, no code blocks.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt,
        });

        const text = response.text.trim();

        // Parse the AI response
        const parsed = JSON.parse(text);

        logger.info('Gemini AI fraud analysis completed', {
            verdict: parsed.verdict,
            confidence: parsed.confidence
        });

        return {
            verdict: parsed.verdict || 'UNKNOWN',
            explanation: parsed.explanation || 'No explanation provided',
            confidence: parsed.confidence || 0
        };
    } catch (error) {
        logger.error('Gemini AI analysis failed', { error: error.message });
        return {
            verdict: 'UNKNOWN',
            explanation: `AI analysis failed: ${error.message}`
        };
    }
}

// ─── Risk Level Classification ────────────────────────────
function getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
}

// ─── Main Entry Point ─────────────────────────────────────
async function analyzeTransaction(fromAccountId, toAccountId, amount, userId) {
    logger.info('Fraud detection started', { fromAccountId, toAccountId, amount });

    // Step 1: Run rule-based checks
    const { score: ruleScore, triggeredRules } = await runRuleChecks(fromAccountId, amount, userId);
    let finalScore = ruleScore;
    let aiAnalysis = null;
    let shouldBlock = false;

    const riskLevel = getRiskLevel(ruleScore);

    // Step 2: Decide action based on score
    if (ruleScore >= 80) {
        // CRITICAL — auto-block, no need for AI
        shouldBlock = true;
        logger.warn('Transaction AUTO-BLOCKED by fraud detection', {
            riskScore: ruleScore,
            triggeredRules
        });
    } else if (ruleScore >= 50) {
        // HIGH — consult Gemini AI for deeper analysis
        const fromAccount = await prisma.account.findUnique({ where: { id: fromAccountId } });
        const currentBalance = fromAccount ? await getBalance(fromAccountId) : 0;
        const accountAgeHours = fromAccount
            ? Math.round((Date.now() - fromAccount.createdAt.getTime()) / (1000 * 60 * 60))
            : 0;

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentTxCount = await prisma.transaction.count({
            where: {
                fromAccountId,
                createdAt: { gte: oneHourAgo },
                status: 'completed'
            }
        });

        const aiResult = await getAIAnalysis({
            amount,
            fromAccountId,
            toAccountId,
            currentBalance,
            accountAgeHours,
            recentTxCount,
            timestamp: new Date().toISOString(),
            ruleScore,
            triggeredRules
        });

        aiAnalysis = `[${aiResult.verdict}] (confidence: ${aiResult.confidence}%) — ${aiResult.explanation}`;

        // Block if AI says FRAUDULENT
        if (aiResult.verdict === 'FRAUDULENT') {
            shouldBlock = true;
            finalScore = Math.min(ruleScore + 15, 100); // Boost score
        } else if (aiResult.verdict === 'SUSPICIOUS') {
            finalScore = Math.min(ruleScore + 5, 100);
        }

        logger.info('AI analysis result', { verdict: aiResult.verdict, aiAnalysis });
    } else {
        logger.info('Transaction passed fraud checks', { riskScore: ruleScore });
    }

    return {
        riskScore: finalScore,
        riskLevel: getRiskLevel(finalScore),
        triggeredRules,
        aiAnalysis,
        shouldBlock
    };
}

module.exports = {
    analyzeTransaction,
    runRuleChecks,
    getAIAnalysis,
    getRiskLevel,
    THRESHOLDS,
    SCORE_WEIGHTS
};
