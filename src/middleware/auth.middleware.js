// here we will check if the user is authenticated or not before allowing access to certain routes
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const tokenBlacklistModel = require('../models/blacklist.model');



async function authMiddleware(req, res, next) {

    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1]; // to get token from cookies or from authorization header

    if (!token) {
        return res.status(401).json({ message: 'Unauthorized1' });
    }

    const isBlacklisted = await tokenBlacklistModel.findOne({ token
    });

    if (isBlacklisted) {
        return res.status(401).json({ message: 'Unauthorized4' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // to verify the token and get the user id from it

        if (!decoded || !decoded.userId) {
            return res.status(401).json({ message: 'Unauthorized2' });
        }

        // if we found token then we will find and save userid 
        const user = await userModel.findById(decoded.userId);
        req.user = user; // we will save the user in req.user to access it in the controller

        return next(); // to pass the control to the next middleware or controller
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized3' });
    }



}



async function systemAuthMiddleware(req, res, next) {


    const token = req.cookies.token || req.headers.authorization?.split(" ")[1]
    if (!token) {
        return res.status(401).json({
            message: "Unauthorized access, token is missing"
        })
    }

    const isBlacklisted = await tokenBlacklistModel.findOne({ token });

    if (isBlacklisted) {
        return res.status(401).json({
            message: "Unauthorized access, token is blacklisted"
        })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        console.log("Decoded:", decoded);

        const user = await userModel
            .findById(decoded.userId)
            .select("+systemUser");

        console.log("Logged in user:", user.email);
        console.log("System User:", user.systemUser);


        if (!user.systemUser) {
            return res.status(403).json({
                message: "Forbidden access, not a system user"
            })
        }

        req.user = user

        return next()
    }
    catch (err) {
        return res.status(401).json({
            message: "Unauthorized access, token is invalid"
        })
    }
}

module.exports = { authMiddleware, systemAuthMiddleware };
