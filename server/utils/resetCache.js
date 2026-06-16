const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { cacheImage } = require('./imageCache');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry caching images for entries that still have TMDb URLs instead of local paths
 */
async function retryImageCache(dbPath, imagesDir, tmdbApiKey, progressCallback = null) {
  const db = new Database(dbPath);

  try {
    // Find all movies with TMDb poster URLs that aren't cached locally
    const movies = db.prepare(`
      SELECT id, poster_url, title
      FROM movies
      WHERE poster_url LIKE 'https://image.tmdb.org/%'
    `).all();

    if (movies.length === 0) {
      console.log('No entries found with uncached TMDb images');
      if (progressCallback) {
        progressCallback({ message: 'No TMDb URLs found - all images are already cached locally' });
      }
      return;
    }

    console.log(`Found ${movies.length} entries with uncached TMDb images`);

    for (const movie of movies) {
      try {
        console.log(`Caching image for: ${movie.title} (ID: ${movie.id})`);
        const localPath = await cacheImage(movie.poster_url, imagesDir);

        if (localPath && localPath.startsWith('/images/')) {
          // Update the database with local path
          db.prepare('UPDATE movies SET poster_url = ? WHERE id = ?')
            .run(localPath, movie.id);
          console.log(`  ✓ Updated to: ${localPath}`);
          if (progressCallback) {
            progressCallback({
              title: movie.title,
              poster: localPath,
              status: 'success'
            });
          }
        } else {
          console.log(`  ✗ Failed to cache`);
          if (progressCallback) {
            progressCallback({
              title: movie.title,
              poster: movie.poster_url,
              status: 'failed',
              error: 'Failed to cache'
            });
          }
        }
      } catch (err) {
        console.error(`  ✗ Error caching ${movie.title}:`, err.message);
        if (progressCallback) {
          progressCallback({
            title: movie.title,
            poster: movie.poster_url,
            status: 'error',
            error: err.message
          });
        }
      }
    }

    console.log(`\nRetry complete`);
  } catch (err) {
    console.error('Retry cache error:', err);
    if (progressCallback) {
      progressCallback({ error: err.message });
    }
  } finally {
    db.close();
  }
}

/**
 * Delete all cached images and re-lookup all movies/shows from TMDb
 */
async function resetImageCache(dbPath, imagesDir, tmdbApiKey, progressCallback = null) {
  if (!tmdbApiKey) {
    throw new Error('TMDB_API_KEY is required for cache reset');
  }

  const db = new Database(dbPath);

  try {
    // Delete all images in the images directory
    console.log('Deleting all cached images...');
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      for (const file of files) {
        fs.unlinkSync(path.join(imagesDir, file));
      }
      console.log(`Deleted ${files.length} cached images`);
    }

    // Clear cached_images table
    db.prepare('DELETE FROM cached_images').run();
    console.log('Cleared cached_images table');

    // Get all movies and TV shows
    const entries = db.prepare(`
      SELECT id, title, media_type, tmdb_id
      FROM movies
      ORDER BY id
    `).all();

    if (entries.length === 0) {
      return {
        success: 0,
        failed: 0,
        total: 0,
        message: 'No entries found in database',
        items: []
      };
    }

    console.log(`\nRe-looking up ${entries.length} entries from TMDb...`);

    let successCount = 0;
    let failCount = 0;
    const items = [];

    for (const entry of entries) {
      try {
        const mediaType = entry.media_type || 'movie';
        console.log(`[${entry.id}] ${entry.title} (${mediaType})`);

        // Search TMDb for the title
        const searchUrl = mediaType === 'tv'
          ? `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(entry.title)}`
          : `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(entry.title)}`;

        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.results || searchData.results.length === 0) {
          console.log(`  ✗ No results found`);
          failCount++;
          items.push({
            title: entry.title,
            poster: null,
            status: 'failed',
            error: 'No results found'
          });
          if (progressCallback) progressCallback(items[items.length - 1]);
          await sleep(100);
          continue;
        }

        // Get the first result
        const result = searchData.results[0];
        const tmdbId = result.id;

        // Fetch detailed info
        const detailUrl = mediaType === 'tv'
          ? `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbApiKey}`
          : `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbApiKey}`;

        const detailRes = await fetch(detailUrl);
        const detail = await detailRes.json();

        // Get poster
        const tmdbPosterUrl = detail.poster_path
          ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
          : null;

        if (tmdbPosterUrl) {
          const localPath = await cacheImage(tmdbPosterUrl, imagesDir);

          if (localPath && localPath.startsWith('/images/')) {
            db.prepare('UPDATE movies SET poster_url = ?, tmdb_id = ? WHERE id = ?')
              .run(localPath, tmdbId, entry.id);
            console.log(`  ✓ Cached: ${localPath}`);
            successCount++;
            items.push({
              title: entry.title,
              poster: localPath,
              status: 'success'
            });
            if (progressCallback) progressCallback(items[items.length - 1]);
          } else {
            console.log(`  ✗ Failed to cache image`);
            failCount++;
            items.push({
              title: entry.title,
              poster: tmdbPosterUrl,
              status: 'failed',
              error: 'Failed to cache'
            });
            if (progressCallback) progressCallback(items[items.length - 1]);
          }
        } else {
          console.log(`  ✗ No poster available`);
          failCount++;
          items.push({
            title: entry.title,
            poster: null,
            status: 'failed',
            error: 'No poster available'
          });
          if (progressCallback) progressCallback(items[items.length - 1]);
        }

        // Rate limit: 0.1 second between requests
        await sleep(100);
      } catch (err) {
        console.error(`  ✗ Error:`, err.message);
        failCount++;
        items.push({
          title: entry.title,
          poster: null,
          status: 'error',
          error: err.message
        });
        if (progressCallback) progressCallback(items[items.length - 1]);
        await sleep(100);
      }
    }

    console.log(`\nReset complete: ${successCount} cached, ${failCount} failed`);
    return {
      success: successCount,
      failed: failCount,
      total: entries.length,
      items
    };
  } catch (err) {
    console.error('Reset cache error:', err);
    return {
      success: 0,
      failed: 0,
      total: 0,
      error: err.message,
      items: []
    };
  } finally {
    db.close();
  }
}

module.exports = { retryImageCache, resetImageCache };
