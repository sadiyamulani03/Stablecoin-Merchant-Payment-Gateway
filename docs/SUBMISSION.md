# Hackathon Submission

## Project Name

Stablecoin Merchant Payment Gateway

## Short Description

A dual-testnet merchant payment gateway enabling merchants to accept blockchain-based stablecoin payments with QR codes, wallet integration, and on-chain verification. Deployed independently on ADI AB Testnet (99999) and Polygon Amoy (80002).

## Problem

Merchants need a simple, secure way to accept stablecoin payments on blockchain networks. Existing solutions require deep smart contract knowledge, lack merchant/customer separation, or don't provide independent on-chain verification of payments.

## Solution

A complete full-stack payment gateway with:

1. **Merchant Dashboard** - Register, login, create payments, view analytics
2. **Customer Checkout** - Connect wallet, switch network, approve tokens, pay
3. **On-Chain Verification** - Backend independently verifies every payment against smart contract state
4. **Dual-Testnet Support** - Independent deployments on ADI AB Testnet and Polygon Amoy
5. **Refund and Subscription** - Owner-administered refunds, customer-managed subscription escrow

## Innovation

- **Independent on-chain verification**: Backend never trusts frontend payment claims; every payment is verified against smart contract state via RPC
- **Dual-network isolation**: Completely separate contract deployments and configurations per testnet
- **QR-first design**: Merchants generate QR codes; customers scan and pay from their wallets
- **Testnet-first MVP**: Built specifically for testnet demonstration with mock tokens

## Technical Implementation

### Smart Contracts (Solidity 0.8.28 + Foundry)
- MockDDSC: Test ERC-20 token (2 decimals)
- PaymentRouter: Payment intents, settlement, fees, refunds with access control and reentrancy protection
- SubscriptionManager: Pre-funded escrow, customer-managed lifecycle

### Backend (Fastify + TypeScript + ethers.js v6)
- JWT authentication, Zod validation, MySQL / Prisma persistence
- On-chain transaction verification (receipt + events)
- Webhook HMAC-SHA256 with timing-safe comparison and replay protection

### Frontend (Next.js 16 App Router + React + Tailwind)
- Merchant onboarding/login/dashboard
- Customer payment page with wallet connection and network switching
- QR code generation and display

## Blockchain Integration

- Two independent testnet deployments
- Chain ID validation (99999 and 80002 only)
- Contract addresses configured per network
- Event verification via contract reads
- Transaction receipt verification

## Target Audience

- Merchants wanting to accept stablecoin payments on testnets
- Developers building payment applications on EVM testnets
- Businesses piloting blockchain payments before mainnet

## Demonstration Steps

1. Register as merchant at `/register`
2. Login at `/login`
3. Create payment at `/payments/new` (select network, enter amount)
4. View QR code and share with customer
5. Customer opens `/pay/[paymentId]?chain=[network]`
6. Customer connects wallet, switches network, approves tokens, pays
7. Verify payment status on merchant dashboard
8. Test refund via `/api/payments/[id]/refund`
9. Test subscription via `/subscriptions`

## Deployed Contract Links

Contracts deployed per testnet. Addresses saved in `.env` and `frontend/.env.local`.

- ADI AB Testnet (99999): See deployment output
- Polygon Amoy (80002): See deployment output

## Live Application

Backend: http://localhost:4000/health  
Frontend: http://localhost:3000

## Limitations

- MockDDSC is a test token only, not real money
- Polygon Amoy RPC connectivity dependent on network access
- Subscription charge automation requires explicit customer authorization
- No KYC/AML or production-grade security audit
