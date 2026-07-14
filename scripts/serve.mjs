// ============================================================
// serve.mjs — zero-dependency static file server
//
// The app is a static, offline-first PWA; it only needs a plain
// HTTP server for local preview (ES modules and JSON fetches are
// blocked over file://). index.html's file:// fallback points here
// at http://127.0.0.1:4174. Also used as the Playwright webServer.
//
//   node scripts/serve.mjs            # http://127.0.0.1:4174
//   PORT=8080 node scripts/serve.mjs
// ============================================================

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT) || 4174;
const host = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.mp3':  'audio/mpeg'
};

const server = createServer(async (req, res) => {
  try {
    // Strip query string, decode, and normalize to keep the request
    // inside the project root (no path traversal via ../).
    const urlPath = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
    let filePath = normalize(join(root, urlPath === '/' ? '/index.html' : urlPath));
    if (!filePath.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }

    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath)] || 'application/octet-stream',
      // Never let the browser cache during local development.
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Movement preview running at http://${host}:${port}/`);
});
