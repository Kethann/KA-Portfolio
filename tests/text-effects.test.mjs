// Text Effects layer: the studio bundle still opens the studio and its brushes, and carries the new layer
// (controller, typing effects, decorations, palettes) without replacing anything that was there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../dist/assets/' + f, import.meta.url), 'utf8');
// the studio and the chunks it imports (the font library is shared with the portal, so it sits in its own chunk)
const main = read('studio.js');
const bundle = main + [...main.matchAll(/from"\.\/([\w.-]+\.js)"/g)].map(m => read(m[1])).join('');
test('the studio bundle still exports openStudio and keeps its brushes and handwriting fonts', () => {
  assert.match(bundle, /openStudio/);
  for (const b of ['Round pen', 'Calligraphy', 'Neon glow', 'Caveat', 'Dancing Script']) assert.ok(bundle.includes(b), b);
});
test('the Text effects layer is in the bundle: composer stage, typing effects, floral decoration, palettes and export', () => {
  for (const s of ['fx-stage', 'Classic typewriter', 'Real handwriting', 'Floral garden', 'Rose noir', 'fx-download', 'Playfair Display']) assert.ok(bundle.includes(s), s);
});
