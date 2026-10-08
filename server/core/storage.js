// File storage. Buckets:
//   media        public   product images, tip covers, portfolio uploads
//   deliverables private  files buyers download (only ever through short-lived signed URLs)
//   backups      private  weekly database exports
// Production: Cloudflare R2 through the Worker's FILES binding (see r2Storage).
// Local development and tests: files under .data/storage, served by the dev server.
import { env, localDataDir } from './env.js';
import { hmacHex, safeEqual } from './crypto.js';
import { mkdir, writeFile, readFile, rm, stat, readdir, open as openFile } from 'node:fs/promises';
import { dirname, sep } from 'node:path';

const at = (...parts) => parts.join(sep);

export const BUCKETS = { media: { public: true }, deliverables: { public: false }, backups: { public: false } };

// reads a stream into memory, refusing more than `limit` bytes (only for bodies whose length isn't known)
async function readAll(stream, limit){
  const reader = stream.getReader(), parts = []; let total = 0;
  for (;;){
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit){ try { await reader.cancel(); } catch {} throw Object.assign(new Error('The file is too large to copy without a known size.'), { code: 'too_large' }); }
    parts.push(value);
  }
  const out = new Uint8Array(total); let o = 0; for (const p of parts){ out.set(p, o); o += p.byteLength; }
  return out;
}
const UNKNOWN_LENGTH_LIMIT = 95 * 1024 * 1024;

function assertPath(bucket, path){
  if (!BUCKETS[bucket]) throw new Error('Unknown bucket.');
  if (typeof path !== 'string' || !/^[A-Za-z0-9._/-]{1,300}$/.test(path) || path.includes('..') || path.startsWith('/')) throw new Error('Invalid storage path.');
}

let driver = null;
export function setStorage(d){ driver = d; }
export function getStorage(){
  if (driver) return driver;
  driver = localStorage(localDataDir('File storage (the R2 binding FILES)'));   // the Worker sets the R2 driver itself
  return driver;
}

// Cloudflare R2 (the Worker's FILES binding): one bucket, a folder per logical bucket (media/, deliverables/,
// backups/). Links use the same HMAC-signed /__storage paths as the local driver, and the Worker serves them
// straight from R2 — no public bucket and no R2 access keys are needed. Media is public (long-cached);
// deliverables and backups only ever leave through a signed, short-lived link.
export function r2Storage(r2, secret){
  if (!secret) throw new Error('DOWNLOAD_TOKEN_SECRET is not set.');
  const key = (bucket, path) => { assertPath(bucket, path); return `${bucket}/${path}`; };
  const sign = (text) => hmacHex(secret, text);
  return {
    kind: 'r2',
    r2,
    async put(bucket, path, bytes, contentType){ await r2.put(key(bucket, path), bytes, { httpMetadata: { contentType: contentType || 'application/octet-stream' } }); },
    /** stores a stream (e.g. a file fetched from Google Drive) and returns its size; a known length streams straight into R2 */
    async putStream(bucket, path, stream, length, contentType){
      const k = key(bucket, path), meta = { httpMetadata: { contentType: contentType || 'application/octet-stream' } };
      if (length > 0 && typeof FixedLengthStream === 'function'){
        const fixed = new FixedLengthStream(length);
        await Promise.all([stream.pipeTo(fixed.writable), r2.put(k, fixed.readable, meta)]);
        return length;
      }
      const bytes = await readAll(stream, UNKNOWN_LENGTH_LIMIT);
      await r2.put(k, bytes, meta);
      return bytes.byteLength;
    },
    async get(bucket, path){
      const obj = await r2.get(key(bucket, path));
      if (!obj) throw Object.assign(new Error('Not found in storage.'), { status: 404 });
      return Buffer.from(await obj.arrayBuffer());
    },
    async remove(bucket, paths){ const keys = paths.map(p => key(bucket, p)); for (let i = 0; i < keys.length; i += 1000) await r2.delete(keys.slice(i, i + 1000)); },
    publicUrl(bucket, path){ assertPath(bucket, path); if (!BUCKETS[bucket].public) throw new Error('This bucket is private.'); return `/__storage/${bucket}/${path}`; },
    async signedUrl(bucket, path, expiresInSeconds, download){
      assertPath(bucket, path);
      const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
      return `/__storage/${bucket}/${path}?exp=${exp}&sig=${sign(`${bucket}/${path}:${exp}`)}${download ? `&download=${encodeURIComponent(download)}` : ''}`;
    },
    async signedUploadUrl(bucket, path, seconds = 600){
      assertPath(bucket, path);
      const exp = Math.floor(Date.now() / 1000) + seconds;
      return { url: `/__storage-upload/${bucket}/${path}?exp=${exp}&sig=${sign(`upload:${bucket}/${path}:${exp}`)}`, method: 'PUT' };
    },
    verify(kind, bucket, path, exp, sig){
      const expected = sign(`${kind === 'upload' ? 'upload:' : ''}${bucket}/${path}:${exp}`);
      return Number(exp) >= Math.floor(Date.now() / 1000) && safeEqual(expected, String(sig || ''));
    },
    async usage(bucket){
      let bytes = 0, count = 0, cursor;
      do {
        const page = await r2.list({ prefix: `${bucket}/`, cursor, limit: 1000 });
        for (const o of page.objects){ bytes += o.size; count++; }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
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
    async putStream(bucket, path, stream){
      const f = file(bucket, path); await mkdir(dirname(f), { recursive: true });
      const fh = await openFile(f, 'w'); let total = 0;
      try { const reader = stream.getReader(); for (;;){ const { done, value } = await reader.read(); if (done) break; await fh.write(value); total += value.byteLength; } }
      finally { await fh.close(); }
      return total;
    },
    async get(bucket, path){ return readFile(file(bucket, path)); },
    async remove(bucket, paths){ for (const p of paths) await rm(file(bucket, p), { force: true }); },
    publicUrl(bucket, path){ assertPath(bucket, path); if (!BUCKETS[bucket].public) throw new Error('This bucket is private.'); return `/__storage/${bucket}/${path}`; },
    async signedUrl(bucket, path, expiresInSeconds, download){
      assertPath(bucket, path);
      const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
      const sig = hmacHex(secret, `${bucket}/${path}:${exp}`);
      return `/__storage/${bucket}/${path}?exp=${exp}&sig=${sig}${download ? `&download=${encodeURIComponent(download)}` : ''}`;
    },
    async signedUploadUrl(bucket, path, seconds = 600){
      assertPath(bucket, path);
      const exp = Math.floor(Date.now() / 1000) + seconds;
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
