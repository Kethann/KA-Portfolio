// HOST ADAPTER: LOCAL DEVELOPMENT (`npm start`). Serves the site the same way the Cloudflare Worker does
// (static files + /api/* through server/handler.js), with a local SQLite database (the engine D1 runs)
// and local file storage under .data/, so no accounts are needed to work on the site.
import { config } from 'dotenv';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, rm } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { setEnvSource, env } from '../core/env.js';
import { setDatabase } from '../core/db.js';
import { getStorage } from '../core/storage.js';
import { validateEnv } from '../core/env-validate.js';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
config({ path: resolve(root, '.env') });
setEnvSource(process.env);
validateEnv();
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.avif':'image/avif', '.svg':'image/svg+xml',
  '.gif':'image/gif', '.ico':'image/x-icon', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.otf':'font/otf', '.glb':'model/gltf-binary',
  '.mp4':'video/mp4', '.webm':'video/webm', '.txt':'text/plain; charset=utf-8', '.zip':'application/zip', '.pdf':'application/pdf', '.gz':'application/gzip' };
const SECURITY = { 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'strict-origin-when-cross-origin', 'X-Frame-Options':'SAMEORIGIN' };

export async function createDevServer({ port = Number(env('PORT', 9878)), host = env('HOST', '127.0.0.1'), dataDir = env('KA_DATA_DIR', resolve(root, '.data')) } = {}){
  process.env.KA_DATA_DIR = dataDir;
  const { openSqlite } = await import('../dev/sqlite.js');
  await mkdir(dataDir, { recursive: true });
  const pg = openSqlite(resolve(dataDir, 'ka.sqlite'));
  setDatabase(pg);
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
      if (path.startsWith('/api/') || path === '/legal' || path.startsWith('/legal/') || path === '/license' || path.startsWith('/license/')){
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
          if (!storage.verify('upload', bucket, objectPath, url.searchParams.get('exp'), url.searchParams.get('sig'))){ res.writeHead(403); return res.end(); }
          const reply = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
          const readBody = async (limit) => { const chunks = []; let size = 0; for await (const c of req){ size += c.length; if (size > limit) return null; chunks.push(c); } return Buffer.concat(chunks); };
          const LIMIT = 95 * 1024 * 1024;   // same per-request limit as a Cloudflare Worker
          // chunked uploads, same protocol as the Worker (R2 multipart): parts kept in .data/storage/.uploads/<id>/
          const step = url.searchParams.get('mpu'), uploadId = url.searchParams.get('uploadId');
          const partsDir = (id) => inside(resolve(storage.root, '.uploads'), id);
          if (req.method === 'POST' && step === 'start'){
            const id = randomBytes(12).toString('hex');
            await mkdir(partsDir(id), { recursive: true });
            await writeFile(resolve(partsDir(id), 'target.json'), JSON.stringify({ bucket, objectPath }));
            return reply({ uploadId: id });
          }
          if (uploadId){
            if (!/^[a-f0-9]{24}$/.test(uploadId)){ res.writeHead(400); return res.end(); }
            const dir = partsDir(uploadId);
            if (req.method === 'PUT'){
              const n = Number(url.searchParams.get('part'));
              if (!Number.isInteger(n) || n < 1 || n > 10000){ res.writeHead(400); return res.end(); }
              const body = await readBody(LIMIT); if (!body){ res.writeHead(413); return res.end(); }
              await writeFile(resolve(dir, String(n)), body);
              return reply({ part: n, etag: createHash('md5').update(body).digest('hex') });
            }
            if (req.method === 'POST' && step === 'complete'){
              const { parts = [] } = JSON.parse((await readBody(1024 * 1024)).toString() || '{}');
              const file = inside(resolve(storage.root, bucket), objectPath);
              await mkdir(dirname(file), { recursive: true });
              const out = createWriteStream(file);
              for (const x of [...parts].sort((p, q) => p.part - q.part)) await pipeline(createReadStream(resolve(dir, String(Number(x.part)))), out, { end: false });
              await new Promise((ok, fail) => out.end((e) => e ? fail(e) : ok()));
              await rm(dir, { recursive: true, force: true });
              return reply({ ok: true });
            }
            if (req.method === 'DELETE'){ await rm(dir, { recursive: true, force: true }); return reply({ ok: true }); }
          }
          if (req.method !== 'PUT'){ res.writeHead(405); return res.end(); }
          const body = await readBody(LIMIT); if (!body){ res.writeHead(413); return res.end(); }
          await storage.put(bucket, objectPath, body);
          return reply({ ok: true });
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
    console.log('Data:    local SQLite database (.data/ka.sqlite) + storage in .data/');
    const stop = () => server.shutdown().then(() => process.exit(0));
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  }).catch((err) => {
    console.error(err.code === 'EADDRINUSE' ? `Port ${env('PORT', 8787)} is already in use (is another copy running?).` : `Could not start: ${err.message}`);
    process.exitCode = 1;
  });
}
