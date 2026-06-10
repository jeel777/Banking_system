/**
 * Custom application error class for operational errors.
 * Extends the native Error class to include HTTP status codes
 * and distinguish operational errors from programming bugs.
 */
class AppError extends Error {
    /**
     * @param {string} message - Human-readable error message
     * @param {number} statusCode - HTTP status code (e.g., 400, 404, 500)
     */
    constructor(message, statusCode) {
        super(message);

        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true; // Operational errors are expected and handled gracefully

        // Capture stack trace excluding this constructor from the trace
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
