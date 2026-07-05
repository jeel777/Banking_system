/*
  Seed Script — Creates an Admin Account for testing
  
  Run once: node src/scripts/seedAdmin.js
  
  Admin Credentials:
    Email:    admin@delvadiyabank.com
    Password: Admin@123
*/

require('dotenv').config();
const prisma = require('../config/prisma');
const { hashPassword } = require('../utils/password');

const ADMIN_EMAIL = 'admin@delvadiyabank.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'Admin User';

async function seed() {
  try {
    let adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

    if (adminUser) {
      console.log(`⚠️  Admin user already exists: ${adminUser.id}`);
    } else {
      const hashedPassword = await hashPassword(ADMIN_PASSWORD);
      adminUser = await prisma.user.create({
        data: {
          name: ADMIN_NAME,
          email: ADMIN_EMAIL,
          password: hashedPassword,
          role: 'admin'
        }
      });
      console.log(`✅ Admin user created: ${adminUser.id}`);
    }

    console.log('\n═══════════════════════════════════════');
    console.log('  ADMIN ACCOUNT READY');
    console.log('═══════════════════════════════════════');
    console.log(`  Email:    ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log(`  User ID:  ${adminUser.id}`);
    console.log(`  Role:     ${adminUser.role}`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
  } finally {
    await prisma.$disconnect();
    console.log('Disconnected from PostgreSQL');
  }
}

seed();
