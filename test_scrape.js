const axios = require('axios');
const cheerio = require('cheerio');

async function scrape() {
  const url = "https://www.flipkart.com/samsung-galaxy-s24-ultra-5g-titanium-black-256-gb/p/itm56e34262b28f1";
  try {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      timeout: 8000
    });
    const $ = cheerio.load(data);
    $('script, style, noscript, svg, img, iframe').remove();
    const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 4000);
    console.log(text);
  } catch(e) { console.error(e.message); }
}
scrape();
