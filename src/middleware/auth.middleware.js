// Authentication middleware — verifies JWT tokens and attaches user to req
// Uses Redis for O(1) token blacklist checks and user session caching
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const tokenBlacklistModel = require('../models/blacklist.model');
const redisClient = require('../config/redis');
const AppError = require('../utils/AppError');

const TOKEN_BLACKLIST_KEY = 'token:blacklist';
const USER_CACHE_TTL = 600; // 10 minutes in seconds

/**
 * Check if a token is blacklisted.
 * Redis SET lookup first (O(1)), falls through to MongoDB on miss.
 * Backfills Redis on MongoDB hit for future lookups.
 */
async function isTokenBlacklisted(token) {
    try {
        // Check Redis SET first — O(1) lookup
        const inRedis = await redisClient.sismember(TOKEN_BLACKLIST_KEY, token);
        if (inRedis) return true;
    } catch {
        // Redis unavailable — fall through to MongoDB
    }

    // Fall through to MongoDB
    const inMongo = await tokenBlacklistModel.findOne({ token });
    if (inMongo) {
        // Backfill Redis so future checks are fast
        try {
            await redisClient.sadd(TOKEN_BLACKLIST_KEY, token);
        } catch {
            // Non-critical — Redis may be down
        }
        return true;
    }

    return false;
}

/**
 * Get cached user from Redis, or fetch from MongoDB and cache.
 */
async function getCachedUser(userId) {
    try {
        const cached = await redisClient.get(`user:${userId}`);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch {
        // Redis unavailable — fall through to MongoDB
    }

    // Cache miss — fetch from MongoDB
    const user = await userModel.findById(userId);
    if (user) {
        try {
            await redisClient.setex(`user:${userId}`, USER_CACHE_TTL, JSON.stringify(user.toObject()));
        } catch {
            // Non-critical
        }
    }
    return user;
}

/**
 * Standard auth middleware — verifies JWT and attaches user to req.user.
 * Used for all authenticated routes.
 */
async function authMiddleware(req, res, next) {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        throw new AppError('Authentication required. Please log in.', 401);
    }

    const blacklisted = await isTokenBlacklisted(token);

    if (blacklisted) {
        throw new AppError('Token has been invalidated. Please log in again.', 401);
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded || !decoded.userId) {
            throw new AppError('Invalid token payload.', 401);
        }

        const user = await getCachedUser(decoded.userId);

        if (!user) {
            throw new AppError('User belonging to this token no longer exists.', 401);
        }

        req.user = user;
        return next();
    } catch (err) {
        if (err.isOperational) throw err; // Re-throw our AppErrors
        throw new AppError('Invalid or expired token. Please log in again.', 401);
    }
}

/**
 * System auth middleware — for system-level operations (initial funds, etc.)
 * Verifies JWT AND checks that the user has 'system' or 'admin' role.
 */
async function systemAuthMiddleware(req, res, next) {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
        throw new AppError('Authentication required.', 401);
    }

    const blacklisted = await isTokenBlacklisted(token);

    if (blacklisted) {
        throw new AppError('Token has been invalidated.', 401);
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await getCachedUser(decoded.userId);

        if (!user) {
            throw new AppError('User not found.', 401);
        }

        if (user.role !== 'system' && user.role !== 'admin') {
            throw new AppError('Forbidden. System-level access required.', 403);
        }

        req.user = user;
        return next();
    } catch (err) {
        if (err.isOperational) throw err;
        throw new AppError('Invalid or expired token.', 401);
    }
}

module.exports = { authMiddleware, systemAuthMiddleware };
