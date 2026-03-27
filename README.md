# ProductAI — AI-Powered Product Price Comparison

Compare product prices across 14+ e-commerce platforms using OpenAI GPT-4o.  
Track every API call's input/output token usage in a real-time dashboard.

## Features
- 🔍 Search by **product URL** or **product name**
- 🤖 GPT-4o powered price discovery across Amazon, Flipkart, Myntra and 11 more platforms
- 📊 **Token usage dashboard** — input tokens, output tokens, total, and estimated USD cost per call
- 🏆 Best price highlighted automatically
- 🔢 Sortable results by price, platform, or availability
- 🎨 Premium dark glassmorphism UI

---

## Quick Start

### 1. Install backend dependencies
```bash
cd backend
npm install
```

### 2. Configure your OpenAI API Key
```bash
cp .env.example .env
```
Open `.env` and replace `sk-xxxx...` with your real OpenAI API key.

### 3. Start the backend server
```bash
npm start          # production
# OR
npm run dev        # with auto-reload (nodemon)
```
Server runs at **http://localhost:3001**

### 4. Open the frontend
Open `frontend/index.html` directly in your browser, or serve it:
```bash
npx serve frontend
```

---

## Project Structure
```
ProductAI/
├── backend/
│   ├── server.js              # Express entry point (port 3001)
│   ├── .env                   # Your API key (create from .env.example)
│   ├── .env.example           # Template
│   ├── routes/
│   │   ├── compare.js         # POST /api/compare
│   │   └── tokens.js          # GET  /api/tokens
│   └── services/
│       ├── openai.js          # GPT-4o integration + token tracking
│       └── tokenStore.js      # In-memory token log
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
```

## API Reference

### POST `/api/compare`
```json
{ "productUrl": "https://...", "productName": "iPhone 15 Pro" }
```
At least one field is required.

**Response:**
```json
{
  "productIdentified": "Apple iPhone 15 Pro 256GB Natural Titanium",
  "category": "Electronics",
  "results": [
    { "platform": "Amazon India", "price": 129900, "currency": "INR", "availability": "In Stock", "url": "..." }
  ],
  "usage": { "promptTokens": 850, "completionTokens": 620, "totalTokens": 1470, "estimatedCostUSD": 0.000162 }
}
```

### GET `/api/tokens`
Returns all past API calls and cumulative totals.

### GET `/api/health`
Returns server status and model name.

---

## Notes
> Results are **AI-estimated** based on GPT-4o training data, not live web scraping.  
> Prices may not reflect real-time availability. Use as reference only.

## Model Configuration
Change the model in `.env`:
```
OPENAI_MODEL=gpt-4o-mini   # faster & cheaper
OPENAI_MODEL=gpt-4o        # most accurate (default)
```
