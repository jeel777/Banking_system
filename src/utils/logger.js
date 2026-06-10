const winston = require('winston');
const path = require('path');

// Define custom log levels and colors
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'cyan',
};

winston.addColors(colors);

// Determine log level based on environment
const level = () => {
    const env = process.env.NODE_ENV || 'development';
    return env === 'development' ? 'debug' : 'info';
};

// Custom format for log messages
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

        // Append metadata if present
        if (Object.keys(metadata).length > 0) {
            log += ` ${JSON.stringify(metadata)}`;
        }

        // Append stack trace for errors
        if (stack) {
            log += `\n${stack}`;
        }

        return log;
    })
);

// Console format (colorized for development)
const consoleFormat = winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
        let log = `${timestamp} ${level}: ${message}`;
        if (stack) log += `\n${stack}`;
        return log;
    })
);

// Define log file directory (project root /logs)
const logDir = path.join(__dirname, '../../logs');

const logger = winston.createLogger({
    level: level(),
    levels,
    transports: [
        // Console transport (colorized)
        new winston.transports.Console({
            format: consoleFormat,
        }),

        // Error log file (only errors)
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            format: logFormat,
            maxsize: 5 * 1024 * 1024, // 5MB
            maxFiles: 5,
        }),

        // Combined log file (all levels)
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log'),
            format: logFormat,
            maxsize: 10 * 1024 * 1024, // 10MB
            maxFiles: 5,
        }),
    ],
});

module.exports = logger;
