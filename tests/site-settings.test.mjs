// Site settings stored by Studio: the "open full screen" switch defaults to on and can be turned off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSiteDocument } from '../server/admin/site-document.js';
const seed = JSON.parse(readFileSync(new URL('../server/portfolio-seed.json', import.meta.url), 'utf8'));

test('visibility.autoFullscreen: on unless explicitly switched off; other nav switches unaffected', () => {
  const base = structuredClone(seed); delete base.visibility;
  const on = validateSiteDocument({ ...base }, seed, seed);
  assert.equal(on.visibility.autoFullscreen, true, 'older saved sites (no setting yet) get it on');
  const off = validateSiteDocument({ ...base, visibility: { autoFullscreen: false } }, seed, seed);
  assert.equal(off.visibility.autoFullscreen, false);
  assert.equal(off.visibility.navGallery, true); assert.equal(off.visibility.navAbout, true);
  assert.equal(validateSiteDocument({ ...base, visibility: { autoFullscreen: 'no' } }, seed, seed).visibility.autoFullscreen, true, 'only a real false turns it off');
});
