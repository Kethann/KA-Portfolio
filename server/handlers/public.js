// Public site endpoints: config, portfolio document, contact form, notify-me list.
import { json, readJson, HttpError } from '../core/http.js';
import { env } from '../core/env.js';
import { getDb } from '../core/db.js';
import { getSetting, getSettingWithRevision, setSetting } from '../core/settings.js';
import { rateLimit, verifyTurnstile } from '../core/guard.js';
import { str, email as vEmail } from '../core/validate.js';
import { sendEmail } from '../core/email.js';
import { isBlocked } from '../core/blocklist.js';
import { demoPaymentsEnabled } from '../store/orders.js';
// bundled with the code (the Worker has no file system to read it from at runtime)
import seed from '../portfolio-seed.json' with { type: 'json' };
import { STATS_DEFAULT, SKILLS_DEFAULT, ABOUT_DEFAULT } from '../admin/site-document.js';

// Public, non-personal reads are never kept by a CDN and are rechecked by the browser every time, so a
// publish from the portal shows up on the very next request. The router adds an ETag, so an unchanged
// answer costs a tiny 304 instead of the whole document.
export const PUBLIC_CACHE = { 'Cache-Control': 'no-cache' };

// The content version: bumped after every successful change made in the portal. Open pages ask for it
// every few seconds (a few bytes) and reload their content only when it moves.
export async function liveVersion(){
  const db = await getDb();
  const row = await db.maybeOne(`select revision from settings where key = 'live'`);
  return json({ v: row ? row.revision : 0 });
}
export async function bumpLiveVersion(){
  const db = await getDb();
  await db.query(`insert into settings (key, value) values ('live', '{}')
    on conflict (key) do update set revision = settings.revision + 1, updated_at = now()`);
}

export function currencyFor(country){ return country === 'IN' ? 'INR' : 'USD'; }

export async function publicConfig(ctx){
  const [upscaler, assistant, store] = await Promise.all([getSetting('upscaler'), getSetting('assistant'), getSetting('store')]);
  const country = ctx.geo?.country || null;
  return json({
    turnstileSiteKey: env('TURNSTILE_SITE_KEY') || '',
    razorpayKeyId: env('RAZORPAY_KEY_ID') || '',
    country,
    suggestedCurrency: currencyFor(country),
    store: { enabled: store.enabled !== false, international: store.international !== false },
    demoPayments: demoPaymentsEnabled(),
    upscaler: { comingSoon: upscaler.comingSoon, title: upscaler.title, badge: upscaler.badge, text: upscaler.text, notifyEnabled: upscaler.notifyEnabled },
    assistant: { enabled: !!assistant.enabled, greeting: assistant.greeting, suggestions: assistant.suggestions }
  }, 200, { 'Cache-Control': 'private, no-store', Vary: 'Cookie' });
}

// The portfolio document the homepage renders (Featured Work + Portfolio). Same shape as the old
// JSON file; seeded from server/portfolio-seed.json the first time.
export async function loadSiteDocument(){
  const { value, revision } = await getSettingWithRevision('site');
  if (value) return { ...value, stats: value.stats || STATS_DEFAULT, skills: value.skills || SKILLS_DEFAULT, about: value.about || ABOUT_DEFAULT, revision };   // sites saved before About numbers / Skills existed
  const initial = { ...seed };
  delete initial.revision;
  const rev = await setSetting('site', initial, 0);
  if (rev === null) return loadSiteDocument();     // another request seeded it first
  return { ...initial, skills: initial.skills || SKILLS_DEFAULT, about: initial.about || ABOUT_DEFAULT, revision: rev };
}

// What visitors get: images the owner has hidden in the portal are left out (they stay in the portal, and so does the stack cover choice)
export function visibleSite(doc){
  if (!doc || !Array.isArray(doc.images)) return doc;
  const hidden = new Set(doc.images.filter(i => i.hidden === true).map(i => i.slug));
  if (!hidden.size) return doc;
  const covers = Object.fromEntries(Object.entries(doc.stacks?.covers || {}).filter(([, slug]) => !hidden.has(slug)));
  return { ...doc, images: doc.images.filter(i => !hidden.has(i.slug)), stacks: { ...(doc.stacks || {}), covers } };
}
export async function portfolio(){
  return json(visibleSite(await loadSiteDocument()), 200, PUBLIC_CACHE);
}

const NAME_MAX = 100;
export async function contact(ctx){
  await rateLimit(`contact:${ctx.ip}`, 5, 15 * 60);
  const body = await readJson(ctx.request, 32 * 1024);
  if (body && typeof body.website === 'string' && body.website) return json({ ok: true }, 202);   // honeypot: pretend success
  const name = str(body.name, { name: 'Name', max: NAME_MAX, required: true });
  const address = vEmail(body.email);
  const subject = str(body.subject, { name: 'Subject', max: 180, required: true });
  const message = str(body.message, { name: 'Message', max: 8000, required: true, trim: false }).trim();
  if (!message) throw new HttpError(400, 'Message is required.');
  await verifyTurnstile(body.turnstileToken, ctx.ip);

  const settings = await getSetting('messages');
  const spam = settings.spamFilter !== false && await isBlocked({ email: address, ip: ctx.ip, text: `${subject}\n${message}` });
  const db = await getDb();
  const row = await db.one(`insert into messages (source, name, email, subject, body, status, ip, meta)
    values ('contact', $1, $2, $3, $4, $5, $6, $7) returning id`,
    [name, address, subject, message, spam ? 'spam' : 'new', ctx.ip, { country: ctx.geo?.country || null }]);
  if (!spam){
    const to = settings.notifyEmail || env('OWNER_EMAIL');
    const portal = `${(env('PUBLIC_SITE_URL') || new URL(ctx.request.url).origin).replace(/\/+$/, '')}/portal/#messages/${row.id}`;
    if (to) await sendEmail({ to, template: 'contact_notify', replyTo: address, vars: { name, email: address, subject, message, portal_url: portal } });
    const reply = autoReplyFor(settings, new Date());
    if (reply) await sendEmail({ to: address, template: 'contact_autoreply', subjectOverride: reply.subject, bodyOverride: reply.body, vars: { name } });
  }
  return json({ ok: true }, 201);
}

// Auto-reply text: the away message outside business hours (Asia/Kolkata), otherwise the normal
// auto-reply, or nothing when both are off.
export function autoReplyFor(settings, now){
  const hours = settings.businessHours || {};
  if (hours.enabled && !withinHours(hours, now)){
    return { subject: settings.autoReply?.subject || 'Thanks for your message', body: `Hi {{name}},\n\n${hours.awayMessage}\n\n{{signature}}` };
  }
  if (settings.autoReply?.enabled) return { subject: settings.autoReply.subject, body: settings.autoReply.body };
  return null;
}
export function withinHours(hours, now){
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(p => [p.type, p.value]));
  const day = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const toMin = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  return (hours.days || []).includes(day) && minutes >= toMin(hours.start) && minutes < toMin(hours.end);
}

export const TOPICS = { upscaler: 'the Image Upscaler' };
export async function notify(ctx){
  await rateLimit(`notify:${ctx.ip}`, 5, 60 * 60);
  const body = await readJson(ctx.request, 8 * 1024);
  if (body && typeof body.website === 'string' && body.website) return json({ ok: true }, 202);
  const topic = typeof body.topic === 'string' && TOPICS[body.topic] ? body.topic : null;
  if (!topic) throw new HttpError(400, 'Unknown list.');
  const address = vEmail(body.email);
  await verifyTurnstile(body.turnstileToken, ctx.ip);
  const settings = await getSetting(topic);
  if (settings && settings.notifyEnabled === false) throw new HttpError(409, 'This list is closed.');
  const db = await getDb();
  const rows = await db.query(`insert into notify_signups (topic, email) values ($1, $2) on conflict (topic, email) do nothing returning id`, [topic, address]);
  // Same answer either way, so the form can't be used to discover who signed up.
  if (rows.length) await sendEmail({ to: address, template: 'notify_confirm', vars: { topic_name: TOPICS[topic] } });
  return json({ ok: true }, 201);
}
