import { Router } from 'express';
import { health, getMerchant } from '../controllers/merchantController.js';

export const merchantRoutes = Router();
merchantRoutes.get('/health', health);
merchantRoutes.get('/merchant', getMerchant);
