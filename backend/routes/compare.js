/**
 * compare.js — POST /api/compare
 * Validates input, calls OpenAI service, returns structured results + token usage.
 */

const express  = require("express");
const router   = express.Router();
const { compareProduct } = require("../../api/services/openai");

router.post("/", async (req, res) => {
  const { productUrl, productName } = req.body;

  // ── Validation ──────────────────────────────────────────────────────────
  if (!productUrl && !productName) {
    return res.status(400).json({
      error: "Validation failed",
      message: "Provide at least one of: productUrl or productName.",
    });
  }

  const trimmedUrl  = productUrl?.trim()  || null;
  const trimmedName = productName?.trim() || null;

  if (trimmedUrl && trimmedUrl.length > 2048) {
    return res.status(400).json({ error: "productUrl exceeds maximum length of 2048 characters." });
  }
  if (trimmedName && trimmedName.length > 300) {
    return res.status(400).json({ error: "productName exceeds maximum length of 300 characters." });
  }

  // ── Call OpenAI ──────────────────────────────────────────────────────────
  try {
    const data = await compareProduct(trimmedUrl, trimmedName);
    console.log(`[Backend] Results for "${data.productIdentified}": ${data.results.length} platforms. Image: ${data.productInfo?.image_url || 'None'}`);
    
    return res.json({
      success: true,
      productIdentified: data.productIdentified,
      productInfo: data.productInfo,
      category: data.category,
      results: data.results,
      usage: data.usage,
    });
  } catch (err) {
    console.error("[/api/compare] OpenAI error:", err.message);

    // Surface meaningful errors to the client
    if (err.status === 401) {
      return res.status(401).json({ error: "Invalid OpenAI API key. Check your .env file." });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: "OpenAI rate limit exceeded. Please wait a moment." });
    }
    if (err.code === "insufficient_quota") {
      return res.status(402).json({ error: "OpenAI quota exhausted. Add billing credits." });
    }

    return res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

module.exports = router;
