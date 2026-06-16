const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { lookupUPCitemdb } = require('./services/upcitemdb');
const { lookupUPCDatabase } = require('./services/upcdatabase');
const { lookupBarcodeLookup } = require('./services/barcodelookup');
const { lookupBluRay } = require('./services/bluray');
const { lookupTMDb } = require('./services/tmdb');
const { cacheImage } = require('./utils/imageCache');
const { extractEdition, extractSeasonInfo, cleanTitle } = require('./utils/titleParser');

const app = express();
const PORT = process.env.PORT || 3001;
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const UPCDB_API_KEY = process.env.UPCDB_API_KEY || '';
const BARCODE_LOOKUP_API_KEY = process.env.BARCODE_LOOKUP_API_KEY || '';
const BLURAY_ENABLED = process.env['BLU-RAY.COM'] === 'true';
const API_TOKEN = process.env.API_TOKEN || '';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'movies.db');
const IMAGES_DIR = path.join(path.dirname(DB_PATH), 'images');

// Ensure data and images directories exist
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Init DB
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upc TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    director TEXT,
    genre TEXT,
    poster_url TEXT,
    runtime INTEGER,
    tmdb_id INTEGER,
    overview TEXT,
    price_paid REAL,
    edition TEXT,
    media_type TEXT DEFAULT 'movie',
    seasons INTEGER,
    episodes INTEGER,
    season_info TEXT,
    date_added TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS upc_cache (
    upc TEXT PRIMARY KEY,
    lookup_result TEXT,
    cached_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS upcdb_cache (
    upc TEXT PRIMARY KEY,
    lookup_result TEXT,
    cached_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS barcodelookup_cache (
    upc TEXT PRIMARY KEY,
    lookup_result TEXT,
    cached_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bluray_cache (
    upc TEXT PRIMARY KEY,
    lookup_result TEXT,
    cached_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cached_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    source TEXT NOT NULL,
    cached_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE
  );
`);

app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  // console.log(`  Origin: ${req.get('origin') || 'none'}`);
  // console.log(`  User-Agent: ${req.get('user-agent') || 'none'}`);

  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    // console.log(`  Response: ${res.statusCode}`);
    originalSend.call(this, data);
  };

  next();
});

// API token authentication middleware
function requireAuth(req, res, next) {
  // Skip auth if no token configured
  if (!API_TOKEN) {
    console.warn('Warning: API_TOKEN not set - server is unprotected');
    return next();
  }

  // Check Authorization header or query param (for EventSource)
  const token = req.get('Authorization')?.replace('Bearer ', '') || req.query.token;
  if (!token || token !== API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

// Serve cached images
app.use('/images', express.static(IMAGES_DIR));

// Serve built frontend in production
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
}


// ── Routes ─────────────────────────────────────────────────────────────────

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Config endpoint (no auth required) - tells client which services are available
app.get('/api/config', (req, res) => {
  res.json({
    services: {
      upcitemdb: true, // Always available (no key required)
      upcdatabase: !!UPCDB_API_KEY,
      barcodelookup: !!BARCODE_LOOKUP_API_KEY,
      bluray: BLURAY_ENABLED,
      tmdb: !!TMDB_API_KEY
    }
  });
});

// Apply auth middleware to all other API routes
app.use('/api', requireAuth);

// GET all movies
app.get('/api/movies', (req, res) => {
  const { search, genre, media_type, sort_by, sort_order } = req.query;
  let query = 'SELECT * FROM movies';
  const params = [];
  const conditions = [];

  if (search) {
    conditions.push('(title LIKE ? OR director LIKE ? OR edition LIKE ? OR CAST(year AS TEXT) LIKE ? OR genre LIKE ? OR upc LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (genre) {
    conditions.push('genre LIKE ?');
    params.push(`%${genre}%`);
  }
  if (media_type && media_type !== 'all') {
    conditions.push('media_type = ?');
    params.push(media_type);
  }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

  // Handle sorting
  const validSortFields = { title: 'title', date_added: 'date_added', price: 'price_paid' };
  const sortField = validSortFields[sort_by] || 'date_added';
  const order = sort_order === 'asc' ? 'ASC' : 'DESC';
  query += ` ORDER BY ${sortField} ${order}`;

  res.json(db.prepare(query).all(...params));
});

// GET single movie
app.get('/api/movies/:id', (req, res) => {
  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  if (!movie) return res.status(404).json({ error: 'Not found' });

  // Fetch cached images for this movie
  const cachedImages = db.prepare('SELECT image_url, source FROM cached_images WHERE movie_id = ? ORDER BY id').all(req.params.id);

  // Fetch other editions (same tmdb_id, different UPC) if tmdb_id exists
  let otherEditions = [];
  if (movie.tmdb_id) {
    otherEditions = db.prepare('SELECT * FROM movies WHERE tmdb_id = ? AND id != ? ORDER BY date_added').all(movie.tmdb_id, req.params.id);
    // Add cached images for each edition
    otherEditions = otherEditions.map(edition => {
      const editionImages = db.prepare('SELECT image_url, source FROM cached_images WHERE movie_id = ? ORDER BY id').all(edition.id);
      return { ...edition, cached_images: editionImages };
    });
  }

  res.json({ ...movie, cached_images: cachedImages, other_editions: otherEditions });
});

// GET all entries for a TV show by tmdb_id
app.get('/api/tv/:tmdb_id', (req, res) => {
  const entries = db.prepare('SELECT * FROM movies WHERE tmdb_id = ? ORDER BY season_info, date_added').all(req.params.tmdb_id);
  if (!entries || entries.length === 0) return res.status(404).json({ error: 'Not found' });

  // Fetch cached images for each entry
  const entriesWithImages = entries.map(entry => {
    const cachedImages = db.prepare('SELECT image_url, source FROM cached_images WHERE movie_id = ? ORDER BY id').all(entry.id);
    return { ...entry, cached_images: cachedImages };
  });

  res.json(entriesWithImages);
});

// POST lookup UPC(s) — preview before saving
app.post('/api/lookup', async (req, res) => {
  const { upcs, service = 'upcitemdb' } = req.body; // array of UPC strings or movie titles, service selection
  if (!upcs || !Array.isArray(upcs)) return res.status(400).json({ error: 'upcs array required' });

  let lastRateLimit = null;

  const results = await Promise.all(
    upcs.map(async (input) => {
      const trimmedInput = input.trim();

      // Detect if input is a UPC (all digits) or a movie title (contains letters)
      const isUPC = /^\d+$/.test(trimmedInput);

      if (isUPC) {
        // Traditional UPC lookup flow
        const upc = trimmedInput;

        // Check if already in DB
        const existing = db.prepare('SELECT * FROM movies WHERE upc = ?').get(upc);
        if (existing) {
          // Check if this UPC lookup was cached
          let cached = false;
          if (service === 'upcdatabase') {
            cached = !!db.prepare('SELECT upc FROM upcdb_cache WHERE upc = ?').get(upc);
          } else if (service === 'barcodelookup') {
            cached = !!db.prepare('SELECT upc FROM barcodelookup_cache WHERE upc = ?').get(upc);
          } else if (service === 'bluray') {
            cached = !!db.prepare('SELECT upc FROM bluray_cache WHERE upc = ?').get(upc);
          } else {
            cached = !!db.prepare('SELECT upc FROM upc_cache WHERE upc = ?').get(upc);
          }
          return { upc, status: 'duplicate', movie: existing, cached, lookupSource: service };
        }

        // Select UPC lookup service
        let metadata;
        if (service === 'upcdatabase') {
          metadata = await lookupUPCDatabase(upc, db, UPCDB_API_KEY, TMDB_API_KEY, IMAGES_DIR);
        } else if (service === 'barcodelookup') {
          metadata = await lookupBarcodeLookup(upc, db, BARCODE_LOOKUP_API_KEY, TMDB_API_KEY, IMAGES_DIR);
        } else if (service === 'bluray') {
          metadata = await lookupBluRay(upc, db, TMDB_API_KEY, IMAGES_DIR);
        } else {
          metadata = await lookupUPCitemdb(upc, db, TMDB_API_KEY, IMAGES_DIR);
        }

        if (!metadata) return { upc, status: 'not_found', movie: null, cached: false };

        // Capture the most recent rate limit info
        if (metadata.rateLimit) {
          lastRateLimit = metadata.rateLimit;
        }

        // Extract cached flag and rateLimit, keep everything else
        const { rateLimit, cached, ...movieData } = metadata;

        // If no TMDb data (no tmdb_id or no title), mark as not_found but preserve cached flag, cleaned title, edition, and season_info
        if (!movieData.tmdb_id || !movieData.title) {
          return {
            upc,
            status: 'not_found',
            movie: null,
            cached: cached || false,
            searched_title: movieData.title, // Return the cleaned title that was used for TMDb search
            edition: metadata.edition || null, // Preserve edition from UPC lookup
            season_info: metadata.season_info || null // Preserve season info from UPC lookup
          };
        }

        return { upc, status: 'found', movie: movieData, cached: cached || false, lookupSource: service };
      } else {
        // Manual title search flow — extract edition, season info, clean title, search TMDb
        const rawTitle = trimmedInput;
        const edition = extractEdition(rawTitle);
        const season_info = extractSeasonInfo(rawTitle);
        const cleanedTitle = cleanTitle(rawTitle);

        // Generate a synthetic UPC from the cleaned title (not raw input) for consistent tracking
        const syntheticUPC = `MANUAL_${crypto.createHash('md5').update(cleanedTitle).digest('hex').substring(0, 12)}`;

        // Check if already in DB by synthetic UPC
        const existing = db.prepare('SELECT * FROM movies WHERE upc = ?').get(syntheticUPC);
        if (existing) return { upc: syntheticUPC, status: 'duplicate', movie: existing };

        // Skip UPC lookup, go directly to TMDb
        const tmdbData = await lookupTMDb(cleanedTitle, rawTitle, TMDB_API_KEY, IMAGES_DIR);

        if (!tmdbData.tmdb_id) {
          return {
            upc: syntheticUPC,
            status: 'not_found',
            movie: null,
            cached: false,
            searched_title: cleanedTitle // Return the cleaned title that was used for TMDb search
          };
        }

        return {
          upc: syntheticUPC,
          status: 'found',
          movie: {
            ...tmdbData,
            edition,
            season_info,
            upc: syntheticUPC
          },
          cached: false
        };
      }
    })
  );

  res.json({ results, rateLimit: lastRateLimit });
});

// POST lookup single UPC via upcdatabase.org
app.post('/api/lookup/upcdatabase', async (req, res) => {
  const { upc } = req.body;
  if (!upc) return res.status(400).json({ error: 'upc required' });

  const trimmedUPC = upc.trim();

  // Check if already in DB
  const existing = db.prepare('SELECT * FROM movies WHERE upc = ?').get(trimmedUPC);
  if (existing) {
    return res.json({ upc: trimmedUPC, status: 'duplicate', movie: existing });
  }

  const metadata = await lookupUPCDatabase(trimmedUPC, db, UPCDB_API_KEY, TMDB_API_KEY, IMAGES_DIR);

  // Extract rate limit info
  const rateLimit = metadata?.rateLimit || null;
  const cached = metadata?.cached || false;

  if (!metadata || !metadata.tmdb_id) {
    return res.json({
      upc: trimmedUPC,
      status: 'not_found',
      movie: null,
      searched_title: metadata?.title || null,
      edition: metadata?.edition || null,
      season_info: metadata?.season_info || null,
      cached,
      rateLimit
    });
  }

  // Remove rateLimit from metadata object before returning as movie
  const { rateLimit: _, ...movieData } = metadata;

  return res.json({
    upc: trimmedUPC,
    status: 'found',
    movie: movieData,
    cached,
    rateLimit
  });
});

// GET search TMDb by title (for manual search when UPC lookup fails)
app.get('/api/tmdb/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB_API_KEY not configured' });

  try {
    // Search both movies and TV shows
    const [movieSearchRes, tvSearchRes] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}`),
      fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(q)}`)
    ]);

    const [movieData, tvData] = await Promise.all([
      movieSearchRes.json(),
      tvSearchRes.json()
    ]);

    // Combine and sort by popularity
    const movieResults = (movieData.results || []).map(m => ({ ...m, media_type: 'movie' }));
    const tvResults = (tvData.results || []).map(t => ({ ...t, media_type: 'tv' }));
    const combined = [...movieResults, ...tvResults]
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .slice(0, 10);

    const results = await Promise.all(
      combined.map(async (item) => {
        const tmdb_poster_url = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
        const poster_url = tmdb_poster_url ? await cacheImage(tmdb_poster_url, IMAGES_DIR) : null;
        return {
          tmdb_id: item.id,
          title: item.media_type === 'movie' ? item.title : item.name,
          year: item.media_type === 'movie'
            ? (item.release_date ? parseInt(item.release_date.split('-')[0]) : null)
            : (item.first_air_date ? parseInt(item.first_air_date.split('-')[0]) : null),
          poster_url,
          overview: item.overview || null,
          media_type: item.media_type,
        };
      })
    );
    res.json(results);
  } catch (e) {
    console.warn('TMDb search error:', e.message);
    res.status(500).json({ error: 'TMDb search failed' });
  }
});

// GET full TMDb details for a movie or TV show
app.get('/api/tmdb/:mediaType/:tmdbId', async (req, res) => {
  if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB_API_KEY not configured' });

  const { mediaType, tmdbId } = req.params;
  if (!['movie', 'tv'].includes(mediaType)) {
    return res.status(400).json({ error: 'mediaType must be movie or tv' });
  }

  try {
    const detailRes = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits`
    );
    const detail = await detailRes.json();
    if (detail.success === false) return res.status(404).json({ error: 'Not found on TMDb' });

    if (mediaType === 'movie') {
      const director = detail.credits?.crew?.find(c => c.job === 'Director')?.name || null;
      const genre = detail.genres?.map(g => g.name).join(', ') || null;
      const tmdb_poster_url = detail.poster_path
        ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
        : null;

      const poster_url = tmdb_poster_url ? await cacheImage(tmdb_poster_url, IMAGES_DIR) : null;

      res.json({
        title: detail.title,
        year: detail.release_date ? parseInt(detail.release_date.split('-')[0]) : null,
        director,
        genre,
        poster_url,
        runtime: detail.runtime || null,
        tmdb_id: detail.id,
        overview: detail.overview || null,
        media_type: 'movie',
      });
    } else {
      // TV show
      const creator = detail.created_by?.map(c => c.name).join(', ') || null;
      const genre = detail.genres?.map(g => g.name).join(', ') || null;
      const tmdb_poster_url = detail.poster_path
        ? `https://image.tmdb.org/t/p/w500${detail.poster_path}`
        : null;

      const poster_url = tmdb_poster_url ? await cacheImage(tmdb_poster_url, IMAGES_DIR) : null;

      res.json({
        title: detail.name,
        year: detail.first_air_date ? parseInt(detail.first_air_date.split('-')[0]) : null,
        director: creator,
        genre,
        poster_url,
        runtime: detail.episode_run_time?.[0] || null,
        tmdb_id: detail.id,
        overview: detail.overview || null,
        media_type: 'tv',
        seasons: detail.number_of_seasons || null,
        episodes: detail.number_of_episodes || null,
      });
    }
  } catch (e) {
    console.warn('TMDb detail error:', e.message);
    res.status(500).json({ error: 'TMDb detail fetch failed' });
  }
});

// GET alternative posters from TMDb (not cached, fresh lookup)
app.get('/api/tmdb/:mediaType/:tmdbId/posters', async (req, res) => {
  if (!TMDB_API_KEY) return res.status(500).json({ error: 'TMDB_API_KEY not configured' });

  const { mediaType, tmdbId } = req.params;
  if (!['movie', 'tv'].includes(mediaType)) {
    return res.status(400).json({ error: 'mediaType must be movie or tv' });
  }

  try {
    const imagesRes = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/images?api_key=${TMDB_API_KEY}`
    );
    const imagesData = await imagesRes.json();

    if (imagesData.success === false) {
      return res.status(404).json({ error: 'Not found on TMDb' });
    }

    // Get all posters, sorted by vote_average (descending), return full URLs
    const posters = (imagesData.posters || [])
      .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
      .map(poster => ({
        url: `https://image.tmdb.org/t/p/w500${poster.file_path}`,
        width: poster.width,
        height: poster.height,
        vote_average: poster.vote_average,
        iso_639_1: poster.iso_639_1
      }));

    res.json({ posters });
  } catch (e) {
    console.warn('TMDb posters fetch error:', e.message);
    res.status(500).json({ error: 'TMDb posters fetch failed' });
  }
});

// POST save batch of movies
app.post('/api/movies/batch', (req, res) => {
  const { movies } = req.body;
  if (!movies || !Array.isArray(movies)) return res.status(400).json({ error: 'movies array required' });

  const insert = db.prepare(`
    INSERT OR IGNORE INTO movies (upc, title, year, director, genre, poster_url, runtime, tmdb_id, overview, price_paid, edition, media_type, seasons, episodes, season_info)
    VALUES (@upc, @title, @year, @director, @genre, @poster_url, @runtime, @tmdb_id, @overview, @price_paid, @edition, @media_type, @seasons, @episodes, @season_info)
  `);

  const insertCachedImage = db.prepare(`
    INSERT INTO cached_images (movie_id, image_url, source)
    VALUES (@movie_id, @image_url, @source)
  `);

  const insertMany = db.transaction((movies) => {
    const results = [];
    for (const m of movies) {
      // Apply fallback: use TMDb poster, or first UPCitemdb image if no TMDb poster
      let posterUrl = m.poster_url || null;
      const upcitemdbImages = m.upcitemdb_images || [];
      const imageSource = m.lookupSource || 'upcitemdb'; // Track which service provided the images

      console.log(`[Batch Save] UPC ${m.upc}: lookupSource="${m.lookupSource}", imageSource="${imageSource}", images count=${upcitemdbImages.length}`);

      if (!posterUrl && upcitemdbImages.length > 0) {
        posterUrl = upcitemdbImages[0];
      }

      const row = {
        upc: m.upc,
        title: m.title || 'Unknown',
        year: m.year || null,
        director: m.director || null,
        genre: m.genre || null,
        poster_url: posterUrl,
        runtime: m.runtime || null,
        tmdb_id: m.tmdb_id || null,
        overview: m.overview || null,
        price_paid: m.price_paid || null,
        edition: m.edition || null,
        media_type: m.media_type || 'movie',
        seasons: m.seasons || null,
        episodes: m.episodes || null,
        season_info: m.season_info || null,
      };
      const info = insert.run(row);

      if (info.changes > 0) {
        const movieId = info.lastInsertRowid;

        // Store TMDb poster as cached image if available
        if (m.poster_url) {
          insertCachedImage.run({
            movie_id: movieId,
            image_url: m.poster_url,
            source: 'tmdb'
          });
        }

        // Store all UPC service images as cached images
        for (const imgUrl of upcitemdbImages) {
          console.log(`[Batch Save] Inserting cached image for movie ${movieId}: url="${imgUrl}", source="${imageSource}"`);
          insertCachedImage.run({
            movie_id: movieId,
            image_url: imgUrl,
            source: imageSource
          });
        }
      }

      results.push({ upc: m.upc, inserted: info.changes > 0 });
    }
    return results;
  });

  res.json(insertMany(movies));
});

// PATCH update movie (e.g. price_paid, poster_url)
app.patch('/api/movies/:id', async (req, res) => {
  const allowed = ['price_paid', 'title', 'year', 'director', 'genre', 'overview', 'edition', 'poster_url', 'media_type', 'seasons', 'episodes', 'season_info'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nothing to update' });

  // If poster_url is being updated and it's a full TMDb URL, cache it first
  if (updates.poster_url && updates.poster_url.startsWith('https://image.tmdb.org/')) {
    const cachedUrl = await cacheImage(updates.poster_url, IMAGES_DIR);
    updates.poster_url = cachedUrl;

    // Check if this image is already in cached_images table
    const existing = db.prepare('SELECT id FROM cached_images WHERE movie_id = ? AND image_url = ?')
      .get(req.params.id, cachedUrl);

    // Only add to cached_images table if not already there
    if (!existing) {
      const insertCachedImage = db.prepare(`
        INSERT INTO cached_images (movie_id, image_url, source)
        VALUES (@movie_id, @image_url, @source)
      `);
      insertCachedImage.run({
        movie_id: req.params.id,
        image_url: cachedUrl,
        source: 'tmdb'
      });
    }
  }

  const setClause = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE movies SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });

  const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
  const cachedImages = db.prepare('SELECT image_url, source FROM cached_images WHERE movie_id = ? ORDER BY id').all(req.params.id);

  res.json({ ...movie, cached_images: cachedImages });
});

// DELETE movie
app.delete('/api/movies/:id', (req, res) => {
  db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// DELETE clear UPC cache entry
app.delete('/api/cache/:upc', (req, res) => {
  const info = db.prepare('DELETE FROM upc_cache WHERE upc = ?').run(req.params.upc);
  res.json({ ok: true, deleted: info.changes > 0 });
});

// DELETE clear UPCDatabase cache entry
app.delete('/api/cache/upcdb/:upc', (req, res) => {
  const info = db.prepare('DELETE FROM upcdb_cache WHERE upc = ?').run(req.params.upc);
  res.json({ ok: true, deleted: info.changes > 0 });
});

// DELETE clear BarcodeLookup cache entry
app.delete('/api/cache/barcodelookup/:upc', (req, res) => {
  const info = db.prepare('DELETE FROM barcodelookup_cache WHERE upc = ?').run(req.params.upc);
  res.json({ ok: true, deleted: info.changes > 0 });
});

// DELETE clear Blu-ray.com cache entry
app.delete('/api/cache/bluray/:upc', (req, res) => {
  const upc = req.params.upc;
  console.log(`[Cache] Deleting Blu-ray.com cache for UPC: ${upc}`);
  const info = db.prepare('DELETE FROM bluray_cache WHERE upc = ?').run(upc);
  console.log(`[Cache] Deleted ${info.changes} row(s) from bluray_cache`);
  res.json({ ok: true, deleted: info.changes > 0 });
});

// DELETE cached image
app.delete('/api/movies/:id/cached-image', (req, res) => {
  const { image_url } = req.body;
  if (!image_url) {
    return res.status(400).json({ error: 'image_url required' });
  }

  // Delete from database
  const info = db.prepare('DELETE FROM cached_images WHERE movie_id = ? AND image_url = ?')
    .run(req.params.id, image_url);

  // Delete file if it's a local /images/ path
  if (image_url.startsWith('/images/')) {
    const filename = image_url.replace('/images/', '');
    const filepath = path.join(IMAGES_DIR, filename);
    if (fs.existsSync(filepath)) {
      try {
        fs.unlinkSync(filepath);
        console.log(`Deleted cached image: ${filename}`);
      } catch (e) {
        console.warn(`Failed to delete image file: ${e.message}`);
      }
    }
  }

  res.json({ ok: true, deleted: info.changes > 0 });
});

// Stats
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM movies').get();
  const spent = db.prepare('SELECT SUM(price_paid) as total FROM movies').get();
  const genres = db.prepare("SELECT genre FROM movies WHERE genre IS NOT NULL").all();
  res.json({
    total: total.count,
    total_spent: spent.total || 0,
    genres: [...new Set(genres.flatMap(g => g.genre.split(', ')))].filter(Boolean),
  });
});

// Cache management endpoints
const { retryImageCache, resetImageCache } = require('./utils/resetCache');

app.get('/api/cache/retry-images', requireAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    await retryImageCache(DB_PATH, IMAGES_DIR, TMDB_API_KEY, (item) => {
      res.write(`data: ${JSON.stringify(item)}\n\n`);
    });

    res.write('data: {"done":true}\n\n');
    res.end();
  } catch (err) {
    console.error('Retry image cache error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

app.get('/api/cache/reset-images', requireAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    if (!TMDB_API_KEY) {
      res.write(`data: ${JSON.stringify({ error: 'TMDB_API_KEY is required' })}\n\n`);
      res.end();
      return;
    }

    await resetImageCache(DB_PATH, IMAGES_DIR, TMDB_API_KEY, (item) => {
      res.write(`data: ${JSON.stringify(item)}\n\n`);
    });

    res.write('data: {"done":true}\n\n');
    res.end();
  } catch (err) {
    console.error('Reset image cache error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});

// Fallback to React app
app.get('*', (req, res) => {
  const index = path.join(clientBuild, 'index.html');
  if (fs.existsSync(index)) res.sendFile(index);
  else res.status(404).send('Frontend not built');
});

app.listen(PORT, () => console.log(`DVDRack running on port ${PORT}`));
