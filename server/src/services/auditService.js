import { prisma } from '../db.js';

export async function audit({
    merchantId,
    sessionId,
    actor = 'AI',
    action,
    input,
    output,
    amount,
    policyResult,
    reason,
    status = 'SUCCESS',
}) {
    return prisma.agentAction.create({
        data: {
            merchantId,
            sessionId,
            actor,
            action,
            input,
            output,
            amount,
            policyResult,
            reason,
            status,
        },
    });
}
