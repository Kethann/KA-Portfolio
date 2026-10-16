// Invoices: one printable design for the owner (portal) and the buyer (a private link in the receipt email and on the
// download page). The buyer's link carries a signature made from the order, so invoices can't be guessed or browsed.
// Numbering is the gapless sequence set when an order is paid (INV-000001, INV-000002 ...).
// Wording follows the store's tax settings: with GST on it is a "Tax invoice" showing the GSTIN; with GST off it says
// GST is not charged because the seller is not registered (the usual case for a freelancer under the threshold).
import { env, siteUrl } from '../core/env.js';
import { hmacHex, safeEqual, randomToken } from '../core/crypto.js';
import { getDb } from '../core/db.js';
import { getSetting } from '../core/settings.js';
import { escapeHtml } from '../core/email.js';
import { formatMoney } from './pricing.js';

const TZ = 'Asia/Kolkata';
const sign = (id) => hmacHex(env('DOWNLOAD_TOKEN_SECRET', 'local-development-only'), `invoice:${id}`).slice(0, 32);
export const invoiceNumber = (n) => `INV-${String(n).padStart(6, '0')}`;
export function invoiceUrl(base, order){ return `${String(base).replace(/\/+$/, '')}/api/invoice/${encodeURIComponent(order.public_id)}?t=${sign(order.id)}`; }

// ---- amount in words (Indian numbering for rupees: lakh, crore)
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function under1000(n){
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '');
  return [h ? ONES[h] + ' hundred' : '', rest].filter(Boolean).join(' and ');
}
function indianWords(n){
  if (n === 0) return 'zero';
  const parts = [], crore = Math.floor(n / 1e7), lakh = Math.floor(n / 1e5) % 100, thousand = Math.floor(n / 1000) % 100, rest = n % 1000;
  if (crore) parts.push(indianWords(crore) + ' crore'); if (lakh) parts.push(under1000(lakh) + ' lakh'); if (thousand) parts.push(under1000(thousand) + ' thousand'); if (rest) parts.push(under1000(rest));
  return parts.join(' ');
}
function westernWords(n){
  if (n === 0) return 'zero';
  const parts = [], m = Math.floor(n / 1e6), th = Math.floor(n / 1000) % 1000, rest = n % 1000;
  if (m) parts.push(westernWords(m) + ' million'); if (th) parts.push(under1000(th) + ' thousand'); if (rest) parts.push(under1000(rest));
  return parts.join(' ');
}
export function amountInWords(minor, currency){
  const major = Math.floor(minor / 100), cents = minor % 100;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  if (currency === 'INR') return cap(`${indianWords(major)} rupees${cents ? ` and ${under1000(cents)} paise` : ''} only`);
  return cap(`${westernWords(major)} US dollars${cents ? ` and ${under1000(cents)} cents` : ''} only`);
}

export function renderInvoice(order, items, store, { owner = false, nonce = '' } = {}){
  const cur = order.currency, m = (v) => escapeHtml(formatMoney(v, cur));
  const gst = !!(store.taxEnabled && store.taxRateBp);
  let taxLabel = store.taxLabel || 'GST', taxAmount = order.tax;
  if (gst && store.taxInclusive){
    const after = order.subtotal - order.discount;
    const net = Math.floor((after * 10000 + Math.floor((10000 + store.taxRateBp) / 2)) / (10000 + store.taxRateBp));
    taxLabel = `${taxLabel} included (${store.taxRateBp / 100}%)`; taxAmount = after - net;
  } else if (gst) taxLabel = `${taxLabel} (${store.taxRateBp / 100}%)`;
  const date = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, dateStyle: 'long' }).format(new Date(order.paid_at || order.created_at));
  const sellerName = store.sellerName || env('SITE_NAME', 'Kethan Artzz');
  const method = (() => { try { const p = typeof order.payment_method === 'string' ? JSON.parse(order.payment_method) : order.payment_method; return p && (p.method || p.type) ? String(p.method || p.type).toUpperCase() : ''; } catch { return ''; } })();
  const licenseName = (k) => k ? String(k).replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' license · ' : '';
  const rows = items.map((i, k) => `<tr><td class="n">${k + 1}</td><td><b>${escapeHtml(i.title || 'Item')}</b><div class="muted">${escapeHtml(licenseName(i.license_key))}digital delivery</div></td><td class="r">1</td><td class="r">${m(i.unit_price)}</td><td class="r">${m(i.total ?? (i.unit_price - (i.discount || 0)))}</td></tr>`).join('');
  const title = gst ? 'Tax invoice' : 'Invoice';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${title} ${invoiceNumber(order.invoice_number)} · ${escapeHtml(sellerName)}</title>
<style>
*{box-sizing:border-box}:root{--f:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}body{margin:0;background:#efe9e3;color:#1d1a1c;font:14px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{max-width:820px;margin:20px auto 0;padding:0 16px;display:flex;justify-content:flex-end;gap:10px}
.bar button{border:0;border-radius:999px;padding:11px 22px;font:600 14px var(--f);font-family:inherit;color:#1a0f08;background:linear-gradient(135deg,#f0b27c,#c97a43);cursor:pointer;box-shadow:0 8px 20px -10px rgba(120,60,20,.6)}
.sheet{max-width:820px;margin:14px auto 40px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 30px 60px -30px rgba(60,30,10,.35)}
.head{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:30px 36px;background:#16121a;background-image:radial-gradient(120% 140% at 0% 0%,#3a2516 0%,#16121a 60%);color:#f6ece2}
.brand{display:flex;gap:14px;align-items:center}.mark{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,#f0b37c,#b8703c);color:#1b130d;font:800 17px/1 var(--f);letter-spacing:.04em}
.brand b{display:block;font:600 19px/1.2 Georgia,'Times New Roman',serif}.brand span{font-size:12px;color:#d8c3ae}
.doc{text-align:right}.doc h1{margin:0;font:600 28px/1.1 Georgia,serif;letter-spacing:-.01em}.doc div{font-size:13px;color:#d8c3ae;margin-top:4px}
.paid{display:inline-block;margin-top:10px;padding:4px 12px;border-radius:999px;background:rgba(111,224,168,.16);border:1px solid rgba(111,224,168,.5);color:#9ff0c4;font:700 11px/1.4 var(--f);letter-spacing:.16em}
.body{padding:28px 36px 30px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:22px}
.parties h2,.meta h2{margin:0 0 6px;font:700 10.5px/1 var(--f);letter-spacing:.16em;text-transform:uppercase;color:#9a6a44}
.parties p{margin:0;white-space:pre-line}.muted{color:#7a6f68;font-size:12.5px}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:14px 16px;border-radius:12px;background:#faf6f2;border:1px solid #efe4da;margin-bottom:22px}
.meta div{min-width:0}.meta b{display:block;font-size:13px;word-break:break-all}
table{width:100%;border-collapse:collapse}th{font:700 10.5px/1 var(--f);letter-spacing:.14em;text-transform:uppercase;color:#9a6a44;text-align:left;padding:10px 8px;border-bottom:2px solid #1d1a1c}
td{padding:12px 8px;border-bottom:1px solid #efe4da;vertical-align:top}.r{text-align:right;white-space:nowrap}.n{width:28px;color:#9a8d84}
.totals{margin:18px 0 0 auto;width:min(340px,100%)}.totals div{display:flex;justify-content:space-between;padding:6px 0;color:#4a423d}
.totals .grand{margin-top:6px;padding-top:12px;border-top:2px solid #1d1a1c;font:700 18px/1.2 var(--f);color:#1d1a1c}
.words{margin:16px 0 0;padding:12px 14px;border-radius:10px;background:#faf6f2;border:1px dashed #e2d3c5;font-size:13px}
.note{margin:22px 0 0;font-size:12.5px;color:#7a6f68}.foot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px 36px;border-top:1px solid #efe4da;font-size:12px;color:#8b817a}
.sig{text-align:right}.sig b{display:block;font:italic 500 17px/1.2 Georgia,serif;color:#1d1a1c}
@media (max-width:620px){.head,.body,.foot{padding-left:18px;padding-right:18px}.parties{grid-template-columns:1fr}.meta{grid-template-columns:1fr 1fr}.doc{text-align:left}th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4){display:none}}
@media print{body{background:#fff}.bar{display:none}.sheet{margin:0;max-width:none;box-shadow:none;border-radius:0}@page{margin:12mm}}
</style></head><body>
<div class="bar"><button type="button" id="print">Print / Save as PDF</button></div>
<main class="sheet">
<header class="head"><div class="brand"><span class="mark">${escapeHtml(sellerName.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'KA')}</span><div><b>${escapeHtml(sellerName)}</b><span>${escapeHtml(store.supportEmail || env('OWNER_EMAIL', '') || '')}</span></div></div>
<div class="doc"><h1>${title}</h1><div>${invoiceNumber(order.invoice_number)} · ${escapeHtml(date)}</div><span class="paid">PAID</span></div></header>
<section class="body">
<div class="parties">
<div><h2>From</h2><p><b>${escapeHtml(sellerName)}</b>${store.sellerAddress ? '\n' + escapeHtml(store.sellerAddress) : ''}${store.sellerTaxId ? `\n${gst ? 'GSTIN' : 'Tax ID'}: ${escapeHtml(store.sellerTaxId)}` : ''}</p></div>
<div><h2>Billed to</h2><p>${order.license_holder ? `<b>${escapeHtml(order.license_holder)}</b>\n` : ''}${escapeHtml(order.email)}${order.country ? `\n${escapeHtml(order.country)}` : ''}</p></div>
</div>
<div class="meta"><div><h2>Invoice</h2><b>${invoiceNumber(order.invoice_number)}</b></div><div><h2>Date</h2><b>${escapeHtml(date)}</b></div><div><h2>Order</h2><b>${escapeHtml(order.public_id)}</b></div><div><h2>Payment</h2><b>${escapeHtml(method || 'Online')}${order.razorpay_payment_id ? ` · ${escapeHtml(order.razorpay_payment_id)}` : ''}</b></div></div>
<table><thead><tr><th class="n">#</th><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
<div class="totals">
<div><span>Subtotal</span><span>${m(order.subtotal)}</span></div>
${order.discount ? `<div><span>Discount${order.codes ? ` (${escapeHtml(order.codes)})` : ''}</span><span>−${m(order.discount)}</span></div>` : ''}
${gst ? `<div><span>${escapeHtml(taxLabel)}</span><span>${m(taxAmount)}</span></div>` : ''}
<div class="grand"><span>Total paid</span><span>${m(order.total)}</span></div>
</div>
<p class="words"><b>Amount in words:</b> ${escapeHtml(amountInWords(order.total, cur))}</p>
<p class="note">${gst ? `${escapeHtml(store.taxLabel || 'GST')} is charged as shown above.` : 'GST is not charged: the supplier is not registered under GST.'} Digital goods, delivered by secure download link. ${owner ? '' : 'Keep this invoice for your records.'}</p>
</section>
<footer class="foot"><span>Thank you for your purchase.${store.supportEmail ? ` Questions: ${escapeHtml(store.supportEmail)}` : ''}</span><span class="sig">Authorised signatory<b>${escapeHtml(sellerName)}</b></span></footer>
</main>
<script${nonce ? ` nonce="${nonce}"` : ''}>document.getElementById('print').addEventListener('click',function(){window.print()});</script>
</body></html>`;
}

export async function loadInvoice(orderId){
  const db = await getDb();
  const order = await db.maybeOne(`select o.*, (select group_concat(c.code, ', ') from coupon_redemptions r join coupons c on c.id = r.coupon_id where r.order_id = o.id and r.status <> 'released') as codes from orders o where o.id = $1`, [orderId]);
  if (!order || !order.invoice_number) return null;
  const items = await db.query('select * from order_items where order_id = $1', [order.id]);
  return { order, items, store: await getSetting('store') };
}
export function invoiceResponse(data, { owner = false } = {}){
  const nonce = randomToken(12);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
  return new Response(renderInvoice(data.order, data.items, data.store, { owner, nonce }), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': csp, 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' } });
}

// The buyer's private link: /api/invoice/<order>?t=<signature>
export async function buyerInvoice(ctx){
  const pid = String(ctx.params.id || ''), t = ctx.url.searchParams.get('t') || '';
  const notFound = () => new Response('This invoice link is not valid.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (!/^[A-Za-z0-9-]{4,24}$/.test(pid) || !/^[0-9a-f]{32}$/.test(t)) return notFound();
  const db = await getDb();
  const row = await db.maybeOne('select id from orders where public_id = $1', [pid]);
  if (!row || !safeEqual(t, sign(row.id))) return notFound();
  const data = await loadInvoice(row.id);
  return data ? invoiceResponse(data) : notFound();
}
export { siteUrl };
