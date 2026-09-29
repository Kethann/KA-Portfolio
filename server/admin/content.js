// Portal: site content (portfolio document), tips, legal pages, email templates, settings and the
// notify-me list. Every write is audited; documents use revisions so two open tabs can't overwrite
// each other silently.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { getSettingWithRevision, setSetting, DEFAULTS } from '../core/settings.js';
import { DEFAULT_TEMPLATES, sendEmail } from '../core/email.js';
import { renderMarkdown } from '../core/markdown.js';
import { str, stringArray, uuid as vUuid, url as vUrl } from '../core/validate.js';
import { loadSiteDocument, TOPICS } from '../handlers/public.js';
import { validateSiteDocument } from './site-document.js';
import { isOwnMediaUrl, slugify } from './catalog.js';
import { audit } from './auth.js';
import { createRequire } from 'node:module';
const seed = createRequire(import.meta.url)('../portfolio-seed.json');

// ---- portfolio document --------------------------------------------------------------------------
export async function getSite(){ return json(await loadSiteDocument()); }

export async function saveSite(ctx){
  const input = await readJson(ctx.request, 512 * 1024);
  const current = await loadSiteDocument();
  if (input.revision !== current.revision) throw new HttpError(409, 'The site was changed in another tab. Reload to see the latest version.', { code: 'stale' });
  const next = validateSiteDocument(input, current, seed);
  const rev = await setSetting('site', next, current.revision);
  if (rev === null) throw new HttpError(409, 'The site was changed in another tab. Reload to see the latest version.', { code: 'stale' });
  await audit(ctx, 'site_saved', null, { revision: rev, images: next.images.length });
  return json({ ...next, revision: rev });
}

// ---- tips ----------------------------------------------------------------------------------------
function tipDto(t){
  return { id: t.id, slug: t.slug, title: t.title, excerpt: t.excerpt, body: t.body_md, coverUrl: t.cover_url, categoryId: t.category_id,
    tags: t.tags, status: t.status, publishedAt: t.published_at, createdAt: t.created_at, updatedAt: t.updated_at };
}
export async function listTips(){
  const db = await getDb();
  return json({ tips: (await db.query('select * from tips order by coalesce(published_at, created_at) desc')).map(tipDto) });
}
export async function saveTip(ctx){
  const b = await readJson(ctx.request, 128 * 1024);
  const db = await getDb();
  const title = str(b.title, { name: 'Title', max: 160, required: true });
  const slug = slugify(b.slug || title).slice(0, 80);
  const cover = str(b.coverUrl, { max: 600 });
  if (cover && !isOwnMediaUrl(cover)) throw new HttpError(400, 'Upload the cover image first.');
  const categoryId = b.categoryId ? vUuid(b.categoryId, 'Category') : null;
  if (categoryId){
    const c = await db.maybeOne('select kind from categories where id = $1', [categoryId]);
    if (!c || c.kind !== 'tips') throw new HttpError(400, 'Choose a Tips category.');
  }
  const v = [slug, title, str(b.excerpt, { name: 'Excerpt', max: 400 }), str(b.body, { name: 'Body', max: 100000, trim: false }), cover, categoryId,
    stringArray(b.tags, { name: 'Tags', maxItems: 20, maxLength: 40 }), b.status === 'published' ? 'published' : 'draft'];
  let id = ctx.params.id;
  try {
    if (id){
      const cur = await db.maybeOne('select updated_at from tips where id::text = $1', [id]);
      if (!cur) throw new HttpError(404, 'Tip not found.');
      if (b.updatedAt && new Date(b.updatedAt).getTime() !== new Date(cur.updated_at).getTime()) throw new HttpError(409, 'This tip was changed somewhere else. Reload it first.', { code: 'stale' });
      await db.query(`update tips set slug=$2, title=$3, excerpt=$4, body_md=$5, cover_url=$6, category_id=$7, tags=$8, status=$9, updated_at=now(),
        published_at = case when $9 = 'published' and published_at is null then now() else published_at end where id::text = $1`, [id, ...v]);
    } else {
      id = (await db.one(`insert into tips (slug, title, excerpt, body_md, cover_url, category_id, tags, status, published_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8, case when $8 = 'published' then now() end) returning id`, v)).id;
    }
  } catch (err){
    if (/tips_slug_key|duplicate/i.test(String(err.message))) throw new HttpError(409, 'Another tip already uses that web address (slug).');
    throw err;
  }
  await audit(ctx, 'tip_saved', id, { status: v[7] });
  return json({ tip: tipDto(await db.one('select * from tips where id = $1', [id])) });
}
export async function deleteTip(ctx){
  const db = await getDb();
  const t = await db.maybeOne('delete from tips where id::text = $1 returning *', [ctx.params.id]);
  if (t) await audit(ctx, 'tip_deleted', t.slug);
  return json({ ok: true, deleted: t ? tipDto(t) : null });   // the portal keeps this for Undo
}
export async function previewMarkdown(ctx){
  const b = await readJson(ctx.request, 128 * 1024);
  return json({ html: renderMarkdown(str(b.body, { max: 100000, trim: false })) });
}

// ---- legal pages ---------------------------------------------------------------------------------
const LEGAL = { terms: 'Terms of Sale', privacy: 'Privacy Policy', refunds: 'Refund Policy', delivery: 'Delivery Policy' };
export async function listLegal(){
  const db = await getDb();
  const rows = await db.query('select * from legal_pages');
  return json({ pages: Object.entries(LEGAL).map(([slug, title]) => {
    const r = rows.find(x => x.slug === slug);
    return { slug, title: r?.title || title, body: r?.body_md || '', published: !!r?.published, updatedAt: r?.updated_at || null };
  }) });
}
export async function saveLegal(ctx){
  const slug = ctx.params.slug;
  if (!LEGAL[slug]) throw new HttpError(404, 'Unknown page.');
  const b = await readJson(ctx.request, 256 * 1024);
  const db = await getDb();
  await db.query(`insert into legal_pages (slug, title, body_md, published) values ($1,$2,$3,$4)
    on conflict (slug) do update set title = excluded.title, body_md = excluded.body_md, published = excluded.published, updated_at = now()`,
    [slug, str(b.title, { name: 'Title', max: 120 }) || LEGAL[slug], str(b.body, { name: 'Text', max: 200000, trim: false }), b.published === true]);
  await audit(ctx, 'legal_saved', slug, { published: b.published === true });
  return listLegal();
}

// ---- email templates -----------------------------------------------------------------------------
const TEMPLATE_INFO = {
  contact_notify: 'To you: a new contact message', contact_autoreply: 'To visitors: contact auto-reply', notify_confirm: 'To visitors: notify-me confirmation',
  order_delivery: 'To buyers: download link', order_receipt: 'To buyers: receipt', resend_link: 'To buyers: fresh download links',
  report: 'To you: scheduled report', alert: 'To you: alerts', reply: 'To visitors: your inbox replies', launch: 'To the notify list: launch announcement'
};
export async function listTemplates(){
  const db = await getDb();
  const rows = await db.query('select key, subject, body_md, updated_at from email_templates');
  return json({ templates: Object.keys(DEFAULT_TEMPLATES).map(key => {
    const r = rows.find(x => x.key === key), d = DEFAULT_TEMPLATES[key];
    const placeholders = [...new Set((d.subject + d.body).match(/\{\{\s*[a-z_]+\s*\}\}/g) || [])].map(p => p.replace(/[{}\s]/g, ''));
    return { key, label: TEMPLATE_INFO[key] || key, subject: r?.subject ?? d.subject, body: r?.body_md ?? d.body, customised: !!r, updatedAt: r?.updated_at || null, placeholders };
  }) });
}
export async function saveTemplate(ctx){
  const key = ctx.params.key;
  const def = DEFAULT_TEMPLATES[key];
  if (!def) throw new HttpError(404, 'Unknown template.');
  const b = await readJson(ctx.request, 64 * 1024);
  const subject = str(b.subject, { name: 'Subject', max: 200, required: true }), body = str(b.body, { name: 'Body', max: 20000, required: true, trim: false });
  // links buyers need must stay in: a template that drops them would break delivery
  const required = { order_delivery: ['download_url'], resend_link: ['links'], launch: ['link'] }[key] || [];
  for (const p of required) if (!body.includes(`{{${p}}}`)) throw new HttpError(400, `Keep {{${p}}} in this email; buyers need it.`);
  const db = await getDb();
  await db.query(`insert into email_templates (key, subject, body_md) values ($1,$2,$3) on conflict (key) do update set subject = excluded.subject, body_md = excluded.body_md, updated_at = now()`, [key, subject, body]);
  await audit(ctx, 'template_saved', key);
  return listTemplates();
}
export async function resetTemplate(ctx){
  const db = await getDb();
  await db.query('delete from email_templates where key = $1', [ctx.params.key]);
  await audit(ctx, 'template_reset', ctx.params.key);
  return listTemplates();
}
// Sends the template to the owner with sample values.
export async function testTemplate(ctx){
  const key = ctx.params.key;
  if (!DEFAULT_TEMPLATES[key]) throw new HttpError(404, 'Unknown template.');
  const b = await readJson(ctx.request, 64 * 1024);
  const sample = { name: 'Alex', email: 'alex@example.com', subject: 'Hello', message: 'A sample message.', topic_name: 'the Image Upscaler', topic_title: 'Image Upscaler',
    order_id: 'KA-SAMPLE', product_title: 'Sample Pack', download_url: 'https://example.com/download/sample', expires: 'tomorrow', max_downloads: '5',
    license_name: 'Personal', license_text: '(license text)', links: 'Sample Pack:\nhttps://example.com/download/sample', period: 'Weekly', summary: '(report summary)',
    portal_url: 'https://example.com/portal/', title: 'Sample alert', body: 'Sample text.', link: 'https://example.com', invoice_number: 'INV-000001', date: 'today',
    lines: 'Sample Pack — ₹499.00', subtotal: '₹499.00', discount: '₹0.00', tax_label: 'GST', tax: '₹0.00', total: '₹499.00', payment_id: 'pay_sample', seller_block: '' };
  const res = await sendEmail({ to: ctx.admin.email, template: key, vars: sample, subjectOverride: b.subject ? `[Test] ${str(b.subject, { max: 200 })}` : undefined, bodyOverride: b.body ? str(b.body, { max: 20000, trim: false }) : undefined });
  if (!res.ok) throw new HttpError(502, 'The test email couldn’t be sent. Check the email settings in System.');
  return json({ ok: true, to: ctx.admin.email });
}

// ---- settings (store, upscaler, messages, assistant, reports) --------------------------------------
const EDITABLE = ['store', 'upscaler', 'messages', 'assistant', 'reports', 'visitors'];
const RANGES = { taxRateBp: [0, 5000], orderExpiryMinutes: [10, 120], dailyBudgetMicros: [0, 50_000_000], retentionDays: [0, 3650] };
// Coerces input to the default's shape: same keys and types, strings bounded, numbers clamped.
export function coerce(def, input, path = ''){
  if (def === null || def === undefined) return undefined;
  if (Array.isArray(def)){
    if (!Array.isArray(input)) return def;
    if (def.every(x => typeof x === 'number')) return input.map(Number).filter(Number.isFinite).slice(0, 20);
    return input.filter(x => typeof x === 'string').map(x => x.trim().slice(0, 200)).filter(Boolean).slice(0, 20);
  }
  if (typeof def === 'object'){
    const out = {};
    for (const k of Object.keys(def)) out[k] = coerce(def[k], input && typeof input === 'object' ? input[k] : undefined, path ? `${path}.${k}` : k);
    return out;
  }
  if (input === undefined) return def;
  if (typeof def === 'boolean') return input === true;
  if (typeof def === 'number'){
    const n = Math.round(Number(input));
    if (!Number.isFinite(n)) throw new HttpError(400, `${path} must be a number.`);
    const [lo, hi] = RANGES[path.split('.').pop()] || [0, 1e9];
    if (n < lo || n > hi) throw new HttpError(400, `${path} must be between ${lo} and ${hi}.`);
    return n;
  }
  if (typeof def === 'string' || def === null) return typeof input === 'string' ? input.slice(0, 4000) : def;
  return def;
}
export async function getSettings(ctx){
  const key = ctx.params.key;
  if (!EDITABLE.includes(key)) throw new HttpError(404, 'Unknown settings.');
  const { value, revision } = await getSettingWithRevision(key);
  return json({ key, value, revision });
}
export async function saveSettings(ctx){
  const key = ctx.params.key;
  if (!EDITABLE.includes(key)) throw new HttpError(404, 'Unknown settings.');
  const b = await readJson(ctx.request, 64 * 1024);
  const value = coerce(DEFAULTS[key], b.value);
  if (key === 'messages' || key === 'reports'){
    for (const [p, v] of [['notifyEmail', value.notifyEmail], ['email', value.email]]) if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw new HttpError(400, `${p} must be an email address.`);
    if (key === 'messages') for (const t of [value.businessHours.start, value.businessHours.end]) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new HttpError(400, 'Use 24-hour times like 09:30.');
  }
  const rev = await setSetting(key, value, Number(b.revision) || 0);
  if (rev === null) throw new HttpError(409, 'These settings were changed in another tab. Reload them first.', { code: 'stale' });
  await audit(ctx, 'settings_saved', key);
  return json({ key, value, revision: rev });
}

// ---- notify-me list ------------------------------------------------------------------------------
export async function listNotify(){
  const db = await getDb();
  const rows = await db.query('select id, topic, email, created_at, notified_at from notify_signups order by created_at desc limit 5000');
  return json({ topics: Object.entries(TOPICS).map(([key, name]) => ({ key, name, total: rows.filter(r => r.topic === key).length, waiting: rows.filter(r => r.topic === key && !r.notified_at).length })), signups: rows });
}
export async function deleteSignup(ctx){
  const db = await getDb();
  await db.query('delete from notify_signups where id::text = $1', [ctx.params.id]);
  return listNotify();
}
// Emails everyone not yet notified, once. Safe to press twice: notified_at is claimed per row first.
export async function launch(ctx){
  const topic = ctx.params.topic;
  if (!TOPICS[topic]) throw new HttpError(404, 'Unknown list.');
  const b = await readJson(ctx.request, 16 * 1024);
  const link = vUrl(b.link, { name: 'Link', required: true });
  const message = str(b.message, { max: 2000, trim: false });
  const db = await getDb();
  const batch = await db.query(`update notify_signups set notified_at = now() where id in (select id from notify_signups where topic = $1 and notified_at is null limit 200) returning id, email`, [topic]);
  let sent = 0, failed = 0;
  for (const r of batch){
    const res = await sendEmail({ to: r.email, template: 'launch', vars: { topic_name: TOPICS[topic], topic_title: TOPICS[topic].replace(/^the /, '').replace(/^./, c => c.toUpperCase()), link, message } });
    if (res.ok) sent++; else { failed++; await db.query('update notify_signups set notified_at = null where id = $1', [r.id]); }
  }
  const left = (await db.one('select count(*)::int as n from notify_signups where topic = $1 and notified_at is null', [topic])).n;
  await audit(ctx, 'launch_email', topic, { sent, failed });
  return json({ sent, failed, remaining: left });
}


export function registerContent(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/site', getSite, a);
  route('PUT', '/api/admin/site', saveSite, a);
  route('GET', '/api/admin/tips', listTips, a);
  route('POST', '/api/admin/tips', saveTip, a);
  route('PUT', '/api/admin/tips/:id', saveTip, a);
  route('DELETE', '/api/admin/tips/:id', deleteTip, a);
  route('POST', '/api/admin/markdown', previewMarkdown, a);
  route('GET', '/api/admin/legal', listLegal, a);
  route('PUT', '/api/admin/legal/:slug', saveLegal, a);
  route('GET', '/api/admin/email-templates', listTemplates, a);
  route('PUT', '/api/admin/email-templates/:key', saveTemplate, a);
  route('DELETE', '/api/admin/email-templates/:key', resetTemplate, a);
  route('POST', '/api/admin/email-templates/:key/test', testTemplate, a);
  route('GET', '/api/admin/settings/:key', getSettings, a);
  route('PUT', '/api/admin/settings/:key', saveSettings, a);
  route('GET', '/api/admin/notify', listNotify, a);
  route('DELETE', '/api/admin/notify/:id', deleteSignup, a);
  route('POST', '/api/admin/notify/:topic/launch', launch, a);
}
