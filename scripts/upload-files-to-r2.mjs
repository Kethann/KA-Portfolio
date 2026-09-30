// Copies your local uploads (.data/storage: images, download files, backups) into the R2 bucket, keeping the
// same paths, so every image link and download in the moved database keeps working on Cloudflare.
// Needs: you are signed in (`npx wrangler login`) and the bucket exists. Run after scripts/migrate-local-to-d1.mjs.
// Usage: npm run cf:upload-files            (bucket name from wrangler.jsonc, default ka-files)
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = resolve(process.env.KA_DATA_DIR || resolve(root, '.data'));
const listFile = resolve(dataDir, 'r2-files.txt');
if (!existsSync(listFile)){ console.error('Run `node scripts/migrate-local-to-d1.mjs` first (it writes .data/r2-files.txt).'); process.exit(1); }
const cfg = readFileSync(resolve(root, 'wrangler.jsonc'), 'utf8');
const bucket = (/"bucket_name"\s*:\s*"([^"]+)"/.exec(cfg) || [])[1] || 'ka-files';
const files = readFileSync(listFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const TYPES = { webp: 'image/webp', avif: 'image/avif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf', zip: 'application/zip', pdf: 'application/pdf', gz: 'application/gzip', json: 'application/json' };
let ok = 0, failed = 0;
for (const [i, key] of files.entries()){
  const type = TYPES[key.split('.').pop().toLowerCase()] || 'application/octet-stream';
  const r = spawnSync('npx', ['wrangler', 'r2', 'object', 'put', `${bucket}/${key}`, '--file', resolve(dataDir, 'storage', ...key.split('/')), '--content-type', type, '--remote'],
    { cwd: root, shell: process.platform === 'win32', encoding: 'utf8' });
  if (r.status === 0){ ok++; console.log(`[${i + 1}/${files.length}] ${key}`); }
  else { failed++; console.error(`[${i + 1}/${files.length}] FAILED ${key}\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join('\n')}`); }
}
console.log(`\n${ok} uploaded${failed ? `, ${failed} failed (run again to retry; existing files are simply replaced)` : ''}.`);
process.exit(failed ? 1 : 0);
