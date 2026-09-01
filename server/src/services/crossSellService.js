import { prisma } from '../db.js';

// Conservative complements, not alternative main products or claims of purchase history.
const complements = {
    bags: ['bottle', 'towel', 'gloves', 'socks'],
    'running shoes': ['socks', 'bottle'],
    apparel: ['bottle', 'socks'],
    'fitness equipment': ['bottle', 'towel', 'gloves'],
    wearables: ['bottle', 'socks'],
};

export async function findComplementaryProducts(product) {
    const terms = complements[product.category.toLowerCase()];
    if (!terms) return [];
    const candidates = await prisma.product.findMany({ where: {
        merchantId: product.merchantId, active: true, stock: { gt: 0 },
        category: { equals: 'Accessories', mode: 'insensitive' },
        NOT: { id: product.id },
    } });
    return candidates
        .map(item => ({ item, rank: terms.findIndex(term =>
            `${item.name} ${(item.tags || []).join(' ')}`.toLowerCase().includes(term)) }))
        .filter(({ rank }) => rank >= 0)
        .sort((a, b) => a.rank - b.rank || a.item.price - b.item.price || a.item.id.localeCompare(b.item.id))
        .slice(0, 6)
        .map(({ item }) => ({ ...item, recommendationSource: 'category-complement' }));
}
