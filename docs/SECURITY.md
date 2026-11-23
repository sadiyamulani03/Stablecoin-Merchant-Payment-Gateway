# Security

## Authentication

### JWT Authentication
- All merchant mutation endpoints require a valid JWT
- JWT issued on merchant registration (`/api/merchants/onboard`) and login (`/api/auth/login`)
- JWT expires after 12 hours
- JWT secret must be at least 32 characters in production
- JWT secret is server-only; never exposed to frontend

### Merchant Isolation
- Every merchant-scoped endpoint verifies `merchantId` ownership
- Merchants can only access their own payments, subscriptions, and profile
- Cross-merchant access returns 403 Forbidden

## Smart Contract Security

### Access Control
- `Ownable` pattern on PaymentRouter and SubscriptionManager
- Only owner can: set supported tokens, set fee, set treasury, refund
- Only customer can: topUp, pause, resume, cancel subscription
- Only merchant can: charge subscription

### Reentrancy Protection
- `ReentrancyGuard` on all state-changing functions: `pay`, `refund`, `createSubscription`, `charge`, `topUp`, `cancel`
- `nonReentrant` modifier is the first modifier on functions where applicable

### Checks-Effects-Interactions
- State updated before external token transfers
- Payment status set to Paid before token transfer
- Subscription balance updated before token transfer

### Replay and Double-Spend Protection
- Payment ID includes nonce to ensure uniqueness
- Payment status checked before pay (must be "Created")
- Payment status set to "Paid" immediately after check, before transfer
- Refund status checked before refund (must be "Paid")
- Refund status set to "Refunded" immediately, preventing double refund

### Fee Protection
- `MAX_FEE_BPS = 500` (5%) cap on platform fees
- Fee changes are owner-only
- Fee cannot exceed cap on setFee()

### Token Security
- MockDDSC uses OpenZeppelin ERC20 with SafeERC20
- `safeTransferFrom` and `safeTransfer` used for all token movements
- Zero address checks on all address parameters

## Webhook Security

### HMAC Authentication
- All webhook requests require `x-webhook-signature` header
- Signature is HMAC-SHA256 of request body using `WEBHOOK_SECRET`
- Comparison uses `crypto.timingSafeEqual()` to prevent timing attacks

### Replay Protection
- Each webhook event has a unique `eventId`
- Event IDs are persisted in MySQL with a unique constraint
- Duplicate event IDs return idempotent response (no state change)
- Webhook does NOT update payment state; payment state is verified independently via RPC

## Transaction Verification

### Never Trust Frontend
- Payment success is NEVER accepted from frontend-provided data
- Backend independently queries the smart contract via RPC
- Verifies: transaction hash, receipt status, expected chain, expected contract, expected payment event
- Only on-chain confirmed transactions update payment status to "paid"

### RPC Verification
- `getOnchainPayment()` calls `PaymentRouter.getPayment()` directly
- Compares payment ID, amount, token, and status
- Failed, reverted, or missing transactions are never marked as paid

## Environment Security

### Secrets Management
- `JWT_SECRET`: Server-only, minimum 32 characters
- `WEBHOOK_SECRET`: Server-only, long random value
- `ADI_TESTNET_PRIVATE_KEY`: Server-only, deployer key for ADI
- `POLYGON_AMOY_PRIVATE_KEY`: Server-only, deployer key for Amoy
- `DATABASE_URL`: Server-only database connection string
- None of these are exposed in frontend bundle or API responses

### .env Handling
- `.env.example` committed with placeholders only
- `.env` is gitignored and never committed
- Frontend uses `NEXT_PUBLIC_*` prefixed variables (public contract addresses only)
- No private keys or server secrets in frontend environment variables

## Known Limitations

- MockDDSC has unrestricted mint (testnet only)
- Subscription charge automation not enabled (requires explicit customer authorization)
- No KYC/AML integration
- No ERC-4337 account abstraction
- No rate limiting on public endpoints (health, webhook)

## Security Contact

Report security issues through the project's issue process. Do not disclose publicly until reviewed.
