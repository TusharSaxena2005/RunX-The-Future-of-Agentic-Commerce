import { razorpayWebhook } from './controllers/webhookController.js';
import express from 'express';
import cors from 'cors';
import { router } from './routes/index.js';
import { sensitiveLimiter } from './middleware/security.js';

import { authenticate, authorizeApi } from './middleware/auth.js';
import { authRoutes } from './routes/authRoutes.js';
import { health } from './controllers/merchantController.js';

export const app = express();

app.use(
    cors({
        origin:
            process.env.CLIENT_ORIGIN ||
            'http://localhost:5173',
    })
);

// Raw bytes must be verified before the JSON body parser.
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), razorpayWebhook);

app.use(express.json({ limit: '1mb' }));
app.use('/api/payments', sensitiveLimiter);
app.use('/api/policies', sensitiveLimiter);
app.use('/api/agent', sensitiveLimiter);
app.get('/api/health', health);
app.use('/api/auth', authRoutes);
app.use('/api', authenticate);
app.use('/api', authorizeApi, router);

app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({
        error: 'Internal server error',
    });
});
