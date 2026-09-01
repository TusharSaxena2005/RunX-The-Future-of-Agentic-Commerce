import { Router } from 'express';
import { getPolicies, updatePolicies, evaluatePolicy, quoteDiscount } from '../controllers/policiesController.js';

export const policiesRoutes = Router();
policiesRoutes.get('/policies', getPolicies);
policiesRoutes.put('/policies', updatePolicies);
policiesRoutes.post('/policies/evaluate', evaluatePolicy);
policiesRoutes.post('/policies/discount', quoteDiscount);
