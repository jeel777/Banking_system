const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Redis Client — Centralized connection for caching & session management.
 * - Auto-reconnects with exponential backoff (max 3s delay)
 * - Logs connection events via Winston
 * - Graceful shutdown on SIGINT/SIGTERM
 */
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
        const delay = Math.min(times * 200, 3000); // Exponential backoff, max 3s
        logger.warn(`Redis reconnecting... attempt ${times} (delay: ${delay}ms)`);
        return delay;
    },
    lazyConnect: false, // Connect immediately on import
});

redisClient.on('connect', () => {
    logger.info('✅ Connected to Redis');
    console.log('✅ Connected to Redis');
});

redisClient.on('error', (err) => {
    logger.error('❌ Redis connection error', { error: err.message });
});

redisClient.on('close', () => {
    logger.warn('🔌 Redis connection closed');
});

// ─── Graceful Shutdown ────────────────────────────────────
async function shutdownRedis() {
    try {
        await redisClient.quit();
        console.log('🔌 Redis connection closed gracefully');
    } catch (err) {
        logger.error('Error closing Redis connection', { error: err.message });
    }
}

process.on('SIGINT', shutdownRedis);
process.on('SIGTERM', shutdownRedis);

module.exports = redisClient;
