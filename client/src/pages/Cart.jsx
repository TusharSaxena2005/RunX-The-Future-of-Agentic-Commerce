import { loadRazorpayCheckout } from '../services/checkout.js';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api, money } from '../services/api.js';

const sidKey = 'runx_session';

function session() {
    let s = localStorage.getItem(sidKey);

    if (!s) {
        s = 'session_' + crypto.randomUUID();
        localStorage.setItem(sidKey, s);
    }

    return s;
}

export default function Cart() {
    const [sid] = useState(session);
    const [cart, setCart] = useState(null);
    const [approval, setApproval] = useState(null);
    const [error, setError] = useState('');
    const [paying, setPaying] = useState(false);
    const [success, setSuccess] = useState('');

    const refresh = async () => {
        try {
            setCart(await api.cart(sid));
        } catch (e) {
            setError(e.message);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    const total = useMemo(
        () =>
            cart?.items?.reduce(
                (sum, item) => sum + item.unitPrice * item.quantity,
                0
            ) || 0,
        [cart]
    );

    async function createOrder() {
        try {
            setError('');
            setSuccess('');
            const result = await api.order({ sessionId: sid, discount: 0 });
            setApproval(result);
        } catch (e) {
            setError(e.message);
        }
    }

    async function approve() {
        if (!approval || paying) return;

        try {
            setError('');
            setSuccess('');
            setPaying(true);

            const prepared = await api.preparePayment({ orderId: approval.order.id, sessionId: sid });
            setApproval(prepared);
            if (prepared.razorpay.demo) {
                const result = await api.demoPay({
                    orderId: approval.order.id,
                    sessionId: sid,
                });

                if (!result?.verified) {
                    throw new Error('Demo payment was not confirmed by the server.');
                }

                setApproval(null);
                await refresh();
                setPaying(false);
                setSuccess(
                    'SIMULATED payment recorded. No money moved.'
                );
                return;
            }

            await loadRazorpayCheckout();
            openCheckout(prepared);
        } catch (e) {
            setError(e.message);
            setPaying(false);
        }
    }

    function openCheckout(approval) {
        let paymentCompleted = false;
        const options = {
            key: approval.razorpay.keyId,
            amount: approval.razorpay.amount,
            currency: approval.razorpay.currency,
            name: 'RunX Sports',
            description: 'AI Commerce Order',
            order_id: approval.razorpay.id,
            handler: async (response) => {
                try {
                    await api.verifyPayment({
                        orderId: approval.order.id,
                        paymentId: response.razorpay_payment_id,
                        signature: response.razorpay_signature,
                        sessionId: sid,
                    });
                    paymentCompleted = true;

                    setApproval(null);
                    await refresh();
                    setPaying(false);
                    setSuccess(
                        'Razorpay test payment successful. Payment was verified and your order is confirmed.'
                    );
                } catch (e) {
                    setError(e.message);
                    setPaying(false);
                }
            },
            modal: {
                ondismiss: async () => {
                    if (!paymentCompleted) {
                        try { await api.cancelPayment({ orderId: approval.order.id }); } catch { /* The order remains safely pending if cancellation reporting fails. */ }
                    }
                    setPaying(false);
                    setError('Payment window was closed before the payment was completed.');
                },
            },
            theme: { color: '#1f5fae' },
        };

        const checkout = new window.Razorpay(options);
        checkout.on('payment.failed', () => {
            setPaying(false);
            setError('Payment failed. Your order is still pending; you can retry.');
        });
        checkout.open();
    }

    return (
        <Layout
            title="Your Cart"
            subtitle="Review your products and complete checkout."
        >
            <div className="cart-page-grid">
                <section className="panel">
                    <div className="section-heading">
                        <div>
                            <h2>Shopping cart</h2>
                            <p className="muted">
                                Products selected through the AI shopping assistant.
                            </p>
                        </div>
                        <span className="cart-count">
                            {cart?.items?.length || 0} items
                        </span>
                    </div>

                    {cart?.items?.length ? (
                        <div className="cart-list">
                            {cart.items.map((item) => (
                                <div className="cart-page-item" key={item.id}>
                                    <div className="cart-page-item-info">
                                        <div className="cart-page-icon">{item.product.name.charAt(0)}</div>
                                        <div>
                                            <strong>{item.product.name}</strong>
                                            <span>Qty {item.quantity}</span>
                                        </div>
                                    </div>
                                    <strong>{money(item.unitPrice * item.quantity)}</strong>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="cart-empty">
                            <div className="cart-empty-icon">🛒</div>
                            <h3>Your cart is empty</h3>
                            <p>Go back to the AI Shop and ask for a product recommendation.</p>
                        </div>
                    )}
                </section>

                <aside className="cart-summary panel">
                    <h2>Order summary</h2>
                    <div className="summary-row">
                        <span>Subtotal</span>
                        <strong>{money(total)}</strong>
                    </div>
                    <div className="summary-row">
                        <span>Discount</span>
                        <strong>₹0</strong>
                    </div>
                    <div className="summary-total">
                        <span>Total</span>
                        <strong>{money(total)}</strong>
                    </div>

                    {cart?.items?.length > 0 && (
                        <button className="primary full-width" onClick={createOrder}>
                            Review & approve payment
                        </button>
                    )}
                </aside>
            </div>

            {error && (
                <div className="alert danger" style={{ marginTop: 16 }}>
                    {error}
                </div>
            )}

            {approval && (
                <section className="panel approval-panel">
                    <div className="section-heading">
                        <div>
                            <h2>Payment approval</h2>
                            <p className="muted">
                                Review the order before authorizing payment.
                            </p>
                        </div>
                    </div>

                    {approval.order.items.map((item) => (
                        <div className="summary-row" key={item.id}>
                            <span>
                                {item.product.name} × {item.quantity}
                            </span>
                            <strong>{money(item.unitPrice * item.quantity)}</strong>
                        </div>
                    ))}

                    <hr />

                    <div className="summary-row">
                        <span>Subtotal</span>
                        <strong>{money(approval.order.subtotal)}</strong>
                    </div>
                    <div className="summary-row">
                        <span>Discount</span>
                        <strong>{money(approval.order.discount)}</strong>
                    </div>
                    <div className="summary-total">
                        <span>Total</span>
                        <strong>{money(approval.order.total)}</strong>
                    </div>

                    <div className="alert success" style={{ marginTop: 14 }}>
                        ✓ Within merchant limit
                        <br />
                        ✓ Products available
                        <br />
                        ✓ Policy checks passed
                    </div>

                    <button
                        className="primary full-width"
                        onClick={approve}
                        disabled={paying}
                    >
                        {paying ? 'Processing payment…' : 'Approve & Pay'}
                    </button>
                </section>
            )}
        </Layout>
    );
}
