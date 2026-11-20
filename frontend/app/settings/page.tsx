"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "../../components/Shell";
import { Alert, Badge, Card, KeyValue, SkeletonLines } from "../../components/ui";
import CopyButton from "../../components/CopyButton";
import { useSession } from "../../components/SessionProvider";
import { apiFetch } from "../../lib/api";
import { DEPLOYMENTS, NETWORKS, TOKEN_SYMBOL, type ChainKey } from "../../lib/config";
import { explorerAddressUrl, formatDateTime, shortenAddress } from "../../lib/format";
import type { MerchantSummary } from "../../lib/types";

export default function Settings() {
  const router = useRouter();
  const { session, isResolved } = useSession();
  const merchantId = session?.merchantId ?? null;
  const [profile, setProfile] = useState<MerchantSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isResolved) return;
    if (!merchantId) {
      router.replace("/login");
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const response = await apiFetch<MerchantSummary>(`/api/merchants/${merchantId}`, {
          auth: true,
          signal: controller.signal
        });
        setProfile(response);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load your profile.");
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [merchantId, isResolved, router]);

  if (!isResolved || !merchantId) {
    return (
      <Shell>
        <div className="pagehead">
          <div>
            <div className="eyebrow">Merchant configuration</div>
            <h1>Settings</h1>
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
          <div className="eyebrow">Merchant configuration</div>
          <h1>Settings</h1>
          <p>Your merchant profile, session details and the networks this frontend is connected to.</p>
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: 18 }}>
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className="split">
        <div className="stack">
          <Card>
            <div className="cluster" style={{ justifyContent: "space-between", marginBottom: 14 }}>
              <h2 style={{ fontSize: 17 }}>Merchant profile</h2>
              {profile ? <Badge tone="success">{profile.merchant.status}</Badge> : null}
            </div>
            {profile ? (
              <KeyValue
                items={[
                  { label: "Business name", value: profile.merchant.name },
                  { label: "Email", value: profile.merchant.email },
                  { label: "Emirate", value: profile.merchant.emirate },
                  { label: "Category", value: profile.merchant.category },
                  { label: "Trade licence", value: profile.merchant.tradeLicense || "—" },
                  {
                    label: "Settlement preference",
                    value: profile.merchant.settlementPreference
                  },
                  {
                    label: "Receiving wallet",
                    value: (
                      <span className="cluster" style={{ justifyContent: "flex-end" }}>
                        <span className="mono" title={profile.merchant.walletAddress}>
                          {shortenAddress(profile.merchant.walletAddress)}
                        </span>
                        <CopyButton value={profile.merchant.walletAddress} />
                      </span>
                    )
                  },
                  { label: "Created", value: formatDateTime(profile.merchant.createdAt) }
                ]}
              />
            ) : (
              <SkeletonLines count={6} />
            )}
            <div style={{ marginTop: 16 }}>
              <Alert tone="info" title="Read-only in this build">
                Profile edits, API key issuance and webhook configuration are not enabled yet. The profile
                is captured during onboarding.
              </Alert>
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: 17, marginBottom: 12 }}>Session</h2>
            <KeyValue
              items={[
                { label: "Signed in as", value: session?.name || session?.email || "—" },
                { label: "Account email", value: session?.email || "—" },
                {
                  label: "Session expires",
                  value: session?.expiresAt ? formatDateTime(session.expiresAt) : "Unknown"
                },
                { label: "Storage", value: "Browser storage on this device only" }
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <Alert tone="warning" title="Token handling">
                Your session token is stored in this browser so it can be sent as a bearer token. Sign out
                on shared devices, and do not use this prototype with real funds or production credentials.
              </Alert>
            </div>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <h2 style={{ fontSize: 17, marginBottom: 12 }}>Networks</h2>
            <div className="stack">
              {(Object.keys(NETWORKS) as ChainKey[]).map((chain) => {
                const deployment = DEPLOYMENTS[chain];
                return (
                  <div key={chain} className="stack-sm" style={{ paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
                    <div className="cluster" style={{ justifyContent: "space-between" }}>
                      <strong>{NETWORKS[chain].name}</strong>
                      <span className="badge neutral">chain {NETWORKS[chain].chainId}</span>
                    </div>
                    <div className="stack-sm small muted">
                      <span>
                        Token ({TOKEN_SYMBOL}):{" "}
                        <span className="mono">{shortenAddress(deployment.token)}</span>
                      </span>
                      <span>
                        Payment router: <span className="mono">{shortenAddress(deployment.router)}</span>
                      </span>
                      <span>
                        Subscriptions: <span className="mono">{shortenAddress(deployment.subscriptions)}</span>
                      </span>
                    </div>
                    <div className="btn-row">
                      <a
                        className="btn ghost sm"
                        href={explorerAddressUrl(chain, deployment.router) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Router on explorer
                      </a>
                      <a
                        className="btn ghost sm"
                        href={explorerAddressUrl(chain, deployment.token) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Token on explorer
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <h2 style={{ fontSize: 17, marginBottom: 10 }}>Security notes</h2>
            <ul className="stack-sm small muted" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Private keys never belong in this frontend or in merchant settings.</li>
              <li>{TOKEN_SYMBOL} is a mock token. Requests have no real AED value.</li>
              <li>Refunds and subscription charges are contract transactions and can be rejected on-chain.</li>
              <li>
                Need the API surface?{" "}
                <Link className="link" href="/api-docs">
                  See the API reference
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
