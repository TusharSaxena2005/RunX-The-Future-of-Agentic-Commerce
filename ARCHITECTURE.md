# Project structure

## Backend

- `server/src/app.js`: Express setup, middleware order, public health/auth routes and authenticated API mounting. The Razorpay webhook receives raw bytes before JSON parsing.
- `server/src/routes/`: URL and HTTP method registrations grouped by feature. `index.js` composes the protected API. Keep authorization and rate limiting in place when adding endpoints.
- `server/src/controllers/`: HTTP input validation, response formatting and service orchestration. Product, cart, order, payment, policy, AI chat, analytics, growth, audit, authentication and webhook handlers live in separate files.
- `server/src/middleware/`: authentication, role/session authorization and request security.
- `server/src/services/`: domain operations and integrations. `shoppingAiService.js` owns chat execution and cancellation; `shoppingTools.js` defines catalog/cart/order tools; `growthAiService.js` owns merchant analysis. `aiService.js` is a small compatibility export, not an implementation file. `sessionService.js` owns the shared in-memory login session store.
- `server/prisma/`: schema and explicit catalog/demo maintenance scripts.
- `server/test/`: unit and isolated PostgreSQL integration tests.

The application currently uses one configured merchant. This refactor does not change tenancy, API URLs, permissions, payment approval, or persistence semantics.

## Frontend

- `client/src/pages/`: route-level screens.
- `client/src/components/`: reusable UI, including product cards and chart components.
- `client/src/services/`: API client, login state, theme selection and payment helpers.
- `client/src/styles.css`: CSS import entry point only.
- `client/src/styles/`: base layout, chat, shared controls, authentication, audit, account, catalog, checkout and charts.
- `client/src/styles/themes/`: theme tokens and surface/navigation overrides, plus the cream-and-white light palette.
- `shared/`: browser/server-independent catalog helpers.

CSS imports deliberately retain the original cascade order. Feature files contain layout and component rules; theme files contain palette overrides. Do not append feature implementations to the import entry point. Keep responsive rules alongside their feature where possible, and check both themes when changing shared selectors.

## Checks

- `npm test`: unit tests.
- `npm run test:integration`: API and payment safety checks in a temporary database schema; requires PostgreSQL configuration.
- `npm run build`: production client compilation.

No database migration or reseeding is required for this structural refactor.
