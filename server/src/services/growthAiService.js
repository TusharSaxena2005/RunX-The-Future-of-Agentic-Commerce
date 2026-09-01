import { prisma } from '../db.js';
import { getRecordedSales } from './reportingService.js';
import { DEFAULT_MODEL, textFromParts } from './aiShared.js';

function safeJsonParse(text) {
  const raw = String(text || '').trim();
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const candidates = [cleaned];

  const objectStart = cleaned.indexOf('{');
  const arrayStart = cleaned.indexOf('[');

  if (objectStart >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = objectStart; i < cleaned.length; i += 1) {
      const char = cleaned[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          candidates.push(cleaned.slice(objectStart, i + 1));
          break;
        }
      }
    }
  }

  if (arrayStart >= 0) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = arrayStart; i < cleaned.length; i += 1) {
      const char = cleaned[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === '[') {
        depth += 1;
      } else if (char === ']') {
        depth -= 1;
        if (depth === 0) {
          candidates.push(cleaned.slice(arrayStart, i + 1));
          break;
        }
      }
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next extracted candidate.
    }
  }

  throw new Error('Gemini returned invalid JSON.');
}

function normalizeStrategyType(type) {
  const value = String(type || '').toUpperCase().replace(/[- ]/g, '_');
  if (value === 'CROSS_SELL') return 'CROSS_SELL';
  if (value === 'HIGH_CONVERSION') return 'HIGH_CONVERSION';
  if (value === 'CART_RECOVERY') return 'CART_RECOVERY';
  if (value === 'BOUNDED_DISCOUNT') return 'BOUNDED_DISCOUNT';
  return 'CROSS_SELL';
}

function clampInt(value, min = 0, max = 100000000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function buildLocalGrowthOpportunities({ products, relations, events, abandonedCarts }) {
  const opportunities = [];
  const paidEvents = events.filter((event) => event.converted);
  const aiEvents = paidEvents.filter((event) => event.aiAttributed);
  const directEvents = paidEvents.filter((event) => !event.aiAttributed);

  const relationByFrom = new Map();
  for (const relation of relations) {
    const list = relationByFrom.get(relation.fromProductId) || [];
    list.push(relation);
    relationByFrom.set(relation.fromProductId, list);
  }

  for (const product of products) {
    const related = (relationByFrom.get(product.id) || [])
      .filter((item) => item.score >= 0.55)
      .sort((a, b) => b.score - a.score);

    if (related.length) {
      const top = related[0];
      const target = products.find((item) => item.id === top.toProductId);
      if (target) {
        const estimatedConversions = clampInt(
          product.popularity * target.conversionRate * 100,
          2,
          35
        );
        opportunities.push({
          type: 'CROSS_SELL',
          name: `${product.name} → ${target.name} cross-sell`,
          description:
            `Customers showing interest in ${product.name} have a strong catalog relationship with ${target.name}. ` +
            `Recommend ${target.name} after the primary product is selected to improve basket value.`,
          affectedProductIds: [product.id, target.id],
          conversions: estimatedConversions,
          additionalRevenue: clampInt(estimatedConversions * target.price * 0.55),
          confidence: Math.min(0.98, Math.max(0.62, top.score)),
          evidence: [`Catalog relationship score ${top.score.toFixed(2)}`, `Target conversion rate ${(target.conversionRate * 100).toFixed(1)}%`]
        });
      }
    }
  }

  const topConversion = [...products].sort((a, b) => b.conversionRate - a.conversionRate)[0];
  if (topConversion) {
    opportunities.push({
      type: 'HIGH_CONVERSION',
      name: `Prioritize ${topConversion.name} when intent matches`,
      description:
        `${topConversion.name} has the strongest catalog conversion rate at ${(topConversion.conversionRate * 100).toFixed(1)}%. ` +
        `When multiple products satisfy the same customer intent, bias recommendations toward this product while respecting price and relevance constraints.`,
      affectedProductIds: [topConversion.id],
      conversions: clampInt(topConversion.conversionRate * 100, 2, 25),
      additionalRevenue: clampInt(topConversion.price * topConversion.conversionRate * 30),
      confidence: 0.74,
      evidence: [`Catalog conversion rate ${(topConversion.conversionRate * 100).toFixed(1)}%`, `Popularity ${(topConversion.popularity * 100).toFixed(0)}%`]
    });
  }

  if (abandonedCarts > 0) {
    opportunities.push({
      type: 'CART_RECOVERY',
      name: 'Recover abandoned carts',
      description:
        `${abandonedCarts} cart session${abandonedCarts === 1 ? '' : 's'} are marked as abandoned. ` +
        `Create a reminder flow for these shoppers and prioritize high-value carts first.`,
      affectedProductIds: [],
      conversions: clampInt(abandonedCarts * 0.22, 1, 50),
      additionalRevenue: clampInt(abandonedCarts * 0.22 * 1800),
      confidence: 0.7,
      evidence: [`Abandoned carts: ${abandonedCarts}`]
    });
  }

  if (aiEvents.length && directEvents.length) {
    const aiRevenue = aiEvents.reduce((sum, event) => sum + event.revenue, 0);
    const directRevenue = directEvents.reduce((sum, event) => sum + event.revenue, 0);
    const aiAov = aiEvents.length ? aiRevenue / aiEvents.length : 0;
    const directAov = directEvents.length ? directRevenue / directEvents.length : 0;

    if (aiAov > directAov * 1.03) {
      opportunities.push({
        type: 'HIGH_CONVERSION',
        name: 'Scale the AI-assisted selling pattern',
        description:
          `AI-assisted orders currently average ₹${Math.round(aiAov).toLocaleString('en-IN')} versus ` +
          `₹${Math.round(directAov).toLocaleString('en-IN')} on direct orders. ` +
          `Expand the successful conversational recommendation pattern to more matching products.`,
        affectedProductIds: [],
        conversions: clampInt(aiEvents.length * 0.12, 1, 50),
        additionalRevenue: clampInt((aiAov - directAov) * Math.max(1, aiEvents.length)),
        confidence: 0.78,
        evidence: [
          `AI AOV ₹${Math.round(aiAov).toLocaleString('en-IN')}`,
          `Direct AOV ₹${Math.round(directAov).toLocaleString('en-IN')}`
        ]
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of opportunities) {
    const key = `${item.type}:${item.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped
    .sort((a, b) => (b.additionalRevenue * b.confidence) - (a.additionalRevenue * a.confidence))
    .slice(0, 6);
}

async function generateAiGrowthOpportunities(snapshot) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const systemInstruction = [
    'You are the autonomous Merchant Growth Agent for RunX Sports.',
    'Analyze the supplied commerce data and discover revenue opportunities yourself; do not merely repeat predefined strategy labels.',
    'Look for cross-sell gaps, products with unusually strong conversion, abandoned-cart signals, and differences between AI-assisted and direct sales.',
    'Only recommend strategies supported by the supplied data. Never invent sales figures, prices, products, or conversions.',
    'Return JSON only with this exact top-level shape: {"opportunities":[...]}',
    'Each opportunity must contain: type, name, description, affectedProductIds, conversions, additionalRevenue, confidence, evidence.',
    'type must be one of CROSS_SELL, HIGH_CONVERSION, CART_RECOVERY, BOUNDED_DISCOUNT.',
    'conversions and additionalRevenue are estimates, not facts. Keep them conservative and explain the evidence.',
    'Return at most 5 opportunities and prioritize opportunities with clear evidence and actionable merchant impact.'
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const requestGrowthAnalysis = async ({ retry = false } = {}) => {
    const response = await fetch(endpoint, {
      method: 'POST',
        signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: 'user',
            parts: [{
              text: `Analyze this RunX Sports snapshot and discover the strongest growth opportunities:\n${JSON.stringify(snapshot)}`
            }]
          }
        ],
        generationConfig: {
          temperature: retry ? 0 : 0.2,
          // Structured responses can be cut off mid-JSON when this budget is too
          // small. The previous 1,800-token cap caused intermittent parse errors.
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              opportunities: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    type: {
                      type: 'STRING',
                      enum: [
                        'CROSS_SELL',
                        'HIGH_CONVERSION',
                        'CART_RECOVERY',
                        'BOUNDED_DISCOUNT'
                      ]
                    },
                    name: { type: 'STRING' },
                    description: { type: 'STRING' },
                    affectedProductIds: {
                      type: 'ARRAY',
                      items: { type: 'STRING' }
                    },
                    conversions: { type: 'NUMBER' },
                    additionalRevenue: { type: 'NUMBER' },
                    confidence: { type: 'NUMBER' },
                    evidence: {
                      type: 'ARRAY',
                      items: { type: 'STRING' }
                    }
                  },
                  required: [
                    'type',
                    'name',
                    'description',
                    'affectedProductIds',
                    'conversions',
                    'additionalRevenue',
                    'confidence',
                    'evidence'
                  ]
                }
              }
            },
            required: ['opportunities']
          }
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `Gemini growth analysis failed with status ${response.status}`);
    }

    const candidate = data?.candidates?.[0];
    const text = textFromParts(candidate?.content?.parts || []);
    if (!text) {
      if (!retry) return null;
      throw new Error(`Gemini returned no growth analysis${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}.`);
    }

    try {
      return safeJsonParse(text);
    } catch (error) {
      if (!retry) return null;
      const finishReason = candidate?.finishReason;
      throw new Error(
        finishReason === 'MAX_TOKENS'
          ? 'Gemini growth analysis was truncated before the JSON was complete.'
          : error.message
      );
    }
  };

  // Retry once with deterministic generation. This preserves AI analysis for a
  // transient malformed response while the caller still retains its local-data fallback.
  const parsed = (await requestGrowthAnalysis()) || (await requestGrowthAnalysis({ retry: true }));
  if (!Array.isArray(parsed?.opportunities)) {
    throw new Error('Gemini growth response did not contain opportunities.');
  }

  return parsed.opportunities.map((item) => ({
    type: normalizeStrategyType(item.type),
    name: String(item.name || 'AI-discovered opportunity').slice(0, 120),
    description: String(item.description || 'Opportunity identified from current commerce data.').slice(0, 500),
    affectedProductIds: Array.isArray(item.affectedProductIds) ? item.affectedProductIds.filter(Boolean).slice(0, 10) : [],
    conversions: clampInt(item.conversions, 0, 100000),
    additionalRevenue: clampInt(item.additionalRevenue, 0, 100000000),
    confidence: Math.min(1, Math.max(0, Number(item.confidence) || 0)),
    evidence: Array.isArray(item.evidence) ? item.evidence.map(String).slice(0, 5) : []
  }));
}

export async function getMerchantGrowth(merchantId, { analyze = false } = {}) {
  const [{ salesEvents: events }, products, relations, abandonedCarts, existingStrategies] = await Promise.all([
    getRecordedSales(merchantId),
    prisma.product.findMany({ where: { merchantId, active: true }, orderBy: { conversionRate: 'desc' } }),
    prisma.productRelation.findMany({
      where: {
        fromProduct: { merchantId }
      },
      select: {
        fromProductId: true,
        toProductId: true,
        score: true
      }
    }),
    prisma.cart.count({ where: { merchantId, abandonedAt: { not: null } } }),
    prisma.growthStrategy.findMany({ where: { merchantId }, orderBy: { status: 'asc' } })
  ]);

  const mid = Math.floor(events.length / 2);
  const before = events.slice(0, mid);
  const after = events.slice(mid);
  const sum = (rows) => rows.reduce((total, event) => total + event.revenue, 0);
  const avg = (rows) => rows.length
    ? Math.round(rows.reduce((total, event) => total + (event.aov || 0), 0) / rows.length)
    : 0;

  const snapshot = {
    period: {
      eventCount: events.length,
      abandonedCarts,
      beforeRevenue: sum(before),
      beforeAov: avg(before),
      afterRevenue: sum(after),
      afterAov: avg(after)
    },
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      popularity: product.popularity,
      conversionRate: product.conversionRate
    })),
    relationships: relations,
    sales: events.map((event) => ({
      channel: event.channel,
      revenue: event.revenue,
      aov: event.aov,
      aiAttributed: event.aiAttributed,
      upsellRevenue: event.upsellRevenue,
      converted: event.converted
    }))
  };

  const localOpportunities = buildLocalGrowthOpportunities({
    products,
    relations,
    events,
    abandonedCarts
  });

  let opportunities = [];
  let analysisSource = 'saved-analysis';
  let analysisMessage = 'Showing the latest saved growth analysis. Click Run AI Growth Analysis to generate a fresh AI analysis.';

  if (analyze) {
    opportunities = localOpportunities;
    analysisSource = 'local-data-analysis';
    analysisMessage = 'Generated from live PostgreSQL commerce data.';
  }

  if (analyze && process.env.GEMINI_API_KEY) {
    try {
      const aiOpportunities = await generateAiGrowthOpportunities(snapshot);
      if (aiOpportunities.length) {
        opportunities = aiOpportunities;
        analysisSource = 'gemini-autonomous-analysis';
        analysisMessage = 'Gemini analyzed the current catalog and sales signals and generated these opportunities.';
      }
    } catch (error) {
      analysisSource = 'local-data-analysis';
      console.warn('Gemini growth analysis failed:', error);
      analysisMessage = 'AI analysis could not be completed, so live database insights are being shown instead.';
    }
  }

  const currentNames = new Set(
    existingStrategies
      .filter((strategy) => strategy.status === 'ACTIVE')
      .map((strategy) => strategy.name)
  );

  const created = [];
  if (analyze) {
    await prisma.growthStrategy.deleteMany({
      where: {
        merchantId,
        status: 'PROPOSED'
      }
    });
  }

  for (const opportunity of opportunities) {
    if (!analyze || currentNames.has(opportunity.name)) continue;
    const strategy = await prisma.growthStrategy.create({
      data: {
        merchantId,
        type: opportunity.type,
        name: opportunity.name,
        description: opportunity.description,
        affectedProductIds: opportunity.affectedProductIds,
        status: 'PROPOSED',
        conversions: 0,
        attributedRevenue: 0,
        estimatedConversions: opportunity.conversions,
        estimatedRevenue: opportunity.additionalRevenue,
        evidence: opportunity.evidence,
        confidence: opportunity.confidence
      }
    });
    created.push({
      ...strategy,
      confidence: opportunity.confidence,
      evidence: opportunity.evidence
    });
  }

  const active = existingStrategies.filter((strategy) => strategy.status === 'ACTIVE');

  const savedProposed = existingStrategies.filter((strategy) => strategy.status === 'PROPOSED');
  return {
    measurementNote: 'Earlier/later halves of recorded events, not a controlled before/after experiment. Forecasts are unvalidated estimates. Strategy attribution can overlap and must not be summed.',
    before: { revenue: sum(before), aov: avg(before) },
    after: { revenue: sum(after), aov: avg(after) },
    analysisSource,
    analysisMessage,
    lastAnalyzedAt: analyze ? new Date().toISOString() : null,
    strategies: analyze
      ? [...created, ...active]
      : [...savedProposed, ...active]
  };
}
