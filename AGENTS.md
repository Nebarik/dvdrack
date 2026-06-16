# 🤖 DVDRack Developer & Agent Guide

Welcome to the **DVDRack** agent guide. This document details the project's architecture, directory structure, data models, APIs, and key patterns. Use this to quickly understand the project before making coding changes.

---

## 1. Project Overview & Architecture

**DVDRack** (managed under the repository root `/Users/jason/repos/movieshelf`) is a self-hosted DVD, Blu-ray, and media collection tracker. It features mobile-friendly barcode scanning, automatic metadata fetching from multiple sources, and media collection management.

### Tech Stack
- **Frontend**: React (built with Vite), SPA routing via `react-router-dom`, ZXing library for barcode camera scanning, and custom styling with CSS variables. Capable of being packaged as a native Android app via Capacitor.
- **Backend**: Node.js Express server running on port `3001` (by default) with CommonJS modules.
- **Database**: SQLite database managed via `better-sqlite3` operating in WAL (Write-Ahead Logging) mode.
- **Deployment**: Dual-container Docker deployment (`client` container + `server` container) orchestrated via `docker-compose.yml`.

---

## 2. Directory Structure

- **`/client`**: Frontend React SPA.
  - [package.json](file:///Users/jason/repos/movieshelf/client/package.json): Package specifications (ZXing, Capacitor, React 18, Vite).
  - [vite.config.js](file:///Users/jason/repos/movieshelf/client/vite.config.js): Vite server proxy and output configurations.
  - `src/`: Core frontend code.
    - [main.jsx](file:///Users/jason/repos/movieshelf/client/src/main.jsx): React entry point.
    - [App.jsx](file:///Users/jason/repos/movieshelf/client/src/App.jsx): Main router and layout shell.
    - `pages/`:
      - [CollectionPage.jsx](file:///Users/jason/repos/movieshelf/client/src/pages/CollectionPage.jsx): Main shelf browser, grid/list view, filtering, and sorting.
      - [ScanPage.jsx](file:///Users/jason/repos/movieshelf/client/src/pages/ScanPage.jsx): Camera scanner (via ZXing) and manual barcode entry, supporting bulk queuing.
      - [MovieDetail.jsx](file:///Users/jason/repos/movieshelf/client/src/pages/MovieDetail.jsx): Detailed info editor for `media_type === 'movie'`.
      - [TvDetail.jsx](file:///Users/jason/repos/movieshelf/client/src/pages/TvDetail.jsx): Detailed info manager for `media_type === 'tv'`, grouping seasons and show editions.
      - [ServerConfigPage.jsx](file:///Users/jason/repos/movieshelf/client/src/pages/ServerConfigPage.jsx): Server URL configuration for native build apps (Capacitor).
    - `components/`: UI components (navigation, poster image handler, etc.).
    - [index.css](file:///Users/jason/repos/movieshelf/client/src/index.css): CSS variables for dark mode and global styles.
  - `android/`: Capacitor native Android project configuration.
- **`/server`**: Backend Express API.
  - [index.js](file:///Users/jason/repos/movieshelf/server/index.js): App initialization, SQLite database creation, API routes, middleware, and image caching logic.
  - `services/`: Downstream metadata and UPC providers:
    - [tmdb.js](file:///Users/jason/repos/movieshelf/server/services/tmdb.js): Search & details query for TMDb (The Movie Database).
    - [upcitemdb.js](file:///Users/jason/repos/movieshelf/server/services/upcitemdb.js): Free UPC Lookup API and image web scraper.
    - [upcdatabase.js](file:///Users/jason/repos/movieshelf/server/services/upcdatabase.js): Premium barcode search (key-based).
    - [barcodelookup.js](file:///Users/jason/repos/movieshelf/server/services/barcodelookup.js): Barcode Lookup API (key-based).
    - [bluray.js](file:///Users/jason/repos/movieshelf/server/services/bluray.js): Scraper for Blu-ray.com titles and cover graphics.
  - `utils/`: Common utilities:
    - [titleParser.js](file:///Users/jason/repos/movieshelf/server/utils/titleParser.js): Extracts media properties (editions, seasons) and cleans titles.
    - [imageCache.js](file:///Users/jason/repos/movieshelf/server/utils/imageCache.js): Saves network images to host storage for offline support.
    - [resetCache.js](file:///Users/jason/repos/movieshelf/server/utils/resetCache.js): Image caching status retries and resets.
- **`/data`**: Volume mounts for SQLite `movies.db` and `/images` (generated dynamically).

---

## 3. Database Schema

The SQLite database schema is defined in [server/index.js](file:///Users/jason/repos/movieshelf/server/index.js#L36-L89):

### `movies` Table
Stores added titles in the shelf collection.

| Column | Type | Description |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Internal database row ID. |
| `upc` | `TEXT UNIQUE NOT NULL` | Barcode UPC/EAN (or `MANUAL_[md5_hash]` for manually-added titles). |
| `title` | `TEXT NOT NULL` | Cleaned title (e.g. "Aliens"). |
| `year` | `INTEGER` | Release year. |
| `director` | `TEXT` | Director name (for movies) or Creator name (for TV shows). |
| `genre` | `TEXT` | Comma-separated genre list. |
| `poster_url` | `TEXT` | Local relative image path (`/images/filename.jpg`) or external fallback URL. |
| `runtime` | `INTEGER` | Runtime in minutes. |
| `tmdb_id` | `INTEGER` | Associated TMDb ID (used to match across editions or group TV seasons). |
| `overview` | `TEXT` | Plot synopsis. |
| `price_paid` | `REAL` | Purchase cost. |
| `edition` | `TEXT` | Extracted/assigned media attributes (e.g. "4K UHD + Steelbook"). |
| `media_type` | `TEXT` | `'movie'` or `'tv'`. |
| `seasons` | `INTEGER` | Total seasons count (TV shows only). |
| `episodes` | `INTEGER` | Total episodes count (TV shows only). |
| `season_info` | `TEXT` | Specific season description (e.g., "Season 3", "Complete Series"). |
| `date_added` | `TEXT` | UTC timestamp of addition (`DEFAULT (datetime('now'))`). |

### Cache Tables
Caches external UPC service calls to minimize API credit consumption.
- `upc_cache` (UPCItemDB)
- `upcdb_cache` (UPCDatabase)
- `barcodelookup_cache` (BarcodeLookup)
- `bluray_cache` (Blu-ray.com Web Scrape)

### `cached_images` Table
Tracks local downloaded image assets linked to collection entries.
- Fields: `id`, `movie_id` (foreign key), `image_url` (local path), `source` (TMDb or UPC provider), and `cached_at`.

---

## 4. Key Server Code Patterns

### Metadata Resolution Flow
When looking up a barcode (`/api/lookup`), the server performs a two-tier lookup:
1. **UPC Lookup**: Looks up the barcode in the configured provider (e.g., `UPCitemdb`, `Blu-ray.com`, `Barcode Lookup`). This provides a raw retail title (e.g., `"Aliens Blu-ray (Australia) (2 Discs)"`).
2. **Title Parsing**:
   - Matches raw text against patterns in [titleParser.js](file:///Users/jason/repos/movieshelf/server/utils/titleParser.js) to extract attributes like `edition` (e.g., "Blu-ray") and `season_info` (e.g., "Season 3").
   - Cleans the title to form a clean search term (e.g. `"Aliens"`).
3. **TMDb Query**: Searches TMDb using the cleaned title.
   - If TMDb finds a matching TV show or movie, it returns high-quality metadata (genres, director, synopsis, year, TMDB ID, and high-resolution posters).
   - If TMDb is unsuccessful, the movie is marked as `not_found` but retains details (like the UPC, extracted edition, and parsed title) for manual fallback entry.

### Image Caching Utility
External poster links from TMDb or barcode services are downloaded and saved inside the `/data/images/` directory using [server/utils/imageCache.js](file:///Users/jason/repos/movieshelf/server/utils/imageCache.js). This ensures that the application displays all media covers when running fully offline on local networks.

---

## 5. API Endpoints Reference

All routes (except `/api/health` and `/api/config`) apply the `requireAuth` middleware, which checks for a `Bearer` token matching the `API_TOKEN` environment variable.

| Method | Path | Description |
|---|---|---|
| **GET** | `/api/health` | Service health status. |
| **GET** | `/api/config` | Returns boolean flags indicating which API keys are configured on the server. |
| **GET** | `/api/movies` | Fetch shelf collection. Supports query parameters `?search=`, `?genre=`, `?media_type=`, `?sort_by=`, and `?sort_order=`. |
| **GET** | `/api/movies/:id` | Fetch specific movie details, its editions, and cached image list. |
| **GET** | `/api/tv/:tmdb_id` | Fetch all season/edition entries under a specific TV show `tmdb_id`. |
| **POST** | `/api/lookup` | Query barcode details. Expects `{ upcs: [...], service: 'upcitemdb' }`. Can also search manual titles. |
| **POST** | `/api/lookup/upcdatabase` | Query barcode from UPCDatabase specifically. |
| **GET** | `/api/tmdb/search?q=...` | Direct search on TMDb (movies and TV shows) for manual shelf lookup. |
| **GET** | `/api/tmdb/:mediaType/:tmdbId` | Fetch full details for a TMDb entry (includes director, creator, runtime, etc.). |
| **GET** | `/api/tmdb/:mediaType/:tmdbId/posters` | Fetch list of alternative posters from TMDb. |
| **POST** | `/api/movies/batch` | Saves new items to collection and caches their images. |
| **PATCH** | `/api/movies/:id` | Update metadata fields. Caches new posters if TMDb URL is provided. |
| **DELETE** | `/api/movies/:id` | Remove item from collection. |
| **DELETE** | `/api/cache/:upc` | Delete UPCItemDB cache entry. |
| **DELETE** | `/api/cache/upcdb/:upc` | Delete UPCDatabase cache entry. |
| **DELETE** | `/api/cache/barcodelookup/:upc` | Delete BarcodeLookup cache entry. |
| **DELETE** | `/api/cache/bluray/:upc` | Delete Blu-ray.com cache entry. |
| **DELETE** | `/api/movies/:id/cached-image` | Deletes a cached image record and deletes its file from storage. |
| **GET** | `/api/stats` | Aggregate stats: total items, total cost spent, and genre lists. |
| **GET** | `/api/cache/retry-images` | SSE (Server-Sent Events) endpoint to redownload missing cached images. |
| **GET** | `/api/cache/reset-images` | SSE endpoint to wipe and refetch all collection posters from TMDb. |

---

## 6. Guidelines for Making Code Changes

### Server-Side Changes
- **Database Schema**: If updating the schema in [server/index.js](file:///Users/jason/repos/movieshelf/server/index.js), write corresponding migrations or run helper scripts (e.g. `migrate-add-bluray-cache.js`) for existing users.
- **CommonJS Usage**: The backend uses CommonJS modules (`require` / `module.exports`). Do not mix ESM imports into `/server` files unless refactoring the whole server stack.
- **Cache Conservation**: Respect the cache lookup databases (`upc_cache`, etc.). Always check the local SQLite cache before hitting third-party network APIs to avoid depleting API limits.

### Client-Side Changes
- **Styling Standards**: Utilize CSS variables from [client/src/index.css](file:///Users/jason/repos/movieshelf/client/src/index.css) to maintain dark theme coherence. Avoid adding unstyled inline properties or introducing Tailwind unless explicitly requested by the user.
- **Native Platform Checks**: Utilize `Capacitor.isNativePlatform()` to adjust features for the Capacitor Android shell (like forcing status bar colors, handling physical back buttons, or requiring server address configuration).
- **ESM Usage**: The frontend client uses ESM (`import`/`export`) and React JSX syntax.
- **Search & Filter State Preservation**: Active searches, sorting directions, and selected filters are preserved in `sessionStorage`. Detail navigation (e.g., going to a movie or TV show detail view) leverages `getPersistentCollection()` from [client/src/api/movies.js](file:///Users/jason/repos/movieshelf/client/src/api/movies.js) to retrieve the active list context for previous/next navigation buttons.

---

This guide is designed to assist you in working safely on **DVDRack**. Review the files linked above to understand implementation details before introducing updates.
