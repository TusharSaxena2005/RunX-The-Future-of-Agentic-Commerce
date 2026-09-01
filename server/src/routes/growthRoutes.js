import { Router } from 'express';
import { listGrowthStrategies, analyzeGrowth, activateGrowthStrategy } from '../controllers/growthController.js';

export const growthRoutes = Router();
growthRoutes.get('/growth', listGrowthStrategies);
growthRoutes.post('/growth/analyze', analyzeGrowth);
growthRoutes.post('/growth/:id/activate', activateGrowthStrategy);
