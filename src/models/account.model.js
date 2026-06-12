const mongoose = require('mongoose');
const ledgerModel = require('./ledger.model');
const redisClient = require('../config/redis');

const BALANCE_CACHE_TTL = 30; // 30 seconds

const accountSchema = new mongoose.Schema({

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User is required'],
        index: true // to search faster from database

    },
    status: {
        type: String,
        enum: {
            values: [ "active", "frozen", "closed" ],
            message: "Status can be either active, frozen or closed",
        },
        default: "active"
    },

    currency: {
        type: String,
        required: [true, 'Currency is required'],
        default: 'INR'
    },
}, {
    timestamps: true
})

accountSchema.index({ user: 1, status: 1 }); //called compound index to search faster

// we should not add balance field 
// because balance is derived from transactions and should not be stored directly in the database


// will create a method to get balance from ledger model
// Uses Redis cache (30s TTL) for read endpoints, with option to bypass for transactional accuracy
accountSchema.methods.getBalance = async function (options = {}) {
    const { skipCache = false } = options;
    const cacheKey = `balance:${this._id}`;

    // Check Redis cache first (unless explicitly bypassed for ACID correctness)
    if (!skipCache) {
        try {
            const cached = await redisClient.get(cacheKey);
            if (cached !== null) {
                return parseFloat(cached);
            }
        } catch {
            // Redis unavailable — fall through to MongoDB
        }
    }

    // Cache miss or bypass — run the aggregation pipeline
    const balanceData = await ledgerModel.aggregate([
        {
            $match: {
                account: this._id
            }
        },
        {
            $group: {
                _id: null,
                totalDebit: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "debit"] },
                            "$amount",
                            0
                        ]
                    }
                },
                totalCredit: {
                    $sum: {
                        $cond: [
                            { $eq: ["$type", "credit"] },
                            "$amount",
                            0
                        ]
                    }
                }
            }
        },
        {
            $project: {
                _id: 0,
                balance: {
                    $subtract: ["$totalCredit", "$totalDebit"]
                }
            }
        }
    ]);

    const balance = balanceData.length === 0 ? 0 : balanceData[0].balance;

    // Cache the computed balance
    try {
        await redisClient.setex(cacheKey, BALANCE_CACHE_TTL, balance.toString());
    } catch {
        // Non-critical
    }

    return balance;
};

/**
 * Invalidate the cached balance for a given account ID.
 * Called after any transaction (debit/credit) to ensure consistency.
 */
accountSchema.statics.invalidateBalanceCache = async function (accountId) {
    try {
        await redisClient.del(`balance:${accountId}`);
    } catch {
        // Non-critical — cache will expire naturally
    }
};


const AccountModel = mongoose.model('Account', accountSchema);

module.exports = AccountModel;