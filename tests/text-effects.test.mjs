// Text Effects layer: the studio bundle still opens the studio and its brushes, and carries the new layer
// (controller, typing effects, decorations, palettes) without replacing anything that was there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bundle = readFileSync(new URL('../dist/assets/studio.js', import.meta.url), 'utf8');
test('the studio bundle still exports openStudio and keeps its brushes and handwriting fonts', () => {
  assert.match(bundle, /openStudio/);
  for (const b of ['Round pen', 'Calligraphy', 'Neon glow', 'Caveat', 'Dancing Script']) assert.ok(bundle.includes(b), b);
});
test('the Text effects layer is in the bundle: composer stage, typing effects, floral decoration, palettes and export', () => {
  for (const s of ['fx-stage', 'Classic typewriter', 'Handwriting sync', 'Floral garden', 'Rose noir', 'fx-download', 'Playfair Display']) assert.ok(bundle.includes(s), s);
});
