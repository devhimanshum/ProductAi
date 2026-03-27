/**
 * tokens.js — GET /api/tokens
 * Returns token usage history and cumulative totals from the in-memory store.
 */

const express    = require("express");
const router     = express.Router();
const tokenStore = require("../services/tokenStore");

router.get("/", (req, res) => {
  const entries = tokenStore.getAll();
  const totals  = tokenStore.getTotals();

  res.json({
    success: true,
    totals,
    entries,
  });
});

module.exports = router;
