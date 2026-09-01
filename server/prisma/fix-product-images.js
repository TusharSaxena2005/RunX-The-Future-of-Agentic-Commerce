import 'dotenv/config';
import { PrismaClient } from '../generated/client/index.js';
import { catalogImageCorrections } from '../../shared/catalogImages.mjs';

const prisma = new PrismaClient();
try {
    const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!merchant) throw new Error('No merchant found.');
    const changes = await prisma.$transaction(catalogImageCorrections.map(({ name, image }) =>
        prisma.product.updateMany({ where: { merchantId: merchant.id, name }, data: { image } })
    ));
    const products = await prisma.product.findMany({
        where: { merchantId: merchant.id, name: { in: catalogImageCorrections.map(p => p.name) } },
        select: { name: true, image: true },
    });
    console.log(JSON.stringify({ updated: changes.reduce((sum, result) => sum + result.count, 0), products }, null, 2));
} finally {
    await prisma.$disconnect();
}
