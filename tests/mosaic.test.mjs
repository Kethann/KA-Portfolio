// Portfolio mosaic: the shared layout keeps every picture's shape, fills each row edge to edge with the gap,
// and the site document stores only valid mosaic settings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { setEnvSource } from '../server/core/env.js';
setEnvSource({ KA_DATA_DIR: mkdtempSync(join(tmpdir(), 'ka-mosaic-')) });
const { validateSiteDocument } = await import('../server/admin/site-document.js');
const { visibleSite } = await import('../server/handlers/public.js');
const seed = JSON.parse(readFileSync(new URL('../server/portfolio-seed.json', import.meta.url), 'utf8'));
const src = ts.transpileModule(readFileSync(new URL('../client/src/mosaic-layout.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const M = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

const ratios = [2/3, 4/5, 16/9, 1, 2/3, 3/2, 9/16, 4/3, 2/3, 1.91, 4/5, 2/3, 1, 21/9, 3/4, 2/3, 5/4];
const items = ratios.map((ratio, i) => ({ key: 'p' + i, ratio }));

test('every row fills the width exactly, gaps are exact, and each picture keeps its shape', () => {
  for (const width of [1200, 760, 390]) for (const gap of [0, 2, 8]){
    const { tiles, height } = M.layoutMosaic(items, width, M.mosaicTarget(width, 280), gap);
    assert.equal(tiles.length, items.length);
    assert.deepEqual(tiles.map(t => t.key), items.map(i => i.key), 'order is kept');
    const rows = new Map(); for (const t of tiles){ if (!rows.has(t.y)) rows.set(t.y, []); rows.get(t.y).push(t); }
    for (const row of rows.values()){
      row.sort((a, b) => a.x - b.x);
      assert.ok(new Set(row.map(t => t.h)).size === 1, 'one height per row');
      for (let i = 1; i < row.length; i++) assert.equal(row[i].x - (row[i - 1].x + row[i - 1].w), gap, 'exact gap');
      const full = row[0].x === 0;
      if (full) assert.equal(row[row.length - 1].x + row[row.length - 1].w, width, 'row ends at the edge');
      for (const t of row) assert.ok(Math.abs(t.w / t.h - items[t.index].ratio) / items[t.index].ratio < 0.06 || t.w < 40, `shape kept for ${t.key}`);
    }
    const last = tiles.reduce((m, t) => Math.max(m, t.y + t.h), 0);
    assert.equal(height, last);
  }
});

test('order helpers: owner order first, unknown slugs skipped, new pictures at the end', () => {
  const list = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }, { slug: 'd' }];
  assert.deepEqual(M.applyOrder(list, ['c', 'zz', 'a', 'c']).map(i => i.slug), ['c', 'a', 'b', 'd']);
  assert.deepEqual(M.applyOrder(list, undefined).map(i => i.slug), ['a', 'b', 'c', 'd']);
  assert.deepEqual(M.shuffle([1, 2, 3, 4, 5], 42), M.shuffle([1, 2, 3, 4, 5], 42), 'seeded shuffle repeats');
});

test('best fit returns a permutation that is at least as even as the original', () => {
  const opts = { rowHeight: 280, gap: 2, tries: 120, seed: 7 };
  const order = M.bestFit(items, opts);
  assert.deepEqual([...order].sort(), items.map(i => i.key).sort());
  const cost = list => [1200, 760, 390].reduce((s, w) => s + M.layoutMosaic(list, w, M.mosaicTarget(w, 280), 2).cost, 0);
  const by = new Map(items.map(i => [i.key, i]));
  assert.ok(cost(order.map(k => by.get(k))) <= cost(items) + 1e-9);
});

test('site document: mosaic settings are clamped, the order keeps existing images once, sizes are kept', () => {
  const base = structuredClone(seed); const [a, b] = base.images.map(i => i.slug);
  const d = validateSiteDocument({ ...base, images: base.images.map(i => i.slug === a ? { ...i, width: 2000, height: 3000 } : i),
    stacks: { loop: true, covers: {}, mosaic: { view: 'mosaic', rowHeight: 9999, gap: -4, order: [b, 'nope', a, b, 5] } } }, seed, seed);
  assert.deepEqual(d.stacks.mosaic, { view: 'mosaic', rowHeight: 520, gap: 0, order: [b, a] });
  const img = d.images.find(i => i.slug === a); assert.equal(img.width, 2000); assert.equal(img.height, 3000);
  assert.equal(validateSiteDocument({ ...base }, seed, seed).stacks.mosaic, undefined, 'older documents stay as they were');
  assert.equal(validateSiteDocument({ ...base, stacks: { loop: true, covers: {}, mosaic: { view: 'grid' } } }, seed, seed).stacks.mosaic.view, 'stacks');
});

test('visitors never see hidden pictures in the mosaic order', () => {
  const base = structuredClone(seed); const [a, b] = base.images.map(i => i.slug);
  const d = validateSiteDocument({ ...base, images: base.images.map(i => i.slug === a ? { ...i, hidden: true } : i), stacks: { loop: true, covers: {}, mosaic: { order: [a, b] } } }, seed, seed);
  assert.deepEqual(visibleSite(d).stacks.mosaic.order, [b]);
});

test('arrow keys in the mosaic move to the picture that sits in that direction', async () => {
  const { default: vm } = await import('node:vm');
  const file = ts.createSourceFile('WorkStacks.tsx', readFileSync(new URL('../client/src/WorkStacks.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let code = ''; (function find(n){ if (ts.isFunctionDeclaration(n) && n.name?.text === 'nearestTile') code = n.getText(file); ts.forEachChild(n, find); })(file);
  const ctx = vm.createContext({}); vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
  // two rows: [0 wide][1] / [2][3][4]
  const tiles = [{ x: 0, y: 0, w: 600, h: 300 }, { x: 602, y: 0, w: 598, h: 300 }, { x: 0, y: 302, w: 400, h: 250 }, { x: 402, y: 302, w: 400, h: 250 }, { x: 804, y: 302, w: 396, h: 250 }];
  const go = (from, key) => ctx.nearestTile(tiles, from, key);
  assert.equal(go(0, 'ArrowRight'), 1); assert.equal(go(1, 'ArrowLeft'), 0);
  assert.equal(go(1, 'ArrowDown'), 4, 'down from the right picture lands under it');
  assert.equal(go(2, 'ArrowUp'), 0); assert.equal(go(3, 'ArrowUp'), 1, 'straight above its centre wins'); assert.equal(go(1, 'ArrowRight'), 2, 'the end of a row carries on to the next row');
  assert.equal(go(4, 'ArrowRight'), -1, 'nothing after the last picture'); assert.equal(go(0, 'ArrowUp'), -1);
});
