import { verifyWebhook } from '../services/razorpayService.js';
import { prisma } from '../db.js';
import { finalizePayment } from '../services/paymentService.js';
import { assertCaptured } from '../services/paymentGateway.js';

export const razorpayWebhook = async (req, res) => {
        try {
            const signature =
                req.headers['x-razorpay-signature'];

            if (
                !signature ||
                !verifyWebhook(req.body, signature)
            ) {
                return res
                    .status(400)
                    .send('invalid signature');
            }

            const event = JSON.parse(req.body.toString('utf8'));
            if (event.event === 'payment.captured') {
                const payment = event.payload?.payment?.entity;
                const order = payment?.order_id ? await prisma.order.findFirst({ where: { razorpayOrderId: payment.order_id } }) : null;
                if (!order) return res.status(404).json({ error: 'Unknown payment order' });
                assertCaptured(payment, order);
                await finalizePayment({ orderId: order.id, paymentId: payment.id });
            }
            res.json({ received: true });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };
