const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const { createAccount } = require('../controllers/account.controller');
const { getUserAccountsController } = require('../controllers/account.controller');
const { getAccountBalanceController } = require('../controllers/account.controller');

const router = express.Router();

router.post("/", authMiddleware, createAccount); // to create account for user we will first check if the user is authenticated or not using authMiddleware and then call createAccount controller to create account for user

router.get("/", authMiddleware, getUserAccountsController); // to get all accounts of user we will first check if the user is authenticated or not using authMiddleware and then call getUserAccountsController controller to get all accounts of user

router.get("/balance/:accountId", authMiddleware, getAccountBalanceController); 







module.exports = router;