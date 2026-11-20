# API Reference

Base URL: `http://localhost:4000` (development)

All request/response bodies are JSON unless otherwise noted.

## Authentication

Endpoints marked `(auth)` require a valid JWT in the `Authorization: Bearer <token>` header.

Tokens are obtained via `/api/auth/login` or `/api/merchants/onboard` and expire after 12 hours.

---

## Merchant Management

### POST /api/merchants/onboard

Register a new merchant account and receive a JWT.

**Body:**
```json
{
  "name": "string (min 2)",
  "tradeLicense": "string (min 2)",
  "emirate": "string (min 2)",
  "category": "string (min 2)",
  "settlementPreference": "stablecoin | partner-fiat",
  "walletAddress": "string (valid Ethereum address)",
  "email": "string (valid email)",
  "password": "string (min 10)"
}
```

**Response (201):**
```json
{
  "merchantId": "string",
  "walletAddress": "string",
  "status": "testnet_active",
  "token": "JWT string"
}
```

**Errors:** 400 (invalid input), 409 (email already registered)

---

### POST /api/auth/login

Authenticate a merchant and receive a JWT.

**Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "token": "JWT string",
  "merchantId": "string",
  "name": "string"
}
```

**Errors:** 400 (invalid input), 401 (invalid credentials)

---

### GET /api/merchants/:id (auth)

Get merchant profile and payment statistics.

**Auth:** JWT required. Merchant can only access their own profile.

**Response (200):**
```json
{
  "merchant": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "walletAddress": "string",
    "status": "testnet_active",
    ...
  },
  "stats": {
    "paymentCount": number,
    "paidCount": number
  }
}
```

**Errors:** 401 (unauthenticated), 403 (forbidden - wrong merchant), 404 (not found)

---

## Payments

### POST /api/payments/create (auth)

Create an on-chain payment intent and generate a QR code.

**Auth:** JWT required. `merchantId` in body must match authenticated merchant.

**Body:**
```json
{
  "merchantId": "string",
  "amount": "string (regex: ^\\d+(\\.\\d{1,2})?$)",
  "description": "string (max 200)",
  "chain": "adi-testnet | polygon-amoy"
}
```

**Response (201):**
```json
{
  "paymentId": "bytes32 hex string",
  "qrCode": "data:image/png;base64,...",
  "qrPayload": {
    "paymentId": "string",
    "amount": "string",
    "currency": "AED",
    "merchant": "string",
    "network": "adi-testnet | polygon-amoy",
    "token": "mDDSC",
    "version": 1,
    "chainId": number,
    "url": "string"
  },
  "expiresAt": "ISO date string",
  "txHash": "0x...",
  "chain": "adi-testnet | polygon-amoy"
}
```

**Errors:** 400 (invalid input), 401 (unauthenticated), 403 (forbidden), 404 (merchant not found), 503 (chain not configured)

---

### GET /api/payments/:paymentId (auth optional)

Get payment status with independent on-chain verification.

**Query:** `?chain=adi-testnet|polygon-amoy` (default: adi-testnet)

**Response (200):**
```json
{
  "paymentId": "string",
  "status": "pending | paid | refunded | expired",
  "amount": "string",
  "settledAt": "ISO date string | null",
  "settlementMethod": "on-chain",
  "chain": "adi-testnet | polygon-amoy",
  "txHash": "0x... | null"
}
```

**Errors:** 400 (unsupported chain), 404 (payment not found)

---

### POST /api/payments/:paymentId/refund (auth)

Request a refund for a paid payment.

**Auth:** JWT required. Merchant must own the payment.

**Body:**
```json
{
  "reason": "string (min 3, max 500)",
  "chain": "adi-testnet | polygon-amoy"
}
```

**Response (200):**
```json
{
  "refundId": "0x...",
  "status": "submitted",
  "txHash": "0x..."
}
```

**Errors:** 400 (invalid input), 401 (unauthenticated), 403 (forbidden), 404 (not found), 503 (refund failed)

---

## Subscriptions

### POST /api/subscriptions/create (auth)

Returns 501 - customer-signed subscription creation is not exposed through this endpoint. Use the customer wallet flow.

**Response (501):**
```json
{
  "error": "Customer-signed subscription creation is not exposed through this merchant endpoint. Use the customer wallet flow; do not submit a customer private key to the API."
}
```

---

### GET /api/subscriptions (auth)

List subscriptions for a merchant.

**Query:** `?merchantId=string` (must match authenticated merchant)

**Response (200):**
```json
{
  "subscriptions": [...]
}
```

**Errors:** 401 (unauthenticated), 403 (forbidden)

---

### POST /api/subscriptions/:id/charge (auth)

Returns 501 - subscription charge automation not enabled in testnet package.

---

## Analytics

### GET /api/analytics/summary (auth)

Get payment statistics for a merchant.

**Query:** `?merchantId=string` (must match authenticated merchant)

**Response (200):**
```json
{
  "totalVolume": "string",
  "txCount": number,
  "avgTicket": "string",
  "topMerchants": []
}
```

**Errors:** 401 (unauthenticated), 403 (forbidden)

---

## Webhooks

### POST /api/webhooks/chain

Receive chain event notifications with HMAC authentication.

**Headers:**
- `x-webhook-signature`: HMAC-SHA256 hex digest of request body using `WEBHOOK_SECRET`

**Body:**
```json
{
  "eventId": "string (min 8 chars)",
  "event": "PaymentSettled | PaymentRefunded",
  "paymentId": "string",
  "chain": "adi-testnet | polygon-amoy"
}
```

**Response (200):**
```json
{
  "accepted": true,
  "eventId": "string",
  "duplicate": true | false (optional, only on replay)
}
```

**Errors:** 401 (invalid signature), 400 (invalid payload), 503 (secret not configured)

**Security:** 
- HMAC compared using `crypto.timingSafeEqual` (timing-safe)
- Duplicate event IDs rejected (idempotent)
- Payment state is NOT updated by webhook; verified independently via RPC

---

## Health

### GET /health

**Response (200):**
```json
{
  "status": "ok",
  "service": "stablecoin-gateway-api",
  "networks": [
    {"key": "adi-testnet", "chainId": 99999},
    {"key": "polygon-amoy", "chainId": 80002}
  ]
}
```

---

## Security Notes

- No payment success is ever accepted from frontend claims
- All payment status is verified against on-chain contract state
- Webhook notifications are informational only; they do not change payment state
- Private keys are never transmitted in API requests or responses
- JWT secrets and webhook secrets are server-only environment variables
