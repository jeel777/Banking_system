const { Router } = require("express");
const authMiddleware = require("../middleware/auth.middleware.js");
const transactioncontroller=require("../controllers/transaction.controller.js");


const transactionRoutes=Router();

transactionRoutes.post("/",authMiddleware.authMiddleware,transactioncontroller.createTransaction);

// create initial funds by sytem account
transactionRoutes.post("/system/initial-funds",authMiddleware.systemAuthMiddleware,transactioncontroller.createInitialTransaction);


module.exports=transactionRoutes;