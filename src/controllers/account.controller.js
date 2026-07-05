const prisma = require('../config/prisma');
const { getBalance } = require('../utils/balance');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// POST /api/accounts — Create account for authenticated user
const createAccount = catchAsync(async (req, res, next) => {
    const user = req.user;

    const account = await prisma.account.create({
        data: {
            userId: user.id,
        }
    });

    return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        account
    });
});

// GET /api/accounts — Get all accounts of authenticated user
const getUserAccountsController = catchAsync(async (req, res, next) => {
    const accounts = await prisma.account.findMany({
        where: { userId: req.user.id }
    });

    return res.status(200).json({
        success: true,
        count: accounts.length,
        accounts
    });
});

// GET /api/accounts/balance/:accountId — Get balance of a specific account
const getAccountBalanceController = catchAsync(async (req, res, next) => {
    const accountId = req.params.accountId;

    const account = await prisma.account.findFirst({
        where: {
            id: accountId,
            userId: req.user.id
        }
    });

    if (!account) {
        throw new AppError('Account not found or you do not have access to it', 404);
    }

    const balance = await getBalance(account.id);

    return res.status(200).json({
        success: true,
        accountId: account.id,
        currency: account.currency,
        balance
    });
});

module.exports = { createAccount, getUserAccountsController, getAccountBalanceController };