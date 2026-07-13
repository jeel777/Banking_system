const express = require('express');

const router = express.Router();

const {
    userRegisterController,
    userLoginController,
    userLogoutController,
    getMeController
} = require('../controllers/auth.controller');

const { authMiddleware } = require('../middleware/auth.middleware');

const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../validators/auth.validator');

const { authLimiter } = require('../middleware/rateLimiter');

// POST /api/auth/register — Rate limited + validated
router.post("/register", authLimiter, validate(registerSchema), userRegisterController);

// POST /api/auth/login — Rate limited + validated
router.post("/login", authLimiter, validate(loginSchema), userLoginController);

// POST /api/auth/logout
router.post("/logout", userLogoutController);

// GET /api/auth/me — Get current user (authenticated)
router.get("/me", authMiddleware, getMeController);

module.exports = router;
