# Architecture

## System Overview

The Stablecoin Merchant Payment Gateway is a full-stack application with three layers: smart contracts, backend API, and frontend application.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND LAYER                                │
│  (Next.js 16 App Router, React, Tailwind CSS, ethers.js v6)            │
│                                                                         │
│  /              Merchant landing page                                   │
│  /register      Merchant onboarding                                     │
│  /login         Merchant authentication                                 │
│  /dashboard     Merchant workspace with analytics                       │
│  /payments/new  Payment intent creation + QR generation                │
│  /pay/[id]      Customer checkout with wallet integration              │
│  /subscriptions Subscription management                                │
│  /settings      Merchant configuration                                  │
│  /api-docs      API documentation                                       │
└─────────────────────────────────────────────────────────────────────────┘
                              │ HTTPS/JSON
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND LAYER                                 │
│  (Fastify, TypeScript, ethers.js v6, MySQL 8 + Prisma ORM)               │
│                                                                         │
│  Authentication:  JWT via @fastify/jwt                                  │
│  Validation:      Zod schemas                                           │
│  Database:        MySQL 8 (Prisma) (Merchant, Payment, Subscription, WebhookEvent)│
│  Blockchain:      ethers.js v6 (JsonRpcProvider, Wallet, Contract)     │
│  QR Generation:   qrcode library                                        │
│                                                                         │
│  Routes:                                                                    │
│  POST /api/merchants/onboard    - Register merchant + JWT              │
│  POST /api/auth/login           - Merchant login + JWT                 │
│  GET  /api/merchants/:id        - Merchant profile (auth)              │
│  POST /api/payments/create      - Create on-chain payment intent (auth)│
│  GET  /api/payments/:paymentId  - Verify payment status (on-chain)     │
│  POST /api/payments/:paymentId/refund - Request refund (auth)          │
│  POST /api/subscriptions/create - Create subscription (customer wallet)│
│  GET  /api/subscriptions        - List subscriptions (auth)            │
│  POST /api/subscriptions/:id/charge - Charge subscription (not enabled)│
│  GET  /api/analytics/summary    - Merchant payment stats (auth)        │
│  POST /api/webhooks/chain       - HMAC-authenticated webhook           │
│  GET  /health                   - Health check                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │ JSON-RPC / HTTP
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           BLOCKCHAIN LAYER                              │
│  ADI AB Testnet (99999)                    Polygon Amoy (80002)         │
│  ─────────────────                    ─────────────────                 │
│  MockDDSC                                  MockDDSC                      │
│  PaymentRouter                             PaymentRouter                 │
│  SubscriptionManager                       SubscriptionManager           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Payment Creation

1. Merchant authenticates via JWT
2. Frontend calls `POST /api/payments/create` with amount, chain, merchantId
3. Backend validates merchant ownership, calls `createOnchainIntent()`
4. `createOnchainIntent()` calls `PaymentRouter.createIntent()` on-chain
5. Contract emits `PaymentCreated` event, returns paymentId and txHash
6. Backend persists payment record to MySQL with status "pending"
7. Backend returns QR code payload to frontend
8. Frontend displays QR code to customer

### Payment Execution (Customer)

1. Customer opens `/pay/[paymentId]?chain=...`
2. Frontend fetches payment details from backend
3. Customer connects EVM wallet, switches to correct network
4. Customer approves mDDSC spending to PaymentRouter
5. Customer calls `router.pay(paymentId, token)`
6. Transaction is mined on-chain
7. Frontend polls backend `GET /api/payments/[paymentId]`
8. Backend calls `getOnchainPayment()` to verify status from contract
9. If on-chain status is Paid, backend updates MySQL and returns "paid"

### Refund

1. Merchant authenticates, calls `POST /api/payments/[id]/refund`
2. Backend verifies merchant owns the payment
3. Backend calls `submitRefund()` which calls `router.refund()` on-chain
4. Owner wallet (deployer) transfers funds back to customer
5. Backend updates payment status to "refunded"

## Database Schema

### Merchant
- name, tradeLicense, emirate, category, settlementPreference
- walletAddress, email (unique), passwordHash (bcrypt)
- status (pending_kyc, testnet_active, suspended)
- timestamps

### Payment
- paymentId, chain, merchantId (ref Merchant)
- amount, description, tokenAddress
- status (pending, paid, refunded, expired)
- txHash, customerAddress, expiresAt, settledAt
- Index: {paymentId: 1, chain: 1} unique

### Subscription
- subscriptionId, chain, merchantId (ref Merchant)
- customerAddress, amountPerPeriod, periodSeconds
- nextChargeAt, status
- Index: {subscriptionId: 1, chain: 1} unique

### WebhookEvent
- eventId (unique), payloadHash
- timestamps

## Security Architecture

- JWT authentication for all merchant mutation endpoints
- Merchant ID ownership verification on all merchant-scoped resources
- Webhook HMAC-SHA256 with timing-safe comparison
- Webhook replay protection via unique eventId persistence
- On-chain verification: payment status never set from frontend claims
- Contract-level: Ownable access control, ReentrancyGuard, CEI pattern
