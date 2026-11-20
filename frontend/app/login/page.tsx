"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "../../components/Shell";
import { Alert, Field } from "../../components/ui";
import { useSession } from "../../components/SessionProvider";
import { apiFetch, ApiError } from "../../lib/api";
import type { AuthResponse } from "../../lib/types";
import { loginSchema, zodFieldErrors, type FieldErrors } from "../../lib/validation";

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "That email and password combination was not recognised.";
    if (error.status === 400) return "Enter a valid email address and password.";
    if (error.status === 503) return "The gateway database is unavailable right now. Try again shortly.";
    return error.message;
  }
  return "Sign in failed. Try again.";
}

export default function Login() {
  const router = useRouter();
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

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
