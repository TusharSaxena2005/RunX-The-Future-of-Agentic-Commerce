import { prisma } from '../db.js';
import { recordAbandonment } from './cartActivityService.js';

export async function getOrCreateCart({ merchantId, sessionId }) {
    const cart = await prisma.cart.upsert({
        where: { sessionId },
        update: {},
        create: {
            merchantId,
            sessionId,
        },
        include: {
            items: {
                include: {
                    product: true,
                },
            },
        },
    });
    if (cart.merchantId !== merchantId) throw new Error('Cart ownership mismatch');
    return recordAbandonment(cart);
}

export async function addToCart({
    merchantId,
    sessionId,
    productId,
    quantity = 1,
}) {
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 20) throw new Error('Quantity must be an integer between 1 and 20');
    const cart = await getOrCreateCart({ merchantId, sessionId });

    const product = await prisma.product.findFirst({
        where: {
            id: productId,
            merchantId,
            active: true,
            stock: {
                gte: quantity,
            },
        },
    });

    const existingQuantity = cart.items.find(i => i.productId === productId)?.quantity || 0;
    if (!product || existingQuantity + quantity > product.stock || existingQuantity + quantity > 20) {
        throw new Error('Product unavailable or insufficient stock');
    }

    await prisma.cartItem.upsert({
        where: {
            cartId_productId: {
                cartId: cart.id,
                productId,
            },
        },
        update: {
            quantity: {
                increment: quantity,
            },
        },
        create: {
            cartId: cart.id,
            productId,
            quantity,
            unitPrice: product.price,
        },
    });

    await prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    return getOrCreateCart({ merchantId, sessionId });
}

export async function calculateCart({
    merchantId,
    sessionId,
    discount = 0,
}) {
    const cart = await getOrCreateCart({ merchantId, sessionId });

    const subtotal = cart.items.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0
    );

    if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) throw new Error('Invalid discount');
    return {
        cart,
        subtotal,
        discount,
        total: Math.max(subtotal - discount, 0),
    };
}
