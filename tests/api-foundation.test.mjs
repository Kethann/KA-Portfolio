import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { autoReplyFor, withinHours } from '../server/handlers/public.js';

const app = await createTestApp();
test.after(() => app.close());

const contact = (over = {}) => ({ name: 'Asha Rao', email: 'Asha@Example.com', subject: 'Poster work', message: 'Hello there, can we talk?', ...over });

test('public config exposes only public values and picks the currency by country', async () => {
  const india = await app.call('GET', '/api/public-config', { country: 'IN' });
  assert.equal(india.status, 200);
  assert.equal(india.json.suggestedCurrency, 'INR');
  const us = await app.call('GET', '/api/public-config', { country: 'US' });
  assert.equal(us.json.suggestedCurrency, 'USD');
  const unknown = await app.call('GET', '/api/public-config');
  assert.equal(unknown.json.suggestedCurrency, 'USD');
  const text = JSON.stringify(india.json);
  for (const secret of ['SECRET', 'service', 'password', 'CRON']) assert(!text.includes(secret), 'config must not leak ' + secret);
  assert.equal(india.json.upscaler.comingSoon, true);
});

test('portfolio is seeded once and keeps the shape the homepage reads', async () => {
  const a = await app.call('GET', '/api/portfolio');
  const b = await app.call('GET', '/api/portfolio');
  assert.equal(a.status, 200);
  assert.equal(a.json.revision, b.json.revision);
  assert(a.json.images.every(i => i.slug && i.title && i.cat));
  assert.equal(a.headers.get('cache-control'), 'no-cache', 'revalidated every time, so a publish shows at once'); assert.ok(a.headers.get('etag'));
});

test('contact stores the message, lowercases the email and notifies the owner', async () => {
  app.mail.sent.length = 0;
  const res = await app.call('POST', '/api/contact', { body: contact() });
  assert.equal(res.status, 201);
  const [row] = (await app.pg.query(`select * from messages order by created_at desc limit 1`)).rows;
  assert.equal(row.email, 'asha@example.com'); assert.equal(row.status, 'new'); assert.equal(row.source, 'contact');
  assert.equal(app.mail.sent.length, 1); assert.equal(app.mail.sent[0].to, 'owner@example.com');
  assert.equal(app.mail.sent[0].replyTo, 'asha@example.com');
  assert(!app.mail.sent[0].html.includes('<script'), 'content is escaped');
});

test('contact escapes hostile content in the owner email', async () => {
  app.mail.sent.length = 0;
  await app.call('POST', '/api/contact', { body: contact({ message: '<img src=x onerror=alert(1)> hi', subject: 'Hi\r\nBcc: victim@example.com' }), ip: '198.51.100.1' });
  const mail = app.mail.sent[0];
  assert(!mail.html.includes('<img src=x'), 'HTML must be escaped');
  assert(!/[\r\n]/.test(mail.subject), 'no header injection through the subject');
});

test('contact honeypot pretends success but stores nothing', async () => {
  const before = (await app.pg.query('select count(*)::int as n from messages')).rows[0].n;
  const res = await app.call('POST', '/api/contact', { body: contact({ website: 'http://spam' }), ip: '198.51.100.2' });
  assert.equal(res.status, 202);
  assert.equal((await app.pg.query('select count(*)::int as n from messages')).rows[0].n, before);
});

test('blocked senders land in spam without emailing anyone', async () => {
  await app.pg.query(`insert into blocklist (kind, value) values ('domain', 'spam.example')`);
  app.mail.sent.length = 0;
  const res = await app.call('POST', '/api/contact', { body: contact({ email: 'x@spam.example' }), ip: '198.51.100.3' });
  assert.equal(res.status, 201);
  assert.equal(app.mail.sent.length, 0);
  const [row] = (await app.pg.query(`select status from messages where email = 'x@spam.example'`)).rows;
  assert.equal(row.status, 'spam');
});

test('contact validates input and rate-limits per IP', async () => {
  assert.equal((await app.call('POST', '/api/contact', { body: contact({ email: 'not-an-email' }), ip: '198.51.100.9' })).status, 400);
  assert.equal((await app.call('POST', '/api/contact', { body: contact({ message: 'x'.repeat(8001) }), ip: '198.51.100.9' })).status, 400);
  for (let i = 0; i < 3; i++) await app.call('POST', '/api/contact', { body: contact(), ip: '198.51.100.9' });
  const limited = await app.call('POST', '/api/contact', { body: contact(), ip: '198.51.100.9' });
  assert.equal(limited.status, 429); assert.ok(limited.headers.get('retry-after'));
});

test('oversized and cross-site requests are refused', async () => {
  const big = await app.call('POST', '/api/contact', { body: JSON.stringify({ message: 'x'.repeat(40000) }), raw: true, headers: { 'content-type': 'application/json' }, ip: '198.51.100.20' });
  assert.equal(big.status, 413);
  const cross = await app.call('POST', '/api/contact', { body: contact(), headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, ip: '198.51.100.21' });
  assert.equal(cross.status, 403);
});

test('notify-me stores one signup per email and never reveals whether it existed', async () => {
  app.mail.sent.length = 0;
  const first = await app.call('POST', '/api/notify', { body: { email: 'Fan@Example.com', topic: 'upscaler' }, ip: '198.51.100.30' });
  const again = await app.call('POST', '/api/notify', { body: { email: 'fan@example.com', topic: 'upscaler' }, ip: '198.51.100.31' });
  assert.equal(first.status, 201); assert.equal(again.status, 201);
  assert.equal((await app.pg.query(`select count(*)::int as n from notify_signups where email = 'fan@example.com'`)).rows[0].n, 1);
  assert.equal(app.mail.sent.length, 1, 'one confirmation only');
  assert.equal((await app.call('POST', '/api/notify', { body: { email: 'a@b.co', topic: 'nope' }, ip: '198.51.100.32' })).status, 400);
});

test('cron endpoints need the secret, and the daily job writes a heartbeat', async () => {
  assert.equal((await app.call('GET', '/api/cron/daily')).status, 401);
  assert.equal((await app.call('GET', '/api/cron/daily', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  const ok = await app.call('GET', '/api/cron/daily', { headers: { authorization: 'Bearer test-cron-secret' } });
  assert.equal(ok.status, 200);
  const [row] = (await app.pg.query(`select value from settings where key = 'system'`)).rows;
  assert.ok(row.value.lastHeartbeat);
});

test('weekly backup exports tables to private storage without password hashes', async () => {
  await app.pg.query(`insert into admin_users (email, password_hash) values ('owner@example.com', 'scrypt$secret')`);
  const res = await app.call('GET', '/api/cron/weekly', { headers: { authorization: 'Bearer test-cron-secret' } });
  assert.equal(res.status, 200); assert.ok(res.json.results.backup.bytes > 0);
  const [b] = (await app.pg.query(`select storage_path from backups where status = 'ok'`)).rows;
  const { gunzipSync } = await import('node:zlib');
  const dump = JSON.parse(gunzipSync(await app.storage.get('backups', b.storage_path)).toString());
  assert.ok(dump.tables.messages.length > 0);
  assert.equal(dump.tables.admin_users[0].password_hash, '[omitted]');
  assert.equal(dump.tables.admin_sessions, undefined);
});

test('business hours use Asia/Kolkata time for the away message', () => {
  const hours = { enabled: true, days: [1, 2, 3, 4, 5], start: '10:00', end: '19:00', awayMessage: 'Away.' };
  // Monday 2026-09-28 05:00 UTC = 10:30 IST -> open
  assert.equal(withinHours(hours, new Date('2026-09-28T05:00:00Z')), true);
  // Monday 2026-09-28 14:00 UTC = 19:30 IST -> closed
  assert.equal(withinHours(hours, new Date('2026-09-28T14:00:00Z')), false);
  const reply = autoReplyFor({ businessHours: hours, autoReply: { enabled: false } }, new Date('2026-09-27T05:00:00Z'));   // Sunday
  assert.match(reply.body, /Away\./);
  assert.equal(autoReplyFor({ businessHours: { enabled: false }, autoReply: { enabled: false } }, new Date()), null);
});
