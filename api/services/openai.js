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
const SYSTEM_PROMPT = `You are the world's most advanced Product Price Intelligence Engine. Your specialty is the Indian E-commerce ecosystem.

### CORE MISSION:
Identify the product and provide HIGHLY ACCURATE pricing, detailed specifications, and representative images.

### PRICING & DISCOUNT LOGIC:
1. **MRP vs Selling Price**: In India, products have an MRP (higher) and a Selling Price (lower). You MUST provide both.
2. **Platform Specifics**: Amazon/Flipkart (10-30% off), Myntra/Ajio (40-70% off).
3. **Calculations**: Estimate MRP as 1.2x to 1.5x of Selling Price if unknown.

### SPECIFICATION BLUEPRINTS (MANDATORY):
You MUST provide at least 8 granular specifications.
- FASHION: "Fabric: 60% Cotton, 40% Polyester", "Fit: Regular Fit", "Neck: Polo Neck", "Sleeve: Half Sleeve", "Pattern: Solid", "Closure: Button".
- ELECTRONICS: "Processor", "RAM", "Storage", "Display", "Battery", "OS", "Model Number".

### GOLD STANDARD REFERENCE (Allen Solly Polo):
{
  "product_identified": "Allen Solly Men Jet Black Regular Fit Polo",
  "product_info": {
    "image_url": "https://rukminim1.flixcart.com/image/832/832/ktd9m680/t-shirt/7/z/n/s-161606216-allen-solly-original-imag6pnqyvhfhz4g.jpeg",
    "description": "A premium casual polo t-shirt crafted from a breathable cotton blend, featuring a classic band collar and a sophisticated solid finish.",
    "specifications": {
      "Material": "60% Cotton, 40% Polyester",
      "Fit": "Regular Fit",
      "Neck": "Polo Neck / Band Collar",
      "Sleeve": "Half Sleeve",
      "Pattern": "Solid",
      "Closure": "Button",
      "Occasion": "Casual / Semi-Formal",
      "Wash Care": "Machine Wash"
    }
  },
  "category": "Fashion",
  "results": [...]
}

### OUTPUT:
Return ONLY the JSON object. No conversation.`;

/**
 * Compare prices for a given product across e-commerce platforms.
 */
async function compareProduct(productUrl, productName) {
  const userInput = buildUserInput(productUrl, productName);

  const response = await getClient().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user",   content: userInput },
    ],
    temperature: 0.1,
    max_tokens: 2000,
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
