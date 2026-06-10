const AppError = require('../utils/AppError');

/**
 * Authorization middleware — restricts access to users with specified roles.
 * Must be used AFTER authMiddleware (which sets req.user).
 * 
 * Usage:
 *   router.get('/admin/users', authMiddleware, authorize('admin'), controller);
 *   router.post('/system/funds', authMiddleware, authorize('admin', 'system'), controller);
 * 
 * @param  {...string} roles - Allowed roles (e.g., 'admin', 'system', 'customer')
 * @returns {Function} Express middleware
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            throw new AppError('Authentication required', 401);
        }

        if (!roles.includes(req.user.role)) {
            throw new AppError(
                `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
                403
            );
        }

        next();
    };
};

module.exports = authorize;
