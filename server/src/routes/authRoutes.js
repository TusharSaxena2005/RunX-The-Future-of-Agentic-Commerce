import { Router } from 'express';
import { login, logout } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { sensitiveLimiter } from '../middleware/security.js';

export const authRoutes = Router();
authRoutes.post('/login', sensitiveLimiter, login);
authRoutes.post('/logout', authenticate, logout);
