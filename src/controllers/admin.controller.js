const userModel = require('../models/user.model');
const accountModel = require('../models/account.model');
const ledgerModel = require('../models/ledger.model');
const FraudAlert = require('../models/fraudAlert.model');
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
        userModel.find().sort({ createdAt: -1 }).skip(skip).limit(limitNum),
        userModel.countDocuments()
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
    const user = await userModel.findById(req.params.id);

    if (!user) {
        throw new AppError('User not found', 404);
    }

    const accounts = await accountModel.find({ user: user._id });

    return res.status(200).json({
        success: true,
        user,
        accounts
    });
});

// PATCH /api/admin/accounts/:id/freeze — Freeze an account
const freezeAccount = catchAsync(async (req, res, next) => {
    const account = await accountModel.findById(req.params.id);

    if (!account) {
        throw new AppError('Account not found', 404);
    }

    if (account.status === 'frozen') {
        throw new AppError('Account is already frozen', 400);
    }

    if (account.status === 'closed') {
        throw new AppError('Cannot freeze a closed account', 400);
    }

    account.status = 'frozen';
    await account.save();

    logger.warn(`Account ${account._id} frozen by admin ${req.user._id}`);

    return res.status(200).json({
        success: true,
        message: 'Account frozen successfully',
        account
    });
});

// PATCH /api/admin/accounts/:id/unfreeze — Unfreeze an account
const unfreezeAccount = catchAsync(async (req, res, next) => {
    const account = await accountModel.findById(req.params.id);

    if (!account) {
        throw new AppError('Account not found', 404);
    }

    if (account.status !== 'frozen') {
        throw new AppError('Account is not frozen', 400);
    }

    account.status = 'active';
    await account.save();

    logger.info(`Account ${account._id} unfrozen by admin ${req.user._id}`);

    return res.status(200).json({
        success: true,
        message: 'Account unfrozen successfully',
        account
    });
});

// PATCH /api/admin/accounts/:id/close — Close an account
const closeAccount = catchAsync(async (req, res, next) => {
    const account = await accountModel.findById(req.params.id);

    if (!account) {
        throw new AppError('Account not found', 404);
    }

    if (account.status === 'closed') {
        throw new AppError('Account is already closed', 400);
    }

    // Check if account has remaining balance
    const balance = await account.getBalance();
    if (balance > 0) {
        throw new AppError(
            `Cannot close account with remaining balance of ${balance}. Please withdraw or transfer funds first.`,
            400
        );
    }

    account.status = 'closed';
    await account.save();

    logger.warn(`Account ${account._id} closed by admin ${req.user._id}`);

    return res.status(200).json({
        success: true,
        message: 'Account closed successfully',
        account
    });
});

// GET /api/admin/ledger — View system-wide ledger entries (paginated)
const getSystemLedger = catchAsync(async (req, res, next) => {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [entries, total] = await Promise.all([
        ledgerModel
            .find()
            .sort({ _id: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('account', 'currency status')
            .populate('transaction', 'status amount'),
        ledgerModel.countDocuments()
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
    const filter = {};
    if (status) filter.status = status;
    if (riskLevel) filter.riskLevel = riskLevel;
    if (fromDate || toDate) {
        filter.createdAt = {};
        if (fromDate) filter.createdAt.$gte = new Date(fromDate);
        if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    const [alerts, total] = await Promise.all([
        FraudAlert.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('fromAccount', 'currency status user')
            .populate('toAccount', 'currency status user')
            .populate('transaction', 'status amount')
            .populate('reviewedBy', 'name email'),
        FraudAlert.countDocuments(filter)
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
        totalBlockedAmount
    ] = await Promise.all([
        FraudAlert.countDocuments(),
        FraudAlert.countDocuments({ status: 'flagged' }),
        FraudAlert.countDocuments({ status: 'confirmed_fraud' }),
        FraudAlert.countDocuments({ status: 'dismissed' }),
        FraudAlert.countDocuments({ riskLevel: 'critical' }),
        FraudAlert.countDocuments({ riskLevel: 'high' }),
        FraudAlert.countDocuments({
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }),
        FraudAlert.aggregate([
            { $match: { riskLevel: { $in: ['critical', 'high'] } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
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
            totalBlockedAmount: totalBlockedAmount[0]?.total || 0
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

    const fraudAlert = await FraudAlert.findById(id);

    if (!fraudAlert) {
        throw new AppError('Fraud alert not found', 404);
    }

    if (fraudAlert.status !== 'flagged') {
        throw new AppError(`Alert has already been reviewed (current status: ${fraudAlert.status})`, 400);
    }

    fraudAlert.status = status;
    fraudAlert.reviewedBy = req.user._id;
    fraudAlert.reviewNotes = reviewNotes || null;
    await fraudAlert.save();

    // If confirmed fraud, freeze the sender's account
    if (status === 'confirmed_fraud') {
        const account = await accountModel.findById(fraudAlert.fromAccount);
        if (account && account.status === 'active') {
            account.status = 'frozen';
            await account.save();
            logger.warn(`Account ${account._id} auto-frozen due to confirmed fraud (alert: ${fraudAlert._id})`);
        }
    }

    logger.info(`Fraud alert ${id} reviewed by admin ${req.user._id}: ${status}`);

    return res.status(200).json({
        success: true,
        message: `Fraud alert marked as: ${status}`,
        fraudAlert
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
    reviewFraudAlert
};
