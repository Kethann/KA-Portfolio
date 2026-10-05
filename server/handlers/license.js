// Public license check: /license (type a code) and /license/<code> (what the seal opens). Server-rendered and
// script-free, like the legal pages, so it opens instantly from a phone camera. It shows the item, the
// license, who holds it (the name given at checkout, otherwise the masked email), when it was issued and
// whether it is still valid. Unpaid or unknown codes look the same, so the page can't be used to probe orders.
import { getDb } from '../core/db.js';
import { env, siteUrl } from '../core/env.js';
import { rateLimit } from '../core/guard.js';
import { getSetting } from '../core/settings.js';
import { escapeHtml } from '../core/email.js';
import { normalizeLicenseCode, sealSvg, licenseUrl, maskEmail } from '../store/license.js';

const esc = (s) => escapeHtml(String(s ?? ''));
const fmt = (d) => d ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)) : '';

// The signature as set in Studio > Checkout pass (text, font, colour); an uploaded font is loaded from its URL.
async function signature(issuer){
  const site = await getSetting('site');
  const pc = site?.passCard || {}, fonts = site?.details?.customFonts || [];
  const font = fonts.find(f => f.family === pc.signatureFont);
  const face = font && /^(https?:\/\/|\/)[^\s"'()\\]+$/.test(font.url) ? `@font-face{font-family:"ka-sign";src:url("${font.url}");font-display:swap}` : '';
  const builtIn = !font && pc.signatureFont && /^[A-Za-z0-9 _-]+$/.test(pc.signatureFont) ? `"${pc.signatureFont}",` : '';
  const ink = { gold: '#f2c27b', white: '#fff6ea', ink: '#e9e1d8', accent: '#ff9438' }[pc.signatureTone] || '#f2c27b';
  return { face, family: `${face ? '"ka-sign",' : ''}${builtIn}"Segoe Script","Bradley Hand","Brush Script MT","Lucida Handwriting",cursive`, text: pc.signatureText || issuer, ink };
}

function page(status, title, body, extraCss = ''){
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0f0c0b"><title>${esc(title)} · Kethan Artzz</title>
<style>
:root{color-scheme:dark;--ink:#efe9e2;--dim:rgba(239,233,226,.66);--faint:rgba(239,233,226,.42);--line:rgba(255,255,255,.11);--amber:#ff9438;--ok:#7fe0a6;--bad:#ff8c8c}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0f0c0b radial-gradient(ellipse at 50% -20%,#3a2016 0,transparent 62%);color:var(--ink);
font:16px/1.6 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:max(24px,env(safe-area-inset-top)) 18px 56px}
main{width:min(720px,100%);margin:0 auto}a{color:#ffc795}a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--amber);outline-offset:3px;border-radius:6px}
.back{display:inline-block;margin-bottom:26px;color:var(--dim);text-decoration:none;font-size:14px}.back:hover{color:var(--ink)}
.eyebrow{font:700 11px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.2em;text-transform:uppercase;color:#c9864f;margin:0 0 10px}
h1{margin:0 0 6px;font:500 clamp(28px,6vw,40px)/1.1 Georgia,"Times New Roman",serif;letter-spacing:-.015em}
.card{margin-top:22px;display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:28px;align-items:center;padding:clamp(20px,4vw,32px);border-radius:26px;
background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid var(--line);box-shadow:0 30px 80px rgba(0,0,0,.45)}
.seal svg{display:block;width:100%;height:auto;filter:drop-shadow(0 18px 40px rgba(0,0,0,.5))}
.code{margin:12px 0 0;text-align:center;font:700 15px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.14em;color:#ffd9b0}
.status{display:inline-flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;font:700 12px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}
.status.ok{color:#0b2416;background:var(--ok)}.status.bad{color:#2a0c0c;background:var(--bad)}.status.wait{color:#2a1b06;background:#ffcf7a}
.thumb{width:72px;height:90px;object-fit:cover;border-radius:10px;border:1px solid var(--line);float:right;margin:0 0 10px 14px}
dl{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:18px 0 0}dt{color:var(--faint);font-size:13px;letter-spacing:.04em}dd{margin:0;color:var(--ink);overflow-wrap:anywhere}
.item{font:500 22px/1.2 Georgia,serif;margin:16px 0 2px}.summary{color:var(--dim);margin:0}
.sign{margin-top:22px;padding-top:16px;border-top:1px solid var(--line)}.sign .name{font-size:clamp(30px,6vw,40px);line-height:1.15}.sign small{display:block;color:var(--faint);font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.note{margin-top:20px;color:var(--faint);font-size:13.5px}
form{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}input{flex:1 1 240px;min-height:52px;padding:0 16px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.3);color:var(--ink);
font:600 18px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.12em;text-transform:uppercase}
button{min-height:52px;padding:0 26px;border-radius:999px;border:1px solid rgba(255,170,120,.55);background:linear-gradient(145deg,rgba(255,180,120,.35),rgba(200,120,70,.25));color:#fffaf5;
font:700 13px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}.err{color:var(--bad);margin:12px 0 0}
@media (max-width:640px){.card{grid-template-columns:1fr}.seal{order:-1;width:min(240px,72vw);margin:0 auto}}
${extraCss}
</style></head><body><main><a class="back" href="/">&larr; Kethan Artzz</a>${body}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}

function lookupForm(message = '', value = ''){
  return `<p class="eyebrow">License check</p><h1>Check a license</h1>
<p class="summary">Scan the seal on a license, or type the code printed under it.</p>
<form method="get" action="/license"><input name="code" value="${esc(value)}" placeholder="KA-XXXXX-XXXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" aria-label="License code" required>
<button type="submit">Check</button></form>${message ? `<p class="err" role="alert">${esc(message)}</p>` : ''}`;
}

export async function licenseIndex(ctx){
  const raw = ctx.url.searchParams.get('code');
  if (raw === null) return page(200, 'Check a license', lookupForm());
  await rateLimit(`license:${ctx.ip}`, 60, 10 * 60);
  const code = normalizeLicenseCode(raw);
  if (!code) return page(400, 'Check a license', lookupForm('That doesn’t look like a license code. It has the form KA-XXXXX-XXXXX.', raw.slice(0, 24)));
  return new Response(null, { status: 303, headers: { Location: `/license/${code}`, 'Cache-Control': 'no-store' } });
}

export async function licensePage(ctx){
  await rateLimit(`license:${ctx.ip}`, 60, 10 * 60);
  const raw = String(ctx.params.code || '');
  const code = normalizeLicenseCode(raw);
  if (!code) return page(404, 'License not found', lookupForm('No license has that code. Check it and try again.', raw.slice(0, 24)));
  if (code !== raw) return new Response(null, { status: 301, headers: { Location: `/license/${code}`, 'Cache-Control': 'no-store' } });
  const db = await getDb();
  const r = await db.maybeOne(`select o.public_id, o.email, o.status, o.paid_at, o.created_at, o.refunded_at, o.license_holder,
      i.title, i.license_key, i.license_version, i.product_id, l.name as license_name, l.summary as license_summary,
      (select m.url from product_media m where m.product_id = i.product_id order by m.sort, m.id limit 1) as thumb
    from orders o join order_items i on i.order_id = o.id left join licenses l on l.key = i.license_key
    where o.license_code = $1 order by i.id limit 1`, [code]);
  // an order that was never paid has no license: it reads exactly like an unknown code
  if (!r || !['paid', 'delivered', 'refunded', 'mismatch'].includes(r.status)) return page(404, 'License not found', lookupForm('No license has that code. Check it and try again.', code));
  const store = await getSetting('store');
  const issuer = store.sellerName || env('SITE_NAME', 'Kethan Artzz');
  const sig = await signature(issuer);
  const state = r.status === 'refunded' ? ['bad', 'Revoked', `This license ended on ${fmt(r.refunded_at)} when the purchase was refunded. It no longer grants any rights.`]
    : r.status === 'mismatch' ? ['wait', 'Under review', 'This purchase is being checked. The license is on hold until that is done.']
    : ['ok', 'Valid license', 'This license is genuine and in force.'];
  const holder = r.license_holder || maskEmail(r.email);
  const url = licenseUrl(siteUrl(ctx.request), code);
  const thumb = r.thumb && /^(https:\/\/|\/)[^\s"'<>]+$/.test(r.thumb) ? `<img class="thumb" src="${esc(r.thumb)}" alt="">` : '';
  const body = `<p class="eyebrow">License check</p><h1>${esc(state[1])}</h1><span class="status ${state[0]}">${state[0] === 'ok' ? '&#10003; ' : ''}${esc(state[1])}</span>
<div class="card"><div>${thumb}
<p class="item">${esc(r.title)}</p><p class="summary">${esc(state[2])}</p>
<dl><dt>License</dt><dd>${esc(r.license_name || 'Personal')}${r.license_version ? ` (version ${esc(r.license_version)})` : ''}${r.license_summary ? ` &middot; ${esc(r.license_summary)}` : ''}</dd>
<dt>Licensed to</dt><dd>${esc(holder)}</dd>
<dt>Issued</dt><dd>${esc(fmt(r.paid_at || r.created_at))}</dd>
<dt>Order</dt><dd>${esc(r.public_id)}</dd>
<dt>Issued by</dt><dd>${esc(issuer)}</dd></dl>
<div class="sign"><span class="name" style="font-family:${esc(sig.family)};color:${sig.ink}">${esc(sig.text)}</span><small>Authorised signature</small></div></div>
<div class="seal">${sealSvg({ url, code, issuer, id: 'ka-license-seal' })}<p class="code">${esc(code)}</p></div></div>
<p class="note">Anyone can open this page by scanning the seal. It never shows payment details${r.license_holder ? '' : ' or the full email address'}. <a href="/license">Check another code</a></p>`;
  return page(200, `${state[1]} · ${code}`, body, sig.face);
}

export function registerLicense(route){
  route('GET', '/license', licenseIndex);
  route('GET', '/license/:code', licensePage);
}
