const morgan = require('morgan');
const logger = require('../utils/logger');

// Create a writable stream that pipes Morgan output to Winston
const stream = {
    write: (message) => {
        // Remove trailing newline that Morgan adds
        logger.http(message.trim());
    },
};

// Only log HTTP requests in development and production (skip in test)
const skip = () => {
    const env = process.env.NODE_ENV || 'development';
    return env === 'test';
};

// Custom Morgan format: method url status responseTime ms - contentLength
const requestLogger = morgan(
    ':method :url :status :res[content-length] - :response-time ms',
    { stream, skip }
);

module.exports = requestLogger;
