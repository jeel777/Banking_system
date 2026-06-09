/*
app.js has work of 
1 create server
2 configure the server
3 connect to database
4 define routes
*/


const express=require('express');
const cookieParser=require('cookie-parser');

const authRoutes=require('./routes/auth.routes.js');
const accountRoutes=require('./routes/account.routes.js');
const transactionRoutes=require('./routes/transaction.routes.js');

const app=express();                                    // we will create server here but run in server.js

app.use(express.json());                                // to parse incoming json data in req.body bec express server can not read json data by default
app.use(cookieParser());                                // to parse cookies from incoming req headers and set it in req.cookies

app.use("/api/auth", authRoutes);                       // all req related to auth will be handled by authRoutes
app.use("/api/accounts", accountRoutes);                // all req related to accounts will be handled by accountRoutes
app.use("/api/transactions", transactionRoutes);      

module.exports=app;

// uV9MazTSUxuBdlS1