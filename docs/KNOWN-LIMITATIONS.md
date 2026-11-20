# Included and not yet integrated

This ZIP provides an executable testnet-oriented baseline for dual-chain payments, but it is not a production-complete regulated payments product.

Not implemented/activated in this package:
- ERC-4337 BaseAccount/SmartAccount, passkey/Web3Auth integration, or a gas sponsorship Paymaster.
- Real DDSC or AE Coin token contracts; only testnet mDDSC is deployed by the provided script.
- Jumio/Onfido KYC, Twilio SMS, Envio indexing, licensed fiat settlement, bridge, or partner bank integrations.
- Production Auth.js session integration; merchant API authentication uses JWT and bcrypt.
- Merchant periodic charge automation and automated webhook event delivery. Subscription escrow creation is customer-signed; the contract requires the merchant to call `charge` when due.
- Full Arabic RTL layout and production translation workflow; starter English/Arabic message dictionaries are included.

The testnet refund path requires the admin signer to hold and approve the full refund amount. This is not a chargeback/reversal of the merchant's original transfer. Treat refunds as a separate treasury-funded test operation.
