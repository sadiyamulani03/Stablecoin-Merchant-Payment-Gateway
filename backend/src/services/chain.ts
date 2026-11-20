import {Contract, JsonRpcProvider, Wallet, parseUnits, formatUnits, isAddress} from "ethers";
import {getChain, type ChainKey} from "../config/chains.js";

const routerAbi = [
  "function createIntent(address merchant,uint256 amount,address token) returns (bytes32)",
  "function pay(bytes32 paymentId,address token)",
  "function refund(bytes32 paymentId,address token)",
  "function getPayment(bytes32 paymentId) view returns ((address merchant,address customer,address token,uint128 amount,uint64 createdAt,uint64 paidAt,uint8 status))",
  "event PaymentCreated(bytes32 indexed paymentId,address indexed merchant,uint256 amount,address token,uint256 expiresAt)",
  "event PaymentSettled(bytes32 indexed paymentId,address indexed merchant,uint256 merchantAmount,uint256 feeAmount)",
  "event PaymentRefunded(bytes32 indexed paymentId,address indexed customer,uint256 amount)"
];
const tokenAbi = ["function decimals() view returns (uint8)","function approve(address,uint256) returns (bool)","function balanceOf(address) view returns (uint256)"];
const subscriptionAbi = [
  "function createSubscription(address merchant,address token,uint256 amountPerPeriod,uint256 period,uint256 initialTopUp,uint256 maxHeld) returns (bytes32)",
  "function charge(bytes32 subId)","function topUp(bytes32 subId,uint256 amount)","function pause(bytes32 subId)","function resume(bytes32 subId)","function cancel(bytes32 subId)"
];

export function chainContext(chainKey: string) {
  const chain = getChain(chainKey);
  const provider = new JsonRpcProvider(chain.rpcUrl, chain.chainId, {staticNetwork:true});
  const wallet = chain.privateKey ? new Wallet(chain.privateKey, provider) : null;
  const router = chain.routerAddress && wallet ? new Contract(chain.routerAddress, routerAbi, wallet) : null;
  const subscriptions = chain.subscriptionsAddress && wallet ? new Contract(chain.subscriptionsAddress, subscriptionAbi, wallet) : null;
  const token = chain.tokenAddress && wallet ? new Contract(chain.tokenAddress, tokenAbi, wallet) : null;
  return {chain, provider, wallet, router, subscriptions, token};
}

export async function createOnchainIntent(chainKey: ChainKey, merchant: string, amount: string) {
  const ctx = chainContext(chainKey);
  if (!ctx.router || !ctx.token || !ctx.chain.tokenAddress) throw new Error(`Contracts or signer are not configured for ${chainKey}`);
  if (!isAddress(merchant)) throw new Error("Invalid merchant wallet address");
  const decimals = Number(await ctx.token.decimals());
  const value = parseUnits(amount, decimals);
  const tx = await ctx.router.createIntent(merchant, value, ctx.chain.tokenAddress);
  const receipt = await tx.wait();
  const event = receipt.logs.map((log: {topics:string[];data:string}) => {try{return ctx.router!.interface.parseLog(log)}catch{return null}}).find((item: {name:string}|null) => item?.name === "PaymentCreated");
  if (!event) throw new Error("PaymentCreated event missing from transaction receipt");
  return {paymentId:event.args.paymentId as string, txHash:receipt.hash as string, amountBaseUnits:value.toString(), decimals};
}

export async function getOnchainPayment(chainKey: ChainKey, paymentId: string) {
  const ctx = chainContext(chainKey);
  if (!ctx.chain.routerAddress) throw new Error(`PaymentRouter address missing for ${chainKey}`);
  const contract = new Contract(ctx.chain.routerAddress, routerAbi, ctx.provider);
  const p = await contract.getPayment(paymentId);
  return {merchant:p.merchant as string,customer:p.customer as string,token:p.token as string,amount:formatUnits(p.amount,2),createdAt:Number(p.createdAt),paidAt:Number(p.paidAt),status:Number(p.status)};
}

export async function submitRefund(chainKey: ChainKey, paymentId: string) {
  const ctx = chainContext(chainKey);
  if (!ctx.router || !ctx.token) throw new Error(`Router signer/token missing for ${chainKey}`);
  // Contract refund pulls the full amount from the admin signer; fund and approve it before use.
  const payment = await getOnchainPayment(chainKey,paymentId);
  const amount = parseUnits(payment.amount,2);
  const approveTx = await ctx.token.approve(ctx.chain.routerAddress,amount);
  await approveTx.wait();
  const tx = await ctx.router.refund(paymentId,ctx.chain.tokenAddress);
  const receipt = await tx.wait();
  return {txHash:receipt.hash as string};
}

export async function createOnchainSubscription(chainKey: ChainKey, merchant: string, customerKey: string, amount: string, periodSeconds: number, initialTopUp: string) {
  const ctx = chainContext(chainKey);
  if (!ctx.subscriptions || !ctx.chain.tokenAddress) throw new Error(`Subscription manager signer/token missing for ${chainKey}`);
  const customerWallet = new Wallet(customerKey, ctx.provider);
  const token = new Contract(ctx.chain.tokenAddress, tokenAbi, customerWallet);
  const decimals = Number(await token.decimals());
  const value = parseUnits(amount,decimals);
  const topUp = parseUnits(initialTopUp,decimals);
  const approve = await token.approve(ctx.chain.subscriptionsAddress,topUp); await approve.wait();
  const manager = new Contract(ctx.chain.subscriptionsAddress,subscriptionAbi,customerWallet);
  const tx = await manager.createSubscription(merchant,ctx.chain.tokenAddress,value,periodSeconds,topUp,topUp);
  const receipt = await tx.wait();
  const parsed = receipt.logs.map((log: {topics:string[];data:string})=>{try{return manager.interface.parseLog(log)}catch{return null}}).find((e:{name:string}|null)=>e?.name==="SubscriptionCreated");
  if(!parsed) throw new Error("SubscriptionCreated event missing");
  return {subscriptionId:parsed.args.subId as string,txHash:receipt.hash as string};
}
