// Publishes dist/ to the Pages project "kethan" (kethan.pages.dev) with the small router in pages/_worker.js.
// Run after `vite build` (npm run cf:deploy does both).
import { cpSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const pages = resolve(root, 'pages'), out = resolve(pages, 'out');
if (!existsSync(resolve(root, 'dist', 'index.html'))){ console.error('Build first: npm run build:cf'); process.exit(1); }
rmSync(out, { recursive: true, force: true });
cpSync(resolve(root, 'dist'), out, { recursive: true });
copyFileSync(resolve(pages, '_worker.js'), resolve(out, '_worker.js'));
copyFileSync(resolve(pages, '_routes.json'), resolve(out, '_routes.json'));
const r = spawnSync('npx', ['wrangler', 'pages', 'deploy', 'out', '--project-name', 'kethan', '--branch', 'main', '--commit-dirty=true'],
  { cwd: pages, stdio: 'inherit', shell: process.platform === 'win32' });
rmSync(out, { recursive: true, force: true });
process.exit(r.status ?? 1);
