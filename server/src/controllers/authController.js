import crypto from 'node:crypto';
import { sessions, TTL } from '../services/sessionService.js';

export function demoAuthEnabled() {
    return process.env.ALLOW_DEMO_AUTH === 'true' && process.env.NODE_ENV !== 'production';
}

function equal(a, b) {
    const hash = value => crypto.createHash('sha256').update(String(value)).digest();
    return crypto.timingSafeEqual(hash(a), hash(b));
}

export function login(req, res) {
    const { email, password, role } = req.body || {};
    if (!['customer', 'merchant'].includes(role)) return res.status(401).json({ error: 'Invalid credentials' });
    const prefix = role.toUpperCase();
    const expectedEmail = process.env[`${prefix}_EMAIL`] || (demoAuthEnabled() ? `${role}@runx.test` : null);
    const expectedPassword = process.env[`${prefix}_PASSWORD`] || (demoAuthEnabled() ? `${role}123` : null);
    if (!expectedEmail || !expectedPassword || !equal(email, expectedEmail) || !equal(password, expectedPassword)) {
        return res.status(401).json({ error: 'Invalid credentials or account not configured' });
    }
    for (const [key, session] of sessions) if (session.expiresAt <= Date.now()) sessions.delete(key);
    if (sessions.size >= 1000) return res.status(503).json({ error: 'Session capacity reached' });
    const token = crypto.randomBytes(32).toString('hex');
    const session = { role, email, name: role === 'merchant' ? 'RunX Merchant' : 'RunX Customer', sessionId: crypto.randomUUID(), expiresAt: Date.now() + TTL };
    sessions.set(token, session);
    res.json({ ...session, token });
}

export function logout(req, res) {
    sessions.delete(req.authToken);
    res.json({ ok: true });
}
