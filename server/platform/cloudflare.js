// HOST ADAPTER: CLOUDFLARE WORKERS. Everything Cloudflare-specific lives here:
//   * environment variables and secrets come from the Worker `env` (wrangler.jsonc vars + dashboard secrets)
//   * the database is the D1 binding DB, files are the R2 binding FILES
//   * the client IP is cf-connecting-ip; approximate location comes from request.cf (free, no lookups)
//   * /api/*, /legal, /license and the file links (/__storage, /__storage-upload) run here; every other path is a
//     static file served by Cloudflare directly (wrangler.jsonc "assets"), without running the Worker.
//   * the daily and weekly jobs run from Cron Triggers.
import { setEnvSource } from '../core/env.js';
import { setDatabase, d1Driver } from '../core/db.js';
import { setStorage, r2Storage, BUCKETS } from '../core/storage.js';
import { handle } from '../handler.js';
import * as cron from '../handlers/cron.js';

let boundTo = null;
function init(env){
  if (boundTo === env.DB) return;
  const vars = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') vars[k] = v;
  setEnvSource({ KA_ENV: 'production', ...vars, KA_PLATFORM: 'cloudflare' });
  if (!env.DB) throw new Error('The D1 binding "DB" is missing (wrangler.jsonc).');
  setDatabase(d1Driver(env.DB));
  if (env.FILES) setStorage(r2Storage(env.FILES, vars.DOWNLOAD_TOKEN_SECRET));
  boundTo = env.DB;
}

export const platform = {
  name: 'cloudflare',
  clientIp: (request) => request.headers.get('cf-connecting-ip') || null,
  geo(request){
    const cf = request.cf;
    if (!cf || !cf.country || cf.country === 'T1') return null;   // T1 = Tor
    // everything Cloudflare's network knows about the connection (IP-based: city-level, no permission popup)
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
    return { country: cf.country, region: cf.region || null, city: cf.city || null, timezone: cf.timezone || null, provider: 'cloudflare',
      postal: cf.postalCode || null, latitude: num(cf.latitude), longitude: num(cf.longitude), isp: cf.asOrganization || null, continent: cf.continent || null };
  }
};

const SECURITY = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
const MAX_UPLOAD = 95 * 1024 * 1024;   // a Worker accepts request bodies up to 100 MB on the free plan
const text = (status, body) => new Response(body, { status, headers: { ...SECURITY, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

// Files in R2: public media (cached at the edge for a year: every upload gets a new name), and private
// deliverables/backups behind a signed, short-lived link. Range requests work, so big downloads can resume.
async function storageRequest(request, env, ctx, url){
  const storage = r2Storage(env.FILES, env.DOWNLOAD_TOKEN_SECRET);
  const upload = url.pathname.startsWith('/__storage-upload/');
  const rest = decodeURIComponent(url.pathname.slice(upload ? '/__storage-upload/'.length : '/__storage/'.length));
  const bucket = rest.split('/')[0], path = rest.slice(bucket.length + 1);
  if (!BUCKETS[bucket] || !/^[A-Za-z0-9._/-]{1,300}$/.test(path) || path.includes('..')) return text(404, 'Not found');

  if (upload){
    if (!storage.verify('upload', bucket, path, url.searchParams.get('exp'), url.searchParams.get('sig'))) return text(403, 'This upload link has expired. Try again.');
    const key = `${bucket}/${path}`;
    const reply = (o) => new Response(JSON.stringify(o), { status: 200, headers: { ...SECURITY, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    const size = Number(request.headers.get('content-length') || 0);
    // Big files (any size up to R2's 5 TiB): POST ?mpu=start -> PUT ?uploadId&part=N (each <= 95 MB) -> POST ?uploadId&mpu=complete
    const step = url.searchParams.get('mpu'), uploadId = url.searchParams.get('uploadId');
    if (request.method === 'POST' && step === 'start'){
      const m = await env.FILES.createMultipartUpload(key, { httpMetadata: { contentType: url.searchParams.get('type') || 'application/octet-stream' } });
      return reply({ uploadId: m.uploadId });
    }
    if (uploadId){
      const m = env.FILES.resumeMultipartUpload(key, uploadId);
      if (request.method === 'PUT'){
        const n = Number(url.searchParams.get('part'));
        if (!Number.isInteger(n) || n < 1 || n > 10000) return text(400, 'Bad part number.');
        if (!size || size > MAX_UPLOAD) return text(413, 'This part is too large.');
        const part = await m.uploadPart(n, request.body);
        return reply({ part: part.partNumber, etag: part.etag });
      }
      if (request.method === 'POST' && step === 'complete'){
        const body = await request.json().catch(() => ({}));
        const parts = (Array.isArray(body.parts) ? body.parts : []).map(x => ({ partNumber: Number(x.part), etag: String(x.etag) })).sort((x, y) => x.partNumber - y.partNumber);
        if (!parts.length) return text(400, 'No parts.');
        await m.complete(parts);
        return reply({ ok: true });
      }
      if (request.method === 'DELETE'){ await m.abort().catch(() => {}); return reply({ ok: true }); }
    }
    if (request.method !== 'PUT') return text(405, 'Method not allowed');
    if (!size || size > MAX_UPLOAD) return text(413, 'This file is too large to upload in one go.');
    await env.FILES.put(key, request.body, { httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' } });
    return reply({ ok: true });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Method not allowed');
  const isPublic = BUCKETS[bucket].public;
  if (!isPublic && !storage.verify('get', bucket, path, url.searchParams.get('exp'), url.searchParams.get('sig'))) return text(403, 'This link has expired.');
  const cache = caches.default;
  if (isPublic && request.method === 'GET' && !request.headers.has('range')){
    const hit = await cache.match(request);
    if (hit) return hit;
  }
  const obj = await env.FILES.get(`${bucket}/${path}`, { range: request.headers, onlyIf: request.headers });
  if (!obj) return text(404, 'Not found');
  const headers = new Headers(SECURITY);
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  if (isPublic){
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Cross-Origin-Resource-Policy', 'same-site');
  } else {
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Robots-Tag', 'noindex');
    const dl = url.searchParams.get('download');
    headers.set('Content-Disposition', `attachment; filename="${(dl || path.split('/').pop()).replace(/["\\\r\n]/g, '')}"`);
  }
  if (!('body' in obj)) return new Response(null, { status: 304, headers });   // onlyIf matched (If-None-Match)
  let status = 200;
  if (obj.range && request.headers.has('range')){
    const { offset = 0, length = obj.size - offset } = obj.range;
    headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('Content-Length', String(length));
    status = 206;
  } else headers.set('Content-Length', String(obj.size));
  const res = new Response(request.method === 'HEAD' ? null : obj.body, { status, headers });
  if (isPublic && status === 200 && request.method === 'GET') ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx){
    try {
      init(env);
      const url = new URL(request.url);
      if (url.pathname.startsWith('/__storage/') || url.pathname.startsWith('/__storage-upload/')){
        if (!env.FILES) return text(503, 'File storage is not connected yet (R2 binding FILES).');
        return await storageRequest(request, env, ctx, url);
      }
      if (url.pathname.startsWith('/api/') || url.pathname === '/legal' || url.pathname.startsWith('/legal/') || url.pathname === '/license' || url.pathname.startsWith('/license/')) return await handle(request, platform);
      return env.ASSETS.fetch(request);   // anything else routed here by mistake: the static site
    } catch (err){
      console.error('[worker] request failed:', err && err.message);
      return text(500, 'Something went wrong. Please try again.');
    }
  },

  // Cron Triggers (wrangler.jsonc): 01:00 UTC daily, 02:00 UTC on Mondays.
  async scheduled(event, env, ctx){
    init(env);
    const job = event.cron === '0 2 * * 1' ? cron.weekly : event.cron === '*/15 * * * *' ? cron.social : cron.daily;
    ctx.waitUntil(job().then(r => r.text()).then(t => console.log(`[cron] ${event.cron}: ${t.slice(0, 300)}`)));
  }
};
