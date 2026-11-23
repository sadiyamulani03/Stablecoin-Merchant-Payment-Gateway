# Migration Report: MongoDB/Mongoose → MySQL 8 + Prisma ORM

**Project:** Stablecoin Merchant Payment Gateway (`stablecoin-gateway` workspace)
**Backend:** Node.js 22, TypeScript, Fastify
**Target:** MySQL 8 + Prisma ORM (Prisma Migrations)
**Status:** Complete (backend fully migrated; no MongoDB/Mongoose remains in source)

---

## 1. Original MongoDB Architecture

- ODM: Mongoose 8.9.5, in-memory test server: mongodb-memory-server 9.5.0
- Connection string: `MONGODB_URI`
- Four Mongoose models in `backend/src/models/index.ts`:
  - `Merchant` — name, tradeLicense, emirate, category, settlementPreference, walletAddress, email (unique), passwordHash, status; timestamps
  - `Payment` — paymentId, chain, merchantId (ref Merchant), amount, description, tokenAddress, status, txHash, customerAddress, expiresAt, settledAt; index `{paymentId, chain}` unique
  - `Subscription` — subscriptionId, chain, merchantId (ref Merchant), customerAddress, amountPerPeriod, periodSeconds, nextChargeAt, status; index `{subscriptionId, chain}` unique
  - `WebhookEvent` — eventId (unique), payloadHash; timestamps
- Every MongoDB operation went through Mongoose models (`findOne`, `findById`, `create`, `countDocuments`, `find`, `save`, `deleteMany`).
- Lifecycle in `backend/src/index.ts`: `mongoose.connect(MONGODB_URI)`, connection event listeners, `mongoose.disconnect()` on shutdown; `/health` reported `mongodb: connected|disconnected`.
- Route guard `requireDb` checked `mongoose.connection.readyState===1` (503 `DB_UNAVAILABLE` otherwise).

---

## 2. Final MySQL Architecture

- ORM: Prisma ORM 5.22.0 (`@prisma/client` runtime dependency, `prisma` CLI devDependency)
- Connection string: `DATABASE_URL` (`mysql://USER:PASSWORD@HOST:3306/stablecoin_gateway`)
- Reusable singleton client: `backend/src/lib/prisma.ts` (`prisma`, `connectDb`, `disconnectDb`, `isDbConnected`)
- All Mongoose models/queries replaced with Prisma operations.
- Lifecycle in `backend/src/index.ts`: `connectDb()` (retries, does not throw; routes return 503 until connected), `disconnectDb()` on SIGTERM/SIGINT; `/health` reports `database:"mysql"` and `mysql: connected|disconnected`.
- Route guard `requireDb` checks `isDbConnected()` (503 `DB_UNAVAILABLE` otherwise).
- Amounts stored as `String` (no floating-point types for financial data).
- Merchant data isolation enforced by `merchantId` foreign key + application-level ownership checks.
- Idempotency / duplicate-webhook protection via `@@unique([paymentId, chain])`, `@@unique([subscriptionId, chain])`, `@unique(eventId)`; duplicate webhook detected via Prisma `P2002`.

---

## 3. Tables and Relationships Created (`prisma/schema.prisma`)

| Table | PK | FKs | Uniques | Indexes |
|-------|----|-----|---------|---------|
| `Merchant` | `id` (Char36, uuid) | — | `email` | `email` |
| `Payment` | `id` (Char36, uuid) | `merchantId → Merchant.id` (Cascade) | `paymentId + chain` | `merchantId`, `paymentId`, `chain`, `status`, `merchantId+status` |
| `Subscription` | `id` (Char36, uuid) | `merchantId → Merchant.id` (Cascade) | `subscriptionId + chain` | `merchantId`, `subscriptionId`, `chain` |
| `WebhookEvent` | `id` (Char36, uuid) | — | `eventId` | `eventId` |

- `merchantId` is `Char(36)` referencing `Merchant.id` (UUIDs, replacing MongoDB ObjectId).
- `amount`, `amountPerPeriod` stored as `String` to preserve decimal precision (mDDSC has 2 decimals).
- `txHash`, `customerAddress`, `settledAt` nullable (`String?` / `DateTime?`).
- `createdAt`/`updatedAt` timestamps on all models.
- Blockchain identifiers preserved: `paymentId`, `subscriptionId`, `chain`, `tokenAddress`, `txHash`, `walletAddress`, `customerAddress`.

---

## 4. Files Created, Modified, Deleted

### Created
- `backend/prisma/schema.prisma` — Prisma data model + datasource (mysql)
- `backend/src/lib/prisma.ts` — PrismaClient singleton + connect/disconnect/connection-state helpers
- `backend/test/db.unit.test.ts` — Prisma CRUD unit tests (mocked prisma)
- `backend/test/mysql.integration.test.ts` — MySQL integration tests (skipped cleanly when no live MySQL / `DATABASE_URL`)
- `MIGRATION-REPORT.md` — this report

### Modified
- `backend/package.json` — removed `mongoose`, `mongodb-memory-server`; added `@prisma/client` (dep) and `prisma` (devDep); added `postinstall` (`prisma generate`); `build` runs `prisma generate && tsc`
- `backend/src/index.ts` — removed Mongoose; Prisma connect/disconnect lifecycle; health reports `mysql`
- `backend/src/routes/api.ts` — all Mongoose queries → Prisma; `merchant._id` → `merchant.id`; `.save()` → `prisma.payment.update`; WebhookEvent duplicate → `P2002`; subscription list maps `_id` for frontend compatibility
- `backend/test/security.test.ts` — mocks `src/lib/prisma.js` instead of `mongoose`/models
- `backend/.env` — `MONGODB_URI` → `DATABASE_URL` placeholder (gitignored; credentials removed, not printed)
- `.env.example` — `MONGODB_URI` → `DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/stablecoin_gateway"`
- `render.yaml` — `MONGODB_URI` envVar → `DATABASE_URL` (`sync: false`)
- `infra/docker-compose.yml` — `mongo:7` service → `mysql:8` service with `MYSQL_DATABASE/USER/PSSWORD`
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/SECURITY.md`, `docs/SUBMISSION.md`, `docs/TESTING.md`, `docs/DEMO.md` — MongoDB references replaced with MySQL/Prisma

### Deleted
- `backend/src/models/index.ts` (and `src/models/` dir) — pure Mongoose schemas
- `backend/test/mongodb.test.ts` — Mongoose unit tests
- `backend/test/mongodb.integration.test.ts` — Mongoose + mongodb-memory-server tests

---

## 5. MongoDB Dependencies Removed

- `mongoose` (backend dependency) — removed
- `mongodb-memory-server` (backend devDependency) — removed
- All transitive MongoDB driver packages purged from `package-lock.json` (0 remaining `mongoose`/`mongodb-memory-server` references)
- No `mongoose`, `mongodb`, `MONGODB_URI`, or `MongoClient` imports/references remain in source (verified repo-wide excluding `node_modules`, `.next`, `.turbo`, `dist`, `package-lock.json`)

---

## 6. Prisma Configuration and Migration Status

- `prisma/schema.prisma` — valid (`prisma validate` passes)
- Prisma Client generated (`prisma generate` passes; output in `node_modules/@prisma/client`)
- `prisma generate` wired into `postinstall` and `build`
- Migration files: **not auto-generated** because no live MySQL 8 server is available in this environment to run `prisma migrate dev`. The schema is designed and validated; the initial migration SQL should be produced with `prisma migrate dev` (or `prisma migrate diff`) once a MySQL 8 instance is reachable and `DATABASE_URL` is set. No destructive migration has been run against any production database.

---

## 7. Tests Passed and Failed

Backend (`vitest run`):
- Test files: 3 passed, 1 skipped
- Tests: 34 passed, 12 skipped

| Test file | Result | Notes |
|-----------|--------|-------|
| `test/chains.test.ts` | passed | Dual-testnet config (unchanged) |
| `test/security.test.ts` | passed | Auth, isolation, webhook HMAC, replay protection, on-chain verification (mocks Prisma) |
| `test/db.unit.test.ts` | passed | Prisma CRUD + unique constraints + transaction (mocks Prisma) |
| `test/mysql.integration.test.ts` | skipped (12) | Requires live MySQL 8 + `DATABASE_URL`; none available locally, so honestly skipped (not faked) |

- No tests failed. The 12 integration tests are **pending live MySQL integration tests** — they will run automatically once `DATABASE_URL` points to a running MySQL 8 database.
- Root `frontend` typecheck: passed (`tsc --noEmit`). Frontend source not modified (no MongoDB dependency).

---

## 8. Root Build, Lint and Typecheck Results

| Command | Result |
|---------|--------|
| `npm run build` (backend: `prisma generate && tsc`) | passed |
| `npm run typecheck` (backend `tsconfig.json` + `tsconfig.test.json`) | passed |
| `npm run lint` (backend `eslint src test`) | passed |
| `npm test` (backend vitest) | passed (34 passed, 12 skipped pending MySQL) |
| Frontend `tsc --noEmit` | passed |

---

## 9. Frontend Compatibility Results

- Frontend source was **not modified** (per instruction not to modify the friend's frontend unnecessarily; frontend has no MongoDB dependency).
- All API request/response contracts preserved:
  - `POST /api/merchants/onboard` → `{merchantId, walletAddress, status, token}`
  - `POST /api/auth/login` → `{token, merchantId, name}`
  - `GET /api/merchants/:id` → `{merchant, stats:{paymentCount, paidCount}}` (passwordHash excluded)
  - `POST /api/payments/create` → `{paymentId, qrCode, qrPayload, expiresAt, txHash, chain}`
  - `GET /api/payments/:paymentId` → `{paymentId, status, amount, settledAt, settlementMethod:"on-chain", chain, txHash}`
  - `POST /api/payments/:paymentId/refund` → `{refundId, status, txHash}`
  - `POST /api/subscriptions/create` → 501; `GET /api/subscriptions` → `{subscriptions: [...]}`; `POST /api/subscriptions/:id/charge` → 501
  - `GET /api/analytics/summary` → `{totalVolume, txCount, avgTicket, topMerchants:[]}`
  - `POST /api/webhooks/chain` → `{accepted:true, eventId}` / `{accepted:true, duplicate:true, eventId}`
  - `GET /health` → `{status, service, database:"mysql", mysql, networks:[...]}`
- One compatibility note: Mongoose returned `_id`; Prisma returns `id`. `GET /api/subscriptions` maps each record to include `_id` so the frontend's `record._id` React key continues to work. The frontend `MerchantProfile`/`Subscription` type declarations still reference `_id`/`__v` (Mongoose artifacts) but those fields are not accessed at runtime except `record._id`, which is now preserved.

---

## 10. Remaining Blockers

- **No local MySQL 8 server available** in this environment, and no Docker. Therefore:
  - `prisma migrate dev` could not be run; initial SQL migration not generated.
  - The 12 `mysql.integration.test.ts` tests are skipped pending a live MySQL instance.
  - Live end-to-end payment creation/refund requires a funded testnet signer + RPC (unchanged from before; not part of DB migration).
- `DATABASE_URL` must be set in the environment for `prisma generate`, `prisma migrate`, and runtime. `.env.example` provides the placeholder format; real credentials must be supplied locally/deployment-side and never committed.

---

## 11. Manual Steps to Create/Configure MySQL and Connect Render

### 1. Provision MySQL 8 (you must do this; not done automatically)
- Install MySQL 8 locally, or use a managed MySQL provider (AWS RDS, Azure Database for MySQL, Render private DB, etc.).
- Create the database and a dedicated user:
  ```sql
  CREATE DATABASE stablecoin_gateway;
  CREATE USER 'gateway'@'%' IDENTIFIED BY '<strong-password>';
  GRANT ALL PRIVILEGES ON stablecoin_gateway.* TO 'gateway'@'%';
  FLUSH PRIVILEGES;
  ```

### 2. Set `DATABASE_URL`
- Local: copy `.env.example` to `.env` and set:
  ```
  DATABASE_URL="mysql://gateway:<password>@127.0.0.1:3306/stablecoin_gateway"
  ```
  (`.env` is gitignored; never commit real credentials.)
- Render: add `DATABASE_URL` as a Secret environment variable on the Render web service (`sync: false`).

### 3. Generate the Prisma migration and client
```bash
cd stablecoin-gateway
npm install                 # installs @prisma/client + prisma, runs postinstall prisma generate
npx prisma migrate dev --schema backend/prisma/schema.prisma   # creates the initial migration + applies it
```
- Requires `DATABASE_URL` to be set and MySQL reachable.
- This creates `backend/prisma/migrations/migration_init/`. Commit the `migrations/` folder; do NOT commit `.env`.

### 4. Run locally
```bash
# Terminal 1: MySQL (docker compose now uses the mysql service)
docker compose -f infra/docker-compose.yml up -d mysql

# Terminal 2: Backend
npm run dev --workspace backend

# Terminal 3: Frontend
npm run dev --workspace frontend
```
- `npm run dev` uses `tsx watch src/index.ts`; `connectDb()` runs at startup and `isDbConnected()` gates DB routes.

### 5. Render deployment
- Build Command: `npm ci --include=dev && npm run build --workspace backend` (build runs `prisma generate && tsc`)
- Start Command: `node backend/dist/src/index.js`
- Health Check Path: `/health`
- Required Render env vars (Secrets): `DATABASE_URL`, `JWT_SECRET`, `WEBHOOK_SECRET`, `ADI_TESTNET_PRIVATE_KEY`, `POLYGON_AMOY_PRIVATE_KEY`, `ADI_TESTNET_RPC_URL`, `POLYGON_AMOY_RPC_URL`
- Public Render env vars: `NODE_ENV=production`, `HOST=0.0.0.0`, `LOG_LEVEL=info`, `CORS_ORIGIN`, `FRONTEND_URL`, `DEFAULT_CHAIN=adi-testnet`, plus the four public contract addresses
- `render.yaml` already declares `DATABASE_URL` (`sync: false`) in place of `MONGODB_URI`.

### 6. Verify
```bash
curl https://<api-host>/health   # expect "mysql":"connected"
```
- Database-dependent routes return HTTP 503 `DB_UNAVAILABLE` until `DATABASE_URL` is configured and MySQL is reachable.

---

## Safety / Compliance

- No Solidity contracts, deployed addresses, RPC URLs, or private keys were modified.
- No blockchain transactions were broadcast; no contract ownership transferred.
- No destructive production migrations executed; no production database touched.
- No secrets or connection strings printed in this report or in source/Git history.
- No commits or pushes were made.
- Backend no longer depends on MongoDB or Mongoose.
