import Shell from "../../components/Shell";
import { Alert, Badge, Card } from "../../components/ui";
import { API_URL } from "../../lib/config";

const ENDPOINTS: { method: string; path: string; auth: string; description: string }[] = [
  {
    method: "POST",
    path: "/api/merchants/onboard",
    auth: "None",
    description: "Creates a merchant account and returns a session token."
  },
  {
    method: "POST",
    path: "/api/auth/login",
    auth: "None",
    description: "Exchanges email and password for a 12-hour session token."
  },
  {
    method: "GET",
    path: "/api/merchants/:id",
    auth: "Bearer JWT",
    description: "Merchant profile with payment counts. The id must match the token."
  },
  {
    method: "POST",
    path: "/api/payments/create",
    auth: "Bearer JWT",
    description: "Creates an on-chain payment intent and returns a QR payload."
  },
  {
    method: "GET",
    path: "/api/payments/:paymentId?chain=adi-testnet",
    auth: "None",
    description: "Reads live payment status from the chain for the given network."
  },
  {
    method: "POST",
    path: "/api/payments/:paymentId/refund",
    auth: "Bearer JWT",
    description: "Submits an admin-funded refund for a merchant-owned payment."
  },
  {
    method: "GET",
    path: "/api/subscriptions?merchantId=…",
    auth: "Bearer JWT",
    description: "Lists subscription records stored by the gateway."
  },
  {
    method: "GET",
    path: "/api/analytics/summary?merchantId=…",
    auth: "Bearer JWT",
    description: "Paid volume, transaction count and average ticket."
  },
  {
    method: "GET",
    path: "/health",
    auth: "None",
    description: "Service status and MongoDB connectivity."
  },
  {
    method: "POST",
    path: "/api/webhooks/chain",
    auth: "HMAC signature",
    description: "Chain notification intake for settled and refunded payments."
  }
];

const LIMITATIONS = [
  "There is no server-side payment list endpoint. The frontend tracks requests created in this browser and re-reads each one for live status.",
  "Subscription escrow is created and managed directly by the customer wallet through the contract. The merchant subscription creation endpoint returns 501.",
  "Subscription charges are manual. The gateway does not schedule or execute charges.",
  "Pause, resume, top-up and cancel are contract calls only and have no REST equivalent.",
  "Payment refunds require the contract owner, which is the gateway deployment signer."
];

export default function Docs() {
  return (
    <Shell>
      <div className="pagehead">
        <div>
          <div className="eyebrow">Developer resources</div>
          <h1>API reference</h1>
          <p>
            Base URL:{" "}
            <span className="mono">{API_URL || "not configured (set NEXT_PUBLIC_API_URL)"}</span>
          </p>
        </div>
        <Badge tone="info">Testnet gateway</Badge>
      </div>

      <Card flush>
        <div className="card-head">
          <h2>Endpoints</h2>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col">Endpoint</th>
                <th scope="col">Auth</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((endpoint) => (
                <tr key={`${endpoint.method} ${endpoint.path}`}>
                  <td>
                    <span className="badge neutral">{endpoint.method}</span>
                  </td>
                  <td>
                    <code>{endpoint.path}</code>
                  </td>
                  <td className="muted">{endpoint.auth}</td>
                  <td>{endpoint.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ marginTop: 18 }}>
        <Alert tone="info" title="Current limitations">
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {LIMITATIONS.map((limitation) => (
              <li key={limitation} style={{ marginBottom: 4 }}>
                {limitation}
              </li>
            ))}
          </ul>
        </Alert>
      </div>
    </Shell>
  );
}
