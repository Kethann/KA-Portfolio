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

test('Versions 1 and 2 are locked: their scripts are unchanged', () => {
  for (const id of ['v1', 'v2']){
    const v = INTRO_VERSIONS.find(x => x.id === id);
    assert.ok(v && v.locked, id + ' is listed and locked');
    const s = scriptOf(id);
    assert.ok(s, 'the ' + id + ' script is tagged data-intro="' + id + '"');
    if (id === 'v1') assert.equal(s.tag, '<script data-intro="v1">', 'V1 runs by default (no type attribute)');
    assert.equal(createHash('sha256').update(s.code).digest('hex'), v.sha256,
      'The locked ' + id.toUpperCase() + ' intro was edited. Revert it, and put new ideas in a new intro version instead.');
  }
});

test('Version 3 (the Timeline Loom) exists, is off unless chosen, takes the owner\'s bubbles, and builds on the crystal intro without touching it', () => {
  const v3 = scriptOf('v3');
  assert.ok(v3 && /type="text\/plain"/.test(v3.tag));
  assert.match(v3.code, /window\.KA_INTRO_BUBBLES/);
  assert.match(v3.code, /function v3PlanThreads/);
  assert.match(v3.code, /ka-sequence-complete/);
  assert.ok(INTRO_VERSIONS.some(v => v.id === 'v3'));
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

test('the local dev server switches intros like the live router (V2 runs with the saved bubbles, "none" included)', async () => {
  const { applyIntroToHtml } = await import('../shared/intro-page.js');
  assert.equal(applyIntroToHtml(html, 'v1', []), html, 'V1 is served exactly as built');
  const none = applyIntroToHtml(html, 'v2', []);
  assert.match(none, /<script>window\.KA_INTRO_BUBBLES=\[\];<\/script><script data-intro="v2">/);
  assert.match(none, /<script data-intro="v1" type="text\/plain">/);
  assert.ok(!/KA_INTRO_BUBBLES=null/.test(applyIntroToHtml(html, 'v2', null)), 'nothing saved = no override');
});

test('Version 3 never changes the logo\'s shape: the woven skin is clipped to the logo\'s own outline and the logo mesh is built exactly as in Version 2', () => {
  const v2 = scriptOf('v2').code, v3 = scriptOf('v3').code;
  assert.match(v3, /if\(tex\.a<\.02\)discard;/, 'the skin only draws where the logo itself is opaque');
  const grab = (code, re) => (code.match(re) || [])[0];
  const logoBuild = /function buildLogo\(\)\{[\s\S]*?\n\}\n/;
  assert.ok(grab(v2, logoBuild), 'found buildLogo in V2');
  assert.equal(grab(v3, logoBuild), grab(v2, logoBuild), 'buildLogo is identical to Version 2');
  assert.equal(grab(v3, /const LOGO_BOX_W = [^\n]*\n/), grab(v2, /const LOGO_BOX_W = [^\n]*\n/), 'the logo box is unchanged');
});

test('Version 3 stays in natural colours until the core has absorbed the threads, then turns the whole scene green at once, with liquid magic', () => {
  const v2 = scriptOf('v2').code, v3 = scriptOf('v3').code;
  assert.match(v3, /const V3_PAL = \[\[255,150,60\]/, 'threads carry their own natural colours');
  assert.match(v3, /V3\.ab0 = ASSEMBLY_FULL_T - 650; V3\.tg = V3\.ab0 \+ 780;/, 'the energy runs into the core, then the flip');
  assert.match(v3, /REVEAL_START = Math\.max\(REVEAL_START, V3\.tg \+ 1000\)/, 'the liquid beat sits between the flip and the reveal');
  assert.match(v3, /function v3Grade\(ts, t\)/); assert.match(v3, /function v3BuildLiquid\(\)/);
  // one shared value drives the shard shader, the logo shader, the crystal glow and the seams
  assert.equal((v3.match(/uGreen: V3_UG/g) || []).length, 2, 'both shard materials read the shared value');
  assert.match(v3, /logoMesh\.material\.uniforms\.uGreen = V3_UG/);
  assert.match(v3, /col = mix\(col, kaGreen\(col\), uGreen\);/, 'the finished logo is graded green');
  assert.match(v3, /settleStatic\(\)\{\s*V3G = 1;/, 'reduced motion shows the finished logo already green');
  assert.ok(!v2.includes('kaGreen') && !v2.includes('V3_UG'), 'Version 2 never sees the green grade');
});
