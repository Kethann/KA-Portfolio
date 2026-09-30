// Portal: overview, orders, coupons, downloads, reports. Money stays in integer minor units per
// currency (never summed across currencies). Dates are grouped in Asia/Kolkata.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { siteUrl, env } from '../core/env.js';
import { getSetting } from '../core/settings.js';
import { sendEmail, escapeHtml } from '../core/email.js';
import { str, int, bool, uuid as vUuid } from '../core/validate.js';
import { formatMoney } from '../store/pricing.js';
import { refundOrder } from '../store/orders.js';
import { issueToken, sendReceipt } from '../store/delivery.js';
import { onDaily, onWeekly } from '../jobs/hooks.js';
import { mapDbError } from './catalog.js';
import { audit } from './auth.js';

const TZ = 'Asia/Kolkata';

// "YYYY-MM-DD" (IST) date range -> UTC instants; defaults to the last 30 days
export function range(url){
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : today;
  let from = url.searchParams.get('from');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')){ const d = new Date(`${to}T00:00:00+05:30`); d.setUTCDate(d.getUTCDate() - 29); from = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); }
  const start = new Date(`${from}T00:00:00+05:30`), end = new Date(`${to}T00:00:00+05:30`);
  end.setUTCDate(end.getUTCDate() + 1);
  if (!(start < end) || end - start > 800 * 864e5) throw new HttpError(400, 'Choose a date range of up to about two years.');
  return { from, to, start, end };
}

// CSV cell: quoted, and a leading = + - @ neutralised so spreadsheets never run it as a formula
export function csvCell(v){
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function csv(rows, columns){
  return '﻿' + [columns.map(c => csvCell(c.label)).join(','), ...rows.map(r => columns.map(c => csvCell(c.get(r))).join(','))].join('\r\n');
}
function csvResponse(body, name){
  return new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
const PAID = `('paid','delivered','refunded')`;

// ---- overview ------------------------------------------------------------------------------------
export async function overview(ctx){
  const { from, to, start, end } = range(ctx.url);
  const db = await getDb();
  const revenue = await db.query(`select currency, coalesce(sum(total),0)::bigint as gross, coalesce(sum(coalesce(refund_amount,0)) filter (where status='refunded'),0)::bigint as refunded, count(*)::int as orders
    from orders where status in ${PAID} and not is_free and paid_at >= $1 and paid_at < $2 group by currency`, [start, end]);
  const counts = await db.one(`select
      count(*) filter (where status in ${PAID})::int as paid,
      count(*) filter (where is_free and status in ${PAID})::int as free,
      count(*) filter (where status = 'failed')::int as failed,
      count(*) filter (where status = 'mismatch')::int as mismatch,
      count(*)::int as started
    from orders where created_at >= $1 and created_at < $2`, [start, end]);
  const failedAttempts = (await db.one(`select count(*)::int as n from order_events where type = 'payment_failed' and created_at >= $1 and created_at < $2`, [start, end])).n;
  const top = await db.query(`select i.product_id, i.title, o.currency, count(*)::int as sold, sum(i.total)::bigint as revenue
    from order_items i join orders o on o.id = i.order_id where o.status in ('paid','delivered') and o.paid_at >= $1 and o.paid_at < $2
    group by i.product_id, i.title, o.currency order by sold desc, revenue desc limit 8`, [start, end]);
  const series = await db.query(`select to_char(date_trunc('day', paid_at at time zone '${TZ}'), 'YYYY-MM-DD') as day, currency, sum(total)::bigint as revenue, count(*)::int as orders
    from orders where status in ('paid','delivered') and not is_free and paid_at >= $1 and paid_at < $2 group by 1, 2 order by 1`, [start, end]);
  const visitors = await db.one(`select count(distinct session_id)::int as sessions from visits where visited_at >= $1 and visited_at < $2 and not is_bot`, [start, end]);
  const live = await db.one(`select count(distinct session_id)::int as n from visits where last_seen_at > now() - interval '5 minutes' and not is_bot`);
  // `target` is what the portal opens when the line is clicked (the order or message itself)
  const activity = await db.query(`(select 'order' as kind, e.type as what, o.public_id as ref, o.email as who, e.created_at as at, o.id::text as target from order_events e join orders o on o.id = e.order_id
        where e.type in ('paid','delivered','refunded','payment_failed','mismatch','delivery_email_failed','refund_requested') order by e.created_at desc limit 12)
    union all (select 'message', status, subject, email, created_at, id::text from messages where status <> 'spam' order by created_at desc limit 6)
    union all (select 'signup', topic, topic, email, created_at, null from notify_signups order by created_at desc limit 4)
    order by at desc limit 15`);
  return json({ from, to, revenue, counts: { ...counts, failedAttempts }, conversion: counts.started ? Math.round((counts.paid / counts.started) * 1000) / 10 : null,
    top, series, visitors: visitors.sessions, liveVisitors: live.n, activity });
}

// ---- orders --------------------------------------------------------------------------------------
function orderFilters(url){
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };
  const status = url.searchParams.get('status');
  if (status === 'attention') where.push(`(o.status = 'mismatch' or (o.status = 'paid' and o.paid_at < now() - interval '30 minutes'))`);
  else if (status && /^[a-z]{3,12}$/.test(status)) add('o.status = ?', status);
  const cur = url.searchParams.get('currency');
  if (cur === 'INR' || cur === 'USD') add('o.currency = ?', cur);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  if (q){ args.push(`%${q.toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m)}%`); const i = args.length; where.push(`(lower(o.email) like $${i} or lower(o.public_id) like $${i} or lower(coalesce(o.razorpay_payment_id,'')) like $${i} or lower(coalesce(o.razorpay_order_id,'')) like $${i})`); }
  if (url.searchParams.get('from') || url.searchParams.get('to')){ const r = range(url); add('o.created_at >= ?', r.start); add('o.created_at < ?', r.end); }
  return { where: where.length ? `where ${where.join(' and ')}` : '', args };
}
const ORDER_ROW = `select o.id, o.public_id, o.email, o.currency, o.subtotal, o.discount, o.tax, o.total, o.status, o.is_free, o.invoice_number, o.country,
  o.created_at, o.paid_at, o.delivered_at, o.refunded_at, o.razorpay_payment_id, o.refund_id, o.payment_method,
  o.signature_verified_at, o.api_verified_at, o.captured_at, o.refund_amount,   -- the order screen's Verified and Refunded rows
  (select string_agg(i.title, ', ') from order_items i where i.order_id = o.id) as items,
  (select string_agg(c.code, ', ') from coupon_redemptions r join coupons c on c.id = r.coupon_id where r.order_id = o.id and r.status <> 'released') as codes
  from orders o`;

export async function listOrders(ctx){
  const { where, args } = orderFilters(ctx.url);
  const limit = Math.min(200, Math.max(1, Number(ctx.url.searchParams.get('limit')) || 50));
  const offset = Math.max(0, Number(ctx.url.searchParams.get('offset')) || 0);
  const db = await getDb();
  const rows = await db.query(`${ORDER_ROW} ${where} order by o.created_at desc limit ${limit + 1} offset ${offset}`, args);
  const total = (await db.one(`select count(*)::int as n from orders o ${where}`, args)).n;
  return json({ orders: rows.slice(0, limit), total, hasMore: rows.length > limit });
}

// "Visa •••• 4242", "UPI", "Net banking · HDFC", "Wallet · Paytm" (same wording as the portal)
export function methodLabel(m){
  if (!m || typeof m !== 'object') return '';
  if (m.type === 'card') return `${m.network || 'Card'}${m.last4 ? ` •••• ${m.last4}` : ''}`;
  const name = { upi: 'UPI', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay later' }[m.type] || String(m.type || '');
  return m.detail ? `${name} · ${m.detail}` : name;
}
export async function ordersCsv(ctx){
  const { where, args } = orderFilters(ctx.url);
  const db = await getDb();
  const rows = await db.query(`${ORDER_ROW} ${where} order by o.created_at desc limit 20000`, args);
  const cols = [
    { label: 'Order', get: r => r.public_id }, { label: 'Created (UTC)', get: r => r.created_at }, { label: 'Status', get: r => r.status }, { label: 'Email', get: r => r.email },
    { label: 'Paid with', get: r => methodLabel(r.payment_method) },
    { label: 'Items', get: r => r.items }, { label: 'Currency', get: r => r.currency }, { label: 'Subtotal', get: r => (r.subtotal / 100).toFixed(2) },
    { label: 'Discount', get: r => (r.discount / 100).toFixed(2) }, { label: 'Tax', get: r => (r.tax / 100).toFixed(2) }, { label: 'Total', get: r => (r.total / 100).toFixed(2) },
    { label: 'Codes', get: r => r.codes }, { label: 'Invoice', get: r => r.invoice_number ? `INV-${String(r.invoice_number).padStart(6, '0')}` : '' },
    { label: 'Payment ID', get: r => r.razorpay_payment_id }, { label: 'Country', get: r => r.country }, { label: 'Paid (UTC)', get: r => r.paid_at }, { label: 'Refunded (UTC)', get: r => r.refunded_at }
  ];
  return csvResponse(csv(rows, cols), `orders-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function getOrder(ctx){
  const db = await getDb();
  const o = await db.maybeOne(`${ORDER_ROW} where o.id::text = $1 or o.public_id = $1`, [ctx.params.id]);
  if (!o) throw new HttpError(404, 'Order not found.');
  const [items, events, downloads, links] = await Promise.all([
    db.query('select i.*, p.slug from order_items i left join products p on p.id = i.product_id where i.order_id = $1 order by i.id', [o.id]),
    db.query('select type, data, created_at from order_events where order_id = $1 order by id', [o.id]),
    db.query(`select e.created_at, e.ip, e.country, e.user_agent, p.title from download_events e left join products p on p.id = e.product_id where e.order_id = $1 order by e.created_at desc`, [o.id]),
    db.query(`select t.id, t.channel, t.created_at, t.expires_at, t.max_downloads, t.download_count, t.revoked_at, p.title from download_tokens t join products p on p.id = t.product_id where t.order_id = $1 order by t.created_at desc`, [o.id])
  ]);
  const full = await db.one('select * from orders where id = $1', [o.id]);
  return json({ order: { ...o, ip: full.ip, captured_at: full.captured_at, signature_verified_at: full.signature_verified_at, api_verified_at: full.api_verified_at, refund_amount: full.refund_amount, expires_at: full.expires_at },
    items, events, downloads, links: links.map(l => ({ ...l, state: l.revoked_at ? 'revoked' : new Date(l.expires_at) < new Date() ? 'expired' : l.download_count >= l.max_downloads ? 'used up' : 'active' })) });
}

export async function resendOrder(ctx){
  const db = await getDb();
  const o = await db.maybeOne('select * from orders where id::text = $1', [ctx.params.id]);
  if (!o) throw new HttpError(404, 'Order not found.');
  if (!['paid', 'delivered'].includes(o.status)) throw new HttpError(409, 'Only paid orders can get download links.');
  const items = await db.query('select i.product_id, i.title, p.link_ttl_hours from order_items i join products p on p.id = i.product_id where i.order_id = $1', [o.id]);
  if (!items.length) throw new HttpError(409, 'This order has no downloadable items.');
  const base = siteUrl(ctx.request);
  const lines = [];
  for (const it of items) lines.push(`${it.title}:\n${await issueToken(o.id, it.product_id, 'portal', base)}`);
  const ttl = Math.min(...items.map(i => i.link_ttl_hours));
  const expires = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(Date.now() + ttl * 3600e3)) + ' IST';
  const res = await sendEmail({ to: o.email, template: 'resend_link', vars: { links: lines.join('\n\n'), expires } });
  await db.query('insert into order_events (order_id, type, data) values ($1, $2, $3)', [o.id, res.ok ? 'links_resent' : 'links_resend_failed', {}]);
  if (res.ok && o.status === 'paid') await db.query(`update orders set status = 'delivered', delivered_at = now() where id = $1 and status = 'paid'`, [o.id]);
  await audit(ctx, 'order_links_resent', o.public_id);
  if (!res.ok) throw new HttpError(502, 'The email couldn’t be sent. Check Settings → Email.');
  return json({ ok: true });
}

export async function resendReceipt(ctx){
  const db = await getDb();
  const o = await db.maybeOne('select * from orders where id::text = $1', [ctx.params.id]);
  if (!o || o.is_free || !o.invoice_number) throw new HttpError(404, 'This order has no receipt.');
  const items = await db.query('select i.*, i.title as product_title from order_items i where i.order_id = $1', [o.id]);
  const res = await sendReceipt(o, items);
  if (!res.ok) throw new HttpError(502, 'The email couldn’t be sent. Check Settings → Email.');
  return json({ ok: true });
}

export async function refund(ctx){
  const b = await readJson(ctx.request, 4096);
  const amount = b.amount === undefined || b.amount === null ? undefined : int(b.amount, { name: 'Amount', min: 1, max: 1e9 });
  const r = await refundOrder(vUuid(ctx.params.id, 'Order'), { amount, allowAfterDownload: b.confirmAfterDownload === true, reason: str(b.reason, { max: 200 }) });
  await audit(ctx, 'order_refund_requested', ctx.params.id, { amount: r.amount });
  return json({ ok: true, ...r });
}

export async function revokeLink(ctx){
  const db = await getDb();
  await db.query('update download_tokens set revoked_at = coalesce(revoked_at, now()) where id::text = $1', [ctx.params.id]);
  await audit(ctx, 'link_revoked', ctx.params.id);
  return json({ ok: true });
}

// Printable invoice (browser "Save as PDF").
export async function invoice(ctx){
  const db = await getDb();
  const o = await db.maybeOne('select * from orders where id::text = $1', [ctx.params.id]);
  if (!o || !o.invoice_number) throw new HttpError(404, 'This order has no invoice.');
  const items = await db.query('select * from order_items where order_id = $1', [o.id]);
  const store = await getSetting('store');
  const cur = o.currency, m = (v) => escapeHtml(formatMoney(v, cur));
  // Same wording as the emailed receipt: inclusive tax is shown as the part of the total that is tax.
  let taxLabel = store.taxLabel || 'Tax', taxText = formatMoney(o.tax, cur);
  if (store.taxEnabled && store.taxInclusive && store.taxRateBp){
    const after = o.subtotal - o.discount;
    const net = Math.floor((after * 10000 + Math.floor((10000 + store.taxRateBp) / 2)) / (10000 + store.taxRateBp));
    taxLabel = `${taxLabel} included (${store.taxRateBp / 100}%)`; taxText = formatMoney(after - net, cur);
  }
  const date = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, dateStyle: 'long' }).format(new Date(o.paid_at || o.created_at));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice INV-${String(o.invoice_number).padStart(6, '0')}</title><meta name="robots" content="noindex">
<style>body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d1a1c;max-width:760px;margin:40px auto;padding:0 24px}h1{font:600 26px Georgia,serif;margin:0}
table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:8px 6px;border-bottom:1px solid #e6dcd3;text-align:left}td.r,th.r{text-align:right}.muted{color:#7a6f68}
.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.tot td{font-weight:700}@media print{button{display:none}body{margin:0}}</style></head><body>
<button onclick="print()" style="float:right">Print / Save as PDF</button>
<div class="top"><div><h1>Invoice</h1><div class="muted">INV-${String(o.invoice_number).padStart(6, '0')} · ${escapeHtml(date)}</div></div>
<div><strong>${escapeHtml(store.sellerName || env('SITE_NAME', 'Kethan Artzz'))}</strong><br>${escapeHtml(store.sellerAddress || '').replace(/\n/g, '<br>')}${store.sellerTaxId ? `<br>Tax ID: ${escapeHtml(store.sellerTaxId)}` : ''}</div></div>
<p><strong>Billed to</strong><br>${escapeHtml(o.email)}<br><span class="muted">Order ${escapeHtml(o.public_id)} · Payment ${escapeHtml(o.razorpay_payment_id || '')}</span></p>
<table><thead><tr><th>Item</th><th class="r">Price</th><th class="r">Discount</th><th class="r">Amount</th></tr></thead><tbody>
${items.map(i => `<tr><td>${escapeHtml(i.title)}${i.license_key ? ` <span class="muted">(${escapeHtml(i.license_key)} license)</span>` : ''}</td><td class="r">${m(i.unit_price)}</td><td class="r">${m(i.discount)}</td><td class="r">${m(i.total)}</td></tr>`).join('')}
</tbody><tfoot><tr><td colspan="3" class="r">Subtotal</td><td class="r">${m(o.subtotal)}</td></tr><tr><td colspan="3" class="r">Discount</td><td class="r">−${m(o.discount)}</td></tr>
<tr><td colspan="3" class="r">${escapeHtml(taxLabel)}</td><td class="r">${escapeHtml(taxText)}</td></tr><tr class="tot"><td colspan="3" class="r">Total paid (${cur})</td><td class="r">${m(o.total)}</td></tr></tfoot></table>
${o.status === 'refunded' ? `<p><strong>Refunded</strong> ${m(o.refund_amount || o.total)}</p>` : ''}</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'self'" } });
}

// ---- coupons -------------------------------------------------------------------------------------
function couponInput(b){
  const code = str(b.code, { name: 'Code', max: 32, required: true }).toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new HttpError(400, 'Codes use 3–32 letters, numbers, - or _.');
  const kind = b.kind === 'fixed' ? 'fixed' : 'percent';
  const opt = (v, name, max) => (v === null || v === undefined || v === '' ? null : int(v, { name, min: 1, max }));
  const currencies = Array.isArray(b.currencies) ? [...new Set(b.currencies.filter(c => c === 'INR' || c === 'USD'))] : ['INR', 'USD'];
  const appliesTo = ['all', 'products', 'category', 'artzz', 'artifacts'].includes(b.appliesTo) ? b.appliesTo : 'all';
  const d = (v) => { if (!v) return null; const x = new Date(String(v)); if (Number.isNaN(x.getTime())) throw new HttpError(400, 'Dates must be valid.'); return x; };
  return {
    code, description: str(b.description, { max: 200 }), kind,
    percent_bp: kind === 'percent' ? int(b.percentBp, { name: 'Percentage', min: 1, max: 10000 }) : null,
    amount_inr: kind === 'fixed' ? opt(b.amountInr, 'INR amount', 1e9) : null, amount_usd: kind === 'fixed' ? opt(b.amountUsd, 'USD amount', 1e9) : null,
    currencies, starts_at: d(b.startsAt), ends_at: d(b.endsAt),
    max_uses: opt(b.maxUses, 'Total uses', 1e7), per_email_limit: opt(b.perEmailLimit, 'Uses per email', 1000), first_order_only: bool(b.firstOrderOnly),
    min_order_inr: b.minOrderInr ? int(b.minOrderInr, { name: 'Minimum (INR)', min: 0, max: 1e9 }) : 0, min_order_usd: b.minOrderUsd ? int(b.minOrderUsd, { name: 'Minimum (USD)', min: 0, max: 1e9 }) : 0,
    max_discount_inr: opt(b.maxDiscountInr, 'Maximum discount (INR)', 1e9), max_discount_usd: opt(b.maxDiscountUsd, 'Maximum discount (USD)', 1e9),
    applies_to: appliesTo, product_ids: appliesTo === 'products' ? (Array.isArray(b.productIds) ? b.productIds.slice(0, 200).map(x => vUuid(x, 'Product')) : []) : [],
    category_id: appliesTo === 'category' && b.categoryId ? vUuid(b.categoryId, 'Category') : null,
    stackable: bool(b.stackable), paused: bool(b.paused)
  };
}
export async function listCoupons(){
  const db = await getDb();
  const rows = await db.query(`select c.*, (select count(*)::int from coupon_redemptions r where r.coupon_id = c.id and r.status = 'confirmed') as confirmed_uses,
    (select json_agg(json_build_object('currency', x.currency, 'discount', x.s)) from (select currency, sum(amount)::bigint as s from coupon_redemptions r where r.coupon_id = c.id and r.status = 'confirmed' group by currency) x) as given
    from coupons c order by c.created_at desc`);
  return json({ coupons: rows });
}
export async function saveCoupon(ctx){
  const v = couponInput(await readJson(ctx.request, 16 * 1024));
  const db = await getDb();
  const cols = Object.keys(v);
  try {
    if (ctx.params.id) await db.query(`update coupons set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id::text = $1`, [ctx.params.id, ...cols.map(c => v[c])]);
    else await db.query(`insert into coupons (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, cols.map(c => v[c]));
  } catch (err){ throw mapDbError(err) || err; }
  await audit(ctx, 'coupon_saved', v.code);
  return listCoupons();
}
export async function pauseCoupon(ctx){
  const b = await readJson(ctx.request, 1024);
  const db = await getDb();
  await db.query('update coupons set paused = $2 where id::text = $1', [ctx.params.id, !!b.paused]);
  await audit(ctx, b.paused ? 'coupon_paused' : 'coupon_resumed', ctx.params.id);
  return listCoupons();
}
export async function deleteCoupon(ctx){
  const db = await getDb();
  const used = await db.maybeOne(`select 1 from coupon_redemptions where coupon_id::text = $1 and status <> 'released'`, [ctx.params.id]);
  if (used) throw new HttpError(409, 'This code has been used, so it can only be paused (its history stays in reports).');
  await db.query('delete from coupons where id::text = $1', [ctx.params.id]);
  return listCoupons();
}
export async function couponUsage(ctx){
  const db = await getDb();
  const rows = await db.query(`select r.status, r.amount, r.currency, r.email, r.created_at, o.public_id, o.id as order_id from coupon_redemptions r join orders o on o.id = r.order_id
    where r.coupon_id::text = $1 order by r.created_at desc limit 500`, [ctx.params.id]);
  return json({ uses: rows });
}

// ---- downloads -----------------------------------------------------------------------------------
export async function downloads(ctx){
  const db = await getDb();
  const limit = Math.min(500, Number(ctx.url.searchParams.get('limit')) || 200);
  const events = await db.query(`select e.created_at, e.ip, e.country, e.user_agent, p.title, o.public_id, o.email, o.id as order_id
    from download_events e left join products p on p.id = e.product_id left join orders o on o.id = e.order_id order by e.created_at desc limit ${limit}`);
  const links = await db.query(`select t.id, t.channel, t.created_at, t.expires_at, t.max_downloads, t.download_count, t.revoked_at, p.title, o.public_id, o.email, o.id as order_id
    from download_tokens t join products p on p.id = t.product_id join orders o on o.id = t.order_id order by t.created_at desc limit ${limit}`);
  return json({ events, links: links.map(l => ({ ...l, state: l.revoked_at ? 'revoked' : new Date(l.expires_at) < new Date() ? 'expired' : l.download_count >= l.max_downloads ? 'used up' : 'active' })) });
}

// ---- reports -------------------------------------------------------------------------------------
export async function reportData(url){
  const { from, to, start, end } = range(url);
  const group = ['day', 'week', 'month'].includes(url.searchParams.get('group')) ? url.searchParams.get('group') : 'day';
  const db = await getDb();
  const p = [start, end];
  const [byPeriod, byProduct, byCurrency, byCountry, coupons, refunds, dls] = await Promise.all([
    db.query(`select to_char(date_trunc('${group}', paid_at at time zone '${TZ}'), 'YYYY-MM-DD') as period, currency, count(*)::int as orders, sum(total)::bigint as revenue
      from orders where status in ('paid','delivered') and not is_free and paid_at >= $1 and paid_at < $2 group by 1, 2 order by 1`, p),
    db.query(`select i.title, o.currency, count(*)::int as sold, sum(i.total)::bigint as revenue from order_items i join orders o on o.id = i.order_id
      where o.status in ('paid','delivered') and o.paid_at >= $1 and o.paid_at < $2 group by 1, 2 order by revenue desc nulls last`, p),
    db.query(`select currency, count(*)::int as orders, sum(total)::bigint as revenue, sum(discount)::bigint as discounts from orders
      where status in ('paid','delivered') and not is_free and paid_at >= $1 and paid_at < $2 group by 1`, p),
    db.query(`select coalesce(country, '—') as country, currency, count(*)::int as orders, sum(total)::bigint as revenue from orders
      where status in ('paid','delivered') and paid_at >= $1 and paid_at < $2 group by 1, 2 order by orders desc limit 50`, p),
    db.query(`select c.code, r.currency, count(*)::int as uses, sum(r.amount)::bigint as discount from coupon_redemptions r join coupons c on c.id = r.coupon_id join orders o on o.id = r.order_id
      where r.status = 'confirmed' and o.paid_at >= $1 and o.paid_at < $2 group by 1, 2 order by uses desc`, p),
    db.query(`select currency, count(*)::int as refunds, sum(coalesce(refund_amount, total))::bigint as amount from orders where status = 'refunded' and refunded_at >= $1 and refunded_at < $2 group by 1`, p),
    db.query(`select coalesce(pr.title, '—') as title, count(*)::int as downloads from download_events e left join products pr on pr.id = e.product_id
      where e.created_at >= $1 and e.created_at < $2 group by 1 order by downloads desc`, p)
  ]);
  return { from, to, group, byPeriod, byProduct, byCurrency, byCountry, coupons, refunds, downloads: dls };
}
export async function reports(ctx){ return json(await reportData(ctx.url)); }
export async function reportsCsv(ctx){
  const r = await reportData(ctx.url);
  const rows = [
    ...r.byPeriod.map(x => ({ section: 'Revenue by period', key: x.period, currency: x.currency, count: x.orders, amount: x.revenue })),
    ...r.byProduct.map(x => ({ section: 'By product', key: x.title, currency: x.currency, count: x.sold, amount: x.revenue })),
    ...r.byCountry.map(x => ({ section: 'By country', key: x.country, currency: x.currency, count: x.orders, amount: x.revenue })),
    ...r.coupons.map(x => ({ section: 'Coupons', key: x.code, currency: x.currency, count: x.uses, amount: x.discount })),
    ...r.refunds.map(x => ({ section: 'Refunds', key: '', currency: x.currency, count: x.refunds, amount: x.amount })),
    ...r.downloads.map(x => ({ section: 'Downloads', key: x.title, currency: '', count: x.downloads, amount: null }))
  ];
  return csvResponse(csv(rows, [{ label: 'Section', get: x => x.section }, { label: 'Item', get: x => x.key }, { label: 'Currency', get: x => x.currency },
    { label: 'Count', get: x => x.count }, { label: 'Amount', get: x => x.amount === null ? '' : (Number(x.amount) / 100).toFixed(2) }]), `report-${r.from}-to-${r.to}.csv`);
}

// Scheduled report emails (Settings → Reports).
export async function sendScheduledReport(period){
  const settings = await getSetting('reports');
  if (period === 'Daily' ? !settings.daily : !settings.weekly) return 'off';
  const to = settings.email || env('OWNER_EMAIL');
  if (!to) return 'no recipient';
  const days = period === 'Daily' ? 1 : 7;
  const end = new Date(), startDay = new Date(end.getTime() - days * 864e5);
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
  const u = new URL(`http://x/?from=${fmt(startDay)}&to=${fmt(new Date(end.getTime() - 864e5))}`);
  const r = await reportData(u);
  const money = r.byCurrency.map(c => `${formatMoney(Number(c.revenue), c.currency)} from ${c.orders} order(s)`).join(' and ') || 'No sales';
  const top = r.byProduct.slice(0, 5).map(p => `• ${p.title}: ${p.sold} sold (${formatMoney(Number(p.revenue), p.currency)})`).join('\n');
  const summary = `${r.from} to ${r.to}\n\nRevenue: ${money}\nRefunds: ${r.refunds.map(x => `${x.refunds} (${formatMoney(Number(x.amount), x.currency)})`).join(', ') || 'none'}\nDownloads: ${r.downloads.reduce((s, d) => s + d.downloads, 0)}\n\nTop items:\n${top || '—'}`;
  const res = await sendEmail({ to, template: 'report', vars: { period, summary, portal_url: `${(env('PUBLIC_SITE_URL') || '').replace(/\/+$/, '')}/portal/#reports` } });
  return res.ok ? 'sent' : 'failed';
}
onDaily('dailyReport', () => sendScheduledReport('Daily'));
onWeekly('weeklyReport', () => sendScheduledReport('Weekly'));

export function registerSales(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/overview', overview, a);
  route('GET', '/api/admin/orders', listOrders, a);
  route('GET', '/api/admin/orders.csv', ordersCsv, a);
  route('GET', '/api/admin/orders/:id', getOrder, a);
  route('POST', '/api/admin/orders/:id/resend', resendOrder, a);
  route('POST', '/api/admin/orders/:id/receipt', resendReceipt, a);
  route('POST', '/api/admin/orders/:id/refund', refund, a);
  route('GET', '/api/admin/orders/:id/invoice', invoice, a);
  route('POST', '/api/admin/links/:id/revoke', revokeLink, a);
  route('GET', '/api/admin/coupons', listCoupons, a);
  route('POST', '/api/admin/coupons', saveCoupon, a);
  route('PUT', '/api/admin/coupons/:id', saveCoupon, a);
  route('POST', '/api/admin/coupons/:id/pause', pauseCoupon, a);
  route('DELETE', '/api/admin/coupons/:id', deleteCoupon, a);
  route('GET', '/api/admin/coupons/:id/uses', couponUsage, a);
  route('GET', '/api/admin/downloads', downloads, a);
  route('GET', '/api/admin/reports', reports, a);
  route('GET', '/api/admin/reports.csv', reportsCsv, a);
}
