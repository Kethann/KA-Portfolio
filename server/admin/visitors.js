// Portal: visitor analytics (summary, live now, the raw log, CSV). Bots are excluded from the
// summary but kept in the log (filterable).
import { json } from '../core/http.js';
import { getDb } from '../core/db.js';
import { range, csv } from './sales.js';
import { readJson, HttpError } from '../core/http.js';
import { getSettingWithRevision, setSetting } from '../core/settings.js';
import { audit } from './auth.js';
import { str } from '../core/validate.js';

const TZ = 'Asia/Kolkata';

export async function summary(ctx){
  const { from, to, start, end } = range(ctx.url);
  const db = await getDb();
  const p = [start, end];
  const W = `visited_at >= $1 and visited_at < $2 and not is_bot`;
  const [totals, series, countries, cities, devices, browsers, oses, referrers, paths, hours, bots] = await Promise.all([
    db.one(`select count(*) as views, count(distinct session_id) as sessions, count(distinct visitor_id) as visitors,
      count(distinct visitor_id) filter (where is_new) as new_visitors, coalesce(avg(duration_ms) filter (where duration_ms > 0), 0) as avg_ms from visits where ${W}`, p),
    db.query(`select strftime('%Y-%m-%d', visited_at, '+330 minutes') as day, count(distinct session_id) as sessions, count(*) as views from visits where ${W} group by 1 order by 1`, p),
    db.query(`select coalesce(country, '—') as k, count(distinct session_id) as n from visits where ${W} group by 1 order by n desc limit 20`, p),
    db.query(`select coalesce(city, '—') as k, coalesce(country, '') as country, count(distinct session_id) as n from visits where ${W} and city is not null group by 1, 2 order by n desc limit 15`, p),
    db.query(`select coalesce(device_type, 'unknown') as k, count(distinct session_id) as n from visits where ${W} group by 1 order by n desc`, p),
    db.query(`select coalesce(browser, 'unknown') as k, count(distinct session_id) as n from visits where ${W} group by 1 order by n desc limit 10`, p),
    db.query(`select coalesce(os, 'unknown') as k, count(distinct session_id) as n from visits where ${W} group by 1 order by n desc limit 10`, p),
    // referrer -> its site name: drop the scheme and a leading www., keep everything before the first /
    db.query(`select k, count(distinct session_id) as n from (select session_id, case when referrer = '' then 'Direct' else (
        select case when instr(h, '/') > 0 then substr(h, 1, instr(h, '/') - 1) else h end from (
          select case when s like 'www.%' then substr(s, 5) else s end as h from (
            select case when instr(referrer, '://') > 0 then substr(referrer, instr(referrer, '://') + 3) else referrer end as s))) end as k
      from visits where ${W}) group by k order by n desc limit 12`, p),
    db.query(`select path as k, count(*) as n from visits where ${W} group by 1 order by n desc limit 12`, p),
    db.query(`select cast(strftime('%H', visited_at, '+330 minutes') as integer) as h, count(*) as n from visits where ${W} group by 1 order by 1`, p),
    db.one(`select count(*) as n from visits where visited_at >= $1 and visited_at < $2 and is_bot`, p)
  ]);
  const returning = Math.max(0, totals.visitors - totals.new_visitors);
  return json({ from, to, totals: { ...totals, returning, bots: bots.n }, series, countries, cities, devices, browsers, oses, referrers, paths, hours });
}

export async function live(){
  const db = await getDb();
  // each live session's latest page view
  const rows = await db.query(`select session_id, path, country, city, device_type, device_vendor, device_model, browser, os, referrer, visited_at, last_seen_at from (
      select v.*, row_number() over (partition by session_id order by visited_at desc) as rn
      from visits v where last_seen_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes') and not is_bot) where rn = 1`);
  rows.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at));
  return json({ live: rows.slice(0, 100), count: rows.length });
}

function logFilter(url){
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll('?', `$${args.length}`)); };
  if (url.searchParams.get('from') || url.searchParams.get('to')){ const r = range(url); add('visited_at >= ?', r.start); add('visited_at < ?', r.end); }
  const bots = url.searchParams.get('bots');
  if (bots === 'only') where.push('is_bot'); else if (bots !== 'include') where.push('not is_bot');
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  if (q){ args.push(`%${q.toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`); const i = args.length; where.push(`(ip like $${i} or lower(coalesce(country,'')) like $${i} or lower(coalesce(city,'')) like $${i} or lower(path) like $${i} or lower(referrer) like $${i} or visitor_id like $${i} or lower(coalesce(browser,'')) like $${i})`); }
  const country = url.searchParams.get('country');
  if (country && /^[A-Z]{2}$/.test(country)) add('country = ?', country);
  return { w: where.length ? 'where ' + where.join(' and ') : '', args };
}
export async function log(ctx){
  const { w, args } = logFilter(ctx.url);
  const limit = Math.min(1000, Math.max(1, Number(ctx.url.searchParams.get('limit')) || 300));
  const offset = Math.max(0, Number(ctx.url.searchParams.get('offset')) || 0);
  const { marks } = await readMarks();
  let where = w, qargs = args;
  if (ctx.url.searchParams.get('marked') === '1'){          // only visitors the owner has marked
    qargs = [...args, JSON.stringify(Object.keys(marks))];
    where = (w ? w + ' and ' : 'where ') + `visitor_id in (select value from json_each($${qargs.length}))`;
  }
  const db = await getDb();
  const rows = await db.query(`select id, visited_at, last_seen_at, session_id, visitor_id, is_new, path, referrer, duration_ms, ip, country, region, city, timezone, language,
    device_type, device_vendor, device_model, os, os_version, browser, browser_version, screen_w, screen_h, is_bot, user_agent, postal, latitude, longitude, isp, continent, location_accuracy, location_source,
    (select provider from ip_geo_cache c where c.ip = visits.ip) as geo_provider from visits ${where} order by visited_at desc limit ${limit + 1} offset ${offset}`, qargs);
  return json({ rows: rows.slice(0, limit).map(r => ({ ...r, mark: marks[r.visitor_id] || null })), hasMore: rows.length > limit });
}
export async function logCsv(ctx){
  const { w, args } = logFilter(ctx.url);
  const db = await getDb();
  const rows = await db.query(`select * from visits ${w} order by visited_at desc limit 50000`, args);
  const cols = ['visited_at', 'session_id', 'visitor_id', 'is_new', 'path', 'referrer', 'duration_ms', 'ip', 'country', 'region', 'city', 'timezone', 'language', 'device_type', 'device_vendor', 'device_model', 'os', 'os_version', 'browser', 'browser_version', 'screen_w', 'screen_h', 'is_bot', 'user_agent', 'postal', 'latitude', 'longitude', 'isp', 'continent', 'location_accuracy', 'location_source']
    .map(k => ({ label: k, get: (r) => r[k] }));
  return new Response(csv(rows, cols), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="visitors-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}

// ---- one visitor's history, and marking visitors for follow-up -----------------------------------
const VISITOR_ID = /^[A-Za-z0-9_-]{8,40}$/;
const MARK_LABELS = ['follow-up', 'interested', 'client', 'ignore'];
async function readMarks(){ const { value, revision } = await getSettingWithRevision('visitorMarks'); return { marks: value && typeof value === 'object' ? value : {}, revision }; }

// Everything this device (visitor id) has done: first and last visit, every visit, pages, places and an engagement score from 0 to 100.
export async function history(ctx){
  const v = ctx.url.searchParams.get('v') || '';
  if (!VISITOR_ID.test(v)) throw new HttpError(400, 'Choose a visit first.');
  const db = await getDb();
  const rows = await db.query(`select id, visited_at, last_seen_at, session_id, path, referrer, duration_ms, ip, country, region, city, device_type, browser, os, is_new, is_bot
    from visits where visitor_id = $1 order by visited_at desc limit 300`, [v]);
  const total = (await db.one('select count(*) as n from visits where visitor_id = $1', [v])).n;
  const sessions = new Set(rows.map(r => r.session_id)).size;
  const pages = new Map(); let ms = 0; const places = new Set(), ips = new Set();
  for (const r of rows){ pages.set(r.path, (pages.get(r.path) || 0) + 1); ms += Number(r.duration_ms) || 0; if (r.city || r.country) places.add([r.city, r.country].filter(Boolean).join(', ')); if (r.ip) ips.add(r.ip); }
  const minutes = ms / 60000;
  // engagement: returning matters most, then pages seen, then time spent
  const score = Math.min(100, Math.round(Math.min(40, (sessions - 1) * 12) + Math.min(30, pages.size * 5) + Math.min(30, minutes * 3)));
  const { marks } = await readMarks();
  return json({ visitor: v, total, sessions, firstSeen: rows.length ? rows[rows.length - 1].visited_at : null, lastSeen: rows.length ? rows[0].visited_at : null, minutes: Math.round(minutes * 10) / 10,
    score, pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, n]) => ({ path, n })), places: [...places].slice(0, 6), ips: [...ips].slice(0, 6), visits: rows, mark: marks[v] || null });
}

// Mark (or un-mark) a visitor so they can be found again: a label and a short note.
export async function markVisitor(ctx){
  const b = await readJson(ctx.request, 4096);
  const v = String(b.visitorId || '');
  if (!VISITOR_ID.test(v)) throw new HttpError(400, 'Unknown visitor.');
  const { marks, revision } = await readMarks();
  const next = { ...marks };
  if (b.marked === false) delete next[v];
  else {
    if (!next[v] && Object.keys(next).length >= 500) throw new HttpError(409, 'You have marked 500 visitors. Un-mark some first.');
    const label = MARK_LABELS.includes(b.label) ? b.label : 'follow-up';
    next[v] = { label, note: str(b.note, { name: 'Note', max: 300 }), at: new Date().toISOString() };
  }
  const rev = await setSetting('visitorMarks', next, revision || 0);
  if (rev === null) throw new HttpError(409, 'The marks changed in another window. Try again.', { code: 'stale' });
  await audit(ctx, b.marked === false ? 'visitor_unmarked' : 'visitor_marked', v);
  return json({ ok: true, mark: next[v] || null });
}

export function registerVisitors(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/visitors', summary, a);
  route('GET', '/api/admin/visitors/live', live, a);
  route('GET', '/api/admin/visitors/log', log, a);
  route('GET', '/api/admin/visitors/history', history, a);
  route('PUT', '/api/admin/visitors/mark', markVisitor, a);
  route('GET', '/api/admin/visitors.csv', logCsv, a);
}
