const express=require('express');
const router=express.Router();
const {
    userRegisterController,
    userLoginController,
    userLogoutController
}= require('../controllers/auth.controller');

// POST /api/auth/register
router.post("/register", userRegisterController);
router.post("/login", userLoginController);

router.post("/logout", userLogoutController);











module.exports=router;
