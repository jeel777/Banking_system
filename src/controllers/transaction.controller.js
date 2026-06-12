const transactionModel = require('../models/transaction.models.js');
const ledgerModel = require('../models/ledger.model');
const emailService = require('../services/email.js');
const accountModel = require('../models/account.model');
const mongoose = require('mongoose');
const userModel = require('../models/user.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/* Steps for transaction:
 1. Validate the transaction details (amount, sender, receiver)
 2. Validate idempotency key
 3. Check account status
 4. Derive account balance from ledger
 5. Create transaction
 6. Create debit and credit entries in ledger
 7. Mark transaction as completed
 8. Commit MongoDB session
 9. Send email notifications to sender and receiver
*/

// POST /api/transactions — Transfer between accounts
const createTransaction = catchAsync(async (req, res, next) => {
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        throw new AppError("Missing required fields: fromAccount, toAccount, amount, idempotencyKey", 400);
    }

    const fromUserAccount = await accountModel.findById(fromAccount);
    const toUserAccount = await accountModel.findById(toAccount);

    if (!fromUserAccount || !toUserAccount) {
        throw new AppError("One or both accounts not found", 404);
    }

    // Check idempotency — prevent duplicate transactions
    const existingTransaction = await transactionModel.findOne({ idempotencyKey });

    if (existingTransaction) {
        if (existingTransaction.status === "completed") {
            return res.status(200).json({ success: true, message: "Transaction already completed" });
        } else if (existingTransaction.status === "pending") {
            return res.status(200).json({ success: true, message: "Transaction is pending" });
        } else if (existingTransaction.status === "failed") {
            throw new AppError("Previous transaction with this key failed", 400);
        } else if (existingTransaction.status === "reversed") {
            throw new AppError("Transaction has been reversed", 400);
        }
    }

    // Check account status
    if (fromUserAccount.status !== "active" || toUserAccount.status !== "active") {
        throw new AppError("One or both accounts are not active", 400);
    }

    // Check balance (bypass Redis cache for ACID correctness)
    const balance = await fromUserAccount.getBalance({ skipCache: true });

    if (balance < amount) {
        throw new AppError(`Insufficient balance. Current: ${balance}, Required: ${amount}`, 400);
    }

    // Start MongoDB session for ACID transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const transaction = new transactionModel({
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "pending"
        });

        // Create debit entry (sender)
        await ledgerModel.create(
            [{
                account: fromAccount,
                type: "debit",
                amount: amount,
                transaction: transaction._id
            }],
            { session }
        );

        // Create credit entry (receiver)
        await ledgerModel.create(
            [{
                account: toAccount,
                type: "credit",
                amount: amount,
                transaction: transaction._id
            }],
            { session }
        );

        // Mark transaction as completed
        transaction.status = "completed";
        await transaction.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Invalidate cached balances for both accounts
        await Promise.all([
            accountModel.invalidateBalanceCache(fromAccount),
            accountModel.invalidateBalanceCache(toAccount)
        ]);

        logger.info(`Transaction completed: ${amount} from ${fromAccount} to ${toAccount}`);

        // Link fraud alert if this transaction was flagged
        if (req.fraudAlert) {
            req.fraudAlert.transaction = transaction._id;
            await req.fraudAlert.save();
            transaction.fraudAlert = req.fraudAlert._id;
            transaction.riskScore = req.fraudAlert.riskScore;
            await transaction.save();
            logger.info(`Fraud alert ${req.fraudAlert._id} linked to transaction ${transaction._id}`);
        }

        // Send email notifications (non-blocking)
        const fromUser = await userModel.findById(fromUserAccount.user);
        const toUser = await userModel.findById(toUserAccount.user);

        emailService.sendEmail(
            fromUser.email,
            "Transaction Alert",
            `You have sent ${amount} to account ${toAccount}`
        ).catch((err) => logger.error('Failed to send debit email', { error: err.message }));

        emailService.sendEmail(
            toUser.email,
            "Transaction Alert",
            `You have received ${amount} from account ${fromAccount}`
        ).catch((err) => logger.error('Failed to send credit email', { error: err.message }));

        return res.status(200).json({
            success: true,
            message: "Transaction completed successfully",
            transaction: {
                id: transaction._id,
                amount,
                fromAccount,
                toAccount,
                status: transaction.status
            }
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Transaction failed, session aborted', { error: error.message });
        throw error;
    }
});

// POST /api/transactions/system/initial-funds — System account seeds funds
const createInitialTransaction = catchAsync(async (req, res, next) => {
    const { toAccount, amount, idempotencyKey } = req.body;

    if (!toAccount || !amount || !idempotencyKey) {
        throw new AppError("toAccount, amount and idempotencyKey are required", 400);
    }

    const toUserAccount = await accountModel.findOne({ _id: toAccount });

    if (!toUserAccount) {
        throw new AppError("Invalid toAccount — account not found", 400);
    }

    const fromUserAccount = await accountModel.findOne({ user: req.user._id });

    if (!fromUserAccount) {
        throw new AppError("System user account not found", 400);
    }

    // Start MongoDB session for ACID transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const transaction = new transactionModel({
            fromAccount: fromUserAccount._id,
            toAccount: toAccount,
            amount,
            idempotencyKey,
            status: "pending"
        });

        // Debit system account
        await ledgerModel.create(
            [{
                account: fromUserAccount._id,
                amount: amount,
                transaction: transaction._id,
                type: "debit"
            }],
            { session }
        );

        // Credit target account
        await ledgerModel.create(
            [{
                account: toAccount,
                amount: amount,
                transaction: transaction._id,
                type: "credit"
            }],
            { session }
        );

        transaction.status = "completed";
        await transaction.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Invalidate cached balances for both accounts
        await Promise.all([
            accountModel.invalidateBalanceCache(fromUserAccount._id),
            accountModel.invalidateBalanceCache(toAccount)
        ]);

        logger.info(`Initial funds deposited: ${amount} to account ${toAccount}`);

        return res.status(201).json({
            success: true,
            message: "Initial funds transaction completed successfully",
            transaction
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        logger.error('Initial funds transaction failed', { error: error.message });
        throw error;
    }
});

// GET /api/transactions — Transaction history with pagination & filtering
const getTransactionHistory = catchAsync(async (req, res, next) => {
    const {
        page = 1,
        limit = 10,
        fromDate,
        toDate,
        type,           // 'sent' or 'received'
        minAmount,
        maxAmount,
        status
    } = req.query;

    // Get all accounts owned by this user
    const userAccounts = await accountModel.find({ user: req.user._id }).select('_id');
    const accountIds = userAccounts.map(a => a._id);

    if (accountIds.length === 0) {
        return res.status(200).json({
            success: true,
            transactions: [],
            pagination: { page: 1, limit: parseInt(limit), total: 0, totalPages: 0 }
        });
    }

    // Build filter query
    const filter = {};

    // Filter by sent/received
    if (type === 'sent') {
        filter.fromAccount = { $in: accountIds };
    } else if (type === 'received') {
        filter.toAccount = { $in: accountIds };
    } else {
        // Show all transactions involving user's accounts
        filter.$or = [
            { fromAccount: { $in: accountIds } },
            { toAccount: { $in: accountIds } }
        ];
    }

    // Filter by date range
    if (fromDate || toDate) {
        filter.createdAt = {};
        if (fromDate) filter.createdAt.$gte = new Date(fromDate);
        if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    // Filter by amount range
    if (minAmount || maxAmount) {
        filter.amount = {};
        if (minAmount) filter.amount.$gte = parseFloat(minAmount);
        if (maxAmount) filter.amount.$lte = parseFloat(maxAmount);
    }

    // Filter by status
    if (status) {
        filter.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
        transactionModel
            .find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('fromAccount', 'currency status')
            .populate('toAccount', 'currency status'),
        transactionModel.countDocuments(filter)
    ]);

    return res.status(200).json({
        success: true,
        transactions,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
        }
    });
});

// GET /api/transactions/:id — Get single transaction detail
const getTransactionById = catchAsync(async (req, res, next) => {
    const { id } = req.params;

    const transaction = await transactionModel
        .findById(id)
        .populate('fromAccount', 'currency status user')
        .populate('toAccount', 'currency status user');

    if (!transaction) {
        throw new AppError('Transaction not found', 404);
    }

    // Verify user owns one of the involved accounts
    const userAccounts = await accountModel.find({ user: req.user._id }).select('_id');
    const accountIds = userAccounts.map(a => a._id.toString());

    const isInvolved = accountIds.includes(transaction.fromAccount._id.toString()) ||
                       accountIds.includes(transaction.toAccount._id.toString());

    if (!isInvolved) {
        throw new AppError('You do not have access to this transaction', 403);
    }

    return res.status(200).json({
        success: true,
        transaction
    });
});

// GET /api/transactions/statement — Download PDF bank statement
const getTransactionStatement = catchAsync(async (req, res, next) => {
    const { accountId, fromDate, toDate } = req.query;

    if (!accountId) {
        throw new AppError('accountId query parameter is required', 400);
    }

    // Verify user owns this account
    const account = await accountModel.findById(accountId);
    if (!account) {
        throw new AppError('Account not found', 404);
    }
    if (account.user.toString() !== req.user._id.toString()) {
        throw new AppError('You do not own this account', 403);
    }

    // Build date filter
    const dateFilter = {};
    if (fromDate) dateFilter.$gte = new Date(fromDate);
    if (toDate) dateFilter.$lte = new Date(toDate);

    const filter = {
        $or: [{ fromAccount: accountId }, { toAccount: accountId }]
    };
    if (fromDate || toDate) filter.createdAt = dateFilter;

    const txns = await transactionModel.find(filter).sort({ createdAt: -1 }).limit(500);
    const user = await userModel.findById(req.user._id);
    const balance = await account.getBalance();

    // Generate PDF
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement_${accountId.slice(-6)}.pdf"`);
    doc.pipe(res);

    // ── Header ──
    doc.fontSize(22).font('Helvetica-Bold').text('Delvadiya Bank', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Account Statement', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#3b82f6');
    doc.moveDown(0.8);

    // ── Account Info ──
    doc.fontSize(10).font('Helvetica-Bold').text('Account Holder: ', { continued: true }).font('Helvetica').text(user.name);
    doc.font('Helvetica-Bold').text('Account ID: ', { continued: true }).font('Helvetica').text(accountId);
    doc.font('Helvetica-Bold').text('Currency: ', { continued: true }).font('Helvetica').text(account.currency || 'INR');
    doc.font('Helvetica-Bold').text('Current Balance: ', { continued: true }).font('Helvetica').text(`₹${balance.toLocaleString('en-IN')}`);

    const rangeFrom = fromDate ? new Date(fromDate).toLocaleDateString('en-IN') : 'All time';
    const rangeTo = toDate ? new Date(toDate).toLocaleDateString('en-IN') : 'Present';
    doc.font('Helvetica-Bold').text('Statement Period: ', { continued: true }).font('Helvetica').text(`${rangeFrom} — ${rangeTo}`);
    doc.moveDown(1);

    // ── Table Header ──
    const tableTop = doc.y;
    const colDate = 50, colType = 160, colAmount = 240, colCounterparty = 340, colStatus = 460;

    doc.font('Helvetica-Bold').fontSize(9);
    doc.fillColor('#3b82f6');
    doc.text('Date', colDate, tableTop);
    doc.text('Type', colType, tableTop);
    doc.text('Amount (₹)', colAmount, tableTop);
    doc.text('Counterparty', colCounterparty, tableTop);
    doc.text('Status', colStatus, tableTop);
    doc.fillColor('#000000');

    doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).stroke('#ddd');

    // ── Table Rows ──
    let y = tableTop + 22;
    doc.font('Helvetica').fontSize(8);

    for (const tx of txns) {
        if (y > 750) {
            doc.addPage();
            y = 50;
        }

        const isSent = tx.fromAccount.toString() === accountId;
        const type = isSent ? 'Debit' : 'Credit';
        const counterparty = isSent ? `...${tx.toAccount.toString().slice(-6)}` : `...${tx.fromAccount.toString().slice(-6)}`;
        const date = new Date(tx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

        doc.fillColor(isSent ? '#ef4444' : '#22c55e');
        doc.text(date, colDate, y);
        doc.text(type, colType, y);
        doc.text(`${isSent ? '-' : '+'}${tx.amount.toLocaleString('en-IN')}`, colAmount, y);
        doc.fillColor('#000000');
        doc.text(counterparty, colCounterparty, y);
        doc.text(tx.status, colStatus, y);

        y += 16;
    }

    if (txns.length === 0) {
        doc.moveDown(1);
        doc.fontSize(11).text('No transactions found for this period.', { align: 'center' });
    }

    // ── Footer ──
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#3b82f6');
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#888').text(`Generated on ${new Date().toLocaleString('en-IN')} | This is a computer-generated statement`, { align: 'center' });

    doc.end();
});

module.exports = {
    createTransaction,
    createInitialTransaction,
    getTransactionHistory,
    getTransactionById,
    getTransactionStatement
};
