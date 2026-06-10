// Authentication middleware — verifies JWT tokens and attaches user to req
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const tokenBlacklistModel = require('../models/blacklist.model');
const AppError = require('../utils/AppError');

/**
 * Standard auth middleware — verifies JWT and attaches user to req.user.
 * Used for all authenticated routes.
 */
async function authMiddleware(req, res, next) {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];

    if (!token) {
        throw new AppError('Authentication required. Please log in.', 401);
    }

    const isBlacklisted = await tokenBlacklistModel.findOne({ token });

    if (isBlacklisted) {
        throw new AppError('Token has been invalidated. Please log in again.', 401);
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (!decoded || !decoded.userId) {
            throw new AppError('Invalid token payload.', 401);
        }

        const user = await userModel.findById(decoded.userId);

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

    const isBlacklisted = await tokenBlacklistModel.findOne({ token });

    if (isBlacklisted) {
        throw new AppError('Token has been invalidated.', 401);
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await userModel.findById(decoded.userId);

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
