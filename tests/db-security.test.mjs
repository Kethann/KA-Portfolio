// Money and state rules enforced by the database itself (the same SQLite engine D1 runs).
// On Cloudflare only the Worker can reach D1 (no public keys, no client access), so there are no
// row-level policies to test: what matters is that bad data can't be written even by a bug in the code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqlite } from '../server/dev/sqlite.js';
import { rateLimitHit, nextInvoiceNumber } from '../server/core/atomic.js';
import { setDatabase } from '../server/core/db.js';

const db = openSqlite();
setDatabase(db);
const q = (sql, params) => db.query(sql, params);

test('every table is STRICT and foreign keys are enforced', async () => {
  const tables = await q(`select name, sql from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '%_fts%' and name <> 'd1_migrations'`);
  assert.ok(tables.length > 30);
  for (const t of tables) assert.match(t.sql, /\)\s*strict$/i, t.name + ' must be STRICT (no silent type changes)');
  await assert.rejects(q(`insert into product_media (product_id, url) values ('no-such-product', '/x.webp')`), /FOREIGN KEY/);
});

test('money and state constraints hold at the database level', async () => {
  // a published, sellable, paid product needs both prices
  await assert.rejects(q(`insert into products (kind, slug, title, status, sellable, price_inr) values ('artifacts','p1','P','published',1,50000)`), /priced_when_selling|CHECK/);
  // order totals must add up exactly and money is integer
  await assert.rejects(q(`insert into orders (public_id,email,currency,subtotal,discount,total) values ('KA-1','a@b.co','INR',1000,100,950)`), /CHECK/);
  // the app always sends values as parameters: a fractional amount is refused, never rounded
  await assert.rejects(q(`insert into orders (public_id,email,currency,subtotal,total) values ('KA-2','a@b.co','INR',$1,$1)`, ['10.5']), /INTEGER/);
  await assert.rejects(q(`insert into orders (public_id,email,currency,subtotal,total) values ('KA-3','a@b.co','EUR',100,100)`), /CHECK/);
  // paid needs two proofs: the verified webhook AND (checkout signature OR server-side API check)
  await q(`insert into orders (public_id,email,currency,subtotal,total) values ('KA-4','a@b.co','INR',100,100),('KA-5','a@b.co','INR',100,100)`);
  await assert.rejects(q(`update orders set status='paid', paid_at=now(), signature_verified_at=now() where public_id='KA-4'`), /CHECK/, 'signature alone');
  await assert.rejects(q(`update orders set status='paid', paid_at=now(), captured_at=now() where public_id='KA-4'`), /CHECK/, 'webhook alone');
  await q(`update orders set status='paid', paid_at=now(), signature_verified_at=now(), captured_at=now() where public_id='KA-4'`);
  await q(`update orders set status='paid', paid_at=now(), api_verified_at=now(), captured_at=now() where public_id='KA-5'`);
});

test('rate limits and invoice numbers are atomic', async () => {
  const hits = [];
  for (let i = 0; i < 5; i++) hits.push(await rateLimitHit('k', 60, 3));
  assert.deepEqual(hits, [true, true, true, false, false]);
  const a = await nextInvoiceNumber(), b = await nextInvoiceNumber();
  assert.equal(b, a + 1);
});

test('values come back as plain JavaScript: booleans, JSON and ISO times', async () => {
  const [p] = await q(`insert into products (kind, slug, title, tags, sellable) values ('artzz','t1','T',$1,$2) returning *`, [['a', 'b'], true]);
  assert.deepEqual(p.tags, ['a', 'b']); assert.equal(p.sellable, true); assert.equal(p.is_free, false);
  assert.match(p.created_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.match(p.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  // a batch is all-or-nothing
  await assert.rejects(db.batch([[`update products set title = 'changed' where slug = 't1'`], [`insert into orders (public_id,email,currency,subtotal,total) values ('X','bad','INR',1,1)`]]));
  assert.equal((await q(`select title from products where slug = 't1'`))[0].title, 'T', 'the first statement was rolled back');
});
