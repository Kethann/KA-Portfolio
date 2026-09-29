import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { priceFor, percentOff, formatMoney } from '../server/store/pricing.js';
import { renderMarkdown } from '../server/core/markdown.js';
import { toPrefixQuery } from '../server/handlers/store-public.js';

const app = await createTestApp();
test.after(() => app.close());

const base = { status: 'published', sellable: true, is_free: false, price_inr: 49900, price_usd: 999 };

test('prices: manual per currency, integers only, sales only inside their window', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  assert.deepEqual(priceFor(base, 'INR', now), { currency: 'INR', amount: 49900, compareAt: null, onSale: false, saleEndsAt: null, free: false, available: true });
  assert.equal(priceFor(base, 'USD', now).amount, 999);
  const sale = { ...base, sale_price_inr: 29900, sale_price_usd: 599, sale_starts_at: '2026-09-30T00:00:00Z', sale_ends_at: '2026-10-02T00:00:00Z' };
  const s = priceFor(sale, 'INR', now);
  assert.equal(s.amount, 29900); assert.equal(s.compareAt, 49900); assert.equal(s.onSale, true);
  assert.equal(percentOff(s), 40);
  assert.equal(priceFor(sale, 'INR', new Date('2026-10-03T00:00:00Z')).amount, 49900, 'ended sale');
  assert.equal(priceFor(sale, 'INR', new Date('2026-09-29T00:00:00Z')).amount, 49900, 'not started');
  assert.equal(priceFor({ ...base, sale_price_inr: 60000 }, 'INR', now).amount, 49900, 'a "sale" above the price is ignored');
  assert.equal(priceFor({ ...base, sellable: false }, 'INR', now).available, false, 'view-only');
  assert.equal(priceFor({ ...base, status: 'draft' }, 'INR', now).available, false, 'draft');
  assert.equal(priceFor({ ...base, price_usd: null }, 'USD', now).available, false, 'no USD price, no USD sale');
  assert.equal(priceFor({ ...base, price_inr: 499.5 }, 'INR', now).available, false, 'non-integer money is never used');
  const free = priceFor({ ...base, is_free: true }, 'USD', now);
  assert.equal(free.free, true); assert.equal(free.amount, 0);
  assert.equal(percentOff({ onSale: true, compareAt: 999, amount: 666 }), 33, 'rounds down, never overstates');
  assert.equal(formatMoney(49900, 'INR'), '₹499'); assert.equal(formatMoney(999, 'USD'), '$9.99');
});

test('catalog lists published products only, with both currencies and category', async () => {
  const [cat] = (await app.pg.query(`insert into categories (kind, name, slug) values ('artifacts','Templates','templates') returning id`)).rows;
  await app.pg.query(`insert into products (kind, slug, title, status, sellable, price_inr, price_usd, category_id, tech_tags) values
    ('artifacts','ui-kit','UI Kit','published',true,149900,2900,$1,'{React,Figma}'),
    ('artifacts','secret-draft','Draft','draft',true,100,100,null,'{}'),
    ('artzz','poster-1','Poster','published',false,null,null,null,'{}')`, [cat.id]);
  const res = await app.call('GET', '/api/store/catalog');
  assert.equal(res.status, 200);
  const slugs = res.json.products.map(p => p.slug).sort();
  assert.deepEqual(slugs, ['poster-1', 'ui-kit']);
  const kit = res.json.products.find(p => p.slug === 'ui-kit');
  assert.equal(kit.prices.INR.amount, 149900); assert.equal(kit.prices.USD.amount, 2900);
  assert.equal(kit.category.slug, 'templates'); assert.deepEqual(kit.techTags, ['React', 'Figma']);
  assert.equal(res.json.products.find(p => p.slug === 'poster-1').prices.INR.available, false);
  const only = await app.call('GET', '/api/store/catalog?kind=artzz');
  assert.deepEqual(only.json.products.map(p => p.slug), ['poster-1']);
  assert.equal((await app.call('GET', '/api/store/catalog?kind=hack')).status, 400);
  assert.equal((await app.call('GET', '/api/store/products/secret-draft')).status, 404, 'drafts are not reachable by slug');
  assert.equal((await app.call('GET', '/api/store/products/ui-kit')).json.product.title, 'UI Kit');
  assert.ok(!JSON.stringify(res.json).includes('max_downloads'), 'internal fields stay internal');
});

test('tips: search, categories, paging, and published only', async () => {
  const [cat] = (await app.pg.query(`insert into categories (kind, name, slug) values ('tips','Color','color') returning id`)).rows;
  await app.pg.query(`insert into tips (slug, title, excerpt, body_md, status, published_at, category_id) values
    ('warm-palettes','Warm palettes for posters','Use bronze', '## Why\nWarm **bronze** tones.', 'published', now(), $1),
    ('typography-scale','A type scale that works','Scale', 'Body', 'published', now() - interval '1 day', null),
    ('hidden','Hidden draft','x','x','draft', null, null)`, [cat.id]);
  const all = await app.call('GET', '/api/tips');
  assert.deepEqual(all.json.tips.map(t => t.slug), ['warm-palettes', 'typography-scale']);
  const search = await app.call('GET', '/api/tips?q=' + encodeURIComponent('pal'));
  assert.deepEqual(search.json.tips.map(t => t.slug), ['warm-palettes'], 'prefix search');
  const hostile = await app.call('GET', '/api/tips?q=' + encodeURIComponent("') | !(:* & <-> '"));
  assert.equal(hostile.status, 200, 'query syntax is neutralised');
  const byCat = await app.call('GET', '/api/tips?category=color');
  assert.deepEqual(byCat.json.tips.map(t => t.slug), ['warm-palettes']);
  const one = await app.call('GET', '/api/tips/warm-palettes');
  assert.match(one.json.tip.html, /<h3>Why<\/h3>/); assert.match(one.json.tip.html, /<strong>bronze<\/strong>/);
  assert.equal((await app.call('GET', '/api/tips/hidden')).status, 404);
});

test('markdown renders a safe subset and never lets HTML or scripts through', () => {
  const html = renderMarkdown([
    '<script>alert(1)</script>',
    '[click](javascript:alert(1)) [ok](https://example.com) [site](/store) [trick](/\\evil.com) [pr](//evil.com)',
    '![x](data:image/svg+xml,<svg onload=alert(1)>) ![y](https://cdn.example.com/a.png)',
    '<img src=x onerror=alert(1)>',
    '"><a href="x">'
  ].join('\n\n'));
  assert(!/<script/i.test(html)); assert(!/<img src=x/i.test(html)); assert(!/onerror=alert/.test(html.replace(/&[a-z]+;/g, '')) || !/<[^>]*onerror/i.test(html));
  assert(!/href="javascript:/i.test(html)); assert(!/src="data:/i.test(html));
  assert(!/href="\/\\evil/.test(html) && !/href="\/\/evil/.test(html), 'protocol-relative tricks are refused');
  assert.match(html, /<a href="https:\/\/example.com" target="_blank" rel="noopener noreferrer nofollow">ok<\/a>/);
  assert.match(html, /<a href="\/store">site<\/a>/);
  assert.match(html, /<img src="https:\/\/cdn.example.com\/a.png" alt="y"/);
  assert.equal(toPrefixQuery("a' | b:* & (c)"), 'a:* & b:* & c:*');
});
