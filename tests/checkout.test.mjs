// Phase 3 scenarios against a simulated Razorpay (real HMAC signatures with test secrets).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createTestApp } from './helpers/app.mjs';
import { setRazorpayFetch } from '../server/store/razorpay.js';
import { evaluateCoupons } from '../server/store/coupons.js';
import { computeTax } from '../server/store/orders.js';

const KEY_SECRET = 'test_key_secret', HOOK_SECRET = 'test_webhook_secret';
const app = await createTestApp({ RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: HOOK_SECRET, PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());

// ---- simulated Razorpay
const rz = { orders: new Map(), payments: new Map(), calls: [], refunds: [], failCreate: false };
let seq = 0;
setRazorpayFetch(async (url, init) => {
  const path = new URL(url).pathname; rz.calls.push(`${init.method} ${path}`);
  const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  if (init.method === 'POST' && path === '/v1/orders'){
    if (rz.failCreate) return new Response('{"error":{"code":"SERVER_ERROR"}}', { status: 500 });
    const b = JSON.parse(init.body); const id = `order_T${++seq}xyz`;
    rz.orders.set(id, b); return ok({ id, amount: b.amount, currency: b.currency, status: 'created' });
  }
  let m;
  if (init.method === 'GET' && (m = /^\/v1\/payments\/(.+)$/.exec(path))) return ok(rz.payments.get(m[1]) || { id: m[1], status: 'failed' });
  if (init.method === 'POST' && (m = /^\/v1\/payments\/(.+)\/refund$/.exec(path))){ const b = JSON.parse(init.body); rz.refunds.push({ payment: m[1], ...b }); return ok({ id: `rfnd_T${++seq}`, amount: b.amount }); }
  return new Response('{}', { status: 404 });
});

const sign = (orderId, paymentId) => createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
let evSeq = 0;
function webhook(event, entity, { eventId = `evt_${++evSeq}`, secret = HOOK_SECRET, key = 'payment' } = {}){
  const raw = JSON.stringify({ event, payload: { [key]: { entity } } });
  const signature = createHmac('sha256', secret).update(raw).digest('hex');
  return app.call('POST', '/api/webhooks/razorpay', { body: raw, raw: true, headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature, 'x-razorpay-event-id': eventId } });
}
let ipSeq = 10;
const ip = () => `198.18.0.${++ipSeq % 250}`;
async function order(productId, { currency = 'INR', email = 'buyer@example.com', codes, extra = {} } = {}){
  return app.call('POST', '/api/checkout/order', { body: { productId, currency, email, codes, ...extra }, ip: ip() });
}
async function pay(o, { signatureOk = true, via = 'both', paymentId = `pay_T${++seq}abcdef` } = {}){
  const rzOrder = o.razorpay.orderId;
  rz.payments.set(paymentId, { id: paymentId, order_id: rzOrder, amount: o.razorpay.amount, currency: o.razorpay.currency, status: 'captured' });
  const entity = { id: paymentId, order_id: rzOrder, amount: o.razorpay.amount, currency: o.razorpay.currency, status: 'captured' };
  const results = {};
  if (via === 'both' || via === 'verify-first'){
    results.verify = await app.call('POST', '/api/checkout/verify', { body: { orderId: o.orderId, clientSecret: o.clientSecret, razorpay_order_id: rzOrder, razorpay_payment_id: paymentId, razorpay_signature: signatureOk ? sign(rzOrder, paymentId) : 'deadbeef' }, ip: ip() });
    results.hook = await webhook('payment.captured', entity);
  } else if (via === 'webhook-first'){
    results.hook = await webhook('payment.captured', entity);
    results.verify = await app.call('POST', '/api/checkout/verify', { body: { orderId: o.orderId, clientSecret: o.clientSecret, razorpay_order_id: rzOrder, razorpay_payment_id: paymentId, razorpay_signature: sign(rzOrder, paymentId) }, ip: ip() });
  } else if (via === 'webhook-only'){
    results.hook = await webhook('payment.captured', entity);
  }
  return { paymentId, entity, ...results };
}
const row = async (publicId) => (await app.pg.query('select * from orders where public_id = $1', [publicId])).rows[0];
const eventsOf = async (publicId) => (await app.pg.query('select e.type from order_events e join orders o on o.id = e.order_id where o.public_id = $1 order by e.id', [publicId])).rows.map(r => r.type);
const mailsTo = (to) => app.mail.sent.filter(m => m.to === to);
const linkIn = (mail) => /http:\/\/shop\.test\/api\/download\/[A-Za-z0-9_-]{43}/.exec(mail.text)[0];

// ---- catalog fixtures
const [lic] = (await app.pg.query(`insert into licenses (key, name, summary, body_md) values ('personal','Personal','Own use','**No resale.** Use in your own projects.') returning id`)).rows;
const [cat] = (await app.pg.query(`insert into categories (kind, name, slug) values ('artifacts','Kits','kits') returning id`)).rows;
async function product(slug, over = {}){
  const p = { kind: 'artifacts', slug, title: slug.replace(/-/g, ' '), status: 'published', sellable: true, price_inr: 49900, price_usd: 999, license_id: lic.id, category_id: cat.id, max_downloads: 3, link_ttl_hours: 48, ...over };
  const cols = Object.keys(p);
  const [r] = (await app.pg.query(`insert into products (${cols}) values (${cols.map((_, i) => '$' + (i + 1))}) returning id`, Object.values(p))).rows;
  await app.storage.put('deliverables', `products/${r.id}/file.zip`, Buffer.from('ZIPDATA'));
  await app.pg.query(`insert into product_files (product_id, storage_path, filename, bytes) values ($1, $2, 'file.zip', 7)`, [r.id, `products/${r.id}/file.zip`]);
  return r.id;
}
const kit = await product('poster-kit');
const kitUsd = await product('usd-kit', { price_inr: 99900, price_usd: 1999 });
const freebie = await product('free-brushes', { is_free: true, price_inr: null, price_usd: null });
const strict = await product('no-refund-kit', { refund_after_download: false });
async function coupon(code, over = {}){
  const c = { code, kind: 'percent', percent_bp: 1000, ...over };
  const cols = Object.keys(c);
  await app.pg.query(`insert into coupons (${cols}) values (${cols.map((_, i) => '$' + (i + 1))})`, Object.values(c));
}

test('success: signature + webhook -> paid -> delivered, receipt numbered, one-time on-screen link', async () => {
  const res = await order(kit, { email: 'Asha@Example.com' });
  assert.equal(res.status, 201); const o = res.json;
  assert.equal(o.razorpay.amount, 49900); assert.equal(o.razorpay.currency, 'INR'); assert.equal(o.razorpay.keyId, 'rzp_test_abc');
  assert.equal(rz.orders.get(o.razorpay.orderId).amount, 49900);
  const r = await pay(o);
  assert.equal(r.verify.status, 200);
  const db = await row(o.orderId);
  assert.equal(db.status, 'delivered'); assert.ok(db.signature_verified_at && db.captured_at && db.paid_at); assert.equal(db.invoice_number, 1);
  const mails = mailsTo('asha@example.com');
  assert.equal(mails.length, 2, 'delivery + receipt');
  assert.match(mails[0].subject, /Your download/); assert.match(mails[0].text, /No resale/); assert.equal(mails[0].attachments[0].name, 'LICENSE.txt');
  assert.match(mails[1].subject, /Receipt INV-000001/); assert.match(mails[1].text, /₹499/);
  const st = await app.call('POST', '/api/checkout/status', { body: { orderId: o.orderId, clientSecret: o.clientSecret }, ip: ip() });
  assert.equal(st.json.status, 'delivered'); assert.match(st.json.downloadUrl || r.verify.json.downloadUrl, /\/api\/download\//);
  const again = await app.call('POST', '/api/checkout/status', { body: { orderId: o.orderId, clientSecret: o.clientSecret }, ip: ip() });
  assert.equal(again.json.downloadUrl, null, 'the on-screen link is issued once');
  // the download itself
  const link = linkIn(mails[0]), token = link.split('/').pop();
  const page = await app.call('GET', `/api/download/${token}`, { ip: ip() });
  assert.equal(page.status, 200); assert.match(page.text, /3 downloads left/); assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  const dl = await app.call('POST', `/api/download/${token}`, { body: '', raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' }, ip: '203.0.113.50' });
  assert.equal(dl.status, 303); assert.match(dl.headers.get('location'), /^\/__storage\/deliverables\/.+\?exp=\d+&sig=[0-9a-f]+&download=file.zip$/);
  const ev = (await app.pg.query(`select e.ip from download_events e join orders o on o.id = e.order_id where o.public_id = $1`, [o.orderId])).rows;
  assert.deepEqual(ev.map(e => e.ip), ['203.0.113.50']);
});

test('the browser redirect alone never grants access; webhook-first also works', async () => {
  const o = (await order(kit, { email: 'redirect@example.com' })).json;
  const paymentId = `pay_T${++seq}redirect`;
  rz.payments.set(paymentId, { id: paymentId, order_id: o.razorpay.orderId, amount: 49900, currency: 'INR', status: 'captured' });
  const v = await app.call('POST', '/api/checkout/verify', { body: { orderId: o.orderId, clientSecret: o.clientSecret, razorpay_order_id: o.razorpay.orderId, razorpay_payment_id: paymentId, razorpay_signature: sign(o.razorpay.orderId, paymentId) }, ip: ip() });
  assert.equal(v.status, 200); assert.equal(v.json.status, 'created', 'signature alone: not paid'); assert.equal(v.json.downloadUrl, null);
  assert.equal(mailsTo('redirect@example.com').length, 0);
  const o2 = (await order(kit, { email: 'hookfirst@example.com' })).json;
  await pay(o2, { via: 'webhook-first' });
  assert.equal((await row(o2.orderId)).status, 'delivered');
});

test('tab closed after paying: webhook + server-side Razorpay check deliver', async () => {
  const o = (await order(kit, { email: 'closedtab@example.com' })).json;
  await pay(o, { via: 'webhook-only' });
  const db = await row(o.orderId);
  assert.equal(db.status, 'delivered'); assert.ok(db.api_verified_at); assert.equal(db.signature_verified_at, null);
  assert.ok(rz.calls.some(c => c.startsWith('GET /v1/payments/')));
});

test('duplicate and out-of-order webhooks deliver exactly once', async () => {
  const o = (await order(kit, { email: 'dupe@example.com' })).json;
  const r = await pay(o);
  const again = await webhook('payment.captured', r.entity, { eventId: 'evt_same' });
  const dupe = await webhook('payment.captured', r.entity, { eventId: 'evt_same' });
  assert.equal(again.status, 200); assert.equal(dupe.json.duplicate, true);
  const lateFail = await webhook('payment.failed', { ...r.entity, status: 'failed' });
  assert.equal(lateFail.status, 200);
  assert.equal((await row(o.orderId)).status, 'delivered', 'a late failure event cannot undo a delivery');
  assert.equal(mailsTo('dupe@example.com').length, 2, 'one delivery + one receipt only');
});

test('failed attempt stops everything, but a later successful retry on the same order is delivered', async () => {
  const o = (await order(kit, { email: 'retry@example.com' })).json;
  await webhook('payment.failed', { id: 'pay_Tfail01', order_id: o.razorpay.orderId, amount: 49900, currency: 'INR', status: 'failed', error_reason: 'card_declined' });
  assert.equal((await row(o.orderId)).status, 'failed'); assert.equal(mailsTo('retry@example.com').length, 0);
  await pay(o);
  assert.equal((await row(o.orderId)).status, 'delivered');
});

test('user cancel releases the coupon and sends nothing', async () => {
  await coupon('CANCELME', { max_uses: 1 });
  const o = (await order(kit, { email: 'cancel@example.com', codes: ['cancelme'] })).json;
  assert.equal((await app.pg.query(`select used_count from coupons where code='CANCELME'`)).rows[0].used_count, 1);
  const c = await app.call('POST', '/api/checkout/cancel', { body: { orderId: o.orderId, clientSecret: o.clientSecret }, ip: ip() });
  assert.equal(c.status, 200);
  assert.equal((await row(o.orderId)).status, 'cancelled');
  assert.equal((await app.pg.query(`select used_count from coupons where code='CANCELME'`)).rows[0].used_count, 0);
  assert.equal(mailsTo('cancel@example.com').length, 0);
  const wrong = await app.call('POST', '/api/checkout/cancel', { body: { orderId: o.orderId, clientSecret: 'x'.repeat(32) }, ip: ip() });
  assert.equal(wrong.status, 404, 'someone else cannot cancel or read an order');
});

test('tampered amounts are ignored, and a mismatched payment stops the order', async () => {
  const res = await order(kit, { email: 'tamper@example.com', extra: { amount: 100, total: 1, price: 1, discount: 49800 } });
  assert.equal(res.json.razorpay.amount, 49900, 'server price wins');
  const o = res.json;
  app.mail.sent.length = 0;
  const hook = await webhook('payment.captured', { id: 'pay_Tcheap1', order_id: o.razorpay.orderId, amount: 100, currency: 'INR', status: 'captured' });
  assert.equal(hook.json.result, 'mismatch');
  assert.equal((await row(o.orderId)).status, 'mismatch');
  assert.equal(mailsTo('tamper@example.com').length, 0, 'no download on mismatch');
  assert.equal(mailsTo('owner@example.com').length, 1, 'owner alerted');
  // wrong currency also stops
  const u = (await order(kitUsd, { currency: 'USD', email: 'usdtamper@example.com' })).json;
  const h2 = await webhook('payment.captured', { id: 'pay_Tcur001', order_id: u.razorpay.orderId, amount: 1999, currency: 'INR', status: 'captured' });
  assert.equal(h2.json.result, 'mismatch');
});

test('forged signatures are rejected and change nothing', async () => {
  const o = (await order(kit, { email: 'forge@example.com' })).json;
  const v = await app.call('POST', '/api/checkout/verify', { body: { orderId: o.orderId, clientSecret: o.clientSecret, razorpay_order_id: o.razorpay.orderId, razorpay_payment_id: 'pay_Tforged1', razorpay_signature: 'f'.repeat(64) }, ip: ip() });
  assert.equal(v.status, 400);
  const before = await app.pg.query('select count(*)::int as n from webhook_events');
  const hook = await webhook('payment.captured', { id: 'pay_Tforged2', order_id: o.razorpay.orderId, amount: 49900, currency: 'INR', status: 'captured' }, { secret: 'attacker' });
  assert.equal(hook.status, 400);
  assert.equal((await app.pg.query('select count(*)::int as n from webhook_events')).rows[0].n, before.rows[0].n);
  const db = await row(o.orderId);
  assert.equal(db.status, 'created'); assert.equal(db.captured_at, null); assert.equal(db.signature_verified_at, null);
  // the webhook route needs no origin but a browser can't forge its way through the signature
  assert.deepEqual((await eventsOf(o.orderId)).slice(-1), ['signature_rejected']);
});

test('expired links and the download limit are enforced, atomically', async () => {
  const o = (await order(kit, { email: 'limits@example.com' })).json;
  await pay(o);
  const token = linkIn(mailsTo('limits@example.com')[0]).split('/').pop();
  const post = () => app.call('POST', `/api/download/${token}`, { body: '', raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' }, ip: ip() });
  assert.equal((await post()).status, 303); assert.equal((await post()).status, 303); assert.equal((await post()).status, 303);
  const fourth = await post();
  assert.equal(fourth.status, 410); assert.match(fourth.text, /Download limit reached/);
  const o2 = (await order(kit, { email: 'expired@example.com' })).json;
  await pay(o2);
  const t2 = linkIn(mailsTo('expired@example.com')[0]).split('/').pop();
  await app.pg.query(`update download_tokens set expires_at = now() - interval '1 minute'`);
  const exp = await app.call('GET', `/api/download/${t2}`, { ip: ip() });
  assert.equal(exp.status, 410); assert.match(exp.text, /Link expired/);
  assert.equal((await app.call('GET', '/api/download/not-a-token', { ip: ip() })).status, 404);
});

test('coupon rules: every edge case, server-side', async () => {
  const product = { id: 'p1', kind: 'artifacts', category_id: 'c1' };
  const base = { product, currency: 'INR', subtotal: 50000, email: 'x@y.co', now: new Date('2026-10-01T00:00:00Z'), usage: {}, hasPriorOrders: false, allowStacking: false };
  const c = (over) => ({ id: 'k' + Math.random(), code: 'CODE', kind: 'percent', percent_bp: 1000, currencies: ['INR', 'USD'], used_count: 0, max_uses: null, applies_to: 'all', product_ids: [], stackable: false, paused: false, min_order_inr: 0, min_order_usd: 0, ...over });
  assert.equal(evaluateCoupons([c({})], base).discount, 5000);
  assert.equal(evaluateCoupons([c({ percent_bp: 3333 })], { ...base, subtotal: 999 }).discount, 332, 'percent rounds down');
  assert.equal(evaluateCoupons([c({ percent_bp: 5000, max_discount_inr: 10000 })], base).discount, 10000, 'cap');
  assert.equal(evaluateCoupons([c({ kind: 'fixed', percent_bp: null, amount_inr: 80000 })], base).discount, 50000, 'never below zero');
  const bad = [
    [c({ paused: true }), /isn’t active/], [c({ starts_at: '2026-11-01' }), /isn’t active yet/], [c({ ends_at: '2026-09-01' }), /expired/],
    [c({ currencies: ['USD'] }), /can’t be used with INR/], [c({ kind: 'fixed', percent_bp: null, amount_usd: 500 }), /can’t be used with INR/],
    [c({ min_order_inr: 60000 }), /at least ₹600/], [c({ max_uses: 2, used_count: 2 }), /fully used/],
    [c({ applies_to: 'artzz' }), /doesn’t apply/], [c({ applies_to: 'category', category_id: 'other' }), /doesn’t apply/], [c({ applies_to: 'products', product_ids: ['p2'] }), /doesn’t apply/]
  ];
  for (const [coupon, msg] of bad) assert.throws(() => evaluateCoupons([coupon], base), msg);
  const k = c({ per_email_limit: 1 });
  assert.throws(() => evaluateCoupons([k], { ...base, usage: { [k.id]: { byEmail: 1 } } }), /already used/);
  assert.throws(() => evaluateCoupons([c({ first_order_only: true })], { ...base, hasPriorOrders: true }), /first orders only/);
  assert.equal(evaluateCoupons([c({ first_order_only: true })], { ...base, email: null }).needsEmail, true);
  assert.throws(() => evaluateCoupons([c({}), c({ code: 'TWO' })], base), /Only one code/);
  assert.throws(() => evaluateCoupons([c({ stackable: true }), c({ code: 'TWO', stackable: true })], base), /Only one code/, 'stacking off in settings');
  assert.equal(evaluateCoupons([c({ stackable: true }), c({ code: 'TWO', stackable: true, kind: 'fixed', percent_bp: null, amount_inr: 1000 })], { ...base, allowStacking: true }).discount, 6000);
  assert.throws(() => evaluateCoupons([c({})], { ...base, subtotal: 0 }), /already free/);
});

test('coupons through the API: case-insensitive, race-safe last use, per-email limit, below-minimum totals', async () => {
  await coupon('LASTONE', { max_uses: 1 });
  const first = await order(kit, { email: 'r1@example.com', codes: ['lastone'] });
  assert.equal(first.status, 201); assert.equal(first.json.razorpay.amount, 44910);
  const second = await order(kit, { email: 'r2@example.com', codes: ['LASTONE'] });
  assert.equal(second.status, 400); assert.match(second.json.error, /fully used/);
  await coupon('ONEPERPERSON', { per_email_limit: 1 });
  const a = (await order(kit, { email: 'per@example.com', codes: ['ONEPERPERSON'] })).json; await pay(a);
  const b = await order(kit, { email: 'per@example.com', codes: ['ONEPERPERSON'] });
  assert.match(b.json.error, /already used/);
  await coupon('ALMOST', { kind: 'fixed', percent_bp: null, amount_inr: 49850 });
  const tiny = await order(kit, { email: 'tiny@example.com', codes: ['ALMOST'] });
  assert.equal(tiny.status, 400); assert.match(tiny.json.error, /at least ₹1/);
  const q = await app.call('POST', '/api/checkout/quote', { body: { productId: kit, currency: 'INR', codes: ['nope-code'] }, ip: ip() });
  assert.equal(q.status, 400); assert.match(q.json.error, /isn’t a valid code/);
  const ok = await app.call('POST', '/api/checkout/quote', { body: { productId: kit, currency: 'USD', codes: [] }, ip: ip() });
  assert.deepEqual([ok.json.subtotal, ok.json.total, ok.json.currency], [999, 999, 'USD']);
});

test('free product and 100%-off coupon skip Razorpay and still use signed links', async () => {
  const calls = rz.calls.length;
  const f = await order(freebie, { email: 'free@example.com' });
  assert.equal(f.status, 201); assert.equal(f.json.free, true); assert.match(f.json.downloadUrl, /\/api\/download\//);
  const db = await row(f.json.orderId);
  assert.equal(db.status, 'delivered'); assert.equal(db.total, 0); assert.equal(db.invoice_number, null, 'no invoice number for free orders');
  assert.equal(mailsTo('free@example.com').length, 1, 'delivery email, no receipt');
  await coupon('ALLFREE', { percent_bp: 10000 });
  const g = await order(kit, { email: 'gift@example.com', codes: ['allfree'] });
  assert.equal(g.json.free, true); assert.equal((await row(g.json.orderId)).discount, 49900);
  assert.equal(rz.calls.slice(calls).filter(c => c === 'POST /v1/orders').length, 0, 'Razorpay never asked to charge zero');
});

test('USD order is created, charged and delivered in USD only', async () => {
  const o = (await order(kitUsd, { currency: 'USD', email: 'usd@example.com' })).json;
  assert.deepEqual([o.razorpay.amount, o.razorpay.currency], [1999, 'USD']);
  await pay(o);
  const db = await row(o.orderId);
  assert.deepEqual([db.status, db.currency, db.total], ['delivered', 'USD', 1999]);
  assert.match(mailsTo('usd@example.com')[1].text, /\$19\.99/);
});

test('expiry releases coupons; a real payment arriving late is still delivered', async () => {
  await coupon('LATE', { max_uses: 5 });
  const o = (await order(kit, { email: 'late@example.com', codes: ['LATE'] })).json;
  await app.pg.query(`update orders set expires_at = now() - interval '1 minute' where public_id = $1`, [o.orderId]);
  const cron = await app.call('GET', '/api/cron/daily', { headers: { authorization: 'Bearer test-cron-secret' } });
  assert.equal(cron.status, 200);
  assert.equal((await row(o.orderId)).status, 'expired');
  assert.equal((await app.pg.query(`select used_count from coupons where code='LATE'`)).rows[0].used_count, 0);
  await pay(o);
  const db = await row(o.orderId);
  assert.equal(db.status, 'delivered');
  assert.equal((await app.pg.query(`select used_count from coupons where code='LATE'`)).rows[0].used_count, 1, 'use counted again');
  assert.ok((await eventsOf(o.orderId)).includes('paid'));
});

test('refunds: blocked after download when turned off, confirmed otherwise, then links stop working', async () => {
  const { refundOrder } = await import('../server/store/orders.js');
  const s = (await order(strict, { email: 'strict@example.com' })).json; await pay(s);
  const sToken = linkIn(mailsTo('strict@example.com')[0]).split('/').pop();
  await app.call('POST', `/api/download/${sToken}`, { body: '', raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' }, ip: ip() });
  const sRow = await row(s.orderId);
  await assert.rejects(refundOrder(sRow.id), /can’t be refunded after it has been downloaded/);
  const n = (await order(kit, { email: 'refund@example.com' })).json; const paid = await pay(n);
  const token = linkIn(mailsTo('refund@example.com')[0]).split('/').pop();
  await app.call('POST', `/api/download/${token}`, { body: '', raw: true, headers: { 'content-type': 'application/x-www-form-urlencoded' }, ip: ip() });
  const nRow = await row(n.orderId);
  await assert.rejects(refundOrder(nRow.id), /Confirm to refund anyway/);
  const r = await refundOrder(nRow.id, { allowAfterDownload: true, reason: 'test' });
  assert.equal(r.amount, 49900); assert.equal(rz.refunds.at(-1).payment, paid.paymentId);
  const blocked = await app.call('GET', `/api/download/${token}`, { ip: ip() });
  assert.equal(blocked.status, 410, 'links revoked as soon as the refund starts');
  await webhook('refund.processed', { id: r.refundId, payment_id: paid.paymentId, amount: 49900 }, { key: 'refund' });
  assert.equal((await row(n.orderId)).status, 'refunded');
  await assert.rejects(refundOrder(nRow.id), /Only paid orders/);
});

test('resend gives the same answer for unknown emails and new links for buyers', async () => {
  app.mail.sent.length = 0;
  const unknown = await app.call('POST', '/api/downloads/resend', { body: { email: 'nobody@example.com' }, ip: ip() });
  const known = await app.call('POST', '/api/downloads/resend', { body: { email: 'asha@example.com' }, ip: ip() });
  assert.equal(unknown.status, 200); assert.equal(known.status, 200); assert.equal(unknown.json.message, known.json.message);
  assert.equal(mailsTo('nobody@example.com').length, 0);
  assert.equal(mailsTo('asha@example.com').length, 1); assert.match(mailsTo('asha@example.com')[0].text, /\/api\/download\//);
});

test('tax: inclusive shows the included part, exclusive adds on top, integer rounding', () => {
  assert.deepEqual(computeTax(118000, { taxEnabled: true, taxRateBp: 1800, taxInclusive: true }), { tax: 0, included: 18000 });
  assert.deepEqual(computeTax(100000, { taxEnabled: true, taxRateBp: 1800, taxInclusive: false }), { tax: 18000, included: 0 });
  assert.deepEqual(computeTax(999, { taxEnabled: true, taxRateBp: 1800, taxInclusive: false }), { tax: 180, included: 0 });
  assert.deepEqual(computeTax(999, { taxEnabled: false, taxRateBp: 1800 }), { tax: 0, included: 0 });
});

test('Razorpay outage: order fails cleanly, nothing charged, coupon released', async () => {
  await coupon('OUTAGE', { max_uses: 1 });
  rz.failCreate = true;
  const res = await order(kit, { email: 'outage@example.com', codes: ['OUTAGE'] });
  rz.failCreate = false;
  assert.equal(res.status, 502); assert.match(res.json.error, /Nothing was charged/);
  assert.equal((await app.pg.query(`select used_count from coupons where code='OUTAGE'`)).rows[0].used_count, 0);
});
