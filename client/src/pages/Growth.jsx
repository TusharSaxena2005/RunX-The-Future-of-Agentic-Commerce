import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import Metric from '../components/Metric.jsx';
import { api, money } from '../services/api.js';

function confidenceLabel(value) {
    if (value >= 0.85) return 'High model score (uncalibrated)';
    if (value >= 0.7) return 'Medium model score (uncalibrated)';
    return 'Low model score (uncalibrated)';
}

export default function Growth() {
    const [g, setG] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activating, setActivating] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState('');

    const load = async () => {
        setLoading(true);
        setError('');

        try {
            const result = await api.growth();
            setG(result);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    async function analyzeGrowth() {
        setAnalyzing(true);
        setError('');

        try {
            const result = await api.analyzeGrowth();
            setG(result);
        } catch (e) {
            setError(e.message);
        } finally {
            setAnalyzing(false);
        }
    }

    async function activate(id) {
        setActivating(id);
        setError('');

        try {
            await api.activate(id);
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setActivating('');
        }
    }

    if (loading && !g) {
        return (
            <Layout
                title="Merchant Growth Agent"
                subtitle="Analyzing live commerce data…"
            >
                <div className="panel">
                    <div className="muted">
                        The Growth Agent is examining product
                        performance, purchase relationships,
                        cart signals and AI-assisted sales.
                    </div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout
            title="Merchant Growth Agent"
            subtitle="The AI analyzes live commerce signals and discovers growth opportunities for merchant approval."
        >
            {error && (
                <div className="alert danger" style={{ marginBottom: 16 }}>
                    {error}
                </div>
            )}

            {g && (
                <>
                    <div className="grid three">
                        <Metric
                            label="Earlier event half revenue"
                            value={money(g.before.revenue)}
                        />
                        <Metric
                            label="Later event half revenue"
                            value={money(g.after.revenue)}
                        />
                        <Metric
                            label="Later event half AOV"
                            value={money(g.after.aov)}
                        />
                    </div>

                    <div className="panel" style={{ marginTop: 16 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 16,
                                alignItems: 'flex-start',
                            }}
                        >
                            <div>
                                <h2 style={{ marginBottom: 6 }}>
                                    AI-discovered opportunities
                                </h2>
                                <p className="muted" style={{ margin: 0 }}>
                                    {g.analysisMessage}
                                    {g.measurementNote}
                                </p>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    justifyContent: 'flex-end',
                                }}
                            >
                                <span className="pill">
                                    {g.analysisSource ===
                                    'gemini-autonomous-analysis'
                                        ? 'Gemini analysis'
                                        : g.analysisSource ===
                                          'local-data-analysis'
                                        ? 'Database analysis'
                                        : 'Saved analysis'}
                                </span>

                                <button
                                    className="primary"
                                    onClick={analyzeGrowth}
                                    disabled={analyzing}
                                >
                                    {analyzing
                                        ? 'Analyzing…'
                                        : 'Run AI Growth Analysis'}
                                </button>
                            </div>
                        </div>

                        <div
                            className="alert"
                            style={{ marginTop: 14 }}
                        >
                            Estimates shown below are recommendations,
                            not guaranteed revenue. A merchant must approve
                            a strategy before it becomes active.
                        </div>

                        <div style={{ marginTop: 16 }}>
                            {g.strategies.length === 0 ? (
                                <div className="muted">
                                    No saved opportunities yet. Click
                                    <strong> Run AI Growth Analysis</strong> to
                                    ask Gemini to analyze the latest merchant
                                    data.
                                </div>
                            ) : (
                                g.strategies.map((s) => (
                                    <div
                                        className="strategy"
                                        key={s.id}
                                        style={{
                                            alignItems: 'flex-start',
                                        }}
                                    >
                                        <div style={{ maxWidth: 850 }}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    gap: 8,
                                                    flexWrap: 'wrap',
                                                    alignItems: 'center',
                                                }}
                                            >
                                                <span className="tag">
                                                    {s.type}
                                                </span>

                                                {s.status === 'ACTIVE' ? (
                                                    <span className="alert success">
                                                        ACTIVE
                                                    </span>
                                                ) : (
                                                    <span className="status">
                                                        PROPOSED
                                                    </span>
                                                )}

                                                {typeof s.confidence ===
                                                    'number' && (
                                                    <span className="status">
                                                        {confidenceLabel(
                                                            s.confidence
                                                        )}
                                                    </span>
                                                )}
                                            </div>

                                            <h3
                                                style={{
                                                    margin: '7px 0 5px',
                                                }}
                                            >
                                                {s.name}
                                            </h3>

                                            <p
                                                className="muted"
                                                style={{
                                                    margin: 0,
                                                    lineHeight: 1.55,
                                                }}
                                            >
                                                {s.description}
                                            </p>

                                            <div
                                                className="grid"
                                                style={{
                                                    gridTemplateColumns:
                                                        'repeat(3, minmax(0, 1fr))',
                                                    gap: 8,
                                                    marginTop: 12,
                                                }}
                                            >
                                                <div className="metric">
                                                    <span>
                                                        {s.status === 'ACTIVE' ? 'Attributed purchases' : 'Forecast purchases'}
                                                    </span>
                                                    <strong
                                                        style={{ fontSize: 18 }}
                                                    >
                                                        {s.status === 'ACTIVE' ? s.attributedPurchases : s.estimatedConversions}
                                                    </strong>
                                                </div>

                                                <div className="metric">
                                                    <span>
                                                        {s.status === 'ACTIVE' ? 'Attributed net sales (not lift)' : 'Unvalidated revenue forecast'}
                                                    </span>
                                                    <strong
                                                        style={{ fontSize: 18 }}
                                                    >
                                                        {money(
                                                            s.status === 'ACTIVE' ? s.attributedRevenue : s.estimatedRevenue
                                                        )}
                                                    </strong>
                                                </div>

                                                <div className="metric">
                                                    <span>
                                                        Evidence
                                                    </span>
                                                    <strong
                                                        style={{ fontSize: 18 }}
                                                    >
                                                        {s.evidence?.length ||
                                                            0}
                                                    </strong>
                                                </div>
                                            </div>

                                            {s.evidence?.length > 0 && (
                                                <div
                                                    className="alert success"
                                                    style={{ marginTop: 10 }}
                                                >
                                                    <strong>
                                                        Why the AI found this:
                                                    </strong>
                                                    <ul
                                                        style={{
                                                            margin:
                                                                '6px 0 0 18px',
                                                        }}
                                                    >
                                                        {s.evidence.map(
                                                            (item, index) => (
                                                                <li key={index}>
                                                                    {item}
                                                                </li>
                                                            )
                                                        )}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            {s.status === 'ACTIVE' ? (
                                                <span className="alert success">
                                                    ACTIVE
                                                </span>
                                            ) : (
                                                <button
                                                    className="primary"
                                                    disabled={
                                                        activating === s.id
                                                    }
                                                    onClick={() =>
                                                        activate(s.id)
                                                    }
                                                >
                                                    {activating === s.id
                                                        ? 'Activating…'
                                                        : 'Approve & Activate'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </Layout>
    );
}
