// One-time move of your LOCAL data from the old Postgres (PGlite, .data/pglite) to the new SQLite setup:
//   1. copies every table into .data/ka.sqlite (so `npm start` shows your products, settings, orders…)
//   2. writes .data/d1-import.sql  -> load it into Cloudflare D1 (see docs/CLOUDFLARE.md, step "Move your data")
//   3. writes .data/r2-files.txt   -> the uploaded files to copy into R2 (`npm run cf:upload-files` does it)
// Sign-in sessions and rate-limit counters are not copied. Safe to re-run: it refuses to overwrite a
// SQLite database that already has data unless you pass --force.
// Usage: node scripts/migrate-local-to-d1.mjs [--force]
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';

const root = fileURLToPath(new URL('..', import.meta.url));
const dataDir = resolve(process.env.KA_DATA_DIR || resolve(root, '.data'));
const force = process.argv.includes('--force');
const pgDir = resolve(dataDir, 'pglite'), sqliteFile = resolve(dataDir, 'ka.sqlite');
if (!existsSync(pgDir)){ console.log('No old local database found (.data/pglite). Nothing to move.'); process.exit(0); }

// parents before children (foreign keys)
const ORDER = ['settings', 'legal_pages', 'licenses', 'email_templates', 'categories', 'products', 'product_media', 'product_files', 'tips',
  'coupons', 'orders', 'order_items', 'order_events', 'coupon_redemptions', 'webhook_events', 'invoice_counter', 'download_tokens', 'download_events',
  'messages', 'message_replies', 'canned_replies', 'blocklist', 'notify_signups', 'visits', 'ip_geo_cache', 'geo_quota',
  'kb_sources', 'kb_chunks', 'assistant_conversations', 'assistant_messages', 'assistant_usage', 'assistant_model_usage',
  'admin_users', 'audit_log', 'email_log', 'backups'];
const SKIP = new Set(['admin_sessions', 'rate_limits']);

const { PGlite } = await import('@electric-sql/pglite');
const pg = new PGlite(pgDir);
await pg.waitReady;

if (existsSync(sqliteFile)){
  const { default: Database } = await import('better-sqlite3');
  const probe = new Database(sqliteFile, { readonly: true });
  const has = probe.prepare(`select count(*) n from sqlite_master where name = 'products'`).get().n && probe.prepare('select count(*) n from products').get().n;
  probe.close();
  if (has && !force){ console.error('.data/ka.sqlite already has products. Run with --force to replace it with the old data.'); process.exit(1); }
  for (const f of [sqliteFile, sqliteFile + '-wal', sqliteFile + '-shm']) rmSync(f, { force: true });
}
const { openSqlite } = await import('../server/dev/sqlite.js');
const lite = openSqlite(sqliteFile);
const raw = lite.raw;

const liteCols = (t) => raw.prepare(`select name from pragma_table_info(?)`).all(t).map(r => r.name);
const toValue = (col, v) => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return col === 'day' ? v.toISOString().slice(0, 10) : v.toISOString();
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
};
const sqlLiteral = (v) => v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;

const sql = ['-- Your data, exported from the local database. Load with: npx wrangler d1 execute ka-db --remote --file .data/d1-import.sql',
  'PRAGMA defer_foreign_keys = true;'];
const report = {};
raw.pragma('foreign_keys = OFF');
raw.exec('begin');
try {
  // the fresh schema seeds invoice_counter with a row; the old value replaces it
  raw.exec('delete from invoice_counter');
  sql.push('DELETE FROM invoice_counter;');
  for (const t of ORDER){
    if (SKIP.has(t)) continue;
    const exists = (await pg.query(`select 1 from pg_tables where schemaname = 'public' and tablename = $1`, [t])).rows.length;
    if (!exists){ report[t] = 'not in old db'; continue; }
    const rows = (await pg.query(`select * from ${t}`)).rows;
    const cols = liteCols(t);
    let n = 0;
    for (const r of rows){
      const use = cols.filter(c => c in r);
      const vals = use.map(c => t === 'invoice_counter' && c === 'id' ? 1 : toValue(c, r[c]));
      raw.prepare(`insert into ${t} (${use.join(', ')}) values (${use.map(() => '?').join(', ')})`).run(...vals);
      sql.push(`INSERT INTO ${t} (${use.join(', ')}) VALUES (${vals.map(sqlLiteral).join(', ')});`);
      n++;
    }
    report[t] = n;
  }
  // a database from before the team feature has no roles: the first account becomes the owner
  if (!raw.prepare(`select 1 from admin_users where role = 'owner'`).get()){
    const OWNER = `update admin_users set role = 'owner' where id = (select id from admin_users order by created_at limit 1)`;
    raw.exec(OWNER); sql.push(OWNER + ';');
  }
  const bad = raw.prepare('pragma foreign_key_check').all();
  if (bad.length) throw new Error(`Foreign key problems after copying: ${JSON.stringify(bad.slice(0, 5))}`);
  raw.exec('commit');
} catch (err){
  raw.exec('rollback');
  throw err;
} finally {
  raw.pragma('foreign_keys = ON');
}
writeFileSync(resolve(dataDir, 'd1-import.sql'), sql.join('\n') + '\n');

// uploaded files -> list for R2 (bucket/path relative to .data/storage)
const storageRoot = resolve(dataDir, 'storage');
const files = [];
(function walk(dir){
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })){
    const p = resolve(dir, e.name);
    if (e.isDirectory()) walk(p); else files.push(p.slice(storageRoot.length + 1).split(sep).join('/'));
  }
})(storageRoot);
writeFileSync(resolve(dataDir, 'r2-files.txt'), files.join('\n') + (files.length ? '\n' : ''));

await pg.close(); await lite.close();
const total = Object.values(report).filter(n => typeof n === 'number').reduce((a, b) => a + b, 0);
console.log('Copied to .data/ka.sqlite:');
for (const [t, n] of Object.entries(report)) if (n) console.log(`  ${t.padEnd(24)} ${n}`);
console.log(`\n${total} rows. For Cloudflare: .data/d1-import.sql (${(statSync(resolve(dataDir, 'd1-import.sql')).size / 1024).toFixed(0)} KB) and ${files.length} files listed in .data/r2-files.txt.`);
