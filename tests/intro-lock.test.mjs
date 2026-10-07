// The KA logo intro, Version 1, is locked: its script must stay byte-for-byte as it was when it was locked.
// A new intro idea is a new version (its own script block with data-intro="vN", listed in shared/intros.js), never an edit to V1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { INTRO_VERSIONS, introVersion } from '../shared/intros.js';
import { validateSiteDocument } from '../server/admin/site-document.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function scriptOf(id){
  const tag = `<script data-intro="${id}"`, o = html.indexOf(tag);
  if (o < 0) return null;
  const open = html.indexOf('>', o) + 1, close = html.indexOf('</script>', open);
  return { tag: html.slice(o, open), code: html.slice(open, close).replace(/\r\n/g, '\n') };
}

test('Version 1 (the KA crystal intro) is locked: its script is unchanged', () => {
  const v1 = INTRO_VERSIONS.find(v => v.id === 'v1');
  assert.ok(v1 && v1.locked, 'V1 is listed and locked');
  const s = scriptOf('v1');
  assert.ok(s, 'the V1 script is tagged data-intro="v1"');
  assert.equal(s.tag, '<script data-intro="v1">', 'V1 runs by default (no type attribute)');
  assert.equal(createHash('sha256').update(s.code).digest('hex'), v1.sha256,
    'The locked V1 intro was edited. Revert it, and put new ideas in a new intro version instead.');
});

test('every listed version has its script, and only V1 runs without the router', () => {
  for (const v of INTRO_VERSIONS){
    const s = scriptOf(v.id); assert.ok(s, `${v.id} has a script`);
    if (v.id !== 'v1') assert.match(s.tag, /type="text\/plain"/, `${v.id} is off unless chosen`);
  }
});

test('the saved intro choice falls back to V1 when unknown', () => {
  assert.equal(introVersion('v1'), 'v1');
  assert.equal(introVersion('v99'), 'v1');
  assert.equal(introVersion(undefined), 'v1');
  const seed = JSON.parse(readFileSync(new URL('../server/data/portfolio.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateSiteDocument({ ...seed, intro: { version: 'nope' } }, seed, seed).intro, { version: 'v1' });
});

test('the Pages router serves the homepage with the chosen intro and leaves V1 untouched', () => {
  const router = readFileSync(new URL('../pages/_worker.js', import.meta.url), 'utf8');
  const routes = JSON.parse(readFileSync(new URL('../pages/_routes.json', import.meta.url), 'utf8'));
  assert.ok(routes.include.includes('/') && routes.include.includes('/index.html'));
  assert.match(router, /if \(version === 'v1' \|\| !page\.ok/);
  assert.match(router, /script\[data-intro\]/);
});
