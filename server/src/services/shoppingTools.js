import { searchProducts, getProduct, relatedProducts } from './catalogService.js';
import { getOrCreateCart, addToCart, calculateCart } from './cartService.js';
import { createOrderFromCart } from './orderService.js';
import { evaluateTransaction } from './policyEngine.js';
import { audit } from './auditService.js';
import { prisma } from '../db.js';
import { z } from 'zod';

export const functionDeclarations = [
  {
    name: 'search_products',
    description: 'Search the RunX Sports PostgreSQL catalog using the customer intent. Use maxPrice when the customer gives a budget.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural-language product intent, e.g. daily running shoes' },
        maxPrice: { type: 'number', description: 'Maximum product price in INR, if specified by the customer' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_product',
    description: 'Get complete details for one product using its product id from the catalog.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string', description: 'The product id' } },
      required: ['productId']
    }
  },
  {
    name: 'get_related_products',
    description: 'Find products frequently bought with or related to a specific product. Use this for relevant cross-sell suggestions.',
    parameters: {
      type: 'object',
      properties: { productId: { type: 'string', description: 'The source product id' } },
      required: ['productId']
    }
  },
  {
    name: 'get_cart',
    description: 'Get the current shopping cart, including items and quantities, for the current customer session.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_active_growth_strategies',
    description: 'Get currently active merchant growth strategies that the customer-facing agent must use when relevant. This reflects strategies explicitly approved by the merchant.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'create_cart',
    description: 'Create or resume the current customer shopping cart.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'add_to_cart',
    description: 'Add a product to the current cart. Only use a product id returned by a catalog tool or clearly identified in the conversation.',
    parameters: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'The product id to add' },
        quantity: { type: 'number', description: 'Whole-number quantity; default to 1' }
      },
      required: ['productId']
    }
  },
  {
    name: 'calculate_order',
    description: 'Calculate the current cart subtotal and total before payment. Do not invent prices.',
    parameters: {
      type: 'object',
      properties: { discount: { type: 'number', description: 'Discount amount in INR to evaluate' } }
    }
  },
  {
    name: 'create_order',
    description: 'Create an order from the current cart. This creates a pending-payment order and does not charge the customer.',
    parameters: {
      type: 'object',
      properties: { discount: { type: 'number', description: 'Discount amount in INR' } }
    }
  },
  {
    name: 'request_payment_approval',
    description: 'Run merchant policy checks for a prospective transaction. The AI must never silently charge the customer.',
    parameters: {
      type: 'object',
      properties: {
        total: { type: 'number', description: 'Final transaction total in INR' },
        discount: { type: 'number', description: 'Discount amount in INR' },
        discountPercent: { type: 'number', description: 'Discount percentage requested by the customer' }
      },
      required: ['total']
    }
  }
];

export const toolConfig = {
  functionDeclarations
};

export function jsonSafe(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

export function actionForTool(name) {
  const map = {
    search_products: 'SEARCH_PRODUCTS',
    get_active_growth_strategies: 'PRODUCT_RECOMMENDATION',
    get_product: 'PRODUCT_RECOMMENDATION',
    get_related_products: 'UPSELL',
    get_cart: 'CREATE_CART',
    create_cart: 'CREATE_CART',
    add_to_cart: 'ADD_TO_CART',
    calculate_order: 'ORDER_CALCULATION',
    create_order: 'CREATE_ORDER',
    request_payment_approval: 'POLICY_CHECK'
  };
  return map[name] || name.toUpperCase();
}

export async function executeTool({ name, args, merchantId, sessionId }) {
  const amount = z.number().int().nonnegative();
  const schemas = {
    search_products: z.object({ query: z.string().max(2000), maxPrice: amount.optional() }),
    get_product: z.object({ productId: z.string() }),
    get_related_products: z.object({ productId: z.string() }),
    get_active_growth_strategies: z.object({}), get_cart: z.object({}), create_cart: z.object({}),
    add_to_cart: z.object({ productId: z.string(), quantity: z.number().int().min(1).max(20).optional() }),
    calculate_order: z.object({ discount: amount.optional() }), create_order: z.object({ discount: amount.optional() }),
    request_payment_approval: z.object({ total: amount, discount: amount.optional(), discountPercent: z.number().min(0).max(100).optional() }),
  };
  if (!schemas[name]) throw new Error('Unknown tool');
  args = schemas[name].strict().parse(args);
  switch (name) {
    case 'search_products':
      return searchProducts({ ...args, merchantId });
    case 'get_product':
      return getProduct({ ...args, merchantId });
    case 'get_related_products':
      return relatedProducts({ ...args, merchantId });
    case 'get_active_growth_strategies':
      return prisma.growthStrategy.findMany({
        where: { merchantId, status: 'ACTIVE' },
        orderBy: { activationTime: 'desc' },
        select: {
          id: true,
          type: true,
          name: true,
          description: true,
          affectedProductIds: true,
          attributedPurchases: true,
          attributedRevenue: true,
          activationTime: true,
        },
      });
    case 'get_cart':
    case 'create_cart':
      return getOrCreateCart({ merchantId, sessionId });
    case 'add_to_cart':
      return addToCart({ ...args, merchantId, sessionId, quantity: args.quantity ?? 1 });
    case 'calculate_order':
      return calculateCart({ ...args, merchantId, sessionId });
    case 'create_order': {
      const discount = Number(args.discount || 0);
      const cart = await calculateCart({ merchantId, sessionId, discount });
      const policy = await evaluateTransaction({
        merchantId,
        total: cart.total,
        discount,
        discountPercent: cart.subtotal ? (discount / cart.subtotal) * 100 : 0,
      });

      await audit({
        merchantId,
        sessionId,
        actor: 'AI',
        action: 'POLICY_CHECK',
        amount: cart.total,
        input: {
          total: cart.total,
          discount,
          discountPercent: cart.subtotal ? (discount / cart.subtotal) * 100 : 0,
        },
        output: policy,
        policyResult: policy,
        status: policy.allowed ? 'SUCCESS' : 'BLOCKED',
        reason: policy.reason,
      });

      if (!policy.allowed) {
        throw new Error(
          `${policy.reason}${policy.suggestedAlternative ? ` ${policy.suggestedAlternative}` : ''}`
        );
      }

      return createOrderFromCart({ ...args, merchantId, sessionId });
    }
    case 'request_payment_approval':
      return evaluateTransaction({ ...args, merchantId });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
