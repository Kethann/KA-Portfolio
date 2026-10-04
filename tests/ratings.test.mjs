// Ratings and download counts: only someone holding an order's download link can rate; one rating per order
// and item (rating again updates it); hidden ratings don't count; the owner can switch the store display off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { setSetting, getSetting } from '../server/core/settings.js';

const app = await createTestApp({ PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());
const q = async (sql, p) => (await app.pg.query(sql, p)).rows;

const [prod] = await q(`insert into products (kind, slug, title, status, sellable, is_free) values ('artifacts','free-brushes','Free Brushes','published',1,1) returning id`);
await q(`insert into product_files (product_id, storage_path, filename, bytes) values ($1,'files/aaaaaaaaaaaaaaaa/b.zip','b.zip',5)`, [prod.id]);
async function freeOrder(email){
  const r = await app.call('POST', '/api/checkout/order', { body: { productId: prod.id, currency: 'INR', email }, headers: { origin: 'http://shop.test' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return new URL(r.json.downloadUrl).pathname.split('/').pop();
}
const rate = (token, fields) => app.call('POST', `/api/download/${token}/rate`, { raw: true, body: new URLSearchParams(fields).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'http://shop.test' } });
const catalog = async () => (await app.call('GET', '/api/store/catalog')).json.products.find(p => p.slug === 'free-brushes');

test('a buyer rates from the download page; the store shows the average, count and downloads', async () => {
  const t1 = await freeOrder('a@example.com'), t2 = await freeOrder('b@example.com');
  const page = await app.call('GET', `/api/download/${t1}`);
  assert.match(page.text, /Rate it/); assert.match(page.text, /name="rating"/);
  assert.equal((await rate(t1, { rating: '5', review: 'Lovely brushes', name: 'Asha' })).status, 303);
  assert.equal((await rate(t2, { rating: '3' })).status, 303);
  const p = await catalog();
  assert.deepEqual(p.rating, { avg: 4, count: 2 });
  assert.equal(p.downloads, 2);
  const reviews = (await app.call('GET', '/api/store/products/free-brushes/reviews')).json.reviews;
  assert.equal(reviews[0].review, 'Lovely brushes'); assert.equal(reviews[0].name, 'Asha');
  assert.ok(!JSON.stringify(reviews).includes('@'), 'emails are never shown');
  // rating again updates, never duplicates
  await rate(t1, { rating: '4', review: 'Updated' });
  assert.deepEqual((await catalog()).rating, { avg: 3.5, count: 2 });
  assert.match((await app.call('GET', `/api/download/${t1}?rated=1`)).text, /Thanks for rating/);
});

test('bad input and strangers are refused; hidden ratings stop counting; the owner can hide the display', async () => {
  assert.equal((await rate('x'.repeat(43), { rating: '5' })).status, 404, 'a made-up link cannot rate');
  const t = await freeOrder('c@example.com');
  assert.equal((await rate(t, { rating: '9' })).status, 303);   // ignored, back to the page
  assert.equal((await catalog()).rating.count, 2);
  await q(`update product_ratings set status = 'hidden' where rating = 3`);
  assert.deepEqual((await catalog()).rating, { avg: 4, count: 1 });
  const store = await getSetting('store');
  await setSetting('store', { ...store, showRatings: false, showDownloads: false });
  const p = await catalog();
  assert.equal(p.rating, null); assert.equal(p.downloads, null);
  assert.deepEqual((await app.call('GET', '/api/store/products/free-brushes/reviews')).json.reviews, []);
  await setSetting('store', store);
});
