# Stablecoin Merchant Payment Gateway

A dual-testnet merchant payment gateway for accepting blockchain-based stablecoin payments. Built for the ADI AB Testnet (Chain ID 99999) and Polygon Amoy Testnet (Chain ID 80002).

## Product Overview

The Stablecoin Merchant Payment Gateway enables merchants to accept blockchain-based payments using test stablecoins (mDDSC) on two testnets. Merchants can create payment intents, generate QR codes, and track settlement. Customers can pay from their EVM wallets with network switching, token approval, and on-chain confirmation.

## Problem Statement

Merchants need a simple, secure way to accept stablecoin payments on blockchain testnets. Existing solutions are often complex, require smart contract interaction knowledge, or lack proper merchant/customer separation. This project provides a complete, tested payment gateway with merchant dashboard, customer checkout, and backend verification.

## Solution

A full-stack application with:

- **Smart Contracts** (Solidity 0.8.28, Foundry): MockDDSC token, PaymentRouter, SubscriptionManager with access control, reentrancy protection, and replay protection.
- **Backend** (Fastify, TypeScript, ethers.js v6, MySQL 8 + Prisma ORM): JWT authentication, payment intent management, on-chain transaction verification, webhook HMAC authentication, idempotent processing.
- **Frontend** (Next.js 16 App Router, React, Tailwind CSS): Merchant dashboard, payment creation, QR codes, customer checkout with wallet integration.

## Architecture

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   Frontend      │      │    Backend      │      │   Smart         │
│  (Next.js)      │◄────►│   (Fastify)     │◄────►│   Contracts     │
│                 │      │                 │      │   (Foundry)     │
└─────────────────┘      └─────────────────┘      └─────────────────┘
       │                        │                        │
       │                        │                        │
       ▼                        ▼                        ▼
   LocalStorage           MySQL (Prisma)         ADI (99999) / Amoy (80002)
   (JWT token)            (Merchants,             MockDDSC, PaymentRouter,
                        Payments,                SubscriptionManager
                        WebhookEvents)
```

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Smart Contracts | Solidity | 0.8.28 |
| Smart Contract Framework | Foundry | 1.9.0 |
| Smart Contract Library | OpenZeppelin Contracts | 5.x |
| Backend | Fastify | 5.x |
| Backend Language | TypeScript | 5.7.x |
| Backend Ethereum | ethers.js | 6.x |
| Database | MySQL 8 / Prisma ORM | 8.x |
| Frontend | Next.js App Router | 16.x |
| Frontend Language | TypeScript | 5.7.x |
| Frontend Ethereum | ethers.js | 6.x |
| Styling | Tailwind CSS | 4.x |
| Testing | Vitest | 5.x |

## Supported Testnets

| Network | Chain ID | Hex | RPC | Explorer |
|---------|----------|-----|-----|----------|
| ADI AB Testnet | 99999 | 0x1869f | https://rpc.ab.testnet.adifoundation.ai/ | https://explorer.ab.testnet.adifoundation.ai/ |
| Polygon Amoy | 80002 | 0x13882 | https://rpc-amoy.polygon.technology/ | https://amoy.polygonscan.com/ |

## Smart Contract Design

### MockDDSC
Test-only ERC-20 token with 2 decimals. Unrestricted mint for testnet use only. NOT a real stablecoin.

### PaymentRouter
- Creates single-use payment intents with unique payment IDs
- Customers pay with approved tokens; merchant receives principal minus fee
- Treasury receives platform fee (configurable, max 500 bps)
- Owner can refund within 30-day window
- ReentrancyGuard on pay/refund
- Checks-Effects-Interactions pattern

### SubscriptionManager
- Pre-funded recurring payment escrow
- Customer creates subscription with initial top-up
- Merchant charges when due (manual, not autonomous)
- Customer can topUp, pause, resume, cancel
- Cancel refunds remaining escrow balance

## Payment Flow

1. Merchant logs in and creates a payment intent (amount, description, chain)
2. Backend creates on-chain intent via PaymentRouter.createIntent()
3. Backend generates QR code with payment details
4. Customer scans QR or opens payment link
5. Customer connects wallet, switches to correct network
6. Customer approves token spending to PaymentRouter
7. Customer executes PaymentRouter.pay()
8. Backend verifies transaction on-chain (receipt + events)
9. Payment status updated to "paid" only after on-chain confirmation

## API Reference

See `docs/API.md` for complete endpoint documentation.

## Setup Instructions

### Prerequisites
- Node.js 22+
- Foundry (foundryup)
- MySQL 8+ (or Docker)

### Installation

```bash
# Clone repository
cd /path/to/stablecoin-gateway-dual-testnet/stablecoin-gateway

# Install dependencies
npm install

# Install Solidity dependencies
cd contracts
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
cd ..

# Configure environment
cp .env.example .env
# Edit .env with your private keys, secrets, and RPC URLs
```

### Compile and Test Contracts

```bash
cd contracts
forge build
forge test -vvv
cd ..
```

### Run Tests

```bash
# Backend
npm run test --workspace backend

# Frontend
npm run test --workspace frontend

# All
npm test
```

### Typecheck

```bash
npm run typecheck
```

### Build

```bash
npm run build
```

### Local Development

```bash
# Terminal 1: MySQL
docker compose -f infra/docker-compose.yml up -d mysql

# Terminal 2: Backend
npm run dev --workspace backend

# Terminal 3: Frontend
npm run dev --workspace frontend
```

Backend: http://localhost:4000/health  
Frontend: http://localhost:3000

### Hosting Deployment (Render + Vercel)

For the public testnet demonstration, the frontend is hosted on Vercel, the API on Render, and the
database on MySQL 8. Exact dashboard settings, build/start commands, the full environment
variable split (public vs. secret), and the deployment verification checklist are documented in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#hosting-deployment-render--vercel).
The Render service settings are also encoded as a Blueprint in `render.yaml`.

## Deployment

### Deploy to ADI AB Testnet (99999)

```bash
cd contracts
source ../.env
DEPLOYER_PRIVATE_KEY="$ADI_TESTNET_PRIVATE_KEY" \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$ADI_TESTNET_RPC_URL" \
    --broadcast \
    --chain-id 99999
```

### Deploy to Polygon Amoy (80002)

```bash
cd contracts
source ../.env
DEPLOYER_PRIVATE_KEY="$POLYGON_AMOY_PRIVATE_KEY" \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$POLYGON_AMOY_RPC_URL" \
    --broadcast \
    --chain-id 80002
```

Save deployment addresses separately for each network. Do not mix addresses between networks.

### Configure Backend

Fill in contract addresses in `.env`:
```
ADI_TESTNET_TOKEN_ADDRESS=0x...
ADI_TESTNET_PAYMENT_ROUTER_ADDRESS=0x...
ADI_TESTNET_SUBSCRIPTION_MANAGER_ADDRESS=0x...
POLYGON_AMOY_TOKEN_ADDRESS=0x...
POLYGON_AMOY_PAYMENT_ROUTER_ADDRESS=0x...
POLYGON_AMOY_SUBSCRIPTION_MANAGER_ADDRESS=0x...
```

### Configure Frontend

Copy `frontend/.env.example` to `frontend/.env.local` and fill in public contract addresses.

## Environment Variables

See `.env.example` for all required variables. Never commit real private keys or secrets.

## Testing

### Smart Contract Tests
18 Foundry tests covering payment splitting, double-spend protection, expiry, fee caps, refund authorization, subscription charging/cancellation, and access control.

### Backend Tests
Vitest tests covering chain configuration, authentication, merchant isolation, webhook security, and Prisma schema validation.

### Frontend Tests
Vitest tests covering frontend chain configuration.

## Limitations

- MockDDSC is a test token only, not a real stablecoin
- Subscription charge automation is not enabled (manual merchant charge only)
- Backend charge automation requires explicit customer authorization
- No KYC/AML integration
- No ERC-4337 account abstraction

## Security

- JWT authentication for all merchant operations
- Merchant isolation (merchants can only access their own data)
- Webhook HMAC-SHA256 authentication with timing-safe comparison
- Webhook replay protection via unique event IDs
- On-chain verification (never trust frontend payment claims)
- ReentrancyGuard on all state-changing contract functions
- Checks-Effects-Interactions pattern

See `docs/SECURITY.md` for details.

## License

MIT
