import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FONT_LIBRARY, FONT_NAMES, fontStack, googleFontsUrl } from '../shared/fonts.js';
import { FONT_CHOICES } from '../server/admin/site-document.js';

test('the homepage font map matches the shared library exactly', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const m = /var KA_FONT_AXES = (\{.*?\});/.exec(html);
  assert.ok(m, 'KA_FONT_AXES is inlined in index.html');
  assert.deepEqual(JSON.parse(m[1]), Object.fromEntries(FONT_LIBRARY.map(f => [f.name, f.axes])));
});

test('the server accepts every library font and system-ui', () => {
  assert.deepEqual(FONT_CHOICES, FONT_NAMES);
  for (const n of ['Fraunces', 'Manrope', 'Sora', 'Poppins', 'Playfair Display', 'Space Grotesk', 'system-ui']) assert.ok(FONT_CHOICES.includes(n), n + ' still allowed');
});

test('library names are unique and build valid stacks and URLs', () => {
  assert.equal(new Set(FONT_LIBRARY.map(f => f.name)).size, FONT_LIBRARY.length);
  assert.ok(FONT_LIBRARY.length >= 60);
  assert.equal(fontStack('Caveat'), "'Caveat', cursive");
  assert.equal(fontStack('system-ui'), 'system-ui');
  assert.match(googleFontsUrl(['Fraunces', 'Great Vibes']), /family=Fraunces:opsz,wght@9\.\.144,300\.\.900&family=Great\+Vibes&display=swap$/);
  assert.equal(googleFontsUrl(['Nope']), '');
});

test('the studio bundle ships the themes, scenes and new effects', () => {
  const js = readFileSync(new URL('../dist/assets/studio.js', import.meta.url), 'utf8');   // themes and effects are in the studio's own bundle
  for (const s of ['Blockbuster', "Doctor's note", 'Command', 'Inferno', 'Frozen', 'Rainy night', 'Deep space', 'Underground', 'Bones', 'Ancient', 'Neon future',
    'Decode', 'Cinematic blur', 'Neon flicker', 'Constellation', 'Heartbeat line', 'Targeting HUD', 'Laurel wreath', 'Film grain', 'Gold foil', 'Comes in', 'Goes out', 'guide-tablet'])
    assert.ok(js.includes(s), s);
});
