import { z } from 'zod';
import { evaluateTransaction } from '../services/policyEngine.js';
import { calculateCart } from '../services/cartService.js';
import { createOrderFromCart } from '../services/orderService.js';
import { audit } from '../services/auditService.js';
import { merchantId } from '../services/merchantService.js';

export const createOrder = async (req, res) => {
    try {
        const id = await merchantId();
        const {
            sessionId,
            discount = 0,
        } = z
            .object({
                sessionId: z.string(),
                discount: z
                    .number()
                    .int()
                    .nonnegative()
                    .default(0),
            })
            .parse(req.body);

        const calc = await calculateCart({
            merchantId: id,
            sessionId,
            discount,
        });

        const policy = await evaluateTransaction({
            merchantId: id,
            total: calc.total,
            discount,
            discountPercent: calc.subtotal ? discount / calc.subtotal * 100 : 0,
        });

        if (!policy.allowed) {
            await audit({ merchantId: id, sessionId, actor: 'BACKEND', action: 'POLICY_BLOCKED', status: 'BLOCKED', reason: policy.reason, policyResult: policy });
            return res.status(422).json({
                error: policy.reason,
                policy,
            });
        }

        const order = await createOrderFromCart({
            merchantId: id,
            sessionId,
            discount,
        });

        await audit({
            merchantId: id,
            sessionId,
            actor: 'CUSTOMER',
            action: 'CREATE_ORDER',
            amount: order.total,
            input: { discount },
            output: { orderId: order.id },
        });

        res.json({ order, policy, checkoutRequired: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
