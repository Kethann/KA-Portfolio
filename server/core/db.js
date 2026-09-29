// Database access. One tiny interface for every caller:
//   db.query(sql, params) -> rows        db.one(...) -> first row or throws
//   db.maybeOne(...) -> row or null      db.tx(async (tx) => ...) -> runs in one transaction
// Production: Postgres (Supabase) through the `postgres` driver and DATABASE_URL (use the
// transaction pooler URL, port 6543). Tests and local development plug in PGlite instead.
// SQL uses $1-style parameters everywhere; values are never concatenated into SQL text.
import { env } from './env.js';

let current = null;

function wrapPostgresJs(sql){
  return {
    query: async (text, params = []) => Array.from(await sql.unsafe(text, params)),
    tx: (fn) => sql.begin((inner) => fn(wrapPostgresJs(inner))),
  };
}

export function wrapPglite(pg){
  return {
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    tx: (fn) => pg.transaction((inner) => fn(wrapPglite(inner))),
  };
}

export function setDatabase(driver){ current = driver ? withHelpers(driver) : null; }

function withHelpers(d){
  const api = {
    query: d.query,
    async one(text, params){
      const rows = await d.query(text, params);
      if (!rows.length) throw new Error('Expected a row, got none.');
      return rows[0];
    },
    async maybeOne(text, params){ return (await d.query(text, params))[0] || null; },
    tx: (fn) => d.tx((inner) => fn(withHelpers(inner))),
  };
  return api;
}

export async function getDb(){
  if (current) return current;
  const url = env('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL is not configured.');
  const { default: postgres } = await import('postgres');
  const sql = postgres(url, {
    max: Number(env('DATABASE_POOL_MAX', 3)),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,              // required by Supabase's transaction pooler
    ssl: env('DATABASE_SSL') === 'disable' ? false : 'require',
    // int8 (ids, counts, byte sizes) as plain numbers, exactly like PGlite in tests: every value
    // stored here stays far below 2^53. Money columns are int4 and never need this.
    types: { bigint: { to: 20, from: [20], serialize: (x) => String(x), parse: (x) => Number(x) } },
    transform: { undefined: null },
    onnotice: () => {},
  });
  current = withHelpers(wrapPostgresJs(sql));
  return current;
}
