import { searchProducts } from './catalogService.js';
import { calculateCart } from './cartService.js';
import { evaluateTransaction, getPolicy } from './policyEngine.js';
import { audit } from './auditService.js';
import { prisma } from '../db.js';
import { DEFAULT_MODEL, textFromParts } from './aiShared.js';
import { functionDeclarations, toolConfig, executeTool, actionForTool, jsonSafe } from './shoppingTools.js';

const MAX_TURNS = 8;
const MAX_HISTORY_ITEMS = 40;

// Session memory keeps multi-turn references such as "Yes, add it" meaningful.
// It is intentionally in-memory for the hackathon MVP; restarting the server starts
// a fresh AI conversation without changing the persistent cart/database.
const sessionHistories = new Map();
const activeShoppingRequests = new Map();

export async function stopShoppingAgent(sessionId, { clear = false } = {}) {
  const active = activeShoppingRequests.get(sessionId);
  if (active) {
    active.controller.abort();
    await active.promise.catch(() => {});
  }
  if (clear) sessionHistories.delete(sessionId);
}

export async function runShoppingAgent(input) {
  if (activeShoppingRequests.has(input.sessionId)) throw new Error('A shopping request is already running. Stop it before sending another.');
  const controller = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
  const active = { controller };
  activeShoppingRequests.set(input.sessionId, active);
  try {
    active.promise = runShoppingTurn({ ...input, signal });
    return await active.promise;
  } finally {
    if (activeShoppingRequests.get(input.sessionId) === active) activeShoppingRequests.delete(input.sessionId);
  }
}

function getHistory(sessionId) {
  if (!sessionHistories.has(sessionId) && sessionHistories.size >= 1000) sessionHistories.delete(sessionHistories.keys().next().value);
  if (!sessionHistories.has(sessionId)) sessionHistories.set(sessionId, []);
  return sessionHistories.get(sessionId);
}

function trimHistory(history) {
  if (history.length > MAX_HISTORY_ITEMS) history.splice(0, history.length - MAX_HISTORY_ITEMS);
}

async function callGemini({ apiKey, model, systemInstruction, contents, signal }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        tools: [toolConfig],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingLevel: 'minimal' }
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = data?.error?.message || `Gemini API request failed with status ${response.status}`;
    throw new Error(providerMessage);
  }
  return data;
}

function extractCandidate(data) {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  return { candidate, parts };
}

async function runGeminiAgent({ merchantId, sessionId, message, mode = 'browse', signal }) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured. Add it to server/.env.');

  const history = getHistory(sessionId);
  history.push({ role: 'user', parts: [{ text: message }] });
  trimHistory(history);

  await audit({
    merchantId,
    sessionId,
    actor: 'USER',
    action: 'USER_REQUEST',
    input: { message },
    output: null
  });

  const discovered = [];
  const related = [];
  let latestCart = null;
  let latestOrder = null;
  let latestApproval = null;
  let primaryProductAdded = false;

  const activeStrategies = await prisma.growthStrategy.findMany({
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
    },
  });

  const activeStrategyContext = activeStrategies.length
    ? `Merchant-approved growth strategies currently active:
${JSON.stringify(activeStrategies)}`
    : 'No merchant-approved growth strategies are currently active.';

  const systemInstruction = [
    'You are the AI shopping agent for RunX Sports.',
    'You are connected to a live PostgreSQL product catalog and cart/order tools.',
    'Use tools to retrieve current data instead of inventing products, prices, stock, ratings, or relationships.',
    'When a product has specifications.demoListing, its prices and inventory are demo values and its image is a generic illustration. Do not call these manufacturer prices, verified stock or real product photos. Compare only features present in the catalog; do not invent ratings or superiority based on a brand.',
    'Understand conversational references such as "it", "that one", "add it", and "the shoes" using prior messages and tool results.',
    'When the customer asks for recommendations, search the catalog first and explain the best match using returned product data.',
    mode === 'ai_pick'
      ? 'AI Picks for Me mode is active. For the initial request, select exactly one best-fit main product, explain the reason briefly, and ask whether the customer wants to add it. Do not present alternatives unless the customer explicitly asks for them.'
      : 'Browse mode is active. You may present multiple relevant main-product options.',
    'When the customer agrees to an earlier cross-sell, add the referenced product to the cart with add_to_cart instead of repeating the recommendation.',
    'When the customer asks what else they need, inspect the current cart and related products before answering.',
    'Merchant-approved growth strategies are part of the live sales policy. Use relevant active strategies when recommending products, but never misrepresent estimated impact as guaranteed.',
    activeStrategyContext,
    'Check active merchant growth strategies before making recommendations when they are relevant. These strategies were explicitly approved by the merchant and should influence the recommendation experience.',
    'Do not recommend accessories or cross-sells during the initial main-product search.',
    'Only after add_to_cart successfully adds the customer-selected main product, inspect its related products and offer one relevant cross-sell naturally.',
    'Do not claim that payment happened unless the backend payment endpoint reports success.',
    'Never bypass or override merchant policy. Never silently charge the customer.',
    'When create_order succeeds, do not ask for payment approval in chat. Tell the customer the order is ready and that the interface now shows an Approve & Pay button. Chat messages never approve payment.',
    'Keep replies natural, concise, and useful. Mention actual product names and INR prices from tool results when relevant.'
  ].join('\n');

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    signal?.throwIfAborted();
    const data = await callGemini({ apiKey, model, systemInstruction, contents: history, signal });
    signal?.throwIfAborted();
    const { candidate, parts } = extractCandidate(data);
    if (!candidate) throw new Error('Gemini returned no candidate response.');

    // Preserve the exact model content so the next user message has the same
    // function-call/text context, which is essential for multi-turn tool calling.
    history.push({ role: 'model', parts });
    trimHistory(history);

    const functionCalls = parts.filter((part) => part.functionCall);
    if (functionCalls.length > 12) throw new Error('Too many tool calls in one response');
    if (!functionCalls.length) {
      const messageText = textFromParts(parts) || 'I could not generate a response.';
      await audit({
        merchantId,
        sessionId,
        actor: 'AI',
        action: 'PRODUCT_RECOMMENDATION',
        input: { message },
        output: { content: messageText, model }
      });

      const uniqueProducts = [...new Map(discovered.map((p) => [p.id, p])).values()];
      const normalizedMessage = messageText.toLowerCase();
      const mentionedProducts = uniqueProducts
        .filter((product) => normalizedMessage.includes(product.name.toLowerCase()))
        .slice(0, 6);
      let displayedProducts = mentionedProducts.length
        ? mentionedProducts
        : uniqueProducts.slice(0, 1);
      if (mode === 'ai_pick') displayedProducts = displayedProducts.slice(0, 1);
      const checkoutRequired = latestOrder?.status === 'PENDING_PAYMENT';
      const customerMessage = checkoutRequired
        ? `### Order ready for payment\n\nYour order **${latestOrder.id}** is ready. Use the **Approve & Pay** button below to continue to Razorpay.\n\nYou can continue chatting to change or ask about your order; chatting will not approve payment.`
        : messageText;

      const productIds = [...new Set([...displayedProducts, ...(primaryProductAdded && related[0] ? [related[0]] : [])].map(p => p.id))];
      if (productIds.length) await audit({ merchantId, sessionId, actor: 'AI', action: 'PRODUCT_RECOMMENDATION',
        output: { kind: 'DISPLAYED_RECOMMENDATION', productIds,
          crossSellProductIds: primaryProductAdded && related[0] ? [related[0].id] : [],
          strategyIds: activeStrategies.filter(s => s.affectedProductIds.some(id => productIds.includes(id))).map(s => s.id) },
        reason: 'Product cards returned to customer; attribution is observational, not incremental lift.' });
      return {
        message: customerMessage,
        products: displayedProducts,
        upsell: primaryProductAdded ? related[0] || null : null,
        cart: latestCart,
        order: latestOrder,
        checkoutRequired,
        approval: latestApproval,
        provider: 'gemini',
        model
      };
    }

    const functionResponses = [];
    for (const part of functionCalls) {
      signal?.throwIfAborted();
      const call = part.functionCall;
      const args = call.args || {};
      let result;
      try {
        result = await executeTool({ name: call.name, args, merchantId, sessionId });
      } catch (error) {
        result = { error: error.message };
      }

      if (call.name === 'search_products' && Array.isArray(result)) discovered.push(...result);
      if (call.name === 'get_related_products' && Array.isArray(result)) related.push(...result);
      if (call.name === 'get_cart' || call.name === 'create_cart' || call.name === 'add_to_cart') latestCart = result;
      if (call.name === 'add_to_cart' && !result?.error) primaryProductAdded = true;
      if (call.name === 'create_order') latestOrder = result;
      if (call.name === 'request_payment_approval') latestApproval = result;

      await audit({
        merchantId,
        sessionId,
        actor: 'AI',
        action: actionForTool(call.name),
        input: args,
        output: jsonSafe(result),
        status: result?.error ? 'FAILED' : 'SUCCESS'
      });

      const functionResponse = {
        name: call.name,
        response: { result: jsonSafe(result) }
      };
      if (call.id) functionResponse.id = call.id;
      functionResponses.push({ functionResponse });
    }

    // Gemini's generateContent function-calling loop sends function results back
    // as the user/tool-result turn, which the model then uses to generate text or
    // request another tool.
    history.push({ role: 'user', parts: functionResponses });
    trimHistory(history);
  }

  throw new Error('Gemini agent exceeded the tool-call limit.');
}

async function runCatalogFallback({ merchantId, message, reason = 'not-configured', mode = 'browse' }) {
  // Transactional follow-ups must never be interpreted as product searches.
  if (/\b(cart|checkout|pay|payment)\b/i.test(message)
    || /^\s*(?:add|remove|create\s+(?:an?\s+)?order|place\s+(?:an?\s+)?order)\b/i.test(message)
    || /^\s*(?:yes|no|it|that|that one)[.!\s]*$/i.test(message)) {
    return {
      message: 'The AI service is unavailable, so I could not complete this request. Please review your cart and use its checkout controls. I have not made any additional changes.',
      products: [], upsell: null, cart: null, order: null,
      checkoutRequired: false, approval: null, provider: 'fallback',
    };
  }
  const products = await searchProducts({ merchantId, query: message });
  const primary = products[0];
  const displayedProducts = primary
    ? (mode === 'ai_pick'
      ? [primary]
      : products.filter((product) => product.category === primary.category).slice(0, 3))
    : [];

  const response = {
    message: displayedProducts.length
      ? `${reason === 'unavailable' ? 'The AI service is temporarily unavailable, so I evaluated the live catalog directly. ' : ''}${mode === 'ai_pick' ? `I recommend **${primary.name}** for you because it is the strongest catalog match for your request. Would you like to proceed with this product?` : `${primary.name} is currently the strongest match for your request.`}`
      : `I couldn't find a matching product in the RunX Sports catalog.`,
    products: displayedProducts,
    upsell: null,
    cart: null,
    order: null,
    checkoutRequired: false,
    approval: null,
    provider: 'fallback'
  };
  return response;
}

async function runShoppingTurn({ merchantId, sessionId, message, mode = 'browse', signal }) {
  signal?.throwIfAborted();
  const lastReply = getHistory(sessionId).at(-1)?.parts?.map(part => part.text || '').join(' ') || '';
  const discountFollowUp = /discount amount or percentage|You can request up to|This is the highest discount I can offer|Discount quote:/.test(lastReply)
    && /^\s*(?:₹|rs\.?|inr)?\s*-?\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%|percent|rupees?|rs|inr)?\s*$/i.test(message);
  const creatingOrder = /\b(create|place|prepare)\b.*\border\b/i.test(message);
  if (!creatingOrder && (/\b(discounts?|coupons?|promo(?:tion)?\s*codes?)\b/i.test(message) || discountFollowUp)) {
    const { cart, subtotal } = await calculateCart({ merchantId, sessionId });
    const policy = await getPolicy(merchantId);
    const money = (value) => `₹${value.toLocaleString('en-IN')}`;
    let reply;
    let quote = null;
    if (!subtotal) {
      reply = 'Your cart is empty. Add a product before requesting a discount.';
    } else if (!policy) {
      reply = `Your cart subtotal is ${money(subtotal)}. Discounts are unavailable because the merchant has not configured a policy. No discount has been applied.`;
    } else {
      const maximum = Math.max(0, Math.min(
        Math.floor(subtotal * policy.maximumDiscountPercentage / 100),
        policy.maximumDiscountAmount, subtotal - 1,
      ));
      const percent = message.match(/(-?\d+(?:\.\d+)?)\s*(?:%|percent\b)/i);
      const amount = message.match(/(?:₹|rs\.?\s*|inr\s*)(-?\d+(?:,\d{3})*(?:\.\d+)?)/i)
        || message.match(/(-?\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:rupees?\b|rs\b|inr\b)/i);
      const requested = percent ? Math.round(subtotal * Number(percent[1]) / 100)
        : amount ? Number(amount[1].replaceAll(',', ''))
          : discountFollowUp ? Number(message.trim().replaceAll(',', '')) : null;
      if (!maximum) {
        reply = `Your cart subtotal is ${money(subtotal)}. No discount is available under the merchant's current limits.`;
      } else if (requested === null) {
        reply = `Your cart subtotal is **${money(subtotal)}**. What discount amount or percentage would you like to request? No discount has been applied.`;
      } else if (!Number.isSafeInteger(requested) || requested < 0) {
        reply = 'Please enter a valid discount amount or percentage. Use whole rupees for an amount. No discount has been applied.';
      } else if (requested > maximum
        || (percent && Number(percent[1]) > policy.maximumDiscountPercentage)) {
        reply = `This is the highest discount I can offer: **${money(maximum)}** off your **${money(subtotal)}** cart. No discount has been applied.`;
      } else {
        const approval = await evaluateTransaction({ merchantId, total: subtotal - requested,
          discount: requested, discountPercent: requested / subtotal * 100 });
        if (!approval.allowed) {
          reply = `${approval.reason}. No discount has been applied.`;
        } else {
          quote = { subtotal, discount: requested, total: subtotal - requested };
          reply = `Discount quote: **${money(requested)}** off **${money(subtotal)}**, for a total of **${money(quote.total)}**. This is a quote; your cart has not changed. Ask me to create an order with this discount to continue. Payment still requires your approval.`;
        }
      }
    }
    await audit({ merchantId, sessionId, actor: 'AI', action: 'DISCOUNT_REQUEST',
      input: { message }, output: { message: reply, quote } });
    const history = getHistory(sessionId);
    history.push({ role: 'user', parts: [{ text: message }] },
      { role: 'model', parts: [{ text: reply }] });
    trimHistory(history);
    return { message: reply, products: [], upsell: null, cart, order: null,
      checkoutRequired: false, approval: null, provider: 'policy', quote };
  }
  if (process.env.GEMINI_API_KEY) {
    const history = getHistory(sessionId);
    const historyLength = history.length;

    try {
      return await runGeminiAgent({ merchantId, sessionId, message, mode, signal });
    } catch (error) {
      history.splice(historyLength);
      signal?.throwIfAborted();
      console.warn('Gemini shopping request failed; using catalog fallback:', error.message);
      return runCatalogFallback({ merchantId, message, reason: 'unavailable', mode });
    }
  }

  return runCatalogFallback({ merchantId, message, mode });
}
