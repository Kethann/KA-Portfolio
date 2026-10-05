// Social posts: validation, the automation webhook that actually publishes them, scheduling, and manual
// "I posted it" marks. No network API is called directly: the portal hands a finished post (text per network,
// picture links, time) to a webhook the owner connects (Zapier, Make, n8n, Buffer through Zapier ...), which
// posts it with the owner's own logins. The owner's logins never touch this server.
import { getDb } from '../core/db.js';
import { getSetting, setSetting } from '../core/settings.js';
import { encrypt, decrypt } from '../core/crypto.js';
import { env, isProduction, siteUrl } from '../core/env.js';
import { HttpError } from '../core/http.js';
import { str } from '../core/validate.js';
import { isOwnMediaUrl } from '../admin/catalog.js';
import { PLATFORMS, PLATFORM_IDS, POST_LIMITS, parseTags, composeText, checkPost } from '../../shared/social.js';

let fetchImpl = (...args) => fetch(...args);
export function setSocialFetch(fn){ fetchImpl = fn || ((...args) => fetch(...args)); }

function encKey(){
  const k = env('ADMIN_ENCRYPTION_KEY');
  if (k) return k;
  if (isProduction()) throw new HttpError(503, 'Saving a webhook needs ADMIN_ENCRYPTION_KEY on the server.');
  return 'local-development-only-key';
}

// ---- webhook address: https only, a real hostname (no IP numbers, no internal names); plain http only to
// localhost while developing, so a local n8n works.
export function checkWebhookUrl(raw){
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new HttpError(400, 'That webhook address is not a valid link.'); }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (local && !isProduction()) { if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, 'Use an http or https link.'); return u.toString(); }
  if (u.protocol !== 'https:') throw new HttpError(400, 'The webhook link must start with https://');
  if (u.username || u.password) throw new HttpError(400, 'Remove the user name and password from the link.');
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  if (isIp || !host.includes('.') || /\.(local|internal|localhost|lan|home|corp)$/.test(host)) throw new HttpError(400, 'Use the public https link your automation tool gives you.');
  return u.toString();
}

// ---- settings
export async function socialSettings(){
  const s = await getSetting('social');
  return { connected: !!s.webhook, host: s.webhookHost || '', defaultPlatforms: s.defaultPlatforms, defaultHashtags: s.defaultHashtags, signature: s.signature, lastTest: s.lastTest || null };
}
export async function saveSocialSettings(b){
  const cur = await getSetting('social');
  const next = { ...cur };
  if (b.clearWebhook === true){ next.webhook = ''; next.webhookHost = ''; }
  else if (typeof b.webhookUrl === 'string' && b.webhookUrl.trim()){
    const url = checkWebhookUrl(b.webhookUrl);
    next.webhook = encrypt(url, encKey()); next.webhookHost = new URL(url).hostname;
  }
  if (b.defaultPlatforms !== undefined){
    const list = Array.isArray(b.defaultPlatforms) ? b.defaultPlatforms : [];
    next.defaultPlatforms = [...new Set(list.filter(p => PLATFORMS[p]))];
  }
  if (b.defaultHashtags !== undefined) next.defaultHashtags = parseTags(b.defaultHashtags, 30);
  if (b.signature !== undefined) next.signature = str(b.signature, { name: 'Signature', max: 300, trim: false }).trimEnd();
  await setSetting('social', next);
  return socialSettings();
}
async function webhookUrl(){
  const s = await getSetting('social');
  if (!s.webhook) return null;
  try { return decrypt(s.webhook, encKey()); } catch { throw new HttpError(500, 'The saved webhook could not be read. Save it again in Social > Connect.'); }
}

// ---- posts
const parse = (v, fb) => { try { return typeof v === 'string' ? JSON.parse(v) : (v ?? fb); } catch { return fb; } };
export function postDto(r){
  return { id: r.id, title: r.title, caption: r.caption, hashtags: parse(r.hashtags, []), media: parse(r.media, []), platforms: parse(r.platforms, []), status: r.status,
    scheduledAt: r.scheduled_at, sentAt: r.sent_at, results: parse(r.results, {}), createdAt: r.created_at, updatedAt: r.updated_at };
}

export function validatePost(b, { forSchedule = false } = {}){
  const title = str(b.title, { name: 'Name', max: POST_LIMITS.title });
  const caption = str(b.caption, { name: 'Caption', max: POST_LIMITS.caption, trim: false }).replace(/\s+$/, '');
  const hashtags = parseTags(b.hashtags);
  const platforms = [...new Set((Array.isArray(b.platforms) ? b.platforms : []).filter(p => PLATFORMS[p]))];
  const rawMedia = Array.isArray(b.media) ? b.media : [];
  if (rawMedia.length > POST_LIMITS.media) throw new HttpError(400, `Use up to ${POST_LIMITS.media} pictures.`);
  const media = rawMedia.map(m => {
    const url = str(m && m.url, { name: 'Picture', max: 600 });
    if (!isOwnMediaUrl(url)) throw new HttpError(400, 'Upload the picture first (only pictures from your own library can be posted).');
    return { url, alt: str(m.alt, { name: 'Picture description', max: POST_LIMITS.alt }) };
  });
  let scheduledAt = null;
  if (b.scheduledAt){
    const t = new Date(b.scheduledAt);
    if (Number.isNaN(t.getTime())) throw new HttpError(400, 'Pick a valid date and time.');
    if (t.getTime() > Date.now() + 366 * 86400e3) throw new HttpError(400, 'Schedule within the next year.');
    scheduledAt = t.toISOString();
  }
  const wantSchedule = b.status === 'scheduled' || forSchedule;
  if (wantSchedule){
    if (!scheduledAt) throw new HttpError(400, 'Pick the date and time to post.');
    if (new Date(scheduledAt).getTime() < Date.now() - 5 * 60e3) throw new HttpError(400, 'That time has passed. Pick a time in the future.');
    const bad = checkPost({ caption, hashtags, platforms, media }).find(i => i.level === 'error');
    if (bad) throw new HttpError(400, bad.message);
  }
  return { title, caption, hashtags, media, platforms, scheduledAt, status: wantSchedule ? 'scheduled' : 'draft' };
}

export async function listPosts({ status, q, limit = 100 } = {}){
  const db = await getDb();
  const where = [], args = [];
  if (['draft', 'scheduled', 'posted', 'failed'].includes(status)){ args.push(status === 'posted' ? 'posted' : status); where.push(`status = $${args.length}`); }
  if (q){ args.push(`%${String(q).slice(0, 80).replace(/[%_]/g, '')}%`); where.push(`(caption like $${args.length} or title like $${args.length} or hashtags like $${args.length})`); }
  const rows = await db.query(`select * from social_posts ${where.length ? 'where ' + where.join(' and ') : ''}
    order by case when status = 'scheduled' then 0 else 1 end, coalesce(scheduled_at, updated_at) desc limit ${Math.min(200, Math.max(1, limit))}`, args);
  const counts = await db.one(`select count(*) as all_, count(*) filter (where status = 'draft') as draft, count(*) filter (where status in ('scheduled','sending')) as scheduled,
    count(*) filter (where status = 'posted') as posted, count(*) filter (where status = 'failed') as failed from social_posts`);
  const due = Number((await db.one(`select count(*) as n from social_posts where status = 'scheduled' and scheduled_at <= now()`)).n);
  return { posts: rows.map(postDto), counts: { all: Number(counts.all_), draft: Number(counts.draft), scheduled: Number(counts.scheduled), posted: Number(counts.posted), failed: Number(counts.failed) }, due };
}
export async function getPost(id){
  const db = await getDb();
  const r = await db.maybeOne('select * from social_posts where id = $1', [id]);
  if (!r) throw new HttpError(404, 'Post not found.');
  return postDto(r);
}
export async function savePost(id, b){
  const db = await getDb();
  const v = validatePost(b);
  const args = [v.title, v.caption, JSON.stringify(v.hashtags), JSON.stringify(v.media), JSON.stringify(v.platforms), v.status, v.scheduledAt];
  if (!id){
    const r = await db.one(`insert into social_posts (title, caption, hashtags, media, platforms, status, scheduled_at) values ($1,$2,$3,$4,$5,$6,$7) returning *`, args);
    return postDto(r);
  }
  const cur = await db.maybeOne('select status, updated_at from social_posts where id = $1', [id]);
  if (!cur) throw new HttpError(404, 'Post not found.');
  if (cur.status === 'posted' || cur.status === 'sending') throw new HttpError(409, cur.status === 'posted' ? 'This post has been sent. Duplicate it to post it again.' : 'This post is being sent right now.', { code: 'locked' });
  if (b.updatedAt && new Date(b.updatedAt).getTime() !== new Date(cur.updated_at).getTime()) throw new HttpError(409, 'This post was changed somewhere else. Reload it first.', { code: 'stale' });
  const r = await db.one(`update social_posts set title=$2, caption=$3, hashtags=$4, media=$5, platforms=$6, status=$7, scheduled_at=$8, updated_at=now()
    where id = $1 and status in ('draft','scheduled','failed') returning *`, [id, ...args]).catch(() => null);
  if (!r) throw new HttpError(409, 'This post is being sent right now.', { code: 'locked' });
  return postDto(r);
}
export async function deletePost(id){
  const db = await getDb();
  const r = await db.maybeOne(`delete from social_posts where id = $1 and status <> 'sending' returning id`, [id]);
  if (!r) throw new HttpError(404, 'Post not found (or it is being sent right now).');
}
export async function duplicatePost(id){
  const db = await getDb();
  const r = await db.maybeOne('select * from social_posts where id = $1', [id]);
  if (!r) throw new HttpError(404, 'Post not found.');
  const copy = await db.one(`insert into social_posts (title, caption, hashtags, media, platforms) values ($1,$2,$3,$4,$5) returning *`,
    [r.title ? `${r.title} (copy)`.slice(0, POST_LIMITS.title) : '', r.caption, r.hashtags, r.media, r.platforms]);
  return postDto(copy);
}

// ---- manual "I posted it" per network (for networks the owner posts to by hand)
export async function markPosted(id, platform, done){
  if (!PLATFORMS[platform]) throw new HttpError(400, 'Unknown network.');
  const db = await getDb();
  const r = await db.maybeOne('select * from social_posts where id = $1', [id]);
  if (!r) throw new HttpError(404, 'Post not found.');
  if (r.status === 'sending') throw new HttpError(409, 'This post is being sent right now.');
  const results = parse(r.results, {});
  const platforms = parse(r.platforms, []);
  if (!platforms.includes(platform)) throw new HttpError(400, 'That network is not on this post.');
  if (done) results[platform] = { state: 'posted', via: 'manual', at: new Date().toISOString() }; else delete results[platform];
  const all = platforms.length > 0 && platforms.every(p => results[p] && results[p].state !== 'failed');
  const status = all ? 'posted' : (r.scheduled_at && new Date(r.scheduled_at) > new Date() ? 'scheduled' : 'draft');
  const out = await db.one(`update social_posts set results=$2, status=$3, sent_at = case when $3 = 'posted' then coalesce(sent_at, now()) else null end, updated_at=now() where id=$1 returning *`,
    [id, JSON.stringify(results), status]);
  return postDto(out);
}

// ---- sending through the webhook
function absolute(url, base){ return /^https?:\/\//.test(url) ? url : base + (url.startsWith('/') ? '' : '/') + url; }
export function webhookPayload(post, base, event = 'post.send'){
  const text = {};
  for (const p of post.platforms) text[p] = composeText(post, p);
  return { event, id: post.id, title: post.title, platforms: post.platforms, text, caption: post.caption, hashtags: post.hashtags,
    media: post.media.map(m => ({ url: absolute(m.url, base), alt: m.alt })), scheduledAt: post.scheduledAt, site: base, sentAt: new Date().toISOString() };
}
async function deliver(url, payload){
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'KA-Social/1' }, body: JSON.stringify(payload), signal: ctl.signal, redirect: 'error' });
    if (!res.ok) return { ok: false, note: `The webhook answered HTTP ${res.status}.` };
    return { ok: true };
  } catch (err){
    return { ok: false, note: err && err.name === 'AbortError' ? 'The webhook took too long to answer.' : 'Could not reach the webhook.' };
  }
}

export async function sendPost(id, { request } = {}){
  const db = await getDb();
  const url = await webhookUrl();
  if (!url) throw new HttpError(400, 'Connect your automation first (Social > Connect), or post by hand and mark it posted.', { code: 'not_connected' });
  const cur = await getPost(id);
  const bad = checkPost(cur).find(i => i.level === 'error');
  if (bad) throw new HttpError(400, bad.message);
  const claimed = await db.maybeOne(`update social_posts set status='sending', updated_at=now() where id = $1 and status in ('draft','scheduled','failed') returning id`, [id]);
  if (!claimed) throw new HttpError(409, 'This post was already sent or is being sent.', { code: 'locked' });
  const base = siteUrl(request);
  const r = await deliver(url, webhookPayload(cur, base));
  const now = new Date().toISOString();
  const results = {};
  for (const p of cur.platforms) results[p] = r.ok ? { state: 'sent', via: 'webhook', at: now } : { state: 'failed', via: 'webhook', at: now, note: r.note };
  const out = await db.one(`update social_posts set status=$2, results=$3, sent_at = case when $2 = 'posted' then now() else sent_at end, updated_at=now() where id=$1 returning *`,
    [id, r.ok ? 'posted' : 'failed', JSON.stringify(results)]);
  return postDto(out);
}
export async function testWebhook({ request } = {}){
  const url = await webhookUrl();
  if (!url) throw new HttpError(400, 'Save the webhook link first.', { code: 'not_connected' });
  const r = await deliver(url, { event: 'ping', site: siteUrl(request), message: 'Test from your portal. Nothing was posted.', sentAt: new Date().toISOString() });
  const s = await getSetting('social');
  await setSetting('social', { ...s, lastTest: { ok: r.ok, at: new Date().toISOString(), note: r.ok ? '' : r.note } });
  return { ok: r.ok, note: r.note || '' };
}

// The scheduler (every 15 minutes on Cloudflare, every minute in the Node host): sends posts whose time has come, if
// a webhook is connected; otherwise they stay "due" for the owner to post by hand. Stuck sends are failed after 15 minutes.
export async function runDue(){
  const db = await getDb();
  const out = { sent: 0, failed: 0, unstuck: 0, waiting: 0 };
  const stuck = await db.query(`update social_posts set status='failed', results=$1, updated_at=now() where status='sending' and updated_at < $2 returning id`,
    [JSON.stringify({ error: { state: 'failed', note: 'Sending took too long. Try again.' } }), new Date(Date.now() - 15 * 60e3).toISOString()]);
  out.unstuck = stuck.length;
  const url = await webhookUrl();
  const due = await db.query(`select id from social_posts where status = 'scheduled' and scheduled_at <= now() order by scheduled_at limit 10`);
  if (!url){ out.waiting = due.length; return out; }
  for (const d of due){
    try { const p = await sendPost(d.id); if (p.status === 'posted') out.sent++; else out.failed++; }
    catch (err){ if (err && err.status === 409) continue; out.failed++; }
  }
  return out;
}

// ---- hashtag sets and what the owner uses most
export async function listHashtagSets(){
  const db = await getDb();
  return (await db.query('select id, name, tags from social_hashtag_sets order by name')).map(r => ({ id: r.id, name: r.name, tags: parse(r.tags, []) }));
}
export async function saveHashtagSet(id, b){
  const db = await getDb();
  const name = str(b.name, { name: 'Set name', max: 40, required: true });
  const tags = parseTags(b.tags, 60);
  if (!tags.length) throw new HttpError(400, 'Add at least one hashtag to the set.');
  try {
    if (id){
      const r = await db.maybeOne('update social_hashtag_sets set name=$2, tags=$3, updated_at=now() where id=$1 returning id, name, tags', [id, name, JSON.stringify(tags)]);
      if (!r) throw new HttpError(404, 'Set not found.');
      return { id: r.id, name: r.name, tags: parse(r.tags, []) };
    }
    const r = await db.one('insert into social_hashtag_sets (name, tags) values ($1,$2) returning id, name, tags', [name, JSON.stringify(tags)]);
    return { id: r.id, name: r.name, tags: parse(r.tags, []) };
  } catch (err){
    if (/UNIQUE constraint failed: social_hashtag_sets.name/.test(String(err.message))) throw new HttpError(409, 'A set with that name already exists.');
    throw err;
  }
}
export async function deleteHashtagSet(id){
  const db = await getDb();
  const r = await db.maybeOne('delete from social_hashtag_sets where id = $1 returning id', [id]);
  if (!r) throw new HttpError(404, 'Set not found.');
}
export async function popularTags(limit = 20){
  const db = await getDb();
  const rows = await db.query('select hashtags from social_posts order by created_at desc limit 200');
  const n = new Map();
  for (const r of rows) for (const t of parse(r.hashtags, [])) n.set(t.toLowerCase(), { t, c: (n.get(t.toLowerCase())?.c || 0) + 1 });
  return [...n.values()].sort((a, b) => b.c - a.c).slice(0, limit).map(x => x.t);
}
export { PLATFORM_IDS };
