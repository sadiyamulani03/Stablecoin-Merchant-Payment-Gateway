"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import Shell from "../../components/Shell";
import { Alert, Badge, Card, CardHead, EmptyState, KeyValue, Skeleton, SkeletonLines, Stat } from "../../components/ui";
import CopyButton from "../../components/CopyButton";
import { useSession } from "../../components/SessionProvider";
import { apiFetch, ApiError } from "../../lib/api";
import { NETWORKS, type ChainKey } from "../../lib/config";
import { explorerAddressUrl, formatAmount, formatRelative, paymentStatusMeta, shortenAddress } from "../../lib/format";
import { listPayments, type LedgerEntry } from "../../lib/ledger";
import type { AnalyticsSummary, MerchantSummary, PaymentStatus, PaymentStatusResponse } from "../../lib/types";

type HistoryRow = {
  entry: LedgerEntry;
  status: PaymentStatus | null;
};

type DashboardState = {
  loading: boolean;
  error: string;
  summary: AnalyticsSummary | null;
  merchant: MerchantSummary | null;
  rows: HistoryRow[];
};

const EMPTY_STATE: DashboardState = {
  loading: true,
  error: "",
  summary: null,
  merchant: null,
  rows: []
};

export default function Dashboard() {
  const router = useRouter();
  const { session, isResolved } = useSession();
  const [state, setState] = useState<DashboardState>(EMPTY_STATE);

  const merchantId = session?.merchantId ?? null;

  useEffect(() => {
    if (!isResolved) return;
    if (!merchantId) {
      router.replace("/login");
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const [summary, merchant] = await Promise.all([
          apiFetch<AnalyticsSummary>(`/api/analytics/summary?merchantId=${merchantId}`, {
            auth: true,
            signal: controller.signal
          }),
          apiFetch<MerchantSummary>(`/api/merchants/${merchantId}`, {
            auth: true,
            signal: controller.signal
          })
        ]);

        const entries = listPayments(merchantId).slice(0, 8);
        const rows: HistoryRow[] = await Promise.all(
          entries.map(async (entry) => {
            try {
              const status = await apiFetch<PaymentStatusResponse>(
                `/api/payments/${entry.paymentId}?chain=${entry.chain}`,
                { signal: controller.signal }
              );
              return { entry, status: status.status };
            } catch {
              return { entry, status: null };
            }
          })
        );

        setState({ loading: false, error: "", summary, merchant, rows });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof ApiError && error.status === 401
            ? "Your session expired. Please sign in again."
            : error instanceof Error
              ? error.message
              : "Could not load dashboard data.";
        setState({ ...EMPTY_STATE, loading: false, error: message });
      }
    }

    void load();
    return () => controller.abort();
  }, [merchantId, isResolved, router]);

  const chartData = useMemo(() => {
    if (!state.rows.length) return [];
    const buckets = new Map<string, { day: string; requests: number; volume: number }>();
    for (const row of state.rows) {
      const date = new Date(row.entry.createdAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = date.toISOString().slice(0, 10);
      const bucket = buckets.get(key) ?? { day: key, requests: 0, volume: 0 };
      bucket.requests += 1;
      bucket.volume += Number(row.entry.amount) || 0;
      buckets.set(key, bucket);
    }
    return [...buckets.values()].sort((left, right) => left.day.localeCompare(right.day));
  }, [state.rows]);

  if (!isResolved || (!merchantId && !state.error)) {
    return (
      <Shell>
        <div className="pagehead">
          <div>
            <div className="eyebrow">Merchant workspace</div>
            <h1>Dashboard</h1>
          </div>
        </div>
        <div className="grid">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="skeleton-block" />
          ))}
        </div>
      </Shell>
    );
  }

  const stats = state.merchant?.stats;
  const totalPayments = stats?.paymentCount ?? 0;
  const paidPayments = stats?.paidCount ?? 0;
  const pendingPayments = Math.max(totalPayments - paidPayments, 0);

  return (
    <Shell>
      <div className="pagehead">
        <div>
          <div className="eyebrow">Merchant workspace</div>
          <h1>Dashboard</h1>
          <p>
            {state.merchant?.merchant.name
              ? `Signed in as ${state.merchant.merchant.name}.`
              : "A clear view of every payment request and its settlement state."}
          </p>
        </div>
        <div className="btn-row">
          <Link className="btn secondary" href="/history">
            View all payments
          </Link>
          <Link className="btn" href="/payments/new">
            New payment
          </Link>
        </div>
      </div>

      {state.error ? (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="danger" title="Could not load dashboard">
            {state.error}
          </Alert>
        </div>
      ) : null}

      <section className="grid" aria-label="Payment statistics">
        <Stat
          label="Total payment requests"
          value={state.loading ? "—" : totalPayments}
          hint="Every request created for this merchant"
        />
        <Stat
          label="Successful payments"
          value={state.loading ? "—" : paidPayments}
          hint="Marked paid by the gateway"
        />
        <Stat
          label="Pending payments"
          value={state.loading ? "—" : pendingPayments}
          hint="Not settled yet"
        />
        <Stat
          label="Paid volume"
          value={state.loading ? "—" : `AED ${formatAmount(state.summary?.totalVolume)}`}
          hint={`Average ticket AED ${formatAmount(state.summary?.avgTicket)}`}
        />
      </section>

      <div className="split" style={{ marginTop: 20 }}>
        <Card flush>
          <CardHead
            title="Recent transactions"
            description="Requests created from this browser, refreshed against the gateway and the chain."
            action={
              <Link className="btn ghost sm" href="/history">
                See all
              </Link>
            }
          />
          <div className="card-body">
            {state.loading ? (
              <SkeletonLines count={4} />
            ) : state.rows.length === 0 ? (
              <EmptyState
                title="No payment requests yet"
                description="Create your first request to generate a QR code and a shareable payment link."
                action={
                  <Link className="btn" href="/payments/new">
                    Create payment request
                  </Link>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Amount</th>
                      <th scope="col">Network</th>
                      <th scope="col">Status</th>
                      <th scope="col">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((row) => {
                      const meta = paymentStatusMeta(row.status);
                      return (
                        <tr key={`${row.entry.chain}-${row.entry.paymentId}`}>
                          <td className="num">
                            <strong>AED {formatAmount(row.entry.amount)}</strong>
                            {row.entry.description ? (
                              <div className="muted small">{row.entry.description}</div>
                            ) : null}
                          </td>
                          <td>{NETWORKS[row.entry.chain].shortName}</td>
                          <td>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </td>
                          <td className="muted">{formatRelative(row.entry.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        <div className="stack">
          <Card>
            <h2 style={{ fontSize: 17, marginBottom: 4 }}>Request volume</h2>
            <p className="muted small" style={{ marginBottom: 14 }}>
              Payment requests created from this browser.
            </p>
            {chartData.length === 0 ? (
              <div className="stack-sm" style={{ padding: "18px 0" }}>
                <SkeletonLines count={3} />
                <p className="muted small">Charts appear once you create payment requests.</p>
              </div>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0f7a52" stopOpacity={0.28} />
                        <stop offset="100%" stopColor="#0f7a52" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e2e9e4" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#5d6f66" }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5d6f66" }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid #e2e9e4",
                        fontSize: 12,
                        boxShadow: "0 6px 24px rgba(11,26,20,0.08)"
                      }}
                      formatter={(value: number, name: string) =>
                        name === "requests" ? [value, "requests"] : [`AED ${formatAmount(value)}`, "volume"]
                      }
                      labelFormatter={(label: string) => new Date(label).toLocaleDateString("en-GB")}
                    />
                    <Area
                      type="monotone"
                      dataKey="requests"
                      stroke="#0f7a52"
                      strokeWidth={2}
                      fill="url(#volumeFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card>
            <h2 style={{ fontSize: 17, marginBottom: 12 }}>Merchant profile</h2>
            {state.loading ? (
              <SkeletonLines count={4} />
            ) : state.merchant ? (
              <KeyValue
                items={[
                  { label: "Business", value: state.merchant.merchant.name },
                  { label: "Status", value: <Badge tone="success">{state.merchant.merchant.status}</Badge> },
                  {
                    label: "Receiving wallet",
                    value: (
                      <span className="cluster" style={{ justifyContent: "flex-end" }}>
                        <span className="mono" title={state.merchant.merchant.walletAddress}>
                          {shortenAddress(state.merchant.merchant.walletAddress)}
                        </span>
                        <CopyButton value={state.merchant.merchant.walletAddress} label="Copy" />
                      </span>
                    )
                  },
                  {
                    label: "Trade licence",
                    value: state.merchant.merchant.tradeLicense || "—"
                  }
                ]}
              />
            ) : (
              <p className="muted small">Profile details are unavailable.</p>
            )}
            {state.merchant ? (
              <div className="cluster" style={{ marginTop: 14 }}>
                {(Object.keys(NETWORKS) as ChainKey[]).map((chain) => {
                  const href = explorerAddressUrl(chain, state.merchant?.merchant.walletAddress);
                  return href ? (
                    <a key={chain} className="btn ghost sm" href={href} target="_blank" rel="noreferrer">
                      View on {NETWORKS[chain].shortName}
                    </a>
                  ) : null;
                })}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </Shell>
  );
}
