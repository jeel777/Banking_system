/**
 * Wraps an async Express route handler to automatically catch errors
 * and forward them to the global error handling middleware via next().
 * 
 * Eliminates the need for try-catch blocks in every controller.
 * 
 * Usage:
 *   const catchAsync = require('../utils/catchAsync');
 *   exports.getUser = catchAsync(async (req, res, next) => {
 *       const user = await User.findById(req.params.id);
 *       res.json(user);
 *   });
 * 
 * @param {Function} fn - Async Express route handler (req, res, next)
 * @returns {Function} Wrapped handler that catches promise rejections
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

module.exports = catchAsync;
