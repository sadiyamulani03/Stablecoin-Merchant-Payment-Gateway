"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "../../components/Shell";
import { Alert, Badge, Card, EmptyState, SkeletonLines } from "../../components/ui";
import CopyButton from "../../components/CopyButton";
import { useSession } from "../../components/SessionProvider";
import { apiFetch } from "../../lib/api";
import { NETWORKS, type ChainKey } from "../../lib/config";
import { explorerTxUrl, formatAmount, formatDateTime, paymentStatusMeta } from "../../lib/format";
import { listPayments, type LedgerEntry } from "../../lib/ledger";
import type { PaymentStatus, PaymentStatusResponse } from "../../lib/types";

type HistoryRow = {
  entry: LedgerEntry;
  status: PaymentStatus | null;
};

type Filter = "all" | "pending" | "paid" | "refunded" | "expired";

export default function History() {
  const router = useRouter();
  const { session, isResolved } = useSession();
  const merchantId = session?.merchantId ?? null;

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [chainFilter, setChainFilter] = useState<ChainKey | "all">("all");

  useEffect(() => {
    if (!isResolved) return;
    if (!merchantId) {
      router.replace("/login");
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const entries = listPayments(merchantId);
        const withStatus = await Promise.all(
          entries.map(async (entry) => {
            try {
              const response = await apiFetch<PaymentStatusResponse>(
                `/api/payments/${entry.paymentId}?chain=${entry.chain}`,
                { signal: controller.signal }
              );
              return { entry, status: response.status };
            } catch {
              return { entry, status: null };
            }
          })
        );
        setRows(withStatus);
        setError("");
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load payment history.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [merchantId, isResolved, router]);

  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (chainFilter !== "all" && row.entry.chain !== chainFilter) return false;
        if (filter === "all") return true;
        return row.status === filter;
      }),
    [rows, filter, chainFilter]
  );

  if (!isResolved || !merchantId) {
    return (
      <Shell>
        <div className="pagehead">
          <div>
            <div className="eyebrow">Reconciliation</div>
            <h1>Payment history</h1>
          </div>
        </div>
        <Card>
          <SkeletonLines count={5} />
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="pagehead">
        <div>
          <div className="eyebrow">Reconciliation</div>
          <h1>Payment history</h1>
          <p>
            Every payment request you created from this browser, with its live settlement status read back
            from the gateway and the chain.
          </p>
        </div>
        <Link className="btn" href="/payments/new">
          New payment request
        </Link>
      </div>

      {error ? (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Card flush>
        <div className="card-head" style={{ flexWrap: "wrap" }}>
          <div className="tabs" style={{ margin: 0, border: 0 }}>
            {(["all", "pending", "paid", "refunded", "expired"] as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                className="tab"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All" : paymentStatusMeta(value).label}
              </button>
            ))}
          </div>

          <select
            aria-label="Filter by network"
            value={chainFilter}
            onChange={(event) => setChainFilter(event.target.value as ChainKey | "all")}
            style={{ width: "auto" }}
          >
            <option value="all">All networks</option>
            {(Object.keys(NETWORKS) as ChainKey[]).map((chain) => (
              <option key={chain} value={chain}>
                {NETWORKS[chain].shortName}
              </option>
            ))}
          </select>
        </div>

        <div className="card-body">
          {loading ? (
            <SkeletonLines count={5} />
          ) : visibleRows.length === 0 ? (
            <EmptyState
              title={rows.length === 0 ? "No payment requests yet" : "No payments match this filter"}
              description={
                rows.length === 0
                  ? "Requests you create are listed here with their settlement status and transaction links."
                  : "Try a different status or network filter."
              }
              action={
                rows.length === 0 ? (
                  <Link className="btn" href="/payments/new">
                    Create payment request
                  </Link>
                ) : undefined
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
                    <th scope="col">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const meta = paymentStatusMeta(row.status);
                    const txUrl = explorerTxUrl(row.entry.chain, row.entry.txHash);
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
                        <td className="muted">
                          {formatDateTime(row.entry.createdAt)}
                          <div className="small muted-soft">{row.entry.paymentId.slice(0, 12)}…</div>
                        </td>
                        <td>
                          {txUrl ? (
                            <a className="hash" href={txUrl} target="_blank" rel="noreferrer">
                              {row.entry.txHash.slice(0, 10)}…
                            </a>
                          ) : (
                            <span className="muted small">Not available</span>
                          )}
                          <div>
                            <CopyButton value={row.entry.paymentId} label="Copy ID" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <div style={{ marginTop: 18 }}>
        <Alert tone="info" title="Where this list comes from">
          The gateway currently exposes payment status per request but no server-side payment list
          endpoint. This page therefore tracks the requests created in this browser and re-reads each
          one from the gateway for its live status. A server-side list endpoint is required for
          cross-device history.
        </Alert>
      </div>
    </Shell>
  );
}
