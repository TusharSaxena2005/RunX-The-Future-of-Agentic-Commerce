import { Router } from 'express';
import { preparePayment, verifyPayment, simulatePayment, cancelPayment } from '../controllers/paymentsController.js';

export const paymentRoutes = Router();
paymentRoutes.post('/prepare', preparePayment);
paymentRoutes.post('/verify', verifyPayment);
paymentRoutes.post('/cancel', cancelPayment);
paymentRoutes.post('/demo-success', simulatePayment);
