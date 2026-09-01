import { Router } from 'express';
import { getCart, addCartItem, calculateCartTotals } from '../controllers/cartController.js';

export const cartRoutes = Router();
cartRoutes.get('/cart/:sessionId', getCart);
cartRoutes.post('/cart/items', addCartItem);
cartRoutes.post('/cart/calculate', calculateCartTotals);
