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

const SYSTEM_PROMPT = `You are a High-Precision Product Intelligence Engine.
${isVercel ? "STRICT LIMIT: Provide the top 6-8 major Indian platforms only." : "Provide 10+ major Indian platforms."}

### RULE 1: IDENTITY FIRST (MANDATORY)
You must analyze the user's input (URL or Name) with extreme care. 
- DO NOT return a different model, a different version, or a 'similar' product.
- If the user asks for a 'Blue' shirt, do not return 'Red'.
- If the user asks for 'iPhone 15', do not return 'iPhone 14'.

### RULE 2: DATA GROUNDING
- Use your internal knowledge to find the EXACT MRP and Selling Price for the Indian market for THIS SPECIFIC product.
- Specifications must be 100% accurate to this specific model.

### GOLD STANDARD JSON STRUCTURE:
{
  "product_identified": "Exact Official Brand + Model + Variant Name",
  "product_info": {
    "image_url": "High-quality direct image link (.jpg/.png) relative to this EXACT product",
    "description": "Accurate 1-sentence technical description.",
    "specifications": { "Mandatory": "At least 6 specific technical details" }
  },
  "category": "Electronics | Fashion | Beauty | Home",
  "results": [
    {
      "platform": "Amazon.in",
      "product_name": "Full title as it appears on platform",
      "price": 0, // MRP
      "discount_price": 0, // Current Selling Price
      "currency": "INR",
      "url": "Search or Direct Link",
      "reviews": ["Real-sounding feedback 1", "Real-sounding feedback 2"]
    }
  ]
}

### OUTPUT:
Return ONLY the JSON object. Zero conversation.`;

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
