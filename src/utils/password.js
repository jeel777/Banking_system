/*
  Password utility — extracted from Mongoose pre('save') hook
  Pure functions that work with any ORM/database.
*/

const bcrypt = require('bcryptjs');

/**
 * Hash a plaintext password with bcrypt (10 rounds).
 * @param {string} password - Plaintext password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 * @param {string} password - Plaintext password
 * @param {string} hash - Bcrypt hash
 * @returns {Promise<boolean>} True if password matches
 */
async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

module.exports = { hashPassword, comparePassword };
