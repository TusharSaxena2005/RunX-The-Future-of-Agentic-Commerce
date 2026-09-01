import { prisma } from '../db.js';
import { recordAbandonment } from './cartActivityService.js';

const percent = (numerator, denominator) => denominator
    ? Math.round(numerator / denominator * 10000) / 100 : null;
const time = value => new Date(value).getTime();

// These are cart-level observational metrics, not visitor conversion or AI lift.
export function calculateKpis({ carts, orders, exposures }) {
    const testModes = ['SIMULATED', 'RAZORPAY_TEST'];
    const excluded = new Set(orders.filter(o => o.paymentMode && !testModes.includes(o.paymentMode)).map(o => o.cartId));
    const eligibleOrders = orders.filter(o => !excluded.has(o.cartId));
    const paid = eligibleOrders.filter(o => o.status === 'PAID' && testModes.includes(o.paymentMode));
    const started = carts.filter(c => !excluded.has(c.id)
        && (c.items.length > 0 || c.abandonedAt || eligibleOrders.some(o => o.cartId === c.id)));
    const converted = new Set(paid.map(o => o.cartId));
    const ai = new Set(started.filter(c => {
        const firstOrder = eligibleOrders.filter(o => o.cartId === c.id)
            .reduce((first, o) => Math.min(first, time(o.createdAt)), Infinity);
        return exposures.some(e => e.sessionId === c.sessionId && e.actor === 'AI'
            && time(e.timestamp) <= firstOrder
            && e.output?.productIds?.length);
    }).map(c => c.id));
    const aiCarts = started.filter(c => ai.has(c.id));
    const otherCarts = started.filter(c => !ai.has(c.id));
    const aiConverted = aiCarts.filter(c => converted.has(c.id)).length;
    const otherConverted = otherCarts.filter(c => converted.has(c.id)).length;
    const aiRate = percent(aiConverted, aiCarts.length);
    const otherRate = percent(otherConverted, otherCarts.length);
    const abandoned = started.filter(c => c.abandonedAt);
    // Require a new order after the explicit abandonment marker. A paid order
    // from before that marker must not count as a recovery.
    const recovered = abandoned.filter(c => paid.some(o => o.cartId === c.id
        && time(o.createdAt) > time(c.abandonedAt))).length;
    const cartById = new Map(carts.map(c => [c.id, c]));
    let offeredOrders = 0;
    let upsellOrders = 0;
    for (const order of paid) {
        const cart = cartById.get(order.cartId);
        if (!cart) continue;
        // Don't reuse an offer from an earlier paid checkout on the same cart.
        const previous = paid.filter(o => o.cartId === order.cartId && time(o.createdAt) < time(order.createdAt))
            .reduce((latest, o) => Math.max(latest, time(o.createdAt)), -Infinity);
        const offers = exposures.filter(e => e.sessionId === cart.sessionId
            && time(e.timestamp) > previous && time(e.timestamp) <= time(order.createdAt));
        const ids = new Set(offers.flatMap(e => e.output?.crossSellProductIds || []));
        if (!ids.size) continue;
        offeredOrders++;
        if (order.items.some(item => ids.has(item.productId))) upsellOrders++;
    }
    return {
        conversionRate: percent(started.filter(c => converted.has(c.id)).length, started.length),
        upsellRate: percent(upsellOrders, offeredOrders),
        abandonedCartRecoveryRate: percent(recovered, abandoned.length),
        aiConversionDifference: aiRate !== null && otherRate !== null ? Math.round((aiRate - otherRate) * 100) / 100 : null,
        kpiCounts: {
            carts: started.length, convertedCarts: started.filter(c => converted.has(c.id)).length,
            offeredOrders, upsellOrders, abandonedCarts: abandoned.length, recoveredCarts: recovered,
            aiCarts: aiCarts.length, aiConverted, otherCarts: otherCarts.length, otherConverted,
        },
    };
}

export async function getKpis(merchantId) {
    const [carts, orders, exposures] = await Promise.all([
        prisma.cart.findMany({ where: { merchantId }, select: {
            id: true, merchantId: true, sessionId: true, createdAt: true, updatedAt: true, abandonedAt: true,
            items: { select: { productId: true } },
        } }),
        prisma.order.findMany({ where: { merchantId }, select: {
            id: true, cartId: true, createdAt: true, status: true, paymentMode: true,
            items: { select: { productId: true } },
        } }),
        prisma.agentAction.findMany({ where: { merchantId, action: 'PRODUCT_RECOMMENDATION', status: 'SUCCESS',
            output: { path: ['kind'], equals: 'DISPLAYED_RECOMMENDATION' } },
            select: { sessionId: true, actor: true, timestamp: true, output: true } }),
    ]);
    const recordedCarts = await Promise.all(carts.map(cart => recordAbandonment(cart)));
    return calculateKpis({ carts: recordedCarts, orders, exposures });
}
