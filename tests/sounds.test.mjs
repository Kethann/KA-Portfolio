import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { SOUND_EVENTS, SOUND_LIBRARY, SOUND_FILES, SOUND_SYNTHS, SOUND_CATEGORIES, SOUND_DEFAULTS } from '../shared/sounds.js';
import { validateSounds } from '../server/admin/site-document.js';

const ui = (f) => new URL('../client/public/sounds/ui/' + f, import.meta.url);

test('every library sound exists as WebM and MP3, each under the 30 KB UI budget', () => {
  for (const n of SOUND_FILES) for (const ext of ['webm', 'mp3']){
    assert.ok(existsSync(ui(`${n}.${ext}`)), `${n}.${ext} missing`);
    const size = statSync(ui(`${n}.${ext}`)).size;
    assert.ok(size > 300 && size < 30 * 1024, `${n}.${ext} is ${size} bytes`);
  }
});

test('every event uses library sounds, has a known category, and a gentle volume', () => {
  const cats = SOUND_CATEGORIES.map(c => c.id);
  assert.equal(new Set(SOUND_EVENTS.map(e => e.id)).size, SOUND_EVENTS.length);
  for (const e of SOUND_EVENTS){
    assert.ok(cats.includes(e.category), e.id);
    if (e.file) assert.ok(SOUND_LIBRARY.includes(e.file), `${e.id}: ${e.file}`);
    if (e.alt) assert.ok(SOUND_LIBRARY.includes(e.alt), `${e.id}: ${e.alt}`);
    assert.ok(e.volume > 0 && e.volume <= 0.4, `${e.id} volume ${e.volume}`);
  }
  assert.equal(SOUND_EVENTS.find(e => e.id === 'particles.spark').volume <= 0.1, true, 'particles stay faint');
  assert.equal(SOUND_DEFAULTS.defaultOn, false, 'visitors start muted');
});

test('the server keeps valid sound settings, clamps volumes and refuses foreign files', () => {
  const v = validateSounds({ defaultOn: true, master: 3, categories: { ui: 0.4, nope: 1 }, events: {
    'nav.select': { on: false, volume: 0.5, file: 'click-soft' }, 'store.paid': { volume: -2 }, 'made.up': { on: true } } });
  assert.equal(v.defaultOn, true);
  assert.equal(v.master, 1);
  assert.deepEqual(v.categories, { ui: 0.4 });
  assert.deepEqual(v.events['nav.select'], { on: false, volume: 0.5, file: 'click-soft' });
  assert.deepEqual(v.events['store.paid'], { volume: 0 });
  assert.equal(v.events['made.up'], undefined);
  assert.throws(() => validateSounds({ events: { 'nav.select': { file: 'https://evil.example/x.mp3' } } }), /library or a file you uploaded/);
  assert.deepEqual(validateSounds(undefined), { defaultOn: false, master: SOUND_DEFAULTS.master, categories: {}, events: {} });
});

test('the page loads the sound layer and the credits list every library file', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\.\/dist\/assets\/sound\.js"><\/script>/);
  assert.match(html, /kaSound\.play\('particles\.spark'\)/);
  const credits = readFileSync(new URL('../client/public/sounds/CREDITS.md', import.meta.url), 'utf8');
  for (const n of SOUND_FILES) assert.ok(credits.includes(`| ${n}.webm`), n);
  for (const n of SOUND_SYNTHS) assert.ok(credits.includes(n), n);
  const synth = readFileSync(new URL('../client/src/lib/sound/synth.ts', import.meta.url), 'utf8');
  for (const n of SOUND_SYNTHS) assert.match(synth, new RegExp(`\n  ${n.slice(6)}: `), `generator for ${n}`);
  assert.match(credits, /Sonniss/); assert.match(credits, /machine-learning/);
});
