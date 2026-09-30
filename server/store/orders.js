// Orders: quote -> create -> (signature | webhook | API check) -> paid -> delivered.
// Rules enforced here (see docs in the Phase 3 report):
//   * prices, coupons and tax are computed on the server only; the browser sends ids and codes
//   * an order is locked to one currency for life
//   * PAID needs two independent proofs: the verified webhook (payment.captured / order.paid)
//     AND either the verified checkout signature or a server-to-server Razorpay API check
//   * amount/currency mismatch stops everything (status 'mismatch', owner alerted)
//   * every transition is one all-or-nothing batch whose statements re-check the order's state in SQL
//     (D1 has no row locks), so duplicate/out-of-order events can't double-pay or double-deliver
import { HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { env, isProduction } from '../core/env.js';
import { getSetting } from '../core/settings.js';
import { randomToken, sha256hex } from '../core/crypto.js';
import { sendEmail } from '../core/email.js';
import { priceFor, formatMoney } from './pricing.js';
import { evaluateCoupons, normalizeCodes } from './coupons.js';
import * as razorpay from './razorpay.js';
import { issueToken, sendDeliveryEmails } from './delivery.js';
import { NEXT_INVOICE, INVOICE_VALUE } from '../core/atomic.js';

export const MIN_CHARGE = 100;   // Razorpay's minimum: 100 minor units (₹1 / $1)

// Demo payments: local testing of the whole checkout without Razorpay. Only when KA_DEMO_PAYMENTS=1
// AND not production AND Razorpay keys are absent; the demo endpoint refuses otherwise.
export function demoPaymentsEnabled(){
  return !isProduction() && env('KA_DEMO_PAYMENTS') === '1' && !razorpay.isConfigured();
}

// What the buyer paid with: card network + last 4 digits, or 'upi' / 'netbanking' (bank) / 'wallet'.
// Shown on the success screen and kept on the order for the owner's records. No UPI ID, name or full
// card data is ever returned or stored.
export function methodSummary(p){
  if (!p || typeof p !== 'object') return null;
  const m = String(p.method || '');
  if (m === 'card' && p.card) return { type: 'card', network: String(p.card.network || '').slice(0, 20), last4: /^\d{4}$/.test(String(p.card.last4 || '')) ? String(p.card.last4) : '' };
  if (['upi', 'netbanking', 'wallet', 'emi', 'paylater'].includes(m)) return { type: m, detail: m === 'wallet' ? String(p.wallet || '').slice(0, 20) : m === 'netbanking' ? String(p.bank || '').slice(0, 20) : '' };
  return m ? { type: m.slice(0, 20) } : null;
}

const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newPublicId(){
  const bytes = Buffer.from(randomToken(12), 'base64url');
  let s = '';
  for (let i = 0; i < 8; i++) s += PUBLIC_ID_ALPHABET[bytes[i] % PUBLIC_ID_ALPHABET.length];
  return `KA-${s}`;
}

async function event(db, orderId, type, data = {}){
  await db.query('insert into order_events (order_id, type, data) values ($1, $2, $3)', [orderId, type, data]);
}
// the same, as a batch step; `when` is an extra SQL condition on the order row (o), checked in the same batch
const evt = (orderId, type, data = {}, when = '') => when
  ? [`insert into order_events (order_id, type, data) select $1, $2, $3 where exists (select 1 from orders o where o.id = $1 and (${when}))`, [orderId, type, data]]
  : ['insert into order_events (order_id, type, data) values ($1, $2, $3)', [orderId, type, data]];

export async function loadSellableProduct(db, { productId, slug }){
  const p = productId
    ? await db.maybeOne(`select * from products where id = $1`, [String(productId)])
    : await db.maybeOne(`select * from products where slug = $1`, [String(slug || '')]);
  if (!p || p.status !== 'published' || !p.sellable) throw new HttpError(404, 'This item isn’t available.');
  return p;
}

// Tax per settings (confirm GST treatment with your accountant before turning it on):
//   inclusive: prices already contain tax; tax column stays 0, the included part is reported
//   exclusive: tax is added on top of the discounted amount
export function computeTax(amountAfterDiscount, store){
  if (!store.taxEnabled || !store.taxRateBp || amountAfterDiscount <= 0) return { tax: 0, included: 0 };
  const r = store.taxRateBp;
  if (store.taxInclusive){
    const net = Math.floor((amountAfterDiscount * 10000 + Math.floor((10000 + r) / 2)) / (10000 + r));
    return { tax: 0, included: amountAfterDiscount - net };
  }
  return { tax: Math.floor((amountAfterDiscount * r + 5000) / 10000), included: 0 };
}

async function couponUsage(db, couponIds, email){
  const usage = {};
  if (!couponIds.length || !email) return usage;
  const rows = await db.query(`select coupon_id, count(*) as n from coupon_redemptions
    where coupon_id in (select value from json_each($1)) and email = $2 and status <> 'released' group by coupon_id`, [couponIds, email]);
  for (const r of rows) usage[r.coupon_id] = { byEmail: r.n };
  return usage;
}
async function hasPriorOrders(db, email){
  if (!email) return null;
  return !!(await db.maybeOne(`select 1 from orders where email = $1 and status in ('paid','delivered','refunded') limit 1`, [email]));
}

// Everything the checkout shows before paying. Throws with a clear message for any problem.
export async function quote(db, { productId, slug, currency, codes, email, now = new Date(), store: storeSettings }){
  if (currency !== 'INR' && currency !== 'USD') throw new HttpError(400, 'Currency must be INR or USD.');
  const product = await loadSellableProduct(db, { productId, slug });
  const price = priceFor(product, currency, now);
  if (!price.available) throw new HttpError(400, `This item can’t be bought in ${currency}.`);
  const list = normalizeCodes(codes);
  let coupons = [];
  if (list.length){
    coupons = await db.query(`select * from coupons where code in (select value from json_each($1))`, [list]);
    const found = new Set(coupons.map(c => c.code));
    const missing = list.find(c => !found.has(c));
    if (missing) throw new HttpError(400, `${missing} isn’t a valid code.`, { code: 'coupon_rejected' });
    coupons = list.map(code => coupons.find(c => c.code === code));
  }
  const store = storeSettings || await getSetting('store');
  const evalResult = evaluateCoupons(coupons, {
    product, currency, subtotal: price.amount, email, now,
    usage: await couponUsage(db, coupons.map(c => c.id), email),
    hasPriorOrders: await hasPriorOrders(db, email),
    allowStacking: !!store.allowCouponStacking
  });
  const afterDiscount = price.amount - evalResult.discount;
  const { tax, included } = computeTax(afterDiscount, store);
  const total = afterDiscount + tax;
  if (total > 0 && total < MIN_CHARGE) throw new HttpError(400, `The total after discounts must be at least ${formatMoney(MIN_CHARGE, currency)}, or free.`, { code: 'below_minimum' });
  return {
    product, currency, price,
    subtotal: price.amount, discount: evalResult.discount, tax, taxIncluded: included, taxLabel: store.taxLabel || 'Tax', total,
    applied: evalResult.applied, needsEmail: evalResult.needsEmail, coupons
  };
}

export function quoteDto(q){
  return {
    currency: q.currency, subtotal: q.subtotal, discount: q.discount, tax: q.tax, taxIncluded: q.taxIncluded, taxLabel: q.taxLabel,
    total: q.total, free: q.total === 0, onSale: q.price.onSale, compareAt: q.price.compareAt,
    codes: q.applied.map(a => ({ code: a.code, amount: a.amount })), needsEmail: q.needsEmail
  };
}

// Creates the order (and the Razorpay order when there's something to pay). Returns what the
// browser needs to open Razorpay Checkout, or a download link right away for free orders.
export async function createOrder({ productId, currency, codes, email, ip, country, siteUrl }){
  const db = await getDb();
  const store = await getSetting('store');
  if (store.enabled === false) throw new HttpError(503, 'The store is closed right now.');
  const clientSecret = randomToken(24);
  const q = await quote(db, { productId, currency, codes, email, store });
  if (q.needsEmail) throw new HttpError(400, 'Enter your email to use this code.');
  const free = q.total === 0;
  const expires = new Date(Date.now() + (store.orderExpiryMinutes || 45) * 60000);
  const license = q.product.license_id ? await db.maybeOne('select key, version from licenses where id = $1', [q.product.license_id]) : null;
  const orderId = crypto.randomUUID();
  let order;
  try {
    const rs = await db.batch([
      [`insert into orders (id, public_id, email, currency, subtotal, discount, tax, total, status, is_free, paid_at, ip, country, expires_at, client_secret_hash)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
        [orderId, newPublicId(), email, q.currency, q.subtotal, q.discount, q.tax, q.total, free ? 'paid' : 'created', free, free ? new Date() : null, ip, country, expires, sha256hex(clientSecret)]],
      [`insert into order_items (order_id, product_id, title, license_key, license_version, unit_price, discount, total) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [orderId, q.product.id, q.product.title, license?.key || null, license?.version || null, q.subtotal, q.discount, q.subtotal - q.discount]],
      ...q.applied.flatMap(a => [
        [`insert into coupon_redemptions (coupon_id, order_id, email, currency, amount, status) values ($1,$2,$3,$4,$5,$6)`,
          [a.id, orderId, email, q.currency, a.amount, free ? 'confirmed' : 'reserved']],
        // the coupon_uses check fails the whole batch if the code ran out since the quote
        ['update coupons set used_count = used_count + 1 where id = $1', [a.id]],
      ]),
      // Free orders get no invoice number: the numbered series stays continuous for paid sales only.
      evt(orderId, 'created', { total: q.total, currency: q.currency, codes: q.applied.map(a => a.code), free }),
    ]);
    order = rs[0][0];
  } catch (err){
    if (/coupon_uses|used_count/.test(String(err && err.message))) throw new HttpError(400, 'That code has just been used up. Remove it and try again.', { code: 'coupon_rejected' });
    throw err;
  }
  if (free){
    await deliver(order.id, siteUrl);
    const link = await issueScreenLink(order.id, siteUrl);
    return { orderId: order.public_id, clientSecret, free: true, downloadUrl: link };
  }
  if (demoPaymentsEnabled()){
    const demoId = `demo_${order.public_id}`;
    await db.query('update orders set razorpay_order_id = $2, updated_at = now() where id = $1', [order.id, demoId]);
    return { orderId: order.public_id, clientSecret, free: false, demo: true,
      razorpay: { keyId: '', orderId: demoId, amount: q.total, currency: q.currency, name: env('SITE_NAME', 'Kethan Artzz'), description: q.product.title, email } };
  }
  let rz;
  try {
    rz = await razorpay.createOrder({ amount: q.total, currency: q.currency, receipt: order.public_id, notes: { order: order.public_id } });
  } catch (err){
    await db.batch([
      ...releaseCoupons(order.id, `o.status = 'created'`),
      [`update orders set status = 'failed', updated_at = now() where id = $1 and status = 'created'`, [order.id]],
      evt(order.id, 'razorpay_order_failed', { code: err.code || null }),
    ]);
    throw new HttpError(502, 'Payments are unavailable right now. Nothing was charged. Please try again in a few minutes.');
  }
  if (rz.amount !== q.total || rz.currency !== q.currency){
    await markMismatch(db, order.id, { stage: 'create', amount: rz.amount, currency: rz.currency });
    throw new HttpError(502, 'Payments are unavailable right now. Nothing was charged.');
  }
  await db.query('update orders set razorpay_order_id = $2, updated_at = now() where id = $1', [order.id, rz.id]);
  return {
    orderId: order.public_id, clientSecret, free: false,
    razorpay: { keyId: env('RAZORPAY_KEY_ID'), orderId: rz.id, amount: q.total, currency: q.currency, name: env('SITE_NAME', 'Kethan Artzz'), description: q.product.title, email }
  };
}

// Batch steps that give back the order's reserved coupon uses. `when`: an optional condition on the order
// row (o) — put these steps BEFORE the statement that changes the order's status.
export function releaseCoupons(orderId, when = ''){
  const guard = when ? ` and exists (select 1 from orders o where o.id = $1 and (${when}))` : '';
  return [
    [`update coupons set used_count = max(used_count - 1, 0)
      where id in (select coupon_id from coupon_redemptions where order_id = $1 and status = 'reserved')${guard}`, [orderId]],
    [`update coupon_redemptions set status = 'released' where order_id = $1 and status = 'reserved'${guard}`, [orderId]],
  ];
}

async function markMismatch(db, orderId, data){
  await db.batch([
    ...releaseCoupons(orderId),
    [`update orders set status = 'mismatch', updated_at = now() where id = $1 and status not in ('delivered','refunded')`, [orderId]],
    evt(orderId, 'mismatch', data),
  ]);
  const owner = env('OWNER_EMAIL');
  if (owner) await sendEmail({ to: owner, template: 'alert', vars: { title: 'Payment amount mismatch', body: `An order was stopped because the payment didn’t match the order (${data.stage}). No file was sent. Check the order in the portal before refunding.` } });
}

async function orderByClient(db, publicId, clientSecret){
  if (typeof publicId !== 'string' || !/^KA-[A-Z2-9]{8}$/.test(publicId) || typeof clientSecret !== 'string' || clientSecret.length > 100) throw new HttpError(404, 'Order not found.');
  const o = await db.maybeOne('select * from orders where public_id = $1', [publicId]);
  if (!o || !o.client_secret_hash || o.client_secret_hash !== sha256hex(clientSecret)) throw new HttpError(404, 'Order not found.');
  return o;
}

// Browser proof: the Razorpay Checkout success handler's signature, checked here with the key secret.
export async function verifyCheckout({ publicId, clientSecret, razorpayOrderId, paymentId, signature, siteUrl }){
  const db = await getDb();
  const order = await orderByClient(db, publicId, clientSecret);
  if (!order.razorpay_order_id || order.razorpay_order_id !== razorpayOrderId || !razorpay.verifyPaymentSignature({ orderId: razorpayOrderId, paymentId, signature })){
    await event(db, order.id, 'signature_rejected', {});
    throw new HttpError(400, 'We couldn’t verify this payment. If money was taken, it will be confirmed automatically or refunded. Contact us with your order ID.', { code: 'signature_invalid' });
  }
  await db.batch([
    evt(order.id, 'signature_verified', {}, 'o.signature_verified_at is null'),
    [`update orders set signature_verified_at = coalesce(signature_verified_at, now()),
      razorpay_payment_id = coalesce(razorpay_payment_id, $2), updated_at = now() where id = $1`, [order.id, paymentId]],
  ]);
  await tryFinalize(order.id, siteUrl);
  const result = await statusFor(publicId, clientSecret, siteUrl);
  let method = null;
  try { method = methodSummary(await razorpay.fetchPayment(paymentId)); } catch { /* display only */ }
  if (method) await db.query('update orders set payment_method = coalesce(payment_method, $2) where id = $1', [order.id, method]);
  return { ...result, method };
}

// Demo payment (see demoPaymentsEnabled). 'approve' records both proofs as a real capture would;
// 'decline' records a failed attempt. Delivery then runs through the normal, unchanged path.
export async function demoPay({ publicId, clientSecret, outcome, card, siteUrl }){
  if (!demoPaymentsEnabled()) throw new HttpError(404, 'Not found.');
  const db = await getDb();
  const order = await orderByClient(db, publicId, clientSecret);
  if (!String(order.razorpay_order_id || '').startsWith('demo_')) throw new HttpError(404, 'Not found.');
  if (outcome === 'approve'){
    const method = methodSummary({ method: 'card', card: { network: card?.network || 'Demo card', last4: card?.last4 } });
    await db.batch([
      evt(order.id, 'demo_payment', { outcome }, 'o.captured_at is null'),
      [`update orders set signature_verified_at = now(), captured_at = now(), razorpay_payment_id = $2, payment_method = $3, updated_at = now()
        where id = $1 and captured_at is null`, [order.id, `demo_pay_${order.public_id}`, method]],
    ]);
    await tryFinalize(order.id, siteUrl);
  } else {
    await db.batch([
      [`update orders set status = 'failed', updated_at = now() where id = $1 and status = 'created'`, [order.id]],
      evt(order.id, 'payment_failed', { reason: 'demo_declined' }),
    ]);
  }
  return statusFor(publicId, clientSecret, siteUrl);
}

// Webhook proof. `rawBody` must be the exact bytes Razorpay sent (signature is over them).
export async function handleWebhook({ rawBody, signature, eventId, siteUrl }){
  if (!razorpay.verifyWebhookSignature(rawBody, signature)) throw new HttpError(400, 'Invalid signature.');
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch { throw new HttpError(400, 'Invalid payload.'); }
  const type = String(payload.event || '');
  const id = typeof eventId === 'string' && eventId && eventId.length <= 100 ? eventId : `hash:${sha256hex(rawBody)}`;
  const db = await getDb();
  // Idempotency: an event counts as handled only once it finished processing. A retry of an event
  // that failed half-way is processed again; every step below is itself idempotent.
  const existing = await db.maybeOne('select processed_at from webhook_events where id = $1', [id]);
  if (existing?.processed_at) return { duplicate: true };
  if (!existing) await db.query('insert into webhook_events (id, type, payload) values ($1, $2, $3) on conflict (id) do nothing', [id, type, payload]);

  let result = 'ignored', finalizeId = null;
  const payment = payload?.payload?.payment?.entity;
  if ((type === 'payment.captured' || type === 'order.paid') && payment){
    const order = payment.order_id ? await db.maybeOne('select * from orders where razorpay_order_id = $1', [payment.order_id]) : null;
    if (!order) result = 'unknown_order';
    else if (payment.amount !== order.total || payment.currency !== order.currency || (payment.status && payment.status !== 'captured')){
      if (payment.status && payment.status !== 'captured') result = 'not_captured';
      else { await markMismatch(db, order.id, { stage: 'webhook', amount: payment.amount, currency: payment.currency }); result = 'mismatch'; }
    } else {
      // events first: their conditions read the order as it was before this capture
      await db.batch([
        evt(order.id, 'payment_captured', { via: type }, 'o.captured_at is null'),
        [`insert into order_events (order_id, type, data) select $1, 'second_payment', $3 where exists (select 1 from orders o where o.id = $1
            and o.captured_at is not null and o.razorpay_payment_id is not null and o.razorpay_payment_id <> $2)`, [order.id, payment.id, { payment: payment.id }]],
        [`update orders set captured_at = coalesce(captured_at, now()), razorpay_payment_id = case when captured_at is null then $2 else razorpay_payment_id end,
          payment_method = coalesce(payment_method, $3), updated_at = now() where id = $1`, [order.id, payment.id, methodSummary(payment)]],
      ]);
      finalizeId = order.id; result = 'captured';
    }
  } else if (type === 'payment.failed' && payment){
    const order = payment.order_id ? await db.maybeOne('select id, status from orders where razorpay_order_id = $1', [payment.order_id]) : null;
    if (order){
      // A failed attempt is not final: Razorpay lets the buyer retry on the same order.
      await db.batch([
        [`update orders set status = 'failed', updated_at = now() where id = $1 and status = 'created'`, [order.id]],
        evt(order.id, 'payment_failed', { reason: String(payment.error_reason || payment.error_code || '').slice(0, 80) }),
      ]);
      result = 'failed';
    } else result = 'unknown_order';
  } else if (type === 'refund.processed' || type === 'refund.failed'){
    const refund = payload?.payload?.refund?.entity;
    const order = refund?.payment_id ? await db.maybeOne('select id from orders where razorpay_payment_id = $1', [refund.payment_id]) : null;
    if (order){
      await db.batch([
        ...(type === 'refund.processed' ? [
          [`update orders set status = 'refunded', refunded_at = coalesce(refunded_at, now()), refund_id = coalesce(refund_id, $2), refund_amount = coalesce(refund_amount, $3), updated_at = now() where id = $1`, [order.id, refund.id, refund.amount]],
          ['update download_tokens set revoked_at = coalesce(revoked_at, now()) where order_id = $1', [order.id]],
        ] : []),
        evt(order.id, type === 'refund.processed' ? 'refunded' : 'refund_failed', { refund: refund.id }),
      ]);
      result = type;
    } else result = 'unknown_order';
  }
  if (finalizeId) await tryFinalize(finalizeId, siteUrl);
  await db.query('update webhook_events set processed_at = now(), result = $2 where id = $1', [id, result]);
  return { ok: true, result };
}

// Moves a captured order to PAID once it has both proofs, then delivers. Safe to call any number
// of times from any path (checkout verify, webhook, cron).
export async function tryFinalize(orderId, siteUrl){
  const db = await getDb();
  let order = await db.maybeOne('select * from orders where id = $1', [orderId]);
  if (!order || order.is_free) return;
  if (['paid', 'delivered'].includes(order.status)){ if (order.status === 'paid') await deliver(orderId, siteUrl); return; }
  if (['refunded', 'mismatch'].includes(order.status) || !order.captured_at) return;
  // Second proof when the browser never came back: ask Razorpay directly (server to server).
  if (!order.signature_verified_at && !order.api_verified_at && order.razorpay_payment_id && razorpay.isConfigured()){
    try {
      const p = await razorpay.fetchPayment(order.razorpay_payment_id);
      if (p.status === 'captured' && p.order_id === order.razorpay_order_id && p.amount === order.total && p.currency === order.currency){
        await db.query('update orders set api_verified_at = coalesce(api_verified_at, now()) where id = $1', [orderId]);
        await event(db, orderId, 'api_verified', {});
      } else if (p.status === 'captured'){
        await markMismatch(db, orderId, { stage: 'api', amount: p.amount, currency: p.currency });
        return;
      }
    } catch { /* network trouble: the next signal (verify, retry, cron) finishes it */ }
  }
  const o = await db.one('select * from orders where id = $1', [orderId]);
  if (o.status === 'paid'){ await deliver(orderId, siteUrl); return; }
  if (o.status === 'delivered' || o.status === 'refunded' || o.status === 'mismatch') return;
  if (!o.captured_at || !(o.signature_verified_at || o.api_verified_at)) return;
  const late = ['expired', 'cancelled', 'failed'].includes(o.status);
  // eligible = not yet paid and both proofs present; re-checked in SQL inside the batch
  const ELIGIBLE = `o.status not in ('paid','delivered','refunded','mismatch') and o.captured_at is not null and (o.signature_verified_at is not null or o.api_verified_at is not null)`;
  const guard = `exists (select 1 from orders o where o.id = $1 and ${ELIGIBLE})`;
  const rs = await db.batch([
    // coupons: re-count uses that were released while the order had expired, then confirm every reservation
    [`update coupons set used_count = used_count + 1 where id in (select coupon_id from coupon_redemptions where order_id = $1 and status = 'released') and ${guard}`, [orderId]],
    [`update coupon_redemptions set status = 'confirmed' where order_id = $1 and status in ('released','reserved') and ${guard}`, [orderId]],
    // the next invoice number is taken only when this batch really marks the order paid (gapless series)
    [`${NEXT_INVOICE[0].replace(' returning last', '')} and ${guard} and exists (select 1 from orders o where o.id = $1 and o.invoice_number is null)`, [orderId]],
    [`update orders set status = 'paid', paid_at = now(), invoice_number = coalesce(invoice_number, ${INVOICE_VALUE}), updated_at = now()
      where id = $1 and ${ELIGIBLE.replaceAll('o.', '')} returning id`, [orderId]],
  ]);
  if (rs[3].length) await event(db, orderId, 'paid', { proofs: [o.signature_verified_at && 'signature', o.api_verified_at && 'api', 'webhook'].filter(Boolean), late });
  await deliver(orderId, siteUrl);
}

// Sends the download email (+ receipt). Idempotent and single-sender: the order row is claimed
// under a lock, and becomes DELIVERED only when the email was accepted. A failed send stays PAID
// (the portal shows it; the daily job retries after 10 minutes).
export async function deliver(orderId, siteUrl){
  const db = await getDb();
  // one atomic claim: only a paid, undelivered order that nobody claimed in the last 10 minutes
  const claimed = await db.maybeOne(`update orders set delivery_claimed_at = now()
    where id = $1 and status = 'paid' and delivered_at is null
      and (delivery_claimed_at is null or delivery_claimed_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-600 seconds'))
    returning *`, [orderId]);
  if (!claimed) return;
  const ok = await sendDeliveryEmails(claimed, siteUrl);
  if (ok){
    await db.query(`update orders set status = 'delivered', delivered_at = now(), updated_at = now() where id = $1 and status = 'paid'`, [orderId]);
    await event(db, orderId, 'delivered', {});
  } else {
    await event(db, orderId, 'delivery_email_failed', {});
  }
}

// Public status for the browser that started the checkout (needs the client secret). Once the
// order is delivered, it also returns a one-time on-screen download link.
export async function statusFor(publicId, clientSecret, siteUrl){
  const db = await getDb();
  const order = await orderByClient(db, publicId, clientSecret);
  let downloadUrl = null;
  // paid = both proofs are in; the on-screen link works even if the email is slow or failed
  if (order.status === 'delivered' || order.status === 'paid') downloadUrl = await issueScreenLink(order.id, siteUrl);
  return { orderId: order.public_id, status: order.status, total: order.total, currency: order.currency, downloadUrl };
}

async function issueScreenLink(orderId, siteUrl){
  const db = await getDb();
  const already = await db.maybeOne(`select 1 from download_tokens where order_id = $1 and channel = 'screen'`, [orderId]);
  if (already) return null;
  const item = await db.maybeOne('select product_id from order_items where order_id = $1 order by id limit 1', [orderId]);
  if (!item) return null;
  return issueToken(orderId, item.product_id, 'screen', siteUrl);
}

export async function cancelCheckout({ publicId, clientSecret }){
  const db = await getDb();
  const order = await orderByClient(db, publicId, clientSecret);
  const open = `o.status in ('created','failed')`;
  await db.batch([
    ...releaseCoupons(order.id, open),
    evt(order.id, 'cancelled', {}, open),
    [`update orders set status = 'cancelled', updated_at = now() where id = $1 and status in ('created','failed')`, [order.id]],
  ]);
  return { ok: true };
}

// Daily job: unpaid orders past their expiry are closed and their coupon uses released.
export async function expireOrders(){
  const db = await getDb();
  const rows = await db.query(`select id from orders where status in ('created','failed') and expires_at < now() and captured_at is null`);
  const stale = `o.status in ('created','failed') and o.captured_at is null`;
  for (const r of rows){
    await db.batch([
      ...releaseCoupons(r.id, stale),
      evt(r.id, 'expired', {}, stale),
      [`update orders set status = 'expired', updated_at = now() where id = $1 and status in ('created','failed') and captured_at is null`, [r.id]],
    ]);
  }
  // orders captured but never finished (e.g. a network error mid-way) get another attempt
  const stuck = await db.query(`select id from orders where captured_at is not null and status in ('created','failed','expired','cancelled','paid') and created_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')`);
  for (const s of stuck) await tryFinalize(s.id, env('PUBLIC_SITE_URL'));
  return { expired: rows.length, retried: stuck.length };
}

// Owner-initiated refund (portal). Downloads are revoked immediately; the order becomes
// 'refunded' when Razorpay confirms (refund.processed webhook).
export async function refundOrder(orderId, { amount, allowAfterDownload = false, reason = '' } = {}){
  const db = await getDb();
  const o = await db.maybeOne('select * from orders where id = $1', [orderId]);
  if (!o) throw new HttpError(404, 'Order not found.');
  if (o.is_free) throw new HttpError(400, 'Free orders have nothing to refund.');
  if (!['paid', 'delivered'].includes(o.status)) throw new HttpError(409, 'Only paid orders can be refunded.');
  if (o.refund_id) throw new HttpError(409, 'A refund is already in progress for this order.');
  const downloads = (await db.one('select count(*) as n from download_events where order_id = $1', [orderId])).n;
  if (downloads > 0){
    const blocked = await db.maybeOne(`select 1 from order_items i join products p on p.id = i.product_id where i.order_id = $1 and not p.refund_after_download`, [orderId]);
    if (blocked) throw new HttpError(409, 'This product can’t be refunded after it has been downloaded (you turned refunds off for it).', { code: 'refund_blocked' });
    if (!allowAfterDownload) throw new HttpError(409, `The buyer has downloaded this ${downloads} time(s). Confirm to refund anyway.`, { code: 'refund_needs_confirmation' });
  }
  const refundAmount = amount === undefined ? o.total : amount;
  if (!Number.isSafeInteger(refundAmount) || refundAmount <= 0 || refundAmount > o.total) throw new HttpError(400, 'Refund amount must be between 1 and the order total.');
  const r = await razorpay.refundPayment(o.razorpay_payment_id, refundAmount, { order: o.public_id, reason: String(reason).slice(0, 200) });
  await db.batch([
    ['update orders set refund_id = $2, refund_amount = $3, refund_requested_at = now(), updated_at = now() where id = $1', [orderId, r.id, refundAmount]],
    ['update download_tokens set revoked_at = coalesce(revoked_at, now()) where order_id = $1', [orderId]],
    evt(orderId, 'refund_requested', { amount: refundAmount, refund: r.id }),
  ]);
  return { refundId: r.id, amount: refundAmount };
}
