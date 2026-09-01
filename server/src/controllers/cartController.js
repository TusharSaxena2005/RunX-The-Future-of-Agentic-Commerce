import { z } from 'zod';
import { addToCart, calculateCart, getOrCreateCart } from '../services/cartService.js';
import { merchantId } from '../services/merchantService.js';

export const getCart = async (req, res) => {
    const id = await merchantId();
    res.json(
        await getOrCreateCart({
            merchantId: id,
            sessionId: req.params.sessionId,
        })
    );
};

export const addCartItem = async (req, res) => {
    try {
        const id = await merchantId();
        const body = z
            .object({
                sessionId: z.string(),
                productId: z.string(),
                quantity: z.number().int().positive().max(20),
            })
            .parse(req.body);

        res.json(
            await addToCart({
                merchantId: id,
                ...body,
            })
        );
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const calculateCartTotals = async (req, res) => {
    try {
        const id = await merchantId();
        res.json(
            await calculateCart({
                merchantId: id,
                sessionId: req.body.sessionId,
                discount: Number(req.body.discount || 0),
            })
        );
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};
