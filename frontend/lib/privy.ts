import { BrowserProvider, formatEther, type BigNumberish } from "ethers";
import type { Eip1193Provider } from "./wallet";
import type { ConnectedWallet } from "@privy-io/react-auth";

export const POLYGON_AMOY_FAUCET_URL =
  "https://faucet.polygon.technology/";

export function isPrivyConfigured(): boolean {
  return (process.env.NEXT_PUBLIC_PRIVY_APP_ID || "").trim().length > 0;
}

export function findEmbeddedEthereumWallet(
  wallets: ConnectedWallet[]
): ConnectedWallet | null {
  return (
    wallets.find(
      (w) =>
        w.type === "ethereum" &&
        (w.walletClientType === "privy" || w.walletClientType === "privy-v2") &&
        w.connectorType === "embedded" &&
        !w.imported
    ) ?? null
  );
}

export function isEmbeddedEthereumWallet(wallet: ConnectedWallet | null): boolean {
  if (!wallet) return false;
  return (
    wallet.type === "ethereum" &&
    (wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2") &&
    wallet.connectorType === "embedded" &&
    !wallet.imported
  );
}

export function wrapEthereumProvider(
  ethereum: Eip1193Provider | undefined | null
): BrowserProvider | null {
  if (!ethereum) return null;
  return new BrowserProvider(ethereum as unknown as Eip1193Provider);
}

export async function readPolBalance(
  provider: BrowserProvider,
  address: string
): Promise<string> {
  const balance = await provider.getBalance(address);
  return formatEther(balance);
}

export async function estimateGasFee(
  provider: BrowserProvider,
  to: string,
  data: string,
  value: BigNumberish = 0
): Promise<bigint> {
  const gas = await provider.estimateGas({ to, data, value });
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? BigInt(0);
  return gas * gasPrice;
}

export type PrivyWalletInfo = {
  address: string | null;
  email: string | null;
  isAuthenticated: boolean;
};
