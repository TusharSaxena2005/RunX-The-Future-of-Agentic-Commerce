import { z } from 'zod';
import { prisma } from '../db.js';

const imagePath = z.string().refine(value => {
    if (/^\/images\/[a-zA-Z0-9/_ .-]+$/.test(value) && !value.includes('..')) return true;
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}, 'Use an HTTP(S) image URL or a local /images/ path');

export const productSchema = z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(5).max(1000),
    category: z.string().trim().min(2).max(80),
    price: z.number().int().positive().max(2147483647),
    stock: z.number().int().nonnegative().max(2147483647),
    image: imagePath,
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    specifications: z.record(z.string(), z.any()).default({}),
    popularity: z.number().min(0).max(1).default(0),
    conversionRate: z.number().min(0).max(1).default(0),
    relatedProductIds: z.array(z.string()).max(10).default([]),
});

export async function saveProduct(merchantId, body, productId) {
    const { relatedProductIds, ...data } = productSchema.parse(body);
    return prisma.$transaction(async tx => {
        if (productId && !await tx.product.findFirst({ where: { id: productId, merchantId, active: true } })) {
            throw new Error('Product not found');
        }
        const ids = [...new Set(relatedProductIds)].filter(id => id !== productId);
        const related = await tx.product.findMany({ where: { id: { in: ids }, merchantId, active: true }, select: { id: true } });
        if (related.length !== ids.length) throw new Error('A selected related product is no longer available');
        const product = productId
            ? await tx.product.update({ where: { id: productId }, data })
            : await tx.product.create({ data: { ...data, merchantId } });
        // Relations are displayed in both directions; editing replaces that full set.
        await tx.productRelation.deleteMany({ where: { OR: [{ fromProductId: product.id }, { toProductId: product.id }] } });
        if (ids.length) await tx.productRelation.createMany({ data: ids.map(id => ({ fromProductId: product.id, toProductId: id, score: 0.5 })) });
        return product;
    });
}
