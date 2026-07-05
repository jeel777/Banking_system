const prisma = require('../config/prisma');
const jwt = require('jsonwebtoken');
const { sendRegistrationEmail } = require('../services/email');
const { hashPassword, comparePassword } = require('../utils/password');
const redisClient = require('../config/redis');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const TOKEN_BLACKLIST_KEY = 'token:blacklist';

// POST /api/auth/register
const userRegisterController = catchAsync(async (req, res, next) => {
    const { email, name, password } = req.body;

    const isUserExist = await prisma.user.findUnique({ where: { email } });

    if (isUserExist) {
        throw new AppError("User already exists with this email", 400);
    }

    // Hash password before storing
    const hashedPassword = await hashPassword(password);

    // Create new user
    const newUser = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword
        }
    });

    // Create JWT token for the user
    const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET, { expiresIn: "10d" });

    // Set token in cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 10 * 24 * 60 * 60 * 1000 // 10 days
    });

    res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: {
            name: newUser.name,
            email: newUser.email
        }
    });

    // Send welcome email (non-blocking, don't await in response path)
    sendRegistrationEmail(newUser.email, newUser.name).catch(() => {});
});

// POST /api/auth/login
const userLoginController = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
        throw new AppError("Invalid email or password", 400);
    }

    const isPasswordMatch = await comparePassword(password, user.password);

    if (!isPasswordMatch) {
        throw new AppError("Invalid email or password", 400);
    }

    // Create JWT token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "10d" });

    // Set token in cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 10 * 24 * 60 * 60 * 1000 // 10 days
    });

    res.status(200).json({
        success: true,
        message: "User logged in successfully",
        user: {
            name: user.name,
            email: user.email
        }
    });
});

// POST /api/auth/logout
const userLogoutController = catchAsync(async (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

    if (!token) {
        throw new AppError("Token is required for logout", 400);
    }

    res.clearCookie("token");

    // Add token to blacklist (PostgreSQL for durability + Redis for speed)
    await prisma.tokenBlacklist.create({ data: { token } });

    try {
        await redisClient.sadd(TOKEN_BLACKLIST_KEY, token);

        // Clear user session cache on logout
        const decoded = jwt.decode(token);
        if (decoded?.userId) {
            await redisClient.del(`user:${decoded.userId}`);
        }
    } catch {
        // Non-critical — Redis may be unavailable
    }

    return res.status(200).json({
        success: true,
        message: "User logged out successfully"
    });
});

// GET /api/auth/me — Get current logged-in user
const getMeController = catchAsync(async (req, res, next) => {
    return res.status(200).json({
        success: true,
        user: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        }
    });
});

module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController,
    getMeController
};
