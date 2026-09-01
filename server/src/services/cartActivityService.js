import { prisma } from '../db.js';

export const ABANDONMENT_MS = 24 * 60 * 60 * 1000;

export function abandonmentTime(cart, now = new Date()) {
    if (cart.abandonedAt || !cart.items.length) return null;
    const idleSince = new Date(cart.updatedAt).getTime();
    return Number.isFinite(idleSince) && now.getTime() - idleSince >= ABANDONMENT_MS
        ? new Date(idleSince + ABANDONMENT_MS) : null;
}

// Lazy detection on cart access/dashboard reads avoids a background scheduler.
// Preserve updatedAt: marking inactivity is not customer activity.
export async function recordAbandonment(cart, now = new Date()) {
    const abandonedAt = abandonmentTime(cart, now);
    if (!abandonedAt) return cart;
    const result = await prisma.cart.updateMany({
        where: { id: cart.id, merchantId: cart.merchantId, abandonedAt: null,
            updatedAt: cart.updatedAt, items: { some: {} } },
        data: { abandonedAt, updatedAt: cart.updatedAt },
    });
    return result.count ? { ...cart, abandonedAt } : cart;
}
