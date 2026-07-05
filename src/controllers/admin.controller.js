const prisma = require('../config/prisma');
const { getBalance, invalidateBalanceCache } = require('../utils/balance');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// GET /api/admin/users — List all users (paginated)
const getAllUsers = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
                updatedAt: true
            }
        }),
        prisma.user.count()
    ]);

    return res.status(200).json({
        success: true,
        users,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    });
});

// GET /api/admin/users/:id — Get single user details with accounts
const getUserById = catchAsync(async (req, res, next) => {
    const user = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            updatedAt: true
        }
    });

    if (!user) {
        throw new AppError('User not found', 404);
    }

    const accounts = await prisma.account.findMany({ where: { userId: user.id } });

    return res.status(200).json({
        success: true,
        user,
        accounts
    });
});

// PATCH /api/admin/accounts/:id/freeze — Freeze an account
const freezeAccount = catchAsync(async (req, res, next) => {
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });

    if (!account) {
        throw new AppError('Account not found', 404);
    }

    if (account.status === 'frozen') {
        throw new AppError('Account is already frozen', 400);
    }

    if (account.status === 'closed') {
        throw new AppError('Cannot freeze a closed account', 400);
    }

    const updatedAccount = await prisma.account.update({
        where: { id: req.params.id },
        data: { status: 'frozen' }
    });

    logger.warn(`Account ${account.id} frozen by admin ${req.user.id}`);

    return res.status(200).json({
        success: true,
        message: 'Account frozen successfully',
        account: updatedAccount
    });
});

// PATCH /api/admin/accounts/:id/unfreeze — Unfreeze an account
const unfreezeAccount = catchAsync(async (req, res, next) => {
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });

    if (!account) {
        throw new AppError('Account not found', 404);
    }

    if (account.status !== 'frozen') {
        throw new AppError('Account is not frozen', 400);
    }

    const updatedAccount = await prisma.account.update({
        where: { id: req.params.id },
        data: { status: 'active' }
    });

    logger.info(`Account ${account.id} unfrozen by admin ${req.user.id}`);

    return res.status(200).json({
        success: true,
        message: 'Account unfrozen successfully',
        account: updatedAccount
    });
});

// PATCH /api/admin/accounts/:id/close — Close an account
const closeAccount = catchAsync(async (req, res, next) => {
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });

    if (!account) {
        throw new AppError('Account not found', 404);
    }

    if (account.status === 'closed') {
        throw new AppError('Account is already closed', 400);
    }

    // Check if account has remaining balance
    const balance = await getBalance(account.id);
    if (balance > 0) {
        throw new AppError(
            `Cannot close account with remaining balance of ${balance}. Please withdraw or transfer funds first.`,
            400
        );
    }

    const updatedAccount = await prisma.account.update({
        where: { id: req.params.id },
        data: { status: 'closed' }
    });

    logger.warn(`Account ${account.id} closed by admin ${req.user.id}`);

    return res.status(200).json({
        success: true,
        message: 'Account closed successfully',
        account: updatedAccount
    });
});

// GET /api/admin/ledger — View system-wide ledger entries (paginated)
const getSystemLedger = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [entries, total] = await Promise.all([
        prisma.ledger.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
            include: {
                account: { select: { currency: true, status: true } },
                transaction: { select: { status: true, amount: true } }
            }
        }),
        prisma.ledger.count()
    ]);

    return res.status(200).json({
        success: true,
        entries,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    });
});



// ─── Fraud Management ─────────────────────────────────────

// GET /api/admin/fraud-alerts — List all fraud alerts (paginated, filterable)
const getFraudAlerts = catchAsync(async (req, res, next) => {
    const {
        page = 1,
        limit = 20,
        status,
        riskLevel,
        fromDate,
        toDate
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const where = {};
    if (status) where.status = status;
    if (riskLevel) where.riskLevel = riskLevel;
    if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = new Date(fromDate);
        if (toDate) where.createdAt.lte = new Date(toDate);
    }

    const [alerts, total] = await Promise.all([
        prisma.fraudAlert.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
            include: {
                fromAccount: { select: { currency: true, status: true, userId: true } },
                toAccount: { select: { currency: true, status: true, userId: true } },
                transaction: { select: { status: true, amount: true } },
                reviewedBy: { select: { name: true, email: true } }
            }
        }),
        prisma.fraudAlert.count({ where })
    ]);

    return res.status(200).json({
        success: true,
        alerts,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    });
});

// GET /api/admin/fraud-alerts/stats — Dashboard statistics
const getFraudStats = catchAsync(async (req, res, next) => {
    const [
        totalAlerts,
        pendingReview,
        confirmedFraud,
        dismissed,
        criticalAlerts,
        highAlerts,
        last24hAlerts,
        totalBlockedAmountResult
    ] = await Promise.all([
        prisma.fraudAlert.count(),
        prisma.fraudAlert.count({ where: { status: 'flagged' } }),
        prisma.fraudAlert.count({ where: { status: 'confirmed_fraud' } }),
        prisma.fraudAlert.count({ where: { status: 'dismissed' } }),
        prisma.fraudAlert.count({ where: { riskLevel: 'critical' } }),
        prisma.fraudAlert.count({ where: { riskLevel: 'high' } }),
        prisma.fraudAlert.count({
            where: {
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }
        }),
        prisma.fraudAlert.aggregate({
            where: {
                riskLevel: { in: ['critical', 'high'] }
            },
            _sum: { amount: true }
        })
    ]);

    return res.status(200).json({
        success: true,
        stats: {
            totalAlerts,
            pendingReview,
            confirmedFraud,
            dismissed,
            criticalAlerts,
            highAlerts,
            last24hAlerts,
            totalBlockedAmount: parseFloat(totalBlockedAmountResult._sum.amount || 0)
        }
    });
});

// PATCH /api/admin/fraud-alerts/:id/review — Admin reviews a fraud alert
const reviewFraudAlert = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, reviewNotes } = req.body;

    if (!status) {
        throw new AppError('Review status is required', 400);
    }

    const validStatuses = ['reviewed', 'dismissed', 'confirmed_fraud'];
    if (!validStatuses.includes(status)) {
        throw new AppError(`Status must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const fraudAlert = await prisma.fraudAlert.findUnique({ where: { id } });

    if (!fraudAlert) {
        throw new AppError('Fraud alert not found', 404);
    }

    if (fraudAlert.status !== 'flagged') {
        throw new AppError(`Alert has already been reviewed (current status: ${fraudAlert.status})`, 400);
    }

    const updatedAlert = await prisma.fraudAlert.update({
        where: { id },
        data: {
            status,
            reviewedById: req.user.id,
            reviewNotes: reviewNotes || null
        }
    });

    // If confirmed fraud, freeze the sender's account
    if (status === 'confirmed_fraud') {
        const account = await prisma.account.findUnique({ where: { id: fraudAlert.fromAccountId } });
        if (account && account.status === 'active') {
            await prisma.account.update({
                where: { id: account.id },
                data: { status: 'frozen' }
            });
            logger.warn(`Account ${account.id} auto-frozen due to confirmed fraud (alert: ${fraudAlert.id})`);
        }
    }

    logger.info(`Fraud alert ${id} reviewed by admin ${req.user.id}: ${status}`);

    return res.status(200).json({
        success: true,
        message: `Fraud alert marked as: ${status}`,
        fraudAlert: updatedAlert
    });
});

// POST /api/admin/seed-funds — Admin seeds funds directly into an account
const seedFunds = catchAsync(async (req, res, next) => {
    const { toAccount, amount } = req.body;

    if (!toAccount || !amount) {
        throw new AppError('toAccount and amount are required', 400);
    }

    if (amount <= 0 || amount > 10000000) {
        throw new AppError('Amount must be between 1 and 10,000,000', 400);
    }

    const targetAccount = await prisma.account.findUnique({
        where: { id: toAccount },
        include: { user: { select: { name: true, email: true } } }
    });
    if (!targetAccount) {
        throw new AppError('Target account not found', 404);
    }

    // Find or use system account as the source
    const systemUser = await prisma.user.findFirst({ where: { role: 'system' } });
    let systemAccount = null;
    if (systemUser) {
        systemAccount = await prisma.account.findFirst({ where: { userId: systemUser.id } });
    }

    // Prisma interactive transaction
    const tx = await prisma.$transaction(async (txClient) => {
        const txRecord = await txClient.transaction.create({
            data: {
                fromAccountId: systemAccount ? systemAccount.id : targetAccount.id,
                toAccountId: targetAccount.id,
                amount,
                idempotencyKey: `admin-seed-${toAccount}-${Date.now()}`,
                status: 'pending'
            }
        });

        // Debit system account (if exists)
        if (systemAccount) {
            await txClient.ledger.create({
                data: {
                    accountId: systemAccount.id,
                    amount,
                    transactionId: txRecord.id,
                    type: 'debit'
                }
            });
        }

        // Credit target account
        await txClient.ledger.create({
            data: {
                accountId: targetAccount.id,
                amount,
                transactionId: txRecord.id,
                type: 'credit'
            }
        });

        const completedTx = await txClient.transaction.update({
            where: { id: txRecord.id },
            data: { status: 'completed' }
        });

        return completedTx;
    });

    // Invalidate cached balances for involved accounts
    await invalidateBalanceCache(targetAccount.id);
    if (systemAccount) {
        await invalidateBalanceCache(systemAccount.id);
    }

    const newBalance = await getBalance(targetAccount.id);

    logger.info(`Admin ${req.user.id} seeded ₹${amount} to account ${toAccount}`);

    return res.status(201).json({
        success: true,
        message: `Successfully seeded ₹${amount.toLocaleString('en-IN')} to account`,
        transaction: tx,
        recipient: {
            accountId: targetAccount.id,
            userName: targetAccount.user?.name,
            newBalance
        }
    });
});

// GET /api/admin/accounts — List all accounts with balances
const listAllAccounts = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [allAccounts, total] = await Promise.all([
        prisma.account.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
            include: {
                user: { select: { name: true, email: true, role: true } }
            }
        }),
        prisma.account.count()
    ]);

    // Get balances
    const accountsWithBalance = await Promise.all(
        allAccounts.map(async (acc) => {
            const balance = await getBalance(acc.id);
            return {
                id: acc.id,
                user: acc.user,
                status: acc.status,
                currency: acc.currency,
                balance,
                createdAt: acc.createdAt
            };
        })
    );

    return res.status(200).json({
        success: true,
        accounts: accountsWithBalance,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    });
});

module.exports = {
    getAllUsers,
    getUserById,
    freezeAccount,
    unfreezeAccount,
    closeAccount,
    getSystemLedger,
    getFraudAlerts,
    getFraudStats,
    reviewFraudAlert,
    seedFunds,
    listAllAccounts
};
