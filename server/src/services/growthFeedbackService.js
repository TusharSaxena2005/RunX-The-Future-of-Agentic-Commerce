import { prisma } from '../db.js';
import { attributedAmount } from './attribution.js';
export async function recordGrowthStrategyOutcome(order, sessionId, db = prisma) {
    const [strategies, items, exposures] = await Promise.all([
        db.growthStrategy.findMany({ where: { merchantId: order.merchantId, status: 'ACTIVE', activationTime: { lte: order.createdAt } } }),
        db.orderItem.findMany({ where: { orderId: order.id } }),
        db.agentAction.findMany({ where: { merchantId: order.merchantId, sessionId, action: 'PRODUCT_RECOMMENDATION', timestamp: { lte: order.createdAt }, output: { path: ['kind'], equals: 'DISPLAYED_RECOMMENDATION' } } }),
    ]);
    const updates = [];
    for (const strategy of strategies) {
        const amount = attributedAmount(strategy, order, items, exposures);
        if (amount === null) continue;
        await db.growthStrategy.update({ where: { id: strategy.id }, data: { attributedPurchases: { increment: 1 }, attributedRevenue: { increment: amount } } });
        updates.push({ strategyId: strategy.id, attributedRevenue: amount });
    }
    return updates;
}
