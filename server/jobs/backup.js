// Weekly backup: every table exported to one gzipped JSON file in the private `backups` bucket.
// Only the newest KEEP backups are kept, so backups can't fill the free 1 GB of storage.
// Download copies from the portal (Settings > Backups) and keep them somewhere else too.
import { gzipSync } from 'node:zlib';
import { getDb } from '../core/db.js';
import { getStorage } from '../core/storage.js';

export const KEEP = 8;
const PAGE = 5000;
// Secrets at rest stay out of backups: sessions are disposable, and the owner account is
// recreated from the portal's setup flow if ever needed.
const SKIP = new Set(['admin_sessions', 'rate_limits', 'd1_migrations', '_cf_KV', 'invoice_counter_placeholder']);

export async function runBackup(now = new Date()){
  const db = await getDb();
  // real tables only (not SQLite/D1 internals like _cf_METADATA, nor the search indexes, which rebuild from their tables)
  const tables = (await db.query(`select name from sqlite_master where type = 'table' and name not like 'sqlite!_%' escape '!' and name not like '!_cf!_%' escape '!' and name not like '%!_fts%' escape '!' order by name`))
    .map(r => r.name).filter(t => !SKIP.has(t));
  const out = { createdAt: now.toISOString(), tables: {} };
  const counts = {};
  for (const t of tables){
    const rows = [];
    for (let offset = 0; ; offset += PAGE){
      // table names come from sqlite_master, not from input; quoted as identifiers anyway
      const page = await db.query(`select * from "${t.replace(/"/g, '""')}" order by 1 limit ${PAGE} offset ${offset}`);
      for (const r of page) rows.push(t === 'admin_users' ? { ...r, password_hash: '[omitted]', totp_secret: r.totp_secret ? '[omitted]' : null } : r);
      if (page.length < PAGE) break;
    }
    out.tables[t] = rows;
    counts[t] = rows.length;
  }
  const bytes = gzipSync(Buffer.from(JSON.stringify(out, (_, v) => typeof v === 'bigint' ? v.toString() : v)));
  const path = `db/${now.toISOString().replace(/[:.]/g, '-')}.json.gz`;
  const storage = getStorage();
  try {
    await storage.put('backups', path, bytes, 'application/gzip');
    await db.query(`insert into backups (storage_path, bytes, tables, status) values ($1, $2, $3, 'ok')`, [path, bytes.length, counts]);
  } catch (err){
    await db.query(`insert into backups (storage_path, bytes, tables, status, error) values ($1, 0, $2, 'failed', $3)`, [path, counts, String(err.message).slice(0, 300)]);
    throw err;
  }
  // prune old ones
  const old = await db.query(`select id, storage_path from backups where status = 'ok' order by created_at desc limit -1 offset ${KEEP}`);
  if (old.length){
    await storage.remove('backups', old.map(o => o.storage_path));
    await db.query('delete from backups where id in (select value from json_each($1))', [old.map(o => o.id)]);
  }
  return { path, bytes: bytes.length, counts };
}
