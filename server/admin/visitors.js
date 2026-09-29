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
    db.one(`select count(*)::int as views, count(distinct session_id)::int as sessions, count(distinct visitor_id)::int as visitors,
      count(distinct visitor_id) filter (where is_new)::int as new_visitors, coalesce(avg(duration_ms) filter (where duration_ms > 0), 0)::int as avg_ms from visits where ${W}`, p),
    db.query(`select to_char(date_trunc('day', visited_at at time zone '${TZ}'), 'YYYY-MM-DD') as day, count(distinct session_id)::int as sessions, count(*)::int as views from visits where ${W} group by 1 order by 1`, p),
    db.query(`select coalesce(country, '—') as k, count(distinct session_id)::int as n from visits where ${W} group by 1 order by n desc limit 20`, p),
    db.query(`select coalesce(city, '—') as k, coalesce(country, '') as country, count(distinct session_id)::int as n from visits where ${W} and city is not null group by 1, 2 order by n desc limit 15`, p),
    db.query(`select coalesce(device_type, 'unknown') as k, count(distinct session_id)::int as n from visits where ${W} group by 1 order by n desc`, p),
    db.query(`select coalesce(browser, 'unknown') as k, count(distinct session_id)::int as n from visits where ${W} group by 1 order by n desc limit 10`, p),
    db.query(`select coalesce(os, 'unknown') as k, count(distinct session_id)::int as n from visits where ${W} group by 1 order by n desc limit 10`, p),
    db.query(`select case when referrer = '' then 'Direct' else regexp_replace(referrer, '^https?://(www\\.)?([^/]+).*$', '\\2') end as k, count(distinct session_id)::int as n from visits where ${W} group by 1 order by n desc limit 12`, p),
    db.query(`select path as k, count(*)::int as n from visits where ${W} group by 1 order by n desc limit 12`, p),
    db.query(`select extract(hour from visited_at at time zone '${TZ}')::int as h, count(*)::int as n from visits where ${W} group by 1 order by 1`, p),
    db.one(`select count(*)::int as n from visits where visited_at >= $1 and visited_at < $2 and is_bot`, p)
  ]);
  const returning = Math.max(0, totals.visitors - totals.new_visitors);
  return json({ from, to, totals: { ...totals, returning, bots: bots.n }, series, countries, cities, devices, browsers, oses, referrers, paths, hours });
}

export async function live(){
  const db = await getDb();
  const rows = await db.query(`select distinct on (session_id) session_id, path, country, city, device_type, browser, os, referrer, visited_at, last_seen_at
    from visits where last_seen_at > now() - interval '5 minutes' and not is_bot order by session_id, visited_at desc`);
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
    device_type, device_vendor, device_model, os, os_version, browser, browser_version, screen_w, screen_h, is_bot, user_agent from visits ${w} order by visited_at desc limit ${limit + 1} offset ${offset}`, args);
  return json({ rows: rows.slice(0, limit), hasMore: rows.length > limit });
}
export async function logCsv(ctx){
  const { w, args } = logFilter(ctx.url);
  const db = await getDb();
  const rows = await db.query(`select * from visits ${w} order by visited_at desc limit 50000`, args);
  const cols = ['visited_at', 'session_id', 'visitor_id', 'is_new', 'path', 'referrer', 'duration_ms', 'ip', 'country', 'region', 'city', 'timezone', 'language', 'device_type', 'device_vendor', 'device_model', 'os', 'os_version', 'browser', 'browser_version', 'screen_w', 'screen_h', 'is_bot', 'user_agent']
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
