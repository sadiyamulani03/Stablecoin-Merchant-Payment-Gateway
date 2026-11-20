const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim();

export const API_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/+$/, "")
  : process.env.NODE_ENV === "production"
    ? ""
    : "http://localhost:4000";

export const API_URL_CONFIGURED = API_URL.length > 0;

export const NETWORKS = {
  "adi-testnet": {
    name: "ADI Network AB Testnet",
    shortName: "ADI Testnet",
    chainId: 99999,
    chainHex: "0x1869f",
    rpc: "https://rpc.ab.testnet.adifoundation.ai/",
    explorer: "https://explorer.ab.testnet.adifoundation.ai/",
    currency: "ADI"
  },
  "polygon-amoy": {
    name: "Polygon Amoy",
    shortName: "Polygon Amoy",
    chainId: 80002,
    chainHex: "0x13882",
    rpc: "https://rpc-amoy.polygon.technology/",
    explorer: "https://amoy.polygonscan.com/",
    currency: "POL"
  }
} as const;

export type ChainKey = keyof typeof NETWORKS;

export const CHAIN_KEYS = Object.keys(NETWORKS) as ChainKey[];

export function getChain(search: string | null): ChainKey {
  return search === "polygon-amoy" ? "polygon-amoy" : "adi-testnet";
}

export const TOKEN_SYMBOL = "mDDSC";
export const TOKEN_DECIMALS = 2;

export const ROUTER_ABI = [
  "function pay(bytes32 paymentId,address token)",
  "function getPayment(bytes32 paymentId) view returns (address merchant,address customer,address token,uint128 amount,uint64 createdAt,uint64 paidAt,uint8 status)",
  "function payments(bytes32 paymentId) view returns (address merchant,address customer,address token,uint128 amount,uint64 createdAt,uint64 paidAt,uint8 status)",
  "function INTENT_TTL() view returns (uint256)",
  "function feeBps() view returns (uint256)",
  "event PaymentCreated(bytes32 indexed paymentId,address indexed merchant,uint256 amount,address token,uint256 expiresAt)",
  "event PaymentSettled(bytes32 indexed paymentId,address indexed merchant,uint256 merchantAmount,uint256 feeAmount)",
  "event PaymentRefunded(bytes32 indexed paymentId,address indexed customer,uint256 amount)"
];

export const TOKEN_ABI = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function symbol() view returns (string)"
];

export const SUBSCRIPTION_ABI = [
  "function createSubscription(address merchant,address token,uint256 amountPerPeriod,uint256 period,uint256 initialTopUp,uint256 maxHeld) returns (bytes32)",
  "function charge(bytes32 subId)",
  "function topUp(bytes32 subId,uint256 amount)",
  "function pause(bytes32 subId)",
  "function resume(bytes32 subId)",
  "function cancel(bytes32 subId)",
  "function subscriptions(bytes32 subId) view returns (address customer,address merchant,address token,uint128 amountPerPeriod,uint128 balance,uint64 period,uint64 nextChargeAt,uint8 status)",
  "function MIN_PERIOD() view returns (uint256)",
  "event SubscriptionCreated(bytes32 indexed subId,address indexed customer,address indexed merchant,uint256 amount,uint256 nextChargeAt)",
  "event SubscriptionCharged(bytes32 indexed subId,uint256 amount,uint256 fee)",
  "event SubscriptionToppedUp(bytes32 indexed subId,uint256 amount,uint256 balance)",
  "event SubscriptionStatusChanged(bytes32 indexed subId,uint8 status)",
  "event SubscriptionCancelled(bytes32 indexed subId,uint256 refunded)"
];

export const DEPLOYMENTS = {
  "adi-testnet": {
    token: process.env.NEXT_PUBLIC_ADI_TOKEN_ADDRESS || "",
    router: process.env.NEXT_PUBLIC_ADI_ROUTER_ADDRESS || "",
    subscriptions: process.env.NEXT_PUBLIC_ADI_SUBSCRIPTION_MANAGER_ADDRESS || ""
  },
  "polygon-amoy": {
    token: process.env.NEXT_PUBLIC_POLYGON_TOKEN_ADDRESS || "",
    router: process.env.NEXT_PUBLIC_POLYGON_ROUTER_ADDRESS || "",
    subscriptions: process.env.NEXT_PUBLIC_POLYGON_SUBSCRIPTION_MANAGER_ADDRESS || ""
  }
} as const;

export const DEPLOYMENT_ADDRESSES_MISSING = (
  Object.values(DEPLOYMENTS) as readonly { token: string; router: string; subscriptions: string }[]
).some((deployment) => !deployment.token || !deployment.router || !deployment.subscriptions);
