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
