// Free-plan usage: how full the file storage (R2) and the database (D1) are, for the portal's warning popup
// and a once-per-month email when a limit passes 80%. Measured at most every few hours (listing R2 is cheap but
// not free), and every day by the cron job.
import { json } from '../core/http.js';
import { getDb, dbSizeBytes } from '../core/db.js';
import { getSetting, setSetting } from '../core/settings.js';
import { getStorage, BUCKETS } from '../core/storage.js';
import { env } from '../core/env.js';
import { sendEmail } from '../core/email.js';
import { onDaily } from '../jobs/hooks.js';

const GB = 1024 ** 3, MB = 1024 ** 2;
// Cloudflare free plan: R2 10 GB of storage per account; D1 500 MB per database.
export const LIMITS = { files: 10 * GB, database: 500 * MB };
export const WARN = 0.8, CRITICAL = 0.95;
const FRESH_MS = 6 * 3600e3;

async function measure(){
  const storage = getStorage();
  let files = 0;
  for (const b of Object.keys(BUCKETS)){
    try { files += (await storage.usage(b)).bytes || 0; } catch { /* a bucket that can't be read counts as 0 */ }
  }
  const db = await getDb();
  await db.query('select 1');   // on D1 every query reports the database size
  let database = dbSizeBytes();
  if (database === null){
    const row = await db.maybeOne('select page_count * page_size as bytes from pragma_page_count(), pragma_page_size()').catch(() => null);
    database = row ? Number(row.bytes) : null;
  }
  return { files, database, at: new Date().toISOString() };
}

export function levelOf(items){
  const worst = Math.max(0, ...items.map(i => i.ratio ?? 0));
  return worst >= CRITICAL ? 'critical' : worst >= WARN ? 'warn' : 'ok';
}

export async function usageReport({ fresh = false } = {}){
  const saved = await getSetting('usage');
  let m = saved && saved.at && Date.now() - new Date(saved.at).getTime() < FRESH_MS && !fresh ? saved : null;
  if (!m){ m = { ...(saved || {}), ...(await measure()) }; await setSetting('usage', m); }
  const items = [
    { key: 'files', label: 'File storage (images, downloads, backups)', used: m.files, limit: LIMITS.files },
    { key: 'database', label: 'Database (products, orders, messages…)', used: m.database, limit: LIMITS.database },
  ].map(i => ({ ...i, ratio: i.used === null ? null : i.used / i.limit }));
  return { items, level: levelOf(items), measuredAt: m.at, alerted: m.alerted || null };
}

export async function usage(ctx){
  return json(await usageReport({ fresh: ctx.url.searchParams.get('fresh') === '1' }));
}

// Daily: email the owner once per month per level when a free limit passes 80% (and again at 95%).
onDaily('usageAlert', async () => {
  const r = await usageReport({ fresh: true });
  if (r.level === 'ok') return { level: 'ok' };
  const key = `${r.level}:${new Date().toISOString().slice(0, 7)}`;
  if (r.alerted === key) return { level: r.level, emailed: false };
  const to = env('OWNER_EMAIL');
  if (to){
    const lines = r.items.filter(i => i.ratio !== null && i.ratio >= WARN).map(i => `${i.label}: ${(i.used / GB).toFixed(2)} GB of ${(i.limit / GB).toFixed(i.limit < GB ? 1 : 0)} GB (${Math.round(i.ratio * 100)}%)`).join('\n');
    await sendEmail({ to, template: 'alert', vars: { title: r.level === 'critical' ? 'Free storage is almost full' : 'Free storage is getting full', body: `${lines}\n\nOpen the portal (Settings > System status) to see the details. When it is full, uploads stop working until space is freed or a second storage is added.` } });
  }
  const saved = await getSetting('usage');
  await setSetting('usage', { ...saved, alerted: key });
  return { level: r.level, emailed: !!to };
});

export function registerUsage(route){
  route('GET', '/api/admin/usage', usage, { access: 'admin' });
}
