// Row-level security, privileges and money constraints, checked against real Postgres.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createTestDatabase} from './helpers/pglite.mjs';

const pg = await createTestDatabase();
const PUBLIC_TABLES = new Set(['products','product_media','categories','tips','licenses','legal_pages']);

async function asRole(role, fn){
  await pg.exec(`set role ${role}`);
  try{ return await fn(); } finally { await pg.exec('reset role'); }
}

test('every table has row-level security enabled', async()=>{
  const {rows} = await pg.query(`select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname <> '_migrations'`);
  assert.ok(rows.length > 30);
  for (const r of rows) assert.equal(r.relrowsecurity, true, r.relname + ' must have RLS on');
});

test('the public cannot read or write any private table', async()=>{
  const {rows} = await pg.query(`select tablename from pg_tables where schemaname='public' and tablename <> '_migrations'`);
  for (const {tablename} of rows){
    if (PUBLIC_TABLES.has(tablename)) continue;
    for (const role of ['anon','authenticated']){
      await assert.rejects(asRole(role, ()=>pg.query(`select * from ${tablename} limit 1`)), /permission denied/, `${role} read ${tablename}`);
      await assert.rejects(asRole(role, ()=>pg.query(`delete from ${tablename}`)), /permission denied/, `${role} delete ${tablename}`);
    }
  }
});

test('the public sees published products only and can never write them', async()=>{
  await pg.query(`insert into products (kind, slug, title, status) values ('artzz','draft-one','Draft','draft'),('artzz','live-one','Live','published')`);
  const seen = await asRole('anon', ()=>pg.query('select slug from products order by slug'));
  assert.deepEqual(seen.rows.map(r=>r.slug), ['live-one']);
  await assert.rejects(asRole('anon', ()=>pg.query(`update products set title='x'`)), /permission denied/);
  await assert.rejects(asRole('anon', ()=>pg.query(`insert into products (kind, slug, title) values ('artzz','hack','Hack')`)), /permission denied/);
  await assert.rejects(asRole('anon', ()=>pg.query(`select rate_limit_hit('x', 60, 5)`)), /permission denied/);
});

test('money and state constraints hold at the database level', async()=>{
  // a published, sellable, paid product needs both prices
  await assert.rejects(pg.query(`insert into products (kind, slug, title, status, sellable, price_inr) values ('artifacts','p1','P','published',true,50000)`), /priced_when_selling/);
  // order totals must add up exactly and money is integer
  await assert.rejects(pg.query(`insert into orders (public_id,email,currency,subtotal,discount,total) values ('KA-1','a@b.co','INR',1000,100,950)`), /total_math/);
  // the app always sends values as parameters: a fractional amount is refused, never rounded
  await assert.rejects(pg.query(`insert into orders (public_id,email,currency,subtotal,total) values ('KA-2','a@b.co','INR',$1,$1)`, ['10.5']), /integer/);
  await assert.rejects(pg.query(`insert into orders (public_id,email,currency,subtotal,total) values ('KA-3','a@b.co','EUR',100,100)`), /currency/);
  // paid needs both the verified signature and the verified webhook
  await pg.query(`insert into orders (public_id,email,currency,subtotal,total) values ('KA-4','a@b.co','INR',100,100)`);
  await assert.rejects(pg.query(`update orders set status='paid', paid_at=now(), signature_verified_at=now() where public_id='KA-4'`), /paid_needs_both/);
  await pg.query(`update orders set status='paid', paid_at=now(), signature_verified_at=now(), captured_at=now() where public_id='KA-4'`);
});

test('rate limits and invoice numbers are atomic', async()=>{
  const hits = [];
  for (let i = 0; i < 5; i++) hits.push((await pg.query(`select rate_limit_hit('k', 60, 3) as ok`)).rows[0].ok);
  assert.deepEqual(hits, [true,true,true,false,false]);
  const a = (await pg.query('select next_invoice_number() as n')).rows[0].n;
  const b = (await pg.query('select next_invoice_number() as n')).rows[0].n;
  assert.equal(b, a + 1);
});
