// Deployment guards for the Cloudflare Worker (wrangler.jsonc + server/platform/cloudflare.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createTestApp } from './helpers/app.mjs';
import { setEnvSource, localDataDir } from '../server/core/env.js';
import { setStorage, getStorage, r2Storage } from '../server/core/storage.js';

const jsonc = (text) => JSON.parse(text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || ''));
const wrangler = jsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

test('on Cloudflare, missing storage/email settings give a clear config error instead of touching a disk', () => {
  try {
    setEnvSource({ KA_PLATFORM: 'cloudflare', KA_DATA_DIR: '/tmp/x' });
    assert.throws(() => localDataDir('Email (GMAIL_USER and GMAIL_APP_PASSWORD)'), /not configured on this deployment/);
    setStorage(null);
    assert.throws(() => getStorage(), /File storage .* is not configured/);
    setEnvSource({ KA_ENV: 'production', KA_DATA_DIR: '/tmp/x' });
    assert.throws(() => localDataDir('X'), /not configured/);
    setEnvSource({});
    assert.throws(() => localDataDir('X'), /KA_DATA_DIR is not set/);
    setEnvSource({ KA_DATA_DIR: '/tmp/x' });
    assert.equal(localDataDir('X'), '/tmp/x');
  } finally { setStorage(null); setEnvSource({}); }
});

test('wrangler.jsonc: Worker entry, D1 + migrations, R2, cron, and only dynamic paths run the Worker', () => {
  assert.equal(wrangler.main, 'server/platform/cloudflare.js');
  assert.ok(wrangler.compatibility_flags.includes('nodejs_compat'));
  assert.equal(wrangler.assets.directory, './dist');
  for (const p of ['/api/*', '/legal', '/legal/*', '/license', '/license/*', '/__storage/*', '/__storage-upload/*']) assert.ok(wrangler.assets.run_worker_first.includes(p), p);
  const d1 = wrangler.d1_databases.find(d => d.binding === 'DB');
  assert.equal(d1.migrations_dir, 'migrations');
  assert.ok(wrangler.r2_buckets.find(b => b.binding === 'FILES'));
  assert.deepEqual(wrangler.triggers.crons, ['0 1 * * *', '0 2 * * 1', '*/15 * * * *']);
  assert.equal(wrangler.vars.KA_ENV, 'production', 'demo payments and dev shortcuts are off on the live site');
  // secrets never live in the config file
  for (const k of Object.keys(wrangler.vars)) assert.ok(!/KEY|SECRET|PASSWORD|TOKEN/.test(k), k + ' belongs in Worker secrets');
  assert.ok(existsSync(new URL('../client/public/_headers', import.meta.url)) && existsSync(new URL('../client/public/_redirects', import.meta.url)));
});

test('R2 links: public media is plain, private files need a valid unexpired signature', async () => {
  const store = new Map();
  const fake = { async put(k, v){ store.set(k, v); }, async get(k){ return store.has(k) ? { arrayBuffer: async () => new TextEncoder().encode(String(store.get(k))).buffer } : null; },
    async delete(keys){ for (const k of [].concat(keys)) store.delete(k); }, async list(){ return { objects: [...store.keys()].map(k => ({ key: k, size: 1 })), truncated: false }; } };
  const s = r2Storage(fake, 'secret');
  assert.equal(s.publicUrl('media', 'a/b.webp'), '/__storage/media/a/b.webp');
  assert.throws(() => s.publicUrl('deliverables', 'x.zip'), /private/);
  const u = new URL('http://x' + await s.signedUrl('deliverables', 'files/x.zip', 60, 'Kit.zip'));
  assert.ok(s.verify('get', 'deliverables', 'files/x.zip', u.searchParams.get('exp'), u.searchParams.get('sig')));
  assert.ok(!s.verify('get', 'deliverables', 'files/y.zip', u.searchParams.get('exp'), u.searchParams.get('sig')), 'a signature is for one file only');
  assert.ok(!s.verify('get', 'deliverables', 'files/x.zip', '1', u.searchParams.get('sig')), 'expired');
  const up = new URL('http://x' + (await s.signedUploadUrl('media', 'a/c.webp')).url);
  assert.ok(!s.verify('get', 'media', 'a/c.webp', up.searchParams.get('exp'), up.searchParams.get('sig')), 'an upload signature is not a download signature');
  await s.put('media', 'a/b.webp', 'img');
  assert.equal((await s.get('media', 'a/b.webp')).toString(), 'img');
  assert.throws(() => s.publicUrl('media', '../secret'), /Invalid storage path/);
});

test('direct /api paths route correctly; legacy Vercel __path rewrite is removed (Cloudflare uses direct paths)', async () => {
  const app = await createTestApp();
  try {
    // Direct paths always work
    assert.equal((await app.call('GET', '/api/health')).status, 200);
    // The legacy Vercel /api/index?__path= rewrite is intentionally removed.
    // Cloudflare Workers always receive the original direct path, so this
    // workaround is no longer needed and correctly returns 404 now.
    const r = await app.call('GET', '/api/index?__path=health');
    assert.equal(r.status, 404);
  } finally { await app.close(); }
});

test('server code never reads project files at runtime (a Worker has no file system for them)', () => {
  for (const f of ['../server/admin/content.js', '../server/handlers/public.js', '../server/assistant/knowledge.js']){
    const s = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/readFileSync|createRequire/.test(s), f);
  }
});
