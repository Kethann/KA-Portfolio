// One-time import of the old file-based data (server/data/) into the new database and storage:
//   portfolio.json      -> settings 'site' (same document the homepage renders)
//   uploads/*.png|jpg   -> public `media` bucket; image src links rewritten to the new URLs
//   inbox.json          -> messages
//   visitors-log.json   -> visits
// Safe to run twice: it skips anything already imported. The old creator password is NOT
// imported; create the owner account in the new portal instead.
// Usage: npm run db:import-legacy [-- path/to/data-dir]
import { config } from 'dotenv';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setEnvSource } from '../server/core/env.js';
import { getDb, setDatabase, wrapPglite } from '../server/core/db.js';
import { getStorage } from '../server/core/storage.js';
import { getSettingWithRevision, setSetting } from '../server/core/settings.js';

const root = fileURLToPath(new URL('..', import.meta.url));
config({ path: resolve(root, '.env') });
setEnvSource(process.env);
const legacyDir = resolve(process.argv[2] || resolve(root, 'server/data'));

async function readJson(name, fallback){ try { return JSON.parse(await readFile(resolve(legacyDir, name), 'utf8')); } catch { return fallback; } }

if (!process.env.DATABASE_URL){
  const { openPglite } = await import('../server/dev/pglite.js');
  setDatabase(wrapPglite(await openPglite(resolve(process.env.KA_DATA_DIR || resolve(root, '.data'), 'pglite'))));
  console.log('No DATABASE_URL: importing into the local development database (.data/).');
}
const db = await getDb();
const storage = getStorage();

// ---- uploads
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const moved = new Map();
let files = [];
try { files = (await readdir(resolve(legacyDir, 'uploads'))).filter(f => /^[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/i.test(f)); } catch {}
for (const f of files){
  const path = `portfolio/${f.toLowerCase()}`;
  await storage.put('media', path, await readFile(resolve(legacyDir, 'uploads', f)), TYPES[extname(f).toLowerCase()]);
  moved.set(`/uploads/${f}`, storage.publicUrl('media', path));
}
console.log(`Images copied to storage: ${moved.size}`);

// ---- portfolio document
const site = await readJson('portfolio.json', null);
if (site){
  const current = await getSettingWithRevision('site');
  if (current.revision && !process.argv.includes('--overwrite')){
    console.log('Portfolio already in the database (use --overwrite to replace it).');
  } else {
    const doc = JSON.parse(JSON.stringify(site), (k, v) => (typeof v === 'string' && moved.has(v) ? moved.get(v) : v));
    delete doc.revision;
    await setSetting('site', doc);
    console.log(`Portfolio imported: ${doc.images?.length || 0} images, ${doc.folders?.length || 0} folders.`);
  }
}

// ---- inbox
const inbox = await readJson('inbox.json', []);
let messages = 0;
for (const m of inbox){
  if (!m || !m.message) continue;
  const exists = await db.maybeOne(`select 1 from messages where meta->>'legacyId' = $1`, [String(m.id)]);
  if (exists) continue;
  const status = m.status === 'archived' ? 'done' : (m.status === 'read' ? 'read' : 'new');
  await db.query(`insert into messages (source, name, email, subject, body, status, created_at, meta) values ('contact',$1,$2,$3,$4,$5,$6,$7)`,
    [String(m.name || ''), String(m.email || '').toLowerCase(), String(m.subject || ''), String(m.message), status, m.createdAt || new Date().toISOString(), { legacyId: String(m.id) }]);
  messages++;
}
console.log(`Messages imported: ${messages}`);

// ---- visitor log
const visits = await readJson('visitors-log.json', []);
const already = (await db.one(`select count(*)::int as n from visits where session_id like 'legacy-%'`)).n;
let imported = 0;
if (!already){
  for (const [i, v] of visits.entries()){
    if (!v || !v.at) continue;
    await db.query(`insert into visits (visited_at, session_id, visitor_id, is_new, path, ip, country, device_type, os, browser, last_seen_at)
      values ($1,$2,$3,$4,'/',$5,$6,$7,$8,$9,$1)`,
      [v.at, `legacy-${i}`, `legacy-${v.ip || i}`, !!v.newVisitor, v.ip || null, v.location && v.location !== 'Unknown' ? v.location : null, v.device || null, v.os || null, v.browser || null]);
    imported++;
  }
}
console.log(already ? 'Visitor log already imported.' : `Visits imported: ${imported}`);
process.exit(0);
