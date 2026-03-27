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

// ── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a high-speed Product Price Intelligence Engine for India. 
${isVercel ? "LIMIT: Provide the top 8 major platforms only for maximum speed." : "Provide 10+ major platforms."}

### MISSION:
Provide high-accuracy pricing (MRP vs Selling Price), 6+ technical specs, and a direct image URL.

### GOLD STANDARD BLUEPRINT:
{
  "product_identified": "Allen Solly Men Solid Black Polo",
  "product_info": {
    "image_url": "https://rukminim1.flixcart.com/image/832/832/ktd9m680/t-shirt/7/z/n/s-161606216-allen-solly-original-imag6pnqyvhfhz4g.jpeg",
    "description": "Premium cotton-blend polo with a solid finish and regular fit.",
    "specifications": { "Material": "60% Cotton", "Fit": "Regular", "Sleeve": "Half" }
  },
  "category": "Fashion",
  "results": [
    { "platform": "Myntra", "price": 1299, "discount_price": 649, "url": "...", "reviews": ["Good fit"] }
  ]
}

### OUTPUT:
Return ONLY the JSON object. Do not talk.`;

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
