// Phase 6: visit beacon, UA parsing, bots, pings, geo providers (cache, quota, private IPs), admin views, retention.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { setGeoFetch, isPublicIp } from '../server/visitors/geo.js';
import { parseUA } from '../server/visitors/track.js';
import { setEnvSource } from '../server/core/env.js';
import { jobHooks } from '../server/jobs/hooks.js';

const app = await createTestApp({ ADMIN_SETUP_TOKEN: 'setup-code-123', ADMIN_ENCRYPTION_KEY: 'k' });
test.after(() => app.close());
const geoCalls = [];
setGeoFetch(async (url) => { geoCalls.push(url); return new Response(JSON.stringify({ success: true, country_code: 'DE', region: 'Berlin', city: 'Berlin', timezone: { id: 'Europe/Berlin' } }), { status: 200 }); });
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let n = 0;
const beacon = (body, { ua = CHROME, ip = '198.51.100.20', country } = {}) => app.call('POST', '/api/visit', { body, headers: { 'user-agent': ua }, ip, country });
const ids = () => ({ s: 'sess' + (++n).toString().padStart(8, '0'), v: 'visitor' + n.toString().padStart(8, '0') });

test('views are stored with IP, platform location and parsed device; pings add time on page', async () => {
  const id = ids();
  const r = await beacon({ t: 'view', ...id, p: '/?page=store', r: 'https://www.instagram.com/some/profile?utm=x', n: true, w: 390, h: 844, l: 'en-IN', z: 'Asia/Kolkata' }, { ua: IPHONE, country: 'IN' });
  assert.equal(r.status, 204);
  const row = (await app.pg.query('select * from visits where session_id = $1', [id.s])).rows[0];
  assert.equal(row.ip, '198.51.100.20'); assert.equal(row.country, 'IN'); assert.equal(row.device_type, 'mobile'); assert.equal(row.os, 'iOS');
  assert.equal(row.browser, 'Mobile Safari'); assert.equal(row.referrer, 'https://www.instagram.com/some/profile', 'query strings are dropped');
  assert.equal(row.is_new, true); assert.equal(row.is_bot, false); assert.equal(row.screen_w, 390); assert.equal(row.timezone, 'Asia/Kolkata');
  await beacon({ t: 'ping', ...id, d: 30000 });
  await beacon({ t: 'leave', ...id, d: 45000 });
  await beacon({ t: 'ping', ...id, d: 10000 });
  assert.equal((await app.pg.query('select duration_ms from visits where session_id = $1', [id.s])).rows[0].duration_ms, 45000, 'duration never goes backwards');
  assert.equal(geoCalls.length, 0, 'platform location means no third-party lookup');
});

test('precise location is opt-in, rounded, and accepted only for the matching visitor session', async () => {
  const id = ids();
  await beacon({ t: 'view', ...id, p: '/' }, { ip: '198.51.100.30', country: 'IN' });
  const saved = await beacon({ t: 'location', ...id, lat: 12.9716, lon: 77.5946, accuracy: 18 }, { ip: '198.51.100.30' });
  assert.equal(saved.status, 204);
  const row = (await app.pg.query('select latitude, longitude, location_accuracy, location_source from visits where session_id = $1', [id.s])).rows[0];
  assert.deepEqual(row, { latitude: 12.972, longitude: 77.595, location_accuracy: 100, location_source: 'browser-consent' });
  const rejected = await beacon({ t: 'location', ...id, v: 'someoneelse12345678', lat: 12, lon: 77, accuracy: 10 }, { ip: '198.51.100.30' });
  assert.equal(rejected.status, 204);
});

test('bots are flagged; bad input refused; old bare beacons are ignored quietly', async () => {
  const id = ids();
  await beacon({ t: 'view', ...id, p: '/' }, { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  assert.equal((await app.pg.query('select is_bot from visits where session_id = $1', [id.s])).rows[0].is_bot, true);
  assert.equal((await beacon({ t: 'view', s: 'short', v: 'x' })).status, 400);
  assert.equal((await beacon({ t: 'drop-table', ...ids() })).status, 400);
  const bare = await app.call('POST', '/api/visit', { ip: '198.51.100.21' });
  assert.equal(bare.status, 204);
  const cross = await app.call('POST', '/api/visit', { body: { t: 'view', ...ids(), p: '/' }, headers: { origin: 'https://evil.example' }, ip: '198.51.100.22' });
  assert.equal(cross.status, 403, 'other sites can’t write visits');
});

test('geo fallback: public IPs looked up once then cached; private IPs never leave the server; ipstack needs HTTPS', async () => {
  assert.equal(isPublicIp('192.168.1.5'), false); assert.equal(isPublicIp('10.0.0.1'), false); assert.equal(isPublicIp('::1'), false); assert.equal(isPublicIp('8.8.8.8'), true);
  geoCalls.length = 0;
  await beacon({ t: 'view', ...ids(), p: '/' }, { ip: '8.8.4.4' });
  await beacon({ t: 'view', ...ids(), p: '/' }, { ip: '8.8.4.4' });
  assert.equal(geoCalls.length, 1, 'second visit uses the cache');
  assert.match(geoCalls[0], /^https:\/\/ipwho\.is\//);
  const row = (await app.pg.query(`select country, city from visits where ip = '8.8.4.4' limit 1`)).rows[0];
  assert.deepEqual(row, { country: 'DE', city: 'Berlin' });
  await beacon({ t: 'view', ...ids(), p: '/' }, { ip: '192.168.0.9' });
  assert.equal(geoCalls.length, 1, 'private address not sent anywhere');
  setEnvSource({ ...app.vars, IPSTACK_ACCESS_KEY: 'k123', GEO_FALLBACK: 'none' });
  try {
    await beacon({ t: 'view', ...ids(), p: '/' }, { ip: '1.1.1.1' });
    assert.equal(geoCalls.length, 1, 'ipstack over plain HTTP is not used without an explicit opt-in');
    setEnvSource({ ...app.vars, IPSTACK_ACCESS_KEY: 'k123', IPSTACK_HTTPS: '1', GEO_FALLBACK: 'none' });
    await beacon({ t: 'view', ...ids(), p: '/' }, { ip: '1.0.0.1' });
    assert.match(geoCalls.at(-1), /^https:\/\/api\.ipstack\.com\/1\.0\.0\.1\?access_key=k123/);
  } finally { setEnvSource(app.vars); }
});

test('UA parsing covers desktop, tablet and TV', () => {
  assert.equal(parseUA(CHROME).device_type, 'desktop');
  assert.equal(parseUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1').device_type, 'tablet');
  assert.equal(parseUA('Mozilla/5.0 (Linux; Android 12; BRAVIA 4K GB Build/STT2.230920.001) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0 Safari/537.36 SmartTV').device_type, 'smarttv');
});

test('portal: summary, live, log and CSV (admin only); retention job deletes old rows', async () => {
  assert.equal((await app.call('GET', '/api/admin/visitors')).status, 401);
  const setup = await app.call('POST', '/api/admin/setup', { body: { email: 'owner@example.com', password: 'a long owner passphrase', token: 'setup-code-123' }, ip: '198.51.100.99' });
  const headers = { cookie: setup.headers.get('set-cookie').split(';')[0] };
  const s = await app.call('GET', '/api/admin/visitors', { headers, ip: '198.51.100.99' });
  assert.equal(s.status, 200);
  assert.ok(s.json.totals.sessions >= 5); assert.equal(s.json.totals.bots, 1);
  assert.ok(s.json.referrers.some(r => r.k === 'instagram.com'));
  assert.ok(s.json.devices.some(d => d.k === 'mobile'));
  const live = await app.call('GET', '/api/admin/visitors/live', { headers, ip: '198.51.100.99' });
  assert.ok(live.json.count >= 1);
  const log = await app.call('GET', '/api/admin/visitors/log?bots=only', { headers, ip: '198.51.100.99' });
  assert.equal(log.json.rows.length, 1);
  const csvRes = await app.call('GET', '/api/admin/visitors.csv', { headers, ip: '198.51.100.99' });
  assert.match(csvRes.text, /"ip",/); assert.match(csvRes.text, /198\.51\.100\.20/);
  await app.pg.query(`update visits set visited_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-400 days') where ip = '8.8.4.4'`);
  const r = await jobHooks.daily.visitRetention();
  assert.equal(r.removed, 2);
});

test('portal: one visitor\'s history and score, marking a visitor, and the marked-only filter', async () => {
  const login = await app.call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: 'a long owner passphrase' }, ip: '198.51.100.98' });
  assert.equal(login.status, 200);
  const headers = { cookie: login.headers.get('set-cookie').split(';')[0], 'x-csrf-token': login.json.csrf };
  const id = ids();
  await beacon({ t: 'view', ...id, p: '/', n: true }, { ip: '198.51.100.60', country: 'IN' });
  await beacon({ t: 'view', ...id, p: '/?page=store' }, { ip: '198.51.100.60', country: 'IN' });
  await beacon({ t: 'leave', ...id, d: 120000 }, { ip: '198.51.100.60' });
  assert.equal((await app.call('GET', '/api/admin/visitors/history?v=bad', { headers, ip: '198.51.100.98' })).status, 400);
  const h = await app.call('GET', `/api/admin/visitors/history?v=${id.v}`, { headers, ip: '198.51.100.98' });
  assert.equal(h.status, 200); assert.equal(h.json.total, 2); assert.equal(h.json.visits.length, 2); assert.equal(h.json.mark, null); assert.ok(h.json.score > 0 && h.json.score <= 100);
  const marked = await app.call('PUT', '/api/admin/visitors/mark', { headers, ip: '198.51.100.98', body: { visitorId: id.v, marked: true, label: 'client', note: 'asked about the poster kit' } });
  assert.equal(marked.status, 200); assert.equal(marked.json.mark.label, 'client');
  assert.equal((await app.call('PUT', '/api/admin/visitors/mark', { headers, ip: '198.51.100.98', body: { visitorId: 'x' } })).status, 400);
  const only = await app.call('GET', '/api/admin/visitors/log?marked=1&bots=include', { headers, ip: '198.51.100.98' });
  assert.ok(only.json.rows.length === 2 && only.json.rows.every(r => r.mark && r.mark.note === 'asked about the poster kit'), 'only the marked visitor, with the mark on each row');
  assert.equal((await app.call('GET', `/api/admin/visitors/history?v=${id.v}`, { headers, ip: '198.51.100.98' })).json.mark.label, 'client');
  assert.equal((await app.call('PUT', '/api/admin/visitors/mark', { headers, ip: '198.51.100.98', body: { visitorId: id.v, marked: false } })).status, 200);
  assert.equal((await app.call('GET', '/api/admin/visitors/log?marked=1&bots=include', { headers, ip: '198.51.100.98' })).json.rows.length, 0, 'un-marked');
  assert.equal((await app.call('GET', `/api/admin/visitors/history?v=${id.v}`, { ip: '198.51.100.98' })).status, 401, 'admin only');
});

test('portal: group by visitor, delete one visit or one visitor, and clear history while keeping marked visitors', async () => {
  const login = await app.call('POST', '/api/admin/login', { body: { email: 'owner@example.com', password: 'a long owner passphrase' }, ip: '198.51.100.97' });
  const headers = { cookie: login.headers.get('set-cookie').split(';')[0], 'x-csrf-token': login.json.csrf };
  const call = (m, u, body) => app.call(m, u, { headers, ip: '198.51.100.97', body });
  await app.pg.query('delete from visits');
  const a = ids(), b = ids(), c = ids();
  for (const [who, ip] of [[a, '198.51.100.71'], [b, '198.51.100.72'], [c, '198.51.100.73']]) {
    await beacon({ t: 'view', ...who, p: '/', n: true }, { ip, country: 'IN' });
    await beacon({ t: 'view', ...who, p: '/?page=tips' }, { ip, country: 'IN' });
  }
  const grouped = (await call('GET', '/api/admin/visitors/log?group=1&bots=include')).json.rows;
  assert.equal(grouped.length, 3, 'one row per visitor');
  assert.ok(grouped.every(r => r.visit_count === 2 && r.first_seen));
  // one visit
  const one = (await call('GET', `/api/admin/visitors/history?v=${a.v}`)).json.visits[0];
  assert.equal((await call('DELETE', `/api/admin/visitors/visit/${one.id}`)).json.removed, 1);
  assert.equal((await call('GET', `/api/admin/visitors/history?v=${a.v}`)).json.total, 1);
  assert.equal((await call('DELETE', '/api/admin/visitors/visit/abc')).status, 400);
  // mark b, then clear everything except marked visitors
  await call('PUT', '/api/admin/visitors/mark', { visitorId: b.v, marked: true, label: 'client', note: '' });
  assert.equal((await call('POST', '/api/admin/visitors/clear', { scope: 'nonsense' })).status, 400);
  assert.equal((await call('POST', '/api/admin/visitors/clear', { scope: 'older', days: 0 })).status, 400);
  assert.equal((await call('POST', '/api/admin/visitors/clear', { scope: 'older', days: 30 })).json.removed, 0, 'nothing is older than 30 days yet');
  const cleared = await call('POST', '/api/admin/visitors/clear', { scope: 'all', keepMarked: true });
  assert.equal(cleared.json.removed, 3, 'a (1 left) and c (2) are gone');
  assert.equal((await call('GET', `/api/admin/visitors/history?v=${b.v}`)).json.total, 2, 'the marked visitor stays');
  assert.equal((await call('GET', `/api/admin/visitors/history?v=${c.v}`)).json.total, 0);
  // one visitor, including the mark
  assert.equal((await call('DELETE', `/api/admin/visitors/visitor?v=${b.v}`)).json.removed, 2);
  assert.equal((await call('GET', `/api/admin/visitors/history?v=${b.v}`)).json.mark, null, 'the mark goes with the history');
  assert.equal((await call('DELETE', '/api/admin/visitors/visitor?v=x')).status, 400);
  assert.equal((await app.call('POST', '/api/admin/visitors/clear', { body: { scope: 'all' }, ip: '198.51.100.97' })).status, 401, 'admin only');
});
