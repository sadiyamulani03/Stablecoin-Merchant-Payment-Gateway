export type ChainKey = "adi-testnet" | "polygon-amoy";

export type PaymentStatus = "missing" | "pending" | "paid" | "refunded" | "expired" | "unknown";

export type MerchantStatus = "pending_kyc" | "testnet_active" | "suspended";

export type MerchantProfile = {
  _id: string;
  name: string;
  tradeLicense: string;
  emirate: string;
  category: string;
  settlementPreference: "stablecoin" | "partner-fiat";
  walletAddress: string;
  email: string;
  status: MerchantStatus;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type MerchantSummary = {
  merchant: MerchantProfile;
  stats: { paymentCount: number; paidCount: number };
};

export type AnalyticsSummary = {
  totalVolume: string;
  txCount: number;
  avgTicket: string;
  topMerchants: unknown[];
};

export type AuthResponse = {
  token: string;
  merchantId: string;
  name?: string;
  walletAddress?: string;
  status?: MerchantStatus;
};

export type QrPayload = {
  paymentId: string;
  amount: string;
  currency: string;
  merchant: string;
  network: ChainKey;
  token: string;
  version: number;
  chainId: number;
  url: string;
};

export type CreatePaymentResponse = {
  paymentId: string;
  qrCode: string;
  qrPayload: QrPayload;
  expiresAt: string;
  txHash: string;
  chain: ChainKey;
};

export type PaymentStatusResponse = {
  paymentId: string;
  status: PaymentStatus;
  amount: string;
  settledAt?: string;
  settlementMethod: string;
  chain: ChainKey;
  txHash?: string;
};

export type RefundResponse = {
  refundId: string;
  status: string;
  txHash: string;
};

export type SubscriptionRecord = {
  _id: string;
  subscriptionId: string;
  chain: string;
  merchantId: string;
  customerAddress: string;
  amountPerPeriod: string;
  periodSeconds: number;
  nextChargeAt: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type SubscriptionListResponse = {
  subscriptions: SubscriptionRecord[];
};

export type OnboardingFieldErrors = Partial<
  Record<
    | "name"
    | "tradeLicense"
    | "emirate"
    | "category"
    | "settlementPreference"
    | "walletAddress"
    | "email"
    | "password",
    string[]
  >
>;

export type ContractPayment = {
  merchant: string;
  customer: string;
  token: string;
  amount: bigint;
  createdAt: bigint;
  paidAt: bigint;
  status: bigint;
};

export type ContractSubscription = {
  customer: string;
  merchant: string;
  token: string;
  amountPerPeriod: bigint;
  balance: bigint;
  period: bigint;
  nextChargeAt: bigint;
  status: bigint;
};
