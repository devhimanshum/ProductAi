const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../../db.json");

/**
 * Initialize the DB file if it doesn't exist.
 */
function initDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
  }
}

/**
 * Load all token entries from the JSON file.
 */
function getAll() {
  initDb();
  try {
    const data = fs.readFileSync(DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Failed to read db.json:", err);
    return [];
  }
}

/**
 * Add a new token usage entry.
 */
function add(entry) {
  const tokenLog = getAll();
  tokenLog.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(tokenLog, null, 2));
    return true;
  } catch (err) {
    console.error("Failed to save to db.json:", err);
    return false;
  }
}

/**
 * Get cumulative totals across all entries.
 */
function getTotals() {
  const tokenLog = getAll();
  return tokenLog.reduce(
    (acc, entry) => {
      acc.promptTokens += entry.promptTokens || 0;
      acc.completionTokens += entry.completionTokens || 0;
      acc.totalTokens += entry.totalTokens || 0;
      acc.estimatedCostUSD += entry.estimatedCostUSD || 0;
      acc.calls += 1;
      return acc;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUSD: 0, calls: 0 }
  );
}

module.exports = { add, getAll, getTotals };
