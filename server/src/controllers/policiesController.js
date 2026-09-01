import { z } from 'zod';
import { prisma } from '../db.js';
import { evaluateDiscount, evaluateTransaction, getPolicy } from '../services/policyEngine.js';
import { audit } from '../services/auditService.js';
import { merchantId } from '../services/merchantService.js';

export const getPolicies = async (_, res) => {
    const id = await merchantId();
    res.json(await getPolicy(id));
};

export const updatePolicies = async (req, res) => {
    const id = await merchantId();
    const data = z
        .object({
            maximumTransactionAmount: z.number().int().positive(),
            maximumDiscountPercentage: z.number().int().min(0).max(100),
            maximumDiscountAmount: z.number().int().nonnegative(),
            paymentApprovalRequired: z.boolean(),
            aiRefundsAllowed: z.boolean(),
            aiPriceModificationAllowed: z.boolean(),
        })
        .parse(req.body);

    res.json(
        await prisma.policy.update({
            where: { merchantId: id },
            data,
        })
    );
};

export const evaluatePolicy = async (req, res) => {
    try {
        const id = await merchantId();
        res.json(
            await evaluateTransaction({
                merchantId: id,
                total: Number(req.body.total),
                discount: Number(req.body.discount || 0),
                discountPercent: Number(
                    req.body.discountPercent || 0
                ),
            })
        );
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const quoteDiscount = async (req, res) => {
    try {
        const id = await merchantId();
        const result = await evaluateDiscount({ merchantId: id, subtotal: Number(req.body.subtotal), requestedPercent: Number(req.body.requestedPercent) });
        await audit({ merchantId: id, sessionId: req.auth.sessionId, actor: req.auth.role.toUpperCase(),
            action: result.allowed ? 'DISCOUNT_REQUEST' : 'POLICY_BLOCKED', status: result.allowed ? 'SUCCESS' : 'BLOCKED',
            input: { subtotal: req.body.subtotal, requestedPercent: req.body.requestedPercent },
            output: result, policyResult: result, reason: result.reason });
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
