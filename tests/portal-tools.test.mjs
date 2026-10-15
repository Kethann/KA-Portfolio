// System map (live schema reader + endpoint), Featured Work auto frame size, and the Typography theme clean-up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestApp } from './helpers/app.mjs';
import { parseTable } from '../server/admin/system.js';
import { validateFeaturedShow } from '../server/admin/site-document.js';

const app = await createTestApp({ ADMIN_SETUP_TOKEN: 'setup-code-map', ADMIN_ENCRYPTION_KEY: 'test-admin-key' });
test.after(() => app.close());

test('the schema reader finds columns, primary keys and links between tables', () => {
  const t = parseTable(`create table order_items (
    id text primary key default (lower(hex(randomblob(4)))),
    order_id text not null references orders(id) on delete cascade,   -- the order
    product_id text references products(id),
    amount integer not null check (amount >= 0),
    unique (order_id, product_id),
    foreign key (amount) references prices(id)
  ) strict`);
  assert.deepEqual(t.columns.map(c => c.name), ['id', 'order_id', 'product_id', 'amount']);
  assert.equal(t.columns[0].pk, true); assert.equal(t.columns[1].required, true); assert.equal(t.columns[2].required, false);
  assert.deepEqual(t.refs, [{ column: 'order_id', table: 'orders' }, { column: 'product_id', table: 'products' }, { column: 'amount', table: 'prices' }]);
});

test('the System map endpoint lists every real table with links and row counts (admin only)', async () => {
  assert.equal((await app.call('GET', '/api/admin/system/map')).status, 401);
  const setup = await app.call('POST', '/api/admin/setup', { body: { email: 'owner@example.com', password: 'correct horse battery staple', token: 'setup-code-map' } });
  const cookie = (setup.headers.get('set-cookie') || '').split(';')[0];
  const res = await app.call('GET', '/api/admin/system/map', { headers: { cookie } });
  assert.equal(res.status, 200);
  const names = res.json.tables.map(t => t.name);
  for (const t of ['orders', 'order_items', 'coupons', 'messages', 'visits']) assert.ok(names.includes(t), t);
  assert.ok(!names.some(n => /_fts|^sqlite_|^d1_/.test(n)), 'internal search/system tables are left out');
  const items = res.json.tables.find(t => t.name === 'order_items');
  assert.ok(items.refs.some(r => r.table === 'orders')); assert.equal(typeof items.rows, 'number');
});

test('Featured Work frames size themselves from the pictures unless a size is chosen', () => {
  const imgs = [{ slug: 'a', cat: 'F' }];
  assert.equal(validateFeaturedShow({ rows: [{ folder: 'F' }] }, ['F'], imgs).rows[0].size, 'auto');
  assert.equal(validateFeaturedShow({ rows: [{ folder: 'F', size: 's' }] }, ['F'], imgs).rows[0].size, 's');
  assert.equal(validateFeaturedShow({ rows: [{ folder: 'F', size: 'huge' }] }, ['F'], imgs).rows[0].size, 'auto');
  // free size and free shape: kept within sensible bounds
  const free = validateFeaturedShow({ rows: [{ folder: 'F', size: 'free', width: 90, ratio: 'free', ratioW: 21, ratioH: 0 }] }, ['F'], imgs).rows[0];
  assert.deepEqual([free.size, free.width, free.ratio, free.ratioW, free.ratioH], ['free', 75, 'free', 21, 1]);
});

test('Typography: the removed themes are gone and nothing still points at removed parts', () => {
  const themes = readFileSync(new URL('../client/src/studio/effects/themes.ts', import.meta.url), 'utf8');
  for (const id of ['inferno', 'cool', 'space', 'horror', 'aurora', 'sunset', 'ocean', 'balloon', 'party', 'smoke']) assert.ok(!themes.includes(`{ id: '${id}',`), id);
  for (const sample of ['FIRE', 'chill', 'Among the', 'Do not', 'Golden\\nhour', 'Sea you', 'YAY', "LET'S", 'Midnight']) assert.ok(!themes.includes(`sample: '${sample}`) && !themes.includes(`sample: "${sample}`), sample);
  const scenes = readFileSync(new URL('../client/src/studio/effects/scenes.ts', import.meta.url), 'utf8');
  const usedScenes = [...themes.matchAll(/scene: '([a-z0-9-]+)'/g)].map(m => m[1]);
  for (const s of usedScenes) assert.ok(scenes.includes(`{ id: '${s}',`), `scene ${s} exists`);
  const decos = readFileSync(new URL('../client/src/studio/effects/decorations/more.ts', import.meta.url), 'utf8') + readFileSync(new URL('../client/src/studio/effects/decorations/index.ts', import.meta.url), 'utf8');
  assert.ok(!themes.includes("decoration: 'flames'"));
  assert.ok(!/\bflames\b/.test(decos.split('MORE_DECORATIONS')[1] || ''), 'flames is not offered');
});

test('the heartbeat is a real P-QRS-T beat: small P, tall narrow R, dip below the line, broad T', async () => {
  const src = readFileSync(new URL('../client/src/studio/effects/ecg.ts', import.meta.url), 'utf8').replace(/export /g, '').replace(/: number/g, '');
  const ecgWave = new Function(src + '; return ecgWave;')();
  const at = (k) => ecgWave(k);
  const samples = Array.from({ length: 1000 }, (_, i) => at(i / 1000));
  const peak = Math.max(...samples), low = Math.min(...samples);
  assert.ok(peak > 0.95 && peak <= 1.05, 'R peak');
  assert.ok(low < -0.15, 'S dips below the baseline');
  assert.ok(at(0.16) > 0.08 && at(0.16) < 0.2, 'P wave is small');
  assert.ok(at(0.56) > 0.2 && at(0.56) < 0.35, 'T wave');
  assert.ok(Math.abs(at(0.9)) < 0.01 && Math.abs(at(0.02)) < 0.01, 'flat between beats');
  assert.ok(Math.abs(at(1.31) - at(0.31)) < 1e-9, 'repeats every beat');
});
