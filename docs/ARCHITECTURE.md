# Architecture and trust boundaries

## Request path

React UI → authenticated Express API → deterministic policy and commerce services → PostgreSQL.

The shopping service calls Gemini with catalog/cart tools. Model arguments are schema-validated and cannot supply a merchant or session identity. Those identities come from the server. At most eight model rounds and twelve tool calls per round are allowed, with provider timeouts. The fallback explicitly discloses that it is catalog search.

## Payment lifecycle

1. An order copies the cart items and prices, validates availability and applies amount/percentage discount limits. It starts as `PENDING_PAYMENT` without provider order or approval.
2. The customer clicks Approve & Pay. `/payments/prepare` requires the authenticated customer's session and `approved: true`, checks policy again, and records approval with a provider order. Repeated concurrent calls lock the local order and reuse the stored provider ID. All provider/UI payment amounts are paise; database catalog totals are integer rupees.
3. `/payments/verify` verifies HMAC and independently checks captured status, amount, currency and provider order. A signed `payment.captured` webhook can finish the same order without the browser.
4. Both paths call `finalizePayment`. A conditional update from pending to paid gates the transaction. Payment records, the sale, strategy outcomes, cart consumption and the success audit commit together. A concurrent loser sees a paid order and returns a duplicate response. An audit failure rolls everything back.

The simulation endpoint uses that same transaction but requires explicit non-production opt-in, no provider credentials and a persisted simulated approval. It cannot complete a Razorpay-mode order.

## Access control

`middleware/auth.js` verifies configured credentials, issues opaque random tokens and binds each token to one server-created shopping session and role. Customer requests cannot inspect another session's cart or approve another session's order. Merchant strategy, analytics, audit, product mutations and policy mutations require the merchant role. Client routing is presentation only.

The application is deliberately single-merchant. This is not a multi-tenant authorization design. All public demo credentials must be disabled for a private hosted demonstration.

## Evidence and attribution

Product cards returned by the AI service create a structured `DISPLAYED_RECOMMENDATION` audit event containing product and active-strategy IDs. This records delivery by the backend, not proof of viewport visibility. On payment completion, only exposures before order creation and relevant purchased items count toward cross-sell/high-conversion strategy attribution. Discounted order value is allocated proportionally to matching items. Multiple strategies may overlap.

The legacy forecast/outcome fields are not evidence. New estimate and observation fields are separate. Recovery and discount-only strategies have no measured outcome implementation. Causal incremental revenue requires a prospective control group or another defensible experiment; this repository does not claim one.

## Failure boundaries

- Unauthorized/forged roles and foreign sessions are rejected before commerce work.
- Missing/invalid financial values and policy violations fail closed.
- Gateway errors preserve a pending, retryable order and create a failure audit where the order is known.
- Malformed signatures return rejection rather than a buffer-length exception.
- Authorized-but-not-captured payments remain pending.
- The browser loader has a timeout and retry path. Closing checkout is not payment success.
- Missing webhook configuration leaves browser-independent settlement unavailable.
- A provider/database crash gap can leave an unused external order; this is not a distributed exactly-once guarantee.

## Code map

- `server/src/app.js`: middleware and signed webhook entry.
- `server/src/paymentRoutes.js`: customer ownership, approval and verification.
- `server/src/services/paymentService.js`: atomic completion gate.
- `server/src/services/paymentGateway.js`: test-only provider and signature/capture validation.
- `server/src/services/policyEngine.js`: deterministic monetary bounds.
- `server/src/services/aiService.js`: tools, recommendation evidence, forecasts.
- `server/src/services/attribution.js`: pure net-sales attribution rules.
- `server/test/`: pure checks and isolated PostgreSQL scenarios.
