// File storage. Buckets:
//   media        public   product images, tip covers, portfolio uploads
//   deliverables private  files buyers download (only ever through short-lived signed URLs)
//   backups      private  weekly database exports
// Production: Supabase Storage over its REST API with the service-role key (server only).
// Local development and tests: files under .data/storage, signed URLs served by the dev server.
import { env, localDataDir } from './env.js';
import { hmacHex, safeEqual } from './crypto.js';
import { mkdir, writeFile, readFile, rm, stat, readdir } from 'node:fs/promises';
import { dirname, sep } from 'node:path';

// Plain string joins, not path.resolve(): see the note in email.js about Vercel's file tracer.
const at = (...parts) => parts.join(sep);

export const BUCKETS = { media: { public: true }, deliverables: { public: false }, backups: { public: false } };

function assertPath(bucket, path){
  if (!BUCKETS[bucket]) throw new Error('Unknown bucket.');
  if (typeof path !== 'string' || !/^[A-Za-z0-9._/-]{1,300}$/.test(path) || path.includes('..') || path.startsWith('/')) throw new Error('Invalid storage path.');
}

let driver = null;
export function setStorage(d){ driver = d; }
export function getStorage(){
  if (driver) return driver;
  driver = env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY') ? supabaseStorage() : localStorage(localDataDir('File storage (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)'));
  return driver;
}

function supabaseStorage(){
  const base = env('SUPABASE_URL').replace(/\/+$/, '') + '/storage/v1';
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const auth = { Authorization: `Bearer ${key}`, apikey: key };
  async function call(method, path, body, headers = {}){
    const res = await fetch(base + path, { method, headers: { ...auth, ...headers }, body });
    if (!res.ok){
      const detail = await res.text().catch(() => '');
      const err = new Error(`Storage ${method} failed (${res.status}).`);
      err.status = res.status; err.detail = detail.slice(0, 200);
      throw err;
    }
    return res;
  }
  const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
  return {
    kind: 'supabase',
    async put(bucket, path, bytes, contentType){
      assertPath(bucket, path);
      await call('POST', `/object/${bucket}/${enc(path)}`, bytes, { 'Content-Type': contentType || 'application/octet-stream', 'x-upsert': 'true' });
    },
    async get(bucket, path){
      assertPath(bucket, path);
      const res = await call('GET', `/object/${bucket}/${enc(path)}`);
      return Buffer.from(await res.arrayBuffer());
    },
    async remove(bucket, paths){
      paths.forEach((p) => assertPath(bucket, p));
      if (paths.length) await call('DELETE', `/object/${bucket}`, JSON.stringify({ prefixes: paths }), { 'Content-Type': 'application/json' });
    },
    publicUrl(bucket, path){
      assertPath(bucket, path);
      if (!BUCKETS[bucket].public) throw new Error('This bucket is private.');
      return `${base}/object/public/${bucket}/${enc(path)}`;
    },
    // Short-lived download link for a private object. `download` sets the saved filename.
    async signedUrl(bucket, path, expiresInSeconds, download){
      assertPath(bucket, path);
      const res = await call('POST', `/object/sign/${bucket}/${enc(path)}`, JSON.stringify({ expiresIn: expiresInSeconds }), { 'Content-Type': 'application/json' });
      const { signedURL } = await res.json();
      const u = new URL(base + signedURL);
      if (download) u.searchParams.set('download', download);
      return u.toString();
    },
    // One-time upload URL so large files go straight from the portal to storage (never through
    // a serverless function, which has a small body limit).
    async signedUploadUrl(bucket, path){
      assertPath(bucket, path);
      const res = await call('POST', `/object/upload/sign/${bucket}/${enc(path)}`, '{}', { 'Content-Type': 'application/json', 'x-upsert': 'true' });
      const { url } = await res.json();
      return { url: base + url, method: 'PUT' };
    },
    async usage(bucket){
      let bytes = 0, count = 0;
      async function walk(prefix){
        for (let offset = 0; ; offset += 1000){
          const res = await call('POST', `/object/list/${bucket}`, JSON.stringify({ prefix, limit: 1000, offset }), { 'Content-Type': 'application/json' });
          const items = await res.json();
          for (const it of items){
            if (it.id === null) await walk(prefix ? `${prefix}/${it.name}` : it.name);
            else { count++; bytes += Number(it.metadata?.size || 0); }
          }
          if (items.length < 1000) break;
        }
      }
      await walk('');
      return { bytes, count };
    }
  };
}

// Local driver: same interface, signed URLs are HMAC-protected paths the dev server serves.
export function localStorage(dataDir){
  const root = at(dataDir, 'storage');
  const secret = env('DOWNLOAD_TOKEN_SECRET', 'local-development-only');
  const file = (bucket, path) => {
    assertPath(bucket, path);
    // assertPath allows only [A-Za-z0-9._/-], no '..' and no leading '/', so this stays inside the bucket
    return at(root, bucket, ...path.split('/'));
  };
  return {
    kind: 'local',
    root,
    async put(bucket, path, bytes){ const f = file(bucket, path); await mkdir(dirname(f), { recursive: true }); await writeFile(f, bytes); },
    async get(bucket, path){ return readFile(file(bucket, path)); },
    async remove(bucket, paths){ for (const p of paths) await rm(file(bucket, p), { force: true }); },
    publicUrl(bucket, path){ assertPath(bucket, path); if (!BUCKETS[bucket].public) throw new Error('This bucket is private.'); return `/__storage/${bucket}/${path}`; },
    async signedUrl(bucket, path, expiresInSeconds, download){
      assertPath(bucket, path);
      const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const sig = hmacHex(secret, `${bucket}/${path}:${exp}`);
      return `/__storage/${bucket}/${path}?exp=${exp}&sig=${sig}${download ? `&download=${encodeURIComponent(download)}` : ''}`;
    },
    async signedUploadUrl(bucket, path){
      assertPath(bucket, path);
      const exp = Math.floor(Date.now() / 1000) + 600;
      const sig = hmacHex(secret, `upload:${bucket}/${path}:${exp}`);
      return { url: `/__storage-upload/${bucket}/${path}?exp=${exp}&sig=${sig}`, method: 'PUT' };
    },
    verify(kind, bucket, path, exp, sig){
      const expected = hmacHex(secret, `${kind === 'upload' ? 'upload:' : ''}${bucket}/${path}:${exp}`);
      return Number(exp) >= Math.floor(Date.now() / 1000) && safeEqual(expected, String(sig || ''));
    },
    async usage(bucket){
      let bytes = 0, count = 0;
      async function walk(dir){
        let entries = [];
        try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries){
          const p = at(dir, e.name);
          if (e.isDirectory()) await walk(p); else { count++; bytes += (await stat(p)).size; }
        }
      }
      await walk(at(root, bucket));
      return { bytes, count };
    }
  };
}
