import { useEffect, useState } from 'react';
import {
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import Layout from '../components/Layout.jsx';
import Metric from '../components/Metric.jsx';
import RevenueBarChart from '../components/RevenueBarChart.jsx';
import { api, money } from '../services/api.js';

export default function Merchant() {
    const [a, setA] = useState(null);
    const [g, setG] = useState(null);

    useEffect(() => {
        const load = () =>
            Promise.all([api.analytics(), api.growth()]).then(
                ([x, y]) => {
                    setA(x);
                    setG(y);
                }
            );

        load();

        const timer = setInterval(() => {
            load().catch(() => {});
        }, 5000);

        return () => clearInterval(timer);
    }, []);

    if (!a) {
        return (
            <Layout
                title="Merchant Overview"
                subtitle="Loading test/demo analytics…"
            />
        );
    }

    return (
        <Layout
            title="Merchant Overview"
            subtitle="RunX Sports · clearly labeled simulated/test data"
        >
            <div className="grid metrics">
                <Metric
                    label="Total Revenue"
                    value={money(a.revenue)}
                    delta="TEST / DEMO DATA"
                />
                <Metric label="Orders" value={a.orders} />
                <Metric
                    label="Average Order Value"
                    value={money(a.aov)}
                />
                <Metric
                    label="AI-assisted order revenue"
                    value={money(a.aiAttributedRevenue)}
                />
                <Metric
                    label="Incremental revenue lift"
                    value="Not measured"
                />
            </div>

            <div className="merchant-dashboard-columns">
                <div className="merchant-dashboard-column">
                    <div className="panel">
                    <h2>Revenue over time</h2>
                    <div className="chart">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={a.rows.map((row, index) => ({ ...row, chartIndex: index }))}>
                                <XAxis
                                    type="number"
                                    dataKey="chartIndex"
                                    domain={[0, Math.max(a.rows.length - 1, 1)]}
                                    padding={{ left: 8, right: 8 }}
                                    hide
                                />
                                <YAxis hide />
                                <Tooltip formatter={(v) => money(v)} labelFormatter={(index) => a.rows[index]?.date || ''} />
                                <Line
                                    type="monotone"
                                    dataKey="revenue"
                                    strokeWidth={3}
                                    dot={{ r: 3 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                    <div className="panel">
                    <h2>AI-assisted order revenue</h2>
                    <div className="chart">
                        <RevenueBarChart rows={a.rows} />
                    </div>
                </div>
                </div>
                <div className="merchant-dashboard-column">
                    <div className="panel growth-snapshot">
                    <h2>AI growth snapshot</h2>

                    <div className="growth-snapshot-values">
                        <div className="muted">Earlier event half</div>
                        <h2>
                            {money(g?.before.revenue)} · AOV{' '}
                            {money(g?.before.aov)}
                        </h2>
                        <div className="muted">Later event half</div>
                        <h2>
                            {money(g?.after.revenue)} · AOV{' '}
                            {money(g?.after.aov)}
                        </h2>
                    </div>
                </div>
                    <div className="panel">
                    <h2>Key performance indicators</h2>
                    <table className="table">
                        <tbody>
                            <tr>
                                <td>Cart conversion rate</td>
                                <td>
                                    <b>{a.conversionRate == null ? 'No started carts yet' : a.conversionRate + '%'}</b>
                                    <div className="muted">{a.kpiCounts?.convertedCarts ?? 0} purchased / {a.kpiCounts?.carts ?? 0} started carts</div>
                                </td>
                            </tr>
                            <tr>
                                <td>Cross-sell purchase rate</td>
                                <td>
                                    <b>{a.upsellRate == null ? 'No paid orders with recorded offers yet' : a.upsellRate + '%'}</b>
                                    <div className="muted">{a.kpiCounts?.upsellOrders ?? 0} accepted / {a.kpiCounts?.offeredOrders ?? 0} paid orders with offers</div>
                                </td>
                            </tr>
                            <tr>
                                <td>Abandoned cart recovery</td>
                                <td>
                                    <b>{a.abandonedCartRecoveryRate == null ? 'No abandoned carts recorded' : a.abandonedCartRecoveryRate + '%'}</b>
                                    <div className="muted">{a.kpiCounts?.recoveredCarts ?? 0} purchased after abandonment / {a.kpiCounts?.abandonedCarts ?? 0} marked carts</div>
                                </td>
                            </tr>
                            <tr>
                                <td>AI-exposed vs other carts</td>
                                <td>
                                    <b>{a.aiConversionDifference == null ? 'Need carts in both groups' : `${a.aiConversionDifference > 0 ? '+' : ''}${a.aiConversionDifference} percentage points`}</b>
                                    <div className="muted">AI: {a.kpiCounts?.aiConverted ?? 0}/{a.kpiCounts?.aiCarts ?? 0} · Other: {a.kpiCounts?.otherConverted ?? 0}/{a.kpiCounts?.otherCarts ?? 0}. Observational, not proven improvement.</div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                </div>
            </div>
        </Layout>
    );
}
