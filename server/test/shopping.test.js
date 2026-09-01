import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/db.js';
import { runShoppingAgent, stopShoppingAgent } from '../src/services/aiService.js';

function mockPrisma(t, delegate, method, implementation) {
  const original = delegate[method];
  delegate[method] = implementation;
  t.after(() => { delegate[method] = original; });
}

test('stop cancels the model request without fallback, and clear resets AI history', async (t) => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-only';
  t.after(() => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  });
  mockPrisma(t, prisma.agentAction, 'create', async () => ({}));
  mockPrisma(t, prisma.growthStrategy, 'findMany', async () => []);
  let catalogCalls = 0;
  mockPrisma(t, prisma.product, 'findMany', async () => { catalogCalls++; return []; });
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  let pause = true;
  let contents;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    contents = JSON.parse(options.body).contents;
    if (pause) {
      markStarted();
      await new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
        if (options.signal.aborted) reject(options.signal.reason);
      });
    }
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Ready to help.' }] } }] }) };
  });
  const input = { merchantId: 'merchant', sessionId: 'stop-clear-test' };
  const pending = runShoppingAgent({ ...input, message: 'Find running shoes' });
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started;
  await stopShoppingAgent(input.sessionId);
  await rejected;
  assert.equal(catalogCalls, 0, 'cancellation must never trigger a catalog fallback');
  pause = false;
  await runShoppingAgent({ ...input, message: 'Find shorts instead' });
  assert.equal(contents.length, 1, 'cancelled request must not remain in history');
  await runShoppingAgent({ ...input, message: 'Compare those' });
  assert.equal(contents.length, 3, 'ordinary follow-ups retain conversation history');
  await stopShoppingAgent(input.sessionId, { clear: true });
  await runShoppingAgent({ ...input, message: 'Start fresh' });
  assert.deepEqual(contents, [{ role: 'user', parts: [{ text: 'Start fresh' }] }]);
});

test('discount conversation uses live cart and policy without the AI or catalog', async (t) => {
  mockPrisma(t, prisma.cart, 'upsert', async () => ({ merchantId: 'merchant', items: [
    { productId: 'nike', quantity: 1, unitPrice: 3799, product: { name: 'Nike Revolution 7' } },
  ] }));
  mockPrisma(t, prisma.policy, 'findUnique', async () => ({
    maximumDiscountPercentage: 10, maximumDiscountAmount: 500, maximumTransactionAmount: 10000,
  }));
  mockPrisma(t, prisma.agentAction, 'create', async () => ({}));
  mockPrisma(t, prisma.product, 'findMany', async () => { throw new Error('Unexpected catalog search'); });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected AI request'); });
  const input = { merchantId: 'merchant', sessionId: 'discount-test', mode: 'ai_pick' };
  const initial = await runShoppingAgent({ ...input, message: 'add discount also' });
  assert.deepEqual(initial.products, []);
  assert.equal(initial.cart.items[0].productId, 'nike');
  assert.match(initial.message, /3,799/);
  assert.doesNotMatch(initial.message, /₹379|10%|merchant|limits|up to/i);
  assert.match(initial.message, /What discount amount or percentage/);
  assert.match(initial.message, /No discount has been applied/);
  const quoted = await runShoppingAgent({ ...input, message: '5%' });
  assert.deepEqual(quoted.quote, { subtotal: 3799, discount: 190, total: 3609 });
  assert.equal(quoted.order, null);
  assert.equal(quoted.checkoutRequired, false);
  const blocked = await runShoppingAgent({ ...input, message: '20%' });
  assert.equal(blocked.quote, null);
  assert.match(blocked.message, /This is the highest discount I can offer: \*\*₹379\*\*/);
  assert.doesNotMatch(blocked.message, /merchant|limits/i);
  const amount = await runShoppingAgent({ ...input, message: '₹100' });
  assert.equal(amount.quote.discount, 100);
});

test('discount requests handle empty carts and missing policy', async (t) => {
  const cart = { merchantId: 'merchant', items: [] };
  mockPrisma(t, prisma.cart, 'upsert', async () => cart);
  mockPrisma(t, prisma.policy, 'findUnique', async () => null);
  mockPrisma(t, prisma.agentAction, 'create', async () => ({}));
  const input = { merchantId: 'merchant', sessionId: 'empty-test', message: 'add discount also' };
  assert.match((await runShoppingAgent(input)).message, /cart is empty/);
  cart.items.push({ quantity: 1, unitPrice: 3799 });
  assert.match((await runShoppingAgent(input)).message, /not configured a policy/);
});

test('offline transactional follow-ups never recommend products', async (t) => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  });
  mockPrisma(t, prisma.product, 'findMany', async () => { throw new Error('Unexpected catalog search'); });
  const result = await runShoppingAgent({ merchantId: 'merchant', sessionId: 'offline-test', message: 'add it' });
  assert.deepEqual(result.products, []);
  assert.equal(result.order, null);
  assert.match(result.message, /could not complete/);
});

