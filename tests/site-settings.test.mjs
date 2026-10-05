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

test('Skills: defaults for older sites, cleaned input, limits refused, can be hidden', () => {
  const base = structuredClone(seed); delete base.skills;
  const d = validateSiteDocument({ ...base }, seed, seed).skills;
  assert.equal(d.enabled, true); assert.deepEqual(d.categories.map(c => c.name), ['Design', 'Motion design', 'Video', 'AI & generative', 'Arts', 'Languages', 'Frontend', 'Backend', 'Database', 'APIs']);
  assert.ok(['After Effects', 'Premiere Pro', 'Adobe Media Encoder', 'Adobe Firefly'].every(n => d.categories.some(c => c.items.some(x => x.name === n))));
  assert.ok(d.categories.every(c => c.items.length && c.items.every(x => /^#[0-9A-F]{6}$/.test(x.color) && x.level >= 0 && x.level <= 5)));
  const s = validateSiteDocument({ ...base, skills: { enabled: false, title: '  My stack  ', intro: 'x'.repeat(300), categories: [
    { name: ' Design ', icon: 'nope', items: [
      { name: 'Photoshop', code: 'Psxx', color: '#31a8ff', level: 9.4, note: 'n'.repeat(200) },
      { name: '', code: 'Q' },
      { name: 'Figma', color: 'red', level: -2 } ] } ] } }, seed, seed).skills;
  assert.equal(s.enabled, false); assert.equal(s.title, 'My stack'); assert.equal(s.intro.length, 200);
  assert.equal(s.categories[0].name, 'Design'); assert.equal(s.categories[0].icon, 'star', 'unknown icons fall back');
  assert.deepEqual(s.categories[0].items[0], { name: 'Photoshop', code: 'Psx', color: '#31A8FF', level: 5, note: 'n'.repeat(140), logo: '', logoUrl: '' });
  assert.equal(s.categories[0].items.length, 2, 'unfinished empty rows are dropped');
  assert.deepEqual([s.categories[0].items[1].color, s.categories[0].items[1].level], ['', 0], 'bad colour and level cleaned');
  assert.throws(() => validateSiteDocument({ ...base, skills: { categories: Array.from({ length: 15 }, (_, i) => ({ name: 'C' + i, items: [] })) } }, seed, seed), /up to 14/);
  assert.throws(() => validateSiteDocument({ ...base, skills: { categories: [{ name: 'X', items: [{ name: 'Logo', logoUrl: 'https://evil.example/a.png' }] }] } }, seed, seed), /Upload the logo/);
  assert.throws(() => validateSiteDocument({ ...base, skills: { categories: [{ name: 'Big', items: Array.from({ length: 25 }, (_, i) => ({ name: 'S' + i })) }] } }, seed, seed), /up to 24/);
  assert.throws(() => validateSiteDocument({ ...base, skills: { categories: [{ name: '  ', items: [] }] } }, seed, seed), /needs a name/);
});

test('skill logos: every default tool resolves to a real logo, names match loosely, a bad pick is refused', async () => {
  const { SKILL_LOGOS, SKILL_LOGO_ALIASES, skillLogoFor } = await import('../shared/skill-logos.js');
  const { SKILLS_DEFAULT } = await import('../server/admin/site-document.js');
  for (const [alias, slug] of Object.entries(SKILL_LOGO_ALIASES)) assert.ok(SKILL_LOGOS[slug], `${alias} -> ${slug}`);
  for (const [slug, l] of Object.entries(SKILL_LOGOS)){
    if (l.k === 'b' || l.k === 'g' || l.k === 'f') assert.match(l.p, /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]+$/, slug);
    if (l.k === 't') assert.match(l.bg + l.fg, /^#[0-9A-Fa-f]{6}#[0-9A-Fa-f]{6}$/, slug);
  }
  // nothing in the shipped skills is left as bare letters
  const bare = SKILLS_DEFAULT.categories.flatMap(c => c.items).filter(x => !skillLogoFor(x)).map(x => x.name);
  assert.deepEqual(bare, []);
  assert.equal(skillLogoFor({ name: 'Adobe Premiere Pro' }).slug, 'premierepro');
  assert.equal(skillLogoFor({ name: 'after effects' }).slug, 'aftereffects');
  assert.equal(skillLogoFor({ name: 'Node.js' }).slug, 'nodejs');
  assert.equal(skillLogoFor({ name: 'Photoshop', logo: 'figma' }).slug, 'figma', 'a chosen logo beats the name');
  assert.equal(skillLogoFor({ name: 'Photoshop', logo: 'none' }), null, '"none" means letters only');
  assert.equal(skillLogoFor({ name: 'My secret tool' }), null);
  const base = structuredClone(seed);
  const item = (logo) => ({ ...base, skills: { enabled: true, title: 'Skills', intro: '', categories: [{ name: 'X', icon: 'star', items: [{ name: 'Tool', code: '', color: '#FF9438', level: 3, note: '', logo }] }] } });
  assert.equal(validateSiteDocument(item('react'), seed, seed).skills.categories[0].items[0].logo, 'react');
  assert.equal(validateSiteDocument(item('none'), seed, seed).skills.categories[0].items[0].logo, 'none');
  assert.equal(validateSiteDocument(item(undefined), seed, seed).skills.categories[0].items[0].logo, '');
  assert.throws(() => validateSiteDocument(item('<script>'), seed, seed), /logo/i);
  assert.throws(() => validateSiteDocument(item('__proto__'), seed, seed), /logo/i);
});

test('pass signature + seal: defaults, any allowed font, bounded size and slant, unknown fonts fall back', () => {
  const base = structuredClone(seed);
  const d = validateSiteDocument({ ...base }, seed, seed).passCard;
  assert.deepEqual([d.signatureText, d.signatureFont, d.signatureSize, d.signatureTone, d.signatureAngle, d.showSeal], ['Kethan Artzz', '', 30, 'gold', -4, true]);
  const p = validateSiteDocument({ ...base, passCard: { signatureText: '  K. Artzz  ', signatureFont: 'Not Uploaded', signatureSize: 300, signatureTone: 'rainbow', signatureAngle: -40, showSeal: false } }, seed, seed).passCard;
  assert.deepEqual([p.signatureText, p.signatureFont, p.signatureSize, p.signatureTone, p.signatureAngle, p.showSeal], ['K. Artzz', '', 60, 'gold', -12, false]);
  assert.equal(validateSiteDocument({ ...base, passCard: { signatureFont: 'Poppins' } }, seed, seed).passCard.signatureFont, 'Poppins');
  // the words on the back: defaults, trimmed, bounded, and the delivery line can be switched off
  assert.deepEqual([d.backEyebrow, d.licensedLabel, d.signLabel, d.backNote, d.showTerms], ['License', 'Licensed to', 'Authorised signature', '', true]);
  const w = validateSiteDocument({ ...base, passCard: { backEyebrow: '  Pass  ', licensedLabel: 'Owner', signLabel: '', backNote: 'x'.repeat(300), showTerms: false } }, seed, seed).passCard;
  assert.deepEqual([w.backEyebrow, w.licensedLabel, w.signLabel, w.backNote.length, w.showTerms], ['Pass', 'Owner', 'Authorised signature', 100, false]);
});

test('About numbers: defaults for older sites, up to 6, whole numbers, short suffix, can be hidden', () => {
  const base = structuredClone(seed); delete base.stats;
  const d = validateSiteDocument({ ...base }, seed, seed).stats;
  assert.equal(d.enabled, true); assert.ok(d.items.length >= 3); assert.equal(d.items[0].label, 'Projects');
  const s = validateSiteDocument({ ...base, stats: { enabled: false, items: [
    { label: 'Projects', value: '42.6', suffix: '+++++' }, { label: '', value: 5 }, { label: 'Years', value: -3 },
    ...Array.from({ length: 8 }, (_, i) => ({ label: 'X' + i, value: i })) ] } }, seed, seed).stats;
  assert.equal(s.enabled, false);
  assert.deepEqual(s.items[0], { label: 'Projects', value: 43, suffix: '++++' });
  assert.equal(s.items.some(x => !x.label), false, 'empty labels dropped');
  assert.equal(s.items.find(x => x.label === 'Years').value, 0, 'never negative');
  assert.ok(s.items.length <= 6);
});

test('the full portfolio (18 artworks in 3 folders) is the starting data, so any of it can be re-added in the portal', () => {
  assert.deepEqual(seed.folders, ['Film Posters', 'Key Art', 'Social']);
  assert.equal(seed.images.length, 18);
  for (const f of seed.folders) assert.ok(seed.images.some(i => i.cat === f), f + ' has images');
});
