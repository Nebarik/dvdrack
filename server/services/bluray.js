const fetch = require('node-fetch');
const { cacheImage } = require('../utils/imageCache');
const { extractEdition, extractSeasonInfo, cleanTitle } = require('../utils/titleParser');
const { lookupTMDb } = require('./tmdb');

async function lookupBluRay(upc, db, tmdbApiKey, imagesDir) {
  const cached = db.prepare('SELECT lookup_result FROM bluray_cache WHERE upc = ?').get(upc);
  let rawBluRayData = null;
  let fromCache = false;

  if (cached) {
    rawBluRayData = JSON.parse(cached.lookup_result);
    fromCache = true;
    console.log(`[Blu-ray.com] UPC ${upc} served from cache`);
  } else {
    try {
      // Try each section in sequence until we find a result
      const sections = ['dvdmovies', 'bluraymovies', '4k'];

      for (const section of sections) {
        const searchUrl = `https://www.blu-ray.com/search/?quicksearch=1&quicksearch_country=all&quicksearch_keyword=${upc}&section=${section}`;
        console.log(`[Blu-ray.com] Fetching (section=${section}): ${searchUrl}`);

        // Use a user agent to avoid robot detection, and follow redirects
        const res = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          redirect: 'follow'
        });

        console.log(`[Blu-ray.com] Response status: ${res.status} ${res.statusText}`);
        console.log(`[Blu-ray.com] Final URL after redirects: ${res.url}`);

        if (!res.ok) {
          console.warn(`[Blu-ray.com] HTTP error for UPC ${upc} (section=${section}): ${res.status} ${res.statusText}`);
          continue; // Try next section
        }

        const html = await res.text();
        console.log(`[Blu-ray.com] Received HTML length: ${html.length} bytes`);

        // Extract Blu-ray.com ID from the final URL
        // URL pattern: https://www.blu-ray.com/movies/Movie-Title-Blu-ray/204614/
        const urlIdMatch = res.url.match(/\/(\d+)\/?$/);
        let image = null;
        if (urlIdMatch) {
          const blurayId = urlIdMatch[1];
          console.log(`[Blu-ray.com] Extracted Blu-ray.com ID: ${blurayId}`);
          // Generate image URL using the pattern
          image = `https://images.static-bluray.com/movies/covers/${blurayId}_large.jpg`;
          console.log(`[Blu-ray.com] Generated image URL: ${image}`);
        } else {
          console.warn(`[Blu-ray.com] Could not extract ID from URL: ${res.url}`);
        }

        // Extract title from <meta property="og:title" content="Aliens Blu-ray (Australia)">
        const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);

        if (!titleMatch) {
          console.warn(`[Blu-ray.com] No og:title meta tag found for UPC ${upc} (section=${section})`);
          continue; // Try next section
        }

        const title = titleMatch[1];
        console.log(`[Blu-ray.com] Found title in section=${section}: "${title}"`);

        rawBluRayData = {
          title: title,
          image: image
        };
        break; // Success, stop trying sections
      }

      db.prepare('INSERT OR REPLACE INTO bluray_cache (upc, lookup_result) VALUES (?, ?)').run(
        upc,
        JSON.stringify(rawBluRayData)
      );
    } catch (e) {
      console.error(`[Blu-ray.com] Exception for UPC ${upc}:`, e.message);
      console.error(`[Blu-ray.com] Stack trace:`, e.stack);
      return { cached: false };
    }
  }

  if (!rawBluRayData || !rawBluRayData.title) {
    console.log(`[Blu-ray.com] No title data available for UPC ${upc}`);
    return { cached: fromCache };
  }

  const rawTitle = rawBluRayData.title;
  console.log(`[Blu-ray.com] Processing title: "${rawTitle}"`);

  const edition = extractEdition(rawTitle);
  const season_info = extractSeasonInfo(rawTitle);
  const title = cleanTitle(rawTitle);

  console.log(`[Blu-ray.com] Cleaned title: "${title}"`);
  console.log(`[Blu-ray.com] Edition: ${edition || 'none'}`);
  console.log(`[Blu-ray.com] Season info: ${season_info || 'none'}`);

  // Cache the blu-ray.com image if available
  let blurayImages = [];
  if (rawBluRayData.image) {
    console.log(`[Blu-ray.com] Caching image: ${rawBluRayData.image}`);
    const cachedImageUrl = await cacheImage(rawBluRayData.image, imagesDir);
    if (cachedImageUrl) {
      blurayImages.push(cachedImageUrl);
      console.log(`[Blu-ray.com] Image cached successfully: ${cachedImageUrl}`);
    } else {
      console.warn(`[Blu-ray.com] Failed to cache image`);
    }
  }

  console.log(`[Blu-ray.com] Looking up TMDb for title: "${title}"`);
  const tmdb = await lookupTMDb(title, rawTitle, tmdbApiKey, imagesDir);

  if (tmdb.tmdb_id) {
    console.log(`[Blu-ray.com] TMDb match found: ${tmdb.title} (${tmdb.year}) [ID: ${tmdb.tmdb_id}]`);
  } else {
    console.warn(`[Blu-ray.com] No TMDb match found for: "${title}"`);
  }

  return {
    upc,
    title,
    edition,
    season_info,
    ...tmdb,
    upcitemdb_images: blurayImages, // Use same field name for compatibility
    cached: fromCache,
  };
}

module.exports = { lookupBluRay };
