const { getAll, getTotals } = require("../services/tokenStore");

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    success: true,
    totals: getTotals(),
    entries: getAll()
  });
};
