/**
 * openai.js
 * Service layer for OpenAI API calls.
 * Handles prompt engineering, response parsing, and token tracking.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const OpenAI = require("openai");
const tokenStore = require("./tokenStore");

// Lazy client — created on first call so server boots without a key
let _client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set. Add it to backend/.env");
  }
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}
const MODEL = process.env.OPENAI_MODEL || "gpt-4o";

// ── Cost per 1M tokens (USD) — update these if OpenAI changes pricing ──────
const PRICING = {
  "gpt-4o":       { input: 5.00,  output: 15.00 },
  "gpt-4o-mini":  { input: 0.15,  output: 0.60  },
  "gpt-3.5-turbo":{ input: 0.50,  output: 1.50  },
};

function estimateCost(model, promptTokens, completionTokens) {
  const p = PRICING[model] || PRICING["gpt-4o"];
  return (
    (promptTokens / 1_000_000) * p.input +
    (completionTokens / 1_000_000) * p.output
  );
}

// ── System Prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the world's most advanced Product Price Intelligence Engine. Your specialty is the Indian E-commerce ecosystem (Amazon.in, Flipkart, Myntra, Tata CLiQ, Ajio, etc.).

### CORE MISSION:
Identify the product and provide HIGHLY ACCURATE, REAL-TIME style pricing. You must provide the "Market Price" (MRP), the "Discounted Price" (Selling Price), and the "Discount Percentage".

### PRICING LOGIC RULES:
1. **MRP vs Selling Price**: In the Indian market, almost every product is sold below MRP.
2. **Platform Specifics**: 
   - Myntra/Ajio usually have 40-70% discounts on fashion.
   - Flipkart/Amazon usually have 10-30% discounts on electronics.
   - Tata CLiQ usually has premium-tier discounts (15-40%).
3. **Calculation**: If you find a selling price but not the MRP, estimate the MRP based on 1.2x to 2x the selling price. Ensure: Selling Price + Discount = MRP.

### OUTPUT SCHEMA (STRICT JSON):
{
  "product_identified": "Full official product name",
  "product_info": {
    "image_url": "Direct .jpg/.png link from Amazon/Flipkart/Myntra if known, otherwise use a high-quality placeholder like 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=300' depending on category",
    "description": "Brief 1-2 sentence overview of the product",
    "specifications": {
      "Brand": "...",
      "Model": "...",
      "Color": "...",
      "Features": "..."
    }
  },
  "category": "Electronics | Fashion | Beauty | etc.",
  "results": [
    {
      "platform": "Platform Name",
      "product_name": "Title on site",
      "price": 1999,   // This is the MRP (higher price)
      "discount_price": 999, // This is the Selling Price (lower price)
      "discount_percentage": 50, // This is the % off
      "currency": "INR",
      "availability": "In Stock",
      "url": "Search URL",
      "reviews": ["High quality", "Good fit"]
    }
  ]
}

### DATA INTEGRITY:
- **MANDATORY**: You MUST include the "product_info" block with a valid "image_url" and at least 5 "specifications".
- If an exact image URL is unknown, use a high-quality representative image URL from a public CDN or a common e-commerce search image.
- Always include at least 10 major Indian platforms.
- If a product is NOT available on a platform, set price and discount_price to null.
- Provide 2 real-sounding review snippets per result.
- Your output must be ONLY the JSON object. Do not explain.`;

/**
 * Compare prices for a given product across e-commerce platforms.
 * @param {string} productUrl     - Optional product page URL
 * @param {string} productName    - Optional product name / description
 * @returns {Promise<{productIdentified, category, results, usage}>}
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
    temperature: 0.1, // Even lower for maximum consistency
    max_tokens: 3000,
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
  if (productUrl && productName) {
    return `Product URL: ${productUrl}\nProduct Name Hint: ${productName}\n\nIdentify this product and find prices across all 15+ platforms.`;
  }
  if (productUrl) {
    return `Product URL: ${productUrl}\n\nExtract the product from this URL and find prices across all 15+ platforms.`;
  }
  return `Product Name: ${productName}\n\nFind prices for this product across all 15+ platforms.`;
}

module.exports = { compareProduct };
