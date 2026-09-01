import { api } from './api.js';
const AUTH_KEY = 'runx_auth';
export function getAuth() {
    try {
        const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
        return auth?.token && auth.expiresAt > Date.now() ? auth : null;
    } catch { return null; }
}
export async function login(email, password, role) {
    const auth = await api.login({ email, password, role });
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    localStorage.setItem('runx_session', auth.sessionId);
    return auth;
}
export function logout() {
    // Capture credentials synchronously before clearing browser storage.
    api.logout().catch(() => {});
    const sessionId = localStorage.getItem('runx_session');
    if (sessionId) localStorage.removeItem('runx_chat_' + sessionId);
    localStorage.removeItem('runx_session');
    localStorage.removeItem(AUTH_KEY);
}
export function isLoggedIn() { return Boolean(getAuth()); }
export function hasRole(role) { return getAuth()?.role === role; }
