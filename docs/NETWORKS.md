# Testnet configuration

## ADI Network AB Testnet
- Chain ID: 99999
- RPC: https://rpc.ab.testnet.adifoundation.ai/
- Native token: ADI
- Explorer: https://explorer.ab.testnet.adifoundation.ai/
- Faucet: https://faucet.ab.testnet.adifoundation.ai/

## Polygon Amoy
- Chain ID: 80002
- RPC: https://rpc-amoy.polygon.technology/
- Native token: POL (wallets/docs may still label old faucet balances MATIC)
- Explorer: https://amoy.polygonscan.com/
- Faucet: https://faucet.polygon.technology/

Deployments are independent. Deploy the full contract suite on each chain and set that chain's addresses in both backend `.env` and frontend `.env.local`.

## Current deployments

Both chains run independently deployed instances of the same contract suite. The addresses below are
public on-chain data and are also recorded in `contracts/broadcast/`.

| Contract | ADI AB Testnet (99999) | Polygon Amoy (80002) |
|---|---|---|
| MockDDSC (token, 2 decimals) | `0x06289D9c452369abcb9bc1b5D6Adf80982C5679C` | `0x06289D9c452369abcb9bc1b5D6Adf80982C5679C` |
| PaymentRouter | `0x18108f9E50159200782294c54186a4c67cF2Af54` | `0x18108f9E50159200782294c54186a4c67cF2Af54` |
| SubscriptionManager | `0xE89c39aB06F0290CAf555259ed8aE65C40E7AcEE` | `0xE89c39aB06F0290CAf555259ed8aE65C40E7AcEE` |

Backend environment variables that carry these values:

| Contract | Backend variable | Frontend variable |
|---|---|---|
| MockDDSC | `ADI_TESTNET_TOKEN_ADDRESS` / `POLYGON_AMOY_TOKEN_ADDRESS` | `NEXT_PUBLIC_ADI_TOKEN_ADDRESS` / `NEXT_PUBLIC_POLYGON_TOKEN_ADDRESS` |
| PaymentRouter | `ADI_TESTNET_PAYMENT_ROUTER_ADDRESS` / `POLYGON_AMOY_PAYMENT_ROUTER_ADDRESS` | `NEXT_PUBLIC_ADI_ROUTER_ADDRESS` / `NEXT_PUBLIC_POLYGON_ROUTER_ADDRESS` |
| SubscriptionManager | `ADI_TESTNET_SUBSCRIPTION_MANAGER_ADDRESS` / `POLYGON_AMOY_SUBSCRIPTION_MANAGER_ADDRESS` | `NEXT_PUBLIC_ADI_SUBSCRIPTION_MANAGER_ADDRESS` / `NEXT_PUBLIC_POLYGON_SUBSCRIPTION_MANAGER_ADDRESS` |

## RPC endpoints and credentials

`ADI_TESTNET_RPC_URL` uses the public ADI endpoint and carries no credential.
`POLYGON_AMOY_RPC_URL` normally points at a provider URL that embeds an API key
(for example an Alchemy app key). Treat it as a secret: keep it in the backend `.env` only, mark
it `sync: false` in `render.yaml`, and never commit it. Rotate the key before sharing the
repository or deploying to a hosted platform.

## Administrative controls

`PaymentRouter` and `SubscriptionManager` are OpenZeppelin `Ownable` contracts. The current owner is
the deployer account. Ownership transfer is **single-step and immediate** (`transferOwnership`), so
verify the destination address before broadcasting. `PaymentRouter` exposes `setTreasury` and
`setSupportedToken`; `SubscriptionManager` exposes `setFee` and `setSupportedToken` but has **no
`setTreasury`**, so its treasury address is fixed at construction. `MockDDSC` has no owner and its
`mint` function is intentionally unrestricted on testnets.
