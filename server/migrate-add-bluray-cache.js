const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'movies.db');
const db = new Database(DB_PATH);

console.log('Running migration: Add bluray_cache table');

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bluray_cache (
      upc TEXT PRIMARY KEY,
      lookup_result TEXT,
      cached_at TEXT DEFAULT (datetime('now'))
    );
  `);

  console.log('✓ bluray_cache table created successfully');

  // Verify table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bluray_cache'").all();
  console.log('Verification:', tables.length > 0 ? 'Table exists' : 'Table NOT found');

} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
}

db.close();
console.log('Migration complete!');
