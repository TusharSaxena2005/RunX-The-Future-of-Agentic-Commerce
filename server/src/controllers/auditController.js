import { prisma } from '../db.js';
import { merchantId } from '../services/merchantService.js';

export const listAuditEvents = async (_, res) => {
    const id = await merchantId();
    const actions = await prisma.agentAction.findMany({
        where: { merchantId: id },
        orderBy: { timestamp: 'desc' },
        take: 100,
    });

    res.json(actions);
};
