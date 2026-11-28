"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BrowserProvider } from "ethers";
import { Contract, parseUnits } from "ethers";
import Shell from "../../components/Shell";
import { Alert, Badge, Card, EmptyState, Field, KeyValue, StepList } from "../../components/ui";
import CopyButton from "../../components/CopyButton";
import { useSession } from "../../components/SessionProvider";
import { apiFetch } from "../../lib/api";
import { DEPLOYMENTS, NETWORKS, SUBSCRIPTION_ABI, TOKEN_SYMBOL, type ChainKey } from "../../lib/config";
import {
  explorerTxUrl,
  formatAmount,
  formatDateTime,
  formatRelative,
  formatUnitsSafe,
  shortenAddress,
  subscriptionStatusMeta
} from "../../lib/format";
import type { MerchantSummary, SubscriptionListResponse } from "../../lib/types";
import {
  approveToken,
  connectAccount,
  currentChainId,
  describeWalletError,
  ensureChain,
  readContractSubscription
} from "../../lib/wallet";
import { amountSchema, walletAddressSchema, zodFieldErrors, type FieldErrors } from "../../lib/validation";

const PERIODS = [
  { label: "Weekly (7 days)", seconds: 604800 },
  { label: "Monthly (30 days)", seconds: 2592000 }
];

type SubscriptionState = {
  customer: string;
  merchant: string;
  token: string;
  amountPerPeriod: bigint;
  balance: bigint;
  period: bigint;
  nextChargeAt: bigint;
  status: bigint;
};

type ActionKey = "charge" | "topUp" | "pause" | "resume" | "cancel";

export default function Subscriptions() {
  const router = useRouter();
  const { session, isResolved } = useSession();
  const merchantId = session?.merchantId ?? null;

  const [tab, setTab] = useState<"create" | "manage" | "records">("create");
  const [chain, setChain] = useState<ChainKey>("polygon-amoy");
  const [merchant, setMerchant] = useState("");
  const [amount, setAmount] = useState("");
  const [topUp, setTopUp] = useState("");
  const [period, setPeriod] = useState(PERIODS[1].seconds);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [account, setAccount] = useState("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createdSubId, setCreatedSubId] = useState("");
  const [createTx, setCreateTx] = useState("");

  const [subId, setSubId] = useState("");
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [actionTx, setActionTx] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");

  const [records, setRecords] = useState<SubscriptionListResponse["subscriptions"]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  const deployment = DEPLOYMENTS[chain];

  useEffect(() => {
    if (!isResolved) return;
    if (!merchantId) {
      router.replace("/login");
      return;
    }
  }, [isResolved, merchantId, router]);

  useEffect(() => {
    if (!merchantId) return;
    let active = true;

    async function loadProfile() {
      try {
        const profile = await apiFetch<MerchantSummary>(`/api/merchants/${merchantId}`, { auth: true });
        if (active && profile.merchant.walletAddress) setMerchant(profile.merchant.walletAddress);
      } catch {
        /* the merchant address can still be entered manually */
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, [merchantId]);

  const loadRecords = useCallback(async () => {
    if (!merchantId) return;
    setRecordsLoading(true);
    try {
      const response = await apiFetch<SubscriptionListResponse>(
        `/api/subscriptions?merchantId=${merchantId}`,
        { auth: true }
      );
      setRecords(response.subscriptions ?? []);
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [merchantId]);

  async function ensureWallet(): Promise<{ provider: BrowserProvider; account: string }> {
    let activeProvider = provider;
    let activeAccount = account;

    if (!activeProvider || !activeAccount) {
      const connected = await connectAccount();
      activeProvider = connected.provider;
      activeAccount = connected.account;
      setProvider(activeProvider);
      setAccount(activeAccount);
    }

    const chainId = await currentChainId(activeProvider);
    setWalletChainId(chainId);
    if (chainId !== NETWORKS[chain].chainId) {
      await ensureChain(activeProvider, chain);
      setWalletChainId(NETWORKS[chain].chainId);
    }

    return { provider: activeProvider, account: activeAccount };
  }

  async function createSubscription(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setError("");
    setNotice("");
    setCreatedSubId("");
    setCreateTx("");

    const parsedMerchant = walletAddressSchema.safeParse(merchant);
    const parsedAmount = amountSchema.safeParse(amount);
    const parsedTopUp = amountSchema.safeParse(topUp);
    if (!parsedMerchant.success || !parsedAmount.success || !parsedTopUp.success) {
      const errors: FieldErrors = {};
      if (!parsedMerchant.success) Object.assign(errors, zodFieldErrors(parsedMerchant.error));
      if (!parsedAmount.success) Object.assign(errors, zodFieldErrors(parsedAmount.error));
      if (!parsedTopUp.success) Object.assign(errors, zodFieldErrors(parsedTopUp.error));
      setFieldErrors(errors);
      return;
    }
    if (!deployment.token || !deployment.subscriptions) {
      setError("Contract addresses are not configured for this network.");
      return;
    }

    setBusy(true);
    try {
      const { provider: activeProvider } = await ensureWallet();
      const decimals = 2;
      const funding = parsedTopUp.data;

      await approveToken(
        activeProvider,
        deployment.token,
        deployment.subscriptions,
        funding,
        decimals
      );
      const manager = new Contract(deployment.subscriptions, SUBSCRIPTION_ABI, activeProvider);
      const tx = await manager.createSubscription(
        parsedMerchant.data,
        deployment.token,
        parseUnits(parsedAmount.data, decimals),
        period,
        parseUnits(funding, decimals),
        parseUnits(funding, decimals)
      );
      const receipt = await tx.wait();

      let newSubId = "";
      for (const log of receipt.logs) {
        try {
          const parsed = manager.interface.parseLog(log);
          if (parsed?.name === "SubscriptionCreated") newSubId = String(parsed.args.subId);
        } catch {
          /* not a subscription event */
        }
      }

      setCreatedSubId(newSubId);
      setCreateTx(receipt.hash);
      setNotice(
        `Subscription ${newSubId ? newSubId.slice(0, 12) + "…" : "created"} on ${NETWORKS[chain].shortName}. Escrow of ${formatAmount(funding)} ${TOKEN_SYMBOL} was funded by the customer wallet.`
      );
      setSubId(newSubId);
    } catch (createError) {
      setError(describeWalletError(createError));
    } finally {
      setBusy(false);
    }
  }

  async function loadSubscription() {
    setError("");
    setNotice("");
    setSubscription(null);
    if (!subId.trim()) {
      setError("Enter the subscription ID you want to inspect.");
      return;
    }
    if (!deployment.subscriptions) {
      setError("Subscription manager address is not configured for this network.");
      return;
    }

    setBusy(true);
    try {
      const { provider: activeProvider } = await ensureWallet();
      const state = await readContractSubscription(activeProvider, deployment.subscriptions, subId.trim());
      setSubscription(state);
    } catch (readError) {
      setError(describeWalletError(readError));
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: ActionKey) {
    setError("");
    setNotice("");
    setActionTx("");

    if (!subscription) {
      setError("Load the subscription first.");
      return;
    }
    if (!deployment.subscriptions || !deployment.token) {
      setError("Contract addresses are not configured for this network.");
      return;
    }

    setBusy(true);
    try {
      const { provider: activeProvider } = await ensureWallet();
      const manager = new Contract(deployment.subscriptions, SUBSCRIPTION_ABI, activeProvider);

      let tx;
      if (action === "topUp") {
        const parsed = amountSchema.safeParse(topUpAmount);
        if (!parsed.success) {
          setFieldErrors({ topUpAmount: zodFieldErrors(parsed.error).topUpAmount ?? "Enter a valid amount" });
          setBusy(false);
          return;
        }
        await approveToken(activeProvider, deployment.token, deployment.subscriptions, parsed.data, 2);
        tx = await manager.topUp(subId.trim(), parseUnits(parsed.data, 2));
      } else {
        tx = await manager[action](subId.trim());
      }

      const receipt = await tx.wait();
      setActionTx(receipt.hash);
      setNotice(`${action} confirmed on ${NETWORKS[chain].shortName}.`);
      const refreshed = await readContractSubscription(activeProvider, deployment.subscriptions, subId.trim());
      setSubscription(refreshed);
    } catch (actionError) {
      setError(describeWalletError(actionError));
    } finally {
      setBusy(false);
    }
  }

  const isCustomer = subscription ? account.toLowerCase() === subscription.customer.toLowerCase() : false;
  const isMerchant = subscription ? account.toLowerCase() === subscription.merchant.toLowerCase() : false;
  const subscriptionMeta = subscriptionStatusMeta(subscription?.status);

  return (
    <Shell>
      <div className="pagehead">
        <div>
          <div className="eyebrow">Recurring billing</div>
          <h1>Subscriptions</h1>
          <p>
            Prepaid escrow that the customer funds and the merchant charges. Every action is an explicit
            wallet transaction.
          </p>
        </div>
        <Link className="btn secondary" href="/dashboard">
          Back to dashboard
        </Link>
      </div>

      <div style={{ marginBottom: 18 }}>
        <Alert tone="warning" title="Nothing runs automatically">
          Subscription charges are never scheduled. The merchant must submit each charge transaction, and
          the customer must approve every top-up. The gateway does not execute charges on a schedule.
        </Alert>
      </div>

      <div className="tabs" role="tablist" aria-label="Subscription sections">
        {(
          [
            ["create", "Create subscription"],
            ["manage", "Manage subscription"],
            ["records", "Merchant records"]
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              if (value === "records") void loadRecords();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <div className="split">
          <Card pad-lg>
            <form className="form" onSubmit={createSubscription} noValidate>
              <Field label="Network" htmlFor="sub-chain" hint="The subscription lives on this chain.">
                <select
                  id="sub-chain"
                  value={chain}
                  onChange={(event) => {
                    setChain(event.target.value as ChainKey);
                    setSubscription(null);
                  }}
                >
                  {(Object.keys(NETWORKS) as ChainKey[]).map((key) => (
                    <option key={key} value={key}>
                      {NETWORKS[key].name} · chain {NETWORKS[key].chainId}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Merchant wallet address"
                htmlFor="sub-merchant"
                hint="The address that receives each periodic charge."
                error={fieldErrors.walletAddress}
              >
                <input
                  id="sub-merchant"
                  value={merchant}
                  onChange={(event) => setMerchant(event.target.value)}
                  aria-invalid={fieldErrors.walletAddress ? "true" : undefined}
                  placeholder="0x…"
                />
              </Field>

              <div className="form-grid">
                <Field
                  label="Amount per period (AED)"
                  htmlFor="sub-amount"
                  error={fieldErrors.amount}
                >
                  <input
                    id="sub-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-invalid={fieldErrors.amount ? "true" : undefined}
                    placeholder="25.00"
                  />
                </Field>

                <Field label="Billing period" htmlFor="sub-period">
                  <select
                    id="sub-period"
                    value={period}
                    onChange={(event) => setPeriod(Number(event.target.value))}
                  >
                    {PERIODS.map((option) => (
                      <option key={option.seconds} value={option.seconds}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field
                label="Initial escrow top-up (AED)"
                htmlFor="sub-topup"
                hint="Funded from the customer wallet. This balance pays future charges."
                error={fieldErrors.topUp}
              >
                <input
                  id="sub-topup"
                  inputMode="decimal"
                  value={topUp}
                  onChange={(event) => setTopUp(event.target.value)}
                  aria-invalid={fieldErrors.topUp ? "true" : undefined}
                  placeholder="100.00"
                />
              </Field>

              {error ? <Alert tone="danger">{error}</Alert> : null}
              {notice ? <Alert tone="success">{notice}</Alert> : null}

              <button className="btn" type="submit" disabled={busy}>
                {busy ? "Confirm in wallet…" : "Approve and create subscription"}
              </button>
            </form>
          </Card>

          <div className="stack">
            <Card>
              <h2 style={{ fontSize: 17, marginBottom: 10 }}>How it works</h2>
              <StepList
                steps={[
                  { label: "Connect the customer wallet that funds the escrow.", state: account ? "done" : "todo" },
                  { label: `Switch to ${NETWORKS[chain].name} if needed.`, state: "todo" },
                  { label: "Approve the escrow amount for the subscription manager.", state: "todo" },
                  { label: "The subscription is created with the funded balance.", state: "todo" }
                ]}
              />
              {account ? (
                <p className="small muted" style={{ marginTop: 12 }}>
                  Connected wallet: <span className="mono">{shortenAddress(account)}</span>
                  {walletChainId !== null ? (
                    <>
                      {" · "}
                      network:{" "}
                      <strong>
                        {walletChainId === NETWORKS[chain].chainId
                          ? NETWORKS[chain].shortName
                          : `chain ${walletChainId} (${NETWORKS[chain].shortName} required)`}
                      </strong>
                    </>
                  ) : null}
                </p>
              ) : null}
            </Card>

            {createdSubId ? (
              <Card>
                <h2 style={{ fontSize: 17, marginBottom: 8 }}>Subscription created</h2>
                <KeyValue
                  items={[
                    {
                      label: "Subscription ID",
                      value: (
                        <span className="cluster" style={{ justifyContent: "flex-end" }}>
                          <span className="mono">{createdSubId.slice(0, 14)}…</span>
                          <CopyButton value={createdSubId} />
                        </span>
                      )
                    },
                    {
                      label: "Transaction",
                      value: createTx ? (
                        <a
                          className="hash"
                          href={explorerTxUrl(chain, createTx) ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {createTx.slice(0, 12)}…
                        </a>
                      ) : (
                        "—"
                      )
                    }
                  ]}
                />
                <button
                  className="btn secondary sm"
                  style={{ marginTop: 14 }}
                  type="button"
                  onClick={() => {
                    setTab("manage");
                    setSubId(createdSubId);
                  }}
                >
                  Open in manage
                </button>
              </Card>
            ) : null}

            <Alert tone="warning" title="Test token only">
              Escrow holds mock {TOKEN_SYMBOL}. It carries no real value and cannot be converted to fiat.
            </Alert>
          </div>
        </div>
      ) : null}

      {tab === "manage" ? (
        <div className="split">
          <Card pad-lg>
            <div className="form">
              <Field
                label="Subscription ID"
                htmlFor="manage-subid"
                hint="The bytes32 identifier returned when the subscription was created."
              >
                <input
                  id="manage-subid"
                  value={subId}
                  onChange={(event) => {
                    setSubId(event.target.value);
                    setSubscription(null);
                  }}
                  placeholder="0x…"
                />
              </Field>

              <Field label="Network" htmlFor="manage-chain">
                <select
                  id="manage-chain"
                  value={chain}
                  onChange={(event) => {
                    setChain(event.target.value as ChainKey);
                    setSubscription(null);
                  }}
                >
                  {(Object.keys(NETWORKS) as ChainKey[]).map((key) => (
                    <option key={key} value={key}>
                      {NETWORKS[key].name} · chain {NETWORKS[key].chainId}
                    </option>
                  ))}
                </select>
              </Field>

              {error ? <Alert tone="danger">{error}</Alert> : null}
              {notice ? <Alert tone="success">{notice}</Alert> : null}

              <div className="btn-row">
                <button className="btn" type="button" onClick={loadSubscription} disabled={busy}>
                  {busy ? "Reading chain state…" : "Read on-chain state"}
                </button>
              </div>
            </div>

            {subscription ? (
              <div style={{ marginTop: 22 }}>
                <div className="cluster" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 17 }}>On-chain state</h2>
                  <Badge tone={subscriptionMeta.tone}>{subscriptionMeta.label}</Badge>
                </div>

                <KeyValue
                  items={[
                    { label: "Customer", value: shortenAddress(subscription.customer) },
                    { label: "Merchant", value: shortenAddress(subscription.merchant) },
                    {
                      label: "Amount per period",
                      value: `AED ${formatUnitsSafe(subscription.amountPerPeriod, 2)}`
                    },
                    {
                      label: "Escrow balance",
                      value: `AED ${formatUnitsSafe(subscription.balance, 2)}`
                    },
                    { label: "Period", value: `${Math.round(Number(subscription.period) / 86400)} days` },
                    {
                      label: "Next charge",
                      value: subscription.nextChargeAt
                        ? `${formatDateTime(Number(subscription.nextChargeAt) * 1000)} (${formatRelative(Number(subscription.nextChargeAt) * 1000)})`
                        : "Not scheduled"
                    }
                  ]}
                />

                <div style={{ marginTop: 20 }}>
                  <h3 style={{ fontSize: 15, marginBottom: 8 }}>Actions</h3>
                  <p className="small muted" style={{ marginBottom: 12 }}>
                    {isMerchant
                      ? "You are connected as the merchant, so charging is available."
                      : isCustomer
                        ? "You are connected as the customer, so top-up, pause, resume and cancel are available."
                        : "Connect the customer or merchant wallet to perform the matching action."}
                  </p>

                  <div className="form" style={{ maxWidth: 360 }}>
                    <Field label="Top-up amount (AED)" htmlFor="manage-topup" error={fieldErrors.topUpAmount}>
                      <input
                        id="manage-topup"
                        inputMode="decimal"
                        value={topUpAmount}
                        onChange={(event) => setTopUpAmount(event.target.value)}
                        placeholder="25.00"
                      />
                    </Field>

                    <div className="btn-row">
                      <button
                        className="btn"
                        type="button"
                        disabled={busy || !isMerchant}
                        onClick={() => runAction("charge")}
                        title={isMerchant ? undefined : "Only the subscription merchant can charge"}
                      >
                        Charge customer
                      </button>
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={busy || !isCustomer}
                        onClick={() => runAction("topUp")}
                        title={isCustomer ? undefined : "Only the subscription customer can top up"}
                      >
                        Top up
                      </button>
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={busy || !isCustomer}
                        onClick={() => runAction("pause")}
                      >
                        Pause
                      </button>
                      <button
                        className="btn secondary"
                        type="button"
                        disabled={busy || !isCustomer}
                        onClick={() => runAction("resume")}
                      >
                        Resume
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        disabled={busy || !isCustomer}
                        onClick={() => runAction("cancel")}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>

                {actionTx ? (
                  <p className="small muted" style={{ marginTop: 14 }}>
                    Transaction:{" "}
                    <a
                      className="hash"
                      href={explorerTxUrl(chain, actionTx) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {actionTx.slice(0, 14)}…
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}
          </Card>

          <div className="stack">
            <Card>
              <h2 style={{ fontSize: 17, marginBottom: 10 }}>Who can do what</h2>
              <div className="stack-sm small muted">
                <p>
                  <strong>Merchant:</strong> charges the escrow when a period is due. Charging is manual —
                  nothing happens automatically.
                </p>
                <p>
                  <strong>Customer:</strong> tops up the balance, pauses, resumes and cancels. Cancelling
                  refunds the remaining escrow balance.
                </p>
                <p>The contract rejects actions from any other wallet.</p>
              </div>
            </Card>

            <Alert tone="info" title="Reading live state">
              On-chain state is read directly from the {NETWORKS[chain].name} contract after you connect a
              wallet, so the values shown are never simulated.
            </Alert>
          </div>
        </div>
      ) : null}

      {tab === "records" ? (
        <Card flush>
          <div className="card-head">
            <div className="stack-sm">
              <h2>Subscriptions recorded by the gateway</h2>
              <p className="muted small">Loaded from GET /api/subscriptions for this merchant.</p>
            </div>
            <button className="btn ghost sm" type="button" onClick={loadRecords} disabled={recordsLoading}>
              {recordsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <div className="card-body">
            {recordsLoading ? (
              <p className="muted small">Loading records…</p>
            ) : records.length === 0 ? (
              <EmptyState
                title="No subscription records"
                description="The gateway has no stored subscription records for this merchant yet."
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Subscription ID</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Per period</th>
                      <th scope="col">Status</th>
                      <th scope="col">Next charge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record._id}>
                        <td className="mono">{record.subscriptionId.slice(0, 14)}…</td>
                        <td className="mono">{shortenAddress(record.customerAddress)}</td>
                        <td className="num">AED {formatAmount(record.amountPerPeriod)}</td>
                        <td>
                          <Badge tone={subscriptionStatusMeta(record.status).tone}>
                            {subscriptionStatusMeta(record.status).label}
                          </Badge>
                        </td>
                        <td className="muted">{formatDateTime(record.nextChargeAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      ) : null}
    </Shell>
  );
}
