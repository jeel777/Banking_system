/*
  Balance Utility — replaces AccountModel.getBalance() instance method
  Uses Prisma aggregate for precise Decimal arithmetic on the ledger table.
  Integrates with Redis cache (30s TTL) for read endpoints.
*/

const prisma = require('../config/prisma');
const redisClient = require('../config/redis');

const BALANCE_CACHE_TTL = 30; // 30 seconds

/**
 * Get the current balance for an account by summing ledger entries.
 * Uses Redis cache (30s TTL) for read endpoints, with option to bypass for transactional accuracy.
 *
 * @param {string} accountId - UUID of the account
 * @param {object} options
 * @param {boolean} options.skipCache - Bypass Redis cache (use for ACID transactions)
 * @returns {Promise<number>} Current balance
 */
async function getBalance(accountId, options = {}) {
    const { skipCache = false } = options;
    const cacheKey = `balance:${accountId}`;

    // Check Redis cache first (unless explicitly bypassed for ACID correctness)
    if (!skipCache) {
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached !== null) {
                return parseFloat(cached);
            }
        } catch {
            // Redis unavailable — fall through to PostgreSQL
        }
    }

    // Sum credits and debits separately using Prisma aggregate
    const [creditResult, debitResult] = await Promise.all([
        prisma.ledger.aggregate({
            where: { accountId, type: 'credit' },
            _sum: { amount: true }
        }),
        prisma.ledger.aggregate({
            where: { accountId, type: 'debit' },
            _sum: { amount: true }
        })
    ]);

    const totalCredits = parseFloat(creditResult._sum.amount ?? 0);
    const totalDebits = parseFloat(debitResult._sum.amount ?? 0);
    const balance = totalCredits - totalDebits;

    // Cache the computed balance
    try {
        await redisClient.setex(cacheKey, BALANCE_CACHE_TTL, balance.toString());
    } catch {
        // Non-critical — cache will expire naturally
    }

    return balance;
}

/**
 * Invalidate the cached balance for a given account ID.
 * Called after any transaction (debit/credit) to ensure consistency.
 *
 * @param {string} accountId - UUID of the account
 */
async function invalidateBalanceCache(accountId) {
    try {
        await redisClient.del(`balance:${accountId}`);
    } catch {
        // Non-critical — cache will expire naturally
    }
}

module.exports = { getBalance, invalidateBalanceCache };
