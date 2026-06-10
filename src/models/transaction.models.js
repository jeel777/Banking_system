const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({

    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
        index: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: {
            values: ['pending', 'completed', 'failed', 'reversed'],
            message: 'Invalid transaction status'
        },
        default: 'pending'
    },
    amount: {
        type: Number,
        required: true,
        min: [0, 'Amount must be a positive number']
    },
    idempotencyKey: {    // Unique key to prevent duplicate transactions
        type: String,
        required: true,
        unique: true
    },
    fraudAlert: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FraudAlert',
        default: null
    },
    riskScore: {
        type: Number,
        default: 0
    },




}, {
    timestamps: true
})


module.exports = mongoose.model('Transaction', transactionSchema);