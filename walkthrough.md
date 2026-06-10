# 🛡️ AI Fraud Detection System — Complete Summary

## What Is It?

The Fraud Detection System is an **AI-powered security layer** that sits between the user's transfer request and the actual money movement. It analyzes every transaction in real-time using a **two-stage hybrid approach**:

1. **Stage 1** — A fast **rule-based scoring engine** that checks 7 fraud indicators
2. **Stage 2** — **Google Gemini AI** that provides deeper contextual analysis on borderline cases

The system either **allows**, **flags**, or **blocks** a transaction before any money leaves the sender's account.

---

## How It Works — Step by Step

### The Complete Request Lifecycle

```
User sends POST /api/transactions
  │
  ▼
┌──────────────────────────────────────────────────────┐
│  1. AUTH MIDDLEWARE — Verify JWT token                │
│  2. RATE LIMITER — Max requests per IP               │
│  3. ZOD VALIDATION — Validate amount, account IDs    │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│         🛡️ FRAUD CHECK MIDDLEWARE                     │
│                                                      │
│  ┌─────────────────────────────────┐                 │
│  │  STAGE 1: Rule-Based Engine     │                 │
│  │  Runs 7 heuristic checks        │                 │
│  │  Computes score: 0-100          │                 │
│  └──────────────┬──────────────────┘                 │
│                 │                                    │
│    Score < 30   │   Score 30-49   │  Score 50-79     │  Score ≥ 80
│        │        │       │         │      │           │      │
│        ▼        │       ▼         │      ▼           │      ▼
│     ✅ PASS     │   ⚠️ FLAG       │  🤖 ASK AI       │  🚫 AUTO-BLOCK
│    (clean)      │  (allow but     │  (Gemini)        │  (instant reject)
│                 │   record)       │      │           │
│                 │                 │   ┌──┴──┐        │
│                 │                 │   │SAFE?│        │
│                 │                 │   └──┬──┘        │
│                 │                 │  Yes │  No       │
│                 │                 │   ✅  │  🚫       │
│                 │                 │ FLAG  │ BLOCK     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼ (if allowed)
┌──────────────────────────────────────────────────────┐
│  TRANSACTION CONTROLLER                              │
│  - Start MongoDB Session                             │
│  - Create debit entry (sender)                       │
│  - Create credit entry (receiver)                    │
│  - Mark transaction completed                        │
│  - Link fraud alert if flagged                       │
│  - Send email notifications                          │
└──────────────────────────────────────────────────────┘
```

---

## Stage 1: Rule-Based Scoring Engine

The engine runs **7 independent checks** on every transaction. Each check adds points to a risk score. The score is capped at 100.

| # | Rule Name | Points | What It Checks |
|---|---|---|---|
| 1 | **HIGH_AMOUNT** | +20 | Is the amount > ₹50,000? |
| 2 | **VERY_HIGH_AMOUNT** | +35 | Is the amount > ₹2,00,000? |
| 3 | **VELOCITY_1H** | +25 | Has this account made > 5 transactions in the last hour? |
| 4 | **RAPID_FIRE_10M** | +30 | Has this account made > 3 transactions in the last 10 minutes? |
| 5 | **ODD_HOURS** | +15 | Is it between 1 AM – 5 AM IST? (unusual banking hours) |
| 6 | **NEW_ACCOUNT** | +10 | Was the sender's account created less than 24 hours ago? |
| 7 | **NEAR_DRAIN** | +20 | Would the transaction leave less than 5% of the current balance? |

### Example Scenarios

**Scenario A** — Normal transaction:
```
Amount: ₹5,000 | Account: 6 months old | Time: 2 PM | Balance: ₹1,00,000
→ No rules triggered → Score: 0 → ✅ ALLOWED
```

**Scenario B** — Suspicious transfer:
```
Amount: ₹75,000 | Account: 12 hours old | Time: 3 AM | Balance: ₹80,000
→ HIGH_AMOUNT (+20) + NEW_ACCOUNT (+10) + ODD_HOURS (+15) + NEAR_DRAIN (+20)
→ Score: 65 → 🤖 SENT TO GEMINI AI
```

**Scenario C** — Clear fraud pattern:
```
Amount: ₹3,00,000 | 6th transfer this hour | Balance: ₹3,10,000
→ VERY_HIGH_AMOUNT (+35) + VELOCITY_1H (+25) + NEAR_DRAIN (+20)
→ Score: 80 → 🚫 AUTO-BLOCKED (no AI needed)
```

---

## Stage 2: Gemini AI Analysis

When the rule-based score falls between **50-79** (the "grey zone"), the system sends transaction details to **Google Gemini AI** for a deeper, contextual analysis.

### What Gets Sent to Gemini

```
- Transaction amount
- Sender & receiver account IDs
- Sender's current balance
- Sender's account age
- Number of recent transactions
- Current timestamp
- Which rules were triggered and why
```

### What Gemini Returns

```json
{
  "verdict": "SAFE | SUSPICIOUS | FRAUDULENT",
  "confidence": 85,
  "explanation": "The high amount combined with a new account and late-night
                  timing suggests this could be an unauthorized transfer."
}
```

### How the AI Verdict Affects the Decision

| AI Verdict | Action | Score Adjustment |
|---|---|---|
| `SAFE` | ✅ Allow (flag for records) | No change |
| `SUSPICIOUS` | ⚠️ Flag + allow | +5 points |
| `FRAUDULENT` | 🚫 Block immediately | +15 points |

> **If the Gemini API key is not configured**, the system gracefully falls back to rule-based scoring only — it never crashes.

---

## Risk Level Classification

| Score Range | Risk Level | Action |
|---|---|---|
| 0 – 29 | 🟢 **Low** | Transaction proceeds normally, no alert created |
| 30 – 49 | 🟡 **Medium** | Transaction proceeds, but a FraudAlert is created for admin review |
| 50 – 79 | 🟠 **High** | Gemini AI consulted. Blocked if AI says `FRAUDULENT` |
| 80 – 100 | 🔴 **Critical** | Transaction **auto-blocked** instantly, admin emailed |

---

## What Happens When a Transaction is Blocked

```
1. ❌ Transaction is REJECTED (HTTP 403 response)
2. 📝 A FraudAlert document is saved to MongoDB with:
   - Risk score & level
   - Which rules triggered
   - AI analysis (if consulted)
   - Status: "flagged"
3. 📧 Email sent to all admin users with full alert details
4. 📊 Alert appears in admin dashboard
5. 💰 NO money moves — the ledger is untouched
```

### The blocked response looks like:

```json
{
  "success": false,
  "message": "Transaction blocked by fraud detection system",
  "fraud": {
    "alertId": "6848a1f2c3d4e5f6a7b8c9d0",
    "riskScore": 85,
    "riskLevel": "critical",
    "triggeredRules": [
      "VERY_HIGH_AMOUNT: ₹300000 exceeds ₹200000",
      "VELOCITY_1H: 6 transactions in last hour (limit: 5)",
      "NEAR_DRAIN: Would leave only 3.2% balance (threshold: 5%)"
    ],
    "aiAnalysis": null
  }
}
```

---

## Admin Fraud Management

Admins can monitor and manage fraud alerts through 3 dedicated API endpoints:

### 1. View All Alerts
```
GET /api/admin/fraud-alerts?status=flagged&riskLevel=critical&page=1&limit=20
```
Returns paginated, filterable list of all fraud alerts with full details.

### 2. Dashboard Statistics
```
GET /api/admin/fraud-alerts/stats
```
Returns:
```json
{
  "stats": {
    "totalAlerts": 47,
    "pendingReview": 12,
    "confirmedFraud": 8,
    "dismissed": 27,
    "criticalAlerts": 5,
    "highAlerts": 15,
    "last24hAlerts": 3,
    "totalBlockedAmount": 1250000
  }
}
```

### 3. Review an Alert
```
PATCH /api/admin/fraud-alerts/:id/review
Body: { "status": "confirmed_fraud", "reviewNotes": "User confirmed unauthorized" }
```
- **`dismissed`** — False alarm, no action needed
- **`confirmed_fraud`** — Real fraud → **automatically freezes the sender's account**

---

## File Architecture

```
src/
├── middleware/
│   └── fraudCheck.js          ← Intercepts transfers, blocks/flags
├── services/
│   └── fraudDetection.js      ← Rule engine + Gemini AI logic
├── models/
│   └── fraudAlert.model.js    ← Stores fraud alert records
├── controllers/
│   └── admin.controller.js    ← getFraudAlerts, getFraudStats, reviewFraudAlert
└── routes/
    ├── transaction.routes.js  ← fraudCheck added to POST / route
    └── admin.routes.js        ← 3 new fraud management routes
```

---

## Key Design Decisions

1. **Fraud check runs BEFORE the MongoDB transaction** — so blocked transactions never touch the ledger
2. **Gemini AI is only called for borderline cases** (score 50-79) — this saves API costs and keeps latency low for normal transfers
3. **Admin email alerts on critical blocks** — real-time awareness
4. **Confirmed fraud auto-freezes accounts** — immediate protection
5. **Graceful fallback** — if Gemini API is down or key is missing, rule-based scoring still works independently
