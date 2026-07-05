const logger = require('../utils/logger');

/**
 * Global error handling middleware.
 * Catches all errors forwarded via next(err) or thrown in catchAsync-wrapped controllers.
 * 
 * Handles:
 * - Custom AppError instances (operational errors)
 * - Prisma known request errors (unique constraint, not found, etc.)
 * - Prisma validation errors
 * - JWT errors (invalid/expired tokens)
 * - Unknown/unexpected errors (programming bugs)
 */

// Handle Prisma known request errors (P2002 = unique constraint, P2025 = not found, etc.)
function handlePrismaClientKnownError(err) {
    switch (err.code) {
        case 'P2002': {
            // Unique constraint violation
            const field = err.meta?.target?.[0] || 'field';
            const message = `Duplicate value for '${field}'. This ${field} is already in use.`;
            return { statusCode: 409, message };
        }
        case 'P2025': {
            // Record not found
            const message = err.meta?.cause || 'Record not found';
            return { statusCode: 404, message };
        }
        case 'P2003': {
            // Foreign key constraint failure
            const message = `Invalid reference: related record not found`;
            return { statusCode: 400, message };
        }
        case 'P2014': {
            // Required relation violation
            const message = `Required relation violation`;
            return { statusCode: 400, message };
        }
        default: {
            const message = `Database error: ${err.message}`;
            return { statusCode: 400, message };
        }
    }
}

// Handle Prisma validation errors (invalid field values, types, etc.)
function handlePrismaValidationError(err) {
    const message = `Invalid data: ${err.message.split('\n').pop()?.trim() || err.message}`;
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
    if (err.name === 'PrismaClientKnownRequestError') {
        const handled = handlePrismaClientKnownError(err);
        statusCode = handled.statusCode;
        message = handled.message;
        isOperational = true;
    } else if (err.name === 'PrismaClientValidationError') {
        const handled = handlePrismaValidationError(err);
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
