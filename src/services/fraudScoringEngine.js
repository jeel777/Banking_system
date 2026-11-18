/*
  Fraud Scoring Engine — Pure statistical analysis.
  No AI, no external calls. 100% deterministic.
  
  Compares transactions against user's own behavioral baseline
  using Z-scores (standard deviations from the mean).
  
  This handles ~85% of all transactions by itself.
*/

const prisma = require('../config/prisma');
const logger = require('../utils/logger');

/**
 * Scores a transaction against the user's behavioral profile.
 * Returns a risk score (0-100) and list of triggered rules.
 */
function scoreTransaction(amount, toAccountId, profile) {
    let score = 0;
    const rules = [];

    // ══════════════════════════════════════════════
    //  A. AMOUNT ANALYSIS
    // ══════════════════════════════════════════════

    if (profile.isNew) {
        // New account — no baseline, use absolute thresholds
        score += 20;
        rules.push('NO_HISTORY: No behavioral baseline exists for this account');

        if (amount > 100000) {
            score += 25;
            rules.push(`NEW_HIGH_VALUE: ₹${amount} from account with no history`);
        } else if (amount > 50000) {
            score += 15;
            rules.push(`NEW_ELEVATED: ₹${amount} from account with no history`);
        }
    } else {
        // Existing account — compare against their own baseline using Z-scores
        // Z-score = how many standard deviations away from the mean
        const zScore = profile.stdDev > 0
            ? (amount - profile.avgAmount) / profile.stdDev
            : (amount > profile.avgAmount * 2 ? 3 : 0);

        if (zScore > 4) {
            score += 35;
            rules.push(`EXTREME_DEVIATION: ₹${amount} is ${zScore.toFixed(1)}σ above avg ₹${Math.round(profile.avgAmount)}`);
        } else if (zScore > 3) {
            score += 25;
            rules.push(`HIGH_DEVIATION: ₹${amount} is ${zScore.toFixed(1)}σ above avg ₹${Math.round(profile.avgAmount)}`);
        } else if (zScore > 2) {
            score += 10;
            rules.push(`ELEVATED_AMOUNT: ₹${amount} is ${zScore.toFixed(1)}σ above avg ₹${Math.round(profile.avgAmount)}`);
        }

        // All-time high breach (only meaningful with enough history)
        if (amount > profile.maxAmount * 1.5 && profile.totalTransactions > 5) {
            score += 15;
            rules.push(`EXCEEDS_MAX: ₹${amount} is 50%+ above previous max ₹${Math.round(profile.maxAmount)}`);
        }
    }

    // ══════════════════════════════════════════════
    //  B. TRUST SCORE
    // ══════════════════════════════════════════════

    if (profile.trustScore < 10) {
        score += 20;
        rules.push(`VERY_LOW_TRUST: Trust score ${profile.trustScore}/100`);
    } else if (profile.trustScore < 25) {
        score += 10;
        rules.push(`LOW_TRUST: Trust score ${profile.trustScore}/100`);
    }

    // ══════════════════════════════════════════════
    //  C. TIME ANALYSIS
    // ══════════════════════════════════════════════

    const currentHour = new Date().getHours();

    if (!profile.isNew && profile.totalTransactions > 10) {
        // Compare against user's own hour distribution
        const totalTx = profile.hourDistribution.reduce((a, b) => a + b, 0);
        const hourPct = totalTx > 0 ? profile.hourDistribution[currentHour] / totalTx : 0;

        if (hourPct < 0.02) {
            score += 10;
            rules.push(`UNUSUAL_TIME: ${currentHour}:00 — user rarely transacts at this hour`);
        }
    } else {
        // Fallback: global odd hours for accounts without enough history
        if (currentHour >= 1 && currentHour < 5) {
            score += 10;
            rules.push(`ODD_HOURS: Transaction at ${currentHour}:00 (1-5 AM)`);
        }
    }

    // ══════════════════════════════════════════════
    //  D. RECIPIENT ANALYSIS
    // ══════════════════════════════════════════════

    if (!profile.isNew && profile.knownRecipients &&
        !profile.knownRecipients.has(toAccountId)) {
        // First time sending to this recipient
        if (amount > profile.avgAmount * 2) {
            score += 15;
            rules.push(`NEW_RECIPIENT_HIGH: First transfer to this recipient, and amount is 2x+ above average`);
        } else {
            score += 5;
            rules.push(`NEW_RECIPIENT: First transfer to this recipient`);
        }
    }

    // ══════════════════════════════════════════════
    //  E. NEAR-DRAIN CHECK
    // ══════════════════════════════════════════════

    if (profile.balance > 0) {
        const remainingPct = ((profile.balance - amount) / profile.balance) * 100;
        if (remainingPct < 5) {
            score += 15;
            rules.push(`NEAR_DRAIN: Would leave ${remainingPct.toFixed(1)}% balance`);
        }
    }

    return { score: Math.min(100, score), rules };
}

/**
 * Checks velocity patterns and network-level signals.
 * Runs DB queries to detect rapid-fire, fan-out, and risky recipients.
 */
async function checkVelocity(fromAccountId, toAccountId) {
    let score = 0;
    const rules = [];

    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [count10m, count1h, distinctRecipients24h, recipientAlerts] =
        await Promise.all([
            // Rapid-fire: transactions in last 10 minutes
            prisma.transaction.count({
                where: {
                    fromAccountId,
                    createdAt: { gte: tenMinsAgo },
                    status: 'completed'
                }
            }),
            // High velocity: transactions in last 1 hour
            prisma.transaction.count({
                where: {
                    fromAccountId,
                    createdAt: { gte: oneHourAgo },
                    status: 'completed'
                }
            }),
            // Fan-out: distinct recipients in last 24 hours
            prisma.transaction.findMany({
                where: {
                    fromAccountId,
                    createdAt: { gte: oneDayAgo },
                    status: 'completed'
                },
                select: { toAccountId: true },
                distinct: ['toAccountId']
            }),
            // Risky recipient: past fraud alerts targeting this recipient
            prisma.fraudAlert.count({
                where: {
                    toAccountId,
                    status: { in: ['confirmed_fraud', 'flagged'] }
                }
            })
        ]);

    // Rapid fire detection
    if (count10m >= 3) {
        score += 25;
        rules.push(`RAPID_FIRE: ${count10m} transactions in 10 minutes`);
    }

    // High velocity detection
    if (count1h >= 5) {
        score += 20;
        rules.push(`HIGH_VELOCITY: ${count1h} transactions in 1 hour`);
    }

    // Fan-out detection (one account → many recipients)
    if (distinctRecipients24h.length >= 5) {
        score += 15;
        rules.push(`FAN_OUT: Sent to ${distinctRecipients24h.length} distinct accounts in 24h`);
    }

    // Risky recipient detection
    if (recipientAlerts > 0) {
        score += 20;
        rules.push(`RISKY_RECIPIENT: Recipient has ${recipientAlerts} past fraud alerts`);
    }

    return { score: Math.min(100, score), rules };
}

module.exports = { scoreTransaction, checkVelocity };
