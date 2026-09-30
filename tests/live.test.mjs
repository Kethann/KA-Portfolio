// Publishing shows up at once: public reads are never held by a CDN (ETag + 304 instead), and every
// successful portal change moves /api/live so open pages know to refresh.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';

const app = await createTestApp({ ADMIN_SETUP_TOKEN: 'setup-code-123', PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
const setup = await app.call('POST', '/api/admin/setup', { body: { email: 'owner@example.com', password: 'the owner passphrase here', token: 'setup-code-123' }, ip: '198.51.105.1' });
const s = { cookie: cookieOf(setup), csrf: setup.json.csrf };
const admin = (method, path, body) => app.call(method, path, { body, headers: { cookie: s.cookie, ...(method !== 'GET' ? { 'x-csrf-token': s.csrf, origin: 'http://shop.test' } : {}) }, ip: '198.51.105.1' });

test('public site data is revalidated every time and answers 304 when unchanged', async () => {
  await app.call('GET', '/api/portfolio');   // the very first read stores the seed document
  const first = await app.call('GET', '/api/portfolio');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-cache', 'no CDN copy that could go stale after a publish');
  const etag = first.headers.get('etag');
  assert.match(etag, /^W\/"[0-9a-f]{32}"$/);
  const again = await app.call('GET', '/api/portfolio', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
  const catalog = await app.call('GET', '/api/store/catalog');
  assert.equal(catalog.headers.get('cache-control'), 'no-cache');
  assert.ok(catalog.headers.get('etag'));
});

test('a publish moves the live version and the next read has the new content', async () => {
  const v0 = (await app.call('GET', '/api/live')).json.v;
  const before = await app.call('GET', '/api/portfolio');
  const site = (await admin('GET', '/api/admin/site')).json;
  const saved = await admin('PUT', '/api/admin/site', { ...site, passCard: { ...(site.passCard || {}), label: 'LIVE PASS', logoSize: 30 } });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  const v1 = (await app.call('GET', '/api/live')).json.v;
  assert.ok(v1 > v0, `live version moved (${v0} -> ${v1})`);
  const after = await app.call('GET', '/api/portfolio', { headers: { 'if-none-match': before.headers.get('etag') } });
  assert.equal(after.status, 200, 'the old ETag no longer matches');
  assert.equal(after.json.passCard.label, 'LIVE PASS'); assert.equal(after.json.passCard.logoSize, 30);
  // reads don't move it; a refused write doesn't either
  await admin('GET', '/api/admin/site');
  assert.equal((await app.call('GET', '/api/live')).json.v, v1);
  const stale = await admin('PUT', '/api/admin/site', { ...site, passCard: { label: 'X' } });
  assert.equal(stale.status, 409);
  assert.equal((await app.call('GET', '/api/live')).json.v, v1);
});
