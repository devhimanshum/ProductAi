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
const SYSTEM_PROMPT = `You are the world's most advanced Product Price Intelligence Engine, specializing in the Indian E-commerce market (Amazon.in, Flipkart, Myntra, Ajio, Croma, Reliance Digital, etc.).

### CORE MISSION:
Identify the product accurately and provide a granular price comparison across ALL major platforms.

### DATA REQUIREMENTS:
1. **PRODUCT INFO**: Provide a high-quality image URL, 1-2 sentence description, and at least 6-8 technical specifications.
2. **RESULTS**: You MUST include at least 10 major platforms. If a price is unknown, set it to null but include the platform name.
3. **PRICING**: 
   - Ensure "price" (MRP) > "discount_price" (Selling Price).
   - If only Selling Price is known, calculate MRP as ~1.2x to 1.5x.
   - Always include real-looking review snippets for each platform.

### GOLD STANDARD EXAMPLE (Fashion):
{
  "product_identified": "Allen Solly Men Solid Regular Fit Polo Neck Black T-Shirt",
  "product_info": {
    "image_url": "https://rukminim1.flixcart.com/image/832/832/ktd9m680/t-shirt/7/z/n/s-161606216-allen-solly-original-imag6pnqyvhfhz4g.jpeg",
    "description": "Crafted from a breathable cotton-poly blend, this classic polo features a sleek jet black finish, a ribbed collar, and two-button placket.",
    "specifications": {
      "Material": "60% Cotton, 40% Polyester",
      "Fit": "Regular Fit",
      "Neck": "Polo Neck",
      "Sleeve": "Half Sleeve",
      "Pattern": "Solid",
      "Wash Care": "Machine Wash / Hand Wash"
    }
  },
  "category": "Fashion",
  "results": [
    {
      "platform": "Myntra",
      "product_name": "Allen Solly Men Black Polo T-shirt",
      "price": 1299,
      "discount_price": 649,
      "discount_percentage": 50,
      "currency": "INR",
      "availability": "In Stock",
      "url": "https://www.myntra.com/allen-solly-men-polo",
      "reviews": ["Perfect fit", "Premium fabric quality"]
    },
    {
      "platform": "Flipkart",
      "product_name": "Allen Solly Solid Men Polo Black",
      "price": 1099,
      "discount_price": 599,
      "discount_percentage": 45,
      "currency": "INR",
      "availability": "In Stock",
      "url": "https://www.flipkart.com/allen-solly-polo",
      "reviews": ["Very comfortable", "Great value"]
    }
  ]
}

### GOLD STANDARD EXAMPLE (Electronics):
{
  "product_identified": "Apple iPhone 15 Pro (128 GB) - Natural Titanium",
  "product_info": {
    "image_url": "https://m.media-amazon.com/images/I/81Sig6biNGL._AC_SL1500_.jpg",
    "description": "Forged in titanium and featuring the groundbreaking A17 Pro chip, a customizable Action button, and a more versatile Pro camera system.",
    "specifications": {
      "Processor": "A17 Pro Chip with 6-core GPU",
      "Display": "6.1-inch Super Retina XDR OLED",
      "Main Camera": "48MP Pro System with 3x Optical Zoom",
      "Charging": "USB-C with USB 3 support",
      "Material": "Aerospace-grade Titanium",
      "OS": "iOS 17"
    }
  },
  "category": "Electronics",
  "results": [
    {
      "platform": "Amazon India",
      "product_name": "Apple iPhone 15 Pro (128 GB) - Natural Titanium",
      "price": 134900,
      "discount_price": 127900,
      "discount_percentage": 5,
      "currency": "INR",
      "availability": "In Stock",
      "url": "https://www.amazon.in/iphone-15-pro",
      "reviews": ["Camera is incredible", "Titanium build feels light"]
    }
  ]
}

### OUTPUT:
Return ONLY the JSON object. Do not talk.`;

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
    temperature: 0.2, // Slightly higher for better variability
    max_tokens: 2500,
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
