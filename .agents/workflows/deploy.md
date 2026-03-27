---
description: how to deploy the ProductAI application to Render.com
---

# Deploying to Render.com

Follow these steps to get your app live and shareable.

## 1. Prepare for Production
// turbo
1. Update `frontend/app.js` to use a relative path for the API:
   ```javascript
   const API_BASE = window.location.hostname === 'localhost' ? "http://localhost:3001/api" : "/api";
   ```

2. Update `backend/server.js` to serve the frontend:
   ```javascript
   const path = require('path');
   app.use(express.static(path.join(__dirname, '../frontend')));
   app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
   ```

## 2. Push to GitHub
1. Create a new repository on [GitHub](https://github.com).
2. Run the following in your terminal:
   ```bash
   git init
   git add .
   git commit -m "Initial deployment"
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

## 3. Deploy on Render
1. Create an account on [Render](https://render.com).
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository.
4. Set the following:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. In **Environment Variables**, add:
   - `OPENAI_API_KEY`: [Your Key]
   - `OPENAI_MODEL`: `gpt-4o-mini`
   - `PORT`: `10000` (Render's default)

## 4. Share!
Render will give you a URL like `https://product-ai.onrender.com`. Share this with anyone!
