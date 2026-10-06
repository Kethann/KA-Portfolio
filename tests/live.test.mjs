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

test('delete and archive from the portal show on the public store at once, and archived items can be listed and restored', async () => {
  const cat = (await app.pg.query(`insert into categories (kind, name, slug) values ('artifacts', 'Kits', 'kits') returning id`)).rows[0];
  const add = async (slug) => (await app.pg.query(`insert into products (kind, slug, title, status, category_id) values ('artifacts', $1, $1, 'published', $2) returning id`, [slug, cat.id])).rows[0].id;
  const gone = await add('unsold-kit'), sold = await add('sold-kit');
  await app.pg.query(`insert into orders (id, public_id, email, currency, subtotal, total, status) values ('o-live-1', 'KA-LIVE0001', 'b@example.com', 'INR', 100, 100, 'paid')`);
  await app.pg.query(`insert into order_items (order_id, product_id, title, unit_price, total) values ('o-live-1', $1, 'sold-kit', 100, 100)`, [sold]);
  const slugs = async () => (await app.call('GET', '/api/store/catalog')).json.products.map(p => p.slug);
  assert.ok((await slugs()).includes('unsold-kit') && (await slugs()).includes('sold-kit'));
  const v0 = (await app.call('GET', '/api/live')).json.v;
  assert.equal((await admin('DELETE', `/api/admin/products/${gone}`)).status, 200);
  assert.equal((await admin('DELETE', `/api/admin/products/${sold}`)).json.archived, true);
  const after = await slugs();
  assert.ok(!after.includes('unsold-kit') && !after.includes('sold-kit'), 'neither is on the store any more');
  assert.ok((await app.call('GET', '/api/live')).json.v > v0, 'open pages are told');
  assert.equal((await app.call('GET', '/api/store/product/sold-kit')).status, 404);
  const normal = (await admin('GET', '/api/admin/products')).json.products.map(p => p.slug);
  const archived = (await admin('GET', '/api/admin/products?status=archived')).json.products.map(p => p.slug);
  assert.ok(!normal.includes('sold-kit') && archived.includes('sold-kit') && !archived.includes('unsold-kit'));
  assert.equal((await admin('POST', `/api/admin/products/${sold}/restore`)).status, 200);
  assert.ok((await admin('GET', '/api/admin/products')).json.products.some(p => p.slug === 'sold-kit'), 'restored as a draft');
});
