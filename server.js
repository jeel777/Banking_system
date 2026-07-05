/*
  server.js — Cluster-enabled HTTP server
  Uses Node.js cluster module to fork one worker per CPU core.
  This allows the app to handle more concurrent requests by
  utilizing all available processor cores.
*/

require('dotenv').config();
const cluster = require('cluster');
const os = require('os');
const app = require('./src/app.js');

const PORT = process.env.PORT || 3000;
const NUM_WORKERS = process.env.WEB_CONCURRENCY || os.cpus().length;

if (cluster.isPrimary) {
    console.log(`🏦 Primary process ${process.pid} is running`);
    console.log(`🔧 Forking ${NUM_WORKERS} workers...`);

    // Fork workers — one per CPU core
    for (let i = 0; i < NUM_WORKERS; i++) {
        cluster.fork();
    }

    // If a worker dies, restart it
    cluster.on('exit', (worker, code, signal) => {
        console.log(`⚠️  Worker ${worker.process.pid} died (code: ${code}, signal: ${signal}). Restarting...`);
        cluster.fork();
    });

    cluster.on('online', (worker) => {
        console.log(`✅ Worker ${worker.process.pid} is online`);
    });
} else {
    // Each worker starts listening — Prisma connects lazily on first query
    require('./src/config/redis.js'); // Initialize Redis connection per worker

    app.listen(PORT, () => {
        console.log(`🚀 Worker ${process.pid} listening on port ${PORT}`);
    });
}
