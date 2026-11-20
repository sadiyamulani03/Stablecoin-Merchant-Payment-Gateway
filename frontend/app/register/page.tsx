"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell from "../../components/Shell";
import { Alert, Field } from "../../components/ui";
import { useSession } from "../../components/SessionProvider";
import { apiFetch, ApiError } from "../../lib/api";
import type { AuthResponse } from "../../lib/types";
import {
  backendFieldErrors,
  registerSchema,
  zodFieldErrors,
  type FieldErrors
} from "../../lib/validation";

const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah"
];

const CATEGORIES = [
  "Retail",
  "Food and beverage",
  "Transport",
  "Travel",
  "Healthcare",
  "Professional services",
  "Education",
  "Other"
];

const INITIAL_FORM = {
  name: "",
  tradeLicense: "",
  emirate: "Dubai",
  category: "Retail",
  settlementPreference: "stablecoin" as "stablecoin" | "partner-fiat",
  walletAddress: "",
  email: "",
  password: ""
};

function registrationErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "An account already exists for that email address.";
    if (error.status === 400) return "Some details were rejected. Review the highlighted fields.";
    if (error.status === 503) return "The gateway database is unavailable right now. Try again shortly.";
    return error.message;
  }
  return "Registration failed. Try again.";
}

export default function Register() {
  const router = useRouter();
  const { signIn } = useSession();
  const [form, setForm] = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof INITIAL_FORM, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setFormError("");

    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(parsed.error));
      return;
    }

    setBusy(true);
    try {
      const response = await apiFetch<AuthResponse>("/api/merchants/onboard", {
        method: "POST",
        body: parsed.data
      });
      signIn({
        token: response.token,
        merchantId: response.merchantId,
        name: form.name,
        remember: true
      });
      router.push("/dashboard");
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        const serverErrors = backendFieldErrors(error.fieldErrors);
        if (Object.keys(serverErrors).length > 0) setFieldErrors(serverErrors);
      }
      setFormError(registrationErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="pagehead">
        <div>
          <div className="eyebrow">Merchant onboarding</div>
          <h1>Create your merchant account</h1>
          <p>
            Set up a testnet merchant profile and a receiving wallet. You can create payment requests
            as soon as onboarding completes.
          </p>
        </div>
        <Link className="btn secondary" href="/login">
          I already have an account
        </Link>
      </div>

      <div className="split">
        <div className="card pad-lg">
          <form className="form" onSubmit={submit} noValidate>
            <div className="form-grid">
              <Field label="Business name" htmlFor="name" error={fieldErrors.name}>
                <input
                  id="name"
                  name="name"
                  required
                  value={form.name}
                  aria-invalid={fieldErrors.name ? "true" : undefined}
                  onChange={(event) => update("name", event.target.value)}
                  placeholder="Al Noor Trading LLC"
                />
              </Field>

              <Field label="Trade licence reference" htmlFor="tradeLicense" error={fieldErrors.tradeLicense}>
                <input
                  id="tradeLicense"
                  name="tradeLicense"
                  required
                  value={form.tradeLicense}
                  aria-invalid={fieldErrors.tradeLicense ? "true" : undefined}
                  onChange={(event) => update("tradeLicense", event.target.value)}
                  placeholder="DED-123456"
                />
              </Field>

              <Field label="Emirate" htmlFor="emirate" error={fieldErrors.emirate}>
                <select
                  id="emirate"
                  name="emirate"
                  required
                  value={form.emirate}
                  aria-invalid={fieldErrors.emirate ? "true" : undefined}
                  onChange={(event) => update("emirate", event.target.value)}
                >
                  {EMIRATES.map((emirate) => (
                    <option key={emirate} value={emirate}>
                      {emirate}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Business category" htmlFor="category" error={fieldErrors.category}>
                <select
                  id="category"
                  name="category"
                  required
                  value={form.category}
                  aria-invalid={fieldErrors.category ? "true" : undefined}
                  onChange={(event) => update("category", event.target.value)}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field
              label="Merchant receiving wallet"
              htmlFor="walletAddress"
              hint="The address that receives settled payments on-chain. It must be an EVM address you control."
              error={fieldErrors.walletAddress}
            >
              <input
                id="walletAddress"
                name="walletAddress"
                required
                spellCheck={false}
                value={form.walletAddress}
                aria-invalid={fieldErrors.walletAddress ? "true" : undefined}
                onChange={(event) => update("walletAddress", event.target.value)}
                placeholder="0x…"
              />
            </Field>

            <div className="form-grid">
              <Field label="Email" htmlFor="email" error={fieldErrors.email}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  aria-invalid={fieldErrors.email ? "true" : undefined}
                  onChange={(event) => update("email", event.target.value)}
                  placeholder="merchant@example.com"
                />
              </Field>

              <Field
                label="Password"
                htmlFor="password"
                hint="At least 10 characters."
                error={fieldErrors.password}
              >
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={form.password}
                  aria-invalid={fieldErrors.password ? "true" : undefined}
                  onChange={(event) => update("password", event.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Settlement preference"
              htmlFor="settlementPreference"
              hint="Partner fiat settlement is not enabled in this testnet build."
              error={fieldErrors.settlementPreference}
            >
              <select
                id="settlementPreference"
                name="settlementPreference"
                value={form.settlementPreference}
                aria-invalid={fieldErrors.settlementPreference ? "true" : undefined}
                onChange={(event) =>
                  update("settlementPreference", event.target.value as "stablecoin" | "partner-fiat")
                }
              >
                <option value="stablecoin">Stablecoin (mDDSC)</option>
                <option value="partner-fiat">Licensed partner fiat — not enabled</option>
              </select>
            </Field>

            {formError ? <Alert tone="danger">{formError}</Alert> : null}

            <button className="btn" type="submit" disabled={busy}>
              {busy ? "Creating account…" : "Create merchant account"}
            </button>
          </form>
        </div>

        <div className="stack">
          <div className="card">
            <h2 style={{ fontSize: 17, marginBottom: 8 }}>What onboarding does</h2>
            <ul className="stack-sm small muted" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Creates a merchant record and returns a session token valid for 12 hours.</li>
              <li>Links your receiving wallet to every payment request you create.</li>
              <li>Does not move funds. Onboarding creates a database record only.</li>
            </ul>
          </div>

          <Alert tone="warning" title="Prototype limitation">
            Trade licence details are stored as supplied and are not verified against a KYC provider.
            The account is created with testnet status only.
          </Alert>
        </div>
      </div>
    </Shell>
  );
}
