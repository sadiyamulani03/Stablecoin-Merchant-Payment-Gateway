# Test and acceptance checklist

## Automated checks
- `cd contracts && forge build && forge test -vvv`
- `npm run typecheck`
- `npm test`
- `npm run build`

## Manual dual-testnet acceptance
1. Deploy contracts separately to ADI AB Testnet and Polygon Amoy.
2. Confirm each deploy script reports its expected chain ID and save the three addresses.
3. Configure backend and frontend address variables independently for both networks.
4. Start MongoDB, backend, and frontend.
5. Register a merchant with a test wallet address.
6. Create one payment intent on each network.
7. Open each QR payment page, connect a wallet, switch to the correct network, approve mDDSC, and pay.
8. Verify PaymentRouter state and token balances on each explorer.
9. Confirm the API returns `paid` after independent RPC verification.
10. Test expiry, duplicate payment rejection, unsupported token rejection, and fee cap through Foundry tests.

## Expected constraints
- A payment intent requires a configured backend testnet signer and deployed contracts.
- A customer needs test gas and mDDSC on the same network.
- Refund requires the backend owner wallet to hold enough mock token and approve PaymentRouter; it does not reverse the original merchant transfer automatically.
- Subscription creation is customer-signed and escrow-funded; periodic charges are not autonomous and backend charge automation is intentionally disabled.
