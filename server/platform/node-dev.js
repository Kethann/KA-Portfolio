// HOST ADAPTER: LOCAL DEVELOPMENT (`npm start`). Serves the site the same way Vercel does
// (static files + /api/* through server/handler.js). Without DATABASE_URL it uses a local PGlite
// database and local file storage under .data/, so no accounts are needed to work on the site.
import { config } from 'dotenv';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { setEnvSource, env } from '../core/env.js';
import { setDatabase, wrapPglite } from '../core/db.js';
import { getStorage } from '../core/storage.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
config({ path: resolve(root, '.env') });
setEnvSource(process.env);

const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.avif':'image/avif', '.svg':'image/svg+xml',
  '.gif':'image/gif', '.ico':'image/x-icon', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.otf':'font/otf', '.glb':'model/gltf-binary',
  '.mp4':'video/mp4', '.webm':'video/webm', '.txt':'text/plain; charset=utf-8', '.zip':'application/zip', '.pdf':'application/pdf', '.gz':'application/gzip' };
const SECURITY = { 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'X-Frame-Options':'SAMEORIGIN' };

export async function createDevServer({ port = Number(env('PORT', 9878)), host = env('HOST', '127.0.0.1'), dataDir = env('KA_DATA_DIR', resolve(root, '.data')) } = {}){
  process.env.KA_DATA_DIR = dataDir;
  let pg = null;
  if (!env('DATABASE_URL')){
    const { openPglite } = await import('../dev/pglite.js');
    await mkdir(dataDir, { recursive: true });
    pg = await openPglite(resolve(dataDir, 'pglite'));
    setDatabase(wrapPglite(pg));
  }
  const { handle } = await import('../handler.js');
  const platform = {
    name: 'node-dev',
    clientIp: (request) => request.__ip || null,
    // pretend location for testing country-based pricing: KA_DEV_COUNTRY=IN npm start
    geo: () => env('KA_DEV_COUNTRY') ? { country: env('KA_DEV_COUNTRY'), region: null, city: null, timezone: null, provider: 'dev' } : null
  };

  async function sendFile(res, file, cache){
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) return false;
    // ETag like the hosts send, so a no-cache file costs a tiny 304 on reload instead of a full download
    const etag = `W/"${s.size.toString(36)}-${Math.floor(s.mtimeMs).toString(36)}"`;
    const headers = { ...SECURITY, 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache, ETag: etag };
    if (cache !== 'no-store' && res.req?.headers['if-none-match'] === etag){ res.writeHead(304, headers); res.end(); return true; }
    res.writeHead(200, { ...headers, 'Content-Length': s.size });
    createReadStream(file).pipe(res);
    return true;
  }
  function inside(base, rel){
    const full = resolve(base, '.' + sep + rel);
    return full.startsWith(base + sep) ? full : null;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const path = decodeURIComponent(url.pathname);
      if (path.startsWith('/api/') || path === '/legal' || path.startsWith('/legal/')){
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
        const request = new Request(url, { method: req.method, headers, body: hasBody ? Readable.toWeb(req) : undefined, ...(hasBody ? { duplex: 'half' } : {}) });
        request.__ip = req.socket.remoteAddress;
        const response = await handle(request, platform);
        const out = {};
        response.headers.forEach((v, k) => { out[k] = v; });
        const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
        if (cookies.length) out['set-cookie'] = cookies;
        res.writeHead(response.status, out);
        if (!response.body) return res.end();
        Readable.fromWeb(response.body).pipe(res);
        return;
      }
      // local storage (stands in for Supabase Storage URLs)
      if (path.startsWith('/__storage/') || path.startsWith('/__storage-upload/')){
        const storage = getStorage();
        const upload = path.startsWith('/__storage-upload/');
        const rest = path.slice(upload ? '/__storage-upload/'.length : '/__storage/'.length);
        const bucket = rest.split('/')[0], objectPath = rest.slice(bucket.length + 1);
        if (storage.kind !== 'local'){ res.writeHead(404); return res.end(); }
        if (upload){
          if (req.method !== 'PUT' || !storage.verify('upload', bucket, objectPath, url.searchParams.get('exp'), url.searchParams.get('sig'))){ res.writeHead(403); return res.end(); }
          const chunks = []; let size = 0;
          for await (const c of req){ size += c.length; if (size > 50 * 1024 * 1024){ res.writeHead(413); return res.end(); } chunks.push(c); }
          await storage.put(bucket, objectPath, Buffer.concat(chunks));
          res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
        }
        const isPublic = bucket === 'media';
        if (!isPublic && !storage.verify('get', bucket, objectPath, url.searchParams.get('exp'), url.searchParams.get('sig'))){ res.writeHead(403); return res.end(); }
        const file = inside(resolve(storage.root, bucket), objectPath);
        const dl = url.searchParams.get('download');
        if (dl) res.setHeader('Content-Disposition', `attachment; filename="${dl.replace(/["\\\r\n]/g, '')}"`);
        if (file && await sendFile(res, file, isPublic ? 'public, max-age=300' : 'no-store')) return;
        res.writeHead(404); return res.end();
      }
      if (path === '/' || path === '/index.html' || path === '/crystal'){
        if (await sendFile(res, resolve(root, 'index.html'), 'no-cache')) return;
      }
      for (const [prefix, base, cache] of [['/dist/assets/', resolve(root, 'dist/assets'), 'no-cache'], ['/assets/', resolve(root, 'dist/assets'), 'no-cache'],
        ['/images/', resolve(root, 'images'), 'public, max-age=86400, stale-while-revalidate=604800'], ['/portal/', resolve(root, 'dist/portal'), 'no-store']]){
        if (path.startsWith(prefix)){
          let rel = path.slice(prefix.length) || 'index.html';
          if (prefix === '/portal/' && !extname(rel)) rel = 'index.html';     // single-page app
          const file = inside(base, rel);
          if (file && await sendFile(res, file, cache)) return;
        }
      }
      if (path === '/creator' || path === '/creator/'){
        res.writeHead(301, { Location: '/portal/' }); return res.end();
      }
      if (path === '/portal'){ res.writeHead(301, { Location: '/portal/' }); return res.end(); }
      for (const f of ['robots.txt', 'favicon.ico', 'manifest.webmanifest']) if (path === '/' + f){ const file = resolve(root, 'dist', f); if (await sendFile(res, file, 'public, max-age=3600')) return; }
      res.writeHead(404, { ...SECURITY, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (err){
      console.error('[dev] request failed:', err && err.message);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Server error');
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, host, ok); });
  // Stops accepting requests, then closes the local database so its files are released.
  server.shutdown = async () => {
    await new Promise((ok) => server.close(() => ok()));
    if (pg){ await pg.close(); setDatabase(null); }
  };
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  createDevServer().then((server) => {
    const { port, address } = server.address();
    console.log(`Site:    http://${address}:${port}\nPortal:  http://${address}:${port}/portal/`);
    if (!env('DATABASE_URL')) console.log('Data:    local PGlite database + storage in .data/ (set DATABASE_URL to use Supabase)');
    const stop = () => server.shutdown().then(() => process.exit(0));
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch((err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${env('PORT', 8787)} is already in use (is another copy running?).` : `Could not start: ${err.message}`);
    process.exitCode = 1;
  });
}
