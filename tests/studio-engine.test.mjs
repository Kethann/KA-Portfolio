// Typography studio engine: data model, determinism, replay timing and animation rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const src = await readFile(new URL('../client/src/studio/engine.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const E = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

test('seeded randomness is repeatable, so replay and export match the live drawing', () => {
  const a = E.rng(42), b = E.rng(42);
  const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b);
  assert.deepEqual(sa, sb);
  assert(sa.every(v => v >= 0 && v < 1));
  assert.notDeepEqual(Array.from({ length: 5 }, E.rng(43)), sa.slice(0, 5));
});

test('strokes store points as data and grow without losing any', () => {
  const st = E.newStroke('stroke', 1, E.DEFAULT_SETTINGS, 1000);
  for (let i = 0; i < 1000; i++) E.pushPoint(st, i, i * 2, i * 16, 0.5);
  assert.equal(st.n, 1000);
  assert.equal(st.pts[999 * E.POINT_STRIDE], 999); assert.equal(st.pts[999 * E.POINT_STRIDE + 1], 1998);
  assert.equal(st.end, 1000 + 999 * 16);
  assert.notEqual(st.s, E.DEFAULT_SETTINGS, 'settings are copied, later changes never alter a drawn stroke');
  assert.equal(E.totalPoints([st, { kind: 'text' }]), 1000);
});

test('replay keeps real drawing speed but shortens long pauses', () => {
  const a = { id: 1, start: 0, end: 500 }, b = { id: 2, start: 10_000, end: 10_800 };
  const { offsets, duration } = E.replayTimeline([b, a]);
  const [ra, rb] = E.retimed([a, b], offsets);
  assert.deepEqual([ra.start, ra.end], [0, 500]);
  assert.deepEqual([rb.start, rb.end], [1100, 1900], '9.5 s pause shortened to 600 ms, stroke length kept');
  assert.equal(duration, 2200);
  assert.equal(a.start, 0, 'originals untouched');
});

test('trails fade out; permanent ink is static except particles while they settle', () => {
  const trail = { kind: 'stroke', s: { ...E.DEFAULT_SETTINGS, lifetime: 2 }, end: 1000 };
  assert.equal(E.isAlive(trail, 2500), true); assert.equal(E.needsAnimation(trail, 2500), true);
  assert.equal(E.isAlive(trail, 3100), false); assert.equal(E.needsAnimation(trail, 3100), false);
  const ink = { kind: 'stroke', s: { ...E.DEFAULT_SETTINGS, lifetime: 0 }, end: 1000 };
  assert.equal(E.needsAnimation(ink, 1001), false);
  const parts = { kind: 'stroke', s: { ...E.DEFAULT_SETTINGS, lifetime: 0, brush: 'particles' }, end: 1000 };
  assert.equal(E.needsAnimation(parts, 1500), true); assert.equal(E.needsAnimation(parts, 5000), false);
});

test('all ten brushes are defined, with unique ids', () => {
  const ids = E.BRUSHES.map(b => b.id);
  assert.deepEqual(ids, ['pen', 'marker', 'calligraphy', 'pencil', 'spray', 'neon', 'ribbon', 'particles', 'dotted', 'dashed']);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(E.hexToRgb('#ff9438'), [255, 148, 56]);
});
