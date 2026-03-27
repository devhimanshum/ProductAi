/**
 * app.js — ProductAI Frontend Logic
 * Handles form submission, API calls, result rendering, and token dashboard.
 */

// ── Config ────────────────────────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost' ? "http://localhost:3001/api" : "/api";

// ── State ─────────────────────────────────────────────────────────
let currentResults  = [];
let currentSort     = "price";
let currentSortDir  = "asc";

// ── DOM Refs ──────────────────────────────────────────────────────
const searchForm      = document.getElementById("searchForm");
const productUrlInput = document.getElementById("productUrl");
const productNameInput= document.getElementById("productName");
const searchBtn       = document.getElementById("searchBtn");
const btnText         = document.getElementById("btnText");
const btnLoader       = document.getElementById("btnLoader");
const errorBanner     = document.getElementById("errorBanner");
const errorText       = document.getElementById("errorText");
const resultsSection  = document.getElementById("resultsSection");
const emptyState      = document.getElementById("emptyState");
const resultsBody     = document.getElementById("resultsBody");
const productIdentified = document.getElementById("productIdentified");
const productCategory = document.getElementById("productCategory");
const resultCount     = document.getElementById("resultCount");
const lastTokenBadge  = document.getElementById("lastTokenBadge");
const toast           = document.getElementById("toast");
const statusDot       = document.getElementById("statusDot");
const statusLabel     = document.getElementById("statusLabel");

// ── Startup ───────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  checkHealth();
  loadTokens();
});

// ── Health Check ──────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      setStatus("online", `Connected · ${data.model}`);
    } else {
      setStatus("offline", "Backend error");
    }
  } catch {
    setStatus("offline", "Backend offline");
  }
}

function setStatus(state, label) {
  statusDot.className = `status-dot ${state}`;
  statusLabel.textContent = label;
}

// ── Form Submit ───────────────────────────────────────────────────
searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const productUrl  = productUrlInput.value.trim();
  const productName = productNameInput.value.trim();

  if (!productUrl && !productName) {
    showError("Please enter a Product URL or a Product Name to search.");
    return;
  }

  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}/compare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productUrl, productName }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.message || "Unknown server error");
    }

    // Render results
    currentResults = data.results || [];
    renderResults(data);

    // Update token badge
    const u = data.usage || {};
    lastTokenBadge.textContent = `${(u.totalTokens || 0).toLocaleString()} tokens used`;

    // Refresh token dashboard
    await loadTokens();
    showToast("Price comparison complete!", "success");

  } catch (err) {
    showError(err.message);
    showToast(err.message, "error");
  } finally {
    setLoading(false);
  }
});

// ── Loading State ─────────────────────────────────────────────────
function setLoading(on) {
  searchBtn.disabled = on;
  btnText.classList.toggle("hidden", on);
  btnLoader.classList.toggle("hidden", !on);
}

// ── Error Display ─────────────────────────────────────────────────
function showError(msg) {
  errorText.textContent = msg;
  errorBanner.classList.remove("hidden");
  errorBanner.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
function hideError() { errorBanner.classList.add("hidden"); }

// ── Render Results ────────────────────────────────────────────────
function renderResults(data) {
  const results = data.results || [];

  // Show results section, hide empty state
  emptyState.classList.add("hidden");
  resultsSection.classList.remove("hidden");

  // Render OverView (Image, Specs, etc.)
  renderOverview(data.productInfo, data.productIdentified);

  // Update header
  productIdentified.textContent = data.productIdentified || "Unknown Product";
  productCategory.textContent   = data.category || "Other";
  resultCount.textContent       = `${results.length} platform${results.length !== 1 ? "s" : ""}`;

  // Render table
  renderTable(results);

  // Scroll to results
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderOverview(info, identifiedName) {
  const overviewTitle = document.getElementById("overviewTitle");
  const overviewDesc  = document.getElementById("overviewDesc");
  const overviewImage = document.getElementById("overviewImage");
  const specsList     = document.getElementById("overviewSpecsList");

  overviewTitle.textContent = identifiedName || info?.title || "Product Identified";
  overviewDesc.textContent  = info?.description || "Technical specifications and pricing details gathered from multiple sources.";
  
  const imgUrl = info?.image_url || "https://via.placeholder.com/300x300?text=Product+Image";
  overviewImage.src = imgUrl;
  overviewImage.classList.remove("hidden");
  
  // Render Specs
  specsList.innerHTML = "";
  const specs = info?.specifications || {};
  const entries = Object.entries(specs);
  
  if (entries.length > 0) {
    entries.forEach(([key, val]) => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${escHtml(key)}</strong><span>${escHtml(val)}</span>`;
      specsList.appendChild(li);
    });
  } else {
    specsList.innerHTML = `<li style="grid-column: 1/-1; color:var(--text-muted)">Technical specifications are currently being updated.</li>`;
  }
}

function renderTable(results) {
  const sorted = sortResultsArray(results || [], currentSort, currentSortDir);

  // Find best (lowest) price for highlight
  const validPrices = sorted.filter(r => r.price !== null && r.price !== undefined && !isNaN(r.price));
  const bestPrice = validPrices.length > 0 ? Math.min(...validPrices.map(r => r.price)) : null;

  resultsBody.innerHTML = sorted.map((r, i) => {
    const isBest  = r.price !== null && r.price === bestPrice;
    const priceHtml    = formatPrice(r, isBest);
    const discountHtml = formatDiscount(r);
    const reviewsHtml  = formatReviews(r.results_reviews || r.reviews);
    const availHtml    = formatAvailability(r.availability);
    const linkHtml     = formatLink(r.url, r.platform);

    return `
      <tr class="${isBest ? "best-row" : ""}">
        <td class="col-rank">${i + 1}</td>
        <td><span class="platform-chip">${platformIcon(r.platform)} ${escHtml(r.platform || "Unknown")}</span></td>
        <td title="${escHtml(r.product_name || "—")}" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(r.product_name || "—")}</td>
        <td class="price-cell">${priceHtml}</td>
        <td>${discountHtml}</td>
        <td>${reviewsHtml}</td>
        <td>${availHtml}</td>
        <td>${linkHtml}</td>
      </tr>`;
  }).join("") || `<tr><td colspan="8" class="empty-row">No verified pricing available for this specified item.</td></tr>`;
}

function formatDiscount(r) {
  if (!r.discount_price && !r.discount_percentage) return `<span class="price-null">—</span>`;
  const discPrice = r.discount_price ? `${r.currency === "USD" ? "$" : "₹"}${Number(r.discount_price).toLocaleString("en-IN")}` : "";
  const discPerc  = r.discount_percentage ? `(-${r.discount_percentage}%)` : "";
  return `<div class="discount-cell"><span class="discount-price">${discPrice}</span> <span class="discount-perc">${discPerc}</span></div>`;
}

function formatReviews(reviews) {
  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) return `<span class="price-null">No reviews</span>`;
  const list = reviews.map(rev => `<li>${escHtml(rev)}</li>`).join("");
  return `
    <div class="reviews-dropdown">
      <span class="reviews-count">💬 ${reviews.length} reviews</span>
      <div class="reviews-list"><ul>${list}</ul></div>
    </div>`;
}

function formatPrice(r, isBest) {
  if (r.price === null || r.price === undefined) {
    return `<span class="price-null">–</span>`;
  }
  const symbol = r.currency === "USD" ? "$" : "₹";
  const cls    = r.currency === "USD" ? "price-usd" : "price-inr";
  const val    = Number(r.price).toLocaleString("en-IN");
  if (isBest) return `<span class="price-best">🏆 ${symbol}${val}</span>`;
  return `<span class="${cls}">${symbol}${val}</span>`;
}

function formatAvailability(avail) {
  if (!avail || avail === "Unknown") return `<span class="avail-pill avail-unk">● Unknown</span>`;
  if (avail === "In Stock")          return `<span class="avail-pill avail-in">✓ In Stock</span>`;
  return `<span class="avail-pill avail-out">✗ Out of Stock</span>`;
}

function formatLink(url, platform) {
  if (!url) return `<span class="link-null">No link</span>`;
  const label = `View on ${platform}`;
  return `<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" class="link-btn">↗ View</a>`;
}

function platformIcon(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("amazon"))    return "🟠";
  if (n.includes("flipkart"))  return "🔵";
  if (n.includes("myntra"))    return "🔴";
  if (n.includes("meesho"))    return "🟣";
  if (n.includes("snapdeal"))  return "🔴";
  if (n.includes("ajio"))      return "⚫";
  if (n.includes("nykaa"))     return "🌸";
  if (n.includes("croma"))     return "🟢";
  if (n.includes("reliance"))  return "🔵";
  if (n.includes("jio"))       return "🔵";
  if (n.includes("tata"))      return "🔷";
  if (n.includes("ebay"))      return "🟡";
  if (n.includes("walmart"))   return "🔵";
  if (n.includes("ali"))       return "🟠";
  return "🛒";
}

// ── Sorting ───────────────────────────────────────────────────────
function sortResults(key) {
  if (currentSort === key) {
    currentSortDir = currentSortDir === "asc" ? "desc" : "asc";
  } else {
    currentSort    = key;
    currentSortDir = "asc";
  }

  // Update button styles
  document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
  const btnMap = { price: "sortPrice", platform: "sortPlatform", availability: "sortAvail" };
  document.getElementById(btnMap[key])?.classList.add("active");

  renderTable(currentResults);
}

function sortResultsArray(arr, key, dir) {
  return [...arr].sort((a, b) => {
    let va, vb;
    if (key === "price") {
      va = a.price ?? Infinity;
      vb = b.price ?? Infinity;
    } else if (key === "platform") {
      va = (a.platform || "").toLowerCase();
      vb = (b.platform || "").toLowerCase();
    } else if (key === "availability") {
      const order = { "In Stock": 0, "Out of Stock": 1, "Unknown": 2 };
      va = order[a.availability] ?? 2;
      vb = order[b.availability] ?? 2;
    } else {
      return 0;
    }
    if (va < vb) return dir === "asc" ? -1 :  1;
    if (va > vb) return dir === "asc" ?  1 : -1;
    return 0;
  });
}

// ── Token Dashboard ───────────────────────────────────────────────
async function loadTokens() {
  try {
    const res  = await fetch(`${API_BASE}/tokens`);
    const data = await res.json();
    if (!data.success) return;

    const { totals, entries } = data;

    // Update stat cards
    document.getElementById("statCalls").textContent  = totals.calls.toLocaleString();
    document.getElementById("statInput").textContent  = totals.promptTokens.toLocaleString();
    document.getElementById("statOutput").textContent = totals.completionTokens.toLocaleString();
    document.getElementById("statTotal").textContent  = totals.totalTokens.toLocaleString();
    document.getElementById("statCost").textContent   = `$${totals.estimatedCostUSD.toFixed(6)}`;

    // Render history table
    const tbody = document.getElementById("tokenBody");
    if (!entries || entries.length === 0) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No API calls yet — run a search to see token usage</td></tr>`;
      return;
    }

    tbody.innerHTML = entries.map(e => {
      const ts = new Date(e.timestamp).toLocaleTimeString("en-IN", { hour12: true, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      return `
        <tr>
          <td style="white-space:nowrap;color:var(--text-muted);font-size:0.78rem">${ts}</td>
          <td><span class="token-query" title="${escHtml(e.productQuery)}">${escHtml(e.productQuery)}</span></td>
          <td><span class="model-pill">${escHtml(e.model)}</span></td>
          <td>${(e.promptTokens || 0).toLocaleString()}</td>
          <td>${(e.completionTokens || 0).toLocaleString()}</td>
          <td>${(e.totalTokens || 0).toLocaleString()}</td>
          <td>$${(e.estimatedCostUSD || 0).toFixed(6)}</td>
        </tr>`;
    }).join("");

  } catch (err) {
    console.warn("[loadTokens]", err.message);
  }
}

// ── Toast ─────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = "info") {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className   = `toast toast-${type}`;
  toast.classList.remove("hidden");
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
}

// ── Helpers ───────────────────────────────────────────────────────
function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
