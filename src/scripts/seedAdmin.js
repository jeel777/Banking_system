/*
  Seed Script — Creates an Admin Account for testing
  
  Run once: node src/scripts/seedAdmin.js
  
  Admin Credentials:
    Email:    admin@delvadiyabank.com
    Password: Admin@123
*/

require('dotenv').config();
const mongoose = require('mongoose');
const userModel = require('../models/user.model');

const ADMIN_EMAIL = 'admin@delvadiyabank.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'Admin User';

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('✅ Connected to MongoDB\n');

    let adminUser = await userModel.findOne({ email: ADMIN_EMAIL });

    if (adminUser) {
      console.log(`⚠️  Admin user already exists: ${adminUser._id}`);
    } else {
      adminUser = await userModel.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin'
      });
      console.log(`✅ Admin user created: ${adminUser._id}`);
    }

    console.log('\n═══════════════════════════════════════');
    console.log('  ADMIN ACCOUNT READY');
    console.log('═══════════════════════════════════════');
    console.log(`  Email:    ${ADMIN_EMAIL}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
    console.log(`  User ID:  ${adminUser._id}`);
    console.log(`  Role:     ${adminUser.role}`);
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Seed failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seed();
