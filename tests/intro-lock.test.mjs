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

test('Version 2 (the editable copy) takes the owner\'s skill bubbles; Version 1 does not', async () => {
  const { cleanBubbles, bubbleList, BUBBLE_TYPES } = await import('../shared/intros.js');
  const v2 = scriptOf('v2'); assert.ok(v2); assert.match(v2.tag, /type="text\/plain"/);
  assert.match(v2.code, /window\.KA_INTRO_BUBBLES/); assert.ok(!scriptOf('v1').code.includes('KA_INTRO_BUBBLES'), 'V1 stays untouched');
  assert.equal(bubbleList(undefined), null, 'nothing saved = the intro as built');
  assert.deepEqual(bubbleList({ enabled: false, items: [] }), [], 'master switch off = no bubbles');
  const c = cleanBubbles({ enabled: true, items: [{ type: 'ps', label: '  <b>Photo</b>  ' }, { type: 'ps', label: 'dup' }, { type: 'nope', label: 'x' }, { type: 'brush', on: false }] });
  assert.equal(c.items.length, BUBBLE_TYPES.length, 'icons left out are added back at the end');
  assert.ok(!/[<>]/.test(c.items[0].label) && c.items[0].type === 'ps', 'labels are plain text, first listed icon comes first');
  assert.equal(c.items.filter(x => x.type === 'ps').length, 1, 'no duplicates');
  assert.deepEqual(bubbleList({ enabled: true, items: [{ type: 'ps', label: 'Photos' }, { type: 'brush', on: false }] }).map(b => b.type + ':' + b.label), ['ps:Photos', 'pencil:Sketch', 'design:Figma', 'uiux:UI/UX', 'type:Typography', 'image:Imaging', 'briefcase:Freelance'], 'hidden icons are left out, the rest keep their order');
  const seed = JSON.parse(readFileSync(new URL('../server/data/portfolio.json', import.meta.url), 'utf8'));
  const doc = validateSiteDocument({ ...seed, intro: { version: 'v2', bubbles: { enabled: false, items: [] } } }, seed, seed);
  assert.equal(doc.intro.version, 'v2'); assert.equal(doc.intro.bubbles.enabled, false);
});
