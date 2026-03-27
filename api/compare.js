const { compareProduct } = require("./services/openai");

module.exports = async (req, res) => {
  // Add CORS headers for serverless
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productUrl, productName } = req.body;
  console.log(`[API/Compare] Request: Name="${productName}", URL="${productUrl}"`);

  if (!productUrl && !productName) {
    return res.status(400).json({ error: 'Please provide a product URL or name.' });
  }

  try {
    const data = await compareProduct(productUrl, productName);
    console.log(`[API/Compare] Success: Found ${data.results?.length || 0} platforms`);
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    console.error(`[API/Compare] ERROR:`, err.message);
    res.status(500).json({ error: 'AI processing failed', message: err.message });
  }
};
