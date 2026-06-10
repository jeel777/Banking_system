const AccountModel = require('../models/account.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// POST /api/accounts — Create account for authenticated user
const createAccount = catchAsync(async (req, res, next) => {
    const user = req.user;

    const account = await AccountModel.create({
        user: user._id,
    });

    return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        account
    });
});

// GET /api/accounts — Get all accounts of authenticated user
const getUserAccountsController = catchAsync(async (req, res, next) => {
    const accounts = await AccountModel.find({ user: req.user._id });

    return res.status(200).json({
        success: true,
        count: accounts.length,
        accounts
    });
});

// GET /api/accounts/balance/:accountId — Get balance of a specific account
const getAccountBalanceController = catchAsync(async (req, res, next) => {
    const accountId = req.params.accountId;

    const account = await AccountModel.findOne(
        { _id: accountId, user: req.user._id }
    );

    if (!account) {
        throw new AppError('Account not found or you do not have access to it', 404);
    }

    const balance = await account.getBalance();

    return res.status(200).json({
        success: true,
        accountId: account._id,
        currency: account.currency,
        balance
    });
});

module.exports = { createAccount, getUserAccountsController, getAccountBalanceController };