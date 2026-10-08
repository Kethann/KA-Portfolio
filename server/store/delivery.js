// Delivery: signed, expiring, count-limited download links for files in PRIVATE storage.
//   link  = <site>/api/download/<token>   (token: 256 random bits; only its SHA-256 is stored)
//   GET   shows a small confirmation page (so email link scanners can't use up downloads)
//   POST  (Turnstile + rate limit) counts one download atomically, logs it, and redirects to a
//         60-second signed storage URL. No permanent public file URL ever exists.
import { getDb } from '../core/db.js';
import { json } from '../core/http.js';
import { env } from '../core/env.js';
import { getSetting } from '../core/settings.js';
import { randomToken, sha256hex } from '../core/crypto.js';
import { sendEmail, escapeHtml } from '../core/email.js';
import { getStorage } from '../core/storage.js';
import { markdownToText } from '../core/markdown.js';
import { formatMoney } from './pricing.js';
import { ensureLicenseCode, licenseUrl, sealSvg } from './license.js';
import { signedFileUrl } from './drive.js';

export const SIGNED_URL_SECONDS = 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** the link lifetime (hours) and download limit that apply to a product: the store-wide default from the portal, unless the product set its own */
export function termsFor(product, store){
  if (product.delivery_custom) return { hours: product.link_ttl_hours, max: product.max_downloads };
  return { hours: Number(store.downloadLinkHours) || product.link_ttl_hours || 48, max: Number(store.downloadMaxDownloads) || product.max_downloads || 5 };
}
export async function productTerms(db, productId){
  const [p, store] = await Promise.all([db.one('select link_ttl_hours, max_downloads, delivery_custom from products where id = $1', [productId]), getSetting('store')]);
  return termsFor(p, store);
}

export async function issueToken(orderId, productId, channel, siteUrl){
  const db = await getDb();
  const p = await productTerms(db, productId).then(t => ({ link_ttl_hours: t.hours, max_downloads: t.max }));
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
// What the owner set for one product in the portal (Products > Delivery email): an extra message, a subject and files to attach.
export async function deliveryExtras(productId){
  const map = (await getSetting('deliveryEmails')) || {};
  const cfg = map[productId] || {};
  const files = [];
  for (const a of Array.isArray(cfg.attachments) ? cfg.attachments : []){
    try { files.push({ name: a.name, content: await getStorage().get('deliverables', a.path) }); }
    catch { /* a missing file must never stop the buyer's email: it is skipped */ }
  }
  return { subject: typeof cfg.subject === 'string' ? cfg.subject : '', note: typeof cfg.note === 'string' ? cfg.note : '', files };
}

export async function sendDeliveryEmails(order, siteUrl){
  const db = await getDb();
  const store = await getSetting('store');
  const items = await db.query(`select i.*, p.title as product_title, p.summary as product_summary, p.version as product_version, p.link_ttl_hours, p.max_downloads, p.delivery_custom, l.name as license_name, l.body_md as license_body
    from order_items i join products p on p.id = i.product_id left join licenses l on l.key = i.license_key where i.order_id = $1 order by i.id`, [order.id]);
  let ok = true;
  const code = await ensureLicenseCode(db, order.id);
  const licensed = { ...order, license_code: code };
  for (const it of items){
    const url = await issueToken(order.id, it.product_id, 'email', siteUrl);
    const license = it.license_name ? { name: it.license_name, body_md: it.license_body } : null;
    const text = licenseFile({ license, product: { title: it.product_title }, order: licensed, verifyUrl: code ? licenseUrl(siteUrl, code) : '' });
    const extra = await deliveryExtras(it.product_id);
    const terms = termsFor(it, store);
    const res = await sendEmail({
      to: order.email, template: 'order_delivery', subjectOverride: extra.subject || undefined,
      vars: { order_id: order.public_id, product_title: it.product_title, download_url: url, expires: fmtDate(Date.now() + terms.hours * 3600000),
        max_downloads: terms.max, license_name: license ? license.name : 'Personal', license_text: text, extra_note: extra.note,
        product_summary: it.product_summary || '', product_version: it.product_version || '' },
      attachments: [{ name: 'LICENSE.txt', content: Buffer.from(text, 'utf8') }, ...extra.files]
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
function page(status, title, bodyHtml, { turnstile = false, script = '' } = {}){
  const siteKey = env('TURNSTILE_SITE_KEY');
  const withTs = turnstile && siteKey;
  const nonce = script ? randomToken(16) : '';
  const scriptSrc = [withTs ? 'https://challenges.cloudflare.com' : '', nonce ? `'nonce-${nonce}'` : ''].filter(Boolean).join(' ') || "'none'";
  const csp = [
    "default-src 'none'", "style-src 'unsafe-inline'", "img-src 'self' data:", "base-uri 'none'", "frame-ancestors 'none'",
    "form-action 'self'",   // files are served from this same site (R2 through the Worker)
    `script-src ${scriptSrc}`,
    withTs ? "frame-src https://challenges.cloudflare.com" : "frame-src 'none'",
    `connect-src 'self'${withTs ? ' https://challenges.cloudflare.com' : ''}`   // the live counter asks this site for the link's status
  ].join('; ');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="icon" type="image/png" href="/images/favicon-32.png">
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
.live{margin:18px 0 16px;padding:16px 16px 14px;border-radius:16px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.1)}.live .row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}.live .label{font:600 11px/1.4 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(237,235,232,.6)}.live .time{font:600 22px/1.1 ui-monospace,monospace;font-variant-numeric:tabular-nums;color:#ffd9b8;letter-spacing:.02em}.meter{position:relative;height:8px;margin:12px 0 10px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}.meter i{position:absolute;inset:0 auto 0 0;border-radius:inherit;background:linear-gradient(90deg,#ff9438,#ffc795);transition:width .6s cubic-bezier(.2,.8,.2,1)}.live.low .meter i{background:linear-gradient(90deg,#ff6a3d,#ff9438)}.live.low .time{color:#ffb08a}.live.dead{opacity:.7}.live.dead .meter i{background:rgba(255,255,255,.25)}.live b.n{color:#fff;font-size:18px}.note{min-height:1.4em;margin:12px 0 0;font-size:14px}.note.ok{color:#9fe0b0}.note.bad{color:#ffb0a0}button.busy{opacity:.75;cursor:progress}button:disabled{opacity:.5;cursor:not-allowed}@media (prefers-reduced-motion:reduce){.meter i{transition:none}}
.dlwrap{display:flex;flex-direction:column;align-items:center;gap:10px;margin:22px 0 4px}.dlb{position:relative;width:96px;height:96px;min-height:0;padding:0;border-radius:50%;overflow:hidden;display:grid;place-items:center;letter-spacing:0;border:1.5px solid rgba(255,170,120,.6);background:radial-gradient(circle at 34% 28%,rgba(255,214,176,.24),rgba(255,140,80,.08) 58%,rgba(0,0,0,.28));box-shadow:inset 0 2px 6px rgba(255,255,255,.2),inset 0 -12px 22px rgba(0,0,0,.38),0 12px 34px -12px rgba(255,120,60,.55);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .2s cubic-bezier(.2,.8,.2,1),box-shadow .3s ease,border-color .3s ease;isolation:isolate}.dlb:hover{transform:translateY(-2px);box-shadow:inset 0 2px 6px rgba(255,255,255,.24),inset 0 -12px 22px rgba(0,0,0,.38),0 16px 40px -12px rgba(255,120,60,.7)}.dlb:active{transform:scale(.94)}.dlb-liquid{position:absolute;left:0;right:0;bottom:0;height:0;z-index:0;background:linear-gradient(180deg,#ffbd7a,#ff7a2f 70%,#e2541c);transition:height .6s ease}.dlb.is-filling .dlb-liquid{height:100%;transition:height 1.6s cubic-bezier(.45,.05,.3,1)}.dlb-wave{position:absolute;left:0;bottom:100%;width:200%;height:14px;margin-bottom:-2px;fill:#ffbd7a;animation:dlbWave 1.3s linear infinite;opacity:0;transition:opacity .3s ease}.dlb.is-filling .dlb-wave{opacity:1}.dlb.is-filling .dlb-wave.w2{opacity:.55}.dlb-wave.w2{fill:#ffd2a3;height:12px;animation-duration:2.1s;animation-direction:reverse}@keyframes dlbWave{from{transform:translateX(0)}to{transform:translateX(-50%)}}.dlb-ico{position:relative;z-index:2;width:38px;height:38px;fill:none;stroke:#fff6ee;stroke-width:2.3;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));overflow:visible}.dlb .arr{animation:dlbNod 1.8s ease-in-out infinite}.dlb .tray,.dlb .arr{transition:opacity .2s ease}@keyframes dlbNod{0%,55%,100%{transform:translateY(0)}25%{transform:translateY(3px)}}.dlb.is-filling .arr{animation:dlbDrop .75s ease-in infinite}@keyframes dlbDrop{0%{transform:translateY(-4px);opacity:0}30%{opacity:1}100%{transform:translateY(6px);opacity:0}}.dlb .tick{opacity:0;stroke-dasharray:24;stroke-dashoffset:24}.dlb.is-done .arr,.dlb.is-done .tray{opacity:0;animation:none}.dlb.is-done .tick{opacity:1;animation:dlbTick .45s .05s ease forwards}@keyframes dlbTick{to{stroke-dashoffset:0}}.dlb.is-done{border-color:rgba(143,224,168,.8);box-shadow:inset 0 2px 6px rgba(255,255,255,.2),0 0 0 4px rgba(143,224,168,.18),0 12px 34px -12px rgba(110,220,150,.6)}.dlb.is-done .dlb-liquid{background:linear-gradient(180deg,#a5ecbc,#4fc47f 75%,#2f9a5d)}.dlb.is-done .dlb-wave{fill:#a5ecbc}.dlb.is-done .dlb-wave.w2{fill:#c9f3d6}.dlb.is-error{border-color:rgba(255,140,140,.85);animation:dlbShake .42s ease}.dlb.is-error .dlb-liquid{background:linear-gradient(180deg,#ff9c8c,#e0483a)}.dlb.is-error .dlb-wave{fill:#ff9c8c}@keyframes dlbShake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(3px)}30%,50%,70%{transform:translateX(-5px)}40%,60%{transform:translateX(5px)}}.dlb:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.6);transform:none}.dlb:disabled .arr{animation:none}.dlb:focus-visible{outline:3px solid #ff9438;outline-offset:4px}.dlb-cap{font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(237,235,232,.55)}@media (prefers-reduced-motion:reduce){.dlb-wave,.dlb .arr,.dlb.is-filling .arr{animation:none}.dlb .dlb-liquid,.dlb.is-filling .dlb-liquid{transition:none}}
.seal{display:block;width:150px;margin:24px auto 6px}.seal svg{display:block;width:100%;height:auto}.seal-code{text-align:center;margin:0}
button.ghost{background:transparent;border-color:rgba(255,255,255,.25);justify-self:start}.ts{margin:0 0 16px}.brand{font:600 11px/1 ui-monospace,monospace;letter-spacing:.14em;color:#c9864f;margin-bottom:18px;display:block}
</style>${withTs ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ''}</head>
<body><main class="card"><span class="brand">${escapeHtml(env('SITE_NAME', 'KETHAN ARTZZ').toUpperCase())}</span>${bodyHtml.replace('{{TURNSTILE}}', withTs ? `<div class="ts cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-theme="dark"></div>` : '')}</main>${nonce ? `<script nonce="${nonce}">${script}</script>` : ''}</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Robots-Tag': 'noindex, nofollow' } });   // same-origin: the page's own form posts keep a normal Origin, and nothing is sent to other sites
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
  const ms = new Date(t.expires_at).getTime() - Date.now();
  const pct = t.max_downloads ? Math.round(left / t.max_downloads * 100) : 0;
  const expiresIso = new Date(t.expires_at).toISOString();
  return page(200, `Download ${t.product_title}`, `<h1>${escapeHtml(t.product_title)}</h1>
<p>Order ${escapeHtml(t.public_id)}</p>
<section class="live${left <= 1 || ms < 3600e3 ? ' low' : ''}" id="dl" data-token="${escapeHtml(token)}" data-expires="${expiresIso}" data-used="${t.download_count}" data-max="${t.max_downloads}" aria-label="Your download link">
<div class="row"><span class="label">Link expires in</span><b class="time" id="dl-time">${escapeHtml(spanText(ms))}</b></div>
<div class="meter" id="dl-meter" role="meter" aria-label="Downloads left" aria-valuemin="0" aria-valuemax="${t.max_downloads}" aria-valuenow="${left}"><i id="dl-bar" style="width:${pct}%"></i></div>
<div class="row"><span><b class="n" id="dl-left">${left}</b> of <span id="dl-max">${t.max_downloads}</span> downloads left</span><small>until ${escapeHtml(fmtDate(t.expires_at))}</small></div>
</section>
<form method="post" id="dl-form" class="dlwrap">{{TURNSTILE}}<button type="submit" id="dl-btn" class="dlb" aria-label="Download" title="Download">
<span class="dlb-liquid" aria-hidden="true"><svg class="dlb-wave" viewBox="0 0 120 20" preserveAspectRatio="none"><path d="M0 10 Q 15 0 30 10 T 60 10 T 90 10 T 120 10 V 20 H 0 Z"/></svg><svg class="dlb-wave w2" viewBox="0 0 120 20" preserveAspectRatio="none"><path d="M0 10 Q 15 0 30 10 T 60 10 T 90 10 T 120 10 V 20 H 0 Z"/></svg></span>
<svg class="dlb-ico" viewBox="0 0 24 24" aria-hidden="true"><path class="arr" d="M12 3.5v11.5m0 0l-4.6-4.6M12 15l4.6-4.6"/><path class="tray" d="M4.5 19.5h15"/><path class="tick" d="M5 12.5l4.2 4.2L19 7"/></svg>
</button></form>
<p class="note" id="dl-note" role="status" aria-live="polite"></p>${seal}${rateHtml}`, { turnstile: true, script: LIVE_SCRIPT });
}

function spanText(ms){
  if (ms <= 0) return 'Expired';
  let s = Math.floor(ms / 1000); const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600; const m = Math.floor(s / 60); s %= 60;
  const two = (n) => String(n).padStart(2, '0');
  return `${d ? `${d}d ` : ''}${two(h)}:${two(m)}:${two(s)}`;
}
// counts down to the expiry every second, refreshes the downloads-left meter, and downloads without leaving the page
const LIVE_SCRIPT = `(function(){
var el=document.getElementById('dl'),form=document.getElementById('dl-form'),btn=document.getElementById('dl-btn'),note=document.getElementById('dl-note');
if(!el||!form||!btn)return;
var token=el.getAttribute('data-token'),exp=Date.parse(el.getAttribute('data-expires')),used=+el.getAttribute('data-used'),max=+el.getAttribute('data-max'),state='ok',busy=false;
function $(id){return document.getElementById(id)}
function two(n){return(n<10?'0':'')+n}
function span(ms){if(ms<=0)return'Expired';var s=Math.floor(ms/1000),d=Math.floor(s/86400);s%=86400;var h=Math.floor(s/3600);s%=3600;var m=Math.floor(s/60);s%=60;return(d?d+'d ':'')+two(h)+':'+two(m)+':'+two(s)}
function paint(){
  var ms=exp-Date.now(),rem=Math.max(0,max-used);
  $('dl-time').textContent=span(ms);$('dl-left').textContent=rem;$('dl-max').textContent=max;
  $('dl-bar').style.width=(max?Math.round(rem/max*100):0)+'%';
  var m=$('dl-meter');m.setAttribute('aria-valuenow',rem);m.setAttribute('aria-valuemax',max);
  el.classList.toggle('low',rem<=1||(ms>0&&ms<3600e3));
  var dead=ms<=0?'expired':rem<=0?'limit':state!=='ok'?state:'';
  if(dead){btn.disabled=true;var why=dead==='expired'?'Link expired':dead==='limit'?'No downloads left':'Unavailable';btn.setAttribute('aria-label',why);btn.title=why;el.classList.add('dead');}
}
function refresh(){
  fetch('/api/download/'+token+'/status',{cache:'no-store',headers:{Accept:'application/json'}}).then(function(r){return r.json()}).then(function(s){
    if(!s||!s.max)return;used=s.used;max=s.max;exp=Date.parse(s.expiresAt);state=s.state||'ok';paint();
  }).catch(function(){});
}
paint();setInterval(paint,1000);
setInterval(function(){if(!document.hidden)refresh()},15000);
document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function fail(msg){
  note.textContent=msg;note.className='note bad';
  btn.classList.remove('is-filling');btn.classList.add('is-error');
  setTimeout(function(){btn.classList.remove('is-error');busy=false;if(!btn.disabled)btn.setAttribute('aria-label','Try the download again');paint()},900);
}
form.addEventListener('submit',function(e){
  if(!window.fetch||!window.URLSearchParams||!window.FormData)return;
  e.preventDefault();if(busy||btn.disabled)return;
  busy=true;btn.classList.remove('is-done','is-error');void btn.offsetWidth;btn.classList.add('is-filling');
  btn.setAttribute('aria-label','Preparing your download');note.textContent='Preparing your file…';note.className='note';
  var t0=Date.now(),FILL=reduce?0:1600;
  // the bubble always fills completely before anything happens, so the motion never cuts short
  var after=function(fn){setTimeout(fn,Math.max(0,FILL-(Date.now()-t0)))};
  fetch(location.pathname,{method:'POST',body:new URLSearchParams(new FormData(form)),headers:{Accept:'application/json'},credentials:'same-origin'})
  .then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j||{}}},function(){return{ok:false,j:{}}})})
  .then(function(x){
    var j=x.j;
    after(function(){
      if(x.ok&&j.url){
        used=j.used;max=j.max;exp=Date.parse(j.expiresAt);paint();
        var rem=Math.max(0,max-used);
        btn.classList.add('is-done');btn.setAttribute('aria-label','Download started');
        note.textContent='Your download has started. '+rem+' of '+max+' download'+(max===1?'':'s')+' left on this link.';note.className='note ok';
        var a=document.createElement('a');a.href=j.url;a.rel='noopener';a.style.display='none';document.body.appendChild(a);a.click();setTimeout(function(){a.remove()},1000);
        setTimeout(function(){btn.classList.remove('is-filling','is-done');busy=false;if(!btn.disabled){btn.setAttribute('aria-label','Download again');btn.title='Download again';}paint()},2600);
      }else{
        if(j.state){state=j.state}
        fail(j.message||j.error||'Something went wrong. Please try again.');refresh();
      }
      if(window.turnstile){try{window.turnstile.reset()}catch(err){}}
    });
  })
  .catch(function(){after(function(){fail('No connection. Check your internet and try again.')})});
});
})();`;

/** what the live counter on the download page polls: never counts a download */
export async function downloadStatus(token){
  const { t, error } = await lookup(token);
  if (!t) return json({ state: 'invalid' }, 404, { 'Cache-Control': 'no-store' });
  return json({ state: error || 'ok', used: t.download_count, max: t.max_downloads, left: Math.max(0, t.max_downloads - t.download_count),
    expiresAt: new Date(t.expires_at).toISOString(), product: t.product_title }, 200, { 'Cache-Control': 'no-store' });
}

// Counts one download (atomic: never above the limit) and redirects to a short-lived signed URL.
export async function redeem({ token, ip, country, userAgent, siteUrl, asJson = false }){
  const fail = (kind) => asJson ? json({ ok: false, state: kind, message: MESSAGES[kind][1] }, kind === 'invalid' ? 404 : 410, { 'Cache-Control': 'no-store' }) : errorPage(kind, siteUrl);
  const pre = await lookup(token);
  if (pre.error) return fail(pre.error);
  const db = await getDb();
  const file = await db.maybeOne('select id, storage_path, filename, source from product_files where product_id = $1 and is_current', [pre.t.product_id]);
  if (!file) return fail('missing');
  // one atomic statement: counted only while the link is live, under its limit and the order is still paid
  const counted = await db.maybeOne(`update download_tokens set download_count = download_count + 1
    where token_hash = $1 and revoked_at is null and expires_at > now() and download_count < max_downloads
      and exists (select 1 from orders o where o.id = download_tokens.order_id and o.status in ('paid','delivered'))
    returning id, order_id, product_id, download_count, max_downloads, expires_at`, [sha256hex(token)]);
  if (!counted){
    const again = await lookup(token);   // why not: refunded/revoked, expired, or the limit was just reached
    return fail(again.error === 'revoked' ? 'revoked' : again.error === 'expired' ? 'expired' : 'limit');
  }
  await db.query('insert into download_events (token_id, order_id, product_id, ip, country, user_agent) values ($1,$2,$3,$4,$5,$6)',
    [counted.id, counted.order_id, counted.product_id, ip, country, String(userAgent || '').slice(0, 300)]).catch(() => {});   // the log never blocks a download
  // a Google Drive file is streamed by this server through a link of our own: the Drive address is never handed out
  const url = file.source === 'drive' ? signedFileUrl(file.id, SIGNED_URL_SECONDS) : await getStorage().signedUrl('deliverables', file.storage_path, SIGNED_URL_SECONDS, file.filename);
  if (asJson) return json({ ok: true, url, used: counted.download_count, max: counted.max_downloads, left: Math.max(0, counted.max_downloads - counted.download_count),
    expiresAt: new Date(counted.expires_at).toISOString() }, 200, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
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
  let ttl = 720;
  for (const it of items){
    const url = await issueToken(it.order_id, it.product_id, 'resend', siteUrl);
    ttl = Math.min(ttl, (await productTerms(db, it.product_id)).hours);
    lines.push(`${it.title} (order ${it.public_id}):\n${url}`);
  }
  await sendEmail({ to: email, template: 'resend_link', vars: { links: lines.join('\n\n'), expires: fmtDate(Date.now() + ttl * 3600000) } });
  return { sent: true };
}
