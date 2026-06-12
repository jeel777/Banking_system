const mongoose = require('mongoose');

/**
 * Connect to MongoDB with optimized connection pooling.
 * - maxPoolSize: Maximum number of concurrent connections per worker
 * - minPoolSize: Minimum connections kept alive (reduces cold-start latency)
 * - socketTimeoutMS: Close sockets after 45s of inactivity
 * - serverSelectionTimeoutMS: Fail fast if DB is unreachable
 */
function connectDB() {
    const options = {
        maxPoolSize: 50,            // Handle up to 50 concurrent operations per worker
        minPoolSize: 5,             // Keep 5 warm connections ready
        socketTimeoutMS: 45000,     // Close inactive sockets after 45s
        serverSelectionTimeoutMS: 5000,  // Fail fast if DB unreachable
    };

    mongoose.connect(process.env.MONGODB_URL, options)
        .then(() => {
            console.log('✅ Connected to MongoDB (pool: 50 connections)');
        })
        .catch((err) => {
            console.error('❌ Error connecting to MongoDB', err);
            process.exit(1);
        });

    // Graceful shutdown — close all connections when process exits
    process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed (SIGINT)');
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await mongoose.connection.close();
        console.log('🔌 MongoDB connection closed (SIGTERM)');
        process.exit(0);
    });
}

module.exports = connectDB;