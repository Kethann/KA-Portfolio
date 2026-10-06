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

test('visibility.autoFullscreen: off unless explicitly on (the site no longer goes full screen on a first tap); other nav switches unaffected', () => {
  const base = structuredClone(seed); delete base.visibility;
  const d = validateSiteDocument({ ...base }, seed, seed);
  assert.equal(d.visibility.autoFullscreen, false);
  assert.equal(d.visibility.navGallery, true); assert.equal(d.visibility.navAbout, true);
  assert.equal(validateSiteDocument({ ...base, visibility: { autoFullscreen: 'yes' } }, seed, seed).visibility.autoFullscreen, false);
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
  assert.equal(d.enabled, true); assert.deepEqual(d.categories.map(c => c.name), ['Design', 'Motion design', 'Video', 'AI & generative', 'Arts', 'Languages', 'Frontend', 'Backend', 'Database', 'APIs', 'Robotics', 'Data & ML']);
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
  assert.deepEqual(s.items[0], { label: 'Projects', value: 43, suffix: '++++', auto: true }, 'the Projects number follows the portfolio unless switched off');
  const own = validateSiteDocument({ ...base, stats: { enabled: true, items: [{ label: 'Projects', value: 200, suffix: '+', auto: false }] } }, seed, seed).stats;
  assert.deepEqual(own.items[0], { label: 'Projects', value: 200, suffix: '+', auto: false }, 'a typed Projects number is kept');
  assert.equal(s.items.some(x => !x.label), false, 'empty labels dropped');
  assert.equal(s.items.find(x => x.label === 'Years').value, 0, 'never negative');
  assert.ok(s.items.length <= 6);
});

test('the full portfolio (18 artworks in 3 folders) is the starting data, so any of it can be re-added in the portal', () => {
  assert.deepEqual(seed.folders, ['Film Posters', 'Key Art', 'Social']);
  assert.equal(seed.images.length, 18);
  for (const f of seed.folders) assert.ok(seed.images.some(i => i.cat === f), f + ' has images');
});

test('About story: defaults for older sites, YouTube links accepted, bad videos and links refused, clip range kept sane', async () => {
  const { ABOUT_DEFAULT, youtubeId } = await import('../server/admin/site-document.js');
  const base = structuredClone(seed); delete base.about;
  const d = validateSiteDocument({ ...base }, seed, seed).about;
  assert.equal(d.journey.since, 2021); assert.equal(d.reel.videos.length, 3); assert.ok(!/Salaar|Devara|WAR 2|Kuravaali/.test(d.bio), 'no film names in the bio');
  assert.equal(ABOUT_DEFAULT.reel.channelUrl, d.reel.channelUrl);
  assert.equal(youtubeId('https://youtu.be/rgxPPGUK5Fc?t=4'), 'rgxPPGUK5Fc'); assert.equal(youtubeId('https://www.youtube.com/watch?v=F_O7xqGm-Ug&x=1'), 'F_O7xqGm-Ug'); assert.equal(youtubeId('nope'), '');
  const a = validateSiteDocument({ ...base, about: { bio: '  Hello  ', journey: { since: 1800, steps: [{ title: ' One ', text: 'x'.repeat(200) }, { title: '' }] },
    reel: { channelUrl: 'https://www.youtube.com/@x', clipMin: 20, clipMax: 3, videos: [{ id: 'https://youtu.be/rgxPPGUK5Fc', len: -4, title: 'A' }, { id: 'rgxPPGUK5Fc' }, { id: '', title: '' }] } } }, seed, seed).about;
  assert.equal(a.bio, 'Hello'); assert.equal(a.journey.since, 1990); assert.deepEqual(a.journey.steps, [{ title: 'One', text: 'x'.repeat(90) }], 'empty rows dropped, text cut');
  assert.equal(a.reel.videos.length, 1, 'duplicates and empty rows dropped'); assert.equal(a.reel.videos[0].len, 0); assert.equal(a.reel.clipMin, 20); assert.equal(a.reel.clipMax, 20);
  assert.throws(() => validateSiteDocument({ ...base, about: { reel: { videos: [{ id: 'bad id' }] } } }, seed, seed), /YouTube link/);
  assert.throws(() => validateSiteDocument({ ...base, about: { reel: { videos: [] } } }, seed, seed), /at least one video/);
  assert.throws(() => validateSiteDocument({ ...base, about: { reel: { channelUrl: 'https://evil.example/x', videos: [{ id: 'rgxPPGUK5Fc' }] } } }, seed, seed), /youtube\.com/);
  assert.equal(validateSiteDocument({ ...base, about: { reel: { enabled: false, videos: [] } } }, seed, seed).about.reel.enabled, false, 'switched off needs no videos');
});

test('hidden gallery images: kept by the validator, left out of what visitors get, and their stack cover is dropped', async () => {
  const { visibleSite } = await import('../server/handlers/public.js');
  const base = structuredClone(seed);
  const first = base.images[0], second = base.images[1];
  const doc = validateSiteDocument({ ...base, images: base.images.map(i => i.slug === first.slug ? { ...i, hidden: true } : i), stacks: { loop: true, covers: { [first.cat]: first.slug } } }, seed, seed);
  assert.equal(doc.images.find(i => i.slug === first.slug).hidden, true); assert.equal(doc.images.find(i => i.slug === second.slug).hidden, false);
  const pub = visibleSite(doc);
  assert.equal(pub.images.length, doc.images.length - 1); assert.ok(!pub.images.some(i => i.slug === first.slug)); assert.equal(pub.stacks.covers[first.cat], undefined);
  assert.equal(visibleSite({ images: [{ slug: 'a' }] }).images.length, 1, 'nothing hidden: unchanged');
});

test('Portfolio: an archived image is also hidden and keeps its stack framing; a centred image stores no framing', () => {
  const base = structuredClone(seed);
  const pick = base.images[0].slug;
  const doc = validateSiteDocument({ ...base, images: base.images.map(i => i.slug === pick ? { ...i, archived: true, focusX: 30.04, focusY: 70, zoom: 1.5 } : i.slug === base.images[1].slug ? { ...i, focusX: 50, focusY: 50, zoom: 1 } : i) }, seed, seed);
  const a = doc.images.find(i => i.slug === pick);
  assert.equal(a.archived, true); assert.equal(a.hidden, true, 'archived implies hidden, so every public path leaves it out');
  assert.deepEqual([a.focusX, a.focusY, a.zoom], [30, 70, 1.5]);
  const centred = doc.images.find(i => i.slug === base.images[1].slug);
  assert.equal(centred.focusX, undefined); assert.equal(centred.zoom, undefined); assert.equal(centred.archived, undefined);
  const back = validateSiteDocument({ ...base, images: doc.images.map(i => i.slug === pick ? { ...i, archived: false, hidden: false } : i) }, seed, seed);
  assert.equal(back.images.find(i => i.slug === pick).hidden, false, 'republished');
  assert.equal(back.images.find(i => i.slug === pick).archived, undefined);
});

test('Portfolio: switching archive and framing off really clears them from the stored image', () => {
  const base = structuredClone(seed);
  const slug = base.images[0].slug;
  const first = validateSiteDocument({ ...base, images: base.images.map(i => i.slug === slug ? { ...i, archived: true, focusX: 10, zoom: 2 } : i) }, seed, seed);
  const again = validateSiteDocument({ ...first, images: first.images.map(i => i.slug === slug ? { ...i, archived: false, hidden: false, focusX: 50, focusY: 50, zoom: 1 } : i) }, seed, first);
  const x = again.images.find(i => i.slug === slug);
  assert.equal(x.archived, undefined); assert.equal(x.hidden, false); assert.equal(x.focusX, undefined); assert.equal(x.zoom, undefined);
});

test('Portfolio: looping is chosen per stack, for folders that exist', () => {
  const base = structuredClone(seed);
  const [a, b] = base.folders;
  const d = validateSiteDocument({ ...base, stacks: { loop: true, loops: { [a]: false, [b]: true, 'No such folder': false, [base.folders[2]]: 'yes' }, covers: {} } }, seed, seed);
  assert.deepEqual(d.stacks.loops, { [a]: false, [b]: true });
  assert.equal(d.stacks.loop, true, 'the default for stacks without their own choice is unchanged');
});

test('Image downloads are PNG unless the owner chooses JPEG', () => {
  const base = structuredClone(seed);
  assert.equal(validateSiteDocument({ ...base }, seed, seed).visibility.downloadFormat, 'png');
  assert.equal(validateSiteDocument({ ...base, visibility: { ...base.visibility, downloadFormat: 'jpeg' } }, seed, seed).visibility.downloadFormat, 'jpeg');
  assert.equal(validateSiteDocument({ ...base, visibility: { ...base.visibility, downloadFormat: 'webp' } }, seed, seed).visibility.downloadFormat, 'png', 'WebP is never offered');
});
