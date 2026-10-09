// Transactional email. Production: Gmail over SMTP with a Google App Password (GMAIL_USER +
// GMAIL_APP_PASSWORD; Gmail's free limit is about 500 emails a day), or Brevo's HTTPS API (BREVO_API_KEY).
// Development/tests: messages are written to .data/outbox as .json files. Every send is recorded in
// email_log (never the body).
import { env, localDataDir } from './env.js';
import { getDb } from './db.js';
import { buildMime, smtpSend } from './smtp.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { sep } from 'node:path';

const at = (...parts) => parts.join(sep);

let transport = null;
export function setEmailTransport(t){ transport = t; }

function getTransport(){
  if (transport) return transport;
  if (env('GMAIL_USER') && env('GMAIL_APP_PASSWORD')) transport = gmailTransport(env('GMAIL_USER'), env('GMAIL_APP_PASSWORD'));
  else if (env('BREVO_API_KEY')) transport = brevoTransport(env('BREVO_API_KEY'));
  else transport = outboxTransport(at(localDataDir('Email (GMAIL_USER and GMAIL_APP_PASSWORD)'), 'outbox'));
  return transport;
}

// Gmail only sends as the signed-in account (or an alias set up in Gmail), so that address is the sender;
// the display name still comes from MAIL_FROM_NAME / SITE_NAME.
function gmailTransport(user, appPassword){
  const pass = String(appPassword).replace(/\s+/g, '');   // Google shows it in groups of four
  return {
    kind: 'gmail',
    async send(msg){
      const from = { email: user, name: msg.from.name };
      const message = buildMime({ from, to: msg.to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, html: msg.html, attachments: msg.attachments });
      return smtpSend({ user, pass, message, envelopeTo: msg.to });
    }
  };
}

function brevoTransport(apiKey){
  return {
    kind: 'brevo',
    async send(msg){
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: msg.from.email, name: msg.from.name },
          to: [{ email: msg.to }],
          ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
          subject: msg.subject,
          htmlContent: msg.html,
          textContent: msg.text,
          ...(msg.attachments?.length ? { attachment: msg.attachments.map(a => ({ name: a.name, content: Buffer.from(a.content).toString('base64') })) } : {})
        })
      });
      if (!res.ok){
        const err = new Error(`Email provider refused the message (${res.status}).`);
        err.status = res.status;
        throw err;
      }
      const body = await res.json().catch(() => ({}));
      return { id: body.messageId || '' };
    }
  };
}

export function outboxTransport(dir){
  return {
    kind: 'outbox',
    sent: [],
    async send(msg){
      await mkdir(dir, { recursive: true });
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await writeFile(at(dir, id + '.json'), JSON.stringify({ ...msg, attachments: (msg.attachments || []).map(a => a.name) }, null, 2));
      this.sent.push(msg);
      return { id };
    }
  };
}

// ---- rendering: templates are plain text with {{placeholders}}; values are always escaped.
export function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function fill(template, vars){
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}
// ---- the email design: the site's dark, warm look (like the license page), in tables and inline styles so it holds up
// in Gmail, Outlook, Apple Mail and phone apps. The owner's text (templates) is kept word for word and set in this style;
// a link that sits on its own line becomes a button.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", SERIF = "Georgia,'Times New Roman',serif", MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";
// warm near-black, like the site and the license page; one amber accent; green only for "done" states
const C = { bg: '#0b0908', card: '#14100e', inner: '#1c1613', line: '#2c221d', rule: '#3b2e26', ink: '#f3ede6', body: '#cdc3b9', dim: '#a39890', faint: '#7d736b',
  gold: '#d9a066', goldSoft: '#3a2a1c', link: '#f2b98a', good: '#86d9a6', goodSoft: '#16291e', bad: '#ff9a8a', badSoft: '#2e1714' };
/** a button that survives Outlook: a table cell with a background colour, the link fills it */
export function button(label, url, { primary = true, full = false } = {}){
  const bg = primary ? '#d08a52' : 'transparent', fg = primary ? '#1a0f08' : C.ink, bd = primary ? '#e7a16b' : C.rule;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${full ? ' width="100%"' : ''} style="border-collapse:separate"><tr>
<td align="center" bgcolor="${primary ? bg : ''}" style="border-radius:12px;border:1px solid ${bd};${primary ? `background:${bg};background-image:linear-gradient(135deg,#f0b27c,#c97a43);` : ''}">
<a href="${escapeHtml(url)}" style="display:block;padding:${full ? '16px 24px' : '12px 22px'};color:${fg};font:700 ${full ? 15 : 13}px/1.2 ${FONT};letter-spacing:.02em;text-decoration:none;border-radius:12px">${escapeHtml(label)}</a>
</td></tr></table>`;
}
const P = (inner, extra = '') => `<p style="margin:0 0 16px;color:${C.body};font:15px/1.7 ${FONT};${extra}">${inner}</p>`;
const BLOCK = (k) => `@@KA-BLOCK-${k}@@`;
// Plain text -> HTML in the theme: escaped paragraphs, line breaks, clickable https links; a URL alone on its line is a
// button; a {{block}} placeholder (download button, link terms, license certificate…) becomes its designed HTML.
export function textToHtml(body, buttons = {}, blocks = {}){
  let src = String(body);
  for (const k of Object.keys(blocks)) src = src.split(BLOCK(k)).join(`\n\n${BLOCK(k)}\n\n`);
  return src.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => {
    const b = /^@@KA-BLOCK-([a-z0-9_]+)@@$/.exec(p);
    if (b) return blocks[b[1]] || '';
    const lines = p.split('\n').map(line => {
      const t = line.trim();
      if (/^https:\/\/\S+$/.test(t)) return `</p><div style="margin:4px 0 18px">${button(buttons[t] || 'Open link', t)}</div><p style="margin:0 0 16px;color:${C.body};font:15px/1.7 ${FONT}">`;
      return escapeHtml(line).replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:${C.link};text-decoration:underline">${u}</a>`);
    });
    return P(lines.join('<br>')).replace(/<p[^>]*><\/p>/g, '').replace(/<br><\/p>/g, '</p>').replace(/(<p[^>]*>)<br>/g, '$1');
  }).join('');
}
/** an eyebrow, a headline and a line under it: what this email is, at a glance */
function heroHtml(hero){
  if (!hero) return '';
  const tone = hero.tone === 'bad' ? [C.bad, C.badSoft] : hero.tone === 'neutral' ? [C.gold, C.goldSoft] : [C.good, C.goodSoft];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:0 0 22px">
${hero.eyebrow ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background:${tone[1]};border-radius:999px;padding:6px 12px;color:${tone[0]};font:700 11px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase">&#9679;&nbsp; ${escapeHtml(hero.eyebrow)}</td></tr></table>` : ''}
<h1 style="margin:16px 0 8px;color:${C.ink};font:400 30px/1.2 ${SERIF};letter-spacing:-.01em">${escapeHtml(hero.title || '')}</h1>
${hero.subtitle ? `<div style="color:${C.dim};font:14px/1.6 ${FONT}">${escapeHtml(hero.subtitle)}</div>` : ''}
</td></tr></table>`;
}
/** the item: picture, title, a line under it, small chips */
function cardHtml(card){
  if (!card) return '';
  const chips = (card.chips || []).filter(Boolean).map(c => `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;border:1px solid ${C.rule};color:${C.dim};font:600 12px/1 ${FONT}">${escapeHtml(c)}</span>`).join('');
  const rows = (card.rows || []).filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v]) =>
    `<tr><td style="padding:7px 0;border-top:1px solid ${C.line};color:${C.faint};font:13px/1.4 ${FONT}">${escapeHtml(k)}</td><td align="right" style="padding:7px 0;border-top:1px solid ${C.line};color:${C.ink};font:600 13px/1.4 ${FONT}">${escapeHtml(v)}</td></tr>`).join('');
  const img = card.image ? `<td width="96" valign="top" style="padding:0 18px 0 0"><img src="${escapeHtml(card.image)}" width="96" alt="" style="display:block;width:96px;height:auto;border-radius:10px;border:1px solid ${C.line}"></td>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${C.inner};border:1px solid ${C.line};border-radius:16px">
<tr><td style="padding:18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${img}<td valign="top">
<div style="color:${C.faint};font:700 11px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase">${escapeHtml(card.label || 'Your item')}</div>
<div style="margin:8px 0 6px;color:${C.ink};font:400 21px/1.25 ${SERIF}">${escapeHtml(card.title || '')}</div>
${card.subtitle ? `<div style="margin:0 0 10px;color:${C.dim};font:14px/1.55 ${FONT}">${escapeHtml(card.subtitle)}</div>` : ''}
${chips ? `<div>${chips}</div>` : ''}
</td></tr></table>
${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px">${rows}</table>` : ''}
</td></tr></table>`;
}
/** detail tiles in one row: a small label, then the value */
export function tilesHtml(tiles){
  if (!Array.isArray(tiles) || !tiles.length) return '';
  const w = Math.floor(100 / tiles.length);
  const cells = tiles.map((t, i) => `<td class="ka-tile" width="${w}%" valign="top" style="padding:0 ${i < tiles.length - 1 ? 8 : 0}px 0 0">
<div style="background:${C.inner};border:1px solid ${C.line};border-radius:12px;padding:12px 14px">
<div style="color:${C.faint};font:700 10.5px/1.2 ${FONT};letter-spacing:.1em;text-transform:uppercase">${escapeHtml(t.label)}</div>
<div style="margin-top:6px;color:${C.ink};font:600 15px/1.3 ${FONT}">${escapeHtml(t.value)}</div>
${t.note ? `<div style="margin-top:2px;color:${C.faint};font:12px/1.4 ${FONT}">${escapeHtml(t.note)}</div>` : ''}</div></td>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px"><tr>${cells}</tr></table>`;
}
/** a bordered panel with a title and label/value rows: the license certificate, the receipt totals */
export function panelHtml({ eyebrow, rows = [], foot = '', note = '', mono = [] }){
  const body = rows.filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v], i) => {
    const strong = typeof k === 'string' && k.startsWith('!'), key = strong ? k.slice(1) : k;
    return `<tr><td style="padding:9px 0;${i ? `border-top:1px solid ${C.line};` : ''}color:${strong ? C.ink : C.faint};font:${strong ? 600 : 400} 14px/1.4 ${FONT}">${escapeHtml(key)}</td>
<td align="right" style="padding:9px 0;${i ? `border-top:1px solid ${C.line};` : ''}color:${C.ink};font:${strong ? '700 16px' : '600 14px'}/1.4 ${mono.includes(key) ? MONO : FONT}">${escapeHtml(v)}</td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 24px;border:1px solid ${C.rule};border-radius:16px;background:${C.inner}">
<tr><td style="padding:18px 20px 8px">
${eyebrow ? `<div style="color:${C.gold};font:700 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;padding-bottom:8px">${escapeHtml(eyebrow)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${body}</table>
${note ? `<div style="margin:10px 0 6px;padding-top:12px;border-top:1px solid ${C.line};color:${C.dim};font:13px/1.65 ${FONT}">${note}</div>` : ''}
${foot ? `<div style="padding:10px 0 10px">${foot}</div>` : ''}
</td></tr></table>`;
}
function layout(inner, siteName, { card, hero, site, preheader = '', owner = false } = {}){
  const store = site && !owner ? `${site}/?page=store` : '';
  const year = new Date().getFullYear();
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(siteName)}</title>
<style>@media (max-width:520px){.ka-pad{padding:26px 20px 10px!important}.ka-h1 h1{font-size:26px!important}.ka-tile{display:block!important;width:100%!important;padding:0 0 8px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg}">${escapeHtml(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};background-image:radial-gradient(ellipse 80% 40% at 50% 0,#2a1a12 0,${C.bg} 70%)">
<tr><td align="center" style="padding:36px 12px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td align="center" style="padding:0 0 22px">
<div style="color:${C.ink};font:400 17px/1 ${SERIF};letter-spacing:.34em;text-transform:uppercase">${escapeHtml(siteName)}</div>
<div style="width:36px;height:1px;margin:14px auto 0;background:${C.gold};line-height:1px;font-size:1px">&nbsp;</div>
</td></tr>
<tr><td class="ka-pad ka-h1" style="background:${C.card};border:1px solid ${C.line};border-radius:20px;padding:34px 32px 14px">
${heroHtml(hero)}${cardHtml(card)}${inner}
</td></tr>
${owner ? '' : `<tr><td align="center" style="padding:26px 10px 0;color:${C.dim};font:13px/1.6 ${FONT}">Questions? Reply to this email and I’ll help.</td></tr>`}
${store ? `<tr><td align="center" style="padding:14px 0 0">${button('Explore the store', store, { primary: false })}</td></tr>` : ''}
<tr><td align="center" style="padding:22px 10px 0;color:${C.faint};font:12px/1.6 ${FONT}">&copy; ${year} ${escapeHtml(siteName)}${site ? ` &middot; <a href="${escapeHtml(site)}" style="color:${C.faint};text-decoration:underline">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

// Built-in templates; the portal can override subject/body per key (email_templates table).
export const DEFAULT_TEMPLATES = {
  contact_notify: { subject: 'New message: {{subject}}', body: 'From {{name}} <{{email}}>\n\n{{message}}\n\nReply from the inbox:\n{{portal_url}}' },
  contact_autoreply: { subject: 'Thanks for writing, {{name}}', body: 'Hi {{name}},\n\nThank you for getting in touch. Your message is with me, and I’ll reply personally, usually within a day or two.\n\n{{signature}}' },
  notify_confirm: { subject: 'You’re on the list', body: 'You’re on the list.\n\nYou’ll get exactly one email when {{topic_name}} launches. Nothing else.\n\n{{signature}}' },
  order_delivery: { subject: 'Your download is ready: {{product_title}}', body: 'Hi {{customer_name}},\n\nThank you for your order. {{product_title}} is ready to download.\n\n{{download_url}}\n\n{{link_terms}}\n\n{{extra_note}}\n\n{{license_text}}\n\nYour license is also attached as LICENSE.txt. Please keep this email as your proof of purchase. If the link expires, you can request a fresh one from the store with “Email me my download links”, using this email address.\n\n{{signature}}' },
  order_receipt: { subject: 'Receipt {{invoice_number}} · order {{order_id}}', body: 'Thank you for your payment. Here is your receipt for your records.\n\n{{receipt}}\n\n{{seller_block}}\n\n{{signature}}' },
  resend_link: { subject: 'Your download links', body: 'Here are fresh download links for your purchases.\n\n{{links}}\n\nThese links work until {{expires}}. If you need anything, just reply to this email.\n\n{{signature}}' },
  report: { subject: '{{period}} sales report', body: '{{summary}}\n\nOpen the portal:\n{{portal_url}}' },
  alert: { subject: 'Alert: {{title}}', body: '{{body}}' },
  reply: { subject: 'Re: {{subject}}', body: '{{body}}\n\n{{signature}}' },
  launch: { subject: '{{topic_title}} is live', body: 'Hi,\n\n{{topic_name}} is live, and you asked to be the first to know.\n\n{{link}}\n\n{{message}}\n\nThis was the one email you signed up for. There won’t be more about it.\n\n{{signature}}' }
};

// The header of each email when the sender doesn't set one: what it is, at a glance. Placeholders are filled.
const HEROES = {
  contact_autoreply: { eyebrow: 'Message received', tone: 'neutral', title: 'Thanks for getting in touch', subtitle: 'I read every message and reply personally.' },
  notify_confirm: { eyebrow: 'Confirmed', title: 'You’re on the list', subtitle: 'One email when {{topic_name}} launches. Nothing else.' },
  launch: { eyebrow: 'Now live', tone: 'neutral', title: '{{topic_title}} is live' },
  resend_link: { eyebrow: 'Fresh links', tone: 'neutral', title: 'Your download links', subtitle: 'They work until {{expires}}.' },
  contact_notify: { eyebrow: 'New message', tone: 'neutral', title: '{{subject}}', subtitle: 'From {{name}}' },
  report: { eyebrow: 'Sales report', tone: 'neutral', title: '{{period}} report' },
  alert: { eyebrow: 'Alert', tone: 'bad', title: '{{title}}' }
};
// emails to the owner: no "Questions about your order?" footer or store button
const OWNER_TEMPLATES = new Set(['contact_notify', 'report', 'alert']);

export async function loadTemplate(key){
  const db = await getDb();
  const row = await db.maybeOne('select subject, body_md from email_templates where key = $1', [key]);
  const def = DEFAULT_TEMPLATES[key];
  if (!row && !def) throw new Error(`Unknown email template ${key}.`);
  return row ? { subject: row.subject, body: row.body_md } : { ...def };
}

// Sends one email. Returns {ok, id} and never throws for provider failures (they are logged in
// email_log and surfaced in the portal), so a slow or broken provider can't break a checkout.
// `blocks`: placeholders whose HTML is a designed piece (download button, license certificate, receipt table); the
// plain-text part still gets the placeholder's text from `vars`. `hero` and `card` sit at the top of the HTML.
export async function sendEmail({ to, template, vars = {}, replyTo, attachments, subjectOverride, bodyOverride, card, hero, blocks = {}, buttons, preheader }){
  const db = await getDb();
  const siteName = env('SITE_NAME', 'Kethan Artzz');
  const from = { email: env('MAIL_FROM', 'no-reply@localhost'), name: env('MAIL_FROM_NAME', siteName) };
  const tpl = await loadTemplate(template);
  const allVars = { signature: env('MAIL_SIGNATURE', `— ${siteName}`), customer_name: 'there', ...vars };
  const subject = fill(subjectOverride ?? tpl.subject, allVars).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const body = bodyOverride ?? tpl.body;
  const text = fill(body, allVars).replace(/\n{3,}/g, '\n\n').trim() + '\n';   // an empty placeholder never leaves a gap
  const htmlVars = { ...allVars }; for (const k of Object.keys(blocks)) if (blocks[k]) htmlVars[k] = BLOCK(k);
  const htmlText = fill(body, htmlVars).replace(/\n{3,}/g, '\n\n');
  const site = (env('PUBLIC_SITE_URL') || '').replace(/\/+$/, '');
  const h = hero || (HEROES[template] ? Object.fromEntries(Object.entries(HEROES[template]).map(([k, v]) => [k, k === 'tone' ? v : fill(v, allVars)])) : null);
  const html = layout(textToHtml(htmlText, buttons || (card?.cta ? { [card.cta.url]: card.cta.label } : {}), blocks), siteName,
    { card, hero: h, site: /^https?:\/\//.test(site) ? site : '', preheader: preheader || h?.subtitle || '', owner: OWNER_TEMPLATES.has(template) });
  try {
    const res = await getTransport().send({ from, to, replyTo, subject, text, html, attachments });
    await db.query('insert into email_log (to_email, subject, template, status, provider_id) values ($1,$2,$3,$4,$5)', [to, subject, template, 'sent', res.id || null]);
    return { ok: true, id: res.id };
  } catch (err){
    await db.query('insert into email_log (to_email, subject, template, status, error) values ($1,$2,$3,$4,$5)', [to, subject, template, 'failed', String(err.message).slice(0, 300)]);
    return { ok: false, error: err.message };
  }
}
