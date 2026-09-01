import { prisma } from '../db.js';

// Both dashboard views use the same paid-order population and authoritative totals.
export async function getRecordedSales(merchantId) {
    const paidOrders = await prisma.order.findMany({
        where: { merchantId, status: 'PAID', paymentMode: { in: ['SIMULATED', 'RAZORPAY_TEST'] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, total: true, createdAt: true, paymentMode: true },
    });
    const recordedEvents = await prisma.salesEvent.findMany({
        where: { merchantId, orderId: { in: paidOrders.map(order => order.id) } },
        orderBy: { timestamp: 'asc' },
    });
    const eventByOrder = new Map(recordedEvents.map(event => [event.orderId, event]));
    const salesEvents = paidOrders.map(order => {
        const event = eventByOrder.get(order.id);
        return {
            orderId: order.id, timestamp: order.createdAt, channel: order.paymentMode,
            revenue: order.total, aov: order.total, converted: true,
            aiAttributed: event?.aiAttributed || false, upsellRevenue: event?.upsellRevenue || 0,
        };
    });
    return { paidOrders, salesEvents };
}
