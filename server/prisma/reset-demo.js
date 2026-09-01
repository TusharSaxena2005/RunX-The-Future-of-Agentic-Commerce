import { PrismaClient } from '../generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
    const merchant = await prisma.merchant.findFirst({
        orderBy: {
            createdAt: 'asc',
        },
    });

    if (!merchant) {
        throw new Error(
            'No merchant found. Run npm run db:seed first.'
        );
    }

    // Clear customer-facing and transaction data.
    await prisma.salesEvent.deleteMany({
        where: {
            merchantId: merchant.id,
        },
    });

    await prisma.agentAction.deleteMany({
        where: {
            merchantId: merchant.id,
        },
    });

    await prisma.payment.deleteMany({
        where: {
            order: {
                merchantId: merchant.id,
            },
        },
    });

    await prisma.orderItem.deleteMany({
        where: {
            order: {
                merchantId: merchant.id,
            },
        },
    });

    await prisma.order.deleteMany({
        where: {
            merchantId: merchant.id,
        },
    });

    await prisma.cartItem.deleteMany({
        where: {
            cart: {
                merchantId: merchant.id,
            },
        },
    });

    await prisma.cart.deleteMany({
        where: {
            merchantId: merchant.id,
        },
    });

    // Customers are demo/test users tied to transactions and sessions.
    await prisma.customer.deleteMany();

    // Keep growth strategies, but clear their live/demo counters and
    // return them to a clean proposed state for a fresh run.
    await prisma.growthStrategy.updateMany({
        where: {
            merchantId: merchant.id,
        },
        data: {
            status: 'PROPOSED',
            activationTime: null,
            conversions: 0,
            attributedPurchases: 0,
            attributedRevenue: 0,
            additionalRevenue: 0,
        },
    });

    console.log('Fresh-start reset complete.');
    console.log('Preserved: merchant, products, product relations, policies.');
    console.log('Cleared: customers, carts, orders, payments, sales events, audit events.');
    console.log('Reset: growth strategy status, conversions, and additional revenue.');
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
