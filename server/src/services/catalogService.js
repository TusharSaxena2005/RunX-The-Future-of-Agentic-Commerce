import { prisma } from '../db.js';
import { findComplementaryProducts } from './crossSellService.js';

function normalizeToken(value) {
    const token = value.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (token.length > 4 && /(ches|shes|xes|zes|ses)$/.test(token)) {
        return token.slice(0, -2);
    }
    if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
        return token.slice(0, -1);
    }
    return token;
}

function fieldScore(value, terms, weight) {
    const tokens = String(value)
        .split(/\s+/)
        .map(normalizeToken)
        .filter(Boolean);

    return terms.reduce(
        (score, term) =>
            score + (tokens.some((token) => token.includes(term) || term.includes(token)) ? weight : 0),
        0
    );
}

export function scoreProductMatch(product, query) {
    const terms = query
        .split(/\s+/)
        .map(normalizeToken)
        .filter(Boolean);

    if (!terms.length) return 0;

    return (
        fieldScore(product.name, terms, 6) +
        fieldScore(product.category, terms, 5) +
        fieldScore((product.tags || []).join(' '), terms, 5) +
        fieldScore(product.description, terms, 2)
    );
}

export async function searchProducts({
    merchantId,
    query = '',
    maxPrice,
    limit = 6,
}) {
    const hasQuery = query.trim().length > 0;

    const products = await prisma.product.findMany({
        where: {
            merchantId,
            active: true,
            stock: { gt: 0 },
            ...(maxPrice ? { price: { lte: maxPrice } } : {}),
        },
    });

    return products
        .map((product) => {
            const relevance = scoreProductMatch(product, query);
            const score = relevance + product.popularity;

            return {
                ...product,
                relevance,
                matchScore: score,
            };
        })
        .filter((product) => !hasQuery || product.relevance > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, limit);
}

export async function getProduct({ merchantId, productId }) {
    return prisma.product.findFirst({
        where: {
            id: productId,
            merchantId,
            active: true,
        },
    });
}

export async function relatedProducts({ merchantId, productId }) {
    const source = await getProduct({ merchantId, productId });
    if (!source) return [];
    const relations = await prisma.productRelation.findMany({
        where: {
            OR: [
                { fromProductId: productId },
                { toProductId: productId },
            ],
        },
        orderBy: {
            score: 'desc',
        },
        include: {
            fromProduct: true,
            toProduct: true,
        },
    });

    const linked = relations
        .map((relation) => ({
            relation,
            product:
                relation.fromProductId === productId
                    ? relation.toProduct
                    : relation.fromProduct,
        }))
        .filter(
            ({ product }) =>
                product.merchantId === merchantId &&
                product.active &&
                product.stock > 0
        )
        .map(({ relation, product }) => ({
            ...product,
            relationScore: relation.score,
        }));
    return linked.length ? linked : findComplementaryProducts(source);
}
