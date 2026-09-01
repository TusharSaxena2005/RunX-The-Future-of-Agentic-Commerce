import { Router } from 'express';
import { createOrder } from '../controllers/ordersController.js';

export const ordersRoutes = Router();
ordersRoutes.post('/orders', createOrder);
