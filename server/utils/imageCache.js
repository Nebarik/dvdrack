const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

async function cacheImage(imageUrl, imagesDir) {
  if (!imageUrl) return null;

  const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
  const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
  const filename = `${hash}${ext}`;
  const filepath = path.join(imagesDir, filename);

  // Always return relative path - client will prepend server URL
  const imagePath = `/images/${filename}`;

  if (fs.existsSync(filepath)) {
    return imagePath;
  }

  return new Promise((resolve) => {
    try {
      const urlObj = new URL(imageUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'DVDRack/1.0',
          'Accept': 'image/*'
        },
        timeout: 30000, // 30 second timeout
        // Force IPv4 to avoid IPv6 issues
        family: 4
      };

      console.log(`[ImageCache] Fetching: ${imageUrl}`);

      const req = protocol.request(options, (res) => {
        if (res.statusCode !== 200) {
          console.warn(`[ImageCache] HTTP ${res.statusCode} for ${imageUrl}`);
          resolve(imageUrl);
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(filepath, buffer);
            console.log(`[ImageCache] ✓ Cached: ${filename} (${buffer.length} bytes)`);
            resolve(imagePath);
          } catch (writeError) {
            console.error(`[ImageCache] Write error:`, writeError.message);
            resolve(imageUrl);
          }
        });
      });

      req.on('error', (err) => {
        console.error('[ImageCache] Request error:', {
          url: imageUrl,
          error: err.message,
          code: err.code,
          errno: err.errno
        });
        resolve(imageUrl);
      });

      req.on('timeout', () => {
        console.error('[ImageCache] Timeout:', imageUrl);
        req.destroy();
        resolve(imageUrl);
      });

      req.end();
    } catch (e) {
      console.error('[ImageCache] Setup error:', {
        url: imageUrl,
        error: e.message
      });
      resolve(imageUrl);
    }
  });
}

module.exports = { cacheImage };
