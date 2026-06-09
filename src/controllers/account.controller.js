// will first check if the user is authenticated or not 
const AccountModel = require('../models/account.model');

// create account for user

async function createAccount(req, res) {

const user=req.user; // we will get user from auth middleware and save it in req.user

const account = await AccountModel.create({
    user: user._id, 
});

return res.status(201).json({ message: 'Account created successfully', account });



}

// get all accounts of user
async function getUserAccountsController(req, res) {

const accounts = await AccountModel.find({ user: req.user._id });

return res.status(200).json({ accounts });

}

// get balance of account
async function getAccountBalanceController(req, res) {

const accountId = req.params.accountId;

console.log("Account ID:", accountId);
console.log("Logged in User:", req.user._id);

const account = await AccountModel.findOne(
    { _id: accountId, user: req.user._id }       // we will find account by id and user id to make sure that user is trying to access his own account balance and not someone else's account balance
);

if (!account) {
    return res.status(404).json({ message: 'Account not found' });
}

const balance = await account.getBalance(); 
return res.status(200).json({ balance });



}

module.exports = { createAccount, getUserAccountsController, getAccountBalanceController };