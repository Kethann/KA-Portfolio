// Portal content, messages and system APIs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { coerce } from '../server/admin/content.js';
import { DEFAULTS } from '../server/core/settings.js';

const app = await createTestApp({ ADMIN_SETUP_TOKEN: 'setup-code-123', ADMIN_ENCRYPTION_KEY: 'k', PUBLIC_SITE_URL: 'http://shop.test', BREVO_API_KEY: '' });
test.after(() => app.close());
let n = 0;
const ip = () => `198.51.101.${++n % 250}`;
const setup = await app.call('POST', '/api/admin/setup', { body: { email: 'owner@example.com', password: 'a long owner passphrase', token: 'setup-code-123' }, ip: ip() });
const S = { cookie: setup.headers.get('set-cookie').split(';')[0], csrf: setup.json.csrf };
const admin = (method, path, body) => app.call(method, path, { body, headers: { cookie: S.cookie, ...(method !== 'GET' ? { 'x-csrf-token': S.csrf } : {}) }, ip: ip() });

test('site document: saves, bumps revision, refuses stale tabs and unsafe values, homepage sees it', async () => {
  const site = (await admin('GET', '/api/admin/site')).json;
  assert.ok(site.images.length > 0 && site.revision >= 1);
  const edited = { ...site, details: { ...site.details, tagline: 'New tagline' }, notice: { enabled: true, text: '<img src=x onerror=alert(1)>', tone: 'info' } };
  const saved = await admin('PUT', '/api/admin/site', edited);
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.equal(saved.json.revision, site.revision + 1);
  const pub = (await app.call('GET', '/api/portfolio')).json;
  assert.equal(pub.details.tagline, 'New tagline');
  assert.equal(pub.notice.text, '<img src=x onerror=alert(1)>', 'kept as plain text; the homepage renders it with textContent');
  assert.equal((await admin('PUT', '/api/admin/site', edited)).status, 409, 'stale revision');
  const cur = saved.json;
  const cases = [
    [{ socialLinks: [{ label: 'X', url: 'javascript:alert(1)', icon: 'x' }] }, /Social links/],
    [{ images: [{ ...cur.images[0], src: 'https://evil.example/a.png' }] }, /Upload this image/],
    [{ images: [{ ...cur.images[0], link: 'javascript:alert(1)' }] }, /https/],
    [{ details: { ...cur.details, customFonts: [{ family: 'Evil', url: 'https://evil.example/f.woff2' }] } }, /Upload this font/],
    [{ details: { ...cur.details, customFonts: [{ family: 'a;}body{', url: '' }] } }, /Font names/],
    [{ images: [{ ...cur.images[0], slug: 'not-a-real-original', src: undefined }] }, /Unknown original/],
    [{ elementStyles: { 'evil-id': { color: '#ffffff' } } }, /Unknown styled element/],
    [{ details: { ...cur.details, creatorName: '' } }, /every portfolio text field/]
  ];
  for (const [patch, msg] of cases){
    const r = await admin('PUT', '/api/admin/site', { ...cur, ...patch });
    assert.equal(r.status, 400, JSON.stringify(patch)); assert.match(r.json.error, msg);
  }
  const up = (await admin('POST', '/api/admin/uploads', { kind: 'image', contentType: 'image/webp', bytes: 10, filename: 'new.webp' })).json;
  const withUpload = { ...cur, images: [...cur.images, { slug: 'fresh-one', title: 'Fresh', cat: cur.folders[0], src: up.publicUrl, technologies: [], width: 1200, height: 1600 }] };
  const ok = await admin('PUT', '/api/admin/site', withUpload);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const fresh = ok.json.images.find(i => i.slug === 'fresh-one');
  assert.equal(fresh.src, up.publicUrl); assert.equal(fresh.width, 1200);
});

test('tips: draft → publish, slug conflicts, cover must be our upload, delete returns the row for undo', async () => {
  const t = await admin('POST', '/api/admin/tips', { title: 'Colour Grading Basics', body: '# Hi\n\nText', status: 'draft' });
  assert.equal(t.status, 200); assert.equal(t.json.tip.slug, 'colour-grading-basics');
  assert.equal((await app.call('GET', '/api/tips/colour-grading-basics')).status, 404);
  const p = await admin('PUT', `/api/admin/tips/${t.json.tip.id}`, { ...t.json.tip, status: 'published' });
  assert.ok(p.json.tip.publishedAt);
  assert.equal((await app.call('GET', '/api/tips/colour-grading-basics')).status, 200);
  assert.equal((await admin('POST', '/api/admin/tips', { title: 'Colour Grading Basics' })).status, 409);
  assert.equal((await admin('POST', '/api/admin/tips', { title: 'Other', coverUrl: 'https://evil.example/c.png' })).status, 400);
  const stale = await admin('PUT', `/api/admin/tips/${t.json.tip.id}`, { ...t.json.tip, updatedAt: '2020-01-01T00:00:00Z' });
  assert.equal(stale.status, 409);
  const del = await admin('DELETE', `/api/admin/tips/${t.json.tip.id}`);
  assert.equal(del.json.deleted.title, 'Colour Grading Basics');
  const md = await admin('POST', '/api/admin/markdown', { body: '[x](javascript:alert(1)) <script>bad()</script>' });
  assert.doesNotMatch(md.json.html, /javascript:|<script/);
});

test('legal pages, email templates (required placeholders), settings coercion', async () => {
  const legal = await admin('PUT', '/api/admin/legal/terms', { title: 'Terms', body: 'Draft terms', published: true });
  assert.equal(legal.json.pages.find(p => p.slug === 'terms').published, true);
  assert.equal((await admin('PUT', '/api/admin/legal/other', { body: 'x' })).status, 404);

  const list = (await admin('GET', '/api/admin/email-templates')).json.templates;
  assert.ok(list.find(t => t.key === 'order_delivery').placeholders.includes('download_url'));
  assert.equal((await admin('PUT', '/api/admin/email-templates/order_delivery', { subject: 'Hi', body: 'No link here' })).status, 400);
  const saved = await admin('PUT', '/api/admin/email-templates/order_delivery', { subject: 'Your file', body: 'Get it: {{download_url}}' });
  assert.equal(saved.json.templates.find(t => t.key === 'order_delivery').customised, true);
  const test1 = await admin('POST', '/api/admin/email-templates/order_delivery/test', {});
  assert.equal(test1.status, 200); assert.equal(app.mail.sent.at(-1).to, 'owner@example.com');
  const reset = await admin('DELETE', '/api/admin/email-templates/order_delivery');
  assert.equal(reset.json.templates.find(t => t.key === 'order_delivery').customised, false);

  const s = (await admin('GET', '/api/admin/settings/store')).json;
  const put = await admin('PUT', '/api/admin/settings/store', { revision: s.revision, value: { ...s.value, taxEnabled: true, taxRateBp: 1800, hacker: 'x', sellerName: 'Kethan' } });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  assert.equal(put.json.value.taxRateBp, 1800); assert.equal(put.json.value.hacker, undefined);
  assert.equal((await admin('PUT', '/api/admin/settings/store', { revision: s.revision, value: s.value })).status, 409, 'stale');
  assert.equal((await admin('PUT', '/api/admin/settings/store', { revision: put.json.revision, value: { ...s.value, taxRateBp: 99999 } })).status, 400);
  assert.equal((await admin('GET', '/api/admin/settings/system')).status, 404, 'internal settings are not editable');
  assert.deepEqual(coerce(DEFAULTS.reports, { daily: 'yes', weekly: true, email: 5 }), { daily: false, weekly: true, email: '' });
});

test('notify list: launch emails each person once, even if pressed twice', async () => {
  await app.pg.query(`insert into notify_signups (topic, email) values ('upscaler','a@example.com'),('upscaler','b@example.com')`);
  const before = app.mail.sent.length;
  const r = await admin('POST', '/api/admin/notify/upscaler/launch', { link: 'https://shop.test/upscaler', message: 'Enjoy!' });
  assert.equal(r.json.sent, 2); assert.equal(r.json.remaining, 0);
  const again = await admin('POST', '/api/admin/notify/upscaler/launch', { link: 'https://shop.test/upscaler' });
  assert.equal(again.json.sent, 0);
  assert.equal(app.mail.sent.length, before + 2);
  assert.equal((await admin('POST', '/api/admin/notify/upscaler/launch', { link: 'javascript:alert(1)' })).status, 400);
});

test('messages: inbox, search, read state, reply, labels, bulk, blocklist moves to spam', async () => {
  for (const [name, email, subject] of [['Ann', 'ann@example.com', 'Poster commission'], ['Bob', 'bob@spam.example', 'Cheap followers']]){
    await app.call('POST', '/api/contact', { body: { name, email, subject, message: `Hello from ${name}` }, ip: ip() });
  }
  const inbox = (await admin('GET', '/api/admin/messages?status=inbox')).json;
  assert.equal(inbox.counts.new, 2);
  const found = (await admin('GET', '/api/admin/messages?q=commission')).json.messages;
  assert.equal(found.length, 1);
  const ann = found[0];
  const open = await admin('GET', `/api/admin/messages/${ann.id}`);
  assert.equal(open.json.message.status, 'read');
  assert.equal((await admin('PATCH', `/api/admin/messages/${ann.id}`, { labels: ['client', 'poster'] })).status, 200);
  assert.deepEqual((await admin('GET', '/api/admin/messages?label=client')).json.messages.map(m => m.id), [ann.id]);
  const rep = await admin('POST', `/api/admin/messages/${ann.id}/reply`, { body: 'Thanks Ann!' });
  assert.equal(rep.status, 200);
  assert.equal(app.mail.sent.at(-1).to, 'ann@example.com');
  assert.equal((await admin('GET', `/api/admin/messages/${ann.id}`)).json.message.status, 'done');
  await admin('POST', '/api/admin/blocklist', { kind: 'domain', value: 'spam.example' });
  await admin('POST', '/api/admin/blocklist', { kind: 'email', value: 'bob@spam.example' });
  const bob = (await admin('GET', '/api/admin/messages?status=spam')).json.messages;
  assert.equal(bob.length, 1);
  await app.call('POST', '/api/contact', { body: { name: 'Bob', email: 'bob2@spam.example', subject: 'Again', message: 'x' }, ip: ip() });
  assert.equal((await admin('GET', '/api/admin/messages?status=spam')).json.messages.length, 2, 'blocked domain lands in spam');
  assert.equal((await admin('POST', '/api/admin/blocklist', { kind: 'domain', value: 'not a domain' })).status, 400);
  const bulk = await admin('POST', '/api/admin/messages/bulk', { ids: bob.map(m => m.id), action: 'delete' });
  assert.equal(bulk.status, 200);
  const c = await admin('POST', '/api/admin/canned', { title: 'Thanks', body: 'Thanks for writing!' });
  assert.equal(c.json.canned.length, 1);
});

test('system: service status shows names only, backups run and link privately, audit log, purge', async () => {
  const st = await admin('GET', '/api/admin/system');
  assert.equal(st.status, 200);
  const text = JSON.stringify(st.json);
  assert.ok(!text.includes('test-download-secret') && !text.includes('setup-code-123'), 'never returns secret values');
  assert.equal(st.json.services.find(s => s.key === 'downloads').ok, true);
  assert.equal(st.json.services.find(s => s.key === 'payments').ok, false);
  const b = await admin('POST', '/api/admin/backups', {});
  assert.equal(b.status, 200); assert.ok(b.json.bytes > 0);
  const list = (await admin('GET', '/api/admin/backups')).json.backups;
  const link = await admin('GET', `/api/admin/backups/${list[0].id}/link`);
  assert.match(link.json.url, /__storage/);
  assert.equal((await admin('GET', '/api/admin/system/storage')).status, 200);
  assert.equal((await admin('POST', '/api/admin/system/test-email', {})).status, 200);
  await app.pg.query(`insert into visits (session_id, visitor_id, path, visited_at) values ('s1','v1','/', strftime('%Y-%m-%dT%H:%M:%fZ','now','-100 days')), ('s2','v2','/', now())`);
  const purge = await admin('POST', '/api/admin/visits/purge', { olderThanDays: 90 });
  assert.equal(purge.json.deleted, 1);
  const audit = (await admin('GET', '/api/admin/audit')).json.entries.map(e => e.action);
  for (const a of ['site_saved', 'tip_saved', 'settings_saved', 'launch_email', 'message_replied', 'backup_started', 'visits_purged']) assert.ok(audit.includes(a), a);
});
