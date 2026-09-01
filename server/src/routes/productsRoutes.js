import { Router } from 'express';
import { listProducts, createProduct, updateProduct, deleteProduct, listRelatedProducts, getProduct } from '../controllers/productsController.js';

export const productsRoutes = Router();
productsRoutes.get('/products', listProducts);
productsRoutes.post('/products', createProduct);
productsRoutes.put('/products/:id', updateProduct);
productsRoutes.delete('/products/:id', deleteProduct);
productsRoutes.get('/products/:id/related', listRelatedProducts);
productsRoutes.get('/products/:id', getProduct);
