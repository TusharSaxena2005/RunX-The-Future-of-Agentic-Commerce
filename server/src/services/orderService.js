import { evaluateTransaction } from './policyEngine.js';
import { prisma } from '../db.js';

export async function createOrderFromCart({
    merchantId,
    sessionId,
    discount = 0,
}) {
    const cart = await prisma.cart.findUnique({
        where: { sessionId },
        include: { items: true },
    });

    if (
        !cart ||
        cart.merchantId !== merchantId ||
        cart.items.length === 0
    ) {
        throw new Error('Cart is empty');
    }

    const subtotal = cart.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
    );
    if (!Number.isSafeInteger(discount) || discount < 0 || discount >= subtotal) throw new Error('Invalid discount');
    const total = subtotal - discount;
    const policy = await evaluateTransaction({ merchantId, total, discount, discountPercent: discount / subtotal * 100 });
    if (!policy.allowed) throw new Error(policy.reason);
    const products = await prisma.product.findMany({ where: { id: { in: cart.items.map(i => i.productId) }, merchantId, active: true } });
    for (const item of cart.items) {
        const product = products.find(p => p.id === item.productId);
        if (!product || !Number.isSafeInteger(item.quantity) || item.quantity <= 0 || product.stock < item.quantity || product.price !== item.unitPrice) throw new Error('Cart price or availability changed; refresh the cart');
    }

    return prisma.order.create({
        data: {
            merchantId,
            cartId: cart.id,
            subtotal,
            discount,
            total,
            status: 'PENDING_PAYMENT',
            items: {
                create: cart.items.map((item) => ({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                })),
            },
            payments: {
                create: {
                    amount: total,
                    status: 'CREATED',
                },
            },
        },
        include: {
            items: {
                include: {
                    product: true,
                },
            },
            payments: true,
        },
    });
}
