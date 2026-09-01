// Brand/model names and features are sourced below. Prices and inventory are
// deliberate demo fixtures, not manufacturer prices or confirmed availability.
const entries = [
    {
        name: 'Adidas Resistance Tube Set', brand: 'Adidas', category: 'Fitness Equipment',
        price: 2499, image: '/images/products/resistance-band-set.png',
        description: 'Five interchangeable resistance tubes with padded handles, door anchor and ankle strap for varied strength exercises.',
        tags: ['resistance', 'bands', 'tubes', 'strength', 'home-workout'],
        details: { levels: 5, resistance: '5–75 kg combined', includes: ['handles', 'door anchor', 'ankle strap', 'carry bag'] },
        sourceUrl: 'https://www.adidashardware.com/catalogue-training/resistance-tube-set',
    },
    {
        name: 'Adidas Speed Rope', brand: 'Adidas', category: 'Fitness Equipment',
        price: 999, image: '/images/products/speed-jump-rope.png',
        description: 'Adjustable-length skipping rope for cardio sessions and skipping practice.',
        tags: ['speed', 'jump', 'rope', 'skipping', 'cardio', 'training'],
        details: { length: 'adjustable', use: 'skipping and cardio' },
        sourceUrl: 'https://www.adidashardware.com/catalogue-training/speed-rope',
    },
    {
        name: 'Nike Totality Dri-FIT Training Shorts', brand: 'Nike', category: 'Apparel',
        price: 1999, image: '/images/products/training-shorts.png',
        description: 'Relaxed-fit, sweat-wicking Dri-FIT shorts for gym and home workouts; unlined 7-inch style.',
        tags: ['training', 'shorts', 'gym', 'dri-fit', 'quick-dry'],
        details: { fit: 'relaxed', inseam: '7 inches', lining: 'unlined', fabric: 'recycled polyester' },
        sourceUrl: 'https://www.nike.com/t/dri-fit-totality-mens-7-unlined-knit-shorts-M2Jb3W',
    },
    {
        name: 'Puma teamLIGA26 Training Shorts', brand: 'Puma', category: 'Apparel',
        price: 1599, image: '/images/products/training-shorts.png',
        description: 'Men’s teamLIGA26 training shorts, an alternative for sports training and team practice.',
        tags: ['training', 'shorts', 'sports', 'football', 'teamliga'],
        details: { use: 'sports training', model: 'teamLIGA26', styleCode: '659730' },
        sourceUrl: 'https://in.puma.com/in/en/pd/teamliga26-mens-training-shorts/659730',
    },
    {
        name: 'Adidas Essential Training Gloves', brand: 'Adidas', category: 'Accessories',
        price: 1299, image: '/images/products/workout-gloves.png',
        description: 'Ventilated training gloves with padded suedette palms and a Velcro wrist fastening.',
        tags: ['workout', 'gloves', 'gym', 'training', 'grip', 'strength'],
        details: { palm: 'padded suedette', fastening: 'Velcro wrist', ventilation: 'ventilated palm' },
        sourceUrl: 'https://www.adidashardware.com/catalogue-training/essential-training-gloves',
    },
    {
        name: 'Reebok CrossFunctional Training Gloves', brand: 'Reebok', category: 'Accessories',
        price: 1799, image: '/images/products/workout-gloves.png',
        description: 'Black cross-functional training gloves made with a polyamide and elastane blend.',
        tags: ['workout', 'gloves', 'gym', 'training', 'cross-functional'],
        details: { material: '82% polyamide, 18% elastane', color: 'black', styleCode: 'GD1002' },
        sourceUrl: 'https://reebok.abfrl.in/p/mens-reebok-crossfunctional-training-gloves-765984.html',
    },
];

export const comparisonProducts = entries.map(({ brand, details, sourceUrl, ...product }) => ({
    ...product,
    stock: 30,
    tags: [...product.tags, brand.toLowerCase()],
    specifications: { ...details, brand, sourceUrl, demoListing: true,
        priceNote: 'Demo INR price, not a manufacturer quote',
        stockNote: 'Simulated inventory', imageNote: 'Generic AI-generated category illustration, not the actual branded model' },
    popularity: 0,
    conversionRate: 0,
}));

export async function addComparisonProducts(db, merchantId) {
    const added = [];
    for (const product of comparisonProducts) {
        const existing = await db.product.findFirst({ where: { merchantId, name: product.name } });
        if (existing) continue; // Never reset stock, prices or merchant edits.
        const created = await db.product.create({ data: { ...product, merchantId } });
        added.push(created.name);
    }
    return added;
}
