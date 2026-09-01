import { prisma } from '../db.js';

export const merchantId = async () => {
    const merchant = await prisma.merchant.findFirst({
        select: { id: true },
    });

    if (!merchant) {
        throw new Error('Merchant not configured');
    }

    return merchant.id;
};
