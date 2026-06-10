const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const { createAccount, getUserAccountsController, getAccountBalanceController } = require('../controllers/account.controller');
const validate = require('../middleware/validate');
const { createAccountSchema, accountIdParamSchema } = require('../validators/account.validator');

const router = express.Router();

// POST /api/accounts — Create account (authenticated)
router.post("/", authMiddleware, validate(createAccountSchema), createAccount);

// GET /api/accounts — Get all accounts of user (authenticated)
router.get("/", authMiddleware, getUserAccountsController);

// GET /api/accounts/balance/:accountId — Get account balance (authenticated)
router.get("/balance/:accountId", authMiddleware, validate(accountIdParamSchema, 'params'), getAccountBalanceController);

module.exports = router;