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
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { hashPassword } = require('../utils/password');
const { getBalance } = require('../utils/balance');

const SYSTEM_EMAIL = 'system@delvadiyabank.com';
const SYSTEM_PASSWORD = 'System@123';
const SYSTEM_NAME = 'System Bank Account';
const INITIAL_FUNDS = 10_000_000; // ₹1 Crore

async function seed() {
  try {
    // 1. Check if system user already exists
    let systemUser = await prisma.user.findUnique({ where: { email: SYSTEM_EMAIL } });

    if (systemUser) {
      console.log(`⚠️  System user already exists: ${systemUser.id}`);
    } else {
      const hashedPassword = await hashPassword(SYSTEM_PASSWORD);
      systemUser = await prisma.user.create({
        data: {
          name: SYSTEM_NAME,
          email: SYSTEM_EMAIL,
          password: hashedPassword,
          role: 'system'
        }
      });
      console.log(`✅ System user created: ${systemUser.id}`);
    }

    // 2. Check if system account already exists
    let systemAccount = await prisma.account.findFirst({ where: { userId: systemUser.id } });

    if (systemAccount) {
      console.log(`⚠️  System account already exists: ${systemAccount.id}`);
    } else {
      systemAccount = await prisma.account.create({
        data: {
          userId: systemUser.id,
          currency: 'INR',
          status: 'active'
        }
      });
      console.log(`✅ System account created: ${systemAccount.id}`);
    }

    // 3. Check if initial funds already seeded
    const existingCredit = await prisma.ledger.findFirst({
      where: { accountId: systemAccount.id, type: 'credit' }
    });

    if (existingCredit) {
      console.log(`⚠️  Initial funds already seeded`);
    } else {
      // Create a bootstrap transaction and credit entry atomically
      await prisma.$transaction(async (tx) => {
        // Create a bootstrap transaction record
        const bootstrapTx = await tx.transaction.create({
          data: {
            fromAccountId: systemAccount.id,
            toAccountId: systemAccount.id,
            amount: INITIAL_FUNDS,
            idempotencyKey: `system-bootstrap-${crypto.randomUUID()}`,
            status: 'completed'
          }
        });

        // Create the bootstrap credit entry (this is the "bank's own capital")
        await tx.ledger.create({
          data: {
            accountId: systemAccount.id,
            amount: INITIAL_FUNDS,
            type: 'credit',
            transactionId: bootstrapTx.id
          }
        });
      });

      console.log(`✅ Initial funds seeded: ₹${INITIAL_FUNDS.toLocaleString('en-IN')}`);
    }

    // Summary
    const balance = await getBalance(systemAccount.id);
    console.log('\n═══════════════════════════════════════');
    console.log('  SYSTEM ACCOUNT READY');
    console.log('═══════════════════════════════════════');
    console.log(`  Email:      ${SYSTEM_EMAIL}`);
    console.log(`  Password:   ${SYSTEM_PASSWORD}`);
    console.log(`  User ID:    ${systemUser.id}`);
    console.log(`  Account ID: ${systemAccount.id}`);
    console.log(`  Balance:    ₹${balance.toLocaleString('en-IN')}`);
    console.log(`  Role:       ${systemUser.role}`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
  } finally {
    await prisma.$disconnect();
    console.log('Disconnected from PostgreSQL');
  }
}

seed();
