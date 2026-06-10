const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter — applies to all routes.
 * 100 requests per 15 minutes per IP.
 */
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 100,
    standardHeaders: true,      // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false,       // Disable the `X-RateLimit-*` headers
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again after 15 minutes'
    }
});

/**
 * Auth rate limiter — strict limit on login/register to prevent brute force.
 * 5 requests per 15 minutes per IP.
 */
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many login/register attempts, please try again after 15 minutes'
    }
});

/**
 * Transaction rate limiter — moderate limit on financial operations.
 * 20 transactions per 15 minutes per IP.
 */
const transactionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many transactions, please try again after 15 minutes'
    }
});

module.exports = { globalLimiter, authLimiter, transactionLimiter };
