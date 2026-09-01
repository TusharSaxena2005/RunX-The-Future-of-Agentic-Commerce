import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateKpis } from '../src/services/kpiService.js';
import { abandonmentTime } from '../src/services/cartActivityService.js';

const date = day => new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00Z`);
const cart = (id, extra = {}) => ({ id, sessionId: id, createdAt: date(1), items: [{ productId: 'shoe' }], ...extra });
const order = (id, cartId, extra = {}) => ({ id, cartId, status: 'PAID', paymentMode: 'SIMULATED', createdAt: date(5), items: [{ productId: 'shoe' }], ...extra });
const exposure = (sessionId, extra = {}) => ({ sessionId, actor: 'AI', timestamp: date(2), output: { productIds: ['shoe'], crossSellProductIds: ['sock'] }, ...extra });

test('abandonment requires a nonempty cart idle for 24 hours and preserves prior markers', () => {
    const stale = cart('idle', { updatedAt: date(2) });
    assert.equal(abandonmentTime(stale, date(3)).getTime(), date(3).getTime());
    assert.equal(abandonmentTime(stale, new Date(date(3).getTime() - 1)), null);
    assert.equal(abandonmentTime({ ...stale, items: [] }, date(4)), null);
    assert.equal(abandonmentTime({ ...stale, abandonedAt: date(3) }, date(4)), null);
});

test('KPI rates use distinct started carts and actual purchased cross-sells', () => {
    const result = calculateKpis({
        carts: [cart('ai-paid', { items: [] }), cart('ai-open'), cart('direct'), cart('empty', { items: [] })],
        orders: [order('one', 'ai-paid', { items: [{ productId: 'shoe' }, { productId: 'sock' }] }),
            order('two', 'ai-paid', { createdAt: date(6) })],
        exposures: [exposure('ai-paid'), exposure('ai-paid'), exposure('ai-open')],
    });
    assert.equal(result.conversionRate, 33.33);
    assert.equal(result.upsellRate, 100);
    assert.equal(result.kpiCounts.offeredOrders, 1); // repeated checkout does not reuse old offers
    assert.equal(result.kpiCounts.convertedCarts, 1);
    assert.equal(result.aiConversionDifference, 50);
});

test('no purchase after a recorded offer is zero, absent evidence is unavailable', () => {
    const result = calculateKpis({ carts: [cart('a')], orders: [order('one', 'a')], exposures: [exposure('a')] });
    assert.equal(result.upsellRate, 0);
    assert.equal(result.aiConversionDifference, null);
    const empty = calculateKpis({ carts: [], orders: [], exposures: [] });
    assert.equal(empty.conversionRate, null);
    assert.equal(empty.upsellRate, null);
    assert.equal(empty.abandonedCartRecoveryRate, null);
});

test('recovery requires a paid test order placed after abandonment; live carts are excluded', () => {
    const result = calculateKpis({
        carts: [cart('recovered', { abandonedAt: date(3) }), cart('old', { abandonedAt: date(7) }),
            cart('pending', { abandonedAt: date(3) }), cart('live')],
        orders: [order('one', 'recovered'), order('two', 'old'),
            order('three', 'pending', { status: 'PENDING_PAYMENT' }),
            order('four', 'live', { paymentMode: 'RAZORPAY_LIVE' })],
        exposures: [],
    });
    assert.equal(result.abandonedCartRecoveryRate, 33.33);
    assert.equal(result.kpiCounts.carts, 3);
    assert.equal(result.kpiCounts.convertedCarts, 2);
});

test('post-checkout exposures cannot explain a purchase or change its AI cohort', () => {
    const result = calculateKpis({ carts: [cart('a')], orders: [order('one', 'a')],
        exposures: [exposure('a', { timestamp: date(6) })] });
    assert.equal(result.upsellRate, null);
    assert.equal(result.kpiCounts.aiCarts, 0);
    const prior = calculateKpis({ carts: [cart('a', { createdAt: date(3) })], orders: [order('one', 'a')], exposures: [exposure('a')] });
    assert.equal(prior.kpiCounts.aiCarts, 1); // recommendation may precede cart creation
});
