"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import type { BrowserProvider } from "ethers";
import type { Eip1193Provider } from "../../../lib/wallet";
import { formatEther } from "ethers";
import { usePrivy, useIdentityToken, useWallets } from "@privy-io/react-auth";
import Shell from "../../../components/Shell";
import { Alert, Badge, Card, KeyValue, StepList } from "../../../components/ui";
import CopyButton from "../../../components/CopyButton";
import { apiFetch } from "../../../lib/api";
import { DEPLOYMENTS, NETWORKS, TOKEN_SYMBOL, getChain } from "../../../lib/config";
import {
  explorerTxUrl,
  formatAmount,
  formatDateTime,
  formatRelative,
  paymentStatusMeta,
  shortenAddress
} from "../../../lib/format";
import type { PaymentStatusResponse } from "../../../lib/types";
import {
  approveToken,
  connectAccount,
  currentChainId,
  describeWalletError,
  ensureChain,
  onAccountsChanged,
  payPayment,
  readAllowance,
  readContractPayment,
  readTokenBalance
} from "../../../lib/wallet";
import {
  wrapEthereumProvider,
  readPolBalance,
  estimateGasFee,
  findEmbeddedEthereumWallet,
  POLYGON_AMOY_FAUCET_URL,
  isPrivyConfigured
} from "../../../lib/privy";
import { saveWalletSession } from "../../../lib/auth";

type Stage =
  | "idle"
  | "connecting"
  | "switching"
  | "approving"
  | "approving-confirm"
  | "paying"
  | "paying-confirm"
  | "success"
  | "error";

const STAGE_LABELS: Record<Stage, string> = {
  idle: "Connect your wallet",
  connecting: "Waiting for wallet approval",
  switching: "Switching network",
  approving: "Approve mDDSC spending",
  "approving-confirm": "Confirm the approval in your wallet",
  paying: "Submit the payment transaction",
  "paying-confirm": "Confirm the payment in your wallet",
  success: "Payment settled",
  error: "Something went wrong"
};

export default function PayPage() {
  const params = useParams<{ paymentId: string }>();
  const searchParams = useSearchParams();
  const chain = getChain(searchParams.get("chain"));
  const { login: privyLogin, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets, ready: walletsReady } = useWallets();

  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [account, setAccount] = useState("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<string | null>(null);
  const [intentExpiresAt, setIntentExpiresAt] = useState<string | null>(null);

  // Embedded wallet (Privy / Google sign-in) state
  const [embeddedProvider, setEmbeddedProvider] = useState<BrowserProvider | null>(null);
  const [embeddedAccount, setEmbeddedAccount] = useState("");
  const [embeddedBalance, setEmbeddedBalance] = useState<string | null>(null);
  const [embeddedLoading, setEmbeddedLoading] = useState(false);
  const [embeddedError, setEmbeddedError] = useState("");
  const privyEnabled = isPrivyConfigured();
  const embeddedWallet = findEmbeddedEthereumWallet(wallets);

  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [approveTx, setApproveTx] = useState("");
  const [payTx, setPayTx] = useState("");

  const deployment = DEPLOYMENTS[chain];
  const statusMeta = paymentStatusMeta(payment?.status);
  const usingEmbedded = Boolean(embeddedProvider && embeddedAccount);
  const activeProvider = usingEmbedded ? embeddedProvider : provider;
  const activeAccount = usingEmbedded ? embeddedAccount : account;

  const loadPayment = useCallback(async () => {
    try {
      const response = await apiFetch<PaymentStatusResponse>(
        `/api/payments/${params.paymentId}?chain=${chain}`
      );
      setPayment(response);
      setLoadError("");
    } catch (requestError) {
      setLoadError(
        requestError instanceof Error ? requestError.message : "Could not load this payment request."
      );
    } finally {
      setLoading(false);
    }
  }, [params.paymentId, chain]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await apiFetch<PaymentStatusResponse>(
          `/api/payments/${params.paymentId}?chain=${chain}`
        );
        if (active) {
          setPayment(response);
          setLoadError("");
        }
      } catch (requestError) {
        if (active) {
          setLoadError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load this payment request."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [params.paymentId, chain]);

  useEffect(() => {
    if (!payment || payment.status !== "pending") return;
    const timer = window.setInterval(() => {
      void loadPayment();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [payment, loadPayment]);

  const refreshWalletState = useCallback(async (activeProvider: BrowserProvider, activeAccount: string) => {
    const id = await currentChainId(activeProvider);
    setWalletChainId(id);
    if (id !== NETWORKS[chain].chainId) return;
    if (!deployment.token) return;
    const tokenBalance = await readTokenBalance(activeProvider, deployment.token, activeAccount);
    setBalance(tokenBalance);
    if (deployment.router) {
      const tokenAllowance = await readAllowance(
        activeProvider,
        deployment.token,
        activeAccount,
        deployment.router
      );
      setAllowance(tokenAllowance);
    }
    try {
      const onchain = await readContractPayment(activeProvider, deployment.router, params.paymentId);
      setIntentExpiresAt(new Date(Number(onchain.createdAt) * 1000 + 3600 * 1000).toISOString());
    } catch {
      setIntentExpiresAt(null);
    }
  }, [chain, deployment.router, deployment.token, params.paymentId]);

  /// The wallet can switch accounts without a reload. This page signs with the account it cached, so
  /// a switch has to clear it and go back to the connect step; otherwise approve and pay would both be
  /// refused as a mismatch until the page is reloaded.
  useEffect(() => {
    if (!provider || usingEmbedded) return;
    const released = onAccountsChanged((accounts) => {
      const next = accounts[0] ?? null;
      if (!next) {
        setProvider(null);
        setAccount("");
        setBalance(null);
        setAllowance(null);
        setStage("idle");
        setError("Your wallet disconnected. Connect it again to pay.");
        return;
      }
      if (next.toLowerCase() === account.toLowerCase()) return;
      setAccount(next);
      setApproveTx("");
      setPayTx("");
      setStage("idle");
      setError("");
      refreshWalletState(provider, next).catch(() => {
        /* the new account's balance and allowance are also read on the next connect */
      });
    });
    return released;
  }, [provider, account, usingEmbedded, refreshWalletState]);

  async function connect() {
    setStage("connecting");
    setError("");
    try {
      const { provider: connectedProvider, account: connectedAccount } = await connectAccount();
      setProvider(connectedProvider);
      setAccount(connectedAccount);
      await refreshWalletState(connectedProvider, connectedAccount);
      setStage("idle");
    } catch (connectError) {
      setError(describeWalletError(connectError));
      setStage("error");
    }
  }

  useEffect(() => {
    if (!privyEnabled || !embeddedWallet || !walletsReady) return;
    setEmbeddedLoading(true);
    setEmbeddedError("");
    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          setEmbeddedError("No Privy access token available. Sign in with Google first.");
          setEmbeddedLoading(false);
          return;
        }
        const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");
        const response = await fetch(`${API_URL}/api/auth/privy/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ idToken: accessToken, identityToken })
        });
        if (!response.ok) {
          setEmbeddedError("Privy session expired. Sign in with Google again.");
          setEmbeddedLoading(false);
          return;
        }
        const verified = (await response.json()) as {
          walletAddress: string;
          email: string | null;
        };
        if (verified.walletAddress.toLowerCase() !== embeddedWallet.address.toLowerCase()) {
          setEmbeddedError("Stored wallet address does not match verified wallet. Sign in again.");
          setEmbeddedLoading(false);
          return;
        }
        const ethereum = await embeddedWallet.getEthereumProvider();
        const provider = wrapEthereumProvider(ethereum as unknown as Eip1193Provider);
        if (!provider) {
          setEmbeddedError("Could not create wallet provider.");
          setEmbeddedLoading(false);
          return;
        }
        const network = await provider.getNetwork();
        const chainId = Number(network.chainId);
        setEmbeddedProvider(provider);
        setEmbeddedAccount(verified.walletAddress);
        if (chainId === 80002 && deployment.token) {
          const bal = await readPolBalance(provider, verified.walletAddress);
          setEmbeddedBalance(bal);
        }
        setWalletChainId(chainId);
        saveWalletSession({ address: verified.walletAddress, email: verified.email ?? null, provider: "privy" });
        setEmbeddedLoading(false);
      } catch (err) {
        setEmbeddedError(err instanceof Error ? err.message : "Failed to restore embedded wallet.");
        setEmbeddedLoading(false);
      }
    })();
  }, [privyEnabled, embeddedWallet, walletsReady, deployment.token, wrapEthereumProvider, readPolBalance, getAccessToken, identityToken]);

  async function connectEmbedded() {
    setEmbeddedLoading(true);
    setEmbeddedError("");
    try {
      await privyLogin();
    } catch (err) {
      setEmbeddedError(err instanceof Error ? err.message : "Embedded wallet connection failed.");
      setEmbeddedLoading(false);
    }
  }

  async function refreshEmbeddedWalletState() {
    if (!embeddedProvider || !embeddedAccount) return;
    try {
      const id = await currentChainId(embeddedProvider);
      setWalletChainId(id);
      if (id !== NETWORKS[chain].chainId) return;
      if (deployment.token) {
        const tokenBalance = await readTokenBalance(embeddedProvider, deployment.token, embeddedAccount);
        setBalance(tokenBalance);
      }
      if (deployment.router) {
        const tokenAllowance = await readAllowance(
          embeddedProvider,
          deployment.token,
          embeddedAccount,
          deployment.router
        );
        setAllowance(tokenAllowance);
      }
      if (id === 80002) {
        const bal = await readPolBalance(embeddedProvider, embeddedAccount);
        setEmbeddedBalance(bal);
      }
      try {
        const onchain = await readContractPayment(embeddedProvider, deployment.router, params.paymentId);
        setIntentExpiresAt(new Date(Number(onchain.createdAt) * 1000 + 3600 * 1000).toISOString());
      } catch {
        setIntentExpiresAt(null);
      }
    } catch {
      /* wallet state refresh failed silently */
    }
  }

  async function switchNetwork() {
    const netProvider = usingEmbedded ? embeddedProvider : provider;
    if (!netProvider) return;
    setStage("switching");
    setError("");
    try {
      await ensureChain(netProvider, chain);
      if (usingEmbedded) {
        await refreshEmbeddedWalletState();
      } else {
        await refreshWalletState(netProvider, account);
      }
      setStage("idle");
    } catch (switchError) {
      setError(describeWalletError(switchError));
      setStage("error");
    }
  }

  async function pay() {
    if (!activeProvider || !activeAccount || !payment) return;
    if (!deployment.token || !deployment.router) {
      setError("Contract addresses are not configured for this network.");
      setStage("error");
      return;
    }

    setError("");
    try {
      const required = Number(payment.amount);
      const currentAllowance = allowance === null ? 0 : Number(allowance);

      if (chain === "polygon-amoy") {
        const polBalance = usingEmbedded ? embeddedBalance : balance;
        const polBalanceNum = polBalance === null ? 0 : Number(polBalance);
        if (polBalanceNum === 0) {
          setError(
            "Insufficient POL for gas. Your Polygon Amoy wallet has 0 POL. Get testnet POL from the faucet, then retry."
          );
          setStage("error");
          return;
        }
        const estimate = await estimateGasFee(
          activeProvider,
          deployment.router,
          "0x",
          0
        );
        const estimateEth = Number(formatEther(estimate));
        if (polBalanceNum < estimateEth) {
          setError(
            `Insufficient POL for gas. Estimated gas cost: ${estimateEth.toFixed(6)} POL, your balance: ${polBalanceNum.toFixed(6)} POL. Get testnet POL from the faucet, then retry.`
          );
          setStage("error");
          return;
        }
      }

      if (currentAllowance < required) {
        setStage("approving");
        const hash = await approveToken(
          activeProvider,
          deployment.token,
          activeAccount,
          deployment.router,
          payment.amount,
          2
        );
        setApproveTx(hash);
        setStage("paying");
      } else {
        setStage("paying");
      }
      const hash = await payPayment(
        activeProvider,
        deployment.router,
        activeAccount,
        deployment.token,
        payment.paymentId
      );
      setPayTx(hash);
      setStage("success");
      await loadPayment();
      if (usingEmbedded) {
        await refreshEmbeddedWalletState();
      } else {
        await refreshWalletState(activeProvider, activeAccount);
      }
    } catch (payError) {
      const msg = describeWalletError(payError);
      if (/insufficient/i.test(msg)) {
        setError("Insufficient funds for gas. Get testnet POL from the faucet, then retry.");
      } else {
        setError(msg);
      }
      setStage("error");
    }
  }

  const wrongNetwork = walletChainId !== null && walletChainId !== NETWORKS[chain].chainId;
  const isBusy = ["connecting", "switching", "approving", "approving-confirm", "paying", "paying-confirm"].includes(stage);
  const canPay = payment?.status === "pending" && Boolean(activeProvider) && Boolean(activeAccount) && !wrongNetwork && !isBusy;

  const steps: { label: string; state: "todo" | "active" | "done" }[] = [
    {
      label: "Connect an EVM wallet (MetaMask or embedded)",
      state: activeAccount ? "done" : stage === "connecting" || embeddedLoading ? "active" : "todo"
    },
    {
      label: `Switch to ${NETWORKS[chain].name} (${NETWORKS[chain].chainId})`,
      state: wrongNetwork ? (stage === "switching" ? "active" : "todo") : walletChainId ? "done" : "todo"
    },
    {
      label: `Approve ${TOKEN_SYMBOL} for the payment router`,
      state: approveTx ? "done" : stage.startsWith("approving") ? "active" : "todo"
    },
    {
      label: "Submit the payment transaction",
      state: payTx ? "done" : stage.startsWith("paying") ? "active" : "todo"
    }
  ];

  if (loading) {
    return (
      <Shell>
        <div className="center">
          <Card className="pad-lg" style={{ maxWidth: 560, width: "100%" }}>
            <p className="muted">Loading payment request…</p>
          </Card>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="center">
        <div className="split" style={{ width: "100%", maxWidth: 960 }}>
          <Card pad-lg>
            <div className="cluster" style={{ justifyContent: "space-between" }}>
              <div className="eyebrow">Customer checkout · {NETWORKS[chain].name}</div>
              <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            </div>

            <h1 style={{ fontSize: 30, margin: "12px 0 4px" }}>
              {payment ? `AED ${formatAmount(payment.amount)}` : "Payment request"}
            </h1>
            <p className="muted" style={{ marginBottom: 18 }}>
              Pay with {TOKEN_SYMBOL}, the mock stablecoin used on this testnet. It has no real AED value.
            </p>

            {loadError ? (
              <div style={{ marginBottom: 16 }}>
                <Alert tone="danger" title="Payment unavailable">
                  {loadError}
                </Alert>
              </div>
            ) : null}

            {payment ? (
              <KeyValue
                items={[
                  {
                    label: "Payment reference",
                    value: (
                      <span className="cluster" style={{ justifyContent: "flex-end" }}>
                        <span className="mono">{payment.paymentId}</span>
                        <CopyButton value={payment.paymentId} />
                      </span>
                    )
                  },
                  { label: "Network", value: NETWORKS[chain].name },
                  {
                    label: "Intent expiry",
                    value: intentExpiresAt
                      ? `${formatDateTime(intentExpiresAt)} (${formatRelative(intentExpiresAt)})`
                      : "Connect your wallet to read the expiry from the chain"
                  }
                ]}
              />
            ) : null}

            {payment?.status === "paid" ? (
              <div style={{ marginTop: 18 }}>
                <Alert tone="success" title="Payment settled">
                  This request has been paid on-chain. No further action is needed.
                </Alert>
              </div>
            ) : payment && payment.status !== "pending" ? (
              <div style={{ marginTop: 18 }}>
                <Alert tone="warning" title={`Status: ${statusMeta.label}`}>
                  This request can no longer be paid. Ask the merchant to create a new request.
                </Alert>
              </div>
            ) : null}

            {payment?.status === "pending" ? (
              <>
                <div style={{ margin: "20px 0" }}>
                  <StepList steps={steps} />
                </div>

                {activeAccount ? (
                  <div className="stack-sm" style={{ marginBottom: 16 }}>
                    <div className="cluster">
                      <span className="wallet-chip">
                        <span className="badge-dot" aria-hidden="true" style={{ background: wrongNetwork ? "#b3261e" : "#0f7a52" }} />
                        <span className="mono" title={activeAccount}>
                          {shortenAddress(activeAccount)}
                        </span>
                        {usingEmbedded ? (
                          <span className="badge-neutral" style={{ fontSize: 11, marginLeft: 6 }}>embedded</span>
                        ) : null}
                      </span>
                      <CopyButton value={activeAccount} />
                    </div>
                    <p className="small muted">
                      Connected wallet network:{" "}
                      <strong>
                        {walletChainId === null
                          ? "unknown"
                          : walletChainId === NETWORKS[chain].chainId
                            ? NETWORKS[chain].shortName
                            : `chain ${walletChainId} (${NETWORKS[chain].shortName} required)`}
                      </strong>
                    </p>
                    {balance !== null ? (
                      <p className="small muted">
                        {TOKEN_SYMBOL} balance: <strong>{formatAmount(balance)}</strong>
                        {allowance !== null ? (
                          <>
                            {" · "}
                            router allowance: <strong>{formatAmount(allowance)}</strong>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {usingEmbedded && chain === "polygon-amoy" && embeddedBalance !== null ? (
                      <p className="small muted">
                        POL balance: <strong>{formatAmount(embeddedBalance)}</strong>
                        {Number(embeddedBalance) === 0 ? (
                          <span style={{ color: "#b3261e" }}>&nbsp;— no POL for gas</span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {stage === "success" ? (
                  <Alert tone="success" title="Payment confirmed">
                    The transaction was confirmed on {NETWORKS[chain].shortName}.
                  </Alert>
                ) : null}

                {error ? <Alert tone="danger">{error}</Alert> : null}

                <div className="btn-row" style={{ marginTop: 18 }}>
                  {!activeAccount ? (
                    <>
                      <button className="btn" type="button" onClick={connect} disabled={isBusy}>
                        {stage === "connecting" ? "Connecting…" : "Connect wallet (MetaMask)"}
                      </button>
                      {privyEnabled && !embeddedAccount ? (
                        <button className="btn secondary" type="button" onClick={connectEmbedded} disabled={embeddedLoading || isBusy}>
                          {embeddedLoading ? "Signing in with Google…" : "Continue with Google (embedded wallet)"}
                        </button>
                      ) : null}
                      {embeddedError && !embeddedAccount ? (
                        <div style={{ marginTop: 10 }}>
                          <Alert tone="danger">{embeddedError}</Alert>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  {activeAccount && wrongNetwork ? (
                    <button className="btn" type="button" onClick={switchNetwork} disabled={isBusy}>
                      {stage === "switching" ? "Switching…" : `Switch to ${NETWORKS[chain].shortName}`}
                    </button>
                  ) : null}

                  {activeAccount && !wrongNetwork ? (
                    <button className="btn" type="button" onClick={pay} disabled={!canPay}>
                      {isBusy ? STAGE_LABELS[stage] : `Pay ${formatAmount(payment.amount)} ${TOKEN_SYMBOL}`}
                    </button>
                  ) : null}

                  {usingEmbedded && chain === "polygon-amoy" && embeddedBalance !== null && Number(embeddedBalance) === 0 ? (
                    <div style={{ marginTop: 10 }}>
                      <Alert tone="warning" title="Insufficient POL for gas">
                        Your embedded wallet has 0 POL on Polygon Amoy.{" "}
                        <a href={POLYGON_AMOY_FAUCET_URL} target="_blank" rel="noreferrer" className="link">
                          Get testnet POL from the faucet
                        </a>
                        , then refresh and retry.
                      </Alert>
                    </div>
                  ) : null}
                </div>

                {payTx ? (
                  <p className="small muted" style={{ marginTop: 14 }}>
                    Payment transaction:{" "}
                    <a
                      className="hash"
                      href={explorerTxUrl(chain, payTx) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {payTx.slice(0, 16)}…
                    </a>
                  </p>
                ) : null}
              </>
            ) : null}
          </Card>

          <div className="stack">
            <Card>
              <h2 style={{ fontSize: 17, marginBottom: 10 }}>What happens next</h2>
              <ol className="stack-sm small muted" style={{ paddingLeft: 18, margin: 0 }}>
                <li>Your wallet approves the gateway to move {TOKEN_SYMBOL} on your behalf.</li>
                <li>The gateway records the payment and the settlement fee on-chain.</li>
                <li>The merchant sees the settled status in their dashboard.</li>
              </ol>
            </Card>

            <Card>
              <h2 style={{ fontSize: 17, marginBottom: 10 }}>Network details</h2>
              <KeyValue
                items={[
                  { label: "Network", value: NETWORKS[chain].name },
                  { label: "Chain ID", value: NETWORKS[chain].chainId },
                  { label: "Currency", value: NETWORKS[chain].currency },
                  {
                    label: "Token",
                    value: deployment.token ? shortenAddress(deployment.token) : "not configured"
                  }
                ]}
              />
              <div style={{ marginTop: 14 }}>
                <Alert tone="warning" title="Test token only">
                  {TOKEN_SYMBOL} is a mock token issued for this testnet. It is not official DDSC, AE Coin,
                  or fiat, and cannot be redeemed.
                </Alert>
              </div>
            </Card>

            <p className="small muted">
              Looking for your own payment history?{" "}
              <Link className="link" href="/dashboard">
                Open the merchant dashboard
              </Link>
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}
