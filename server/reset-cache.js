#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { retryImageCache, resetImageCache } = require('./utils/resetCache');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'movies.db');
const IMAGES_DIR = path.join(path.dirname(DB_PATH), 'images');
const TMDB_API_KEY = process.env.TMDB_API_KEY || '';

const command = process.argv[2];

async function main() {
  if (!command) {
    console.log('Usage:');
    console.log('  node reset-cache.js retry    - Retry caching TMDb URLs that are not cached locally');
    console.log('  node reset-cache.js reset    - Delete all cached images and re-lookup from TMDb');
    process.exit(1);
  }

  console.log(`Database: ${DB_PATH}`);
  console.log(`Images dir: ${IMAGES_DIR}`);
  console.log('');

  try {
    if (command === 'retry') {
      const result = await retryImageCache(DB_PATH, IMAGES_DIR, TMDB_API_KEY);
      console.log(`\nSummary: ${result.success} success, ${result.failed} failed`);
    } else if (command === 'reset') {
      if (!TMDB_API_KEY) {
        console.error('Error: TMDB_API_KEY is required for reset operation');
        process.exit(1);
      }

      console.log('⚠️  WARNING: This will delete all cached images and re-lookup from TMDb');
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

      await new Promise(resolve => setTimeout(resolve, 5000));

      const result = await resetImageCache(DB_PATH, IMAGES_DIR, TMDB_API_KEY);
      console.log(`\nSummary: ${result.success} success, ${result.failed} failed`);
    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
