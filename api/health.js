module.exports = async (req, res) => {
  res.status(200).json({
    status: "ok",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    timestamp: new Date().toISOString()
  });
};
