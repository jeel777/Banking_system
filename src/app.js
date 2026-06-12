/*
app.js — Express application setup
1. Create and configure Express server
2. Apply global middleware (security, logging, parsing)
3. Define API routes
4. Global error handler (must be last)
*/

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.json');

// Middleware
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const { globalLimiter } = require('./middleware/rateLimiter');

// Routes
const authRoutes = require('./routes/auth.routes.js');
const accountRoutes = require('./routes/account.routes.js');
const transactionRoutes = require('./routes/transaction.routes.js');
const adminRoutes = require('./routes/admin.routes.js');

const app = express();

// ─── Security Middleware ──────────────────────────────────
app.use(
    '/api-docs',
    helmet({ contentSecurityPolicy: false })                // Disable CSP for Swagger UI (it needs inline scripts)
);
app.use(helmet());                                          // Set security HTTP headers (everywhere else)
app.use(cors({
    origin: [process.env.CLIENT_URL || 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true                                       // Allow cookies to be sent cross-origin
}));

// ─── Performance Middleware ───────────────────────────────
app.use(compression());                                     // Gzip compress all responses (~70% size reduction)

// ─── Parsing Middleware ───────────────────────────────────
app.use(express.json({ limit: '10kb' }));                   // Parse JSON bodies (limit to prevent abuse)
app.use(cookieParser());                                    // Parse cookies from request headers

// ─── Logging Middleware ───────────────────────────────────
app.use(requestLogger);                                     // Log all HTTP requests via Morgan → Winston

// ─── Benchmark (before rate limiter for load testing) ─────
app.get('/benchmark', (req, res) => {
    res.status(200).json({ success: true, pid: process.pid, timestamp: Date.now() });
});

// ─── Rate Limiting ────────────────────────────────────────
app.use('/api', globalLimiter);                             // 100 requests per 15 min per IP

// ─── API Documentation ────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Banking System API Docs'
}));

// ─── API Routes ───────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/admin", adminRoutes);

// ─── Health Check ─────────────────────────────────────────
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Banking System API is running",
        timestamp: new Date().toISOString()
    });
});

// ─── 404 Handler ──────────────────────────────────────────
const AppError = require('./utils/AppError');
app.all('{/*path}', (req, res, next) => {
    next(new AppError(`Cannot find ${req.method} ${req.originalUrl} on this server`, 404));
});

// ─── Global Error Handler (must be last) ──────────────────
app.use(errorHandler);

module.exports = app;