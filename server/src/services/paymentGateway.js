import crypto from 'node:crypto';

export function demoPaymentsEnabled() {
    return process.env.ALLOW_DEMO_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production' && !process.env.RAZORPAY_KEY_ID && !process.env.RAZORPAY_KEY_SECRET;
}
export function configured() {
    return Boolean(process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_') && process.env.RAZORPAY_KEY_SECRET);
}
export function publicKey() { return process.env.RAZORPAY_KEY_ID; }
export function validHmac(message, signature, secret) {
    if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = crypto.createHmac('sha256', secret).update(message).digest();
    return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export function verifySignature({ orderId, paymentId, signature }) {
    return configured() && validHmac(`${orderId}|${paymentId}`, signature, process.env.RAZORPAY_KEY_SECRET);
}
export function verifyWebhook(raw, signature) {
    return configured() && validHmac(raw, signature, process.env.RAZORPAY_WEBHOOK_SECRET);
}
async function gateway(path, options = {}) {
    if (!configured()) throw new Error('Razorpay test credentials are required; live keys are not supported');
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
        ...options, signal: AbortSignal.timeout(10000), headers: {
            'Content-Type': 'application/json',
            Authorization: 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64'),
        },
    });
    if (!response.ok) throw new Error(`Razorpay request failed (${response.status}); no payment recorded`);
    return response.json();
}
export async function createRazorpayOrder({ orderId, amount, currency = 'INR' }) {
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(amount * 100)) throw new Error('Invalid payment amount');
    if (demoPaymentsEnabled()) return { id: `demo_order_${orderId}`, amount: amount * 100, currency, demo: true };
    return gateway('/orders', { method: 'POST', body: JSON.stringify({ amount: amount * 100, currency, receipt: orderId, notes: { internal_order_id: orderId } }) });
}
export function assertCaptured(payment, order) {
    if (!payment || payment.status !== 'captured' || payment.order_id !== order.razorpayOrderId || payment.amount !== order.total * 100 || payment.currency !== 'INR') {
        throw new Error('Payment is not captured for the approved order and amount; retry verification after capture');
    }
}
export async function verifyCapturedPayment(paymentId, order) {
    const payment = await gateway(`/payments/${encodeURIComponent(paymentId)}`);
    assertCaptured(payment, order);
    return payment;
}
