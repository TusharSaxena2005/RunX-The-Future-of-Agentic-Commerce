import { Router } from 'express';
import { listAuditEvents } from '../controllers/auditController.js';

export const auditRoutes = Router();
auditRoutes.get('/audit', listAuditEvents);
