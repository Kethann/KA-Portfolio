// Deployment guards: what broke (or could break) the Vercel function.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestApp } from './helpers/app.mjs';
import { setEnvSource, localDataDir } from '../server/core/env.js';
import { setStorage, getStorage } from '../server/core/storage.js';

test('on Vercel, missing storage/email keys give a clear config error instead of writing to a read-only disk', () => {
  try {
    setEnvSource({ VERCEL: '1', KA_DATA_DIR: '/tmp/x' });
    assert.throws(() => localDataDir('Email (BREVO_API_KEY)'), /Email \(BREVO_API_KEY\) is not configured on this deployment/);
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

test('the rewritten /api/index?__path= form routes like the original URL', async () => {
  const app = await createTestApp();
  try {
    assert.equal((await app.call('GET', '/api/health')).status, 200);
    const r = await app.call('GET', '/api/index?__path=health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true });
    assert.equal((await app.call('GET', '/api/index?__path=nope')).status, 404);
  } finally { await app.close(); }
});

test('vercel.json: rewrite without path-to-regexp repeats; only the two JSON files force-included; Node pinned', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const api = v.rewrites.find(r => r.source.startsWith('/api'));
  assert.ok(!api.source.includes(':path*') && !api.destination.includes(':path*'));
  assert.equal(v.functions['api/index.js'].includeFiles, 'server/{knowledge,portfolio-seed}.json');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.engines.node, /<\d+/, 'an upper bound stops Vercel silently jumping Node majors');
  const ignore = readFileSync(new URL('../.vercelignore', import.meta.url), 'utf8');
  for (const p of ['server/data/', '.data/', 'server/gfpgan-venv/', 'server/weights/', '.env']) assert.ok(ignore.split('\n').includes(p), p);
});

test('server code loads packages/JSON in forms the Vercel file tracer can follow', () => {
  for (const f of ['../server/visitors/track.js', '../server/admin/content.js', '../server/handlers/public.js', '../server/assistant/knowledge.js', '../server/core/email.js', '../server/core/storage.js']){
    const s = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\/.*$/gm, ''); // code only, not the notes explaining why
    assert.ok(!s.includes('createRequire'), f + ' uses createRequire (not traced)');
    assert.ok(!/resolve\([^)]*(dir|root|dataDir)\b/.test(s), f + ' resolves a runtime folder (over-traces)');
  }
});
