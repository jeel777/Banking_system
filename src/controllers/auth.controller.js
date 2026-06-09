const userModel = require('../models/user.model');
const jwt = require('jsonwebtoken');
const cookieparser = require('cookie-parser');
const { sendRegistrationEmail } = require('../services/email');
const nodemailer = require('nodemailer');
const tokenBlacklistModel = require('../models/blacklist.model');

// POST /api/auth/register
async function userRegisterController(req, res) {
    const { email, name, password } = req.body;

    const isUserExist = await userModel.findOne({ email: email });

    if (isUserExist) {
        return res.status(400).json({
            success: false,
            message: "User already exists with this email"
        });
    }

    // if user does not exist then create new user
    const newUser = new userModel({
        name,
        email,
        password
    });

    // now we have to create jwt token for the user

    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, { expiresIn: "10d" });

    // set token in cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // set secure flag in production
        sameSite: "strict", // to prevent CSRF attacks
        maxAge: 10 * 24 * 60 * 60 * 1000 // 10 days
    });


    await newUser.save();

    res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: { // user data to frontend 
            name: newUser.name,
            email: newUser.email
        }


    });
    await sendRegistrationEmail(newUser.email, newUser.name)

}

async function userLoginController(req, res) {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email: email }).select("+password"); // we have to select password explicitly because in user model we have set select: false for password field to not return password by default when querying user


    if (!user) {
        return res.status(400).json({
            success: false,
            message: "Invalid email or password"
        });
    }

    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
        return res.status(400).json({
            success: false,
            message: "Invalid email or password"
        });
    }

    // if email and password are correct then create jwt token for the user

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "10d" });

    // set token in cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // set secure flag in production
        sameSite: "strict", // to prevent CSRF attacks
        maxAge: 10 * 24 * 60 * 60 * 1000 // 10 days
    });

    res.status(200).json({
        success: true,
        message: "User logged in successfully",
        user: { // user data to frontend 
            name: user.name,
            email: user.email
        }
    });
}

async function userLogoutController(req, res) {

    // we want token to blacklist is 

    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]; // we will get token from cookie or from authorization header

    if (!token) {
        return res.status(400).json({
            success: false,
            message: "Token is required for logout"
        });
    }

    res.clearCookie("token"); // clear token from cookie

    // add token to blacklist
    await tokenBlacklistModel.create({ token });

    return res.status(200).json({
        success: true,
        message: "User logged out successfully"
    });


}

module.exports = {
    userRegisterController,
    userLoginController,
    userLogoutController
}
