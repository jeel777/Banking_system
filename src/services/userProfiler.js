/*
  User Profiler — Builds behavioral baselines from transaction history.
  This is what answers "what's NORMAL for this user?"
  
  Used by the fraud scoring engine to compare incoming transactions
  against each user's own historical patterns.
*/

const prisma = require('../config/prisma');
const { getBalance } = require('../utils/balance');

async function buildProfile(accountId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Get account info
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) return null;

    const accountAgeHours = (Date.now() - account.createdAt.getTime()) / (1000 * 60 * 60);

    // Get transaction history (last 30 days)
    const transactions = await prisma.transaction.findMany({
        where: {
            fromAccountId: accountId,
            status: 'completed',
            createdAt: { gte: thirtyDaysAgo }
        },
        select: { amount: true, createdAt: true, toAccountId: true },
        orderBy: { createdAt: 'desc' }
    });

    // Past fraud alerts for this account
    const pastAlerts = await prisma.fraudAlert.count({
        where: {
            fromAccountId: accountId,
            status: { in: ['confirmed_fraud', 'flagged'] }
        }
    });

    const balance = await getBalance(accountId);

    // No history = new account
    if (transactions.length === 0) {
        const trustScore = calculateTrustScore(accountAgeHours, 0, pastAlerts);
        return {
            isNew: true,
            accountAgeHours,
            totalTransactions: 0,
            trustScore,
            balance,
            pastFraudAlerts: pastAlerts
        };
    }

    const amounts = transactions.map(tx => parseFloat(tx.amount));

    // ── Statistical measures ──
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const maxAmount = Math.max(...amounts);
    const sortedAmounts = [...amounts].sort((a, b) => a - b);
    const medianAmount = sortedAmounts[Math.floor(sortedAmounts.length / 2)];
    const variance = amounts.reduce((sum, val) =>
        sum + Math.pow(val - avgAmount, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);

    // ── Frequency analysis ──
    const daySpan = Math.max(1,
        (Date.now() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24));
    const dailyFrequency = transactions.length / daySpan;

    // ── Hour distribution ──
    const hourDistribution = new Array(24).fill(0);
    transactions.forEach(tx => {
        const hour = new Date(tx.createdAt).getHours();
        hourDistribution[hour]++;
    });

    // ── Frequent recipients ──
    const recipientMap = {};
    transactions.forEach(tx => {
        recipientMap[tx.toAccountId] = (recipientMap[tx.toAccountId] || 0) + 1;
    });
    const knownRecipients = new Set(Object.keys(recipientMap));

    // ── Recent activity (last 7 days) ──
    const recentTx = transactions.filter(tx => tx.createdAt >= sevenDaysAgo);
    const recentAvgAmount = recentTx.length > 0
        ? recentTx.reduce((s, tx) => s + parseFloat(tx.amount), 0) / recentTx.length
        : avgAmount;

    // ── Trust Score ──
    const trustScore = calculateTrustScore(accountAgeHours, transactions.length, pastAlerts);

    return {
        isNew: false,
        accountAgeHours,
        totalTransactions: transactions.length,
        avgAmount,
        maxAmount,
        medianAmount,
        stdDev,
        dailyFrequency,
        hourDistribution,
        knownRecipients,
        recentAvgAmount,
        pastFraudAlerts: pastAlerts,
        trustScore,
        balance
    };
}

/**
 * Calculates a trust score (0-100) based on account age, history, and past fraud.
 * Trust builds gradually — not a binary "new vs old" check.
 */
function calculateTrustScore(ageHours, txCount, alertCount = 0) {
    let score = 0;

    // Age-based trust (gradual)
    if (ageHours > 2160)      score += 30;  // 90+ days
    else if (ageHours > 720)  score += 25;  // 30+ days
    else if (ageHours > 168)  score += 15;  // 7+ days
    else if (ageHours > 48)   score += 5;   // 2+ days
    // < 48 hours → 0 trust from age

    // History-based trust
    if (txCount > 100)      score += 30;
    else if (txCount > 50)  score += 25;
    else if (txCount > 20)  score += 15;
    else if (txCount > 5)   score += 10;
    // ≤ 5 transactions → 0 trust from history

    // Penalty for past fraud alerts
    score -= alertCount * 20;

    return Math.max(0, Math.min(100, score));
}

module.exports = { buildProfile, calculateTrustScore };
