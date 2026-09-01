import { PrismaClient } from '../generated/client/index.js';
import { comparisonProducts } from './comparison-products.js';

const prisma = new PrismaClient();

const products = [
    {
        name: 'Nike Revolution 7',
        description:
            'Lightweight daily running shoe with responsive cushioning.',
        category: 'Running Shoes',
        price: 3799,
        stock: 42,
        image:
            'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
        tags: ['running', 'daily', 'cushioning', 'nike'],
        specifications: {
            fit: 'regular',
            use: 'daily running',
            color: 'black/white',
        },
        popularity: 0.94,
        conversionRate: 0.18,
    },
    {
        name: 'Adidas Duramo',
        description:
            'Comfortable everyday running shoe built for reliable training miles.',
        category: 'Running Shoes',
        price: 3499,
        stock: 35,
        image:
            'https://images.unsplash.com/photo-1518002171953-a080ee817e1f?auto=format&fit=crop&w=800&q=80',
        tags: ['running', 'daily', 'training', 'adidas'],
        specifications: {
            fit: 'regular',
            use: 'training',
            color: 'grey',
        },
        popularity: 0.87,
        conversionRate: 0.16,
    },
    {
        name: 'Running Socks',
        description:
            'Breathable moisture-wicking socks designed for running.',
        category: 'Accessories',
        price: 299,
        stock: 120,
        image:
            'https://images.unsplash.com/photo-1582966772680-860e372bb558?auto=format&fit=crop&w=800&q=80',
        tags: ['running', 'socks', 'accessory'],
        specifications: {
            material: 'moisture-wicking blend',
        },
        popularity: 0.88,
        conversionRate: 0.23,
    },
    {
        name: 'Sports Bottle',
        description:
            '750ml reusable sports bottle for training and daily hydration.',
        category: 'Accessories',
        price: 399,
        stock: 90,
        image:
            'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',
        tags: ['hydration', 'bottle', 'training'],
        specifications: {
            capacity: '750ml',
        },
        popularity: 0.72,
        conversionRate: 0.14,
    },
    {
        name: 'Running T-Shirt',
        description:
            'Breathable quick-dry running tee for daily workouts.',
        category: 'Apparel',
        price: 899,
        stock: 64,
        image:
            'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80',
        tags: ['running', 'shirt', 'quick-dry'],
        specifications: {
            fabric: 'polyester blend',
        },
        popularity: 0.76,
        conversionRate: 0.12,
    },
    {
        name: 'Sports Watch',
        description:
            'Fitness watch for pace, distance and workout tracking.',
        category: 'Wearables',
        price: 2999,
        stock: 22,
        image:
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
        tags: ['watch', 'fitness', 'tracking'],
        specifications: {
            features: ['pace', 'distance', 'workouts'],
        },
        popularity: 0.69,
        conversionRate: 0.1,
    },
    {
        name: 'Training Shorts',
        description:
            'Lightweight stretch shorts with quick-dry fabric for gym and running sessions.',
        category: 'Apparel',
        price: 1199,
        stock: 48,
        image:
            '/images/products/training-shorts.png',
        tags: ['training', 'shorts', 'quick-dry', 'gym'],
        specifications: {
            fabric: 'stretch polyester',
            fit: 'athletic',
        },
        popularity: 0.74,
        conversionRate: 0.13,
    },
    {
        name: 'Premium Yoga Mat',
        description:
            'Cushioned non-slip exercise mat for yoga, mobility and floor workouts.',
        category: 'Fitness Equipment',
        price: 1499,
        stock: 38,
        image:
            'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?auto=format&fit=crop&w=800&q=80',
        tags: ['yoga', 'mobility', 'home-workout', 'mat'],
        specifications: {
            thickness: '6mm',
            surface: 'non-slip',
        },
        popularity: 0.78,
        conversionRate: 0.15,
    },
    {
        name: 'Training Duffel Bag',
        description:
            'Roomy water-resistant gym bag with a separate shoe compartment.',
        category: 'Bags',
        price: 1899,
        stock: 31,
        image:
            'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
        tags: ['gym', 'bag', 'training', 'travel'],
        specifications: {
            capacity: '35L',
            material: 'water-resistant polyester',
        },
        popularity: 0.71,
        conversionRate: 0.11,
    },
    {
        name: 'Resistance Band Set',
        description:
            'Five resistance levels for strength training, warm-ups and recovery.',
        category: 'Fitness Equipment',
        price: 799,
        stock: 72,
        image:
            '/images/products/resistance-band-set.png',
        tags: ['strength', 'bands', 'home-workout', 'recovery'],
        specifications: {
            levels: 5,
            includes: ['bands', 'handles', 'carry pouch'],
        },
        popularity: 0.82,
        conversionRate: 0.17,
    },
    {
        name: 'Performance Cap',
        description:
            'Lightweight breathable running cap with an adjustable moisture-wicking band.',
        category: 'Accessories',
        price: 699,
        stock: 58,
        image:
            'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80',
        tags: ['running', 'cap', 'sun-protection', 'accessory'],
        specifications: {
            fit: 'adjustable',
            material: 'quick-dry polyester',
        },
        popularity: 0.7,
        conversionRate: 0.14,
    },
    {
        name: 'Speed Jump Rope',
        description:
            'Adjustable coated-steel jump rope for cardio, conditioning and warm-ups.',
        category: 'Fitness Equipment',
        price: 599,
        stock: 80,
        image:
            '/images/products/speed-jump-rope.png',
        tags: ['cardio', 'jump-rope', 'training', 'home-workout'],
        specifications: {
            length: 'adjustable',
            cable: 'coated steel',
        },
        popularity: 0.76,
        conversionRate: 0.16,
    },
    {
        name: 'Workout Gloves',
        description:
            'Padded training gloves with breathable palms and secure wrist support.',
        category: 'Accessories',
        price: 899,
        stock: 46,
        image:
            '/images/products/workout-gloves.png',
        tags: ['gym', 'gloves', 'strength', 'grip'],
        specifications: {
            padding: 'foam palm',
            support: 'adjustable wrist strap',
        },
        popularity: 0.73,
        conversionRate: 0.12,
    },
];

async function main() {
    if (await prisma.merchant.count() && !process.argv.includes('--reset')) {
        throw new Error('Database already contains a merchant. Seeding replaces demo data; pass --reset only if you intend to erase it.');
    }
    await prisma.salesEvent.deleteMany();
    await prisma.growthStrategy.deleteMany();
    await prisma.agentAction.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cartItem.deleteMany();
    await prisma.cart.deleteMany();
    await prisma.productRelation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.policy.deleteMany();
    await prisma.merchant.deleteMany();

    const merchant = await prisma.merchant.create({
        data: {
            name: 'RunX Sports',
        },
    });

    const created = {};

    for (const product of [...products, ...comparisonProducts]) {
        created[product.name] = await prisma.product.create({
            data: {
                ...product,
                merchantId: merchant.id,
            },
        });
    }

    await prisma.policy.create({
        data: {
            merchantId: merchant.id,
            maximumTransactionAmount: 5000,
            maximumDiscountPercentage: 10,
            maximumDiscountAmount: 500,
            paymentApprovalRequired: true,
            aiRefundsAllowed: false,
            aiPriceModificationAllowed: false,
        },
    });

    const pairs = [
        ['Nike Revolution 7', 'Running Socks', 0.96],
        ['Adidas Duramo', 'Running Socks', 0.91],
        ['Nike Revolution 7', 'Sports Bottle', 0.58],
        ['Running T-Shirt', 'Running Socks', 0.63],
        ['Nike Revolution 7', 'Sports Watch', 0.36],
    ];

    for (const [from, to, score] of pairs) {
        await prisma.productRelation.create({
            data: {
                fromProductId: created[from].id,
                toProductId: created[to].id,
                score,
            },
        });
    }

    await prisma.growthStrategy.createMany({
        data: [
            {
                merchantId: merchant.id,
                type: 'CROSS_SELL',
                name: 'Running Shoe → Socks Cross-sell',
                description:
                    'Show Running Socks after a customer selects a running shoe.',
                affectedProductIds: [
                    created['Nike Revolution 7'].id,
                    created['Adidas Duramo'].id,
                    created['Running Socks'].id,
                ],
                status: 'PROPOSED',
            },
            {
                merchantId: merchant.id,
                type: 'HIGH_CONVERSION',
                name: 'Prioritize high-conversion products',
                description:
                    'Bias recommendations toward products with strong conversion rates when intent matches.',
                affectedProductIds: [
                    created['Nike Revolution 7'].id,
                ],
                status: 'PROPOSED',
            },
            {
                merchantId: merchant.id,
                type: 'CART_RECOVERY',
                name: 'Recover abandoned carts',
                description:
                    'Offer a reminder and bounded incentive on eligible abandoned carts.',
                affectedProductIds: [
                    created['Running Socks'].id,
                    created['Sports Bottle'].id,
                ],
                status: 'PROPOSED',
            },
            {
                merchantId: merchant.id,
                type: 'BOUNDED_DISCOUNT',
                name: '10% bounded discount',
                description:
                    'Use a discount only when policy allows and only up to the configured maximum.',
                affectedProductIds: [
                    created['Nike Revolution 7'].id,
                ],
                status: 'PROPOSED',
            },
        ],
    });

    const now = Date.now();

    for (let i = 0; i < 30; i += 1) {
        const date = new Date(
            now - (29 - i) * 86400000
        );
        const base =
            7100 +
            (i % 7) * 430 +
            Math.round(Math.sin(i / 3) * 500);
        const ai = i >= 15;

        await prisma.salesEvent.create({
            data: {
                merchantId: merchant.id,
                timestamp: date,
                channel: ai ? 'AI_AGENT' : 'DIRECT',
                revenue: base,
                aov:
                    2800 +
                    (i % 5) * 35 +
                    (ai ? 100 : 0),
                aiAttributed: ai,
                upsellRevenue: ai
                    ? 260 + (i % 4) * 70
                    : 0,
                converted: true,
            },
        });
    }

    console.log('Seeded RunX Sports:', merchant.id);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
