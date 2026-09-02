import { api } from '../services/api.js';
import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { money } from '../services/api.js';

const API_BASE =
    import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const ACTION_META = {
    USER_REQUEST: {
        label: 'Customer request',
        icon: '💬',
        description: 'The customer sent a shopping request to the AI agent.',
    },
    SEARCH_PRODUCTS: {
        label: 'Product search',
        icon: '🔎',
        description: 'The AI searched the RunX Sports product catalog.',
    },
    PRODUCT_RECOMMENDATION: {
        label: 'Recommendation',
        icon: '✨',
        description: 'The AI selected products that best match the customer intent.',
    },
    UPSELL: {
        label: 'Cross-sell suggestion',
        icon: '↗️',
        description: 'The AI suggested a relevant additional product.',
    },
    CREATE_CART: {
        label: 'Cart created',
        icon: '🛒',
        description: 'A shopping cart was created for the session.',
    },
    ADD_TO_CART: {
        label: 'Added to cart',
        icon: '➕',
        description: 'A product was added to the customer cart.',
    },
    REMOVE_FROM_CART: {
        label: 'Removed from cart',
        icon: '➖',
        description: 'A product was removed from the customer cart.',
    },
    ORDER_CALCULATION: {
        label: 'Order calculated',
        icon: '🧮',
        description: 'The backend calculated the order totals and discount.',
    },
    CREATE_ORDER: {
        label: 'Order created',
        icon: '📦',
        description: 'The backend created an order from the approved cart.',
    },
    POLICY_CHECK: {
        label: 'Policy check',
        icon: '🛡️',
        description: 'A financial action was checked against merchant policy.',
    },
    DISCOUNT_REQUEST: {
        label: 'Discount request',
        icon: '🏷️',
        description: 'A discount was requested and sent to the policy engine.',
    },
    POLICY_BLOCKED: {
        label: 'Action blocked',
        icon: '⛔',
        description: 'The merchant policy prevented the requested action.',
    },
    RECOVERY_ACTION: {
        label: 'Recovery action',
        icon: '↩️',
        description: 'The system recovered by applying an allowed alternative.',
    },
    PAYMENT_APPROVAL: {
        label: 'Payment approval',
        icon: '✅',
        description: 'The customer approved the payment after policy checks.',
    },
    RAZORPAY_ORDER_CREATED: {
        label: 'Checkout prepared',
        icon: '💳',
        description: 'Razorpay checkout was prepared successfully. This does not mean payment was completed.',
    },
    PAYMENT_PENDING: {
        label: 'Payment status',
        icon: '⏳',
        description: 'Waiting for Razorpay payment verification.',
    },
    PAYMENT_SUCCESS: {
        label: 'Payment successful',
        icon: '🎉',
        description: 'The payment was completed successfully.',
    },
    PAYMENT_FAILED: {
        label: 'Payment failed',
        icon: '⚠️',
        description: 'The payment attempt was not successful.',
    },
};

function prettyAction(action) {
    return action
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(timestamp) {
    const date = new Date(timestamp);

    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

function formatDate(timestamp) {
    const date = new Date(timestamp);

    return date.toLocaleDateString([], {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

function formatAmount(amount) {
    if (amount === null || amount === undefined || amount === '') {
        return null;
    }

    const numeric = Number(amount);

    return Number.isFinite(numeric) ? money(numeric) : String(amount);
}

function parseJson(value) {
    if (!value) {
        return null;
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

function summarizeValue(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }

    if (typeof value === 'string') {
        return value;
    }

    if (typeof value !== 'object') {
        return String(value);
    }

    return null;
}

function buildDetails(action) {
    const input = parseJson(action.input);
    const output = parseJson(action.output);

    const details = [];

    const add = (label, value, formatter) => {
        if (value === null || value === undefined || value === '') {
            return;
        }

        details.push({
            label,
            value: formatter ? formatter(value) : String(value),
        });
    };

    add(
        'Customer request',
        input?.message || input?.query || input?.request,
        (value) => `“${value}”`
    );

    add('Search query', input?.search || input?.query);
    add('Maximum price', input?.maxPrice, formatAmount);
    add('Product', output?.productName || input?.productName);
    add('Quantity', output?.quantity || input?.quantity);
    add('Subtotal', output?.subtotal, formatAmount);
    add('Discount', output?.discount, formatAmount);
    add('Order total', output?.total, formatAmount);
    add('Requested discount', input?.requestedPercent, (value) => `${value}%`);
    add('Policy limit', output?.maximumDiscountPercent, (value) => `${value}%`);
    add('Suggested alternative', output?.suggestedAlternative);
    add('Razorpay order', output?.razorpayOrderId || output?.id);

    return details;
}

function statusClass(status) {
    const value = String(status || '').toUpperCase();

    if (value.includes('BLOCK') || value === 'FAILED' || value === 'ERROR') {
        return 'audit-status blocked';
    }

    if (value === 'PENDING') {
        return 'audit-status pending';
    }

    if (value === 'CANCELLED') {
        return 'audit-status cancelled';
    }

    return 'audit-status success';
}

function displayStatus(item, completedOrderIds = new Set()) {
    if (item.action === 'RAZORPAY_ORDER_CREATED') return 'SUCCESS';
    if (item.action === 'PAYMENT_PENDING') {
        if (String(item.status).toUpperCase() === 'CANCELLED') return 'CANCELLED';
        return completedOrderIds.has(item.input?.orderId) ? 'SUCCESS' : 'PENDING';
    }
    return item.status || 'SUCCESS';
}

export default function Audit() {
    const [actions, setActions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');
    const [expanded, setExpanded] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let mounted = true;

        const load = async () => {
            try {
                const data = await api.audit();

                if (mounted) {
                    setActions(Array.isArray(data) ? data : []);
                    setError('');
                    setLoading(false);
                }
            } catch (e) {
                if (mounted) {
                    setError(e.message);
                    setLoading(false);
                }
            }
        };

        load();

        const timer = setInterval(load, 5000);

        return () => {
            mounted = false;
            clearInterval(timer);
        };
    }, []);

    const filteredActions = useMemo(() => {
        if (filter === 'ALL') {
            return actions;
        }

        if (filter === 'BLOCKED') {
            return actions.filter((item) =>
                ['POLICY_BLOCKED', 'PAYMENT_FAILED'].includes(item.action) ||
                String(item.status).toUpperCase().includes('BLOCK') ||
                String(item.status).toUpperCase() === 'FAILED'
            );
        }

        if (filter === 'PAYMENTS') {
            return actions.filter((item) =>
                [
                    'PAYMENT_APPROVAL',
                    'RAZORPAY_ORDER_CREATED',
                    'PAYMENT_PENDING',
                    'PAYMENT_SUCCESS',
                    'PAYMENT_FAILED',
                ].includes(item.action)
            );
        }

        if (filter === 'AI') {
            return actions.filter((item) =>
                ['USER_REQUEST', 'SEARCH_PRODUCTS', 'PRODUCT_RECOMMENDATION', 'UPSELL'].includes(
                    item.action
                )
            );
        }

        return actions;
    }, [actions, filter]);

    const completedOrderIds = useMemo(() => new Set(
        actions
            .filter((item) => item.action === 'PAYMENT_SUCCESS' && item.input?.orderId)
            .map((item) => item.input.orderId)
    ), [actions]);

    const successfulCount = actions.filter((item) =>
        displayStatus(item, completedOrderIds) === 'SUCCESS'
    ).length;

    const blockedCount = actions.filter(
        (item) => String(item.status).toUpperCase().includes('BLOCK') ||
            String(item.status).toUpperCase() === 'FAILED' ||
            item.action === 'POLICY_BLOCKED'
    ).length;

    const paymentCount = actions.filter((item) =>
        [
            'PAYMENT_APPROVAL',
            'RAZORPAY_ORDER_CREATED',
            'PAYMENT_PENDING',
            'PAYMENT_SUCCESS',
            'PAYMENT_FAILED',
        ].includes(item.action)
    ).length;

    return (
        <Layout
            title="Agent Audit Trail"
            subtitle="A merchant-friendly record of what the AI did, why it did it, and whether each action was allowed."
        >
            <div className="audit-summary">
                <div className="audit-summary-card">
                    <span>Total actions</span>
                    <strong>{actions.length}</strong>
                    <small>Recorded by the agent</small>
                </div>

                <div className="audit-summary-card">
                    <span>Successful</span>
                    <strong>{successfulCount}</strong>
                    <small>Completed without a block</small>
                </div>

                <div className="audit-summary-card audit-summary-warning">
                    <span>Blocked / failed</span>
                    <strong>{blockedCount}</strong>
                    <small>Actions stopped by policy or payment failure</small>
                </div>

                <div className="audit-summary-card">
                    <span>Payment actions</span>
                    <strong>{paymentCount}</strong>
                    <small>Approval, Razorpay and payment events</small>
                </div>
            </div>

            <div className="panel audit-panel">
                <div className="audit-toolbar">
                    <div>
                        <h2>Activity timeline</h2>
                        <p>Latest AI and financial actions appear automatically.</p>
                    </div>

                    <div className="audit-filters">
                        {[
                            ['ALL', 'All activity'],
                            ['AI', 'AI actions'],
                            ['PAYMENTS', 'Payments'],
                            ['BLOCKED', 'Blocked / failed'],
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                className={`audit-filter ${filter === value ? 'active' : ''}`}
                                onClick={() => setFilter(value)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {loading && (
                    <div className="audit-empty-state">
                        <div className="audit-empty-icon">◌</div>
                        <h3>Loading activity</h3>
                        <p>Fetching the latest agent actions.</p>
                    </div>
                )}

                {!loading && error && (
                    <div className="alert danger">{error}</div>
                )}

                {!loading && !error && filteredActions.length === 0 && (
                    <div className="audit-empty-state">
                        <div className="audit-empty-icon">✓</div>
                        <h3>No actions in this view</h3>
                        <p>Try another filter or complete a shopping flow to generate audit events.</p>
                    </div>
                )}

                {!loading && !error && filteredActions.length > 0 && (
                    <div className="audit-timeline">
                        {filteredActions.map((item) => {
                            const meta = ACTION_META[item.action] || {
                                label: prettyAction(item.action || 'Unknown action'),
                                icon: '•',
                                description: 'The system recorded an agent action.',
                            };

                            const details = buildDetails(item);
                            const amount = formatAmount(item.amount);
                            const isExpanded = expanded === item.id;
                            const shownStatus = displayStatus(item, completedOrderIds);
                            const shownDescription = item.action === 'PAYMENT_PENDING' && shownStatus === 'SUCCESS'
                                ? 'Razorpay payment was verified successfully.'
                                : item.action === 'PAYMENT_PENDING' && shownStatus === 'CANCELLED'
                                ? 'Customer closed Razorpay checkout before completing payment.'
                                : meta.description;

                            return (
                                <article className="audit-event" key={item.id}>
                                    <div className="audit-event-marker">
                                        <span>{meta.icon}</span>
                                    </div>

                                    <div className="audit-event-content">
                                        <div className="audit-event-topline">
                                            <div>
                                                <div className="audit-event-title-row">
                                                    <h3>{meta.label}</h3>
                                                    <span className={statusClass(shownStatus)}>
                                                        {shownStatus}
                                                    </span>
                                                </div>

                                                <p className="audit-event-description">
                                                    {shownDescription}
                                                </p>
                                            </div>

                                            <div className="audit-event-time">
                                                <strong>{formatTime(item.timestamp)}</strong>
                                                <span>{formatDate(item.timestamp)}</span>
                                            </div>
                                        </div>

                                        {item.reason && (
                                            <div className="audit-reason">
                                                <span>Why</span>
                                                <p>{item.reason}</p>
                                            </div>
                                        )}

                                        {details.length > 0 && (
                                            <div className="audit-details-grid">
                                                {details.map((detail) => (
                                                    <div className="audit-detail" key={detail.label}>
                                                        <span>{detail.label}</span>
                                                        <strong>{detail.value}</strong>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {amount !== null && (
                                            <div className="audit-amount">
                                                <span>Amount involved</span>
                                                <strong>{amount}</strong>
                                            </div>
                                        )}

                                        <div className="audit-event-footer">
                                            <span>Actor: {item.actor || 'AI'}</span>
                                            <span>Session: {item.sessionId || '—'}</span>

                                            {(item.input || item.output || item.policyResult) && (
                                                <button
                                                    className="audit-tech-toggle"
                                                    onClick={() =>
                                                        setExpanded(isExpanded ? null : item.id)
                                                    }
                                                >
                                                    {isExpanded ? 'Hide technical details' : 'View technical details'}
                                                </button>
                                            )}
                                        </div>

                                        {isExpanded && (
                                            <div className="audit-tech-details">
                                                <div>
                                                    <span>Action code</span>
                                                    <code>{item.action}</code>
                                                </div>

                                                {summarizeValue(item.policyResult) && (
                                                    <div>
                                                        <span>Policy result</span>
                                                        <p>{summarizeValue(item.policyResult)}</p>
                                                    </div>
                                                )}

                                                {item.input && (
                                                    <div>
                                                        <span>Input</span>
                                                        <pre>{JSON.stringify(parseJson(item.input) || item.input, null, 2)}</pre>
                                                    </div>
                                                )}

                                                {item.output && (
                                                    <div>
                                                        <span>Output</span>
                                                        <pre>{JSON.stringify(parseJson(item.output) || item.output, null, 2)}</pre>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </Layout>
    );
}
