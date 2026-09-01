// Observational attribution only; this does not estimate causal revenue lift.
export function attributedAmount(strategy, order, items, exposures) {
    const shown = exposures.filter(e => e.output?.strategyIds?.includes(strategy.id));
    const shownIds = new Set(shown.flatMap(e => e.output?.productIds || []));
    if (!shown.length) return null;
    const affected = strategy.affectedProductIds || [];
    const ids = new Set(items.map(item => item.productId));
    if (strategy.type === 'CROSS_SELL' && !ids.has(affected[0])) return null;
    // Recovery/discount causality is not instrumented: do not invent outcomes.
    if (!['CROSS_SELL', 'HIGH_CONVERSION'].includes(strategy.type)) return null;
    const targets = strategy.type === 'CROSS_SELL' ? affected.slice(1) : affected;
    const matching = items.filter(item => targets.includes(item.productId) && shownIds.has(item.productId));
    if (!matching.length || !order.subtotal) return null;
    const gross = matching.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return Math.floor(gross * order.total / order.subtotal);
}
