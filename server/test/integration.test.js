import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

test('isolated PostgreSQL commerce safety scenarios', { timeout: 120000 }, async t => {
    dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    const schema = 'buildathon_test_' + crypto.randomBytes(8).toString('hex');
    const url = new URL(process.env.DATABASE_URL); url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
    process.env.ALLOW_DEMO_AUTH = 'true'; process.env.ALLOW_DEMO_PAYMENTS = 'true'; process.env.NODE_ENV = 'test';
    // Empty values prevent Prisma's env loader from restoring real provider keys.
    for (const key of ['CUSTOMER_EMAIL','CUSTOMER_PASSWORD','MERCHANT_EMAIL','MERCHANT_PASSWORD','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','GEMINI_API_KEY','RAZORPAY_WEBHOOK_SECRET']) process.env[key] = '';
    const child = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url)), 'db', 'push', '--skip-generate', '--schema', 'prisma/schema.prisma'], { cwd: new URL('..', import.meta.url), env: process.env, stdio: ['ignore','pipe','pipe'] });
    // Do not echo connection details. Schema is fresh; no existing data is changed.
    child.stdout.resume(); child.stderr.resume();
    const [code] = await once(child, 'exit'); assert.equal(code, 0, 'Could not create isolated test schema');
    const { prisma } = await import('../src/db.js');
    const { app } = await import('../src/app.js');
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port + '/api';
    const request = async (path, token, body, method = body ? 'POST' : 'GET') => {
        const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: response.status, data: await response.json() };
    };
    try {
        const merchant = await prisma.merchant.create({ data: { name: 'Isolated test merchant', policies: { create: { maximumTransactionAmount: 5000, maximumDiscountAmount: 500, maximumDiscountPercentage: 10 } } } });
        const shoe = await prisma.product.create({ data: { merchantId: merchant.id, name: 'Test Shoe', description: 'Fixture', category: 'Shoes', price: 800, stock: 100, image: 'https://example.com/shoe.png', tags: [], specifications: {} } });
        const sock = await prisma.product.create({ data: { merchantId: merchant.id, name: 'Test Socks', description: 'Fixture', category: 'Socks', price: 200, stock: 100, image: 'https://example.com/sock.png', tags: [], specifications: {} } });
        const customer = (await request('/auth/login', null, { role: 'customer', email: 'customer@runx.test', password: 'customer123' })).data;
        const other = (await request('/auth/login', null, { role: 'customer', email: 'customer@runx.test', password: 'customer123' })).data;
        const admin = (await request('/auth/login', null, { role: 'merchant', email: 'merchant@runx.test', password: 'merchant123' })).data;
        await t.test('anonymous requests and forged roles are denied', async () => {
            assert.equal((await request('/audit')).status, 401);
            assert.equal((await request('/growth', customer.token)).status, 403);
            assert.equal((await request('/policies', customer.token, {}, 'PUT')).status, 403);
            assert.equal((await request('/audit', 'forged-token')).status, 401);
            assert.equal((await request('/cart/' + customer.sessionId, other.token)).status, 403);
            assert.equal((await request('/cart/items', customer.token, { sessionId: other.sessionId, productId: shoe.id, quantity: 1 })).status, 403);
        });
        await t.test('AI Picks mode returns one final catalog recommendation', async () => {
            const result = await request('/agent/chat', customer.token, {
                sessionId: customer.sessionId,
                message: 'I need a test shoe',
                mode: 'ai_pick',
            });
            assert.equal(result.status, 200);
            assert.equal(result.data.products.length, 1);
            assert.equal(result.data.products[0].id, shoe.id);
            assert.match(result.data.message, /I recommend/i);
            assert.equal((await request('/agent/chat', customer.token, {
                sessionId: customer.sessionId,
                message: 'shoe',
                mode: 'unsupported',
            })).status, 400);
        });
        await t.test('quantity validation and stock bounds', async () => {
            for (const quantity of [-1,0,0.5,21]) assert.equal((await request('/cart/items', customer.token, { productId: shoe.id, quantity })).status, 400);
            assert.equal((await request('/cart/items', customer.token, { productId: shoe.id, quantity: 1 })).status, 200);
            assert.equal((await request('/cart/items', customer.token, { productId: sock.id, quantity: 1 })).status, 200);
        });
        await t.test('cross-sell exposure is session-bound and must match a catalog relation', async () => {
            await prisma.productRelation.create({ data: { fromProductId: shoe.id, toProductId: sock.id, score: 0.9 } });
            const body = { productId: shoe.id, relatedProductId: sock.id };
            assert.equal((await request('/agent/cross-sell-exposure', admin.token, body)).status, 403);
            assert.equal((await request('/agent/cross-sell-exposure', other.token, { ...body, sessionId: customer.sessionId })).status, 403);
            assert.equal((await request('/agent/cross-sell-exposure', customer.token, { ...body, relatedProductId: 'missing' })).status, 400);
            assert.equal((await request('/agent/cross-sell-exposure', customer.token, body)).status, 200);
        });
        await t.test('excessive percentage discount blocked and audited', async () => {
            const result = await request('/orders', customer.token, { discount: 200 });
            assert.equal(result.status, 422); assert.match(result.data.error, /discount/i);
            assert.equal(await prisma.order.count(), 0);
            assert.equal(await prisma.agentAction.count({ where: { action: 'POLICY_BLOCKED' } }), 1);
        });
        const strategy = await prisma.growthStrategy.create({ data: { merchantId: merchant.id, name: 'Socks recommendation', description: 'Fixture', type: 'CROSS_SELL', affectedProductIds: [shoe.id,sock.id] } });
        await t.test('UI discount preflight rejection appears in the audit trail', async () => {
            const result = await request('/policies/discount', customer.token, { subtotal: 1000, requestedPercent: 20 });
            assert.equal(result.data.allowed, false);
            assert.equal(await prisma.agentAction.count({ where: { action: 'POLICY_BLOCKED', sessionId: customer.sessionId } }), 2);
        });
        await t.test('only merchant can activate, and activation preserves zero actual outcomes', async () => {
            assert.equal((await request('/growth/'+strategy.id+'/activate', customer.token, {})).status, 403);
            const result = await request('/growth/'+strategy.id+'/activate', admin.token, {});
            assert.equal(result.status, 200); assert.equal(result.data.attributedRevenue, 0);
        });
        await prisma.agentAction.create({ data: { merchantId: merchant.id, sessionId: customer.sessionId, actor: 'AI', action: 'PRODUCT_RECOMMENDATION', output: { kind: 'DISPLAYED_RECOMMENDATION', strategyIds: [strategy.id], productIds: [sock.id] } } });
        let order;
        await t.test('order creation does not approve or contact payment provider', async () => {
            const result = await request('/orders', customer.token, { discount: 100 });
            assert.equal(result.status, 200); order = result.data.order;
            assert.equal(order.razorpayOrderId, null); assert.equal(order.paymentApprovedAt, null);
            assert.equal((await request('/payments/demo-success', customer.token, { orderId: order.id })).status, 400);
            assert.equal((await request('/payments/prepare', customer.token, { orderId: order.id })).status, 422);
            assert.equal((await request('/payments/prepare', other.token, { orderId: order.id, approved: true })).status, 400);
        });
        await t.test('chat controls are session-bound and preserve cart and order data', async () => {
            const before = await prisma.cart.findMany({ include: { items: true } });
            for (const path of ['/agent/stop', '/agent/clear']) {
                assert.equal((await request(path, null, {})).status, 401);
                assert.equal((await request(path, admin.token, {})).status, 403);
                assert.equal((await request(path, other.token, { sessionId: customer.sessionId })).status, 403);
                assert.equal((await request(path, customer.token, {})).status, 200);
            }
            assert.deepEqual(await prisma.cart.findMany({ include: { items: true } }), before);
            const preserved = await prisma.order.findUnique({ where: { id: order.id } });
            assert.equal(preserved.status, 'PENDING_PAYMENT');
            assert.equal(preserved.total, 900);
        });
        await t.test('repeated approval returns one provider order and consistent paise', async () => {
            const results = await Promise.all([1,2].map(() => request('/payments/prepare', customer.token, { orderId: order.id, approved: true })));
            for (const result of results) { assert.equal(result.status, 200); assert.equal(result.data.razorpay.amount, 90000); }
            assert.equal(results[0].data.razorpay.id, results[1].data.razorpay.id);
            assert.equal(await prisma.agentAction.count({ where: { action: 'PAYMENT_APPROVAL' } }), 1);
            assert.equal(await prisma.agentAction.count({ where: { action: 'RAZORPAY_ORDER_CREATED', status: 'SUCCESS' } }), 1);
            assert.equal(await prisma.agentAction.count({ where: { action: 'PAYMENT_PENDING', status: 'PENDING' } }), 1);
            assert.equal((await request('/payments/cancel', customer.token, { orderId: order.id })).status, 200);
            assert.equal(await prisma.agentAction.count({ where: { action: 'PAYMENT_PENDING', status: 'CANCELLED' } }), 1);
            assert.equal((await prisma.order.findUnique({ where: { id: order.id } })).status, 'PENDING_PAYMENT');
            assert.equal((await request('/payments/prepare', customer.token, { orderId: order.id, approved: true })).status, 200);
            assert.equal(await prisma.agentAction.count({ where: { action: 'PAYMENT_PENDING', status: 'PENDING' } }), 1);
        });
        await t.test('simulation blocked when keys are configured', async () => {
            process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture';
            assert.equal((await request('/payments/demo-success', customer.token, { orderId: order.id })).status, 403);
            process.env.RAZORPAY_KEY_ID = '';
        });
        await t.test('concurrent completion produces one sale and one attributed outcome', async () => {
            const results = await Promise.all([1,2,3].map(() => request('/payments/demo-success', customer.token, { orderId: order.id })));
            for (const result of results) { assert.equal(result.status, 200); assert.equal(result.data.orderStatus, 'PAID'); }
            assert.equal(results.filter(r => !r.data.duplicate).length, 1);
            assert.equal(await prisma.salesEvent.count(), 1);
            assert.equal((await prisma.product.findUnique({ where: { id: shoe.id } })).stock, 99);
            assert.equal((await prisma.product.findUnique({ where: { id: sock.id } })).stock, 99);
            const updated = await prisma.growthStrategy.findUnique({ where: { id: strategy.id } });
            assert.equal(updated.attributedPurchases, 1); assert.equal(updated.attributedRevenue, 180);
            assert.equal(await prisma.agentAction.count({ where: { action: 'PAYMENT_SUCCESS' } }), 1);
            assert.equal(await prisma.agentAction.count({ where: { action: 'PAYMENT_PENDING', status: 'SUCCESS' } }), 1);
        });
        await t.test('dashboard calculates rates from recorded carts and cross-sell purchases', async () => {
            const result = await request('/analytics', admin.token);
            assert.equal(result.status, 200);
            assert.equal(result.data.revenue, 900); assert.equal(result.data.orders, 1);
            assert.equal(result.data.conversionRate, 100);
            assert.equal(result.data.upsellRate, 100);
            assert.equal(result.data.kpiCounts.carts, 1);
            assert.equal(result.data.kpiCounts.offeredOrders, 1);
            assert.equal(result.data.abandonedCartRecoveryRate, null);
            assert.equal(result.data.aiConversionDifference, null);
        });
        await t.test('overview and event halves exclude legacy sales and share authoritative totals', async () => {
            const legacy = await prisma.order.create({ data: { merchantId: merchant.id, subtotal: 9999, total: 9999, status: 'PAID' } });
            await prisma.salesEvent.createMany({ data: [
                { merchantId: merchant.id, orderId: legacy.id, timestamp: new Date(), channel: 'AI', revenue: 9999, aov: 9999 },
                { merchantId: merchant.id, timestamp: new Date(), channel: 'DIRECT', revenue: 23683, aov: 2960 },
            ] });
            const overview = (await request('/analytics', admin.token)).data;
            const growth = (await request('/growth', admin.token)).data;
            assert.equal(overview.revenue, 900);
            assert.equal(growth.before.revenue + growth.after.revenue, overview.revenue);
            assert.equal(growth.before.aov, 0);
            assert.equal(growth.after.aov, overview.aov);
            // With no eligible paid orders both views must become zero, despite legacy events.
            await prisma.order.update({ where: { id: order.id }, data: { status: 'PENDING_PAYMENT' } });
            try {
                const emptyOverview = (await request('/analytics', admin.token)).data;
                const emptyGrowth = (await request('/growth', admin.token)).data;
                assert.equal(emptyOverview.revenue, 0);
                assert.deepEqual(emptyGrowth.before, { revenue: 0, aov: 0 });
                assert.deepEqual(emptyGrowth.after, { revenue: 0, aov: 0 });
            } finally {
                await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
            }
        });
        await t.test('50 invalid financial inputs fail closed', async () => {
            const { evaluateTransaction } = await import('../src/services/policyEngine.js');
            for (let i = 1; i <= 50; i++) {
                const result = await evaluateTransaction({ merchantId: merchant.id, total: i % 2 ? -i : i + 0.5 });
                assert.equal(result.allowed, false, 'case ' + i);
            }
        });
        await t.test('Razorpay failure, signature rejection, capture verification and webhook replay', async () => {
            const stockBefore = (await prisma.product.findUnique({ where: { id: shoe.id } })).stock;
            await request('/cart/items', customer.token, { productId: shoe.id, quantity: 1 });
            const next = (await request('/orders', customer.token, { discount: 0 })).data.order;
            process.env.RAZORPAY_KEY_ID = 'rzp_test_fixture'; process.env.RAZORPAY_KEY_SECRET = 'test-secret'; process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook-secret';
            const realFetch = globalThis.fetch;
            let unavailable = true;
            let captured = false;
            const providerOrderId = 'order_fixture';
            const payment = () => ({ id: 'pay_fixture', order_id: providerOrderId, amount: 80000, currency: 'INR', status: captured ? 'captured' : 'authorized' });
            globalThis.fetch = async (url, options) => {
                if (!String(url).startsWith('https://api.razorpay.com/')) return realFetch(url, options);
                if (unavailable) return new Response('{}', { status: 503 });
                return Response.json(String(url).endsWith('/orders') ? { id: providerOrderId, amount: 80000, currency: 'INR' } : payment());
            };
            try {
                assert.equal((await request('/payments/prepare', customer.token, { orderId: next.id, approved: true })).status, 400);
                assert.equal((await prisma.order.findUnique({ where: { id: next.id } })).paymentApprovedAt, null);
                unavailable = false;
                assert.equal((await request('/payments/prepare', customer.token, { orderId: next.id, approved: true })).status, 200);
                assert.equal((await request('/payments/verify', customer.token, { orderId: next.id, paymentId: 'pay_fixture', signature: 'short' })).status, 400);
                const signature = crypto.createHmac('sha256', 'test-secret').update(providerOrderId + '|pay_fixture').digest('hex');
                assert.equal((await request('/payments/verify', customer.token, { orderId: next.id, paymentId: 'pay_fixture', signature })).status, 400);
                assert.equal((await prisma.order.findUnique({ where: { id: next.id } })).status, 'PENDING_PAYMENT');
                captured = true;
                const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment() } } });
                const webhookSignature = crypto.createHmac('sha256', 'webhook-secret').update(body).digest('hex');
                const webhook = () => realFetch(base + '/webhooks/razorpay', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': webhookSignature }, body });
                const results = await Promise.all([webhook(), request('/payments/verify', customer.token, { orderId: next.id, paymentId: 'pay_fixture', signature })]);
                assert.equal(results[0].status, 200); assert.equal(results[1].status, 200);
                assert.equal((await webhook()).status, 200);
                assert.equal(await prisma.salesEvent.count({ where: { orderId: next.id } }), 1);
                assert.equal(await prisma.agentAction.count({ where: { action: 'PAYMENT_SUCCESS', input: { path: ['orderId'], equals: next.id } } }), 1);
                assert.equal((await prisma.product.findUnique({ where: { id: shoe.id } })).stock, stockBefore - 1);
            } finally { globalThis.fetch = realFetch; process.env.RAZORPAY_KEY_ID = ''; process.env.RAZORPAY_KEY_SECRET = ''; }
        });
        await t.test('audit failure rolls back paid status, sales and strategy updates', async () => {
            const stockBefore = (await prisma.product.findUnique({ where: { id: shoe.id } })).stock;
            await request('/cart/items', customer.token, { productId: shoe.id, quantity: 1 });
            const next = (await request('/orders', customer.token, {})).data.order;
            await request('/payments/prepare', customer.token, { orderId: next.id, approved: true });
            const { finalizePayment } = await import('../src/services/paymentService.js');
            const failingDb = { $transaction: fn => prisma.$transaction(tx => fn({ ...tx, agentAction: { ...tx.agentAction, create: () => { throw new Error('Injected audit failure'); } } })) };
            await assert.rejects(finalizePayment({ orderId: next.id, demo: true }, failingDb), /Injected audit failure/);
            assert.equal((await prisma.order.findUnique({ where: { id: next.id } })).status, 'PENDING_PAYMENT');
            assert.equal(await prisma.salesEvent.count({ where: { orderId: next.id } }), 0);
            assert.equal((await prisma.product.findUnique({ where: { id: shoe.id } })).stock, stockBefore);
        });
        await t.test('idle carts get abandonment markers and subsequent paid orders count as recovery', async () => {
            await request('/cart/items', other.token, { productId: shoe.id, quantity: 1 });
            const idle = await prisma.cart.findUnique({ where: { sessionId: other.sessionId } });
            const stale = new Date(Date.now() - 25 * 60 * 60 * 1000);
            await prisma.cart.update({ where: { id: idle.id }, data: { updatedAt: stale } });
            let metrics = (await request('/analytics', admin.token)).data;
            assert.equal(metrics.abandonedCartRecoveryRate, 0);
            assert.equal(metrics.kpiCounts.abandonedCarts, 1);
            const marked = await prisma.cart.findUnique({ where: { id: idle.id } });
            assert.equal(marked.updatedAt.getTime(), stale.getTime());
            const checkout = (await request('/orders', other.token, {})).data.order;
            assert.equal((await request('/payments/prepare', other.token, { orderId: checkout.id, approved: true })).status, 200);
            assert.equal((await request('/payments/demo-success', other.token, { orderId: checkout.id })).status, 200);
            metrics = (await request('/analytics', admin.token)).data;
            assert.equal(metrics.abandonedCartRecoveryRate, 100);
            assert.equal(metrics.kpiCounts.recoveredCarts, 1);
            assert.notEqual(metrics.aiConversionDifference, null);
        });
        await t.test('merchant product create, edit and delete preserve orders and reject customer writes', async () => {
            const body = { name: 'Managed Product', description: 'Editable fixture product', category: 'Training',
                price: 700, stock: 0, image: '/images/products/training-shorts.png', tags: ['training'],
                specifications: { material: 'cotton' }, relatedProductIds: [shoe.id] };
            assert.equal((await request('/products', customer.token, body)).status, 403);
            const created = await request('/products', admin.token, body);
            assert.equal(created.status, 201);
            const path = '/products/' + created.data.id;
            assert.ok((await request('/products', admin.token)).data.some(p => p.id === created.data.id), 'merchant can restock zero-stock products');
            assert.ok(!(await request('/products', customer.token)).data.some(p => p.id === created.data.id));
            assert.equal((await request(path, customer.token, body, 'PUT')).status, 403);
            assert.equal((await request(path, customer.token, {}, 'DELETE')).status, 403);
            assert.equal((await request(path, admin.token, { ...body, stock: -1 }, 'PUT')).status, 400);
            assert.equal((await request(path, admin.token, { ...body, image: 'javascript:alert(1)' }, 'PUT')).status, 400);
            const edited = await request(path, admin.token, { ...body, name: 'Updated Product', stock: 4, price: 800, relatedProductIds: [sock.id] }, 'PUT');
            assert.equal(edited.status, 200);
            assert.equal(edited.data.name, 'Updated Product');
            const relations = (await request(path + '/related', customer.token)).data;
            assert.deepEqual(relations.map(p => p.id), [sock.id]);
            const historical = await prisma.order.create({ data: { merchantId: merchant.id, subtotal: 800, total: 800,
                status: 'PAID', items: { create: { productId: created.data.id, quantity: 1, unitPrice: 800 } } } });
            assert.equal((await request(path, admin.token, {}, 'DELETE')).status, 200);
            assert.equal((await request(path, customer.token)).status, 404);
            for (const token of [customer.token, admin.token]) assert.ok(!(await request('/products', token)).data.some(p => p.id === created.data.id));
            const kept = await prisma.order.findUnique({ where: { id: historical.id }, include: { items: true } });
            assert.equal(kept.total, 800);
            assert.equal(kept.items[0].productId, created.data.id);
            assert.equal((await request('/cart/items', customer.token, { productId: created.data.id, quantity: 1 })).status, 400);
            assert.equal((await request(path, admin.token, body, 'PUT')).status, 404);
        });
        await t.test('unlinked gym bag offers an in-stock accessory and records the offer', async () => {
            const bag = await prisma.product.create({ data: { merchantId: merchant.id, name: 'Training Duffel Bag',
                description: 'Gym bag', category: 'Bags', price: 1899, stock: 5, image: '/images/bag.png', tags: [], specifications: {} } });
            const bottle = await prisma.product.create({ data: { merchantId: merchant.id, name: 'Sports Bottle',
                description: 'Water bottle', category: 'Accessories', price: 299, stock: 5, image: '/images/bottle.png', tags: [], specifications: {} } });
            const added = await request('/cart/items', customer.token, { productId: bag.id, quantity: 1 });
            assert.equal(added.status, 200);
            assert.ok(added.data.items.some(item => item.productId === bag.id));
            const suggested = await request('/products/' + bag.id + '/related', customer.token);
            assert.equal(suggested.status, 200);
            assert.equal(suggested.data[0].id, bottle.id);
            assert.equal(suggested.data[0].recommendationSource, 'category-complement');
            assert.equal((await request('/agent/cross-sell-exposure', customer.token, { productId: bag.id, relatedProductId: bottle.id })).status, 200);
            await prisma.product.update({ where: { id: bottle.id }, data: { stock: 0 } });
            assert.deepEqual((await request('/products/' + bag.id + '/related', customer.token)).data, []);
            await prisma.product.update({ where: { id: bottle.id }, data: { stock: 5, active: false } });
            assert.deepEqual((await request('/products/' + bag.id + '/related', customer.token)).data, []);
        });
        await t.test('logout revokes server session', async () => {
            assert.equal((await request('/auth/logout', customer.token, {})).status, 200);
            assert.equal((await request('/cart/' + customer.sessionId, customer.token)).status, 401);
        });
    } finally {
        await new Promise(resolve => server.close(resolve));
        if (!/^buildathon_test_[a-f0-9]{16}$/.test(schema)) throw new Error('Unsafe test schema');
        await prisma.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE');
        await prisma.$disconnect();
    }
});
