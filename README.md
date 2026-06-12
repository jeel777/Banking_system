<div align="center">

# 🏦 Banking System

### Enterprise-Grade Banking API with AI Fraud Detection

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://docker.com/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-Fraud_Detection-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)

A production-ready, full-stack banking system featuring ACID-compliant transactions, double-entry ledger accounting, AI-powered fraud detection using Google Gemini, and a modern React dashboard.

</div>

---

## 📋 Table of Contents

- [Architecture](#-architecture)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Environment Variables](#-environment-variables)
- [Scalability](#-scalability)
- [Seed Accounts](#-seed-accounts)

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (React + Vite)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │  Login   │  │Dashboard │  │ Transfer │  │  Admin Panel  │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP / REST
┌────────────────────────▼────────────────────────────────────────┐
│                  Nginx Reverse Proxy (Docker)                   │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    Express 5 API Server                         │
│  ┌─────────┐  ┌───────────────┐  ┌──────────────────────────┐  │
│  │  Auth   │  │  Rate Limiter │  │     Fraud Detection      │  │
│  │  (JWT)  │  │ (per-IP + TX) │  │  ┌────────┐ ┌─────────┐ │  │
│  └─────────┘  └───────────────┘  │  │7 Rules │ │Gemini AI│ │  │
│  ┌─────────┐  ┌───────────────┐  │  └────────┘ └─────────┘ │  │
│  │ Helmet  │  │  Compression  │  └──────────────────────────┘  │
│  └─────────┘  └───────────────┘                                │
│  ┌─────────────────────────────────────────────────┐           │
│  │          Cluster Mode (Multi-Core CPU)          │           │
│  │   Worker 1  │  Worker 2  │  Worker 3  │  ...    │           │
│  └─────────────────────────────────────────────────┘           │
└────────────────────────┬────────────────────────────────────────┘
                         │ Mongoose (Connection Pool: 50)
┌────────────────────────▼────────────────────────────────────────┐
│                     MongoDB (ACID Sessions)                     │
│  ┌──────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │  Users   │  │  Accounts  │  │   Ledger   │  │   Fraud   │  │
│  │          │  │            │  │(Double-Ent)│  │  Alerts   │  │
│  └──────────┘  └────────────┘  └────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### 🔐 Authentication & Security
- JWT-based authentication with **httpOnly cookies**
- Password hashing with **bcrypt**
- **Helmet** security headers
- **CORS** with strict origin control
- **Rate limiting** — global (100/15min) + per-endpoint throttling
- Input validation with **Zod** schemas

### 💸 Banking Operations
- **ACID-compliant transactions** using MongoDB sessions
- **Double-entry ledger** — every transaction creates balanced debit/credit entries
- **Idempotency keys** — prevents duplicate transaction processing
- **Balance derived from ledger** — no stored balance, always computed from entries
- **PDF bank statements** — downloadable, professionally formatted account statements

### 🤖 AI-Powered Fraud Detection
- **7 rule-based checks** (high amount, velocity, time-of-day, self-transfer, round amount, new account, account draining)
- **Google Gemini AI analysis** — LLM evaluates transaction context for anomalies
- **Risk scoring** (0–100) with automatic flagging
- **Admin review workflow** — confirm, dismiss, or escalate alerts

### 🎛 Admin Dashboard
- User management (view, freeze, unfreeze, close accounts)
- Fraud alerts overview with filtering by risk level and status
- System-wide ledger viewer
- Seed funds into any account for testing

### 📊 Customer Dashboard
- Account overview with real-time balance
- Transfer money with instant fraud screening
- Transaction history with filters (type, status, date range)
- Download PDF bank statements

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Vite 8, React Router 7 |
| **Backend** | Node.js 20, Express 5 |
| **Database** | MongoDB 7 (Mongoose 9) |
| **AI** | Google Gemini API (`@google/genai`) |
| **Auth** | JWT (jsonwebtoken), bcryptjs |
| **Validation** | Zod 4 |
| **Security** | Helmet, CORS, express-rate-limit |
| **Logging** | Winston + Morgan |
| **PDF** | PDFKit |
| **API Docs** | Swagger UI (OpenAPI 3.0) |
| **DevOps** | Docker, Docker Compose, Nginx |
| **Scalability** | Node.js Cluster, Gzip Compression, MongoDB Connection Pooling |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- MongoDB (local or Atlas)
- Google Gemini API key (optional, for AI fraud detection)

### Option 1: Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/banking_system.git
cd banking_system

# Install backend dependencies
npm install

# Install frontend dependencies
cd client && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URL and JWT secret

# Start backend (port 3000)
npm run dev

# In another terminal — start frontend (port 5173)
cd client && npm run dev
```

### Option 2: Docker (One Command)

```bash
# Start everything — MongoDB, backend, frontend
docker compose up --build

# Access the app at http://localhost
# API docs at http://localhost:3000/api-docs
```

---

## 📖 API Documentation

Interactive Swagger docs available at:

```
http://localhost:3000/api-docs
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login (sets JWT cookie) |
| `GET` | `/api/auth/me` | Get current user profile |
| `POST` | `/api/accounts` | Create a bank account |
| `GET` | `/api/accounts` | List user's accounts |
| `GET` | `/api/accounts/balance/:id` | Get ledger-derived balance |
| `POST` | `/api/transactions` | Transfer funds (fraud checked) |
| `GET` | `/api/transactions` | Transaction history (paginated) |
| `GET` | `/api/transactions/statement` | Download PDF bank statement |
| `GET` | `/api/admin/fraud-alerts` | List fraud alerts (admin) |
| `PATCH` | `/api/admin/fraud-alerts/:id/review` | Review a fraud alert |
| `GET` | `/api/admin/users` | List all users (admin) |
| `GET` | `/api/health` | Health check |

---

## 📁 Project Structure

```
banking_system/
├── server.js                  # Entry point — Cluster mode (multi-core)
├── Dockerfile                 # Backend Docker image
├── docker-compose.yml         # Full-stack orchestration
├── src/
│   ├── app.js                 # Express app setup + middleware
│   ├── config/
│   │   ├── db.js              # MongoDB connection (pooled)
│   │   └── swagger.json       # OpenAPI 3.0 specification
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── account.controller.js
│   │   ├── transaction.controller.js  # Includes PDF statement
│   │   └── admin.controller.js
│   ├── middleware/
│   │   ├── auth.middleware.js  # JWT verification
│   │   ├── authorize.js       # Role-based access (admin/customer)
│   │   ├── fraudCheck.js      # Fraud detection middleware
│   │   ├── rateLimiter.js     # Rate limiting configs
│   │   ├── validate.js        # Zod schema validation
│   │   ├── errorHandler.js    # Global error handler
│   │   └── requestLogger.js   # Morgan → Winston logging
│   ├── models/
│   │   ├── user.model.js
│   │   ├── account.model.js
│   │   ├── transaction.models.js
│   │   ├── ledger.model.js
│   │   └── fraudAlert.model.js
│   ├── services/
│   │   ├── fraudDetection.js  # 7 rules + Gemini AI engine
│   │   └── email.js           # Nodemailer notifications
│   ├── validators/            # Zod validation schemas
│   ├── routes/                # Express route definitions
│   └── utils/                 # AppError, catchAsync, logger
├── client/                    # React + Vite frontend
│   ├── Dockerfile             # Multi-stage build (Node → Nginx)
│   ├── nginx.conf             # SPA routing + API proxy
│   └── src/
│       ├── api/client.js      # Fetch wrapper
│       ├── context/AuthContext.jsx
│       ├── components/        # Sidebar, ProtectedRoute
│       └── pages/
│           ├── Login.jsx
│           ├── Register.jsx
│           ├── dashboard/     # Customer pages
│           └── admin/         # Admin pages
└── logs/                      # Winston log files
```

---

## ⚙️ Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# MongoDB
MONGODB_URL=mongodb://localhost:27017/banking_system

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=7d

# Email (Nodemailer)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your@email.com
EMAIL_PASS=your_app_password

# AI Fraud Detection (optional)
GEMINI_API_KEY=your_gemini_api_key

# Client
CLIENT_URL=http://localhost:5173
```

---

## ⚡ Scalability

This system is designed to scale horizontally and vertically:

| Feature | Implementation | Impact |
|---------|---------------|--------|
| **Cluster Mode** | `server.js` forks one worker per CPU core | Utilize all CPU cores |
| **Connection Pooling** | MongoDB pool of 50 connections per worker | Handle concurrent DB operations |
| **Gzip Compression** | `compression` middleware on all responses | ~70% bandwidth reduction |
| **Rate Limiting** | Per-IP throttling (100 req/15min global) | Prevent abuse |
| **Docker Ready** | `docker-compose.yml` for instant deployment | Scale with orchestrators |
| **Stateless Auth** | JWT cookies — no server-side sessions | Any worker can handle any request |
| **Nginx Reverse Proxy** | Static file serving + API proxying | Offload static assets from Node |

---

## 🔑 Seed Accounts

For testing, run the seed scripts:

```bash
# Create system account (for initial fund seeding)
node src/scripts/seedSystem.js

# Create admin account
node src/scripts/seedAdmin.js
```

| Role | Email | Password |
|------|-------|----------|
| System | `system@delvadiyabank.com` | `System@123` |
| Admin | `admin@delvadiyabank.com` | `Admin@123` |

---

## 📄 License

This project is licensed under the ISC License.

---

<div align="center">

**Built with ❤️ by Jeel Delvadiya**

</div>
