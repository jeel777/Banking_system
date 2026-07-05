const prisma = require('../config/prisma');
const { getBalance, invalidateBalanceCache } = require('../utils/balance');
const emailService = require('../services/email');
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
 8. Commit PostgreSQL transaction
 9. Send email notifications to sender and receiver
*/

// POST /api/transactions — Transfer between accounts
const createTransaction = catchAsync(async (req, res, next) => {
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
        throw new AppError("Missing required fields: fromAccount, toAccount, amount, idempotencyKey", 400);
    }

    const fromUserAccount = await prisma.account.findUnique({ where: { id: fromAccount } });
    const toUserAccount = await prisma.account.findUnique({ where: { id: toAccount } });

    if (!fromUserAccount || !toUserAccount) {
        throw new AppError("One or both accounts not found", 404);
    }

    // Check idempotency — prevent duplicate transactions
    const existingTransaction = await prisma.transaction.findUnique({ where: { idempotencyKey } });

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
    const balance = await getBalance(fromAccount, { skipCache: true });

    if (balance < amount) {
        throw new AppError(`Insufficient balance. Current: ${balance}, Required: ${amount}`, 400);
    }

    // Prisma interactive transaction (replaces mongoose.startSession)
    const transaction = await prisma.$transaction(async (tx) => {
        // Create transaction record
        const txRecord = await tx.transaction.create({
            data: {
                fromAccountId: fromAccount,
                toAccountId: toAccount,
                amount,
                idempotencyKey,
                status: "pending"
            }
        });

        // Create debit entry (sender)
        await tx.ledger.create({
            data: {
                accountId: fromAccount,
                type: "debit",
                amount: amount,
                transactionId: txRecord.id
            }
        });

        // Create credit entry (receiver)
        await tx.ledger.create({
            data: {
                accountId: toAccount,
                type: "credit",
                amount: amount,
                transactionId: txRecord.id
            }
        });

        // Mark transaction as completed
        const completedTx = await tx.transaction.update({
            where: { id: txRecord.id },
            data: { status: "completed" }
        });

        return completedTx;
    });

    // Invalidate cached balances for both accounts
    await Promise.all([
        invalidateBalanceCache(fromAccount),
        invalidateBalanceCache(toAccount)
    ]);

    logger.info(`Transaction completed: ${amount} from ${fromAccount} to ${toAccount}`);

    // Link fraud alert if this transaction was flagged
    if (req.fraudAlert) {
        await prisma.fraudAlert.update({
            where: { id: req.fraudAlert.id },
            data: { transactionId: transaction.id }
        });
        await prisma.transaction.update({
            where: { id: transaction.id },
            data: {
                riskScore: req.fraudAlert.riskScore
            }
        });
        logger.info(`Fraud alert ${req.fraudAlert.id} linked to transaction ${transaction.id}`);
    }

    // Send email notifications (non-blocking)
    const fromUser = await prisma.user.findUnique({ where: { id: fromUserAccount.userId } });
    const toUser = await prisma.user.findUnique({ where: { id: toUserAccount.userId } });

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
            id: transaction.id,
            amount,
            fromAccount,
            toAccount,
            status: transaction.status
        }
    });
});

// POST /api/transactions/system/initial-funds — System account seeds funds
const createInitialTransaction = catchAsync(async (req, res, next) => {
    const { toAccount, amount, idempotencyKey } = req.body;

    if (!toAccount || !amount || !idempotencyKey) {
        throw new AppError("toAccount, amount and idempotencyKey are required", 400);
    }

    const toUserAccount = await prisma.account.findUnique({ where: { id: toAccount } });

    if (!toUserAccount) {
        throw new AppError("Invalid toAccount — account not found", 400);
    }

    const fromUserAccount = await prisma.account.findFirst({ where: { userId: req.user.id } });

    if (!fromUserAccount) {
        throw new AppError("System user account not found", 400);
    }

    // Prisma interactive transaction (replaces mongoose.startSession)
    const transaction = await prisma.$transaction(async (tx) => {
        const txRecord = await tx.transaction.create({
            data: {
                fromAccountId: fromUserAccount.id,
                toAccountId: toAccount,
                amount,
                idempotencyKey,
                status: "pending"
            }
        });

        // Debit system account
        await tx.ledger.create({
            data: {
                accountId: fromUserAccount.id,
                amount: amount,
                transactionId: txRecord.id,
                type: "debit"
            }
        });

        // Credit target account
        await tx.ledger.create({
            data: {
                accountId: toAccount,
                amount: amount,
                transactionId: txRecord.id,
                type: "credit"
            }
        });

        const completedTx = await tx.transaction.update({
            where: { id: txRecord.id },
            data: { status: "completed" }
        });

        return completedTx;
    });

    // Invalidate cached balances for both accounts
    await Promise.all([
        invalidateBalanceCache(fromUserAccount.id),
        invalidateBalanceCache(toAccount)
    ]);

    logger.info(`Initial funds deposited: ${amount} to account ${toAccount}`);

    return res.status(201).json({
        success: true,
        message: "Initial funds transaction completed successfully",
        transaction
    });
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
    const userAccounts = await prisma.account.findMany({
        where: { userId: req.user.id },
        select: { id: true }
    });
    const accountIds = userAccounts.map(a => a.id);

    if (accountIds.length === 0) {
        return res.status(200).json({
            success: true,
            transactions: [],
            pagination: { page: 1, limit: parseInt(limit), total: 0, totalPages: 0 }
        });
    }

    // Build filter query
    const where = {};

    // Filter by sent/received
    if (type === 'sent') {
        where.fromAccountId = { in: accountIds };
    } else if (type === 'received') {
        where.toAccountId = { in: accountIds };
    } else {
        // Show all transactions involving user's accounts
        where.OR = [
            { fromAccountId: { in: accountIds } },
            { toAccountId: { in: accountIds } }
        ];
    }

    // Filter by date range
    if (fromDate || toDate) {
        where.createdAt = {};
        if (fromDate) where.createdAt.gte = new Date(fromDate);
        if (toDate) where.createdAt.lte = new Date(toDate);
    }

    // Filter by amount range
    if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount) where.amount.gte = parseFloat(minAmount);
        if (maxAmount) where.amount.lte = parseFloat(maxAmount);
    }

    // Filter by status
    if (status) {
        where.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
            include: {
                fromAccount: { select: { currency: true, status: true } },
                toAccount: { select: { currency: true, status: true } }
            }
        }),
        prisma.transaction.count({ where })
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

    const transaction = await prisma.transaction.findUnique({
        where: { id },
        include: {
            fromAccount: { select: { currency: true, status: true, userId: true } },
            toAccount: { select: { currency: true, status: true, userId: true } }
        }
    });

    if (!transaction) {
        throw new AppError('Transaction not found', 404);
    }

    // Verify user owns one of the involved accounts
    const userAccounts = await prisma.account.findMany({
        where: { userId: req.user.id },
        select: { id: true }
    });
    const accountIds = userAccounts.map(a => a.id);

    const isInvolved = accountIds.includes(transaction.fromAccountId) ||
                       accountIds.includes(transaction.toAccountId);

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
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
        throw new AppError('Account not found', 404);
    }
    if (account.userId !== req.user.id) {
        throw new AppError('You do not own this account', 403);
    }

    // Build date filter
    const dateFilter = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    const where = {
        OR: [{ fromAccountId: accountId }, { toAccountId: accountId }]
    };
    if (fromDate || toDate) where.createdAt = dateFilter;

    const txns = await prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 500
    });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const balance = await getBalance(accountId);

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

        const isSent = tx.fromAccountId === accountId;
        const type = isSent ? 'Debit' : 'Credit';
        const counterpartyId = isSent ? tx.toAccountId : tx.fromAccountId;
        const counterparty = `...${counterpartyId.slice(-6)}`;
        const date = new Date(tx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
        const txAmount = parseFloat(tx.amount);

        doc.fillColor(isSent ? '#ef4444' : '#22c55e');
        doc.text(date, colDate, y);
        doc.text(type, colType, y);
        doc.text(`${isSent ? '-' : '+'}${txAmount.toLocaleString('en-IN')}`, colAmount, y);
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
