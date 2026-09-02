import { prisma } from '../db.js';
import { recordGrowthStrategyOutcome } from './growthFeedbackService.js';

// The conditional UPDATE serializes competing completions on the same order.
export async function finalizePayment({ orderId, paymentId, signature, demo = false }, db = prisma) {
    return db.$transaction(async tx => {
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order || !order.paymentApprovedAt || order.paymentMode !== (demo ? 'SIMULATED' : 'RAZORPAY_TEST')) throw new Error('Order has no matching payment approval');
        const changed = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING_PAYMENT' }, data: { status: 'PAID' } });
        if (!changed.count) {
            const current = await tx.order.findUnique({ where: { id: orderId } });
            if (current?.status !== 'PAID') throw new Error('Order is not payable');
            return { verified: true, orderStatus: 'PAID', duplicate: true, demo };
        }
        const items = await tx.orderItem.findMany({ where: { orderId } });
        for (const item of items) {
            const inventory = await tx.product.updateMany({
                where: {
                    id: item.productId,
                    merchantId: order.merchantId,
                    active: true,
                    stock: { gte: item.quantity },
                },
                data: { stock: { decrement: item.quantity } },
            });
            if (!inventory.count) {
                throw new Error('A product is no longer available in the requested quantity');
            }
        }
        await tx.payment.updateMany({ where: { orderId }, data: { status: 'CAPTURED', razorpayPaymentId: paymentId, razorpaySignature: signature } });
        const cart = order.cartId ? await tx.cart.findUnique({ where: { id: order.cartId } }) : null;
        const sessionId = cart?.sessionId || 'webhook';
        const growthOutcomes = await recordGrowthStrategyOutcome(order, sessionId, tx);
        const recommendation = await tx.agentAction.findFirst({ where: {
            merchantId: order.merchantId, sessionId, action: 'PRODUCT_RECOMMENDATION',
            timestamp: { lte: order.createdAt }, output: { path: ['kind'], equals: 'DISPLAYED_RECOMMENDATION' },
        } });
        const salesEvent = await tx.salesEvent.create({ data: {
            merchantId: order.merchantId, orderId, timestamp: new Date(),
            channel: demo ? 'SIMULATED' : 'RAZORPAY_TEST', revenue: order.total, aov: order.total,
            aiAttributed: Boolean(recommendation), upsellRevenue: 0, converted: true,
        } });
        // Preserve products added after the immutable order snapshot.
        if (cart) {
            for (const item of items) {
                const current = await tx.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: item.productId } } });
                if (!current) continue;
                if (current.quantity <= item.quantity) await tx.cartItem.delete({ where: { id: current.id } });
                else await tx.cartItem.update({ where: { id: current.id }, data: { quantity: { decrement: item.quantity } } });
            }
            await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
        }
        // Checkout preparation is already successful. Promote the separate
        // payment-status step only after this exact commerce order is verified.
        await tx.agentAction.updateMany({
            where: {
                merchantId: order.merchantId,
                action: 'PAYMENT_PENDING',
                input: { path: ['orderId'], equals: order.id },
            },
            data: { status: 'SUCCESS' },
        });
        await tx.agentAction.create({ data: {
            merchantId: order.merchantId, sessionId, actor: demo ? 'SIMULATOR' : 'RAZORPAY',
            action: 'PAYMENT_SUCCESS', amount: order.total,
            input: { orderId, paymentId: paymentId || null },
            output: { orderStatus: 'PAID', demo, salesEventId: salesEvent.id, growthOutcomes },
        } });
        return { verified: true, orderStatus: 'PAID', salesEventId: salesEvent.id, growthOutcomes, demo, duplicate: false };
    });
}
