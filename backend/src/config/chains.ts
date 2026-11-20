import dotenv from "dotenv";
dotenv.config({path: process.env.ENV_FILE || "../.env"});
dotenv.config();

export const CHAINS = {
  "adi-testnet": {
    key: "adi-testnet", name: "ADI Network AB Testnet", chainId: 99999,
    rpcUrl: process.env.ADI_TESTNET_RPC_URL || "https://rpc.ab.testnet.adifoundation.ai/",
    explorer: "https://explorer.ab.testnet.adifoundation.ai/", nativeCurrency: "ADI",
    tokenAddress: process.env.ADI_TESTNET_TOKEN_ADDRESS || "",
    routerAddress: process.env.ADI_TESTNET_PAYMENT_ROUTER_ADDRESS || "",
    subscriptionsAddress: process.env.ADI_TESTNET_SUBSCRIPTION_MANAGER_ADDRESS || "",
    privateKey: process.env.ADI_TESTNET_PRIVATE_KEY || ""
  },
  "polygon-amoy": {
    key: "polygon-amoy", name: "Polygon Amoy", chainId: 80002,
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology/",
    explorer: "https://amoy.polygonscan.com/", nativeCurrency: "POL",
    tokenAddress: process.env.POLYGON_AMOY_TOKEN_ADDRESS || "",
    routerAddress: process.env.POLYGON_AMOY_PAYMENT_ROUTER_ADDRESS || "",
    subscriptionsAddress: process.env.POLYGON_AMOY_SUBSCRIPTION_MANAGER_ADDRESS || "",
    privateKey: process.env.POLYGON_AMOY_PRIVATE_KEY || ""
  }
} as const;

export type ChainKey = keyof typeof CHAINS;
export function getChain(value: unknown): (typeof CHAINS)[ChainKey] {
  const fallback = (process.env.DEFAULT_CHAIN || "adi-testnet") as ChainKey;
  const key = value === undefined || value === null || value === "" ? fallback : value;
  if (typeof key !== "string" || !(key in CHAINS)) throw new Error("Unsupported chain. Use adi-testnet or polygon-amoy.");
  return CHAINS[key as ChainKey];
}
