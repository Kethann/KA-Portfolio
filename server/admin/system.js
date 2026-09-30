// Portal: system status (which services are configured — names only, never values), email log,
// storage use, backups, audit log and visitor-data purge.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb, ftsQuery } from '../core/db.js';
import { env, isProduction } from '../core/env.js';
import { getSetting } from '../core/settings.js';
import { getStorage, BUCKETS } from '../core/storage.js';
import { sendEmail } from '../core/email.js';
import { runBackup, KEEP } from '../jobs/backup.js';
import { int } from '../core/validate.js';
import { audit } from './auth.js';

// Which features work, from which variables are set. Values are never returned.
const SERVICES = [
  { key: 'database', label: 'Database (Supabase Postgres)', vars: ['DATABASE_URL'], required: true },
  { key: 'storage', label: 'File storage (Supabase Storage)', vars: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], required: true },
  { key: 'email', label: 'Email (Brevo)', vars: ['BREVO_API_KEY', 'MAIL_FROM'], required: true },
  { key: 'payments', label: 'Payments (Razorpay)', vars: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'], required: true },
  { key: 'turnstile', label: 'Bot protection (Turnstile)', vars: ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'], required: true },
  { key: 'cron', label: 'Scheduled jobs', vars: ['CRON_SECRET'], required: true },
  { key: 'downloads', label: 'Download links', vars: ['DOWNLOAD_TOKEN_SECRET'], required: true },
  { key: 'admin', label: 'Portal security', vars: ['ADMIN_ENCRYPTION_KEY'], required: true },
  { key: 'site', label: 'Site address', vars: ['PUBLIC_SITE_URL'], required: true },
  { key: 'assistant', label: 'KA Assistant (AI provider)', vars: () => [env('AI_PROVIDER') === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY'], required: false },
  { key: 'geo', label: 'Visitor location (fallback lookup; Vercel headers work without it)', vars: ['IPSTACK_ACCESS_KEY'], required: false }
];

export async function status(){
  const db = await getDb();
  const t0 = Date.now();
  await db.query('select 1');
  const dbMs = Date.now() - t0;
  const system = await getSetting('system');
  const services = SERVICES.map(s => {
    const vars = typeof s.vars === 'function' ? s.vars() : s.vars;
    return { key: s.key, label: s.label, required: s.required, vars: vars.map(v => ({ name: v, set: !!env(v) })), ok: vars.every(v => !!env(v)) };
  });
  const email = await db.query(`select to_email, subject, template, status, error, created_at from email_log order by created_at desc limit 30`);
  const emailFails = (await db.one(`select count(*) as n from email_log where status = 'failed' and created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')`)).n;
  const size = await db.maybeOne('select page_count * page_size as bytes from pragma_page_count(), pragma_page_size()').catch(() => null);
  const migrations = await db.query('select name, applied_at from d1_migrations order by name').catch(() => []);
  return json({
    production: isProduction(), host: env('KA_PLATFORM') || 'node',
    database: { ok: true, ms: dbMs, bytes: size ? Number(size.bytes) : null, limitBytes: 500 * 1024 * 1024, migrations },
    lastHeartbeat: system.lastHeartbeat, lastBackup: system.lastBackup,
    services, email, emailFailures7d: emailFails,
    demoPayments: !isProduction() && env('KA_DEMO_PAYMENTS') === '1' && !env('RAZORPAY_KEY_ID')
  });
}

export async function storageUsage(){
  const storage = getStorage();
  const buckets = {};
  for (const b of Object.keys(BUCKETS)){
    try { buckets[b] = await storage.usage(b); } catch { buckets[b] = { bytes: null, count: null, error: 'Couldn’t read this bucket.' }; }
  }
  return json({ buckets, limitBytes: 1024 * 1024 * 1024 });
}

export async function testEmail(ctx){
  const res = await sendEmail({ to: ctx.admin.email, template: 'alert', vars: { title: 'Test email', body: 'Email sending works. This test was sent from the portal’s System window.' } });
  if (!res.ok) throw new HttpError(502, 'Sending failed. Check BREVO_API_KEY, MAIL_FROM and that the sender domain is verified in Brevo.');
  return json({ ok: true, to: ctx.admin.email });
}

export async function listBackups(){
  const db = await getDb();
  return json({ backups: await db.query('select id, created_at, bytes, tables, status, error from backups order by created_at desc limit 50'), keep: KEEP });
}
export async function backupNow(ctx){
  await audit(ctx, 'backup_started');
  const b = await runBackup();
  return json({ ok: true, bytes: b.bytes });
}
export async function deleteBackup(ctx){
  const db = await getDb();
  const b = await db.maybeOne('select id, storage_path from backups where id = $1', [ctx.params.id]);
  if (!b) throw new HttpError(404, 'Backup not found.');
  if (b.storage_path) await getStorage().remove('backups', [b.storage_path]).catch(() => {});
  await db.query('delete from backups where id = $1', [b.id]);
  await audit(ctx, 'backup_deleted', String(b.id));
  return listBackups();
}
export async function backupLink(ctx){
  const db = await getDb();
  const b = await db.maybeOne(`select storage_path from backups where id = $1 and status = 'ok'`, [ctx.params.id]);
  if (!b) throw new HttpError(404, 'Backup not found.');
  await audit(ctx, 'backup_downloaded', ctx.params.id);
  return json({ url: await getStorage().signedUrl('backups', b.storage_path, 60, b.storage_path.split('/').pop()) });
}

export async function auditLog(ctx){
  const db = await getDb();
  const limit = Math.min(500, Number(ctx.url.searchParams.get('limit')) || 200);
  return json({ entries: await db.query(`select id, at, action, target, data, ip, actor from audit_log order by at desc limit ${limit}`) });
}

// Deletes visitor records older than N days (the privacy policy's retention promise).
export async function purgeVisits(ctx){
  const b = await readJson(ctx.request, 1024);
  const days = int(b.olderThanDays, { name: 'Days', min: 0, max: 3650 });
  const db = await getDb();
  const rows = await db.query(`delete from visits where visited_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || $1 || ' days') returning 1`, [days]);
  await audit(ctx, 'visits_purged', null, { days, count: rows.length });
  return json({ ok: true, deleted: rows.length });
}

// Menu-bar status, polled by the portal: cheap counts only.
export async function pulse(){
  const db = await getDb();
  const r = await db.one(`select
    (select count(*) from messages where status = 'new') as new_messages,
    (select count(distinct session_id) from visits where last_seen_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes') and not is_bot) as live_visitors,
    (select count(*) from orders where status in ('paid','delivered') and paid_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-24 hours')) as orders_24h,
    (select count(*) from orders where status = 'mismatch' or (status = 'paid' and paid_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 minutes'))) as needs_attention`);
  return json({ newMessages: r.new_messages, liveVisitors: r.live_visitors, orders24h: r.orders_24h, needsAttention: r.needs_attention, serverTime: new Date().toISOString() });
}

// Command-palette search across the portal.
export async function search(ctx){
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q.length < 2) return json({ results: [] });
  const like = `%${q.toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`;
  const fq = ftsQuery(q);
  const ESC = `escape '\\'`;   // SQLite has no default LIKE escape; `like` above escapes % _ \ with a backslash
  const db = await getDb();
  const [orders, products, messages, tips, coupons] = await Promise.all([
    db.query(`select id, public_id, email, status, total, currency from orders where lower(public_id) like $1 ${ESC} or lower(email) like $1 ${ESC} or lower(coalesce(razorpay_payment_id,'')) like $1 ${ESC} order by created_at desc limit 5`, [like]),
    db.query(`select id, title, kind, status from products where lower(title) like $1 ${ESC} or lower(slug) like $1 ${ESC} order by updated_at desc limit 5`, [like]),
    db.query(`select id, subject, name, email, status from messages where ${fq ? 'rowid in (select rowid from messages_fts where messages_fts match $1) or ' : ''}lower(email) like $2 ${ESC} order by created_at desc limit 5`, [fq, like]),
    db.query(`select id, title, status from tips where lower(title) like $1 ${ESC} order by updated_at desc limit 3`, [like]),
    db.query(`select id, code, paused from coupons where lower(code) like $1 ${ESC} limit 3`, [like])
  ]);
  return json({ results: [
    ...orders.map(o => ({ app: 'orders', route: o.id, title: `${o.public_id} · ${o.email}`, meta: o.status, kind: 'Order' })),
    ...products.map(p => ({ app: 'products', route: p.id, title: p.title, meta: `${p.kind} · ${p.status}`, kind: 'Product' })),
    ...messages.map(m => ({ app: 'messages', route: m.id, title: m.subject || '(no subject)', meta: `${m.name} · ${m.status}`, kind: 'Message' })),
    ...tips.map(t => ({ app: 'tips', route: t.id, title: t.title, meta: t.status, kind: 'Tip' })),
    ...coupons.map(c => ({ app: 'coupons', route: c.id, title: c.code, meta: c.paused ? 'paused' : 'active', kind: 'Coupon' }))
  ] });
}

export function registerSystem(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/pulse', pulse, a);
  route('GET', '/api/admin/search', search, a);
  route('GET', '/api/admin/system', status, a);
  route('GET', '/api/admin/system/storage', storageUsage, a);
  route('POST', '/api/admin/system/test-email', testEmail, a);
  route('GET', '/api/admin/backups', listBackups, a);
  route('POST', '/api/admin/backups', backupNow, a);
  route('GET', '/api/admin/backups/:id/link', backupLink, a);
  route('DELETE', '/api/admin/backups/:id', deleteBackup, a);
  route('GET', '/api/admin/audit', auditLog, a);
  route('POST', '/api/admin/visits/purge', purgeVisits, a);
}
