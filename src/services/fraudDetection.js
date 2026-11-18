/*
  Fraud Detection Orchestrator — Fully Automated 24/7

  3-Tier Architecture:
    Tier 1: Statistical Scoring Engine (deterministic, no AI)
            → Handles ~85% of transactions instantly
    Tier 2: AI Fraud Analyst Agent (investigates borderline cases)
            → Handles ~12% with full evidence-based analysis
    Tier 3: Hold Queue (truly ambiguous cases)
            → ~3% held for next available human reviewer

  Risk Levels & Actions:
    0-29   → LOW      → AUTO-ALLOW (no alert created)
    30-49  → MEDIUM   → AI Agent investigates → auto-decide or hold
    50-79  → HIGH     → AI Agent investigates → auto-decide or hold
    80-100 → CRITICAL → AUTO-BLOCK (no AI needed)
*/

const prisma = require('../config/prisma');
const { buildProfile } = require('./userProfiler');
const { scoreTransaction, checkVelocity } = require('./fraudScoringEngine');
const fraudAgent = require('./fraudAgent');
const logger = require('../utils/logger');

// ─── Risk Level Classification ───
function getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
}

// ─── Main Entry Point ───
async function analyzeTransaction(fromAccountId, toAccountId, amount, userId) {
    logger.info('Fraud detection started', { fromAccountId, toAccountId, amount });

    // ── Step 1: Build user behavioral profile ──
    const profile = await buildProfile(fromAccountId);

    if (!profile) {
        logger.error('Could not build profile — account not found', { fromAccountId });
        return {
            riskScore: 0,
            riskLevel: 'low',
            triggeredRules: [],
            aiAnalysis: null,
            shouldBlock: false,
            shouldHold: false,
            agentResult: null,
            metadata: { trustScore: 0, isNewAccount: true, profileTxCount: 0 }
        };
    }

    // ── Step 2: Statistical scoring (runs in parallel) ──
    const [txScore, velocityScore] = await Promise.all([
        Promise.resolve(scoreTransaction(amount, toAccountId, profile)),
        checkVelocity(fromAccountId, toAccountId)
    ]);

    // Combine scores (weighted: 60% anomaly, 40% velocity)
    const combinedScore = Math.min(100, Math.round(
        txScore.score * 0.6 + velocityScore.score * 0.4
    ));
    const allRules = [...txScore.rules, ...velocityScore.rules];
    const riskLevel = getRiskLevel(combinedScore);

    let shouldBlock = false;
    let shouldHold = false;
    let agentResult = null;
    let agentAnalysis = null;

    // ── Step 3: Decision routing ──
    if (combinedScore >= 80) {
        // ─── CRITICAL — auto-block, no AI needed ───
        shouldBlock = true;
        logger.warn('Transaction AUTO-BLOCKED by statistical engine', {
            riskScore: combinedScore,
            triggeredRules: allRules
        });

    } else if (combinedScore >= 30) {
        // ─── MEDIUM/HIGH — AI Agent investigates ───
        logger.info('Borderline score — dispatching AI Fraud Agent', {
            riskScore: combinedScore,
            riskLevel
        });

        agentResult = await fraudAgent.investigate(
            { fromAccountId, toAccountId, amount },
            combinedScore,
            allRules,
            profile
        );

        agentAnalysis = `[${agentResult.decision}] (confidence: ${agentResult.confidence}%) — ${agentResult.reasoning}`;

        // Agent decision routing:
        if (agentResult.decision === 'BLOCK' && agentResult.confidence >= 70) {
            // Agent says BLOCK with high confidence → block
            shouldBlock = true;
            logger.warn('Transaction BLOCKED by AI Fraud Agent', {
                confidence: agentResult.confidence,
                reasoning: agentResult.reasoning
            });

        } else if (agentResult.decision === 'ALLOW' && agentResult.confidence >= 80) {
            // Agent says ALLOW with high confidence → allow
            logger.info('Transaction ALLOWED by AI Fraud Agent', {
                confidence: agentResult.confidence,
                reasoning: agentResult.reasoning
            });

        } else if (agentResult.decision === 'HOLD') {
            // Agent explicitly says HOLD → hold for human
            shouldHold = true;
            logger.info('Transaction HELD by AI Fraud Agent — needs human review', {
                confidence: agentResult.confidence,
                reasoning: agentResult.reasoning
            });

        } else {
            // Low confidence decision (ALLOW <80% or BLOCK <70%) → hold to be safe
            shouldHold = true;
            logger.info('Transaction HELD — agent confidence too low for auto-decision', {
                decision: agentResult.decision,
                confidence: agentResult.confidence
            });
        }

    } else {
        // ─── LOW — auto-allow ───
        logger.info('Transaction passed all fraud checks', {
            riskScore: combinedScore
        });
    }

    return {
        riskScore: combinedScore,
        riskLevel,
        triggeredRules: allRules,
        aiAnalysis: agentAnalysis,
        shouldBlock,
        shouldHold,
        agentResult: agentResult ? {
            decision: agentResult.decision,
            confidence: agentResult.confidence,
            reasoning: agentResult.reasoning,
            riskFactors: agentResult.riskFactors,
            mitigatingFactors: agentResult.mitigatingFactors
        } : null,
        metadata: {
            trustScore: profile.trustScore,
            isNewAccount: profile.isNew,
            profileTxCount: profile.totalTransactions
        }
    };
}

module.exports = {
    analyzeTransaction,
    getRiskLevel
};
