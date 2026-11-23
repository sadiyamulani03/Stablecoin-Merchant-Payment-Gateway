# Deployment Guide

## Prerequisites

- Node.js 22+
- Foundry (foundryup)
- A funded testnet deployer wallet for each network
- MySQL 8+ (for backend)
- Real private keys (never commit these)

## Step 1: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values. `.env` is git-ignored and must never be committed.

```
# Required: Separate deployer keys per network (NEVER reuse one key)
ADI_TESTNET_PRIVATE_KEY=0x<64-hex-characters>
POLYGON_AMOY_PRIVATE_KEY=0x<64-hex-characters>

# Required: Secrets
JWT_SECRET=at-least-32-random-characters
WEBHOOK_SECRET=a-long-random-secret
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/stablecoin_gateway"

# Optional: RPC URLs (defaults provided)
ADI_TESTNET_RPC_URL=https://rpc.ab.testnet.adifoundation.ai/
POLYGON_AMOY_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/<your-alchemy-api-key>
```

Security rules for this step:

- `.env` and `frontend/.env.local` are git-ignored. Only `.env.example` is tracked, and it must
  contain placeholders or empty values — never a live key, secret, or credential-bearing URI.
- An RPC URL that embeds a provider API key (for example an Alchemy app key in the URL path) **is a
  secret**. Keep it in `.env` only, mark it `sync: false` in `render.yaml`, and rotate it before
  publishing the repository or deploying to a hosted platform.
- A MySQL connection string that embeds a username and password is a secret. Use
  `mysql://USER:PASSWORD@HOST:3306/stablecoin_gateway` for local work and a managed MySQL URI with credentials
  supplied only through the environment.
- Use a separate deployer key per network. A single key used across chains means one compromise
  exposes both deployments and both administrative roles.

## Step 2: Install Dependencies

```bash
# Root dependencies
npm install

# Solidity dependencies
cd contracts
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
cd ..
```

## Step 3: Compile Contracts

```bash
cd contracts
forge build
cd ..
```

## Step 4: Deploy to ADI AB Testnet (Chain ID 99999)

```bash
cd contracts
source ../.env
DEPLOYER_PRIVATE_KEY="$ADI_TESTNET_PRIVATE_KEY" \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$ADI_TESTNET_RPC_URL" \
    --broadcast \
    --chain-id 99999
```

The script:
- Verifies chain ID is 99999 or 80002 (rejects all others)
- Deploys MockDDSC, PaymentRouter, SubscriptionManager
- Configures supported token on each contract
- Mints initial mDDSC to deployer
- Prints all addresses

Save output addresses:
```
ADI_TESTNET_TOKEN_ADDRESS=<printed>
ADI_TESTNET_PAYMENT_ROUTER_ADDRESS=<printed>
ADI_TESTNET_SUBSCRIPTION_MANAGER_ADDRESS=<printed>
```

## Step 5: Deploy to Polygon Amoy (Chain ID 80002)

```bash
cd contracts
source ../.env
DEPLOYER_PRIVATE_KEY="$POLYGON_AMOY_PRIVATE_KEY" \
  forge script script/Deploy.s.sol:Deploy \
    --rpc-url "$POLYGON_AMOY_RPC_URL" \
    --broadcast \
    --chain-id 80002
```

Save output addresses separately:
```
POLYGON_AMOY_TOKEN_ADDRESS=<printed>
POLYGON_AMOY_PAYMENT_ROUTER_ADDRESS=<printed>
POLYGON_AMOY_SUBSCRIPTION_MANAGER_ADDRESS=<printed>
```

## Step 6: Configure Backend

Add contract addresses to `.env`:

```
ADI_TESTNET_TOKEN_ADDRESS=0x...
ADI_TESTNET_PAYMENT_ROUTER_ADDRESS=0x...
ADI_TESTNET_SUBSCRIPTION_MANAGER_ADDRESS=0x...
POLYGON_AMOY_TOKEN_ADDRESS=0x...
POLYGON_AMOY_PAYMENT_ROUTER_ADDRESS=0x...
POLYGON_AMOY_SUBSCRIPTION_MANAGER_ADDRESS=0x...
```

Restart the backend after updating `.env`.

## Step 7: Configure Frontend

```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:

```
NEXT_PUBLIC_ADI_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_ADI_ROUTER_ADDRESS=0x...
NEXT_PUBLIC_ADI_SUBSCRIPTION_MANAGER_ADDRESS=0x...
NEXT_PUBLIC_POLYGON_TOKEN_ADDRESS=0x...
NEXT_PUBLIC_POLYGON_ROUTER_ADDRESS=0x...
NEXT_PUBLIC_POLYGON_SUBSCRIPTION_MANAGER_ADDRESS=0x...
```

Restart the frontend after updating `.env.local`.

## Step 8: Start Services

```bash
# MySQL
docker compose -f infra/docker-compose.yml up -d mysql

# Backend
npm run dev --workspace backend

# Frontend
npm run dev --workspace frontend
```

## Network Isolation

Each network has completely independent:
- Contract deployments (separate addresses)
- Environment variables
- Backend configuration
- Frontend configuration

Never use one network's contract addresses on the other network. The deploy script rejects chain IDs other than 99999 and 80002.

## Local Testing with Anvil

For local testing without testnet funds:

```bash
# Start anvil with chain ID 99999
anvil --chain-id 99999 --port 8545

# Deploy to local anvil
cd contracts
export DEPLOYER_PRIVATE_KEY=0xYOUR_ANVIL_TEST_ACCOUNT_PRIVATE_KEY
forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast --chain-id 99999

# Update .env with local addresses and RPC URL
```

## Verification

After deployment, verify:
1. `GET http://localhost:4000/health` returns both networks
2. Contract addresses are correctly configured per network
3. Payment creation succeeds on each network
4. Customer payment flow completes on-chain
5. Refund and subscription workflows work

---

# Hosting Deployment (Render + Vercel)

Target topology for the public testnet demonstration:

```
Vercel (Next.js frontend)  ──HTTPS──▶  Render (Fastify API)  ──TLS──▶  MySQL 8
                                                      └──JSON-RPC──▶ ADI AB Testnet (99999)
                                                                    └──JSON-RPC──▶ Polygon Amoy (80002)
```

The repository is an npm workspace monorepo (`backend`, `frontend`). Both platforms build from the
**repository root** so the committed root `package-lock.json` is used for reproducible installs.

| Requirement | Value |
|---|---|
| Node.js | `22.x` (root `package.json` `engines.node: >=22`) |
| Package manager | npm (workspace root) |
| Backend build | `npm ci && npm run build --workspace backend` |
| Backend start | `node backend/dist/src/index.js` |
| Backend health check | `GET /health` |
| Frontend build | `npm run build --workspace frontend` |
| Frontend output | `frontend/.next` |

Both workspaces also declare `engines.node: >=22` and expose a production `start` script
(`backend`: `node dist/src/index.js`).

## Render — Backend (Web Service)

### Exact dashboard settings

| Setting | Value |
|---|---|
| Service type | Web Service |
| Repository | this repository |
| Root Directory | *(leave empty — repository root)* |
| Runtime / Language | Node |
| Build Command | `npm ci && npm run build --workspace backend` |
| Start Command | `node backend/dist/src/index.js` |
| Health Check Path | `/health` |
| Node version | `22.x` (or set env `NODE_VERSION=22.x`) |
| Region | Singapore recommended for MENA latency (free tier is region-limited — pick an available region) |
| Instance type | Starter recommended; free tier sleeps and has no static outbound IP |
| Auto-Deploy | on for the demo branch |

`render.yaml` in the repository root encodes these settings as a Render Blueprint, except the
values that must be supplied per account (`DATABASE_URL`, `CORS_ORIGIN`, `FRONTEND_URL`, and the two
deployer keys).

The backend binds `0.0.0.0` and reads the injected `PORT`; **do not set `PORT` manually** — Render
injects it and the service must use that value.

### Environment variables — Render backend

**Public configuration (not secret).** Safe to read from logs and dashboards:

| Variable | Example / source | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Set by Render; enables the strict JWT-secret check |
| `NODE_VERSION` | `22.x` | Node runtime selector |
| `HOST` | `0.0.0.0` | Required container bind address |
| `LOG_LEVEL` | `info` | Fastify/pino level (`debug`, `info`, `warn`, `error`) |
| `CORS_ORIGIN` | `https://<project>.vercel.app` | Comma-separated allowlist; see CORS below |
| `FRONTEND_URL` | `https://<project>.vercel.app` | Used to build the customer payment URL in the QR payload |
| `DEFAULT_CHAIN` | `adi-testnet` | Fallback network when a request omits `chain` |
| `ADI_TESTNET_RPC_URL` | ADI testnet RPC URL | Public JSON-RPC endpoint |
| `POLYGON_AMOY_RPC_URL` | Polygon Amoy RPC URL | Public JSON-RPC endpoint |
| `ADI_TESTNET_TOKEN_ADDRESS` | deployed token address | Public |
| `ADI_TESTNET_PAYMENT_ROUTER_ADDRESS` | deployed router address | Public |
| `ADI_TESTNET_SUBSCRIPTION_MANAGER_ADDRESS` | deployed subscription manager | Public |
| `POLYGON_AMOY_TOKEN_ADDRESS` | deployed token address | Public |
| `POLYGON_AMOY_PAYMENT_ROUTER_ADDRESS` | deployed router address | Public |
| `POLYGON_AMOY_SUBSCRIPTION_MANAGER_ADDRESS` | deployed subscription manager | Public |

**Secrets — set only on Render.** Never place these in the Vercel project, in `NEXT_PUBLIC_*`
variables, in a repository file, or in a screenshot:

| Variable | Requirement |
|---|---|
| `DATABASE_URL` | MySQL connection string (credentials in the URI). Prefer a dedicated MySQL **database user** over the admin account. |
| `JWT_SECRET` | ≥ 32 characters. Startup **fails fast** in `NODE_ENV=production` if shorter. |
| `WEBHOOK_SECRET` | Long random secret used for HMAC webhook verification. |
| `ADI_TESTNET_PRIVATE_KEY` | Testnet deployer key used to submit on-chain intents and refunds. |
| `POLYGON_AMOY_PRIVATE_KEY` | Polygon Amoy deployer key (use a separate key per network). |
| `ADI_TESTNET_RPC_URL` | RPC endpoint for chain 99999. |
| `POLYGON_AMOY_RPC_URL` | RPC endpoint for chain 80002. **Embeds a provider API key, so treat the whole URL as a secret.** |

Render encrypts service environment variables at rest; mark them *Secret* so they are masked in the
dashboard and in build logs. The committed `render.yaml` deliberately declares every one of these
with `sync: false` (or `generateValue: true`) so that no secret value ever enters the repository;
enter the real values in the Render dashboard instead.

The deployer keys above are also the **contract owner** for `PaymentRouter` and
`SubscriptionManager`, because the backend signs `refund()` calls, which are `onlyOwner`. If the
deployer key is rotated, transfer ownership of both contracts to the new key's address on both
chains, and keep the backend signer and the owner address identical. Ownership transfer in these
contracts is **single-step and immediate** (`transferOwnership`), so confirm the destination
address before broadcasting. `PaymentRouter` exposes `setTreasury`; `SubscriptionManager` does not,
so its treasury address is fixed at deployment and cannot be changed afterwards.

### CORS allowlist for the Vercel domain

`CORS_ORIGIN` is a comma-separated allowlist of exact origins. The backend never reflects an
arbitrary origin and ignores a bare `*` (credentialed CORS plus a wildcard origin would expose the
API to every site).

```
CORS_ORIGIN=https://<project>.vercel.app,https://<project>-<preview>.vercel.app
```

- Exact production origin — always include this.
- Vercel preview deployments get unique hostnames per branch. Add the ones you use explicitly, or
  add a namespace-scoped wildcard such as `https://*.your-team.vercel.app`, which matches only
  subdomains of that namespace (it does **not** match `*.vercel.app` in general and never matches
  look-alike domains such as `your-project.vercel.app.evil.com`).
- Requests from origins outside the allowlist receive no `access-control-allow-origin` header, so
  the browser blocks them.

### MySQL Network Access for Render

A managed MySQL provider (for example an AWS RDS, Azure Database for MySQL, or a Render private
database) must accept connections from Render's outbound IP:

1. Allow Render's outbound IP in your MySQL provider's firewall / network access list.
2. Preferred: use Render's **Static Outbound IP** (available on paid plans) and add that single
   address. This keeps the allowlist tight and stable across deploys.
3. Free-tier fallback for a short demo: allow `0.0.0.0/0`. This opens the database to the public
   internet and is acceptable only for a disposable test database with strong credentials; replace
   it with the static egress IP before any public demo.
4. The database user used in `DATABASE_URL` must be granted read/write on the gateway database.

Verify from outside the container before pointing the frontend at it:

```
curl https://<api-host>/health     # {"mysql":"connected"}
```

If the response shows `"mysql":"disconnected"`, the backend logs the exact connection error
(`MySQL connection failed: …`) — that message identifies a firewall rejection, an invalid URI,
or an unreachable instance.

### Deploy steps (Render)

1. Push the deployment changes to the branch you want to demo.
2. Render → **New → Web Service** → connect the repository → apply the settings above.
3. Add every environment variable from the two tables above. Keep the six contract addresses
   identical to the values already in the root `.env` (both networks share the same deployed
   addresses because the same deployer nonce was used on each chain — they are still separate
   deployments on separate chains).
4. Deploy. The build log must show `npm ci` and the TypeScript compile, then the service logs
   `Server listening at http://0.0.0.0:<port>` and `MySQL connected`.
5. Confirm `GET https://<api-host>/health` returns HTTP 200 with `"mysql":"connected"`.

## Vercel — Frontend

### Exact dashboard settings

| Setting | Value |
|---|---|
| Project | import the same repository |
| Framework Preset | Next.js |
| Root Directory | `frontend` |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `.next` (auto-detected) |
| Node version | `22.x` |
| Environment Variables | see the table below |

### Environment variables — Vercel frontend (public only)

`NEXT_PUBLIC_*` variables are **inlined into the browser bundle at build time**. Everything in this
table is public by definition.

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<api-host>` (the Render service URL, no trailing slash) |
| `NEXT_PUBLIC_ADI_TOKEN_ADDRESS` | deployed ADI token address |
| `NEXT_PUBLIC_ADI_ROUTER_ADDRESS` | deployed ADI router address |
| `NEXT_PUBLIC_ADI_SUBSCRIPTION_MANAGER_ADDRESS` | deployed ADI subscription manager |
| `NEXT_PUBLIC_POLYGON_TOKEN_ADDRESS` | deployed Amoy token address |
| `NEXT_PUBLIC_POLYGON_ROUTER_ADDRESS` | deployed Amoy router address |
| `NEXT_PUBLIC_POLYGON_SUBSCRIPTION_MANAGER_ADDRESS` | deployed Amoy subscription manager |

**Never add** `DATABASE_URL`, `JWT_SECRET`, `WEBHOOK_SECRET`, `ADI_TESTNET_PRIVATE_KEY`, or
`POLYGON_AMOY_PRIVATE_KEY` to Vercel. Any `NEXT_PUBLIC_*` value is readable by every visitor.

Set these variables in **Project Settings → Environment Variables** for **Production**, **Preview**,
and **Development** as needed, then redeploy — Next.js only inlines them at build time, so
changing a variable requires a new deployment to take effect.

> **`NODE_ENV` must not be set to `development` on Vercel.** `next build` fails in that case with a
> misleading `TypeError: Cannot read properties of null (reading 'useContext')` while prerendering
> pages. Vercel sets `NODE_ENV=production` automatically for production builds, and the frontend
> `build` script now pins `NODE_ENV=production` via `cross-env`, so the build is safe even if a
> stray `NODE_ENV=development` is present in the project environment. If you set `NODE_ENV` on
> Vercel manually, set it to `production`.
>
> The build uses `cross-env`, which is a **devDependency** — do not install with `--omit=dev` (or
> `NODE_ENV=production` during the install step), or the build will fail with a missing binary.

### API base URL behaviour

`frontend/lib/config.ts` reads `NEXT_PUBLIC_API_URL`. In production there is **no localhost
fallback**: if the variable is missing, the bundle contains no local API address and the UI shows a
visible "Backend API URL is not configured" banner instead of silently calling `localhost`.
In development only, `http://localhost:4000` is used as the fallback.

### Deploy steps (Vercel)

1. Import the repository, select the `frontend` root directory and the Next.js preset.
2. Add the seven `NEXT_PUBLIC_*` variables (production values).
3. Deploy. The build must complete without errors.
4. After the frontend is live, set `CORS_ORIGIN` and `FRONTEND_URL` on Render to the Vercel domain
   and redeploy the backend, then re-check the browser console for CORS errors.

## Production safety notes

- `/health` is a **liveness** check: it returns HTTP 200 while the HTTP server is up and reports
  the database state in the `mysql` field. A transient MySQL outage therefore does not restart
  the service; database-dependent routes return HTTP 503 `DB_UNAVAILABLE` until the connection
  recovers. Point the Render health check at `/health`.
- MySQL initialization runs in the background with 10-second server-selection and connect
  timeouts, so an unreachable database can never block the HTTP listener from starting.
- `SIGTERM`/`SIGINT` trigger a graceful shutdown: the server stops accepting connections, in-flight
  requests finish, and the Prisma client is disconnected before exit.
- Request logs redact `authorization`, `cookie`, and `x-webhook-signature` headers.
- `NODE_ENV=production` **refuses to start** when `JWT_SECRET` is missing or shorter than 32
  characters. The development fallback secret is rejected explicitly, so a production service can
  never sign tokens with a publicly known key.
- With `NODE_ENV=production` and no `WEBHOOK_SECRET`, the service starts but logs a warning and
  webhook delivery is rejected with HTTP 503.
- The backend trusts the platform proxy (`trustProxy`) so client IPs in logs are correct behind
  Render's edge.

## Deployment verification checklist

1. `GET https://<api-host>/health` → HTTP 200, `"mysql":"connected"`.
2. `GET https://<frontend-host>` loads and shows no "not configured" banner.
3. Register a merchant in the browser; the merchant appears in the MySQL database.
4. Create a payment; an on-chain intent is submitted and a `Payment` row is written to MySQL.
5. Customer payment page loads, wallet connects to the correct chain, approval and payment confirm.
6. `GET https://<api-host>/health` still reports `"mysql":"connected"` after the flow.
7. Confirm no secret appears in Render logs, Vercel logs, or the browser bundle.

