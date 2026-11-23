# Demonstration Guide

This document provides a step-by-step demonstration script for the Stablecoin Merchant Payment Gateway on both testnets.

## Prerequisites

1. Contracts deployed to both testnets (see `docs/DEPLOYMENT.md`)
2. Backend and frontend running locally
3. Contract addresses configured in `.env` and `frontend/.env.local`
4. Test wallets with testnet gas tokens and mDDSC
5. MySQL running

## Demo 1: Complete Payment Flow (ADI AB Testnet)

### Part A: Merchant Creates Payment

1. Open `http://localhost:3000/register`
2. Register a merchant account (name, email, password, wallet address)
3. Save the JWT token and merchantId from the response
4. Open `http://localhost:3000/login` and sign in
5. Navigate to "Create payment"
6. Enter amount (e.g., 25.00) and description
7. Select "ADI Network AB Testnet" (Chain ID 99999)
8. Click "Create payment & QR"
9. Record the paymentId and QR code

### Part B: Customer Pays

1. Open the customer payment page: `http://localhost:3000/pay/<paymentId>?chain=adi-testnet`
2. Connect an EVM wallet (MetaMask)
3. Switch wallet to ADI AB Testnet (Chain ID 99999)
4. Verify wallet has ADI for gas and mDDSC for payment
5. Click "Connect wallet & pay"
6. Approve token spending when prompted
7. Confirm the payment transaction
8. Wait for "Payment confirmed on-chain" message

### Part C: Verify Settlement

1. Merchant refreshes dashboard or calls `GET /api/payments/<paymentId>?chain=adi-testnet`
2. Verify status shows "paid"
3. Verify transaction hash matches the on-chain transaction
4. Open explorer link: `https://explorer.ab.testnet.adifoundation.ai/tx/<txHash>`

## Demo 2: Complete Payment Flow (Polygon Amoy)

Repeat Demo 1 with Polygon Amoy (Chain ID 80002).

1. Select "Polygon Amoy" when creating payment
2. Customer switches wallet to Polygon Amoy
3. Customer pays with mDDSC and POL for gas
4. Verify settlement on `https://amoy.polygonscan.com/`

## Demo 3: Refund Flow

1. Complete a successful payment (Demo 1 or 2)
2. Merchant calls `POST /api/payments/<paymentId>/refund`
3. Provide reason and chain
4. Verify refund transaction on-chain
5. Verify payment status shows "refunded"
6. Verify customer received mDDSC back

## Demo 4: Subscription Management

1. Customer opens `/subscriptions`
2. Connect wallet on selected network
3. Enter merchant address, amount per period, period, initial top-up
4. Approve token spending to SubscriptionManager
5. Confirm subscription creation
6. Record subscription ID
7. Merchant calls `charge()` on-chain when due
8. Verify merchant receives amount minus fee
9. Customer cancels subscription
10. Verify remaining escrow refunded to customer

## Demo 5: Edge Cases

### Unsupported Token
- Create payment intent with unsupported token address
- Verify contract reverts with "unsupported token"

### Double Payment
- Pay the same paymentId twice
- Verify second payment reverts with "not payable"

### Expired Intent
- Create payment, wait 1 hour (or warp time in tests)
- Attempt payment
- Verify contract reverts with "intent expired"

### Insufficient Balance
- Customer attempts payment with insufficient mDDSC
- Verify transaction reverts

### Invalid Amount
- Attempt to create payment with amount 0
- Verify API returns 400 validation error

## Verification Checklist

- [] Merchant can register and login
- [] Payment intent created on correct chain
- [] QR code generated and scannable
- [] Customer wallet connects and switches network
- [] Token approval executed
- [] Payment transaction confirmed on-chain
- [] Backend verifies transaction independently
- [] Payment status updated to "paid"
- [] Transaction history shows actual txHash
- [] Explorer link works
- [] Refund processed correctly
- [] Subscription created and charged
- [] Subscription cancelled with refund
- [] Edge cases all revert as expected
