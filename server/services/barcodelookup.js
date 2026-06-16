const fetch = require('node-fetch');
const { cacheImage } = require('../utils/imageCache');
const { extractEdition, extractSeasonInfo, cleanTitle } = require('../utils/titleParser');
const { lookupTMDb } = require('./tmdb');

async function lookupBarcodeLookup(upc, db, apiKey, tmdbApiKey, imagesDir) {
  if (!apiKey) {
    console.warn('BARCODE_LOOKUP_API_KEY not configured');
    return null;
  }

  const cached = db.prepare('SELECT lookup_result FROM barcodelookup_cache WHERE upc = ?').get(upc);
  let rawBarcodeData = null;
  let fromCache = false;
  let rateLimit = null;

  if (cached) {
    rawBarcodeData = JSON.parse(cached.lookup_result);
    fromCache = true;
    console.log(`BarcodeLookup: ${upc} served from cache`);
  } else {
    try {
      // Fetch rate limit first
      const rateLimitRes = await fetch(`https://api.barcodelookup.com/v3/rate-limits?key=${apiKey}`);
      if (rateLimitRes.ok) {
        const rateLimitData = await rateLimitRes.json();
        rateLimit = {
          remaining: rateLimitData.remaining_calls_per_month,
          limit: rateLimitData.allowed_calls_per_month,
          reset: 'resets every Month',
        };
      }

      // Fetch barcode data
      const res = await fetch(`https://api.barcodelookup.com/v3/products?barcode=${upc}&key=${apiKey}`);

      if (!res.ok) {
        console.warn(`BarcodeLookup error: ${res.status} ${res.statusText}`);
        db.prepare('INSERT OR REPLACE INTO barcodelookup_cache (upc, lookup_result) VALUES (?, ?)').run(
          upc,
          JSON.stringify(null)
        );
        return { cached: false, rateLimit };
      }

      const data = await res.json();

      if (!data.products || data.products.length === 0 || !data.products[0].title) {
        console.warn('BarcodeLookup lookup failed or no title found');
        rawBarcodeData = null;
      } else {
        rawBarcodeData = data.products[0];
      }

      db.prepare('INSERT OR REPLACE INTO barcodelookup_cache (upc, lookup_result) VALUES (?, ?)').run(
        upc,
        JSON.stringify(rawBarcodeData)
      );
    } catch (e) {
      console.warn('BarcodeLookup error:', e.message);
      return { cached: false, rateLimit };
    }
  }

  if (!rawBarcodeData || !rawBarcodeData.title) {
    const result = { cached: fromCache };
    if (rateLimit) result.rateLimit = rateLimit;
    return result;
  }

  const rawTitle = rawBarcodeData.title;
  const edition = extractEdition(rawTitle);
  const season_info = extractSeasonInfo(rawTitle);
  const title = cleanTitle(rawTitle);

  // Cache images from Barcode Lookup API
  const cachedImages = [];
  if (rawBarcodeData.images && Array.isArray(rawBarcodeData.images)) {
    for (const imgUrl of rawBarcodeData.images) {
      const cachedImageUrl = await cacheImage(imgUrl, imagesDir);
      if (cachedImageUrl) cachedImages.push(cachedImageUrl);
    }
  }

  const tmdb = await lookupTMDb(title, rawTitle, tmdbApiKey, imagesDir);

  return {
    upc,
    title,
    edition,
    season_info,
    ...tmdb,
    upcitemdb_images: cachedImages,
    cached: fromCache,
    rateLimit,
  };
}

module.exports = { lookupBarcodeLookup };
