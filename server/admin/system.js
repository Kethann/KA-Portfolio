// Portal: system status (which services are configured — names only, never values), email log,
// storage use, backups, audit log and visitor-data purge.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
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
  const emailFails = (await db.one(`select count(*)::int as n from email_log where status = 'failed' and created_at > now() - interval '7 days'`)).n;
  const size = await db.maybeOne('select pg_database_size(current_database())::bigint as bytes').catch(() => null);
  const migrations = await db.query('select name, applied_at from _migrations order by name').catch(() => []);
  return json({
    production: isProduction(), host: env('VERCEL') ? 'vercel' : 'node',
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
export async function backupLink(ctx){
  const db = await getDb();
  const b = await db.maybeOne(`select storage_path from backups where id::text = $1 and status = 'ok'`, [ctx.params.id]);
  if (!b) throw new HttpError(404, 'Backup not found.');
  await audit(ctx, 'backup_downloaded', ctx.params.id);
  return json({ url: await getStorage().signedUrl('backups', b.storage_path, 60, b.storage_path.split('/').pop()) });
}

export async function auditLog(ctx){
  const db = await getDb();
  const limit = Math.min(500, Number(ctx.url.searchParams.get('limit')) || 200);
  return json({ entries: await db.query(`select id, at, action, target, data, ip from audit_log order by at desc limit ${limit}`) });
}

// Deletes visitor records older than N days (the privacy policy's retention promise).
export async function purgeVisits(ctx){
  const b = await readJson(ctx.request, 1024);
  const days = int(b.olderThanDays, { name: 'Days', min: 0, max: 3650 });
  const db = await getDb();
  const rows = await db.query(`delete from visits where visited_at < now() - make_interval(days => $1) returning 1`, [days]);
  await audit(ctx, 'visits_purged', null, { days, count: rows.length });
  return json({ ok: true, deleted: rows.length });
}

export function registerSystem(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/system', status, a);
  route('GET', '/api/admin/system/storage', storageUsage, a);
  route('POST', '/api/admin/system/test-email', testEmail, a);
  route('GET', '/api/admin/backups', listBackups, a);
  route('POST', '/api/admin/backups', backupNow, a);
  route('GET', '/api/admin/backups/:id/link', backupLink, a);
  route('GET', '/api/admin/audit', auditLog, a);
  route('POST', '/api/admin/visits/purge', purgeVisits, a);
}
