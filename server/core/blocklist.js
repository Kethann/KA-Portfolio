// Owner-managed blocklist (Messages settings): email, domain, IP or keyword.
import { getDb } from './db.js';

export async function isBlocked({ email = '', ip = '', text = '' }){
  const db = await getDb();
  const rows = await db.query('select kind, value from blocklist');
  if (!rows.length) return false;
  const e = String(email).toLowerCase(), domain = e.split('@')[1] || '', body = String(text).toLowerCase();
  return rows.some(({ kind, value }) => {
    const v = String(value).toLowerCase();
    if (kind === 'email') return e === v;
    if (kind === 'domain') return domain === v || domain.endsWith('.' + v);
    if (kind === 'ip') return ip && ip === v;
    if (kind === 'keyword') return v && body.includes(v);
    return false;
  });
}
