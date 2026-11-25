import { BrowserProvider, formatEther, type BigNumberish } from "ethers";
import type { Eip1193Provider } from "./wallet";

export const POLYGON_AMOY_FAUCET_URL =
  "https://faucet.polygon.technology/";

export function isPrivyConfigured(): boolean {
  return (process.env.NEXT_PUBLIC_PRIVY_APP_ID || "").trim().length > 0;
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
