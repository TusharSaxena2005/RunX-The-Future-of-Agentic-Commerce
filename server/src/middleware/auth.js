import { sessions } from '../services/sessionService.js';

export function authenticate(req, res, next) {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
        sessions.delete(token);
        return res.status(401).json({ error: 'Sign in again to continue' });
    }
    req.auth = session;
    req.authToken = token;
    next();
}

export function authorizeApi(req, res, next) {
    const merchantOnly = /^\/(merchant|analytics|growth|audit)(\/|$)/.test(req.path) ||
        (/^\/products(\/|$)/.test(req.path) && req.method !== 'GET') ||
        (req.path === '/policies' && req.method !== 'GET');
    if (merchantOnly && req.auth.role !== 'merchant') return res.status(403).json({ error: 'Merchant permission required' });
    const customerOnly = /^\/(cart|orders|payments|agent)(\/|$)/.test(req.path);
    if (customerOnly && req.auth.role !== 'customer') return res.status(403).json({ error: 'Customer permission required' });
    if (customerOnly) {
        const pathSession = req.path.startsWith('/cart/') && req.method === 'GET' ? decodeURIComponent(req.path.slice(6)) : undefined;
        if ((pathSession && pathSession !== req.auth.sessionId) || (req.body?.sessionId && req.body.sessionId !== req.auth.sessionId)) {
            return res.status(403).json({ error: 'Session does not belong to this account' });
        }
        if (req.method !== 'GET') req.body = { ...req.body, sessionId: req.auth.sessionId };
    }
    next();
}
