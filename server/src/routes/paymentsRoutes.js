import { Router } from 'express';
import { preparePayment, verifyPayment, simulatePayment } from '../controllers/paymentsController.js';

export const paymentRoutes = Router();
paymentRoutes.post('/prepare', preparePayment);
paymentRoutes.post('/verify', verifyPayment);
paymentRoutes.post('/demo-success', simulatePayment);
