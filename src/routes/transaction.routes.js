const { Router } = require("express");
const { authMiddleware, systemAuthMiddleware } = require("../middleware/auth.middleware.js");
const transactionController = require("../controllers/transaction.controller.js");
const validate = require("../middleware/validate");
const { transferSchema, initialFundsSchema, transactionHistorySchema } = require("../validators/transaction.validator");
const { transactionLimiter } = require("../middleware/rateLimiter");
const fraudCheck = require("../middleware/fraudCheck");

const transactionRoutes = Router();

// GET /api/transactions — Transaction history (paginated, filterable)
transactionRoutes.get(
    "/",
    authMiddleware,
    validate(transactionHistorySchema, 'query'),
    transactionController.getTransactionHistory
);

// GET /api/transactions/statement — Download PDF bank statement
transactionRoutes.get(
    "/statement",
    authMiddleware,
    transactionController.getTransactionStatement
);

// GET /api/transactions/:id — Single transaction detail
transactionRoutes.get(
    "/:id",
    authMiddleware,
    transactionController.getTransactionById
);

// POST /api/transactions — Create transfer (rate limited + validated)
transactionRoutes.post(
    "/",
    authMiddleware,
    transactionLimiter,
    validate(transferSchema),
    fraudCheck,
    transactionController.createTransaction
);

// POST /api/transactions/system/initial-funds — System seeds funds (admin only)
transactionRoutes.post(
    "/system/initial-funds",
    systemAuthMiddleware,
    validate(initialFundsSchema),
    transactionController.createInitialTransaction
);

module.exports = transactionRoutes;