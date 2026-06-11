/*
  Seed Script — Creates the System Account
  
  Run once: node src/scripts/seedSystem.js
  
  This creates:
    1. A system user (role: "system") 
    2. A system bank account linked to it
    3. An initial credit entry so the system has funds to distribute

  System Credentials:
    Email:    system@delvadiyabank.com
    Password: System@123
*/

require('dotenv').config();
const mongoose = require('mongoose');
const userModel = require('../models/user.model');
const accountModel = require('../models/account.model');
const ledgerModel = require('../models/ledger.model');

const SYSTEM_EMAIL = 'system@delvadiyabank.com';
const SYSTEM_PASSWORD = 'System@123';
const SYSTEM_NAME = 'System Bank Account';
const INITIAL_FUNDS = 10_000_000; // ₹1 Crore

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to MongoDB\n');

    // 1. Check if system user already exists
    let systemUser = await userModel.findOne({ email: SYSTEM_EMAIL });

    if (systemUser) {
      console.log(`⚠️  System user already exists: ${systemUser._id}`);
    } else {
      systemUser = await userModel.create({
        name: SYSTEM_NAME,
        email: SYSTEM_EMAIL,
        password: SYSTEM_PASSWORD,
        role: 'system'
      });
      console.log(`✅ System user created: ${systemUser._id}`);
    }

    // 2. Check if system account already exists
    let systemAccount = await accountModel.findOne({ user: systemUser._id });

    if (systemAccount) {
      console.log(`⚠️  System account already exists: ${systemAccount._id}`);
    } else {
      systemAccount = await accountModel.create({
        user: systemUser._id,
        currency: 'INR',
        status: 'active'
      });
      console.log(`✅ System account created: ${systemAccount._id}`);
    }

    // 3. Check if initial funds already seeded
    const existingCredit = await ledgerModel.findOne({ account: systemAccount._id, type: 'credit' });

    if (existingCredit) {
      console.log(`⚠️  Initial funds already seeded`);
    } else {
      // Create a bootstrap credit entry (this is the "bank's own capital")
      await ledgerModel.create({
        account: systemAccount._id,
        amount: INITIAL_FUNDS,
        type: 'credit',
        transaction: new mongoose.Types.ObjectId() // dummy transaction ID for bootstrap
      });
      console.log(`✅ Initial funds seeded: ₹${INITIAL_FUNDS.toLocaleString('en-IN')}`);
    }

    // Summary
    const balance = await systemAccount.getBalance();
    console.log('\n═══════════════════════════════════════');
    console.log('  SYSTEM ACCOUNT READY');
    console.log('═══════════════════════════════════════');
    console.log(`  Email:      ${SYSTEM_EMAIL}`);
    console.log(`  Password:   ${SYSTEM_PASSWORD}`);
    console.log(`  User ID:    ${systemUser._id}`);
    console.log(`  Account ID: ${systemAccount._id}`);
    console.log(`  Balance:    ₹${balance.toLocaleString('en-IN')}`);
    console.log(`  Role:       ${systemUser.role}`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seed();
