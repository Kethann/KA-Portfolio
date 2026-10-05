// Stages the complete Pages bundle in ./out: the built site (dist/) plus the small router (_worker.js) and its
// route list (_routes.json) that hand /api, /legal, /license and file links to the Worker. Cloudflare's own Git
// build publishes this folder ("Build output directory: out"), so a push gives the same site as `npm run cf:deploy`
// (which stages its own copy in pages/out). Runs at the end of `npm run build` and `npm run build:cf`.
import { cpSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const out = resolve(root, 'out');
if (!existsSync(resolve(root, 'dist', 'index.html'))){ console.error('Build first: the site is not in dist/.'); process.exit(1); }
rmSync(out, { recursive: true, force: true });
cpSync(resolve(root, 'dist'), out, { recursive: true });
copyFileSync(resolve(root, 'pages', '_worker.js'), resolve(out, '_worker.js'));
copyFileSync(resolve(root, 'pages', '_routes.json'), resolve(out, '_routes.json'));
console.log('Staged the Pages bundle in out/ (site + router).');
