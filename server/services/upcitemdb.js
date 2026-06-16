const fetch = require('node-fetch');
const { cacheImage } = require('../utils/imageCache');
const { extractEdition, extractSeasonInfo, cleanTitle } = require('../utils/titleParser');
const { lookupTMDb } = require('./tmdb');

async function fetchUPCitemdbImages(upc, imagesDir) {
  try {
    const res = await fetch(`https://www.upcitemdb.com/upc/${upc}`);
    if (!res.ok) return [];

    const html = await res.text();

    const imglistMatch = html.match(/<div class="imglist"[^>]*>([\s\S]*?)<\/div>/);
    if (!imglistMatch) return [];

    const imglistContent = imglistMatch[1];
    const imgRegex = /<img[^>]+src="([^"]+)"/g;
    const images = [];
    let match;

    while ((match = imgRegex.exec(imglistContent)) !== null) {
      const imgUrl = match[1];
      if (imgUrl && !imgUrl.includes('pixel') && !imgUrl.includes('spacer')) {
        images.push(imgUrl);
      }
    }

    const cachedImages = [];
    for (const imgUrl of images) {
      const localUrl = await cacheImage(imgUrl, imagesDir);
      if (localUrl) cachedImages.push(localUrl);
    }

    console.log(`Fetched ${cachedImages.length} images from UPCitemdb for ${upc}`);
    return cachedImages;
  } catch (e) {
    console.warn('UPCitemdb image fetch error:', e.message);
    return [];
  }
}

async function lookupUPCitemdb(upc, db, tmdbApiKey, imagesDir) {
  const cached = db.prepare('SELECT lookup_result FROM upc_cache WHERE upc = ?').get(upc);
  let rawUPCData = null;
  let fromCache = false;
  let rateLimit = null;

  if (cached) {
    rawUPCData = JSON.parse(cached.lookup_result);
    fromCache = true;
    console.log(`UPC ${upc} served from cache`);
  } else {
    try {
      const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`);
      const data = await res.json();

      rateLimit = {
        limit: res.headers.get('x-ratelimit-limit'),
        remaining: res.headers.get('x-ratelimit-remaining'),
        reset: res.headers.get('x-ratelimit-reset'),
      };

      if (data.items && data.items.length > 0) {
        rawUPCData = data.items[0];
      }

      db.prepare('INSERT OR REPLACE INTO upc_cache (upc, lookup_result) VALUES (?, ?)').run(
        upc,
        JSON.stringify(rawUPCData)
      );
    } catch (e) {
      console.warn('UPCitemdb error:', e.message);
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

  const [tmdb, upcImages] = await Promise.all([
    lookupTMDb(title, rawTitle, tmdbApiKey, imagesDir),
    fetchUPCitemdbImages(upc, imagesDir)
  ]);

  return {
    upc,
    title,
    edition,
    season_info,
    ...tmdb,
    upcitemdb_images: upcImages,
    cached: fromCache,
    rateLimit,
  };
}

module.exports = { lookupUPCitemdb, fetchUPCitemdbImages };
