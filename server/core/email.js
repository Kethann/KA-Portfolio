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
// ---- the HTML version. Templates stay plain text (easy to edit in the portal); the layout reads their shape:
//   a paragraph that is only a link          -> a button (the line above it, when short, is the button's label)
//   a short first line over more text         -> a small section heading
//   lines like "Total paid: ₹499"             -> a tidy two-column table
//   the signature line ("— Name")             -> a signed footer
const INK = '#1d1a1c', DIM = '#6f6660', ACCENT = '#c9864f', LINE = '#efe6de';
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const linkify = (esc) => esc.replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:${ACCENT};text-decoration:underline;word-break:break-all">${u}</a>`);
const isUrl = (line) => /^https:\/\/\S+$/.test(line.trim());
const isLabel = (line) => line.length <= 40 && !/[.!?:,]$/.test(line.trim()) && !isUrl(line);
const KV = /^([A-Z][^:\n]{0,30}):\s+(.+)$/;
function button(url, label){
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 20px"><tr><td style="border-radius:999px;background:${ACCENT};background-image:linear-gradient(135deg,#e0a066,#b8703c)">`
    + `<a href="${url}" style="display:inline-block;padding:13px 26px;font:600 15px/1 ${FONT};color:#fff;text-decoration:none;border-radius:999px">${label} &rarr;</a></td></tr></table>`
    + `<p style="margin:-10px 0 18px;font:12px/1.5 ${FONT};color:${DIM}">Or open this link: ${linkify(url)}</p>`;
}
export function textToHtml(body){
  const out = [];
  for (const raw of String(body ?? '').split(/\n{2,}/)){
    const lines = raw.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
    if (!lines.length) continue;
    const esc = lines.map(escapeHtml);
    // a lone link, optionally under its label
    if (lines.length <= 2 && isUrl(lines[lines.length - 1]) && (lines.length === 1 || isLabel(lines[0]))){
      out.push(button(esc[esc.length - 1], lines.length === 2 ? esc[0] : 'Open'));
      continue;
    }
    // the signature
    if (lines.length === 1 && /^[—–-]\s/.test(lines[0])){
      out.push(`<p style="margin:22px 0 4px;font:italic 500 16px/1.4 Georgia,'Times New Roman',serif;color:${INK}">${esc[0]}</p>`);
      continue;
    }
    // key: value rows (receipts, order details)
    if (lines.length >= 2 && lines.filter(l => KV.test(l)).length >= Math.max(2, lines.length - 1)){
      const rows = lines.map((l, i) => {
        const m = KV.exec(l);
        if (!m) return `<tr><td colspan="2" style="padding:10px 0 6px;font:600 13px/1.4 ${FONT};color:${INK}">${esc[i]}</td></tr>`;
        const strong = /^total/i.test(m[1]);
        return `<tr><td style="padding:7px 12px 7px 0;border-top:1px solid ${LINE};font:13px/1.4 ${FONT};color:${DIM}">${escapeHtml(m[1])}</td>`
          + `<td align="right" style="padding:7px 0;border-top:1px solid ${LINE};font:${strong ? 700 : 500} ${strong ? 15 : 13}px/1.4 ${FONT};color:${INK}">${linkify(escapeHtml(m[2]))}</td></tr>`;
      }).join('');
      out.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-bottom:1px solid ${LINE}">${rows}</table>`);
      continue;
    }
    // a short heading over its text
    let head = '';
    if (lines.length >= 2 && isLabel(lines[0]) && lines[0].length <= 32 && !KV.test(lines[0])){ head = esc.shift(); }
    if (head) out.push(`<p style="margin:8px 0 6px;font:700 11px/1.4 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${ACCENT}">${head}</p>`);
    if (esc.length) out.push(`<p style="margin:0 0 16px;font:15px/1.65 ${FONT};color:${INK}">${linkify(esc.join('<br>'))}</p>`);
  }
  return out.join('\n');
}
function layout(inner, siteName, { title = '', preheader = '', site = '' } = {}){
  const name = escapeHtml(siteName), initials = escapeHtml(String(siteName).split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || 'KA');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(title || siteName)}</title></head>
<body style="margin:0;padding:0;background:#f3eee9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3eee9"><tr><td align="center" style="padding:28px 14px 36px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
<tr><td style="border-radius:18px 18px 0 0;background:#16121a;background-image:radial-gradient(120% 140% at 0% 0%,#3a2516 0%,#16121a 55%),linear-gradient(135deg,#1d1620,#120e14);padding:26px 30px 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td width="44" valign="middle"><div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#f0b37c,#b8703c);font:800 15px/40px ${FONT};color:#1b130d;text-align:center;letter-spacing:.04em">${initials}</div></td>
    <td valign="middle" style="padding-left:12px;font:700 12px/1.3 ${FONT};letter-spacing:.2em;text-transform:uppercase;color:#f3dcc6">${name}</td>
  </tr></table>
  ${title ? `<h1 style="margin:22px 0 0;font:600 25px/1.25 Georgia,'Times New Roman',serif;color:#fff7ef;letter-spacing:-.01em">${escapeHtml(title)}</h1>` : ''}
</td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,#e0a066,#b8703c 55%,#7d4a8f);font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="background:#ffffff;border:1px solid #ebe1d8;border-top:0;border-radius:0 0 18px 18px;padding:30px 30px 22px">
${inner}
</td></tr>
<tr><td align="center" style="padding:18px 20px 0;font:12px/1.6 ${FONT};color:#8b817a">
  ${site ? `<a href="${escapeHtml(site)}" style="color:#8b817a;text-decoration:none;font-weight:600">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a><br>` : ''}
  You’re getting this because of something you did on ${name}. Reply to this email any time.
</td></tr>
</table></td></tr></table></body></html>`;
}

// Built-in templates; the portal can override subject/body per key (email_templates table).
export const DEFAULT_TEMPLATES = {
  contact_notify: { subject: "New message: {{subject}}", title: "You have a new message", body: "From\n{{name}} <{{email}}>\n\nRegarding\n{{subject}}\n\n{{message}}\n\nOpen it in your inbox\n{{portal_url}}" },
  contact_autoreply: { subject: "Thanks for your message", title: "Message received", body: "Hi {{name}},\n\nThank you for getting in touch. Your message has reached me and I read every one personally, so you’ll hear back from me soon.\n\nWhen I reply, it will arrive in this inbox and also pop up on the site, on the device you wrote from.\n\n{{signature}}" },
  notify_confirm: { subject: "You’re on the list", title: "You’re on the list", body: "Thanks for signing up. You’ll get one email, the moment {{topic_name}} launches. Nothing else, no newsletters.\n\n{{signature}}" },
  order_delivery: { subject: "Your download is ready: {{product_title}} (order {{order_id}})", title: "Your download is ready", body: "Hello,\n\nThank you for your purchase. Your order {{order_id}} is confirmed and {{product_title}} is ready to download.\n\nDownload your files\n{{download_url}}\n\nThis secure link works until {{expires}} and allows up to {{max_downloads}} downloads. Please save the files somewhere safe once they have downloaded.\n\n{{extra_note}}\n\nYour license\n{{license_name}} license. The full terms are attached to this email as LICENSE.txt, and the key points are below.\n\n{{license_text}}\n\nYour receipt follows in a separate email. If the link expires, you can request a new one at any time from the store with \"Email me my download links\", using this email address.\n\nIf anything does not work as expected, just reply to this email and we will help.\n\n{{signature}}" },
  order_receipt: { subject: "Receipt {{invoice_number}} for order {{order_id}}", title: "Payment received, thank you", body: "Receipt {{invoice_number}}\nDate: {{date}}\nOrder: {{order_id}}\nBilled to: {{email}}\n\n{{lines}}\n\nSubtotal: {{subtotal}}\nDiscount: {{discount}}\n{{tax_label}}: {{tax}}\nTotal paid: {{total}}\n\nPayment reference: {{payment_id}}\n{{seller_block}}\n\n{{signature}}" },
  resend_link: { subject: "Your download links", title: "Fresh download links", body: "Here are fresh download links for your orders:\n\n{{links}}\n\nEach link works until {{expires}}.\n\n{{signature}}" },
  report: { subject: "{{period}} sales report", title: "{{period}} sales report", body: "{{summary}}\n\nOpen the portal\n{{portal_url}}" },
  alert: { subject: "Alert: {{title}}", title: "{{title}}", body: "{{body}}" },
  reply: { subject: "Re: {{subject}}", title: "A reply to your message", body: "Hi {{name}},\n\n{{body}}\n\nRead this conversation on the site\n{{thread_url}}\n\nYou can also simply reply to this email.\n\n{{signature}}" },
  launch: { subject: "{{topic_title}} is live", title: "{{topic_title}} is live", body: "Hi,\n\nYou asked to hear when {{topic_name}} launches. It’s ready now.\n\nTake a look\n{{link}}\n\n{{message}}\n\nYou got this one email because you signed up on the site; you won’t get more about it.\n\n{{signature}}" },
  store_access: { subject: "Your early access to the store", title: "You’re on the guest list", body: "Hi,\n\nThe store is closed to the public right now, but you have special access. Open the link below on the device you want to shop from, and the store opens for you.\n\nOpen the store\n{{link}}\n\nThe link is personal to you, so please don’t share it.\n\n{{signature}}" }
};

export async function loadTemplate(key){
  const db = await getDb();
  const row = await db.maybeOne('select subject, body_md from email_templates where key = $1', [key]);
  const def = DEFAULT_TEMPLATES[key];
  if (!row && !def) throw new Error(`Unknown email template ${key}.`);
  return row ? { subject: row.subject, body: row.body_md, title: def?.title || '' } : { ...def };
}

// Sends one email. Returns {ok, id} and never throws for provider failures (they are logged in
// email_log and surfaced in the portal), so a slow or broken provider can't break a checkout.
export async function sendEmail({ to, template, vars = {}, replyTo, attachments, subjectOverride, bodyOverride }){
  const db = await getDb();
  const siteName = env('SITE_NAME', 'Kethan Artzz');
  const from = { email: env('MAIL_FROM', 'no-reply@localhost'), name: env('MAIL_FROM_NAME', siteName) };
  const tpl = await loadTemplate(template);
  const allVars = { signature: env('MAIL_SIGNATURE', `— ${siteName}`), ...vars };
  const subject = fill(subjectOverride ?? tpl.subject, allVars).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const text = fill(bodyOverride ?? tpl.body, allVars).replace(/\n{3,}/g, '\n\n');   // an empty placeholder never leaves a gap
  const title = fill(tpl.title || '', allVars).replace(/[\r\n]+/g, ' ').slice(0, 120) || subject;
  // the grey line inbox lists show under the subject
  const preheader = text.replace(/^Hi [^,\n]*,?\s*/, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 110);
  const html = layout(textToHtml(text), siteName, { title, preheader, site: env('PUBLIC_SITE_URL', '') });
  try {
    const res = await getTransport().send({ from, to, replyTo, subject, text, html, attachments });
    await db.query('insert into email_log (to_email, subject, template, status, provider_id) values ($1,$2,$3,$4,$5)', [to, subject, template, 'sent', res.id || null]);
    return { ok: true, id: res.id };
  } catch (err){
    await db.query('insert into email_log (to_email, subject, template, status, error) values ($1,$2,$3,$4,$5)', [to, subject, template, 'failed', String(err.message).slice(0, 300)]);
    return { ok: false, error: err.message };
  }
}
