import { loadRazorpayCheckout } from '../services/checkout.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Layout from '../components/Layout.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { api, money } from '../services/api.js';

const sidKey = 'runx_session';
const chatKeyPrefix = 'runx_chat_';
const modeKey = 'runx_shop_mode';
const legacyModeAnnouncements = new Set([
    '### AI Picks for Me is on\n\nWhat are you looking for? Tell me your activity, budget, and preferences, and I will choose one best product for you.',
    '### Browse mode is on\n\nI can show you multiple matching products again.',
]);
const welcomeMessage = {
    role: 'ai',
    text: 'Tell me what you are looking for and I will search RunX Sports for you.',
};

function loadMessages(sessionId) {
    try {
        const stored = JSON.parse(
            localStorage.getItem(`${chatKeyPrefix}${sessionId}`) || '[]'
        );

        if (!Array.isArray(stored)) return [welcomeMessage];

        const valid = stored.filter(
            (message) =>
                message &&
                (message.role === 'ai' || message.role === 'user') &&
                typeof message.text === 'string' &&
                !(message.role === 'ai' && legacyModeAnnouncements.has(message.text)
                    && !message.products?.length && !message.upsell && !message.checkoutAction)
        );

        return valid.length ? valid.slice(-100) : [welcomeMessage];
    } catch {
        return [welcomeMessage];
    }
}

function renderInline(text) {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);

    return parts.map((part, index) => {
        if (!part) return null;

        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
        }

        if (part.startsWith('*') && part.endsWith('*')) {
            return <em key={index}>{part.slice(1, -1)}</em>;
        }

        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={index}>{part.slice(1, -1)}</code>;
        }

        return <span key={index}>{part}</span>;
    });
}

function MessageContent({ text }) {
    const lines = text.split(/\r?\n/);
    const blocks = [];
    let list = null;

    const flushList = () => {
        if (!list) return;

        const ListTag = list.type === 'ol' ? 'ol' : 'ul';

        blocks.push(
            <ListTag
                className="ai-list"
                key={`list-${blocks.length}`}
                {...(list.type === 'ol' ? { start: list.start } : {})}
            >
                {list.items.map((item, index) => (
                    <li key={index}>{renderInline(item)}</li>
                ))}
            </ListTag>
        );

        list = null;
    };

    lines.forEach((raw, index) => {
        const line = raw.trim();

        if (!line) {
            flushList();
            return;
        }

        const ordered = line.match(/^(\d+)[.)]\s+(.+)$/);
        const unordered = line.match(/^[-•]\s+(.+)$/);

        if (unordered) {
            if (!list || list.type !== 'ul') {
                flushList();
                list = { type: 'ul', items: [] };
            }

            list.items.push(unordered[1]);
            return;
        }

        if (ordered) {
            if (!list || list.type !== 'ol') {
                flushList();
                list = {
                    type: 'ol',
                    start: Number(ordered[1]),
                    items: [],
                };
            }

            list.items.push(ordered[2]);
            return;
        }

        flushList();

        if (/^#{1,3}\s+/.test(line)) {
            const level = line.match(/^(#{1,3})/)[1].length;
            const content = line.replace(/^#{1,3}\s+/, '');
            const Tag = level === 1 ? 'h3' : 'h4';

            blocks.push(
                <Tag className="ai-heading" key={index}>
                    {renderInline(content)}
                </Tag>
            );
            return;
        }

        if (/^---+$/.test(line)) {
            blocks.push(<hr className="ai-divider" key={index} />);
            return;
        }

        blocks.push(
            <p className="ai-paragraph" key={index}>
                {renderInline(line)}
            </p>
        );
    });

    flushList();

    return <div className="ai-message-content">{blocks}</div>;
}

function OrderTotals({ order }) {
    return (
        <div>
            <div className="payment-item">
                <span>Subtotal</span>
                <strong>{money(order.subtotal)}</strong>
            </div>
            <div className="payment-item">
                <span>Discount applied</span>
                <strong>{order.discount > 0 ? `−${money(order.discount)}` : money(0)}</strong>
            </div>
            <div className="payment-total">
                <span>Total to pay</span>
                <strong>{money(order.total)}</strong>
            </div>
        </div>
    );
}

function ProductMessageContent({ text, products, onAdd, actionLabel }) {
    if (!products?.length) {
        return <MessageContent text={text} />;
    }

    const normalized = text.toLowerCase();
    const matches = products
        .map((product) => ({
            product,
            index: normalized.indexOf(product.name.toLowerCase()),
        }))
        .filter((match) => match.index >= 0)
        .map((match) => ({
            ...match,
            lineStart: text.lastIndexOf('\n', match.index) + 1,
        }))
        .sort((a, b) => a.index - b.index);

    if (!matches.length) {
        return (
            <>
                <MessageContent text={text} />
                <div className="chat-product-grid">
                    {products.map((product) => (
                        <ProductCard key={product.id} p={product} onAdd={onAdd} actionLabel={actionLabel} />
                    ))}
                </div>
            </>
        );
    }

    return matches.map((match, index) => {
        const start = index === 0 ? 0 : match.lineStart;
        const end = matches[index + 1]?.lineStart ?? text.length;
        const rawSection = text.slice(start, end).trim();
        const section = index > 0
            ? rawSection.replace(/^\d+[.)]\s+/, `${index + 1}. `)
            : rawSection;

        return (
            <div className="chat-product-section" key={match.product.id}>
                {section && <MessageContent text={section} />}
                <div className="chat-product-inline">
                    <ProductCard p={match.product} onAdd={onAdd} actionLabel={actionLabel} />
                </div>
            </div>
        );
    });
}


function session() {
    let s = localStorage.getItem(sidKey);

    if (!s) {
        s = 'session_' + crypto.randomUUID();
        localStorage.setItem(sidKey, s);
    }

    return s;
}

export default function Shop() {
    const [sid] = useState(session);
    const [messages, setMessages] = useState(() => loadMessages(sid));
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [pendingCheckoutOrder, setPendingCheckoutOrder] = useState(null);
    const [checkoutExpanded, setCheckoutExpanded] = useState(true);
    const [paymentApproval, setPaymentApproval] = useState(null);
    const [paying, setPaying] = useState(false);
    const [paymentSuccess, setPaymentSuccess] = useState('');
    const [aiPickMode, setAiPickMode] = useState(
        () => localStorage.getItem(modeKey) === 'ai_pick'
    );
    const chatListRef = useRef(null);
    const requestInFlightRef = useRef(false);
    const chatControllerRef = useRef(null);
    const [chatPending, setChatPending] = useState(false);
    const [resettingChat, setResettingChat] = useState(false);
    const resetInFlightRef = useRef(false);

    useEffect(() => () => chatControllerRef.current?.abort(), []);

    async function stopOrClearChat(clear = false) {
        if (resetInFlightRef.current) return;
        resetInFlightRef.current = true;
        setResettingChat(true);
        chatControllerRef.current?.abort();
        chatControllerRef.current = null;
        setChatPending(false);
        setError('');
        try {
            if (clear) {
                await api.clearChat();
                setMessages([welcomeMessage]);
                setText('');
            } else {
                await api.stopChat();
                setMessages(items => [...items, { role: 'ai', text: 'Response stopped. Any cart or order changes already completed are kept; please review your cart before continuing.' }]);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            requestInFlightRef.current = false;
            resetInFlightRef.current = false;
            setBusy(false);
            setResettingChat(false);
        }
    }

    useEffect(() => {
        try {
            localStorage.setItem(
                `${chatKeyPrefix}${sid}`,
                JSON.stringify(messages.slice(-100))
            );
        } catch {
            // Chat remains usable in memory if browser storage is unavailable.
        }
    }, [messages, sid]);

    useEffect(() => {
        const chatList = chatListRef.current;
        if (!chatList) return;

        const frame = requestAnimationFrame(() => {
            chatList.scrollTo({
                top: chatList.scrollHeight,
                behavior: 'smooth',
            });
        });

        return () => cancelAnimationFrame(frame);
    }, [messages, busy, pendingCheckoutOrder, paymentApproval, checkoutExpanded]);

    async function send(msg = text) {
        if (!msg.trim() || busy || requestInFlightRef.current || resetInFlightRef.current) {
            return;
        }

        requestInFlightRef.current = true;
        const controller = new AbortController();
        chatControllerRef.current = controller;
        setChatPending(true);
        setCheckoutExpanded(false);
        setText('');
        setBusy(true);
        setError('');

        setMessages((items) => [
            ...items,
            { role: 'user', text: msg },
        ]);

        try {
            const response = await api.chat({
                sessionId: sid,
                message: msg,
                mode: aiPickMode ? 'ai_pick' : 'browse',
            }, controller.signal);
            if (controller.signal.aborted || chatControllerRef.current !== controller) return;

            setMessages((items) => [
                ...items,
                {
                    role: 'ai',
                    text:
                        response.message ||
                        'I could not generate a response.',
                    products: Array.isArray(response.products)
                        ? response.products
                        : [],
                    upsell: response.upsell || null,
                },
            ]);

            if (response.checkoutRequired && response.order) {
                setCheckoutExpanded(true);
                setPendingCheckoutOrder(response.order);
                setPaymentSuccess('');
            }

            if (response.approval && response.paymentAction === 'OPEN_CHECKOUT') {
                setCheckoutExpanded(true);
                setPaymentApproval(response.approval);
    
                setPaymentSuccess('');
            }
        } catch (e) {
            if (!controller.signal.aborted && chatControllerRef.current === controller) setError(e.message);
        } finally {
            if (chatControllerRef.current === controller) {
                chatControllerRef.current = null;
                requestInFlightRef.current = false;
                setChatPending(false);
                setBusy(false);
            }
        }
    }

    function toggleAiPickMode() {
        const enabled = !aiPickMode;
        setAiPickMode(enabled);
        try {
            localStorage.setItem(modeKey, enabled ? 'ai_pick' : 'browse');
        } catch {
            // The toggle remains usable when browser storage is unavailable.
        }
    }

    async function proceedToCheckout() {
        if (busy || pendingCheckoutOrder || paymentApproval) return;
        try {
            setBusy(true);
            setError('');
            const response = await api.order({ sessionId: sid, discount: 0 });
            setCheckoutExpanded(true);
            setPendingCheckoutOrder(response.order);
            setPaymentSuccess('');
            setMessages((items) => [
                ...items,
                { role: 'ai', text: '### Order ready\n\nPlease review the order below. Payment still requires your explicit approval.' },
            ]);
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    }

    async function add(product, isCrossSell = false) {
        try {
            const updatedCart = await api.add({
                sessionId: sid,
                productId: product.id,
                quantity: 1,
            });

            // A failed recommendation lookup must not hide a successful cart add.
            const related = isCrossSell ? [] : await api.relatedProducts(product.id).catch(() => []);
            const cartProductIds = new Set((updatedCart.items || []).map(item => item.productId));
            const crossSell = Array.isArray(related)
                ? related.find(item => !cartProductIds.has(item.id)) : null;

            setMessages((items) => [
                ...items,
                {
                    role: 'ai',
                    text: isCrossSell
                        ? `**Added to your cart:** ${product.name}\n\nYour main product and accessory are ready. Would you like to proceed to checkout?`
                        : crossSell
                        ? `**Added to your cart:** ${product.name}\n\n**Suggested accessory:** ${crossSell.name} – ${money(crossSell.price)}\n\nWould you like to add it before checkout?`
                        : `**Added to your cart:** ${product.name}\n\nWould you like to proceed to checkout?`,
                    upsell: crossSell,
                    checkoutAction: isCrossSell || !crossSell,
                },
            ]);
            if (crossSell) {
                // Telemetry failure must not undo or obscure a successful cart add.
                api.recordCrossSell({ sessionId: sid, productId: product.id, relatedProductId: crossSell.id })
                    .catch(() => {});
            }
        } catch (e) {
            setError(e.message);
        }
    }

    async function approveAndPay() {
        const checkoutOrder = pendingCheckoutOrder || paymentApproval?.order;
        if (!checkoutOrder || paying) return;

        try {
            setError('');
            setPaymentSuccess('');
            setPaying(true);

            const approval = await api.preparePayment({
                orderId: checkoutOrder.id,
                sessionId: sid,
            });

            setPaymentApproval(approval);
            setPendingCheckoutOrder(null);

            if (approval.razorpay.demo) {
                const result = await api.demoPay({
                    orderId: approval.order.id,
                    sessionId: sid,
                });

                if (!result?.verified) {
                    throw new Error('Demo payment was not confirmed by the server.');
                }

                setPaymentApproval(null);
                setPaying(false);
                setPaymentSuccess('SIMULATED payment recorded. No money moved.');
                setPendingCheckoutOrder(null);
                setMessages((items) => [
                    ...items,
                    {
                        role: 'ai',
                        text: '### Payment successful ✅\n\nA simulated payment was recorded. No money moved.',
                    },
                ]);
                return;
            }

            await loadRazorpayCheckout();
            openPaymentCheckout(approval);
        } catch (e) {
            setPaying(false);
            setError(e.message);
        }
    }

    async function approvePayment() {
        if (!paymentApproval || paying) return;
        await approveAndPay();
    }

    function openPaymentCheckout(approvalInput = paymentApproval) {
        if (!approvalInput) return;

        const approval = approvalInput;
        let paymentCompleted = false;
        const options = {
            key: approval.razorpay.keyId,
            amount: approval.razorpay.amount,
            currency: approval.razorpay.currency,
            name: 'RunX Sports',
            description: `AI Commerce Order ${approval.order.id}`,
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

                    setPaymentApproval(null);
                    setPendingCheckoutOrder(null);
                    setPaying(false);
                    setPaymentSuccess('Payment successful. Your order is confirmed.');
                    setMessages((items) => [
                        ...items,
                        {
                            role: 'ai',
                            text: '### Payment successful ✅\n\nYour Razorpay test payment was verified and your order is now **PAID**.',
                        },
                    ]);
                } catch (e) {
                    setPaying(false);
                    setError(e.message);
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
            appClassName="shop-app"
            title="AI Shopping Agent"
            subtitle="Describe what you need. The agent discovers, recommends and prepares a guarded checkout."
        >
            <section className="panel chat chat-full">
                <div className="chat-toolbar">
                <div className={`ai-pick-mode-bar ${aiPickMode ? 'is-active' : ''}`}>
                    <div className="ai-pick-icon" aria-hidden="true"><Sparkles size={16} strokeWidth={1.8} /></div>
                    <div className="ai-pick-mode-copy">
                        <strong>AI Picks for Me</strong>
                        <span role="status" aria-live="polite">
                            {aiPickMode
                                ? 'AI Picks mode: share your activity, budget, and preferences for one best match.'
                                : 'Browse mode: explore multiple matching products.'}
                        </span>
                    </div>
                    <button
                        type="button"
                        className={`mode-toggle ${aiPickMode ? 'active' : ''}`}
                        role="switch"
                        aria-label="AI Picks for Me"
                        aria-checked={aiPickMode}
                        onClick={toggleAiPickMode}
                        disabled={busy}
                    >
                        <span className="mode-toggle-thumb" aria-hidden="true" />
                        <span className="mode-toggle-label" aria-hidden="true">{aiPickMode ? 'On' : 'Off'}</span>
                    </button>
                </div>
                    <button type="button" className="secondary clear-chat-button" onClick={() => stopOrClearChat(true)}
                        disabled={resettingChat || paying || (busy && !chatPending)}
                        title="Clear conversation history. Your cart and orders are kept.">
                        {resettingChat ? 'Please wait…' : 'Clear chat'}
                    </button>
                </div>
                <div className="chat-list" ref={chatListRef}>
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            className={`bubble ${message.role}`}
                        >
                            <ProductMessageContent
                                text={aiPickMode && message.role === 'ai' && message.text === welcomeMessage.text
                                    ? 'Tell me what you are looking for and I will search RunX Sports and recommend for you.'
                                    : message.text}
                                products={message.products?.filter((product) => product.id !== message.upsell?.id)}
                                onAdd={add}
                                actionLabel={aiPickMode ? 'Choose this' : 'Add'}
                            />

                            {message.upsell && (
                                <div className="cross-sell-product">
                                    <div className="chat-product-inline">
                                        <ProductCard p={message.upsell} />
                                    </div>
                                    <div className="prompt-row">
                                        <button
                                            className="secondary"
                                            onClick={() => add(message.upsell, true)}
                                        >
                                            Yes, add it
                                        </button>
                                        <button
                                            className="primary"
                                            onClick={proceedToCheckout}
                                            disabled={busy}
                                        >
                                            Continue without it
                                        </button>
                                    </div>
                                </div>
                            )}

                            {message.checkoutAction &&
                                !pendingCheckoutOrder &&
                                !paymentApproval &&
                                !paymentSuccess && (
                                    <button
                                        className="primary"
                                        style={{ marginTop: 8 }}
                                        onClick={proceedToCheckout}
                                        disabled={busy}
                                    >
                                        Proceed to Checkout
                                    </button>
                                )}
                        </div>
                    ))}

                {paymentSuccess && (
                    <div className="alert success payment-result">
                        {paymentSuccess}
                    </div>
                )}

                {(pendingCheckoutOrder || paymentApproval) && (
                    <section className="chat-checkout" aria-label="Order review">
                        <button type="button" className="secondary chat-checkout-toggle"
                            aria-expanded={checkoutExpanded} aria-controls="chat-order-details"
                            onClick={() => setCheckoutExpanded(expanded => !expanded)}>
                            <span>Order ready · {money((pendingCheckoutOrder || paymentApproval.order).total)}</span>
                            <span>{checkoutExpanded ? 'Hide bill' : 'Review bill'}</span>
                        </button>
                        <div id="chat-order-details" hidden={!checkoutExpanded}>
                {pendingCheckoutOrder && (
                    <div className="payment-approval-card">
                        <div>
                            <span className="eyebrow">ORDER READY</span>
                            <h3>Ready to continue?</h3>
                            <p className="muted">
                                Order <strong>{pendingCheckoutOrder.id}</strong> is ready. Payment has not been approved yet.
                            </p>
                        </div>

                        <div className="payment-items">
                            {pendingCheckoutOrder.items.map((item) => (
                                <div className="payment-item" key={item.id}>
                                    <span>
                                        {item.product.name} × {item.quantity}
                                    </span>
                                    <strong>
                                        {money(item.unitPrice * item.quantity)}
                                    </strong>
                                </div>
                            ))}
                        </div>

                        <OrderTotals order={pendingCheckoutOrder} />

                        <button
                            className="primary full-width"
                            onClick={approveAndPay}
                            disabled={paying}
                        >
                            {paying ? 'Opening secure payment…' : 'Approve & Pay'}
                        </button>

                        <div className="muted payment-note">
                            Continuing the chat does not approve payment. You can ask questions or change what you want before approving.
                        </div>
                    </div>
                )}

                {paymentApproval && (
                    <div className="payment-approval-card">
                        <div>
                            <span className="eyebrow">PAYMENT APPROVAL</span>
                            <h3>Complete your order</h3>
                            <p className="muted">
                                Order <strong>{paymentApproval.order.id}</strong> is ready for payment.
                            </p>
                        </div>

                        <div className="payment-items">
                            {paymentApproval.order.items.map((item) => (
                                <div className="payment-item" key={item.id}>
                                    <span>
                                        {item.product.name} × {item.quantity}
                                    </span>
                                    <strong>
                                        {money(item.unitPrice * item.quantity)}
                                    </strong>
                                </div>
                            ))}
                        </div>

                        <OrderTotals order={paymentApproval.order} />

                        <button
                            className="primary full-width"
                            onClick={approvePayment}
                            disabled={paying}
                        >
                            {paying ? 'Processing payment…' : 'Approve & Pay'}
                        </button>
                    </div>
                )}

                        </div>
                    </section>
                )}

                    {chatPending && (
                        <div className="bubble ai spinner">
                            Searching the catalog and evaluating the best fit…
                        </div>
                    )}
                </div>

                <div className="composer">
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && send()}
                        placeholder={aiPickMode ? 'Tell AI what you need, your budget, and preferences' : 'e.g. I need running shoes under ₹4,000 for daily running'}
                    />
                    {chatPending ? <button type="button" className="secondary" onClick={() => stopOrClearChat(false)}>Stop</button> : <button
                        className="primary"
                        onClick={() => send()}
                        disabled={busy || resettingChat}
                    >
                        {resettingChat ? 'Please wait…' : busy ? 'Thinking…' : aiPickMode ? 'Get My Pick' : 'Ask AI'}
                    </button>}
                </div>

                {error && (
                    <div
                        className="alert danger"
                        style={{ marginTop: 10 }}
                    >
                        {error}
                    </div>
                )}


                <div className="prompt-row">
                    {[
                        'Running shoes under ₹4,000',
                        'Best option for daily running',
                        'Do I need anything else?',
                    ].map((prompt) => (
                        <button
                            key={prompt}
                            className="secondary"
                            onClick={() => send(prompt)}
                            disabled={busy}
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            </section>
        </Layout>
    );
}
