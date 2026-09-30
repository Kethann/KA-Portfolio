// Local/test database: SQLite (the engine D1 runs) with every file in migrations/ applied in order,
// exactly as `wrangler d1 migrations apply` does on Cloudflare. Never used in production.
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { toSql, toParam, fromRow } from '../core/db.js';

const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url));

export function migrate(db){
  db.exec(`create table if not exists d1_migrations (id integer primary key autoincrement, name text unique, applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  const done = new Set(db.prepare('select name from d1_migrations').all().map(r => r.name));
  for (const name of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()){
    if (done.has(name)) continue;
    db.transaction(() => {
      db.exec(readFileSync(resolve(migrationsDir, name), 'utf8'));
      db.prepare('insert into d1_migrations (name) values (?)').run(name);
    })();
  }
}

// file: path to a .sqlite file, or omitted for a throwaway in-memory database (tests)
export function openSqlite(file){
  const Database = createRequire(import.meta.url)('better-sqlite3');
  if (file) mkdirSync(dirname(resolve(file)), { recursive: true });
  const db = new Database(file || ':memory:');
  db.pragma('foreign_keys = ON');          // D1 enforces foreign keys too
  if (file) db.pragma('journal_mode = WAL');
  migrate(db);
  // $n -> @pn locally (named, so a query may use $2 without $1, as D1's positional ?n allows)
  const cache = new Map();
  const stmt = (text) => {
    let c = cache.get(text);
    if (!c){
      const used = [...new Set([...text.matchAll(/\$(\d+)/g)].map(m => Number(m[1])))];
      c = { s: db.prepare(toSql(text).replace(/\?(\d+)/g, '@p$1')), used };
      cache.set(text, c);
    }
    return c;
  };
  const run = (text, params = []) => {
    const { s, used } = stmt(text);
    const args = Object.fromEntries(used.map(n => [`p${n}`, toParam(params[n - 1])]));
    return s.reader ? s.all(args).map(fromRow) : (s.run(args), []);
  };
  return {
    kind: 'sqlite',
    raw: db,
    async query(text, params){ return run(text, params); },
    async batch(list){ return db.transaction(() => list.map(([t, p]) => run(t, p)))(); },
    async close(){ db.close(); },
  };
}
