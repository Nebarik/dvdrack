const fetch = require('node-fetch');
const { cacheImage } = require('../utils/imageCache');
const { extractEdition, extractSeasonInfo, cleanTitle } = require('../utils/titleParser');
const { lookupTMDb } = require('./tmdb');

async function lookupUPCDatabase(upc, db, upcdbApiKey, tmdbApiKey, imagesDir) {
  if (!upcdbApiKey) {
    console.warn('UPCDB_API_KEY not configured');
    return null;
  }

  const cached = db.prepare('SELECT lookup_result FROM upcdb_cache WHERE upc = ?').get(upc);
  let rawUPCData = null;
  let fromCache = false;
  let rateLimit = null;

  if (cached) {
    rawUPCData = JSON.parse(cached.lookup_result);
    fromCache = true;
    console.log(`UPCDatabase: ${upc} served from cache`);
  } else {
    try {
      const res = await fetch(`https://api.upcdatabase.org/product/${upc}?apikey=${upcdbApiKey}`);

      rateLimit = {
        lookups: res.headers.get('apilimit-lookups'),
        reset: res.headers.get('apilimit-reset'),
      };

      if (!res.ok) {
        console.warn(`UPCDatabase error: ${res.status} ${res.statusText}`);
        db.prepare('INSERT OR REPLACE INTO upcdb_cache (upc, lookup_result) VALUES (?, ?)').run(
          upc,
          JSON.stringify(null)
        );
        return { cached: false, rateLimit };
      }

      const data = await res.json();

      if (!data.success || !data.title) {
        console.warn('UPCDatabase lookup failed or no title found');
        rawUPCData = null;
      } else {
        rawUPCData = data;
      }

      db.prepare('INSERT OR REPLACE INTO upcdb_cache (upc, lookup_result) VALUES (?, ?)').run(
        upc,
        JSON.stringify(rawUPCData)
      );
    } catch (e) {
      console.warn('UPCDatabase error:', e.message);
      return { cached: false, rateLimit };
    }
  }

  if (!rawUPCData || !rawUPCData.title) {
    const result = { cached: fromCache };
    if (rateLimit) result.rateLimit = rateLimit;
    return result;
  }

  const rawTitle = rawUPCData.title;
  const edition = extractEdition(rawTitle);
  const season_info = extractSeasonInfo(rawTitle);
  const title = cleanTitle(rawTitle);

  const upcdbImageUrl = `https://images.upcdatabase.org/upc/302/${upc}.jpg`;
  const cachedImageUrl = await cacheImage(upcdbImageUrl, imagesDir);

  const tmdb = await lookupTMDb(title, rawTitle, tmdbApiKey, imagesDir);

  return {
    upc,
    title,
    edition,
    season_info,
    ...tmdb,
    upcitemdb_images: cachedImageUrl ? [cachedImageUrl] : [],
    cached: fromCache,
    rateLimit,
  };
}

module.exports = { lookupUPCDatabase };
