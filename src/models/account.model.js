const mongoose = require('mongoose');
const ledgerModel = require('./ledger.model');

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
accountSchema.methods.getBalance = async function () {
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

    if (balanceData.length === 0) {
        return 0;
    }

    return balanceData[0].balance;
};


const AccountModel = mongoose.model('Account', accountSchema);

module.exports = AccountModel;