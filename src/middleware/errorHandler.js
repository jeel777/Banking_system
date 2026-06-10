const logger = require('../utils/logger');

/**
 * Global error handling middleware.
 * Catches all errors forwarded via next(err) or thrown in catchAsync-wrapped controllers.
 * 
 * Handles:
 * - Custom AppError instances (operational errors)
 * - Mongoose validation errors
 * - Mongoose duplicate key errors (11000)
 * - Mongoose cast errors (invalid ObjectId)
 * - JWT errors (invalid/expired tokens)
 * - Unknown/unexpected errors (programming bugs)
 */

// Handle Mongoose validation errors
function handleValidationError(err) {
    const errors = Object.values(err.errors).map((el) => el.message);
    const message = `Validation failed: ${errors.join('. ')}`;
    return { statusCode: 400, message };
}

// Handle Mongoose duplicate key errors
function handleDuplicateKeyError(err) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate value for '${field}'. This ${field} is already in use.`;
    return { statusCode: 409, message };
}

// Handle Mongoose cast errors (invalid ObjectId, etc.)
function handleCastError(err) {
    const message = `Invalid value '${err.value}' for field '${err.path}'`;
    return { statusCode: 400, message };
}

// Handle JWT errors
function handleJWTError() {
    return { statusCode: 401, message: 'Invalid token. Please log in again.' };
}

function handleJWTExpiredError() {
    return { statusCode: 401, message: 'Token has expired. Please log in again.' };
}

function errorHandler(err, req, res, next) {
    // Default values
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let isOperational = err.isOperational || false;

    // Handle specific error types
    if (err.name === 'ValidationError') {
        const handled = handleValidationError(err);
        statusCode = handled.statusCode;
        message = handled.message;
        isOperational = true;
    } else if (err.code === 11000) {
        const handled = handleDuplicateKeyError(err);
        statusCode = handled.statusCode;
        message = handled.message;
        isOperational = true;
    } else if (err.name === 'CastError') {
        const handled = handleCastError(err);
        statusCode = handled.statusCode;
        message = handled.message;
        isOperational = true;
    } else if (err.name === 'JsonWebTokenError') {
        const handled = handleJWTError();
        statusCode = handled.statusCode;
        message = handled.message;
        isOperational = true;
    } else if (err.name === 'TokenExpiredError') {
        const handled = handleJWTExpiredError();
        statusCode = handled.statusCode;
        message = handled.message;
        isOperational = true;
    }

    // Log the error
    if (isOperational) {
        logger.warn(`${statusCode} - ${message} - ${req.method} ${req.originalUrl}`);
    } else {
        // Unexpected errors — log full stack trace
        logger.error(`${statusCode} - ${message} - ${req.method} ${req.originalUrl}`, {
            stack: err.stack,
            body: req.body,
        });
    }

    // Send response
    const response = {
        success: false,
        message,
    };

    // Include stack trace in development
    if (process.env.NODE_ENV === 'development' && !isOperational) {
        response.stack = err.stack;
    }

    res.status(statusCode).json(response);
}

module.exports = errorHandler;
