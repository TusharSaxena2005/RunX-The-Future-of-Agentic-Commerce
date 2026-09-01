import { prisma } from '../db.js';

export const health = (_, res) => {
    res.json({ ok: true });
};

export const getMerchant = async (_, res) => {
    res.json(
        await prisma.merchant.findFirst({
            include: { policies: true },
        })
    );
};
