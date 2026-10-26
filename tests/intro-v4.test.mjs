// Intro Version 4 (Ruby glint): listed for the portal, off unless chosen, and its loader keeps the homepage contract
// even when its module cannot start.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INTRO_VERSIONS, introVersion } from '../shared/intros.js';
import { applyIntroToHtml } from '../shared/intro-page.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../vite.config.mjs', import.meta.url), 'utf8');

test('Version 4 is listed and selectable', () => {
  assert.ok(INTRO_VERSIONS.some(v => v.id === 'v4' && v.label === 'Version 4'));
  assert.equal(introVersion('v4'), 'v4');
});

test('Version 4 is off unless chosen, loads its built module and always releases the page', () => {
  const m = html.match(/<script data-intro="v4"([^>]*)>([\s\S]*?)<\/script>/);
  assert.ok(m, 'index.html has the v4 block');
  assert.match(m[1], /type="text\/plain"/);
  assert.match(m[2], /import\('\.\/dist\/assets\/intro-v4\.js'\)/);
  assert.match(m[2], /\.catch\(fallback\)/);
  assert.match(m[2], /ka-sequence-complete/);
  assert.match(m[2], /boot-veil/);
  assert.match(vite, /'intro-v4':local\('\.\/client\/src\/intro-v4-entry\.ts'\)/);
});

test('choosing Version 4 serves only its block, switched on', () => {
  const page = applyIntroToHtml(html, 'v4', null);
  assert.ok(page.includes('<script data-intro="v4">'));
  assert.ok(!page.includes('<script data-intro="v1"') && !page.includes('<script data-intro="v3"'));
  assert.match(page, /<html[^>]*data-ka-intro="v4"/);
});
