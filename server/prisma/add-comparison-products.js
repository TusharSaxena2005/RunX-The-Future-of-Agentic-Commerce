import 'dotenv/config';
import { PrismaClient } from '../generated/client/index.js';
import { addComparisonProducts, comparisonProducts } from './comparison-products.js';

const prisma = new PrismaClient();
try {
    const result = await prisma.$transaction(async tx => {
        const merchant = await tx.merchant.findFirst({ orderBy: { createdAt: 'asc' } });
        if (!merchant) throw new Error('No merchant found. Initialize the catalog first.');
        // Serialize re-runs for this merchant without changing its values.
        await tx.$queryRaw`SELECT id FROM "Merchant" WHERE id = ${merchant.id} FOR UPDATE`;
        const added = await addComparisonProducts(tx, merchant.id);
        const products = await tx.product.findMany({ where: { merchantId: merchant.id,
            name: { in: comparisonProducts.map(p => p.name) } },
            select: { name: true, price: true, category: true } });
        return { added, products };
    });
    console.log(JSON.stringify(result, null, 2));
} finally {
    await prisma.$disconnect();
}
