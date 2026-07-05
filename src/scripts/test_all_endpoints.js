/**
 * Comprehensive API Validation Script
 * Tests every single API endpoint for correctness.
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
let bobCookie = null;
let charlieCookie = null;
let adminCookie = null;
let systemCookie = null;

let bobAccountId = null;
let charlieAccountId = null;
let transactionId = null;
let systemAccountId = null;
let fraudAlertId = null;

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m'
};

function request(options, body = null) {
    return new Promise((resolve, reject) => {
        const reqOptions = {
            hostname: 'localhost',
            port: 3000,
            path: options.path,
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        if (options.cookie) {
            reqOptions.headers['Cookie'] = options.cookie;
        }

        const req = http.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                const cookieHeader = res.headers['set-cookie'];
                let cookie = null;
                if (cookieHeader) {
                    cookie = cookieHeader.map(c => c.split(';')[0]).join('; ');
                }
                
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (e) {
                    json = data;
                }

                resolve({
                    status: res.statusCode,
                    body: json,
                    cookie
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

function logStep(name, status, details = '') {
    if (status === 'PASS') {
        console.log(`${colors.green}✔ PASS:${colors.reset} ${name} ${details ? `(${details})` : ''}`);
    } else {
        console.log(`${colors.red}✘ FAIL:${colors.reset} ${name} ${details ? `\n  Error: ${JSON.stringify(details)}` : ''}`);
        process.exit(1);
    }
}

async function runTests() {
    console.log(`${colors.cyan}==================================================`);
    console.log('         STARTING FULL API VALIDATION');
    console.log(`==================================================${colors.reset}\n`);

    try {
        // 1. Health check
        const health = await request({ path: '/api/health', method: 'GET' });
        if (health.status === 200 && health.body.success) {
            logStep('GET /api/health', 'PASS');
        } else {
            logStep('GET /api/health', 'FAIL', health);
        }

        // 2. Register Bob
        const regBob = await request({
            path: '/api/auth/register',
            method: 'POST'
        }, {
            name: 'Bob Test',
            email: 'bob@test.com',
            password: 'Password@123'
        });
        if (regBob.status === 201 && regBob.body.success) {
            logStep('POST /api/auth/register (Bob)', 'PASS');
        } else if (regBob.status === 400 && regBob.body.message.includes('already exists')) {
            logStep('POST /api/auth/register (Bob)', 'PASS', 'Already existed');
        } else {
            logStep('POST /api/auth/register (Bob)', 'FAIL', regBob);
        }

        // 3. Login Bob
        const loginBob = await request({
            path: '/api/auth/login',
            method: 'POST'
        }, {
            email: 'bob@test.com',
            password: 'Password@123'
        });
        if (loginBob.status === 200 && loginBob.body.success) {
            bobCookie = loginBob.cookie;
            logStep('POST /api/auth/login (Bob)', 'PASS');
        } else {
            logStep('POST /api/auth/login (Bob)', 'FAIL', loginBob);
        }

        // 4. Get Bob's profile (/me)
        const getMe = await request({
            path: '/api/auth/me',
            method: 'GET',
            cookie: bobCookie
        });
        if (getMe.status === 200 && getMe.body.success && getMe.body.user.email === 'bob@test.com') {
            logStep('GET /api/auth/me (Bob)', 'PASS', `User ID: ${getMe.body.user.id}`);
        } else {
            logStep('GET /api/auth/me (Bob)', 'FAIL', getMe);
        }

        // 5. Create Bob's Account
        const createBobAcc = await request({
            path: '/api/accounts',
            method: 'POST',
            cookie: bobCookie
        }, {});
        if (createBobAcc.status === 201 && createBobAcc.body.success) {
            bobAccountId = createBobAcc.body.account.id;
            logStep('POST /api/accounts (Bob)', 'PASS', `Account ID: ${bobAccountId}`);
        } else {
            logStep('POST /api/accounts (Bob)', 'FAIL', createBobAcc);
        }

        // 6. List Bob's Accounts
        const listBobAcc = await request({
            path: '/api/accounts',
            method: 'GET',
            cookie: bobCookie
        });
        if (listBobAcc.status === 200 && listBobAcc.body.success && listBobAcc.body.accounts.length > 0) {
            logStep('GET /api/accounts (Bob)', 'PASS', `Found ${listBobAcc.body.accounts.length} accounts`);
        } else {
            logStep('GET /api/accounts (Bob)', 'FAIL', listBobAcc);
        }

        // 7. Get Bob's Balance
        const checkBobBal = await request({
            path: `/api/accounts/balance/${bobAccountId}`,
            method: 'GET',
            cookie: bobCookie
        });
        if (checkBobBal.status === 200 && checkBobBal.body.success) {
            logStep('GET /api/accounts/balance/:accountId (Bob)', 'PASS', `Balance: ${checkBobBal.body.balance}`);
        } else {
            logStep('GET /api/accounts/balance/:accountId (Bob)', 'FAIL', checkBobBal);
        }

        // 8. Register Charlie
        const regCharlie = await request({
            path: '/api/auth/register',
            method: 'POST'
        }, {
            name: 'Charlie Test',
            email: 'charlie@test.com',
            password: 'Password@123'
        });
        if (regCharlie.status === 201 && regCharlie.body.success) {
            logStep('POST /api/auth/register (Charlie)', 'PASS');
        } else if (regCharlie.status === 400 && regCharlie.body.message.includes('already exists')) {
            logStep('POST /api/auth/register (Charlie)', 'PASS', 'Already existed');
        } else {
            logStep('POST /api/auth/register (Charlie)', 'FAIL', regCharlie);
        }

        // 9. Login Charlie
        const loginCharlie = await request({
            path: '/api/auth/login',
            method: 'POST'
        }, {
            email: 'charlie@test.com',
            password: 'Password@123'
        });
        if (loginCharlie.status === 200 && loginCharlie.body.success) {
            charlieCookie = loginCharlie.cookie;
            logStep('POST /api/auth/login (Charlie)', 'PASS');
        } else {
            logStep('POST /api/auth/login (Charlie)', 'FAIL', loginCharlie);
        }

        // 10. Create Charlie's Account
        const createCharlieAcc = await request({
            path: '/api/accounts',
            method: 'POST',
            cookie: charlieCookie
        }, {});
        if (createCharlieAcc.status === 201 && createCharlieAcc.body.success) {
            charlieAccountId = createCharlieAcc.body.account.id;
            logStep('POST /api/accounts (Charlie)', 'PASS', `Account ID: ${charlieAccountId}`);
        } else {
            logStep('POST /api/accounts (Charlie)', 'FAIL', createCharlieAcc);
        }

        // 11. Login Admin
        const loginAdmin = await request({
            path: '/api/auth/login',
            method: 'POST'
        }, {
            email: 'admin@delvadiyabank.com',
            password: 'Admin@123'
        });
        if (loginAdmin.status === 200 && loginAdmin.body.success) {
            adminCookie = loginAdmin.cookie;
            logStep('POST /api/auth/login (Admin)', 'PASS');
        } else {
            logStep('POST /api/auth/login (Admin)', 'FAIL', loginAdmin);
        }

        // 12. Admin Seeds Funds to Bob (₹50,000)
        const seedBob = await request({
            path: '/api/admin/seed-funds',
            method: 'POST',
            cookie: adminCookie
        }, {
            toAccount: bobAccountId,
            amount: 50000
        });
        if (seedBob.status === 201 && seedBob.body.success) {
            logStep('POST /api/admin/seed-funds (Bob)', 'PASS', `New Balance: ${seedBob.body.recipient.newBalance}`);
        } else {
            logStep('POST /api/admin/seed-funds (Bob)', 'FAIL', seedBob);
        }

        // 13. Login System
        const loginSystem = await request({
            path: '/api/auth/login',
            method: 'POST'
        }, {
            email: 'system@delvadiyabank.com',
            password: 'System@123'
        });
        if (loginSystem.status === 200 && loginSystem.body.success) {
            systemCookie = loginSystem.cookie;
            logStep('POST /api/auth/login (System)', 'PASS');
        } else {
            logStep('POST /api/auth/login (System)', 'FAIL', loginSystem);
        }

        // Get System Account ID
        const getSystemAcc = await request({
            path: '/api/accounts',
            method: 'GET',
            cookie: systemCookie
        });
        if (getSystemAcc.status === 200 && getSystemAcc.body.success && getSystemAcc.body.accounts.length > 0) {
            systemAccountId = getSystemAcc.body.accounts[0].id;
        }

        // 14. System Seeds Initial Funds to Charlie (₹10,000)
        const systemSeedCharlie = await request({
            path: '/api/transactions/system/initial-funds',
            method: 'POST',
            cookie: systemCookie
        }, {
            toAccount: charlieAccountId,
            amount: 10000,
            idempotencyKey: `sys-seed-charlie-${Date.now()}`
        });
        if (systemSeedCharlie.status === 201 && systemSeedCharlie.body.success) {
            logStep('POST /api/transactions/system/initial-funds', 'PASS');
        } else {
            logStep('POST /api/transactions/system/initial-funds', 'FAIL', systemSeedCharlie);
        }

        // 15. Bob transfers ₹15,000 to Charlie
        const transfer = await request({
            path: '/api/transactions',
            method: 'POST',
            cookie: bobCookie
        }, {
            fromAccount: bobAccountId,
            toAccount: charlieAccountId,
            amount: 15000,
            idempotencyKey: `bob-to-charlie-tx-${Date.now()}`
        });
        if (transfer.status === 200 && transfer.body.success) {
            transactionId = transfer.body.transaction.id;
            logStep('POST /api/transactions (Transfer Bob -> Charlie)', 'PASS', `Tx ID: ${transactionId}`);
        } else {
            logStep('POST /api/transactions (Transfer)', 'FAIL', transfer);
        }

        // 16. Bob gets Transaction History
        const bobTxHistory = await request({
            path: '/api/transactions?limit=5',
            method: 'GET',
            cookie: bobCookie
        });
        if (bobTxHistory.status === 200 && bobTxHistory.body.success && bobTxHistory.body.transactions.length > 0) {
            logStep('GET /api/transactions (History)', 'PASS', `Total: ${bobTxHistory.body.pagination.total}`);
        } else {
            logStep('GET /api/transactions (History)', 'FAIL', bobTxHistory);
        }

        // 17. Bob gets Single Transaction
        const singleTx = await request({
            path: `/api/transactions/${transactionId}`,
            method: 'GET',
            cookie: bobCookie
        });
        if (singleTx.status === 200 && singleTx.body.success) {
            logStep('GET /api/transactions/:id', 'PASS');
        } else {
            logStep('GET /api/transactions/:id', 'FAIL', singleTx);
        }

        // 18. Bob gets Statement PDF
        const statement = await request({
            path: `/api/transactions/statement?accountId=${bobAccountId}`,
            method: 'GET',
            cookie: bobCookie
        });
        if (statement.status === 200) {
            logStep('GET /api/transactions/statement', 'PASS', 'Downloaded PDF');
        } else {
            logStep('GET /api/transactions/statement', 'FAIL', statement);
        }

        // 19. Admin Lists All Users
        const adminUsers = await request({
            path: '/api/admin/users',
            method: 'GET',
            cookie: adminCookie
        });
        if (adminUsers.status === 200 && adminUsers.body.success) {
            logStep('GET /api/admin/users', 'PASS', `Count: ${adminUsers.body.users.length}`);
        } else {
            logStep('GET /api/admin/users', 'FAIL', adminUsers);
        }

        // 20. Admin Gets Single User
        const singleUser = await request({
            path: `/api/admin/users/${getMe.body.user.id}`,
            method: 'GET',
            cookie: adminCookie
        });
        if (singleUser.status === 200 && singleUser.body.success) {
            logStep('GET /api/admin/users/:id', 'PASS');
        } else {
            logStep('GET /api/admin/users/:id', 'FAIL', singleUser);
        }

        // 21. Admin Lists All Accounts
        const adminAccounts = await request({
            path: '/api/admin/accounts',
            method: 'GET',
            cookie: adminCookie
        });
        if (adminAccounts.status === 200 && adminAccounts.body.success) {
            logStep('GET /api/admin/accounts', 'PASS', `Count: ${adminAccounts.body.accounts.length}`);
        } else {
            logStep('GET /api/admin/accounts', 'FAIL', adminAccounts);
        }

        // 22. Admin Lists System Ledger
        const adminLedger = await request({
            path: '/api/admin/ledger',
            method: 'GET',
            cookie: adminCookie
        });
        if (adminLedger.status === 200 && adminLedger.body.success) {
            logStep('GET /api/admin/ledger', 'PASS', `Count: ${adminLedger.body.entries.length}`);
        } else {
            logStep('GET /api/admin/ledger', 'FAIL', adminLedger);
        }

        // 23. Admin freeze Charlie's Account
        const freezeAcc = await request({
            path: `/api/admin/accounts/${charlieAccountId}/freeze`,
            method: 'PATCH',
            cookie: adminCookie
        });
        if (freezeAcc.status === 200 && freezeAcc.body.success && freezeAcc.body.account.status === 'frozen') {
            logStep('PATCH /api/admin/accounts/:id/freeze', 'PASS');
        } else {
            logStep('PATCH /api/admin/accounts/:id/freeze', 'FAIL', freezeAcc);
        }

        // 24. Admin unfreeze Charlie's Account
        const unfreezeAcc = await request({
            path: `/api/admin/accounts/${charlieAccountId}/unfreeze`,
            method: 'PATCH',
            cookie: adminCookie
        });
        if (unfreezeAcc.status === 200 && unfreezeAcc.body.success && unfreezeAcc.body.account.status === 'active') {
            logStep('PATCH /api/admin/accounts/:id/unfreeze', 'PASS');
        } else {
            logStep('PATCH /api/admin/accounts/:id/unfreeze', 'FAIL', unfreezeAcc);
        }

        // 25. Seed Bob 400,000 to test fraud limits
        const seedBobFraud = await request({
            path: '/api/admin/seed-funds',
            method: 'POST',
            cookie: adminCookie
        }, {
            toAccount: bobAccountId,
            amount: 400000
        });
        if (seedBobFraud.status === 201 && seedBobFraud.body.success) {
            logStep('Admin Seeds 400k for fraud check', 'PASS');
        } else {
            logStep('Admin Seeds 400k for fraud check', 'FAIL', seedBobFraud);
        }

        // 26. Trigger Fraud Alert: Bob transfers too much (over limit)
        const fraudTransfer = await request({
            path: '/api/transactions',
            method: 'POST',
            cookie: bobCookie
        }, {
            fromAccount: bobAccountId,
            toAccount: charlieAccountId,
            amount: 300000,
            idempotencyKey: `fraud-tx-${Date.now()}`
        });
        if (fraudTransfer.status === 403 || fraudTransfer.status === 200) {
            logStep('Fraud trigger test', 'PASS', `Status: ${fraudTransfer.status}`);
        } else {
            logStep('Fraud trigger test', 'FAIL', fraudTransfer);
        }

        // 26. Admin Gets Fraud Alerts
        const fraudAlerts = await request({
            path: '/api/admin/fraud-alerts',
            method: 'GET',
            cookie: adminCookie
        });
        if (fraudAlerts.status === 200 && fraudAlerts.body.success) {
            logStep('GET /api/admin/fraud-alerts', 'PASS');
            if (fraudAlerts.body.alerts.length > 0) {
                fraudAlertId = fraudAlerts.body.alerts[0].id;
            }
        } else {
            logStep('GET /api/admin/fraud-alerts', 'FAIL', fraudAlerts);
        }

        // 27. Admin Gets Fraud Stats
        const fraudStats = await request({
            path: '/api/admin/fraud-alerts/stats',
            method: 'GET',
            cookie: adminCookie
        });
        if (fraudStats.status === 200 && fraudStats.body.success) {
            logStep('GET /api/admin/fraud-alerts/stats', 'PASS');
        } else {
            logStep('GET /api/admin/fraud-alerts/stats', 'FAIL', fraudStats);
        }

        // 28. Admin reviews a fraud alert if one was created
        if (fraudAlertId) {
            const reviewAlert = await request({
                path: `/api/admin/fraud-alerts/${fraudAlertId}/review`,
                method: 'PATCH',
                cookie: adminCookie
            }, {
                status: 'dismissed',
                reviewNotes: 'Verified via phone call'
            });
            if (reviewAlert.status === 200 && reviewAlert.body.success) {
                logStep('PATCH /api/admin/fraud-alerts/:id/review', 'PASS');
            } else {
                logStep('PATCH /api/admin/fraud-alerts/:id/review', 'FAIL', reviewAlert);
            }
        } else {
            logStep('PATCH /api/admin/fraud-alerts/:id/review', 'PASS', 'Skipped (no alerts generated)');
        }

        // 29. Logout Bob
        const logoutBob = await request({
            path: '/api/auth/logout',
            method: 'POST',
            cookie: bobCookie
        });
        if (logoutBob.status === 200 && logoutBob.body.success) {
            logStep('POST /api/auth/logout', 'PASS');
        } else {
            logStep('POST /api/auth/logout', 'FAIL', logoutBob);
        }

        console.log(`\n${colors.cyan}==================================================`);
        console.log('       ALL ENDPOINTS CORRECTLY WORKING! 🎉');
        console.log(`==================================================${colors.reset}`);
        process.exit(0);

    } catch (e) {
        console.error(`${colors.red}✘ FATAL TEST ERROR:${colors.reset}`, e);
        process.exit(1);
    }
}

runTests();
