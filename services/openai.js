/**
 * openai.js
 * Service layer for OpenAI API calls.
 * Handles prompt engineering, response parsing, and token tracking.
 */

if (process.env.NODE_ENV !== 'production') {
  require("dotenv").config();
}
const OpenAI = require("openai");
const axios  = require("axios");
const cheerio = require("cheerio");
const tokenStore = require("./tokenStore");
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

const SYSTEM_PROMPT = `You are the Product Intelligence Engine 4.0.
Your primary task is to extract exact pricing from the provided "LIVE PAGE DATA".

### ALGORITHM & STRICT RULES:
1. Identify the EXACT model/variant from the input.
2. SOURCE PLATFORM PRICE: You MUST extract the exact MRP and Selling Price from the "LIVE PAGE DATA" text. E.g., if the text says "1,34,999 ₹1,09,999", the MRP is 134999 and the strictly accurate Selling Price is 109999. NEVER guess the source platform price if text is available.
3. MULTI-PLATFORM REQUIREMENT (CRITICAL MANDATE): You MUST return exactly 8 to 10 prominent platforms in the \`results\` array (e.g. Amazon.in, Flipkart, Myntra, Reliance Digital, Croma, Tata CLiQ, Vijay Sales). If you only return 1, you fail.
4. COMPARABLE PRICING: For the other platforms, estimate their price to be within +/- 2% to 5% of the exact scraped source platform price. Do NOT hallucinate wild price differences.

### RECENT MARKET BENCHMARKS (Grounded Truth):
- Fashion (e.g. Allen Solly): Selling Price ₹600-900 | MRP ₹1099-1499.
- Premium Tech (e.g. iPhone 15 Pro Max 256GB): Selling Price ₹1,34,900 - ₹1,59,900.
- Premium Watches: Rely heavily on LIVE PAGE DATA.

### IDENTITY PROTOCOL:
1. Identify the EXACT model/variant. No generic results.
2. STRICT REQUIREMENT: You MUST return data for AT LEAST 8 major Indian e-commerce platforms.
3. If search is vague, assume the most popular variant.

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
  const scrapedData = productUrl ? await scrapeUrl(productUrl) : "";
  const userInput = buildUserInput(productUrl, productName, scrapedData);
  
  // If scraper failed/blocked, add a fallback hint
  const finalPrompt = scrapedData 
    ? SYSTEM_PROMPT 
    : `${SYSTEM_PROMPT}\n\n[NOTICE: LIVE PAGE DATA is empty (Scraper Blocked). You MUST rely on your internal MARKET BENCHMARKS for the source platform price.]`;

  const maxTokens = isVercel ? 1200 : 2500;

  const response = await getClient().chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: finalPrompt },
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

async function scrapeUrl(url) {
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 3500
    });
    const $ = cheerio.load(data);
    const title = $('title').text().trim();
    const ogImage = $('meta[property="og:image"]').attr('content') || $('link[rel="image_src"]').attr('href') || '';
    $('script, style, noscript, svg, img, iframe').remove();
    const textSnippet = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 4000); 
    return `\n\n--- LIVE PAGE DATA ---\nTitle: ${title}\nMain Image URL: ${ogImage}\nPage Content: ${textSnippet}\n----------------------\n`;
  } catch (err) {
    console.warn(`[Scraper] Failed/Blocked for ${url}:`, err.message);
    return "";
  }
}

function buildUserInput(productUrl, productName, scrapedData) {
  let input = "";
  if (productUrl) {
    input += `Product URL: ${productUrl}\n`;
    input += scrapedData;
  }
  if (productName) {
    input += `Product Name: ${productName}\n`;
  }
  return input;
}

module.exports = { compareProduct };
