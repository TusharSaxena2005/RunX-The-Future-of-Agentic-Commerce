import { z } from 'zod';
import { prisma } from '../db.js';
import { evaluateTransaction } from '../services/policyEngine.js';
import { audit } from '../services/auditService.js';
import { createRazorpayOrder, publicKey, configured, demoPaymentsEnabled, verifySignature, verifyCapturedPayment } from '../services/paymentGateway.js';
import { finalizePayment } from '../services/paymentService.js';

async function ownedOrder(req) {
    const orderId = z.string().min(1).parse(req.body.orderId);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } } } });
    const cart = order?.cartId ? await prisma.cart.findUnique({ where: { id: order.cartId } }) : null;
    if (!cart || cart.sessionId !== req.auth.sessionId) throw new Error('Order not found for this session');
    return order;
}

async function failed(order, req, error) {
    if (order) await audit({ merchantId: order.merchantId, sessionId: req.auth.sessionId, actor: 'BACKEND', action: 'PAYMENT_FAILED', status: 'FAILED', amount: order.total, input: { orderId: order.id }, reason: error.message });
}

export const preparePayment = async (req, res) => {
    let order;
    try {
        if (req.body.approved !== true) return res.status(422).json({ error: 'Explicit customer approval is required' });
        order = await ownedOrder(req);
        const policy = await evaluateTransaction({ merchantId: order.merchantId, total: order.total, discount: order.discount, discountPercent: order.discount / order.subtotal * 100 });
        if (!policy.allowed) {
            await audit({ merchantId: order.merchantId, sessionId: req.auth.sessionId, actor: 'BACKEND', action: 'POLICY_BLOCKED', status: 'BLOCKED', reason: policy.reason, policyResult: policy, input: { orderId: order.id } });
            return res.status(422).json({ error: policy.reason, policy });
        }
        const result = await prisma.$transaction(async tx => {
            // Lock this order before creating an external payment order, so concurrent clicks reuse it.
            const lock = await tx.order.updateMany({ where: { id: order.id, status: 'PENDING_PAYMENT' }, data: { status: 'PENDING_PAYMENT' } });
            if (!lock.count) throw new Error('Order is no longer pending payment');
            const current = await tx.order.findUnique({ where: { id: order.id } });
            let razorpay;
            if (current.razorpayOrderId) {
                const demo = current.paymentMode === 'SIMULATED';
                if (demo ? !demoPaymentsEnabled() : !configured()) throw new Error('Payment configuration changed; start a new order');
                razorpay = { id: current.razorpayOrderId, amount: current.total * 100, currency: 'INR', demo };
            } else {
                razorpay = await createRazorpayOrder({ orderId: order.id, amount: order.total });
            }
            await tx.order.update({ where: { id: order.id }, data: { razorpayOrderId: razorpay.id, paymentApprovedAt: current.paymentApprovedAt || new Date(), paymentMode: razorpay.demo ? 'SIMULATED' : 'RAZORPAY_TEST' } });
            if (!current.paymentApprovedAt) {
                for (const action of ['PAYMENT_APPROVAL', 'RAZORPAY_ORDER_CREATED', 'PAYMENT_PENDING']) await tx.agentAction.create({ data: {
                    merchantId: order.merchantId, sessionId: req.auth.sessionId, actor: action === 'PAYMENT_APPROVAL' ? 'CUSTOMER' : (razorpay.demo ? 'SIMULATOR' : 'RAZORPAY'),
                    action, amount: order.total, input: { orderId: order.id }, output: { approved: true, razorpayOrderId: razorpay.id, demo: Boolean(razorpay.demo) }, policyResult: policy,
                    status: action === 'PAYMENT_PENDING' ? 'PENDING' : 'SUCCESS',
                } });
            } else {
                const pending = await tx.agentAction.updateMany({
                    where: { merchantId: order.merchantId, action: 'PAYMENT_PENDING', input: { path: ['orderId'], equals: order.id } },
                    data: { status: 'PENDING', reason: null },
                });
                if (!pending.count) await tx.agentAction.create({ data: {
                    merchantId: order.merchantId, sessionId: req.auth.sessionId, actor: razorpay.demo ? 'SIMULATOR' : 'RAZORPAY',
                    action: 'PAYMENT_PENDING', amount: order.total, input: { orderId: order.id },
                    output: { razorpayOrderId: razorpay.id, demo: Boolean(razorpay.demo) }, status: 'PENDING',
                } });
            }
            return { order, policy, razorpay: { ...razorpay, keyId: publicKey(), configured: configured(), demo: Boolean(razorpay.demo) } };
        }, { timeout: 20000 });
        res.json(result);
    } catch (error) { await failed(order, req, error); res.status(400).json({ error: error.message }); }
};

export const cancelPayment = async (req, res) => {
    try {
        const order = await ownedOrder(req);
        if (order.status !== 'PENDING_PAYMENT' || !order.paymentApprovedAt) {
            return res.status(409).json({ error: 'Order is not awaiting payment' });
        }
        const reason = 'Customer closed Razorpay checkout before payment was completed.';
        await prisma.$transaction(async tx => {
            const cancelled = await tx.agentAction.updateMany({
                where: { merchantId: order.merchantId, action: 'PAYMENT_PENDING', input: { path: ['orderId'], equals: order.id } },
                data: { status: 'CANCELLED', reason },
            });
            if (!cancelled.count) await tx.agentAction.create({ data: {
                merchantId: order.merchantId, sessionId: req.auth.sessionId, actor: 'CUSTOMER',
                action: 'PAYMENT_PENDING', amount: order.total, input: { orderId: order.id },
                output: { razorpayOrderId: order.razorpayOrderId }, status: 'CANCELLED', reason,
            } });
        });
        res.json({ cancelled: true, orderStatus: order.status });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const verifyPayment = async (req, res) => {
    let order;
    try {
        order = await ownedOrder(req);
        const { paymentId, signature } = z.object({ paymentId: z.string().min(1), signature: z.string() }).parse(req.body);
        if (!order.paymentApprovedAt || order.paymentMode !== 'RAZORPAY_TEST') throw new Error('Order has no Razorpay approval');
        if (!verifySignature({ orderId: order.razorpayOrderId, paymentId, signature })) throw new Error('Invalid payment signature');
        await verifyCapturedPayment(paymentId, order);
        res.json(await finalizePayment({ orderId: order.id, paymentId, signature }));
    } catch (error) { await failed(order, req, error); res.status(400).json({ error: error.message }); }
};

export const simulatePayment = async (req, res) => {
    if (!demoPaymentsEnabled()) return res.status(403).json({ error: 'Simulated payments are disabled' });
    let order;
    try {
        order = await ownedOrder(req);
        res.json(await finalizePayment({ orderId: order.id, demo: true }));
    } catch (error) { await failed(order, req, error); res.status(400).json({ error: error.message }); }
};
