import { prisma } from '../db.js';

export async function getPolicy(merchantId) {
    return prisma.policy.findUnique({
        where: { merchantId },
    });
}

export async function evaluateTransaction({
    merchantId,
    total,
    discount = 0,
    discountPercent = 0,
}) {
    if (![total, discount, discountPercent].every(Number.isFinite) || !Number.isSafeInteger(total) || !Number.isSafeInteger(discount) || total <= 0 || discount < 0 || discountPercent < 0 || discountPercent > 100) {
        return { allowed: false, reason: 'Invalid transaction amounts', suggestedAlternative: null };
    }
    const policy = await getPolicy(merchantId);

    if (!policy) {
        return {
            allowed: false,
            reason: 'Merchant policy not configured',
            suggestedAlternative: null,
        };
    }

    if (total > policy.maximumTransactionAmount) {
        return {
            allowed: false,
            reason: `Transaction exceeds merchant maximum of ₹${policy.maximumTransactionAmount}`,
            suggestedAlternative: `Keep the transaction at or below ₹${policy.maximumTransactionAmount}`,
        };
    }

    if (discountPercent > policy.maximumDiscountPercentage) {
        return {
            allowed: false,
            reason: `Requested discount exceeds merchant maximum of ${policy.maximumDiscountPercentage}%`,
            suggestedAlternative: `Apply maximum allowed ${policy.maximumDiscountPercentage}% discount`,
        };
    }

    if (discount > policy.maximumDiscountAmount) {
        return {
            allowed: false,
            reason: `Discount exceeds merchant maximum of ₹${policy.maximumDiscountAmount}`,
            suggestedAlternative: `Apply maximum allowed discount of ₹${policy.maximumDiscountAmount}`,
        };
    }

    return {
        allowed: true,
        reason: 'All configured financial policies passed',
        suggestedAlternative: null,
    };
}

export async function evaluateDiscount({
    merchantId,
    subtotal,
    requestedPercent,
}) {
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0 || !Number.isFinite(requestedPercent) || requestedPercent < 0 || requestedPercent > 100) {
        return { allowed: false, discount: 0, reason: 'Invalid discount request' };
    }
    const policy = await getPolicy(merchantId);

    if (!policy) {
        return {
            allowed: false,
            discount: 0,
            reason: 'Merchant policy not configured',
        };
    }

    const requestedAmount = Math.round(
        (subtotal * requestedPercent) / 100
    );
    const allowedPercent = Math.min(
        requestedPercent,
        policy.maximumDiscountPercentage
    );
    const discount = Math.min(
        Math.round((subtotal * allowedPercent) / 100),
        policy.maximumDiscountAmount
    );

    if (requestedPercent > policy.maximumDiscountPercentage) {
        return {
            allowed: false,
            discount,
            reason: `Requested discount exceeds merchant maximum of ${policy.maximumDiscountPercentage}%`,
            suggestedAlternative: `Apply maximum allowed ${policy.maximumDiscountPercentage}% discount`,
        };
    }

    if (requestedAmount > policy.maximumDiscountAmount) {
        return {
            allowed: false,
            discount: policy.maximumDiscountAmount,
            reason: `Requested discount exceeds merchant maximum of ₹${policy.maximumDiscountAmount}`,
            suggestedAlternative: `Apply maximum allowed discount of ₹${policy.maximumDiscountAmount}`,
        };
    }

    return {
        allowed: true,
        discount,
        reason: 'Discount is within policy limits',
        suggestedAlternative: null,
    };
}
