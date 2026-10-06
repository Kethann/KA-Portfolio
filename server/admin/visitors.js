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
  const cols = `id, visited_at, last_seen_at, session_id, visitor_id, is_new, path, referrer, duration_ms, ip, country, region, city, timezone, language,
    device_type, device_vendor, device_model, os, os_version, browser, browser_version, screen_w, screen_h, is_bot, user_agent, postal, latitude, longitude, isp, continent, location_accuracy, location_source`;
  // group=1: one row per visitor (their latest visit) with how many visits and when they first came
  const grouped = ctx.url.searchParams.get('group') === '1';
  const rows = grouped
    ? await db.query(`select ${cols}, visit_count, first_seen, (select provider from ip_geo_cache c where c.ip = g.ip) as geo_provider from (
        select ${cols}, count(*) over (partition by visitor_id) as visit_count, min(visited_at) over (partition by visitor_id) as first_seen,
          row_number() over (partition by visitor_id order by visited_at desc, id desc) as rn from visits ${where}) g
        where rn = 1 order by visited_at desc limit ${limit + 1} offset ${offset}`, qargs)
    : await db.query(`select ${cols}, (select provider from ip_geo_cache c where c.ip = visits.ip) as geo_provider from visits ${where} order by visited_at desc, id desc limit ${limit + 1} offset ${offset}`, qargs);
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
// The totals count every visit; the list shows the latest 300.
export async function history(ctx){
  const v = ctx.url.searchParams.get('v') || '';
  if (!VISITOR_ID.test(v)) throw new HttpError(400, 'Choose a visit first.');
  const db = await getDb();
  const [rows, tot, pageRows, placeRows, ipRows] = await Promise.all([
    db.query(`select id, visited_at, last_seen_at, session_id, path, referrer, duration_ms, ip, country, region, city, device_type, browser, os, is_new, is_bot
      from visits where visitor_id = $1 order by visited_at desc, id desc limit 300`, [v]),
    db.one(`select count(*) as total, count(distinct session_id) as sessions, count(distinct path) as pages, coalesce(sum(duration_ms), 0) as ms, min(visited_at) as first_seen, max(visited_at) as last_seen from visits where visitor_id = $1`, [v]),
    db.query(`select path, count(*) as n from visits where visitor_id = $1 group by path order by n desc, path limit 8`, [v]),
    db.query(`select distinct city, country from visits where visitor_id = $1 and (city is not null or country is not null) limit 6`, [v]),
    db.query(`select distinct ip from visits where visitor_id = $1 and ip is not null limit 6`, [v])
  ]);
  const minutes = (Number(tot.ms) || 0) / 60000;
  // engagement: returning matters most, then pages seen, then time spent
  const score = tot.total ? Math.min(100, Math.round(Math.min(40, (tot.sessions - 1) * 12) + Math.min(30, tot.pages * 5) + Math.min(30, minutes * 3))) : 0;
  const { marks } = await readMarks();
  return json({ visitor: v, total: tot.total, sessions: tot.sessions, firstSeen: tot.first_seen, lastSeen: tot.last_seen, minutes: Math.round(minutes * 10) / 10,
    score, pages: pageRows.map(r => ({ path: r.path, n: r.n })), places: placeRows.map(r => [r.city, r.country].filter(Boolean).join(', ')), ips: ipRows.map(r => r.ip), visits: rows, mark: marks[v] || null });
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

// ---- deleting history -----------------------------------------------------------------------------------------
// One visit, one visitor (every visit from that device, and their mark), or a bulk clear. Deleting is permanent.
export async function deleteVisit(ctx){
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Unknown visit.');
  const db = await getDb();
  const removed = (await db.query('delete from visits where id = $1 returning 1', [id])).length;
  if (removed) await audit(ctx, 'visit_deleted', String(id));
  return json({ ok: true, removed });
}
export async function deleteVisitor(ctx){
  const v = ctx.url.searchParams.get('v') || '';
  if (!VISITOR_ID.test(v)) throw new HttpError(400, 'Unknown visitor.');
  const db = await getDb();
  const removed = (await db.query('delete from visits where visitor_id = $1 returning 1', [v])).length;
  const { marks, revision } = await readMarks();
  if (marks[v]){ const next = { ...marks }; delete next[v]; await setSetting('visitorMarks', next, revision || 0); }
  await audit(ctx, 'visitor_history_deleted', v, { removed });
  return json({ ok: true, removed });
}
// scope: 'older' (days), 'bots' or 'all'. Marked visitors can be kept.
export async function clearVisits(ctx){
  const b = await readJson(ctx.request, 2048);
  const scope = ['older', 'bots', 'all'].includes(b.scope) ? b.scope : null;
  if (!scope) throw new HttpError(400, 'Choose what to clear.');
  const keepMarked = b.keepMarked !== false;
  const where = [], args = [];
  if (scope === 'older'){
    const days = Number(b.days);
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new HttpError(400, 'Choose between 1 and 3650 days.');
    args.push(days); where.push(`visited_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || $${args.length} || ' days')`);
  } else if (scope === 'bots') where.push('is_bot');
  const { marks, revision } = await readMarks();
  const markedIds = Object.keys(marks);
  if (keepMarked && markedIds.length){ args.push(JSON.stringify(markedIds)); where.push(`visitor_id not in (select value from json_each($${args.length}))`); }
  const db = await getDb();
  const removed = (await db.query(`delete from visits ${where.length ? 'where ' + where.join(' and ') : ''} returning 1`, args)).length;
  if (scope === 'all'){
    await db.query('delete from ip_geo_cache');   // the cached IP lookups are personal data too
    if (!keepMarked && markedIds.length) await setSetting('visitorMarks', {}, revision || 0);
  }
  await audit(ctx, 'visits_cleared', scope, { removed, keepMarked, days: b.days || null });
  return json({ ok: true, removed });
}

export function registerVisitors(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/visitors', summary, a);
  route('GET', '/api/admin/visitors/live', live, a);
  route('GET', '/api/admin/visitors/log', log, a);
  route('GET', '/api/admin/visitors/history', history, a);
  route('PUT', '/api/admin/visitors/mark', markVisitor, a);
  route('DELETE', '/api/admin/visitors/visit/:id', deleteVisit, a);
  route('DELETE', '/api/admin/visitors/visitor', deleteVisitor, a);
  route('POST', '/api/admin/visitors/clear', clearVisits, a);
  route('GET', '/api/admin/visitors.csv', logCsv, a);
}
