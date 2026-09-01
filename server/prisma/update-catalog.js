import { PrismaClient } from '../generated/client/index.js';

const prisma = new PrismaClient();

const adidasImage =
    'https://images.unsplash.com/photo-1518002171953-a080ee817e1f?auto=format&fit=crop&w=800&q=80';

const additions = [
    {
        name: 'Training Shorts',
        description: 'Lightweight stretch shorts with quick-dry fabric for gym and running sessions.',
        category: 'Apparel',
        price: 1199,
        stock: 48,
        image: '/images/products/training-shorts.png',
        tags: ['training', 'shorts', 'quick-dry', 'gym'],
        specifications: { fabric: 'stretch polyester', fit: 'athletic' },
        popularity: 0.74,
        conversionRate: 0.13,
    },
    {
        name: 'Premium Yoga Mat',
        description: 'Cushioned non-slip exercise mat for yoga, mobility and floor workouts.',
        category: 'Fitness Equipment',
        price: 1499,
        stock: 38,
        image: 'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?auto=format&fit=crop&w=800&q=80',
        tags: ['yoga', 'mobility', 'home-workout', 'mat'],
        specifications: { thickness: '6mm', surface: 'non-slip' },
        popularity: 0.78,
        conversionRate: 0.15,
    },
    {
        name: 'Training Duffel Bag',
        description: 'Roomy water-resistant gym bag with a separate shoe compartment.',
        category: 'Bags',
        price: 1899,
        stock: 31,
        image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',
        tags: ['gym', 'bag', 'training', 'travel'],
        specifications: { capacity: '35L', material: 'water-resistant polyester' },
        popularity: 0.71,
        conversionRate: 0.11,
    },
    {
        name: 'Resistance Band Set',
        description: 'Five resistance levels for strength training, warm-ups and recovery.',
        category: 'Fitness Equipment',
        price: 799,
        stock: 72,
        image: '/images/products/resistance-band-set.png',
        tags: ['strength', 'bands', 'home-workout', 'recovery'],
        specifications: { levels: 5, includes: ['bands', 'handles', 'carry pouch'] },
        popularity: 0.82,
        conversionRate: 0.17,
    },
    {
        name: 'Performance Cap',
        description: 'Lightweight breathable running cap with an adjustable moisture-wicking band.',
        category: 'Accessories',
        price: 699,
        stock: 58,
        image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=800&q=80',
        tags: ['running', 'cap', 'sun-protection', 'accessory'],
        specifications: { fit: 'adjustable', material: 'quick-dry polyester' },
        popularity: 0.7,
        conversionRate: 0.14,
    },
    {
        name: 'Speed Jump Rope',
        description: 'Adjustable coated-steel jump rope for cardio, conditioning and warm-ups.',
        category: 'Fitness Equipment',
        price: 599,
        stock: 80,
        image: '/images/products/speed-jump-rope.png',
        tags: ['cardio', 'jump-rope', 'training', 'home-workout'],
        specifications: { length: 'adjustable', cable: 'coated steel' },
        popularity: 0.76,
        conversionRate: 0.16,
    },
    {
        name: 'Workout Gloves',
        description: 'Padded training gloves with breathable palms and secure wrist support.',
        category: 'Accessories',
        price: 899,
        stock: 46,
        image: '/images/products/workout-gloves.png',
        tags: ['gym', 'gloves', 'strength', 'grip'],
        specifications: { padding: 'foam palm', support: 'adjustable wrist strap' },
        popularity: 0.73,
        conversionRate: 0.12,
    },
];

async function main() {
    const merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!merchant) throw new Error('No merchant found. Run the initial seed once first.');

    const adidas = await prisma.product.findFirst({
        where: { merchantId: merchant.id, name: 'Adidas Duramo' },
    });
    if (adidas) {
        await prisma.product.update({ where: { id: adidas.id }, data: { image: adidasImage } });
    }

    for (const product of additions) {
        const existing = await prisma.product.findFirst({
            where: { merchantId: merchant.id, name: product.name },
        });
        if (existing) {
            await prisma.product.update({ where: { id: existing.id }, data: product });
        } else {
            await prisma.product.create({ data: { ...product, merchantId: merchant.id } });
        }
    }

    console.log(`Catalog updated: Adidas image corrected and ${additions.length} products synchronized.`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => prisma.$disconnect());
