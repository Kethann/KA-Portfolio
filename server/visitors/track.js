// POST /api/visit: the homepage's visit beacon. No cookies: the page keeps a random visitor ID in
// localStorage and a session ID in sessionStorage. We store the raw IP, approximate location and the
// parsed browser/device (ua-parser-js). Events: view (a page or section was shown), ping (still here,
// every 30 s while visible) and leave (time on page).
import { HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { rateLimit } from '../core/guard.js';
import { locate } from './geo.js';
import { getSetting } from '../core/settings.js';
import { onDaily } from '../jobs/hooks.js';
import UAParser from 'ua-parser-js'; // a static import so Vercel bundles the package

const ID = /^[A-Za-z0-9_-]{8,40}$/;
export const BOT = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|skype|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|curl|wget|python|httpclient|axios|node-fetch|okhttp|go-http|java\//i;
const clip = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
const int = (v, max) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.round(Number(v)))) : null;

export function parseUA(ua){
  const r = new UAParser(ua || '').getResult();
  return {
    device_type: r.device.type || (ua ? 'desktop' : null), device_vendor: r.device.vendor || null, device_model: r.device.model || null,
    os: r.os.name || null, os_version: r.os.version || null, browser: r.browser.name || null, browser_version: r.browser.version || null
  };
}
function cleanReferrer(r, selfOrigin){
  if (!r) return '';
  try { const u = new URL(r); if (u.origin === selfOrigin) return ''; return (u.origin + u.pathname).slice(0, 300); } catch { return ''; }
}

export async function visit(ctx){
  const type = ctx.request.headers.get('content-type') || '';
  if (!/application\/json/i.test(type)) return new Response(null, { status: 204 });   // an old cached page's bare beacon
  let body;
  try { body = JSON.parse((await ctx.request.text()).slice(0, 4096)); } catch { throw new HttpError(400, 'Bad request.'); }
  const t = body.t, sid = body.s, vid = body.v;
  if (!['view', 'ping', 'leave'].includes(t) || !ID.test(sid || '') || !ID.test(vid || '')) throw new HttpError(400, 'Bad request.');
  await rateLimit(`visit:${ctx.ip}`, 300, 10 * 60);
  const db = await getDb();
  if (t === 'view'){
    const ua = clip(ctx.request.headers.get('user-agent') || '', 400);
    const path = clip(body.p, 300).startsWith('/') ? clip(body.p, 300) : '/';
    const geo = await locate(ctx.ip, ctx.geo).catch(() => null);
    const u = parseUA(ua);
    await db.query(`insert into visits (session_id, visitor_id, is_new, path, referrer, ip, country, region, city, timezone, language,
        device_type, device_vendor, device_model, os, os_version, browser, browser_version, screen_w, screen_h, is_bot, user_agent)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [sid, vid, body.n === true, path, cleanReferrer(clip(body.r, 500), new URL(ctx.request.url).origin), ctx.ip, geo?.country || null, geo?.region || null, geo?.city || null,
        geo?.timezone || clip(body.z, 60) || null, clip(body.l, 20) || null, u.device_type, u.device_vendor, u.device_model, u.os, u.os_version, u.browser, u.browser_version,
        int(body.w, 20000), int(body.h, 20000), BOT.test(ua) || !ua, ua]);
  } else {
    await db.query(`update visits set last_seen_at = now(), duration_ms = greatest(coalesce(duration_ms, 0), $2)
      where id = (select id from visits where session_id = $1 order by visited_at desc limit 1)`, [sid, int(body.d, 24 * 3600e3) || 0]);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

// Retention: old visits and stale location cache entries are deleted every day.
onDaily('visitRetention', async () => {
  const db = await getDb();
  const { retentionDays } = await getSetting('visitors');
  const removed = retentionDays > 0 ? (await db.query(`delete from visits where visited_at < now() - make_interval(days => $1) returning 1`, [retentionDays])).length : 0;
  await db.query(`delete from ip_geo_cache where looked_up_at < now() - interval '30 days'`);
  return { removed };
});

export function registerVisits(route){ route('POST', '/api/visit', visit); }
