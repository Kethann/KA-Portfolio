// Site settings stored by Studio: the "open full screen" switch defaults to on and can be turned off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setEnvSource } from '../server/core/env.js';
setEnvSource({ KA_DATA_DIR: mkdtempSync(join(tmpdir(), 'ka-site-')) });   // the logo check asks storage for its media URL
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

test('passCard: defaults for older sites, values kept in range, fonts and logo checked', () => {
  const base = structuredClone(seed); delete base.passCard;
  const d = validateSiteDocument({ ...base }, seed, seed).passCard;
  assert.equal(d.label, 'KA PASS'); assert.equal(d.logoUrl, ''); assert.equal(d.logoSize, 24);
  assert.equal(d.textPosition, 'bottom'); assert.equal(d.pricePosition, 'right'); assert.equal(d.stampText, 'PAID');
  assert.equal(d.foil, true); assert.equal(d.dim, 55); assert.equal(d.showTag, true);
  const p = validateSiteDocument({ ...base, passCard: { label: '  My Pass  ', logoSize: 400, dim: -5, textPosition: 'sideways', pricePosition: 'below',
    titleFont: 'Comic Sans', priceFont: 'Sora', foil: false, showTag: false, stampText: '' } }, seed, seed).passCard;
  assert.equal(p.label, 'My Pass'); assert.equal(p.logoSize, 44); assert.equal(p.dim, 0);
  assert.equal(p.textPosition, 'bottom', 'unknown position falls back'); assert.equal(p.pricePosition, 'below');
  assert.equal(p.titleFont, '', 'fonts outside the list are dropped'); assert.equal(p.priceFont, 'Sora');
  assert.equal(p.foil, false); assert.equal(p.showTag, false); assert.equal(p.stampText, 'PAID');
  assert.throws(() => validateSiteDocument({ ...base, passCard: { logoUrl: 'https://evil.example/logo.png' } }, seed, seed), /pass logo/);
  assert.equal(validateSiteDocument({ ...base, passCard: { logoUrl: '/images/icon-192.png' } }, seed, seed).passCard.logoUrl, '/images/icon-192.png');
});
