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
// Plain text -> simple HTML: escaped paragraphs, line breaks, and clickable https links.
export function textToHtml(body){
  const esc = escapeHtml(body);
  const linked = esc.replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:#c9864f">${u}</a>`);
  return linked.split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;line-height:1.6">${p.replace(/\n/g, '<br>')}</p>`).join('');
}
function layout(inner, siteName){
  return `<!doctype html><html><body style="margin:0;background:#f4f1ee;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1a1c">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 28px 18px;border:1px solid #eadfd6">
<div style="font-weight:700;letter-spacing:.08em;font-size:12px;color:#9a6a44;margin-bottom:18px">${escapeHtml(siteName)}</div>
${inner}</div></body></html>`;
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
export async function sendEmail({ to, template, vars = {}, replyTo, attachments, subjectOverride, bodyOverride }){
  const db = await getDb();
  const siteName = env('SITE_NAME', 'Kethan Artzz');
  const from = { email: env('MAIL_FROM', 'no-reply@localhost'), name: env('MAIL_FROM_NAME', siteName) };
  const tpl = await loadTemplate(template);
  const allVars = { signature: env('MAIL_SIGNATURE', `— ${siteName}`), ...vars };
  const subject = fill(subjectOverride ?? tpl.subject, allVars).replace(/[\r\n]+/g, ' ').slice(0, 200);
  const text = fill(bodyOverride ?? tpl.body, allVars).replace(/\n{3,}/g, '\n\n');   // an empty placeholder never leaves a gap
  const html = layout(textToHtml(text), siteName);
  try {
    const res = await getTransport().send({ from, to, replyTo, subject, text, html, attachments });
    await db.query('insert into email_log (to_email, subject, template, status, provider_id) values ($1,$2,$3,$4,$5)', [to, subject, template, 'sent', res.id || null]);
    return { ok: true, id: res.id };
  } catch (err){
    await db.query('insert into email_log (to_email, subject, template, status, error) values ($1,$2,$3,$4,$5)', [to, subject, template, 'failed', String(err.message).slice(0, 300)]);
    return { ok: false, error: err.message };
  }
}
