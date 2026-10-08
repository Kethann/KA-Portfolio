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
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", SERIF = "Georgia,'Times New Roman',serif", MONO = "'Courier New',ui-monospace,monospace";
const C = { bg: '#0f0c0b', card: '#1b1513', inner: '#241b18', line: '#3a2c26', ink: '#efe9e2', dim: '#b9afa6', faint: '#8e857d', amber: '#c9864f', link: '#ffc795' };
function button(label, url, primary = true){
  return `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 26px;border-radius:999px;${primary
    ? 'background:#c8784a;background-image:linear-gradient(145deg,#ffb478,#c8784a);color:#1a0f0a;border:1px solid #ffb478'
    : `background:transparent;color:${C.ink};border:1px solid #5a463c`};font:700 12px/1 ${MONO};letter-spacing:.16em;text-transform:uppercase;text-decoration:none">${escapeHtml(label)}</a>`;
}
// Plain text -> HTML in the theme: escaped paragraphs, line breaks, clickable https links; a URL alone on its line is a button.
export function textToHtml(body, buttons = {}){
  const paras = String(body).split(/\n{2,}/);
  return paras.map(p => {
    const lines = p.split('\n').map(line => {
      const t = line.trim();
      if (/^https:\/\/\S+$/.test(t)) return `<span style="display:block;margin:6px 0 4px">${button(buttons[t] || 'Open link', t)}</span>`;
      return escapeHtml(line).replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:${C.link};text-decoration:underline">${u}</a>`);
    });
    return `<p style="margin:0 0 14px;line-height:1.65;color:${C.dim};font:15px/1.65 ${FONT}">${lines.join('<br>')}</p>`;
  }).join('');
}
/** an item card at the top of the email: picture, status badge, title, a line under it, and details */
function cardHtml(card){
  if (!card) return '';
  const rows = (card.rows || []).filter(r => r && r[1] !== undefined && r[1] !== null && r[1] !== '').map(([k, v]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:${C.faint};font:13px/1.4 ${FONT};white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0;color:${C.ink};font:14px/1.45 ${FONT}">${escapeHtml(v)}</td></tr>`).join('');
  const img = card.image ? `<td width="104" valign="top" style="padding:20px 20px 20px 0"><img src="${escapeHtml(card.image)}" width="104" alt="" style="display:block;width:104px;height:auto;border-radius:12px;border:1px solid ${C.line}"></td>` : '';
  const badge = card.badge ? `<span style="display:inline-block;padding:7px 12px;border-radius:999px;background:${card.tone === 'bad' ? '#ff8c8c' : '#7fe0a6'};color:${card.tone === 'bad' ? '#2a0c0c' : '#0b2416'};font:700 11px/1 ${MONO};letter-spacing:.16em;text-transform:uppercase">&#10003;&nbsp;${escapeHtml(card.badge)}</span>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;background:${C.inner};border:1px solid ${C.line};border-radius:18px">
<tr><td valign="top" style="padding:20px">${badge}
<div style="margin:${badge ? '14px' : '0'} 0 4px;color:${C.ink};font:500 22px/1.25 ${SERIF}">${escapeHtml(card.title || '')}</div>
${card.subtitle ? `<div style="color:${C.dim};font:14px/1.5 ${FONT}">${escapeHtml(card.subtitle)}</div>` : ''}
${rows ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px">${rows}</table>` : ''}
${card.cta ? `<div style="margin-top:18px">${button(card.cta.label, card.cta.url)}</div>` : ''}
</td>${img}</tr></table>`;
}
function layout(inner, siteName, { card, site } = {}){
  const store = site ? `${site}/?page=store` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.bg}" style="background:${C.bg};background-image:radial-gradient(ellipse at 50% 0,#3a2016 0,${C.bg} 62%)">
<tr><td align="center" style="padding:30px 14px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td style="padding:0 6px 14px;color:${C.amber};font:700 11px/1 ${MONO};letter-spacing:.22em;text-transform:uppercase">${escapeHtml(siteName)}</td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:24px;padding:26px 24px 12px">
${cardHtml(card)}${inner}
</td></tr>
${store ? `<tr><td align="center" style="padding:22px 6px 6px">${button('Explore the store', store, false)}</td></tr>` : ''}
<tr><td align="center" style="padding:14px 6px 0;color:${C.faint};font:12px/1.5 ${FONT}">${escapeHtml(siteName)}${site ? ` &middot; <a href="${escapeHtml(site)}" style="color:${C.faint}">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

// Built-in templates; the portal can override subject/body per key (email_templates table).
export const DEFAULT_TEMPLATES = {
  contact_notify: { subject: 'New message: {{subject}}', body: 'From: {{name}} <{{email}}>\n\n{{message}}\n\nOpen the inbox: {{portal_url}}' },
  contact_autoreply: { subject: 'Thanks for your message', body: 'Hi {{name}},\n\nThanks for reaching out. I read every message and will reply soon.\n\n{{signature}}' },
  notify_confirm: { subject: 'You’re on the list', body: 'Thanks! You’ll get one email when {{topic_name}} launches.\n\n{{signature}}' },
  order_delivery: { subject: 'Your download is ready: {{product_title}} (order {{order_id}})', body: 'Hello,\n\nThank you for your purchase. Your order {{order_id}} is confirmed and {{product_title}} is ready to download.\n\nDownload your files\n{{download_url}}\n\nThis secure link works until {{expires}} and allows up to {{max_downloads}} downloads. Please save the files somewhere safe once they have downloaded.\n\n{{extra_note}}\n\nYour license\n{{license_name}} license. The full terms are attached to this email as LICENSE.txt, and the key points are below.\n\n{{license_text}}\n\nYour receipt follows in a separate email. If the link expires, you can request a new one at any time from the store with "Email me my download links", using this email address.\n\nIf anything does not work as expected, just reply to this email and we will help.\n\n{{signature}}' },
  order_receipt: { subject: 'Receipt {{invoice_number}} for order {{order_id}}', body: 'Receipt / Invoice {{invoice_number}}\nDate: {{date}}\nOrder: {{order_id}}\nBilled to: {{email}}\n\n{{lines}}\n\nSubtotal: {{subtotal}}\nDiscount: {{discount}}\n{{tax_label}}: {{tax}}\nTotal paid: {{total}}\n\nPayment reference: {{payment_id}}\n{{seller_block}}\n\n{{signature}}' },
  resend_link: { subject: 'Your download links', body: 'Here are fresh download links for your orders:\n\n{{links}}\n\nEach link works until {{expires}}.\n\n{{signature}}' },
  report: { subject: '{{period}} sales report', body: '{{summary}}\n\nOpen the portal: {{portal_url}}' },
  alert: { subject: 'Alert: {{title}}', body: '{{body}}' },
  reply: { subject: 'Re: {{subject}}', body: '{{body}}\n\n{{signature}}' },
  launch: { subject: '{{topic_title}} is live', body: 'Hi,\n\nYou asked to hear when {{topic_name}} launches. It’s ready now:\n{{link}}\n\n{{message}}\n\nYou got this one email because you signed up on the site; you won’t get more about it.\n\n{{signature}}' }
};

export async function loadTemplate(key){
  const db = await getDb();
  const row = await db.maybeOne('select subject, body_md from email_templates where key = $1', [key]);
  const def = DEFAULT_TEMPLATES[key];
  if (!row && !def) throw new Error(`Unknown email template ${key}.`);
  return row ? { subject: row.subject, body: row.body_md } : { ...def };
}

// Sends one email. Returns {ok, id} and never throws for provider failures (they are logged in
// email_log and surfaced in the portal), so a slow or broken provider can't break a checkout.
export async function sendEmail({ to, template, vars = {}, replyTo, attachments, subjectOverride, bodyOverride, card, buttons }){
  const db = await getDb();
  const siteName = env('SITE_NAME', 'Kethan Artzz');
  const from = { email: env('MAIL_FROM', 'no-reply@localhost'), name: env('MAIL_FROM_NAME', siteName) };
  const tpl = await loadTemplate(template);
  const allVars = { signature: env('MAIL_SIGNATURE', `— ${siteName}`), ...vars };
  const subject = fill(subjectOverride ?? tpl.subject, allVars).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const text = fill(bodyOverride ?? tpl.body, allVars).replace(/\n{3,}/g, '\n\n');   // an empty placeholder never leaves a gap
  const site = (env('PUBLIC_SITE_URL') || '').replace(/\/+$/, '');
  const html = layout(textToHtml(text, buttons || (card?.cta ? { [card.cta.url]: card.cta.label } : {})), siteName, { card, site: /^https?:\/\//.test(site) ? site : '' });
  try {
    const res = await getTransport().send({ from, to, replyTo, subject, text, html, attachments });
    await db.query('insert into email_log (to_email, subject, template, status, provider_id) values ($1,$2,$3,$4,$5)', [to, subject, template, 'sent', res.id || null]);
    return { ok: true, id: res.id };
  } catch (err){
    await db.query('insert into email_log (to_email, subject, template, status, error) values ($1,$2,$3,$4,$5)', [to, subject, template, 'failed', String(err.message).slice(0, 300)]);
    return { ok: false, error: err.message };
  }
}
