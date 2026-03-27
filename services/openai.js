/**
 * openai.js
 * Service layer for OpenAI API calls.
 * Handles prompt engineering, response parsing, and token tracking.
 */

if (process.env.NODE_ENV !== 'production') {
  require("dotenv").config();
}
const OpenAI = require("openai");
const tokenStore = require("./tokenStore");

// Lazy client — created on first call so server boots without a key
let _client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing. Please add it to your environment variables (Vercel Settings -> Environment Variables).");
  }
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ── Cost per 1M tokens (USD) ────────────────────────────────────────────────
const PRICING = {
  "gpt-4o":       { input: 5.00,  output: 15.00 },
  "gpt-4o-mini":  { input: 0.15,  output: 0.60  },
};

function estimateCost(model, promptTokens, completionTokens) {
  const p = PRICING[model] || PRICING["gpt-4o-mini"];
  return (
    (promptTokens / 1_000_000) * p.input +
    (completionTokens / 1_000_000) * p.output
  );
}

// ── System Prompt ────────────────────────────────────────────────────────────
const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL;

const SYSTEM_PROMPT = `You are the Product Intelligence Engine 2.0.
Your results MUST be grounded in the Indian Market (2024-2026).

### RECENT MARKET BENCHMARKS (Grounded Truth):
- Fashion (e.g. Allen Solly): Selling Price ₹600-900 | MRP ₹1099-1499.
- Premium Tech (e.g. iPhone 15 Pro Max 256GB): Selling Price ₹1,34,900 - ₹1,59,900.
- Use these scales for ALL similar category items.

### IDENTITY PROTOCOL:
1. Identify the EXACT model/variant. No generic results.
2. If the user input is a URL, extract the platform and specific item first.

### SITE-SPECIFIC URL TEMPLATES:
- Amazon.in: https://www.amazon.in/s?k=[encoded_query]
- Flipkart: https://www.flipkart.com/search?q=[encoded_query]
- Myntra: https://www.myntra.com/[query-with-hyphens]
- Reliance Digital: https://www.reliancedigital.in/search?q=[encoded_query]

### DATA QUALITY:
- MRP MUST be >= Selling Price.
- Include at least 8 PLATFORMS for Tech and 12 PLATFORMS for Fashion.
- Image URLs must be high-resolution or from a known platform CDN.

### GOLD STANDARD RESPONSE:
{
  "product_identified": "Brand + Model + Full Spec",
  "product_info": {
    "image_url": "Direct CDN Link",
    "description": "Premium 1-sentence technical overview.",
    "specifications": { "Key 1": "Val 1", "Key 2": "Val 2", "..." : "..." }
  },
  "category": "Fashion | Tech | Home | Beauty",
  "results": [
    {
      "platform": "...",
      "product_name": "...",
      "price": 0, // MRP
      "discount_price": 0, // Selling
      "currency": "INR",
      "url": "Standardized URL",
      "reviews": ["Real feedback 1", "Real feedback 2"]
    }
  ]
}

### OUTPUT:
Return ONLY the JSON. No explanation.`;

/**
 * Compare prices for a given product across e-commerce platforms.
 */
async function compareProduct(productUrl, productName) {
  const userInput = buildUserInput(productUrl, productName);
  const maxTokens = isVercel ? 1200 : 2500;

  const response = await getClient().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userInput },
    ],
    temperature: 0.1,
    max_tokens: maxTokens,
  });

  const raw = response.choices[0].message.content;
  const parsed = JSON.parse(raw);

  const usage = response.usage;
  const promptTokens     = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens      = usage.total_tokens;
  const estimatedCostUSD = estimateCost(MODEL, promptTokens, completionTokens);

  tokenStore.add({
    productQuery: productName || productUrl || "unknown",
    model: MODEL,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUSD,
  });

  return {
    productIdentified: parsed.product_identified || "Unknown Product",
    productInfo: parsed.product_info || null,
    category: parsed.category || "Other",
    results: parsed.results || [],
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUSD,
      model: MODEL,
    },
  };
}

function buildUserInput(productUrl, productName) {
  if (productUrl && productName) return `Product URL: ${productUrl}\nProduct Name: ${productName}`;
  if (productUrl) return `Product URL: ${productUrl}`;
  return `Product Name: ${productName}`;
}

module.exports = { compareProduct };
