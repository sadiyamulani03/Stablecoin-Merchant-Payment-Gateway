"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import Shell from "../../components/Shell";
import { Alert, Field } from "../../components/ui";
import { useSession } from "../../components/SessionProvider";
import { apiFetch, ApiError } from "../../lib/api";
import type { AuthResponse } from "../../lib/types";
import { loginSchema, zodFieldErrors, type FieldErrors } from "../../lib/validation";
import { usePrivy, useIdentityToken, useWallets, useCreateWallet } from "@privy-io/react-auth";
import { isPrivyConfigured } from "../../lib/privy";
import { findEmbeddedEthereumWallet } from "../../lib/privy";
import { saveWalletSession } from "../../lib/auth";

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "That email and password combination was not recognised.";
    if (error.status === 400) return "Enter a valid email address and password.";
    if (error.status === 503) return "The gateway database is unavailable right now. Try again shortly.";
    return error.message;
  }
  return "Sign in failed. Try again.";
}

type VerifyPrivyResponse = {
  userId: string;
  email: string | null;
  walletAddress: string;
  walletChainType: string | null;
  walletType: string | null;
};

export default function Login() {
  const router = useRouter();
  const pathname = usePathname();
  const { signIn } = useSession();
  const { login, authenticated, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet: createEmbeddedWallet } = useCreateWallet();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [walletStatus, setWalletStatus] = useState<"idle" | "creating" | "ready" | "error">("idle");
  const privyEnabled = isPrivyConfigured();
  const embeddedWallet = findEmbeddedEthereumWallet(wallets);
  const verifyAttempted = useRef(false);
  const creationAttempted = useRef(false);

  useEffect(() => {
    if (!authenticated || !walletsReady) return;

    if (embeddedWallet) {
      if (verifyAttempted.current) return;
      verifyAttempted.current = true;
      setWalletStatus("ready");
      (async () => {
        try {
          const walletAddress = embeddedWallet.address;
          const accessToken = await getAccessToken();
          if (!accessToken) {
            setFormError("Unable to obtain Privy access token. Try again.");
            setWalletStatus("error");
            return;
          }
          const verified = await apiFetch<VerifyPrivyResponse>("/api/auth/privy/verify", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ idToken: accessToken, identityToken })
          });
          if (verified.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
            setFormError("Wallet ownership verification failed. Please try signing in again.");
            setWalletStatus("error");
            return;
          }
          saveWalletSession({
            address: verified.walletAddress,
            email: verified.email ?? null,
            provider: "privy"
          });
          router.push("/dashboard");
        } catch (error) {
          setFormError(error instanceof Error ? error.message : "Privy sign-in failed. Try again.");
          setWalletStatus("error");
        }
      })();
      return;
    }

    if (creationAttempted.current) return;

    creationAttempted.current = true;
    setWalletStatus("creating");

    createEmbeddedWallet()
      .then(() => {
        // Wallet created. The wallets array updates, embeddedWallet changes,
        // and this effect re-runs to proceed to verification.
      })
      .catch((error) => {
        setWalletStatus("error");
        setFormError(error instanceof Error ? error.message : "Failed to create embedded wallet. Please try again.");
      });
  }, [authenticated, walletsReady, embeddedWallet, walletStatus, createEmbeddedWallet, router, pathname, getAccessToken, identityToken]);

  async function handleGoogleLogin() {
    setGoogleBusy(true);
    setFormError("");
    setWalletStatus("idle");
    verifyAttempted.current = false;
    creationAttempted.current = false;
    try {
      await login();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Google sign-in failed. Try again."
      );
      setWalletStatus("error");
    } finally {
      setGoogleBusy(false);
    }
  }

  const retryWalletCreation = useCallback(() => {
    verifyAttempted.current = false;
    creationAttempted.current = false;
    setFormError("");
    setWalletStatus("idle");
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError("");

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setBusy(true);
    try {
      const response = await apiFetch<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: parsed.data
      });
      signIn({
        token: response.token,
        merchantId: response.merchantId,
        name: response.name,
        remember
      });
      router.push("/dashboard");
    } catch (error) {
      setFormError(loginErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="center">
        <div className="split" style={{ width: "100%", maxWidth: 900 }}>
          <div className="card pad-lg">
            <div className="eyebrow">Merchant portal</div>
            <h1 style={{ fontSize: 28, margin: "10px 0 6px" }}>Welcome back</h1>
            <p className="muted" style={{ marginBottom: 22 }}>
              Sign in to create payment requests and track settlement on both testnets.
            </p>

            {privyEnabled ? (
              <div style={{ marginBottom: 18 }}>
                <button
                  className="btn block"
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={googleBusy || walletStatus === "creating"}
                >
                  {walletStatus === "creating"
                    ? "Creating your embedded wallet…"
                    : googleBusy
                      ? "Signing in with Google…"
                      : "Continue with Google"}
                </button>
                {walletStatus === "error" ? (
                  <div style={{ marginTop: 8 }}>
                    <Alert tone="danger">
                      {formError || "Could not create or retrieve your embedded wallet. Try again."}
                    </Alert>
                    <button
                      className="btn block"
                      type="button"
                      onClick={retryWalletCreation}
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
                <p className="small muted" style={{ marginTop: 8 }}>
                  Creates or retrieves an embedded Polygon Amoy wallet. No password required.
                </p>
              </div>
            ) : null}

            {privyEnabled ? (
              <div style={{ marginBottom: 10, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
                <span className="small muted" style={{ opacity: 0.6 }}>&mdash; or &mdash;</span>
              </div>
            ) : null}

            <form className="form" onSubmit={submit} noValidate>
              <Field label="Email" htmlFor="email" error={fieldErrors.email}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  aria-invalid={fieldErrors.email ? "true" : undefined}
                  aria-describedby={fieldErrors.email ? "email-error" : undefined}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="merchant@example.com"
                />
              </Field>

              <Field label="Password" htmlFor="password" error={fieldErrors.password}>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  aria-invalid={fieldErrors.password ? "true" : undefined}
                  aria-describedby={fieldErrors.password ? "password-error" : undefined}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>Keep me signed in on this device. Leave this off to sign out when the tab closes.</span>
              </label>

              {formError ? <Alert tone="danger">{formError}</Alert> : null}

              <button className="btn block" type="submit" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <p className="small muted" style={{ marginTop: 18 }}>
              New to MizanPay?{" "}
              <Link className="link" href="/register">
                Create a merchant account
              </Link>
            </p>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Testnet workspace</h2>
            <div className="stack-sm small muted">
              <p>Sessions expire 12 hours after sign-in.</p>
              <p>Payments settle in mDDSC, a mock stablecoin with no real value.</p>
              <p>Supported networks: ADI AB Testnet (99999) and Polygon Amoy (80002).</p>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
