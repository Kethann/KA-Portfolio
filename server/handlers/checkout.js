// Checkout, payment verification, webhooks, downloads and link resends.
import { json, readJson, readBody, HttpError } from '../core/http.js';
import { siteUrl } from '../core/env.js';
import { rateLimit, verifyTurnstile, verifyTurnstileLenient } from '../core/guard.js';
import { email as vEmail, currency as vCurrency, str } from '../core/validate.js';
import { getDb } from '../core/db.js';
import * as orders from '../store/orders.js';
import { cleanHolder } from '../store/license.js';
import { downloadPage, redeem, resendLinks, rate } from '../store/delivery.js';
import { verifyFileUrl, streamDriveFile } from '../store/drive.js';
import { onDaily } from '../jobs/hooks.js';

function productIdFrom(body){
  const id = body.productId;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Choose a product.');
  return id;
}

export async function quote(ctx){
  await rateLimit(`quote:${ctx.ip}`, 40, 10 * 60);
  const body = await readJson(ctx.request, 8 * 1024);
  const codes = body.codes;
  const hasCodes = Array.isArray(codes) ? codes.length > 0 : !!codes;
  if (hasCodes){
    // coupon checks are guessable, so they are bot-checked and limited harder
    await rateLimit(`coupon:${ctx.ip}`, 12, 10 * 60);
    await verifyTurnstile(body.turnstileToken, ctx.ip);
  }
  const email = body.email ? vEmail(body.email) : null;
  const db = await getDb();
  try {
    const q = await orders.quote(db, { productId: productIdFrom(body), currency: vCurrency(body.currency), codes, email });
    return json(orders.quoteDto(q));
  } catch (err){
    // a rejected code is a normal answer the form shows, not an HTTP error
    if (err instanceof HttpError && (err.extra.code === 'coupon_rejected' || err.extra.code === 'coupon_invalid')) return json({ ok: false, error: err.message, code: err.extra.code });
    throw err;
  }
}

export async function createOrder(ctx){
  await rateLimit(`order:${ctx.ip}`, 10, 10 * 60);
  const body = await readJson(ctx.request, 8 * 1024);
  const email = vEmail(body.email);
  await rateLimit(`order-email:${email}`, 10, 60 * 60);
  const holder = cleanHolder(body.licenseHolder);
  if (!holder || holder.length < 2) throw new HttpError(400, 'Enter the name for your license.', { code: 'holder_required' });
  await verifyTurnstile(body.turnstileToken, ctx.ip);
  const result = await orders.createOrder({ productId: productIdFrom(body), currency: vCurrency(body.currency), codes: body.codes, email,
    ip: ctx.ip, country: ctx.geo?.country || null, siteUrl: siteUrl(ctx.request), licenseHolder: holder });
  return json(result, 201);
}

function clientFields(body){
  return { publicId: str(body.orderId, { name: 'Order', max: 20 }), clientSecret: str(body.clientSecret, { name: 'Session', max: 100 }) };
}

export async function verify(ctx){
  await rateLimit(`verify:${ctx.ip}`, 30, 10 * 60);
  const body = await readJson(ctx.request, 8 * 1024);
  const result = await orders.verifyCheckout({ ...clientFields(body),
    razorpayOrderId: str(body.razorpay_order_id, { max: 60 }), paymentId: str(body.razorpay_payment_id, { max: 60 }), signature: str(body.razorpay_signature, { max: 200 }),
    siteUrl: siteUrl(ctx.request) });
  return json(result);
}

export async function status(ctx){
  await rateLimit(`status:${ctx.ip}`, 150, 10 * 60);
  const body = await readJson(ctx.request, 4 * 1024);
  const { publicId, clientSecret } = clientFields(body);
  return json(await orders.statusFor(publicId, clientSecret, siteUrl(ctx.request)));
}

export async function demoPay(ctx){
  await rateLimit(`demo:${ctx.ip}`, 30, 10 * 60);
  const body = await readJson(ctx.request, 4 * 1024);
  const outcome = body.outcome === 'approve' ? 'approve' : 'decline';
  const card = body.card && typeof body.card === 'object' ? { network: String(body.card.network || '').slice(0, 20), last4: String(body.card.last4 || '').slice(0, 4) } : null;
  return json(await orders.demoPay({ ...clientFields(body), outcome, card, siteUrl: siteUrl(ctx.request) }));
}

export async function cancel(ctx){
  await rateLimit(`cancel:${ctx.ip}`, 30, 10 * 60);
  const body = await readJson(ctx.request, 4 * 1024);
  return json(await orders.cancelCheckout(clientFields(body)));
}

// Razorpay -> us. Authenticated by the webhook signature over the raw body, not by origin.
export async function razorpayWebhook(ctx){
  const raw = await readBody(ctx.request, 1024 * 1024);
  const result = await orders.handleWebhook({
    rawBody: raw,
    signature: ctx.request.headers.get('x-razorpay-signature'),
    eventId: ctx.request.headers.get('x-razorpay-event-id'),
    siteUrl: siteUrl(ctx.request)
  });
  return json(result);
}

export async function downloadGet(ctx){
  await rateLimit(`dl-view:${ctx.ip}`, 60, 10 * 60);
  return downloadPage(ctx.params.token, siteUrl(ctx.request), { rated: ctx.url.searchParams.get('rated') === '1' });
}

// "Rate it" on the download page (a plain form post; the link itself proves the purchase)
// Streams a Google Drive-backed file through this server. The link is ours, signed, and valid for about a minute (it is only
// handed out by a counted download); the Drive address is never part of it.
export async function fileGet(ctx){
  const exp = ctx.url.searchParams.get('exp'), sig = ctx.url.searchParams.get('sig');
  if (!/^[0-9a-f-]{36}$/.test(ctx.params.id) || !verifyFileUrl(ctx.params.id, exp, sig)) throw new HttpError(403, 'This download link has expired. Open your download link again.');
  await rateLimit(`file:${ctx.ip}`, 60, 10 * 60);
  const db = await getDb();
  const f = await db.maybeOne(`select filename, drive_id from product_files where id = $1 and source = 'drive'`, [ctx.params.id]);
  if (!f || !f.drive_id) throw new HttpError(404, 'File not found.');
  return streamDriveFile({ driveId: f.drive_id, filename: f.filename, request: ctx.request });
}

export async function ratePost(ctx){
  await rateLimit(`rate:${ctx.ip}`, 20, 60 * 60);
  const form = new URLSearchParams((await readBody(ctx.request, 8 * 1024)).toString('utf8'));
  return rate({ token: ctx.params.token, form, siteUrl: siteUrl(ctx.request) });
}

export async function downloadPost(ctx){
  await rateLimit(`dl:${ctx.ip}`, 20, 10 * 60);
  const type = (ctx.request.headers.get('content-type') || '').toLowerCase();
  let token = '';
  if (type.startsWith('application/x-www-form-urlencoded')){
    const form = new URLSearchParams((await readBody(ctx.request, 16 * 1024)).toString('utf8'));
    token = form.get('cf-turnstile-response') || '';
  } else if (type.startsWith('application/json')){
    token = (await readJson(ctx.request, 16 * 1024)).turnstileToken || '';
  }
  await verifyTurnstileLenient(token, ctx.ip);
  return redeem({ token: ctx.params.token, ip: ctx.ip, country: ctx.geo?.country || null, userAgent: ctx.request.headers.get('user-agent'), siteUrl: siteUrl(ctx.request) });
}

export async function resend(ctx){
  await rateLimit(`resend:${ctx.ip}`, 5, 60 * 60);
  const body = await readJson(ctx.request, 4 * 1024);
  const email = vEmail(body.email);
  await verifyTurnstile(body.turnstileToken, ctx.ip);
  // per-email limit fails silently so it can't reveal whether the address has orders
  let allowed = true;
  try { await rateLimit(`resend-email:${email}`, 3, 60 * 60); } catch { allowed = false; }
  if (allowed) await resendLinks(email, siteUrl(ctx.request));
  return json({ ok: true, message: 'If that email has orders, fresh download links are on their way.' });
}

onDaily('expireOrders', () => orders.expireOrders());

export function registerCheckout(route){
  route('POST', '/api/checkout/quote', quote);
  route('POST', '/api/checkout/order', createOrder);
  route('POST', '/api/checkout/verify', verify);
  route('POST', '/api/checkout/status', status);
  route('POST', '/api/checkout/cancel', cancel);
  route('POST', '/api/checkout/demo-pay', demoPay);
  route('POST', '/api/webhooks/razorpay', razorpayWebhook, { access: 'webhook' });
  route('GET', '/api/file/:id', fileGet);
  route('GET', '/api/download/:token', downloadGet);
  route('POST', '/api/download/:token', downloadPost, { nullOrigin: true });   // the link itself is the credential; the page's form sends Origin: null
  route('POST', '/api/download/:token/rate', ratePost, { nullOrigin: true });
  route('POST', '/api/downloads/resend', resend);
}
