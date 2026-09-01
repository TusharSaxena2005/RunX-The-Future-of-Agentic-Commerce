const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function request(path, options = {}) {
    let token;
    try { token = JSON.parse(localStorage.getItem('runx_auth') || 'null')?.token; } catch { /* A stale local login cannot grant server permissions. */ }
    const response = await fetch(BASE + path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...(options.headers || {}),
        },
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 && path !== '/auth/login') {
        localStorage.removeItem('runx_auth');
        localStorage.removeItem('runx_session');
        window.location.assign('/login');
    }
    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

export const api = {
    login: body => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    verifyPayment: body => request('/payments/verify', { method: 'POST', body: JSON.stringify(body) }),
    chat: (body, signal) =>
        request('/agent/chat', {
            method: 'POST',
            body: JSON.stringify(body),
            signal,
        }),
    stopChat: () => request('/agent/stop', { method: 'POST' }),
    clearChat: () => request('/agent/clear', { method: 'POST' }),
    cart: (s) => request('/cart/' + s),
    add: (body) =>
        request('/cart/items', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    calc: (body) =>
        request('/cart/calculate', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    order: (body) =>
        request('/orders', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    demoPay: (body) =>
        request('/payments/demo-success', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    preparePayment: (body) =>
        request('/payments/prepare', {
            method: 'POST',
            body: JSON.stringify({ ...body, approved: true }),
        }),
    analytics: () => request('/analytics'),
    recordCrossSell: (body) => request('/agent/cross-sell-exposure', {
        method: 'POST', body: JSON.stringify(body),
    }),
    growth: () => request('/growth'),
    analyzeGrowth: () =>
        request('/growth/analyze', { method: 'POST' }),
    activate: (id) =>
        request('/growth/' + id + '/activate', {
            method: 'POST',
        }),
    audit: () => request('/audit'),
    products: (params = '') => request('/products' + params),
    updateProduct: (id, body) => request('/products/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(body) }),
    deleteProduct: (id) => request('/products/' + encodeURIComponent(id), { method: 'DELETE' }),
    relatedProducts: (id) => request(`/products/${id}/related`),
    createProduct: (body) =>
        request('/products', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    policies: () => request('/policies'),
    discount: (body) =>
        request('/policies/discount', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    updatePolicies: (body) =>
        request('/policies', {
            method: 'PUT',
            body: JSON.stringify(body),
        }),
};

export function money(n) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(n || 0);
}
