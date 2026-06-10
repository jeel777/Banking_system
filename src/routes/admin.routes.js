const express = require('express');
const { authMiddleware } = require('../middleware/auth.middleware');
const authorize = require('../middleware/authorize');
const {
    getAllUsers,
    getUserById,
    freezeAccount,
    unfreezeAccount,
    closeAccount,
    getSystemLedger,
    getFraudAlerts,
    getFraudStats,
    reviewFraudAlert
} = require('../controllers/admin.controller');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authMiddleware, authorize('admin'));

// User management
router.get('/users', getAllUsers);
router.get('/users/:id', getUserById);

// Account management
router.patch('/accounts/:id/freeze', freezeAccount);
router.patch('/accounts/:id/unfreeze', unfreezeAccount);
router.patch('/accounts/:id/close', closeAccount);

// System ledger
router.get('/ledger', getSystemLedger);

// Fraud management
router.get('/fraud-alerts', getFraudAlerts);
router.get('/fraud-alerts/stats', getFraudStats);
router.patch('/fraud-alerts/:id/review', reviewFraudAlert);

module.exports = router;
