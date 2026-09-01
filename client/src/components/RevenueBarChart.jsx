import { useLayoutEffect, useRef, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { money } from '../services/api.js';

export default function RevenueBarChart({ rows }) {
    const containerRef = useRef(null);
    const tooltipRef = useRef(null);
    const [hovered, setHovered] = useState(null);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    // Non-AI orders have zero AI revenue and should not reserve invisible bar slots.
    const chartRows = rows.filter(row => row.aiRevenue > 0);
    const active = hovered === null ? null : chartRows[hovered.index];

    function showTooltip(event, index) {
        const container = containerRef.current.getBoundingClientRect();
        const bar = event.currentTarget.getBoundingClientRect();
        setHovered({ index, center: bar.left - container.left + bar.width / 2,
            top: bar.top - container.top, bottom: bar.bottom - container.top });
    }

    useLayoutEffect(() => {
        if (!hovered || !tooltipRef.current || !containerRef.current) return;
        const { width, height } = tooltipRef.current.getBoundingClientRect();
        const container = containerRef.current.getBoundingClientRect();
        const top = hovered.top >= height + 8 ? hovered.top - height - 8 : hovered.bottom + 8;
        const left = hovered.center + width + 20 <= container.width
            ? hovered.center + 12 : hovered.center - width - 12;
        setPosition({
            left: Math.max(8, Math.min(left, container.width - width - 8)),
            top: Math.max(8, Math.min(top, container.height - height - 8)),
        });
    }, [hovered]);

    if (!chartRows.length) return <p className="muted">No AI-assisted order revenue yet.</p>;

    return (
        <div ref={containerRef} style={{ position: 'relative', height: '100%' }} onMouseLeave={() => setHovered(null)}>
            <div style={{ width: `min(100%, ${chartRows.length * 64}px)`, height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows}>
                        <XAxis dataKey="date" hide />
                        <YAxis hide />
                        <Bar dataKey="aiRevenue" maxBarSize={48} isAnimationActive={false}
                            shape={({ x, y, width, height, index, payload }) => (
                                <rect x={x} y={y} width={width} height={height} rx={5}
                                    fill="var(--chart-accent)" tabIndex={0} role="img"
                                    aria-label={`${payload.date}: AI-assisted revenue ${money(payload.aiRevenue)}`}
                                    onMouseEnter={event => showTooltip(event, index)}
                                    onMouseLeave={() => setHovered(null)}
                                    onFocus={event => showTooltip(event, index)}
                                    onBlur={() => setHovered(null)}
                                    onClick={event => showTooltip(event, index)}>
                                    <title>{`${payload.date}: ${money(payload.aiRevenue)}`}</title>
                                </rect>
                            )}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            {active && (
                <div ref={tooltipRef} role="tooltip" className="revenue-bar-tooltip" style={position}>
                    <strong>{active.date}</strong>
                    <div>AI-assisted revenue: <b>{money(active.aiRevenue)}</b></div>
                </div>
            )}
        </div>
    );
}
