import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validHmac, demoPaymentsEnabled, assertCaptured, configured } from '../src/services/paymentGateway.js';
import { attributedAmount } from '../src/services/attribution.js';

test('HMAC rejects missing, malformed, and incorrect signatures without throwing', () => {
    for (const signature of [undefined, '', 'x', 'a'.repeat(63), 'g'.repeat(64), '0'.repeat(64)]) assert.equal(validHmac('body', signature, 'secret'), false);
    const signature = crypto.createHmac('sha256', 'secret').update('body').digest('hex');
    assert.equal(validHmac('body', signature, 'secret'), true);
    assert.equal(validHmac('changed', signature, 'secret'), false);
    assert.equal(validHmac('body', signature, undefined), false);
});
test('simulation is opt-in, unavailable with either key, and forbidden in production', () => {
    const old = { ...process.env };
    try {
        delete process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_SECRET;
        delete process.env.ALLOW_DEMO_PAYMENTS; process.env.NODE_ENV = 'test';
        assert.equal(demoPaymentsEnabled(), false);
        process.env.ALLOW_DEMO_PAYMENTS = 'true'; assert.equal(demoPaymentsEnabled(), true);
        process.env.RAZORPAY_KEY_SECRET = 'partial'; assert.equal(demoPaymentsEnabled(), false);
        delete process.env.RAZORPAY_KEY_SECRET; process.env.RAZORPAY_KEY_ID = 'rzp_live_invalid';
        assert.equal(demoPaymentsEnabled(), false); assert.equal(configured(), false);
        delete process.env.RAZORPAY_KEY_ID; process.env.NODE_ENV = 'production'; assert.equal(demoPaymentsEnabled(), false);
    } finally { for (const key of Object.keys(process.env)) if (!(key in old)) delete process.env[key]; Object.assign(process.env, old); }
});
test('capture validation binds status, order, currency and paise amount', () => {
    const order = { razorpayOrderId: 'order_1', total: 100 };
    const valid = { order_id: 'order_1', amount: 10000, currency: 'INR', status: 'captured' };
    assert.doesNotThrow(() => assertCaptured(valid, order));
    for (const bad of [{ status: 'authorized' }, { amount: 100 }, { currency: 'USD' }, { order_id: 'other' }]) assert.throws(() => assertCaptured({ ...valid, ...bad }, order));
});
test('attribution requires exposure and matching purchase, allocates net discount, never counts discount as revenue', () => {
    const order = { subtotal: 1000, total: 900 };
    const items = [{ productId: 'shoe', unitPrice: 800, quantity: 1 }, { productId: 'sock', unitPrice: 200, quantity: 1 }];
    const strategy = { id: 's', type: 'CROSS_SELL', affectedProductIds: ['shoe','sock'] };
    const exposure = [{ output: { strategyIds: ['s'], productIds: ['sock'] } }];
    assert.equal(attributedAmount(strategy, order, items, exposure), 180);
    assert.equal(attributedAmount(strategy, order, items, []), null);
    assert.equal(attributedAmount(strategy, order, items.slice(0,1), exposure), null);
    assert.equal(attributedAmount({ ...strategy, type: 'BOUNDED_DISCOUNT' }, order, items, exposure), null);
    assert.equal(attributedAmount({ ...strategy, type: 'CART_RECOVERY' }, order, items, exposure), null);
});
