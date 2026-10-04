// Database access: Cloudflare D1 in production, a local SQLite file (same engine) in development and tests.
// One tiny interface for every caller:
//   db.query(sql, params) -> rows        db.one(...) -> first row or throws      db.maybeOne(...) -> row or null
//   db.batch([[sql, params], ...]) -> [rows, rows, ...]  — every statement or none (D1 has no open transactions,
//                                                         so anything that must happen together goes in one batch)
// SQL uses $1-style parameters (rewritten to SQLite's ?1); values are never concatenated into SQL text.
// Values are converted at this edge so handlers see plain JS: booleans, Date/ISO strings, parsed JSON.
//   now()  in SQL means the current UTC time as ISO text (the same format every timestamp column stores).
let current = null;
let lastD1Size = null;   // D1 reports the database size with every query result (meta.size_after)
export const dbSizeBytes = () => lastD1Size;

export const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

// Column names that hold 0/1 flags or JSON text anywhere in the schema (migrations/*.sql).
const BOOL = new Set(['published', 'sellable', 'is_free', 'refund_after_download', 'is_current', 'first_order_only', 'stackable', 'paused',
  'is_new', 'is_bot', 'enabled', 'cutoff_notified', 'totp_enabled', 'must_change_password']);
const JSON_COLS = new Set(['value', 'tags', 'tech_tags', 'currencies', 'product_ids', 'data', 'payload', 'labels', 'meta', 'sources', 'tables', 'payment_method',
  'media', 'given', 'file', 'snapshot']);   // + lists and objects built in queries (json_group_array / json_object)

export function toSql(text){
  return text.replace(/\$(\d+)/g, '?$1').replace(/\bnow\(\)/gi, NOW);
}
export function toParam(v){
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}
export function fromRow(row){
  for (const k in row){
    const v = row[k];
    if (BOOL.has(k) && (v === 0 || v === 1)) row[k] = v === 1;
    else if (JSON_COLS.has(k) && typeof v === 'string' && (v[0] === '{' || v[0] === '[')){ try { row[k] = JSON.parse(v); } catch { /* plain text */ } }
  }
  return row;
}

// ---- drivers ------------------------------------------------------------------------------------
// Cloudflare D1 binding (env.DB)
export function d1Driver(d1){
  // exactly as many values as the statement's highest $n (D1 refuses a count mismatch)
  const prep = (text, params = []) => {
    const n = Math.max(0, ...[...text.matchAll(/\$(\d+)/g)].map(m => Number(m[1])));
    return d1.prepare(toSql(text)).bind(...Array.from({ length: n }, (_, i) => toParam(params[i])));
  };
  return {
    kind: 'd1',
    async query(text, params){ const r = await prep(text, params).all(); if (r.meta?.size_after) lastD1Size = r.meta.size_after; return (r.results || []).map(fromRow); },
    async batch(list){ if (!list.length) return []; const rs = await d1.batch(list.map(([t, p]) => prep(t, p))); const sz = rs.at(-1)?.meta?.size_after; if (sz) lastD1Size = sz; return rs.map(r => (r.results || []).map(fromRow)); },
  };
}

export function setDatabase(driver){ current = driver ? withHelpers(driver) : null; }

function withHelpers(d){
  return {
    kind: d.kind,
    query: (text, params) => d.query(text, params),
    batch: (list) => d.batch(list.filter(Boolean)),
    async one(text, params){
      const rows = await d.query(text, params);
      if (!rows.length) throw new Error('Expected a row, got none.');
      return rows[0];
    },
    async maybeOne(text, params){ return (await d.query(text, params))[0] || null; },
    close: d.close,
  };
}

export async function getDb(){
  if (current) return current;
  throw new Error('The database is not connected. On Cloudflare add the D1 binding "DB"; locally start the app with npm start.');
}

// Search text -> a safe FTS5 query: only letters/numbers survive and each word is quoted, so user text can
// never reach the search parser as syntax. Every word must match, as a prefix ("pal" finds "palettes").
export function ftsQuery(q){
  const words = String(q || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return words.slice(0, 8).map(w => `"${w.slice(0, 40)}"*`).join(' ');
}

// "a in (...)" for a list parameter: in (select value from json_each($n))
export const inList = (n) => `(select value from json_each($${n}))`;
