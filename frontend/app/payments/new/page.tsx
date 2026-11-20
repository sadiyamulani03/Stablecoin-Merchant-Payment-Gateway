"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "../../../components/Shell";
import { Alert, Badge, Card, Field, KeyValue, StepList } from "../../../components/ui";
import CopyButton from "../../../components/CopyButton";
import { useSession } from "../../../components/SessionProvider";
import { apiFetch, ApiError } from "../../../lib/api";
import { NETWORKS, TOKEN_SYMBOL, type ChainKey } from "../../../lib/config";
import { explorerTxUrl, formatAmount, formatDateTime, paymentStatusMeta } from "../../../lib/format";
import { recordPayment } from "../../../lib/ledger";
import type { CreatePaymentResponse, PaymentStatus, PaymentStatusResponse } from "../../../lib/types";
import { amountSchema, descriptionSchema, zodFieldErrors, type FieldErrors } from "../../../lib/validation";

export default function NewPayment() {
  const router = useRouter();
  const { session, isResolved } = useSession();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [chain, setChain] = useState<ChainKey>("adi-testnet");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreatePaymentResponse | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);

  const merchantId = session?.merchantId ?? null;

  useEffect(() => {
    if (isResolved && !merchantId) router.replace("/login");
  }, [isResolved, merchantId, router]);

  useEffect(() => {
    if (!result) return;
    const created = result;
    let active = true;

    async function refresh() {
      try {
        const response = await apiFetch<PaymentStatusResponse>(
          `/api/payments/${created.paymentId}?chain=${created.chain}`
        );
        if (active) setStatus(response.status);
      } catch {
        /* keep the last known status */
      }
    }

    void refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [result]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError("");

    const parsedAmount = amountSchema.safeParse(amount);
    const parsedDescription = descriptionSchema.safeParse(description);
    if (!parsedAmount.success || !parsedDescription.success) {
      const errors: FieldErrors = {};
      if (!parsedAmount.success) Object.assign(errors, zodFieldErrors(parsedAmount.error));
      if (!parsedDescription.success) Object.assign(errors, zodFieldErrors(parsedDescription.error));
      setFieldErrors(errors);
      return;
    }
    if (!merchantId) {
      setFormError("Please sign in before creating a payment request.");
      return;
    }

    setBusy(true);
    try {
      const response = await apiFetch<CreatePaymentResponse>("/api/payments/create", {
        method: "POST",
        auth: true,
        body: {
          merchantId,
          amount: parsedAmount.data,
          description: parsedDescription.data,
          chain
        }
      });

      recordPayment(merchantId, {
        paymentId: response.paymentId,
        chain: response.chain,
        amount: parsedAmount.data,
        description: parsedDescription.data,
        createdAt: new Date().toISOString(),
        expiresAt: response.expiresAt,
        txHash: response.txHash
      });

      setResult(response);
      setStatus("pending");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setFormError("Your session expired. Please sign in again.");
      } else {
        setFormError(error instanceof Error ? error.message : "Could not create the payment request.");
      }
    } finally {
      setBusy(false);
    }
  }

  const statusMeta = paymentStatusMeta(status);
  const shareUrl = result?.qrPayload?.url ?? "";
  const txUrl = result ? explorerTxUrl(result.chain, result.txHash) : null;

  if (!isResolved || !merchantId) {
    return (
      <Shell>
        <div className="pagehead">
          <div>
            <div className="eyebrow">Collect a payment</div>
            <h1>New payment request</h1>
          </div>
        </div>
        <Alert tone="info">Checking your session…</Alert>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="pagehead">
        <div>
          <div className="eyebrow">Collect a payment</div>
          <h1>New payment request</h1>
          <p>
            Creates an on-chain intent and a QR code your customer can scan from any device. Amounts are
            denominated in {TOKEN_SYMBOL} test units displayed as AED.
          </p>
        </div>
        <Link className="btn secondary" href="/history">
          Payment history
        </Link>
      </div>

      <div className="split">
        <Card pad-lg>
          <form className="form" onSubmit={submit} noValidate>
            <Field
              label="Amount (AED)"
              htmlFor="amount"
              hint="Up to two decimal places. Settled in mock mDDSC test tokens."
              error={fieldErrors.amount}
            >
              <input
                id="amount"
                name="amount"
                required
                inputMode="decimal"
                placeholder="125.50"
                value={amount}
                aria-invalid={fieldErrors.amount ? "true" : undefined}
                onChange={(event) => setAmount(event.target.value)}
              />
            </Field>

            <Field
              label="Description"
              htmlFor="description"
              hint="Optional. Appears in your payment history and on the checkout screen."
              error={fieldErrors.description}
            >
              <textarea
                id="description"
                name="description"
                rows={3}
                maxLength={200}
                placeholder="Order 4821 · Table 7"
                value={description}
                aria-invalid={fieldErrors.description ? "true" : undefined}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>

            <Field label="Network" htmlFor="chain" hint="The customer must pay on the same network.">
              <select
                id="chain"
                name="chain"
                value={chain}
                onChange={(event) => setChain(event.target.value as ChainKey)}
              >
                {(Object.keys(NETWORKS) as ChainKey[]).map((key) => (
                  <option key={key} value={key}>
                    {NETWORKS[key].name} · chain {NETWORKS[key].chainId}
                  </option>
                ))}
              </select>
            </Field>

            {formError ? <Alert tone="danger">{formError}</Alert> : null}

            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Creating on-chain intent…" : "Create request and QR code"}
            </button>
          </form>
        </Card>

        <div className="stack">
          {result ? (
            <Card>
              <div className="cluster" style={{ justifyContent: "space-between", marginBottom: 14 }}>
                <h2 style={{ fontSize: 17 }}>Payment request ready</h2>
                <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
              </div>

              {result.qrCode ? (
                <Image
                  className="qr"
                  src={result.qrCode}
                  alt={`QR code for payment request ${result.paymentId}`}
                  width={240}
                  height={240}
                  unoptimized
                />
              ) : null}

              <div className="stack" style={{ marginTop: 16 }}>
                <KeyValue
                  items={[
                    { label: "Amount", value: `AED ${formatAmount(result.qrPayload?.amount ?? amount)}` },
                    { label: "Network", value: NETWORKS[result.chain].name },
                    { label: "Expires", value: formatDateTime(result.expiresAt) },
                    {
                      label: "Payment ID",
                      value: (
                        <span className="cluster" style={{ justifyContent: "flex-end" }}>
                          <span className="mono">{result.paymentId.slice(0, 10)}…</span>
                          <CopyButton value={result.paymentId} />
                        </span>
                      )
                    }
                  ]}
                />
              </div>

              <div className="btn-row" style={{ marginTop: 16 }}>
                <CopyButton value={shareUrl} label="Copy payment link" className="btn secondary sm" />
                <Link
                  className="btn sm"
                  href={`/pay/${result.paymentId}?chain=${result.chain}`}
                  target="_blank"
                >
                  Open checkout
                </Link>
              </div>

              {txUrl ? (
                <p className="small muted" style={{ marginTop: 14 }}>
                  Intent transaction:{" "}
                  <a className="hash" href={txUrl} target="_blank" rel="noreferrer">
                    {result.txHash.slice(0, 14)}…
                  </a>
                </p>
              ) : null}
            </Card>
          ) : (
            <Card>
              <h2 style={{ fontSize: 17, marginBottom: 8 }}>How this works</h2>
              <StepList
                steps={[
                  { label: "Create the request — an on-chain intent is published by the gateway.", state: "todo" },
                  { label: "Share the QR code or payment link with your customer.", state: "todo" },
                  { label: "The customer approves and pays from their own wallet.", state: "todo" },
                  { label: "The status above updates automatically from the chain.", state: "todo" }
                ]}
              />
              <div style={{ marginTop: 14 }}>
                <Alert tone="warning" title="Test token only">
                  Requests settle in mDDSC, a mock stablecoin. No real AED or DDSC value moves.
                </Alert>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
