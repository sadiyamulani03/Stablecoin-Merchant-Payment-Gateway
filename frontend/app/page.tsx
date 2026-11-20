import Link from "next/link";
import Shell from "../components/Shell";
import { NETWORKS, TOKEN_SYMBOL, type ChainKey } from "../lib/config";

const STEPS = [
  {
    eyebrow: "01 · Request",
    title: "Create a payment request",
    body: "Set an amount, pick ADI AB Testnet or Polygon Amoy, and get a QR code plus a shareable payment link."
  },
  {
    eyebrow: "02 · Pay",
    title: "Customer settles from their wallet",
    body: `The customer connects an EVM wallet, approves ${TOKEN_SYMBOL}, and confirms the payment on-chain.`
  },
  {
    eyebrow: "03 · Reconcile",
    title: "Track settlement state",
    body: "Every request reports its live status, transaction hash and explorer link so you can reconcile each payment."
  }
];

export default function Home() {
  return (
    <Shell>
      <main className="hero">
        <div className="eyebrow">Merchant payments · Testnet build</div>
        <h1>Accept digital dirhams. Keep business moving.</h1>
        <p>
          A QR-first payment gateway for UAE merchants. Create payment requests, let customers settle from
          an EVM wallet, and reconcile every transaction across two testnets.
        </p>
        <div className="btn-row" style={{ marginTop: 28 }}>
          <Link className="btn" href="/register">
            Create merchant account
          </Link>
          <Link className="btn secondary" href="/login">
            Sign in
          </Link>
        </div>
      </main>

      <section className="grid" aria-label="How it works">
        {STEPS.map((step) => (
          <div className="card" key={step.eyebrow}>
            <div className="eyebrow">{step.eyebrow}</div>
            <h3 style={{ fontSize: 17, margin: "10px 0 8px" }}>{step.title}</h3>
            <p className="muted small">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="grid-2" style={{ marginTop: 20 }}>
        <div className="card">
          <h2 style={{ fontSize: 17, marginBottom: 12 }}>Supported networks</h2>
          <div className="stack-sm">
            {(Object.keys(NETWORKS) as ChainKey[]).map((chain) => (
              <div className="cluster" key={chain} style={{ justifyContent: "space-between" }}>
                <span>{NETWORKS[chain].name}</span>
                <span className="badge neutral">chain {NETWORKS[chain].chainId}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 style={{ fontSize: 17, marginBottom: 12 }}>What works today</h2>
          <ul className="stack-sm small muted" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Merchant onboarding, login and session handling.</li>
            <li>Payment requests with QR codes and share links.</li>
            <li>Wallet checkout with approval, payment and explorer links.</li>
            <li>Customer-funded subscription escrow with manual merchant charges.</li>
          </ul>
        </div>
      </section>

      <div className="notice" style={{ marginTop: 22 }}>
        Important: this build uses {TOKEN_SYMBOL}, a mock test token. It does not process real AED,
        official DDSC, AE Coin, or fiat settlement, and no production credentials belong in it.
      </div>
    </Shell>
  );
}
