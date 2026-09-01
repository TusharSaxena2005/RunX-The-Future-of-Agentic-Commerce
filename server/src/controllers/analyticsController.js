import { getRecordedSales } from '../services/reportingService.js';
import { getKpis } from '../services/kpiService.js';
import { merchantId } from '../services/merchantService.js';

export const getAnalytics = async (_, res) => {
    const id = await merchantId();

    const [{ paidOrders, salesEvents }, kpis] = await Promise.all([getRecordedSales(id), getKpis(id)]);

    const eventByOrderId = new Map(
        salesEvents
            .filter((event) => event.orderId)
            .map((event) => [event.orderId, event])
    );

    const revenue = paidOrders.reduce(
        (sum, order) => sum + order.total,
        0
    );

    const orders = paidOrders.length;

    const aov = orders
        ? Math.round(revenue / orders)
        : 0;

    const aiAttributedRevenue = paidOrders.reduce(
        (sum, order) => {
            const event = eventByOrderId.get(order.id);
            return sum + (event?.aiAttributed ? order.total : 0);
        },
        0
    );

    const upsellRevenue = paidOrders.reduce(
        (sum, order) => {
            const event = eventByOrderId.get(order.id);
            return sum + (event?.upsellRevenue || 0);
        },
        0
    );

    const rows = paidOrders.map((order) => {
        const event = eventByOrderId.get(order.id);

        return {
            date: order.createdAt.toISOString().slice(0, 10),
            revenue: order.total,
            aiRevenue: event?.aiAttributed
                ? order.total
                : 0,
        };
    });

    res.json({
        revenue,
        orders,
        aov,
        aiAttributedRevenue,
        upsellRevenue,
        ...kpis,
        measurementNote: 'Test/demo cart activity and paid test orders only; live-payment carts excluded. Conversion counts carts with items, an order, or an abandonment marker, not all visitors. Cross-sell rate counts paid orders with a recorded offer. Nonempty carts are marked abandoned after 24 hours without a cart change; recovery requires a later order that is paid. AI comparison is observational, not causal lift. Historical unrecorded offers cannot be reconstructed.',
        rows,
    });
};
