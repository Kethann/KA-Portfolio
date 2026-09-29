// Razorpay over its REST API (no SDK): create orders, fetch payments, refund, and verify the two
// kinds of signatures. Only this server ever sees RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET.
import { createHmac } from 'node:crypto';
import { env, isProduction } from '../core/env.js';
import { safeEqual } from '../core/crypto.js';

let fetchImpl = (...args) => fetch(...args);
export function setRazorpayFetch(fn){ fetchImpl = fn || ((...args) => fetch(...args)); }

export function isConfigured(){ return !!(env('RAZORPAY_KEY_ID') && env('RAZORPAY_KEY_SECRET')); }
export function mode(){ return String(env('RAZORPAY_KEY_ID') || '').startsWith('rzp_live_') ? 'live' : 'test'; }

async function call(method, path, body){
  const id = env('RAZORPAY_KEY_ID'), secret = env('RAZORPAY_KEY_SECRET');
  if (!id || !secret) throw Object.assign(new Error('Payments are not configured.'), { code: 'razorpay_not_configured' });
  // RAZORPAY_API_BASE lets local end-to-end tests point at a fake Razorpay; ignored in production.
  const base = (!isProduction() && env('RAZORPAY_API_BASE')) || 'https://api.razorpay.com';
  const res = await fetchImpl(`${base}${path}`, {
    method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok){
    const err = new Error(`Razorpay ${method} ${path.split('/').slice(0, 3).join('/')} failed (${res.status})`);
    err.status = res.status; err.code = data?.error?.code || 'razorpay_error';
    throw err;
  }
  return data;
}

// amount: integer minor units; currency: 'INR' | 'USD'; receipt: our public order id.
export function createOrder({ amount, currency, receipt, notes }){
  return call('POST', '/v1/orders', { amount, currency, receipt, notes, payment_capture: 1 });
}
export function fetchPayment(paymentId){
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(String(paymentId))) return Promise.reject(new Error('Invalid payment id.'));
  return call('GET', `/v1/payments/${paymentId}`);
}
export function refundPayment(paymentId, amount, notes){
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(String(paymentId))) return Promise.reject(new Error('Invalid payment id.'));
  return call('POST', `/v1/payments/${paymentId}/refund`, { amount, speed: 'normal', notes });
}

// Checkout handler signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret), hex.
export function verifyPaymentSignature({ orderId, paymentId, signature }){
  const secret = env('RAZORPAY_KEY_SECRET');
  if (!secret || typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature);
}

// Webhook signature: HMAC-SHA256(raw request body, webhook secret), hex. Must use the raw bytes.
export function verifyWebhookSignature(rawBody, signature){
  const secret = env('RAZORPAY_WEBHOOK_SECRET');
  if (!secret || typeof signature !== 'string' || !signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
