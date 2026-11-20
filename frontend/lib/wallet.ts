import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { NETWORKS, TOKEN_ABI, ROUTER_ABI, SUBSCRIPTION_ABI, type ChainKey } from "./config";

export type Eip1193Request = { method: string; params?: unknown[] };

export interface Eip1193Provider {
  request(args: Eip1193Request): Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export class WalletError extends Error {
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.name = "WalletError";
    this.code = code;
  }
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

export function hasInjectedWallet(): boolean {
  return getInjectedProvider() !== null;
}

function providerErrorCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return undefined;
}

export function describeWalletError(error: unknown): string {
  if (error instanceof WalletError) return error.message;
  const code = providerErrorCode(error);
  if (code === 4001) return "You rejected the request in your wallet.";
  if (code === 4901) return "The requested network is not connected to your wallet.";
  if (code === 4902) return "Your wallet does not know this network yet. Add it and try again.";
  if (code === -32002) return "A wallet request is already open. Finish it in your wallet.";
  if (error instanceof Error && error.message) {
    if (/user rejected|denied/i.test(error.message)) return "You rejected the request in your wallet.";
    if (/insufficient funds/i.test(error.message)) return "Your wallet does not have enough native gas token.";
    return error.message;
  }
  return "The wallet request failed. Try again.";
}

export async function connectAccount(): Promise<{ provider: BrowserProvider; account: string }> {
  const injected = getInjectedProvider();
  if (!injected) {
    throw new WalletError("No EVM wallet detected. Install MetaMask or another injected wallet.");
  }
  const provider = new BrowserProvider(injected);
  const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
  const account = accounts?.[0];
  if (!account) throw new WalletError("Your wallet did not return an account.");
  return { provider, account };
}

export async function currentChainId(provider: BrowserProvider): Promise<number> {
  const network = await provider.getNetwork();
  return Number(network.chainId);
}

export async function ensureChain(provider: BrowserProvider, chainKey: ChainKey): Promise<void> {
  const target = NETWORKS[chainKey];
  const active = await currentChainId(provider);
  if (active === target.chainId) return;

  const injected = getInjectedProvider();
  if (!injected) throw new WalletError("No EVM wallet detected.");

  try {
    await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target.chainHex }] });
  } catch (error) {
    const code = providerErrorCode(error);
    if (code !== 4902) throw new WalletError(describeWalletError(error), code);
    await injected.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: target.chainHex,
          chainName: target.name,
          nativeCurrency: { name: target.currency, symbol: target.currency, decimals: 18 },
          rpcUrls: [target.rpc],
          blockExplorerUrls: [target.explorer]
        }
      ]
    });
  }
}

export async function readTokenBalance(
  provider: BrowserProvider,
  tokenAddress: string,
  account: string
): Promise<string> {
  const token = new Contract(tokenAddress, TOKEN_ABI, provider);
  const decimals = Number(await token.decimals());
  const balance: bigint = await token.balanceOf(account);
  return formatUnits(balance, decimals);
}

export async function readAllowance(
  provider: BrowserProvider,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<string> {
  const token = new Contract(tokenAddress, TOKEN_ABI, provider);
  const decimals = Number(await token.decimals());
  const allowance: bigint = await token.allowance(owner, spender);
  return formatUnits(allowance, decimals);
}

export async function approveToken(
  provider: BrowserProvider,
  tokenAddress: string,
  spender: string,
  amount: string,
  decimals: number
): Promise<string> {
  const token = new Contract(tokenAddress, TOKEN_ABI, provider);
  const tx = await token.approve(spender, parseUnits(amount, decimals));
  const receipt = await tx.wait();
  return receipt?.hash ?? "";
}

export async function payPayment(
  provider: BrowserProvider,
  routerAddress: string,
  tokenAddress: string,
  paymentId: string
): Promise<string> {
  const router = new Contract(routerAddress, ROUTER_ABI, provider);
  const tx = await router.pay(paymentId, tokenAddress);
  const receipt = await tx.wait();
  return receipt?.hash ?? "";
}

export async function readContractPayment(
  provider: BrowserProvider,
  routerAddress: string,
  paymentId: string
): Promise<{
  merchant: string;
  customer: string;
  token: string;
  amount: bigint;
  createdAt: bigint;
  paidAt: bigint;
  status: bigint;
}> {
  const router = new Contract(routerAddress, ROUTER_ABI, provider);
  const payment = await router.getPayment(paymentId);
  return {
    merchant: payment.merchant,
    customer: payment.customer,
    token: payment.token,
    amount: BigInt(payment.amount),
    createdAt: BigInt(payment.createdAt),
    paidAt: BigInt(payment.paidAt),
    status: BigInt(payment.status)
  };
}

export async function readContractSubscription(
  provider: BrowserProvider,
  subscriptionsAddress: string,
  subId: string
): Promise<{
  customer: string;
  merchant: string;
  token: string;
  amountPerPeriod: bigint;
  balance: bigint;
  period: bigint;
  nextChargeAt: bigint;
  status: bigint;
}> {
  const manager = new Contract(subscriptionsAddress, SUBSCRIPTION_ABI, provider);
  const subscription = await manager.subscriptions(subId);
  return {
    customer: subscription.customer,
    merchant: subscription.merchant,
    token: subscription.token,
    amountPerPeriod: BigInt(subscription.amountPerPeriod),
    balance: BigInt(subscription.balance),
    period: BigInt(subscription.period),
    nextChargeAt: BigInt(subscription.nextChargeAt),
    status: BigInt(subscription.status)
  };
}
