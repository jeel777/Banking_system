const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');
const { sendRegistrationEmail } = require('../services/email');
const tokenBlacklistModel = require('../models/blacklist.model');
const redisClient = require('../config/redis');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

const TOKEN_BLACKLIST_KEY = 'token:blacklist';

// POST /api/auth/register
const userRegisterController = catchAsync(async (req, res, next) => {
    const { email, name, password } = req.body;

    const isUserExist = await userModel.findOne({ email: email });

    if (isUserExist) {
        throw new AppError("User already exists with this email", 400);
    }

    // If user does not exist, create new user
    const newUser = new userModel({ name, email, password });

    // Create JWT token for the user
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: "10d" });

    // Set token in cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 10 * 24 * 60 * 60 * 1000 // 10 days
    });

    await newUser.save();

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

    const user = await userModel.findOne({ email: email }).select("+password");

    if (!user) {
        throw new AppError("Invalid email or password", 400);
    }

    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
        throw new AppError("Invalid email or password", 400);
    }

    // Create JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "10d" });

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

    // Add token to blacklist (MongoDB for durability + Redis for speed)
    await tokenBlacklistModel.create({ token });

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
            _id: req.user._id,
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
