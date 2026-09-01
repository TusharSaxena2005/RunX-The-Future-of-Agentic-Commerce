import { prisma } from '../db.js';
import { relatedProducts, searchProducts } from '../services/catalogService.js';
import { saveProduct } from '../services/productManagementService.js';
import { merchantId } from '../services/merchantService.js';

export const listProducts = async (req, res) => {
    try {
        const id = await merchantId();
        if (req.auth.role === 'merchant') {
            const products = await prisma.product.findMany({ where: { merchantId: id, active: true },
                orderBy: { createdAt: 'desc' }, include: { relatedFrom: true, relatedTo: true } });
            return res.json(products.map(({ relatedFrom, relatedTo, ...product }) => ({ ...product,
                relatedProductIds: [...new Set([...relatedFrom.map(r => r.toProductId), ...relatedTo.map(r => r.fromProductId)])],
            })));
        }
        const query = String(req.query.q || '');
        const maxPrice = req.query.maxPrice
            ? Number(req.query.maxPrice)
            : undefined;

        res.json(
            await searchProducts({
                merchantId: id,
                query,
                maxPrice,
                limit: 100,
            })
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createProduct = async (req, res) => {
    try {
        res.status(201).json(await saveProduct(await merchantId(), req.body));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const updateProduct = async (req, res) => {
    try {
        res.json(await saveProduct(await merchantId(), req.body, req.params.id));
    } catch (error) {
        res.status(error.message === 'Product not found' ? 404 : 400).json({ error: error.message });
    }
};

export const deleteProduct = async (req, res) => {
    const id = await merchantId();
    const result = await prisma.product.updateMany({ where: { id: req.params.id, merchantId: id, active: true }, data: { active: false } });
    if (!result.count) return res.status(404).json({ error: 'Product not found' });
    res.json({ deleted: true });
};

export const listRelatedProducts = async (req, res) => {
    try {
        const id = await merchantId();
        res.json(
            await relatedProducts({
                merchantId: id,
                productId: req.params.id,
            })
        );
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getProduct = async (req, res) => {
    const product = await prisma.product.findFirst({
        where: { id: req.params.id, merchantId: await merchantId(), active: true },
    });

    if (!product) {
        return res.status(404).json({ error: 'Not found' });
    }

    res.json(product);
};
