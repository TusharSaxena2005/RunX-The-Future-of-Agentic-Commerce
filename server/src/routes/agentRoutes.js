import { Router } from 'express';
import { chat, stopChat, clearChat, recordCrossSell } from '../controllers/agentController.js';

export const agentRoutes = Router();
agentRoutes.post('/agent/chat', chat);
agentRoutes.post('/agent/stop', stopChat);
agentRoutes.post('/agent/clear', clearChat);
agentRoutes.post('/agent/cross-sell-exposure', recordCrossSell);
