import { prisma } from '../db.js';
import { getMerchantGrowth } from '../services/aiService.js';
import { audit } from '../services/auditService.js';
import { merchantId } from '../services/merchantService.js';

export const listGrowthStrategies = async (_, res) => {
    try {
        const id = await merchantId();
        res.json(await getMerchantGrowth(id));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const analyzeGrowth = async (_, res) => {
    try {
        const id = await merchantId();
        res.json(await getMerchantGrowth(id, { analyze: true }));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const activateGrowthStrategy = async (req, res) => {
    const id = await merchantId();
    const existing = await prisma.growthStrategy.findFirst({
        where: {
            id: req.params.id,
            merchantId: id,
        },
    });

    if (!existing) {
        return res.status(404).json({ error: 'Growth strategy not found' });
    }

    const strategy = await prisma.growthStrategy.update({
        where: { id: existing.id },
        data: {
            status: 'ACTIVE',
            activationTime: existing.activationTime || new Date(),
            ...(existing.status === 'PROPOSED' ? { attributedPurchases: 0, attributedRevenue: 0 } : {}),
        },
    });

    await audit({
        merchantId: id,
        sessionId: 'merchant-growth',
        actor: 'MERCHANT',
        action: 'RECOVERY_ACTION',
        input: { strategyId: strategy.id },
        output: {
            activated: true,
            strategy: strategy.name,
            type: strategy.type,
            affectedProductIds: strategy.affectedProductIds,
        },
        reason: 'Merchant approved growth strategy for customer-facing activation.',
    });

    res.json(strategy);
};
