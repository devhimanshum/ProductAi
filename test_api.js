const axios = require('axios');
async function run() {
  try {
    const res = await axios.post('http://localhost:3001/api/compare', { productUrl: "https://www.flipkart.com/samsung-galaxy-s24-ultra-5g-titanium-black-256-gb/p/itm56e34262b28f1" });
    const data = res.data;
    console.log("Platforms:", data.results.length);
    console.log("Flipkart Price:", data.results.find(r => r.platform.toLowerCase().includes('flipkart'))?.discount_price);
    console.log("Amazon Price:", data.results.find(r => r.platform.toLowerCase().includes('amazon'))?.discount_price);
  } catch(e) { console.error("Error:", e.message); }
}
run();
