const transactionmodel = require('../models/transaction.models.js');
const ledgerModel = require('../models/ledger.model');
const emailService = require('../services/email.js');
const accountModel = require('../models/account.model');
const mongoose = require('mongoose');
const userModel = require('../models/user.model');

/* steps for transaction:
 1. validate the transaction details (amount, sender, receiver)
 2. validate idempotency key
 3. check account status
 4. Derive account balance from ledger
 5. create transaction
 6. create debit and credit entries in ledger
 7. mark transaction as completed
 8. commit mongodb session
 9. send email notifications to sender and receiver
*/

async function createTransaction(req, res) {
    const { fromaccount, toaccount, amount, idempotencyKey } = req.body;

    if (!fromaccount || !toaccount || !amount || !idempotencyKey) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const fromuseraccount = await accountModel.findById(fromaccount);
    const touseraccount = await accountModel.findById(toaccount);

    if (!fromuseraccount || !touseraccount) {
        return res.status(404).json({ error: "Account not found" });
    }

    const istransactionAlreadyexist = await transactionmodel.findOne({
        idempotencyKey: idempotencyKey
    });

    if (istransactionAlreadyexist) {
        if (istransactionAlreadyexist.status === "completed") {
            return res.status(200).json({ message: "Transaction already completed" });
        } else if (istransactionAlreadyexist.status === "pending") {
            return res.status(200).json({ message: "Transaction is pending" });
        } else if (istransactionAlreadyexist.status === "failed") {
            return res.status(400).json({ error: "Invalid transaction status" });
        } else if (istransactionAlreadyexist.status === "reversed") {
            return res.status(400).json({ error: "Transaction has been reversed" });
        }
    }

    if (
        fromuseraccount.status !== "active" ||
        touseraccount.status !== "active"
    ) {
        return res
            .status(400)
            .json({ error: "One or both accounts are not active" });
    }

    const balance = await fromuseraccount.getBalance();

    if (balance < amount) {
        return res
            .status(400)
            .json(`insuficient balance current is ${balance} but required ${amount}`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

  const transaction = new transactionmodel({
        fromAccount: fromaccount,
        toAccount: toaccount,
        amount,
        idempotencyKey,
        status: "pending"
    });

    await ledgerModel.create(
        [
            {
                account: fromaccount,
                type: "debit",
                amount: amount,
                transaction: transaction._id
            }
        ],
        { session }
    );

    await ledgerModel.create(
        [
            {
                account: toaccount,
                type: "credit",
                amount: amount,
                transaction: transaction._id
            }
        ],
        { session }
    );

    transaction.status = "completed";
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

 const fromUser = await userModel.findById(fromuseraccount.user);
const toUser = await userModel.findById(touseraccount.user);

await emailService.sendEmail(
    fromUser.email,
    "Transaction Alert",
    `You have sent ${amount} to account ${toaccount}`
);

await emailService.sendEmail(
    toUser.email,
    "Transaction Alert",
    `You have received ${amount} from account ${fromaccount}`
);

    return res.status(200).json({
        message: "Transaction completed successfully"
    });
}

async function createInitialTransaction(req, res) {

    const { toAccount, amount, idempotencyKey } = req.body;

    if (!toAccount || !amount || !idempotencyKey) {
        return res.status(400).json({
            message: "toAccount, amount and idempotencyKey are required"
        });
    }

    const toUserAccount = await accountModel.findOne({
        _id: toAccount
    });

    if (!toUserAccount) {
        return res.status(400).json({
            message: "Invalid toAccount"
        });
    }

   console.log("System User ID:", req.user._id);

const fromUserAccount = await accountModel.findOne({
    user: req.user._id
});

console.log("System Account:", fromUserAccount);

    if (!fromUserAccount) {
        return res.status(400).json({
            message: "System user account not found"
        });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

   const transaction = new transactionmodel({
    fromAccount: fromUserAccount._id,
    toAccount: toAccount,
    amount,
    idempotencyKey,
    status: "pending"
});

    await ledgerModel.create(
        [
            {
                account: fromUserAccount._id,
                amount: amount,
                transaction: transaction._id,
                type: "debit"
            }
        ],
        { session }
    );

    await ledgerModel.create(
        [
            {
                account: toAccount,
                amount: amount,
                transaction: transaction._id,
                type: "credit"
            }
        ],
        { session }
    );

    transaction.status = "completed";
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
        message: "Initial funds transaction completed successfully",
        transaction
    });
}

module.exports = {
    createTransaction,
    createInitialTransaction
};
