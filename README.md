# RunX

Merchant-controlled AI commerce for safer product discovery, cross-selling, and checkout.

RunX is a Razorpay Buildathon Track 01 prototype that serves both sides of online commerce:

- Customers get an AI shopping assistant that helps them discover, compare, and buy suitable products.
- Merchants get controlled growth tools for recommendations, cross-selling, abandoned-cart insights, policies, analytics, and audit history.

The AI may recommend products and prepare an order, but it cannot approve a payment. The authenticated customer always makes the final payment decision.

> **Prototype notice:** RunX uses test payments only. It is not a production payment platform and does not claim proven or causal revenue lift.



## Key features :

### For customers

- Conversational product discovery powered by Gemini
- Catalog fallback when the AI provider is unavailable
- Product recommendations and comparisons
- Cart and order preparation
- Policy-checked discounts
- Customer-controlled Razorpay test checkout
- Clear payment success, failure, and pending states

### For merchants

- AI-assisted growth analysis
- Review and activation of cross-sell strategies
- Product and inventory management
- Transaction and discount limits
- Sales, recommendation, and cart analytics
- Abandoned-cart and recovery insights
- Role-protected audit trail
- Separation between forecasts and observed outcomes  


## Safety model :

- Authentication, roles, session ownership, inventory, discounts, and monetary limits are enforced by the server.
- Customer and merchant APIs are separated by server-verified roles.
- Creating an order does not approve or complete a payment.
- Razorpay signatures are verified on the server.
- Captured status, provider order, currency, and exact paise amount are checked before completion.
- Payment completion is idempotent, preventing duplicate sales from retries or webhook replays.
- Payment, sale, attribution, cart consumption, and audit records commit together.
- Live Razorpay keys are rejected; only keys beginning with `rzp_test_` are accepted.

For the full trust-boundary explanation, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).  


## Technology :

- Frontend: React 19, Vite, React Router, Recharts
- Backend: Node.js, Express 5, Zod
- Database: PostgreSQL 16, Prisma
- AI: Google Gemini with bounded catalog and cart tools
- Payments: Razorpay test mode with signature and capture verification
- Testing: Node.js test runner with isolated PostgreSQL integration scenarios



## Project structure :

```text
.
├── client/                 React and Vite frontend
│   ├── public/
│   └── src/
├── server/                 Express API
│   ├── prisma/             Schema and database scripts
│   ├── src/                Routes, controllers, services, and middleware
│   └── test/               Unit and integration tests
├── shared/                 Browser/server-independent helpers
├── docs/
│   ├── ARCHITECTURE.md
│   └── DEMO.md
├── docker-compose.yml
└── package.json
```



## Prerequisites :

Install:

- Node.js 22 or newer
- npm
- Docker Desktop, or another PostgreSQL instance
- Optional Gemini API credentials
- Optional Razorpay **test-mode** credentials



## Local setup :

These commands are written for PowerShell.

### 1. Install dependencies

```powershell
npm install
```

### 2. Create local environment files

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

### 3. Start PostgreSQL

Start Docker Desktop, then run:

```powershell
docker compose up -d
docker compose ps
```

The default database is available at `localhost:5432`.

### 4. Prepare the database

```powershell
npm run db:generate
npm run db:push
npm run db:seed
```

Use `db:seed` for a new local database. Do not re-seed an existing environment unless you intend to replace its demo data.

### 5. Enable local demo authentication

In `server/.env`, set:

```dotenv
ALLOW_DEMO_AUTH=true
```

Public local demo accounts:

- Customer: `customer@runx.test` / `customer123`
- Merchant: `merchant@runx.test` / `merchant123`

Demo authentication is automatically disabled in production. Hosted demonstrations should use private values in `CUSTOMER_EMAIL`, `CUSTOMER_PASSWORD`, `MERCHANT_EMAIL`, and `MERCHANT_PASSWORD`.

### 6. Start the application

```powershell
npm run dev
```

Open [http://localhost:5173/login](http://localhost:5173/login).

Services:

- Frontend: `http://localhost:5173`
- API: `http://localhost:4000/api`
- Health check: `http://localhost:4000/api/health`



## Environment configuration :

### Server


| Variable                  | Purpose                                            |
| ------------------------- | -------------------------------------------------- |
| `DATABASE_URL`            | PostgreSQL connection string                       |
| `PORT`                    | API port; defaults to `4000`                       |
| `CLIENT_ORIGIN`           | Allowed frontend origin                            |
| `GEMINI_API_KEY`          | Gemini API credential                              |
| `GEMINI_MODEL`            | Model available to the configured Gemini account   |
| `RAZORPAY_KEY_ID`         | Razorpay test key beginning with `rzp_test_`       |
| `RAZORPAY_KEY_SECRET`     | Razorpay test secret                               |
| `RAZORPAY_WEBHOOK_SECRET` | Signature secret for captured-payment webhooks     |
| `ALLOW_DEMO_AUTH`         | Enables public fixture logins locally              |
| `ALLOW_DEMO_PAYMENTS`     | Enables explicit non-production payment simulation |


### Client


| Variable       | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| `VITE_API_URL` | API base URL; defaults to `http://localhost:4000/api` |




## Payment configuration :

Choose one mode.

### Razorpay test mode

Set these values in `server/.env`:

```dotenv
RAZORPAY_KEY_ID=rzp_test_your_key
RAZORPAY_KEY_SECRET=your_test_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
ALLOW_DEMO_PAYMENTS=false
```

Enable automatic capture in the Razorpay test configuration.

For browser-independent completion, configure Razorpay's `payment.captured` webhook:

```text
POST /api/webhooks/razorpay
```

A locally running server requires an intentionally configured, reachable development URL for webhooks.

### Explicit simulation

For a local demonstration without Razorpay:

```dotenv
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
ALLOW_DEMO_PAYMENTS=true
```

Simulation is unavailable in production and cannot activate when either Razorpay credential is present. The interface and audit history label simulated payments clearly.

## Gemini configuration :

Add an API key and a model available to your account:

```dotenv
GEMINI_API_KEY=your_api_key
GEMINI_MODEL=your_available_model
```

If credentials are missing, invalid, or unavailable, RunX returns a clearly labeled catalog-search fallback. A fallback proves application resilience, not a successful AI integration.

## Verification :

Run the complete submission gate:

```powershell
npm test
npm run test:integration
npm run build
```

Expected requirements:

- `npm test`: unit safety and shopping behavior
- `npm run test:integration`: authenticated API, PostgreSQL transaction, policy, payment, webhook, audit, and attribution scenarios
- `npm run build`: production frontend compilation

The integration suite creates a randomly named `buildathon_test_*` schema, uses synthetic fixtures and mocked provider responses, and removes only that schema. It does not reset the normal catalog or contact real payment providers. The configured PostgreSQL role must be allowed to create schemas.

Latest validated result:

- 13 unit tests passed
- 22 integration tests passed
- Production build passed
- Runtime health check and demo customer login passed

## Analytics terminology :

- **Estimated conversions/revenue:** unvalidated forecasts, not guaranteed outcomes.
- **Attributed purchases/revenue:** purchases observed after a relevant recommendation in the same session.
- **Attributed revenue:** observational association, not causal or incremental revenue.
- **AI-assisted order revenue:** a recommendation preceded order creation; it does not prove that the AI caused the purchase.

Strategy attribution can overlap, so strategy totals should not be added together as unique merchant revenue.

## Useful commands :

```powershell
npm run dev                    # Start frontend and backend
npm start                      # Start the API
npm run build                  # Build the frontend
npm test                       # Run unit tests
npm run test:integration       # Run isolated database integration tests
npm run db:generate            # Generate Prisma client
npm run db:push                # Apply the Prisma schema
npm run db:seed                # Seed a new demo database
npm run db:seed-demo-activity  # Add demo activity
npm run db:update-catalog      # Update demo catalog
```

`npm run db:reset-demo` is destructive to transaction and audit history, although it preserves the catalog.

## Troubleshooting :

### Integration test cannot create an isolated schema

Confirm Docker Desktop and PostgreSQL are running:

```powershell
docker compose up -d
docker compose ps
```

Then confirm `DATABASE_URL` points to the running database and that the database user can create schemas.

### Frontend cannot reach the API

Check:

- The API is running on port `4000`.
- `client/.env` contains the correct `VITE_API_URL`.
- `server/.env` contains the matching `CLIENT_ORIGIN`.

Restart the development server after changing environment files.

### Gemini uses the catalog fallback

Confirm that `GEMINI_API_KEY` is valid and `GEMINI_MODEL` is available to that account. Provider timeouts and errors deliberately return a labeled fallback.

### Payment remains pending

Confirm that:

- Razorpay credentials are both configured and use test mode.
- The payment was captured.
- Currency, amount, and provider order match.
- The webhook secret and reachable webhook URL are configured when testing browser-close recovery.

## Known limitations :

- Authentication sessions and chat history are stored in memory and reset when the server restarts.
- The MVP supports one configured merchant and is not a multi-tenant identity system.
- Inventory is checked but not reserved across concurrent customers.
- Provider order creation and database writes cannot share one atomic transaction.
- Audit records are transactional but not cryptographically tamper-evident.
- Refunds, delivery, outbound recovery campaigns, live charging, and causal growth experiments are not implemented.

