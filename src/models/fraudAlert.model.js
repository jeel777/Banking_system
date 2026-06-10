/*
  FraudAlert Model
  Stores fraud detection results for flagged/blocked transactions.
  Linked to accounts, transactions, and the admin who reviewed.
*/

const mongoose = require('mongoose');

const fraudAlertSchema = new mongoose.Schema({
    transaction: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
        default: null       // null if transaction was blocked before creation
    },
    fromAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true,
        index: true
    },
    toAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    riskScore: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    riskLevel: {
        type: String,
        enum: {
            values: ['low', 'medium', 'high', 'critical'],
            message: 'Risk level must be low, medium, high, or critical'
        },
        required: true
    },
    triggeredRules: [{
        type: String
    }],
    aiAnalysis: {
        type: String,
        default: null       // Gemini's explanation, only populated for medium-risk cases
    },
    status: {
        type: String,
        enum: {
            values: ['flagged', 'reviewed', 'dismissed', 'confirmed_fraud'],
            message: 'Status must be flagged, reviewed, dismissed, or confirmed_fraud'
        },
        default: 'flagged'
    },
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    reviewNotes: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for efficient admin queries
fraudAlertSchema.index({ status: 1, createdAt: -1 });
fraudAlertSchema.index({ riskLevel: 1 });
fraudAlertSchema.index({ fromAccount: 1, createdAt: -1 });

const FraudAlert = mongoose.model('FraudAlert', fraudAlertSchema);
module.exports = FraudAlert;
