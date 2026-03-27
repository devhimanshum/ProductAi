module.exports = async (req, res) => {
  res.status(200).json({
    status: "ok",
    env: process.env.VERCEL ? "vercel-production" : "local-development",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    hasKey: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString()
  });
};
