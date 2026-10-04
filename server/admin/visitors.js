// Portal: visitor analytics (summary, live now, the raw log, CSV). Bots are excluded from the
// summary but kept in the log (filterable).
import { json } from '../core/http.js';
import { getDb } from '../core/db.js';
import { range, csv } from './sales.js';

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
  const db = await getDb();
  const rows = await db.query(`select id, visited_at, last_seen_at, session_id, visitor_id, is_new, path, referrer, duration_ms, ip, country, region, city, timezone, language,
    device_type, device_vendor, device_model, os, os_version, browser, browser_version, screen_w, screen_h, is_bot, user_agent, postal, latitude, longitude, isp, continent, location_accuracy, location_source,
    (select provider from ip_geo_cache c where c.ip = visits.ip) as geo_provider from visits ${w} order by visited_at desc limit ${limit + 1} offset ${offset}`, args);
  return json({ rows: rows.slice(0, limit), hasMore: rows.length > limit });
}
export async function logCsv(ctx){
  const { w, args } = logFilter(ctx.url);
  const db = await getDb();
  const rows = await db.query(`select * from visits ${w} order by visited_at desc limit 50000`, args);
  const cols = ['visited_at', 'session_id', 'visitor_id', 'is_new', 'path', 'referrer', 'duration_ms', 'ip', 'country', 'region', 'city', 'timezone', 'language', 'device_type', 'device_vendor', 'device_model', 'os', 'os_version', 'browser', 'browser_version', 'screen_w', 'screen_h', 'is_bot', 'user_agent', 'postal', 'latitude', 'longitude', 'isp', 'continent', 'location_accuracy', 'location_source']
    .map(k => ({ label: k, get: (r) => r[k] }));
  return new Response(csv(rows, cols), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="visitors-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
}

export function registerVisitors(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/visitors', summary, a);
  route('GET', '/api/admin/visitors/live', live, a);
  route('GET', '/api/admin/visitors/log', log, a);
  route('GET', '/api/admin/visitors.csv', logCsv, a);
}
