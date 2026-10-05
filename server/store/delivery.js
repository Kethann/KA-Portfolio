// Delivery: signed, expiring, count-limited download links for files in PRIVATE storage.
//   link  = <site>/api/download/<token>   (token: 256 random bits; only its SHA-256 is stored)
//   GET   shows a small confirmation page (so email link scanners can't use up downloads)
//   POST  (Turnstile + rate limit) counts one download atomically, logs it, and redirects to a
//         60-second signed storage URL. No permanent public file URL ever exists.
import { getDb } from '../core/db.js';
import { env } from '../core/env.js';
import { getSetting } from '../core/settings.js';
import { randomToken, sha256hex } from '../core/crypto.js';
import { sendEmail, escapeHtml } from '../core/email.js';
import { getStorage } from '../core/storage.js';
import { markdownToText } from '../core/markdown.js';
import { formatMoney } from './pricing.js';
import { ensureLicenseCode, licenseUrl, sealSvg } from './license.js';

export const SIGNED_URL_SECONDS = 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export async function issueToken(orderId, productId, channel, siteUrl){
  const db = await getDb();
  const p = await db.one('select link_ttl_hours, max_downloads from products where id = $1', [productId]);
  const token = randomToken(32);
  await db.query(`insert into download_tokens (order_id, product_id, token_hash, expires_at, max_downloads, channel)
    values ($1, $2, $3, strftime('%Y-%m-%dT%H:%M:%fZ','now','+' || $4 || ' hours'), $5, $6)`, [orderId, productId, sha256hex(token), p.link_ttl_hours, p.max_downloads, channel]);
  return `${siteUrl}/api/download/${token}`;
}

function fmtDate(d){
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d)) + ' IST';
}

export function licenseFile({ license, product, order, now = new Date(), verifyUrl = '' }){
  const body = license ? markdownToText(license.body_md) : 'Personal use only. Contact the seller for any other use.';
  return [
    `${license ? license.name : 'Personal'} license — ${product.title}`,
    `Licensed to: ${order.license_holder ? `${order.license_holder} <${order.email}>` : order.email}`,
    `Order: ${order.public_id}   Date: ${now.toISOString().slice(0, 10)}`,
    ...(order.license_code ? [`License code: ${order.license_code}`] : []),
    ...(verifyUrl ? [`Verify this license: ${verifyUrl}`] : []),
    '',
    body.trim(),
    ''
  ].join('\n');
}

// Sends one delivery email per item (with the license text and LICENSE.txt attached), then the
// receipt for paid orders. Returns true only if every email was accepted.
export async function sendDeliveryEmails(order, siteUrl){
  const db = await getDb();
  const items = await db.query(`select i.*, p.title as product_title, p.link_ttl_hours, p.max_downloads, l.name as license_name, l.body_md as license_body
    from order_items i join products p on p.id = i.product_id left join licenses l on l.key = i.license_key where i.order_id = $1 order by i.id`, [order.id]);
  let ok = true;
  const code = await ensureLicenseCode(db, order.id);
  const licensed = { ...order, license_code: code };
  for (const it of items){
    const url = await issueToken(order.id, it.product_id, 'email', siteUrl);
    const license = it.license_name ? { name: it.license_name, body_md: it.license_body } : null;
    const text = licenseFile({ license, product: { title: it.product_title }, order: licensed, verifyUrl: code ? licenseUrl(siteUrl, code) : '' });
    const res = await sendEmail({
      to: order.email, template: 'order_delivery',
      vars: { order_id: order.public_id, product_title: it.product_title, download_url: url, expires: fmtDate(Date.now() + it.link_ttl_hours * 3600000),
        max_downloads: it.max_downloads, license_name: license ? license.name : 'Personal', license_text: text },
      attachments: [{ name: 'LICENSE.txt', content: Buffer.from(text, 'utf8') }]
    });
    ok = ok && res.ok;
  }
  if (!order.is_free && order.total > 0){
    const fresh = await db.one('select * from orders where id = $1', [order.id]);
    const res = await sendReceipt(fresh, items);
    ok = ok && res.ok;
  }
  return ok;
}

export async function sendReceipt(order, items){
  const store = await getSetting('store');
  const cur = order.currency;
  const lines = items.map(i => `${i.product_title || i.title} — ${formatMoney(i.unit_price, cur)}${i.discount ? ` (−${formatMoney(i.discount, cur)})` : ''}`).join('\n');
  const afterDiscount = order.subtotal - order.discount;
  let taxLabel = store.taxLabel || 'Tax', tax = formatMoney(order.tax, cur);
  if (store.taxEnabled && store.taxInclusive && store.taxRateBp){
    const net = Math.floor((afterDiscount * 10000 + Math.floor((10000 + store.taxRateBp) / 2)) / (10000 + store.taxRateBp));
    taxLabel = `${taxLabel} included (${store.taxRateBp / 100}%)`; tax = formatMoney(afterDiscount - net, cur);
  } else if (!store.taxEnabled){ taxLabel = `${taxLabel}`; tax = formatMoney(0, cur); }
  const seller = [store.sellerName, store.sellerAddress, store.sellerTaxId ? `Tax ID: ${store.sellerTaxId}` : ''].filter(Boolean).join('\n');
  return sendEmail({
    to: order.email, template: 'order_receipt',
    vars: { invoice_number: `INV-${String(order.invoice_number).padStart(6, '0')}`, date: fmtDate(order.paid_at || order.created_at), order_id: order.public_id, email: order.email,
      lines, subtotal: formatMoney(order.subtotal, cur), discount: formatMoney(order.discount, cur), tax_label: taxLabel, tax, total: formatMoney(order.total, cur),
      payment_id: order.razorpay_payment_id || '—', seller_block: seller ? `\nSold by:\n${seller}` : '' }
  });
}

// ---- download confirmation page (server-rendered, no scripts except Turnstile) ----------------
function page(status, title, bodyHtml, { turnstile = false } = {}){
  const siteKey = env('TURNSTILE_SITE_KEY');
  const withTs = turnstile && siteKey;
  const csp = [
    "default-src 'none'", "style-src 'unsafe-inline'", "img-src 'self' data:", "base-uri 'none'", "frame-ancestors 'none'",
    "form-action 'self'",   // files are served from this same site (R2 through the Worker)
    withTs ? "script-src https://challenges.cloudflare.com" : "script-src 'none'",
    withTs ? "frame-src https://challenges.cloudflare.com" : "frame-src 'none'",
    withTs ? "connect-src https://challenges.cloudflare.com" : "connect-src 'none'"
  ].join('; ');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050506;color:#edebe8;font:16px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:20px;box-sizing:border-box}
.card{width:min(460px,100%);padding:28px;border-radius:22px;background:rgba(30,26,32,.9);border:1px solid rgba(255,255,255,.14);box-shadow:0 30px 80px rgba(0,0,0,.5)}
h1{margin:0 0 6px;font:500 26px/1.15 Georgia,serif;letter-spacing:-.01em}p{margin:0 0 14px;color:rgba(237,235,232,.72)}small{color:rgba(237,235,232,.5)}
button,a.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 26px;border-radius:999px;border:1px solid rgba(255,170,120,.55);background:linear-gradient(145deg,rgba(255,180,120,.35),rgba(200,120,70,.25));color:#fffaf5;font:600 13px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;text-decoration:none}
button:focus-visible,a:focus-visible{outline:3px solid #ff9438;outline-offset:3px}
.rate{margin-top:26px;padding-top:20px;border-top:1px solid rgba(255,255,255,.12)}.rate h2{margin:0 0 10px;font:500 19px/1.2 Georgia,serif}
.rate form{display:grid;gap:10px}.rate .ok{color:#9fe0b0}.rate small{color:rgba(237,235,232,.5)}
.stars{display:inline-flex;flex-direction:row-reverse;justify-content:flex-end;gap:4px}.stars input{position:absolute;opacity:0;width:1px;height:1px}
.stars label{font-size:32px;line-height:1;color:rgba(255,255,255,.22);cursor:pointer;transition:color .15s}
.stars input:checked~label,.stars label:hover,.stars label:hover~label{color:#ffb35c}.stars input:focus-visible+label{outline:2px solid #ff9438;border-radius:4px}
.rate textarea,.rate input[name=name]{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.25);color:#edebe8;font:inherit}
.seal{display:block;width:150px;margin:24px auto 6px}.seal svg{display:block;width:100%;height:auto}.seal-code{text-align:center;margin:0}
button.ghost{background:transparent;border-color:rgba(255,255,255,.25);justify-self:start}.ts{margin:0 0 16px}.brand{font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:#c9864f;margin-bottom:18px;display:block}
</style>${withTs ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}</head>
<body><main class="card"><span class="brand">${escapeHtml(env('SITE_NAME', 'KETHAN ARTZZ').toUpperCase())}</span>${bodyHtml.replace('{{TURNSTILE}}', withTs ? `<div class="ts cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-theme="dark"></div>` : '')}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } });
}

const RESEND_HINT = (site) => `<p><small>Need a new link? Use “Email me my download links” on the <a href="${escapeHtml(site)}/?page=store" style="color:#ffc795">store page</a>.</small></p>`;

async function lookup(token){
  if (!TOKEN_RE.test(String(token))) return { error: 'invalid' };
  const db = await getDb();
  const t = await db.maybeOne(`select t.*, o.status as order_status, o.public_id, p.title as product_title
    from download_tokens t join orders o on o.id = t.order_id join products p on p.id = t.product_id where t.token_hash = $1`, [sha256hex(token)]);
  if (!t) return { error: 'invalid' };
  if (t.revoked_at || o_blocked(t.order_status)) return { error: 'revoked', t };
  if (new Date(t.expires_at) <= new Date()) return { error: 'expired', t };
  if (t.download_count >= t.max_downloads) return { error: 'limit', t };
  return { t };
}
function o_blocked(status){ return !['paid', 'delivered'].includes(status); }

const MESSAGES = {
  invalid: ['Link not found', 'This download link isn’t valid. Check that the whole link was copied.'],
  revoked: ['Link no longer active', 'This download link was turned off. If you think that’s a mistake, reply to your order email.'],
  expired: ['Link expired', 'This download link has expired. You can get a fresh one by email.'],
  limit: ['Download limit reached', 'This link has been used the maximum number of times. You can get a fresh one by email.'],
  missing: ['File not ready', 'The file for this product isn’t available right now. Please reply to your order email and we’ll sort it out.']
};
function errorPage(kind, siteUrl, extra = ''){
  const [t, m] = MESSAGES[kind];
  return page(kind === 'invalid' ? 404 : 410, t, `<h1>${t}</h1><p>${m}</p>${kind === 'expired' || kind === 'limit' ? RESEND_HINT(siteUrl) : ''}${extra}`);
}

// ---- ratings: anyone holding a working (or used-up / expired) download link of a paid order can rate that item
async function ratingFor(t){
  const db = await getDb();
  return db.maybeOne('select rating, review, name from product_ratings where order_id = $1 and product_id = $2', [t.order_id, t.product_id]);
}
function ratingForm(token, current, thanks){
  const r = current?.rating || 0;
  const stars = [5, 4, 3, 2, 1].map(n => `<input type="radio" id="s${n}" name="rating" value="${n}"${r === n ? ' checked' : ''} required><label for="s${n}" title="${n} star${n > 1 ? 's' : ''}">★</label>`).join('');
  return `<section class="rate">${thanks ? '<p class="ok">Thanks for rating! You can change it any time from this page.</p>' : ''}
<h2>${current ? 'Your rating' : 'Rate it'}</h2>
<form method="post" action="/api/download/${escapeHtml(token)}/rate">
<div class="stars" role="radiogroup" aria-label="Your rating, 1 to 5 stars">${stars}</div>
<textarea name="review" maxlength="600" rows="3" placeholder="A few words for other buyers (optional)">${escapeHtml(current?.review || '')}</textarea>
<input name="name" maxlength="40" placeholder="Name to show (optional)" value="${escapeHtml(current?.name || '')}" autocomplete="nickname">
<button type="submit" class="ghost">${current ? 'Update rating' : 'Send rating'}</button>
<small>Only people who bought or downloaded this can rate it. Your email is never shown.</small>
</form></section>`;
}
export async function rate({ token, form, siteUrl }){
  const { t, error } = await lookup(token);
  if (!t || error === 'revoked' || error === 'invalid') return errorPage(error || 'invalid', siteUrl);
  const rating = Number(form.get('rating'));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return new Response(null, { status: 303, headers: { Location: `/api/download/${token}`, 'Cache-Control': 'no-store' } });
  const review = String(form.get('review') || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const name = String(form.get('name') || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const db = await getDb();
  await db.query(`insert into product_ratings (product_id, order_id, rating, review, name) values ($1, $2, $3, $4, $5)
    on conflict (order_id, product_id) do update set rating = excluded.rating, review = excluded.review, name = excluded.name, updated_at = now()`,
    [t.product_id, t.order_id, rating, review, name]);
  return new Response(null, { status: 303, headers: { Location: `/api/download/${token}?rated=1`, 'Cache-Control': 'no-store' } });
}

export async function downloadPage(token, siteUrl, { rated = false } = {}){
  const { t, error } = await lookup(token);
  // a used-up or expired link can still rate what was bought
  const canRate = t && (error === undefined || error === 'expired' || error === 'limit');
  const rateHtml = canRate ? ratingForm(token, await ratingFor(t), rated) : '';
  if (error) return errorPage(error, siteUrl, rateHtml);
  const left = t.max_downloads - t.download_count;
  // the license seal: scanning it (or the link) proves this purchase to anyone, without the download link
  const code = await ensureLicenseCode(await getDb(), t.order_id);
  const seal = code ? `<a class="seal" href="${escapeHtml(licenseUrl(siteUrl, code))}" aria-label="Your license ${escapeHtml(code)}: open the license check page">${sealSvg({ url: licenseUrl(siteUrl, code), code, issuer: env('SITE_NAME', 'Kethan Artzz') })}</a>
<p class="seal-code"><small>Your license seal · ${escapeHtml(code)}</small></p>` : '';
  return page(200, `Download ${t.product_title}`, `<h1>${escapeHtml(t.product_title)}</h1>
<p>Order ${escapeHtml(t.public_id)} · ${left} download${left === 1 ? '' : 's'} left · link valid until ${escapeHtml(fmtDate(t.expires_at))}</p>
<form method="post">{{TURNSTILE}}<button type="submit">Download</button></form>${seal}${rateHtml}`, { turnstile: true });
}

// Counts one download (atomic: never above the limit) and redirects to a short-lived signed URL.
export async function redeem({ token, ip, country, userAgent, siteUrl }){
  const pre = await lookup(token);
  if (pre.error) return errorPage(pre.error, siteUrl);
  const db = await getDb();
  const file = await db.maybeOne('select storage_path, filename from product_files where product_id = $1 and is_current', [pre.t.product_id]);
  if (!file) return errorPage('missing', siteUrl);
  // one atomic statement: counted only while the link is live, under its limit and the order is still paid
  const counted = await db.maybeOne(`update download_tokens set download_count = download_count + 1
    where token_hash = $1 and revoked_at is null and expires_at > now() and download_count < max_downloads
      and exists (select 1 from orders o where o.id = download_tokens.order_id and o.status in ('paid','delivered'))
    returning id, order_id, product_id`, [sha256hex(token)]);
  if (!counted){
    const again = await lookup(token);   // why not: refunded/revoked, expired, or the limit was just reached
    return errorPage(again.error === 'revoked' ? 'revoked' : again.error === 'expired' ? 'expired' : 'limit', siteUrl);
  }
  await db.query('insert into download_events (token_id, order_id, product_id, ip, country, user_agent) values ($1,$2,$3,$4,$5,$6)',
    [counted.id, counted.order_id, counted.product_id, ip, country, String(userAgent || '').slice(0, 300)]).catch(() => {});   // the log never blocks a download
  const url = await getStorage().signedUrl('deliverables', file.storage_path, SIGNED_URL_SECONDS, file.filename);
  return new Response(null, { status: 303, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

// "Email me my download links": fresh links for every paid order on that email. The reply is
// the same whether or not orders exist, so it can't be used to discover buyers.
export async function resendLinks(email, siteUrl){
  const db = await getDb();
  const items = await db.query(`select o.id as order_id, o.public_id, i.product_id, p.title from orders o
    join order_items i on i.order_id = o.id join products p on p.id = i.product_id
    where o.email = $1 and o.status in ('paid','delivered') order by o.created_at desc limit 20`, [email]);
  if (!items.length) return { sent: false };
  const lines = [];
  let ttl = 48;
  for (const it of items){
    const url = await issueToken(it.order_id, it.product_id, 'resend', siteUrl);
    const p = await db.one('select link_ttl_hours from products where id = $1', [it.product_id]);
    ttl = Math.min(ttl, p.link_ttl_hours);
    lines.push(`${it.title} (order ${it.public_id}):\n${url}`);
  }
  await sendEmail({ to: email, template: 'resend_link', vars: { links: lines.join('\n\n'), expires: fmtDate(Date.now() + ttl * 3600000) } });
  return { sent: true };
}
