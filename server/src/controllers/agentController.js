import { z } from 'zod';
import { runShoppingAgent, stopShoppingAgent } from '../services/aiService.js';
import { relatedProducts } from '../services/catalogService.js';
import { getOrCreateCart } from '../services/cartService.js';
import { audit } from '../services/auditService.js';
import { merchantId } from '../services/merchantService.js';

export const chat = async (req, res) => {
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', onClose);
    try {
        const schema = z.object({
            sessionId: z.string().min(3),
            message: z.string().min(1).max(2000),
            mode: z.enum(['browse', 'ai_pick']).optional().default('browse'),
        });
        const body = schema.parse(req.body);
        const id = await merchantId();

        res.json(
            await runShoppingAgent({
                merchantId: id,
                ...body,
                signal: controller.signal,
            })
        );
    } catch (error) {
        if (!res.destroyed) res.status(400).json({ error: error.message });
    } finally {
        res.off('close', onClose);
    }
};

export const stopChat = async (req, res) => {
    await stopShoppingAgent(req.auth.sessionId);
    res.json({ stopped: true });
};

export const clearChat = async (req, res) => {
    await stopShoppingAgent(req.auth.sessionId, { clear: true });
    res.json({ cleared: true });
};

export const recordCrossSell = async (req, res) => {
    try {
        const { sessionId, productId, relatedProductId } = z.object({
            sessionId: z.string(), productId: z.string(), relatedProductId: z.string(),
        }).parse(req.body);
        const id = await merchantId();
        const cart = await getOrCreateCart({ merchantId: id, sessionId });
        const related = await relatedProducts({ merchantId: id, productId });
        if (!cart.items.some(item => item.productId === productId)
            || !related.some(product => product.id === relatedProductId)) {
            return res.status(400).json({ error: 'Cross-sell does not match this cart' });
        }
        await audit({ merchantId: id, sessionId, actor: 'STOREFRONT', action: 'PRODUCT_RECOMMENDATION',
            output: { kind: 'DISPLAYED_RECOMMENDATION', productIds: [relatedProductId], crossSellProductIds: [relatedProductId] } });
        res.json({ recorded: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
