const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({

    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
        index: true,
        immutable: true            // onces set,cant modify
    },
    amount: {
        type: Number,
        required: true,
        min: [0, 'Amount must be a positive number'],
        immutable: true
    },
    transaction: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
        required: true,
        index: true,
        immutable: true
    },
    type: {
        type: String,
        enum: {
            values: ['debit', 'credit'],
            message: 'Invalid ledger entry type'
        },
        required: true,
        immutable: true
    },
})

// Middleware to prevent updates to ledger entries after creation
function preventLedgerModification() {
    throw new Error('Ledger entries cannot be modified after creation');
}

// from belowe if any req is called simply throw error as ledger entries are immutable
ledgerSchema.pre('findOneAndUpdate', preventLedgerModification);
ledgerSchema.pre('updateOne', preventLedgerModification);
ledgerSchema.pre('updateMany', preventLedgerModification);
ledgerSchema.pre('deleteOne', preventLedgerModification);
ledgerSchema.pre('deleteMany', preventLedgerModification);
ledgerSchema.pre('findOneAndDelete', preventLedgerModification);
ledgerSchema.pre('findOneAndRemove', preventLedgerModification);




const Ledger = mongoose.model('Ledger', ledgerSchema);
module.exports = Ledger;