/*
  Prisma Client Singleton
  Replaces the old Mongoose connectDB() — Prisma connects lazily on first query.
  Uses @prisma/adapter-pg for direct PostgreSQL connections (Prisma 7 requirement).
  Handles graceful shutdown on SIGINT/SIGTERM.
*/

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

// Create a PostgreSQL connection pool
// Enable SSL when connecting to cloud providers like Neon (detected via sslmode in URL)
const connectionString = process.env.DATABASE_URL;
const useSSL = connectionString?.includes('sslmode=require');

const pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// Initialize the Prisma PG adapter
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
});

// Graceful shutdown — close all connections when process exits
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    await pool.end();
    console.log('🔌 Prisma connection closed (SIGINT)');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    await pool.end();
    console.log('🔌 Prisma connection closed (SIGTERM)');
    process.exit(0);
});

module.exports = prisma;
