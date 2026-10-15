// Store status and special access, coupon apply counts, saved visit logs, contact topics and replies on the
// visitor's device, the announcement tab and the Featured Work showcase, against the real handler + SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { validateFeaturedShow } from '../server/admin/site-document.js';
import { textToHtml } from '../server/core/email.js';

const app = await createTestApp({ KA_DEMO_PAYMENTS: '1', ADMIN_SETUP_TOKEN: 'setup-code-xyz', ADMIN_ENCRYPTION_KEY: 'test-admin-key', PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());

const OWNER = { email: 'owner@example.com', password: 'correct horse battery staple' };
let ipN = 0;
const ip = () => `198.51.100.${++ipN % 250}`;
let S = null;
async function admin(method, path, body){
  const h = { cookie: S.cookie };
  if (method !== 'GET') h['x-csrf-token'] = S.csrf;
  return app.call(method, path, { body, headers: h, ip: ip() });
}
let productId = null;
test.before(async () => {
  const res = await app.call('POST', '/api/admin/setup', { body: { ...OWNER, token: 'setup-code-xyz' }, ip: ip() });
  assert.equal(res.status, 201);
  S = { cookie: (res.headers.get('set-cookie') || '').split(';')[0], csrf: res.json.csrf };
  productId = (await app.pg.query(`insert into products (kind, slug, title, status, sellable, price_inr, price_usd) values ('artzz','poster-a','Poster A','published',true,149900,2900) returning id`)).rows[0].id;
});

test('closing the store: visitors see the closed board and cannot order; a device pass and an email pass still can', async () => {
  let cfg = (await app.call('GET', '/api/public-config')).json;
  assert.equal(cfg.store.enabled, true); assert.equal(cfg.store.closed, null);
  const closed = await admin('POST', '/api/admin/store/status', { open: false, closedTitle: 'Back soon', closedMessage: 'Resting.', closedScene: 'panda', reopensAt: '2026-12-01T10:00:00Z' });
  assert.equal(closed.status, 200); assert.equal(closed.json.status.open, false);
  cfg = (await app.call('GET', '/api/public-config')).json;
  assert.equal(cfg.store.enabled, false); assert.equal(cfg.store.access, false);
  assert.deepEqual({ t: cfg.store.closed.title, s: cfg.store.closed.scene, r: cfg.store.closed.reopensAt }, { t: 'Back soon', s: 'panda', r: '2026-12-01T10:00:00.000Z' });
  const order = (email, headers = {}) => app.call('POST', '/api/checkout/order', { body: { productId, currency: 'INR', email, licenseHolder: 'Pat Buyer' }, headers, ip: ip() });
  const refused = await order('someone@example.com');
  assert.equal(refused.status, 503); assert.equal(refused.json.code, 'store_closed');

  // a device pass: the link carries a signed token; a forged or removed one opens nothing
  const dev = await admin('POST', '/api/admin/store/access', { kind: 'device', label: 'Priya’s phone' });
  assert.equal(dev.status, 200);
  const pass = dev.json.passes[0], token = new URL(pass.link).searchParams.get('pass');
  assert.match(pass.link, /^http:\/\/shop\.test\/\?page=store&pass=/);
  assert.equal((await app.call('POST', '/api/store/pass', { body: { pass: token }, ip: ip() })).json.ok, true);
  assert.equal((await app.call('POST', '/api/store/pass', { body: { pass: token.slice(0, -2) + 'aa' }, ip: ip() })).json.ok, false, 'forged signature');
  assert.equal((await app.call('GET', '/api/public-config', { headers: { 'x-ka-pass': token } })).json.store.access, true);
  const viaPass = await order('friend@example.com', { 'x-ka-pass': token });
  assert.equal(viaPass.status, 201, 'a pass holder can buy while closed');

  // an email pass: the invite is emailed; ordering with that email works without a device pass
  const before = app.mail.sent.length;
  const em = await admin('POST', '/api/admin/store/access', { kind: 'email', email: 'Guest@Example.com', label: 'Guest', notify: true });
  assert.equal(em.status, 200);
  assert.equal(app.mail.sent.length, before + 1);
  assert.equal(app.mail.sent.at(-1).to, 'guest@example.com');
  assert.match(app.mail.sent.at(-1).text, /\?page=store&pass=/);
  assert.equal((await admin('POST', '/api/admin/store/access', { kind: 'email', email: 'guest@example.com' })).status, 409, 'no duplicate email passes');
  assert.equal((await order('guest@example.com')).status, 201);
  // asking for the link on the closed board never tells whether an address is on the list
  const ask = await app.call('POST', '/api/store/pass/email', { body: { email: 'nobody@example.com' }, ip: ip() });
  assert.deepEqual(ask.json, { ok: true });

  // removing the device pass locks that browser out again
  await admin('DELETE', `/api/admin/store/access/${pass.id}`);
  assert.equal((await app.call('GET', '/api/public-config', { headers: { 'x-ka-pass': token } })).json.store.access, false);
  assert.equal((await order('friend@example.com', { 'x-ka-pass': token })).status, 503);
  await admin('POST', '/api/admin/store/status', { open: true });
  assert.equal((await app.call('GET', '/api/public-config')).json.store.enabled, true);
});

test('coupons count how often a code is applied in the cart, refused, and paid with', async () => {
  const made = await admin('POST', '/api/admin/coupons', { code: 'APPLYME', description: '', kind: 'percent', percentBp: 1000, currencies: ['INR', 'USD'], appliesTo: 'all', productIds: [], minOrderInr: 0, minOrderUsd: 0 });
  assert.equal(made.status, 200);
  const quote = (codes) => app.call('POST', '/api/checkout/quote', { body: { productId, currency: 'INR', codes }, ip: ip() });
  for (let i = 0; i < 3; i++) assert.equal((await quote(['APPLYME'])).json.discount, 14990);
  await app.pg.query(`update coupons set paused = 1 where code = 'APPLYME'`);
  assert.equal((await quote(['APPLYME'])).json.ok, false);
  await app.pg.query(`update coupons set paused = 0 where code = 'APPLYME'`);
  const c = (await admin('GET', '/api/admin/coupons')).json.coupons.find(x => x.code === 'APPLYME');
  assert.equal(c.applied_count, 3); assert.equal(c.rejected_count, 1); assert.ok(c.last_applied_at);
  assert.equal(c.confirmed_uses, 0); assert.equal(c.pending_uses, 0);
  const ordered = await app.call('POST', '/api/checkout/order', { body: { productId, currency: 'INR', email: 'coupon@example.com', licenseHolder: 'Pat Buyer', codes: ['APPLYME'] }, ip: ip() });
  assert.equal(ordered.status, 201);
  const after = (await admin('GET', '/api/admin/coupons')).json.coupons.find(x => x.code === 'APPLYME');
  assert.equal(after.pending_uses, 1, 'an unpaid order holds a use');
});

test('saved visits survive the retention clean-up and bulk clears; un-saving lets them go', async () => {
  await app.pg.query(`insert into visits (visited_at, session_id, visitor_id, path) values
    ('2020-01-01T00:00:00.000Z','s1','visitor-old-1','/'), ('2020-01-02T00:00:00.000Z','s2','visitor-old-2','/'), (strftime('%Y-%m-%dT%H:%M:%fZ','now'),'s3','visitor-new-1','/')`);
  const rows = (await app.pg.query(`select id, visitor_id from visits order by id`)).rows;
  const keep = await admin('PUT', '/api/admin/visitors/keep', { ids: [rows[0].id], kept: true });
  assert.equal(keep.json.changed, 1); assert.equal(keep.json.saved, 1);
  assert.equal((await admin('GET', '/api/admin/visitors/log?bots=include&saved=1')).json.rows.length, 1);
  const cleared = await admin('POST', '/api/admin/visitors/clear', { scope: 'older', days: 30 });
  assert.equal(cleared.json.removed, 1, 'only the unsaved old visit');
  assert.equal((await app.pg.query(`select count(*) as n from visits where id = $1`, [rows[0].id])).rows[0].n, 1);
  await admin('PUT', '/api/admin/visitors/keep', { ids: [rows[0].id], kept: false });
  assert.equal((await admin('POST', '/api/admin/visitors/clear', { scope: 'older', days: 30 })).json.removed, 1);
  // "keep forever" is the retention setting 0
  const v = (await admin('GET', '/api/admin/settings/visitors')).json;
  assert.equal((await admin('PUT', '/api/admin/settings/visitors', { value: { ...v.value, retentionDays: 0 }, revision: v.revision })).json.value.retentionDays, 0);
});

test('contact: Regarding ticks are kept; the reply pops up on the sender’s device and is marked seen', async () => {
  const cfg = (await app.call('GET', '/api/public-config')).json;
  assert.ok(cfg.contact.topics.length >= 3); assert.equal(cfg.contact.replyOnSite, true);
  const sent = await app.call('POST', '/api/contact', { body: { name: 'Alex Rivera', email: 'alex@example.com', subject: 'License question, Poster for my band', topics: ['License question', 'Other'], message: 'Could you make a gig poster?' }, ip: ip() });
  assert.equal(sent.status, 201);
  const key = sent.json.thread;
  assert.match(key, /^[0-9a-f-]{36}\.[0-9a-f]{32}$/);
  const id = key.split('.')[0];
  const msg = (await admin('GET', `/api/admin/messages/${id}`)).json;
  assert.deepEqual(msg.message.meta.topics, ['License question', 'Other']);
  // nothing yet; forged keys see nothing
  let t = (await app.call('POST', '/api/messages/threads', { body: { keys: [key] }, ip: ip() })).json.threads;
  assert.equal(t.length, 1); assert.equal(t[0].replies.length, 0);
  assert.equal((await app.call('POST', '/api/messages/threads', { body: { keys: [id + '.' + '0'.repeat(32)] }, ip: ip() })).json.threads.length, 0);
  const before = app.mail.sent.length;
  assert.equal((await admin('POST', `/api/admin/messages/${id}/reply`, { body: 'Yes! Send me the details.' })).status, 200);
  const mail = app.mail.sent[before];
  assert.equal(mail.to, 'alex@example.com');
  assert.ok(mail.text.includes(`http://shop.test/?thread=${encodeURIComponent(key)}`), 'the email links the conversation on the site');
  t = (await app.call('POST', '/api/messages/threads', { body: { keys: [key] }, ip: ip() })).json.threads;
  assert.equal(t[0].replies[0].body, 'Yes! Send me the details.'); assert.equal(t[0].replies[0].seen, false);
  await app.call('POST', '/api/messages/threads/seen', { body: { keys: [key] }, ip: ip() });
  const replies = (await admin('GET', `/api/admin/messages/${id}`)).json.replies;
  assert.ok(replies[0].seen_at, 'the portal sees it was read');
});

test('the announcement tab and the Featured Work showcase are validated and saved', async () => {
  const doc = (await admin('GET', '/api/admin/site')).json;
  const folder = doc.folders[0], slugs = doc.images.filter(i => i.cat === folder).map(i => i.slug);
  const save = (patch) => admin('PUT', '/api/admin/site', { ...doc, ...patch });
  const bad = await save({ notice: { enabled: true, text: 'Hi', linkUrl: 'javascript:alert(1)', linkLabel: 'x' } });
  assert.equal(bad.status, 400);
  const ok = await save({ notice: { enabled: true, text: 'New drop', style: 'tab', side: 'left', autoClose: 99, tone: 'offer', title: 'News', linkUrl: '/?page=store', linkLabel: 'Shop' },
    featuredShow: { enabled: true, order: 'random', interval: 1, fade: 9, rows: [{ folder, slides: [...slugs.slice(0, 2), 'not-a-picture'], ratio: '16:9', size: 'l', side: 'right', description: 'Words' }] } });
  assert.equal(ok.status, 200, ok.text);
  assert.deepEqual({ ...ok.json.notice }, { enabled: true, text: 'New drop', tone: 'offer', style: 'tab', side: 'left', title: 'News', autoClose: 30, linkLabel: 'Shop', linkUrl: '/?page=store' });
  const fs = ok.json.featuredShow;
  assert.deepEqual([fs.order, fs.interval, fs.fade], ['random', 2, 4], 'pace is clamped');
  assert.deepEqual(fs.rows[0].slides, slugs.slice(0, 2), 'unknown pictures leave the row');
  assert.equal(fs.rows[0].ratio, '16:9');
  const pub = (await app.call('GET', '/api/portfolio')).json;
  assert.equal(pub.featuredShow.rows.length, 1);
  assert.throws(() => validateFeaturedShow({ rows: [{ folder: 'Missing' }] }, [folder], doc.images), /existing folder/);
});

test('emails: links become buttons, receipts become tables, and everything stays escaped', () => {
  const html = textToHtml('Hi <b>Alex</b>,\n\nDownload your files\nhttps://shop.test/d/abc?x=1&y=2\n\nSubtotal: ₹999\nTotal paid: ₹899');
  assert.ok(html.includes('&lt;b&gt;Alex&lt;/b&gt;'));
  assert.ok(html.includes('href="https://shop.test/d/abc?x=1&amp;y=2"'));
  assert.ok(html.includes('Download your files &rarr;'));
  assert.ok(/<table[^>]*>.*Total paid/s.test(html));
});
