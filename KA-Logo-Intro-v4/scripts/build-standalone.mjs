// Folds dist/ into one self-contained HTML (JS, CSS and the logo PNG inlined), like the v1 final build.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g, (_, href) => {
  return `<style>${readFileSync(join(dist, href), 'utf8')}</style>`;
});

if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('standalone build still references dist/assets');

const outDir = join(root, 'standalone');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'ka-logo-intro-v4.html');
writeFileSync(out, html);
console.log(`standalone: ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
