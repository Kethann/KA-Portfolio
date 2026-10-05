// Demo payments (local testing only) and the success-screen payment summary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { setEnvSource } from '../server/core/env.js';
import { methodSummary } from '../server/store/orders.js';

const app = await createTestApp({ KA_DEMO_PAYMENTS: '1' });
test.after(() => app.close());
const [p] = (await app.pg.query(`insert into products (kind, slug, title, status, sellable, price_inr, price_usd) values ('artifacts','demo-kit','Demo Kit','published',true,49900,999) returning id`)).rows;
await app.storage.put('deliverables', 'demo/kit.zip', Buffer.from('Z'));
await app.pg.query(`insert into product_files (product_id, storage_path, filename, bytes) values ($1, 'demo/kit.zip', 'kit.zip', 1)`, [p.id]);
let n = 0;
const order = (email) => app.call('POST', '/api/checkout/order', { body: { productId: p.id, currency: 'INR', email, licenseHolder: 'Test Buyer' }, ip: `198.19.0.${++n}` });

test('demo mode: approve delivers through the normal path, decline never sends a download', async () => {
  const cfg = await app.call('GET', '/api/public-config');
  assert.equal(cfg.json.demoPayments, true);
  const o = (await order('demo-yes@example.com')).json;
  assert.equal(o.demo, true); assert.match(o.razorpay.orderId, /^demo_KA-/);
  const ok = await app.call('POST', '/api/checkout/demo-pay', { body: { orderId: o.orderId, clientSecret: o.clientSecret, outcome: 'approve' }, ip: '198.19.1.1' });
  assert.equal(ok.status, 200); assert.equal(ok.json.status, 'delivered'); assert.match(ok.json.downloadUrl, /\/api\/download\//);
  const d = (await order('demo-no@example.com')).json;
  const no = await app.call('POST', '/api/checkout/demo-pay', { body: { orderId: d.orderId, clientSecret: d.clientSecret, outcome: 'decline' }, ip: '198.19.1.2' });
  assert.equal(no.json.status, 'failed'); assert.equal(no.json.downloadUrl, null);
  assert.equal(app.mail.sent.filter(m => m.to === 'demo-no@example.com').length, 0);
  const wrong = await app.call('POST', '/api/checkout/demo-pay', { body: { orderId: d.orderId, clientSecret: 'x'.repeat(32), outcome: 'approve' }, ip: '198.19.1.3' });
  assert.equal(wrong.status, 404);
});

test('demo mode is impossible in production, without the flag, or when Razorpay keys exist', async () => {
  const o = (await order('guard@example.com')).json;
  const attempt = () => app.call('POST', '/api/checkout/demo-pay', { body: { orderId: o.orderId, clientSecret: o.clientSecret, outcome: 'approve' }, ip: '198.19.2.1' });
  for (const vars of [{ ...app.vars, KA_ENV: 'production' }, { ...app.vars, KA_DEMO_PAYMENTS: '' }, { ...app.vars, RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 's' }]){
    setEnvSource(vars);
    const res = await attempt();
    assert.equal(res.status, 404, JSON.stringify(Object.keys(vars).filter(k => /ENV|DEMO|RAZORPAY/.test(k))));
    assert.equal((await app.call('GET', '/api/public-config')).json.demoPayments, false);
  }
  setEnvSource(app.vars);
  const row = (await app.pg.query('select status from orders where public_id = $1', [o.orderId])).rows[0];
  assert.equal(row.status, 'created', 'nothing changed');
});

test('payment summary shows network + last 4 or the method, never personal data', () => {
  assert.deepEqual(methodSummary({ method: 'card', card: { network: 'Visa', last4: '4242', name: 'Asha Rao' }, email: 'a@b.c' }), { type: 'card', network: 'Visa', last4: '4242' });
  assert.deepEqual(methodSummary({ method: 'upi', vpa: 'asha@okbank' }), { type: 'upi', detail: '' });
  assert.deepEqual(methodSummary({ method: 'card', card: { network: 'RuPay', last4: '12x4' } }), { type: 'card', network: 'RuPay', last4: '' });
  assert.equal(methodSummary(null), null);
});
