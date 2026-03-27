/**
 * server.js — ProductAI Backend Entry Point
 * Express server with CORS, JSON parsing, and route mounting.
 */

const path    = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const express = require("express");
const cors    = require("cors");

const compareRoute = require("./routes/compare");
const tokensRoute  = require("./routes/tokens");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Request Logger (dev-friendly) ───────────────────────────────────────────
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/compare", compareRoute);
app.use("/api/tokens",  tokensRoute);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "1.0.0",
    model: process.env.OPENAI_MODEL || "gpt-4o",
    timestamp: new Date().toISOString(),
  });
});

// ── Serve Static Frontend (Updated for Root Structure) ──────────────────────
const frontendPath = path.join(__dirname, "..");
app.use(express.static(frontendPath));

// ── Catch-all to serve index.html (SPA) ──────────────────────────────────────
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API route not found" });
  }
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[ERROR]", err.stack);
  res.status(500).json({ error: "Unexpected server error", message: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  ProductAI backend running at http://localhost:${PORT}`);
  console.log(`   Model: ${process.env.OPENAI_MODEL || "gpt-4o"}`);
  console.log(`   API Key: ${process.env.OPENAI_API_KEY ? "✓ loaded" : "✗ MISSING — set OPENAI_API_KEY in .env"}\n`);
});
