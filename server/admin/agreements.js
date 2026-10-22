// Project agreements. The owner prepares one in the portal (often straight from a contact message) and sends it; the
// client opens a private link, reads it, ticks the key terms, types their name and draws their signature. The text they
// sign is frozen when it is sent (and fingerprinted with SHA-256), every step is recorded as evidence, both sides get a
// copy by email, and the signed copy can be opened (and saved as PDF) at any time from the same link or the portal.
import { json, readJson, HttpError } from '../core/http.js';
import { env, siteUrl } from '../core/env.js';
import { getDb } from '../core/db.js';
import { getSetting, getSettingWithRevision, setSetting } from '../core/settings.js';
import { hmacHex, safeEqual, sha256hex } from '../core/crypto.js';
import { rateLimit } from '../core/guard.js';
import { str, email as vEmail, uuid as vUuid } from '../core/validate.js';
import { sendEmail, escapeHtml } from '../core/email.js';
import { audit } from './auth.js';
import { pushReply } from '../handlers/threads.js';
import { buildAgreement, agreementText, cleanDefaults, cleanProject, money, AGREEMENT_DEFAULTS } from '../../shared/agreement.js';

const sign = (id) => hmacHex(env('DOWNLOAD_TOKEN_SECRET', 'local-development-only'), `agreement:${id}`).slice(0, 32);
const tokenOk = (id, t) => typeof t === 'string' && t.length <= 64 && safeEqual(t, sign(id));
export const agreementLink = (base, id) => `${String(base).replace(/\/+$/, '')}/agreement/${id}?t=${sign(id)}`;
const istDate = (d = new Date()) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d));
const istTime = (d) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(d)) + ' IST';

async function defaults(){ return cleanDefaults(await getSetting('agreements').catch(() => ({})) || {}); }
const ownerEmail = async () => (await getSetting('messages').catch(() => ({})))?.notifyEmail || env('OWNER_EMAIL', '');

// ---- portal ----------------------------------------------------------------------------------------------
const LIST_COLS = 'id, number, status, client_name, client_email, title, data, message_id, created_at, updated_at, sent_at, viewed_at, signed_at, declined_at, voided_at, advance_paid_at';
const view = (r, base) => r && ({ ...r, link: r.status === 'draft' ? null : agreementLink(base, r.id) });

export async function listAgreements(ctx){
  const db = await getDb();
  const rows = await db.query(`select ${LIST_COLS} from agreements order by created_at desc limit 500`);
  return json({ agreements: rows.map(r => view(r, siteUrl(ctx.request))) });
}
export async function getAgreement(ctx){
  const id = vUuid(ctx.params.id, 'Agreement');
  const db = await getDb();
  const r = await db.maybeOne(`select ${LIST_COLS}, document_hash, decline_reason, signer_name, signer_ip, signer_ua, signer_country, advance_note, meta from agreements where id = $1`, [id]);
  if (!r) throw new HttpError(404, 'Agreement not found.');
  return json({ agreement: view(r, siteUrl(ctx.request)) });
}
function fromBody(b){
  return {
    clientName: str(b.clientName, { name: 'Client name', max: 120, required: true }),
    clientEmail: vEmail(b.clientEmail),
    title: str(b.title, { name: 'Project title', max: 160, required: true }),
    messageId: b.messageId ? vUuid(b.messageId, 'Message') : null,
    project: b.project && typeof b.project === 'object' ? b.project : {}
  };
}
async function nextNumber(db){
  const year = new Date().getUTCFullYear();
  const r = await db.one(`select count(*) as n from agreements where number like $1`, [`KA-AG-${year}-%`]);
  return `KA-AG-${year}-${String(Number(r.n) + 1).padStart(4, '0')}`;
}
export async function createAgreement(ctx){
  const f = fromBody(await readJson(ctx.request, 64 * 1024));
  const db = await getDb();
  const project = cleanProject(f.project, await defaults());
  for (let i = 0; i < 5; i++){
    try {
      const number = await nextNumber(db);
      const row = await db.one(`insert into agreements (number, message_id, client_name, client_email, title, data) values ($1, $2, $3, $4, $5, $6) returning id`,
        [i ? number.replace(/(\d+)$/, (m) => String(Number(m) + i).padStart(4, '0')) : number, f.messageId, f.clientName, f.clientEmail, f.title, project]);
      await audit(ctx, 'agreement_created', row.id);
      return getAgreement({ ...ctx, params: { id: row.id } });
    } catch (e){ if (!/unique/i.test(String(e.message))) throw e; }
  }
  throw new HttpError(409, 'Could not number the agreement. Try again.');
}
export async function updateAgreement(ctx){
  const id = vUuid(ctx.params.id, 'Agreement');
  const f = fromBody(await readJson(ctx.request, 64 * 1024));
  const db = await getDb();
  const cur = await db.maybeOne('select status from agreements where id = $1', [id]);
  if (!cur) throw new HttpError(404, 'Agreement not found.');
  if (cur.status !== 'draft') throw new HttpError(409, 'Only a draft can be edited. Withdraw it first to change it.');
  await db.query(`update agreements set client_name = $2, client_email = $3, title = $4, data = $5, message_id = coalesce($6, message_id), updated_at = now() where id = $1`,
    [id, f.clientName, f.clientEmail, f.title, cleanProject(f.project, await defaults()), f.messageId]);
  return getAgreement(ctx);
}
export async function deleteAgreement(ctx){
  const id = vUuid(ctx.params.id, 'Agreement');
  const db = await getDb();
  const n = (await db.query(`delete from agreements where id = $1 and status = 'draft' returning 1`, [id])).length;
  if (!n) throw new HttpError(409, 'Only drafts can be deleted. A sent or signed agreement can be voided, and stays on record.');
  await audit(ctx, 'agreement_deleted', id);
  return json({ ok: true });
}

/** the full agreement for one row, built from its frozen document when it has one */
export function frozen(r){ try { return r.document ? JSON.parse(r.document) : null; } catch { return null; } }

// Send: the text is frozen and fingerprinted here, then the client gets their private link by email (and, when the
// agreement came from a contact message, on the device they wrote from as a reply).
export async function sendAgreement(ctx){
  const id = vUuid(ctx.params.id, 'Agreement');
  const db = await getDb();
  const r = await db.maybeOne('select * from agreements where id = $1', [id]);
  if (!r) throw new HttpError(404, 'Agreement not found.');
  if (!['draft', 'sent'].includes(r.status)) throw new HttpError(409, `This agreement is ${r.status}; it can’t be sent again.`);
  const base = siteUrl(ctx.request), link = agreementLink(base, id);
  let doc = frozen(r);
  if (r.status === 'draft'){
    const D = await defaults();
    if (!D.legalName) throw new HttpError(400, 'Add your legal name in Agreements › Default terms first: it is the name the client contracts with.');
    const P = cleanProject(r.data, D);
    if (!(P.fee > 0)) throw new HttpError(400, 'Set the total fee before sending.');
    if (!P.scope) throw new HttpError(400, 'Describe the scope of work before sending.');
    doc = buildAgreement({ number: r.number, title: r.title, clientName: r.client_name, clientEmail: r.client_email, date: istDate(), project: P, defaults: D, ownerEmail: await ownerEmail() });
    const text = JSON.stringify(doc);
    await db.query(`update agreements set status = 'sent', document = $2, document_hash = $3, sent_at = now(), updated_at = now() where id = $1 and status = 'draft'`, [id, text, sha256hex(agreementText(doc))]);
  }
  const fig = doc.figures;
  const res = await sendEmail({ to: r.client_email, template: 'agreement_request', replyTo: (await ownerEmail()) || undefined,
    vars: { name: r.client_name, title: r.title, number: r.number, link, advance: money(fig.advance, fig.currency), advance_percent: String(fig.advancePercent), fee: money(fig.fee, fig.currency) },
    buttons: { [link]: 'Read and sign the agreement' } });
  if (r.message_id && r.status === 'draft'){
    // the conversation on their device shows it too (and wakes it, when they allowed notifications)
    try {
      await db.query('insert into message_replies (message_id, body, status) values ($1, $2, $3)', [r.message_id, `I’ve prepared the project agreement for “${r.title}”. Please read and sign it here before we start: ${link}`, 'sent']);
      await pushReply(r.message_id);
    } catch { /* the email is what counts */ }
  }
  await note(db, id, { event: 'sent', email: res.ok });
  await audit(ctx, 'agreement_sent', id);
  if (!res.ok) throw new HttpError(502, 'The agreement is ready, but the email couldn’t be sent. Copy the link and send it yourself, or check the email settings.');
  return getAgreement(ctx);
}
export async function withdrawAgreement(ctx){
  const id = vUuid(ctx.params.id, 'Agreement');
  const db = await getDb();
  const n = (await db.query(`update agreements set status = 'draft', document = null, document_hash = null, updated_at = now() where id = $1 and status = 'sent' returning 1`, [id])).length;
  if (!n) throw new HttpError(409, 'Only an agreement that is waiting for a signature can be withdrawn.');
  await note(db, id, { event: 'withdrawn' });
  await audit(ctx, 'agreement_withdrawn', id);
  return getAgreement(ctx);
}
export async function voidAgreement(ctx){
  const id = vUuid(ctx.params.id, 'Agreement');
  const b = await readJson(ctx.request, 4096);
  const reason = str(b.reason, { name: 'Reason', max: 300 });
  const db = await getDb();
  const n = (await db.query(`update agreements set status = 'void', voided_at = now(), updated_at = now() where id = $1 and status in ('sent', 'signed', 'declined') returning 1`, [id])).length;
  if (!n) throw new HttpError(409, 'This agreement can’t be voided.');
  await note(db, id, { event: 'voided', reason });
  await audit(ctx, 'agreement_voided', id, { reason });
  return getAgreement(ctx);
}
export async function markAdvance(ctx){
  const id = vUuid(ctx.params.id, 'Agreement');
  const b = await readJson(ctx.request, 4096);
  const db = await getDb();
  const paid = b.paid !== false;
  await db.query(`update agreements set advance_paid_at = case when $2 then coalesce(advance_paid_at, now()) else null end, advance_note = $3, updated_at = now() where id = $1`,
    [id, paid, str(b.note, { name: 'Note', max: 300 })]);
  await audit(ctx, paid ? 'agreement_advance_paid' : 'agreement_advance_unpaid', id);
  return getAgreement(ctx);
}
export async function getDefaults(){
  const { value, revision } = await getSettingWithRevision('agreements');
  return json({ value: cleanDefaults(value || {}), revision, base: AGREEMENT_DEFAULTS });
}
export async function saveDefaults(ctx){
  const b = await readJson(ctx.request, 32 * 1024);
  const value = cleanDefaults(b.value || {});
  if (value.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.email)) throw new HttpError(400, 'The notice email must be an email address.');
  const rev = await setSetting('agreements', value, Number(b.revision) || 0);
  if (rev === null) throw new HttpError(409, 'These terms were changed in another window. Reload them first.', { code: 'stale' });
  await audit(ctx, 'settings_saved', 'agreements');
  return json({ value, revision: rev });
}
// the evidence trail: every step, with time (and where the client acted, their internet address)
async function note(db, id, entry){
  const r = await db.maybeOne('select meta from agreements where id = $1', [id]);
  const meta = r?.meta && typeof r.meta === 'object' ? r.meta : {};
  const log = [...(Array.isArray(meta.log) ? meta.log : []), { at: new Date().toISOString(), ...entry }].slice(-60);
  await db.query('update agreements set meta = $2 where id = $1', [id, { ...meta, log }]);
}

// ---- the client's side -------------------------------------------------------------------------------------
const CONSENTS = ['read', 'advance', 'cancellation', 'esign'];
async function loadForClient(ctx, id, t){
  await rateLimit(`agreement:${ctx.ip}`, 120, 10 * 60);
  if (!/^[0-9a-f-]{36}$/.test(id) || !tokenOk(id, t)) return null;
  const db = await getDb();
  return { db, r: await db.maybeOne('select * from agreements where id = $1', [id]) };
}

export async function agreementPage(ctx){
  const id = String(ctx.params.id || ''), t = ctx.url.searchParams.get('t') || '';
  const got = await loadForClient(ctx, id, t);
  if (!got?.r) return page(404, 'Agreement not found', `<h1>Agreement not found</h1><p class="lead">This link isn’t valid. Please use the link from your email, or reply to it and ask for a new one.</p>`);
  const { db, r } = got;
  if (r.status === 'draft') return page(200, 'Being updated', `<p class="eyebrow">${esc(r.number)}</p><h1>This agreement is being updated</h1><p class="lead">The creator is making a change. You’ll get an email as soon as the new version is ready.</p>`);
  if (r.status === 'sent' && !r.viewed_at) await db.query('update agreements set viewed_at = now() where id = $1 and viewed_at is null', [id]);
  if (r.status === 'sent') await note(db, id, { event: 'viewed', ip: ctx.ip, country: ctx.geo?.country || null });
  const doc = frozen(r);
  if (!doc) return page(500, 'Agreement', '<h1>This agreement can’t be shown</h1>');
  const sig = await creatorSignature();
  return page(200, `${r.status === 'signed' ? 'Signed: ' : ''}${r.title}`, renderAgreement(r, doc, t, sig), { script: r.status === 'sent', css: sig.face });
}

export async function signAgreement(ctx){
  const id = String(ctx.params.id || '');
  const b = await readJson(ctx.request, 400 * 1024);
  const got = await loadForClient(ctx, id, b.t);
  if (!got?.r) throw new HttpError(404, 'This link isn’t valid.');
  const { db, r } = got;
  if (r.status === 'signed') throw new HttpError(409, 'This agreement is already signed.');
  if (r.status !== 'sent') throw new HttpError(409, 'This agreement can no longer be signed. Please contact the creator.');
  if (b.hash !== r.document_hash) throw new HttpError(409, 'The agreement changed while you were reading it. Please reload the page and read the new version.');
  if (!CONSENTS.every(k => b.consents && b.consents[k] === true)) throw new HttpError(400, 'Please tick every box to confirm you agree.');
  const name = str(b.name, { name: 'Your full name', max: 120, required: true });
  if (name.replace(/[^\p{L}]/gu, '').length < 2) throw new HttpError(400, 'Type your full name as your signature.');
  const signature = typeof b.signature === 'string' ? b.signature : '';
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) || signature.length < 200 || signature.length > 350 * 1024) throw new HttpError(400, 'Please draw your signature in the box.');
  const ua = (ctx.request.headers.get('user-agent') || '').slice(0, 300);
  const n = (await db.query(`update agreements set status = 'signed', signed_at = now(), signer_name = $2, signer_ip = $3, signer_ua = $4, signer_country = $5, signature = $6, updated_at = now()
    where id = $1 and status = 'sent' returning 1`, [id, name, ctx.ip || null, ua, ctx.geo?.country || null, signature])).length;
  if (!n) throw new HttpError(409, 'This agreement can no longer be signed.');
  await note(db, id, { event: 'signed', ip: ctx.ip, country: ctx.geo?.country || null, consents: CONSENTS, name });
  const done = await db.one('select * from agreements where id = $1', [id]);
  await afterSigned(ctx, done);
  return json({ ok: true });
}
async function afterSigned(ctx, r){
  const doc = frozen(r), fig = doc.figures, base = siteUrl(ctx.request), link = agreementLink(base, r.id);
  const D = await defaults();
  const copy = signedCopyText(r, doc);
  const file = { name: `${r.number} - ${r.title.replace(/[^\w .()-]+/g, '').slice(0, 60)}.txt`, content: copy };
  await sendEmail({ to: r.client_email, template: 'agreement_signed', replyTo: (await ownerEmail()) || undefined, attachments: [file],
    vars: { name: r.client_name, title: r.title, number: r.number, link, advance: money(fig.advance, fig.currency),
      payment: [D.paymentDetails ? `Payment details: ${D.paymentDetails}` : '', cleanProject(r.data, D).paymentLink ? `Pay online: ${cleanProject(r.data, D).paymentLink}` : ''].filter(Boolean).join('\n') || 'I’ll send the payment details for the advance by email.' },
    buttons: { [link]: 'Open the signed agreement' } });
  const to = await ownerEmail();
  if (to) await sendEmail({ to, template: 'agreement_owner', attachments: [file],
    vars: { headline: `Signed: ${r.title} (${r.number})`, details: `${r.signer_name} <${r.client_email}> signed ${r.number} on ${istTime(r.signed_at)}.\n\nAdvance due before work starts: ${money(fig.advance, fig.currency)} (${fig.advancePercent}%).\nTotal fee: ${money(fig.fee, fig.currency)}.`, portal_url: `${base.replace(/\/+$/, '')}/portal/#agreements/${r.id}` } });
}
export async function declineAgreement(ctx){
  const id = String(ctx.params.id || '');
  const b = await readJson(ctx.request, 8 * 1024);
  const got = await loadForClient(ctx, id, b.t);
  if (!got?.r) throw new HttpError(404, 'This link isn’t valid.');
  const { db, r } = got;
  const reason = str(b.reason, { name: 'Reason', max: 1000 });
  const n = (await db.query(`update agreements set status = 'declined', declined_at = now(), decline_reason = $2, updated_at = now() where id = $1 and status = 'sent' returning 1`, [id, reason])).length;
  if (!n) throw new HttpError(409, 'This agreement can no longer be declined.');
  await note(db, id, { event: 'declined', ip: ctx.ip, reason });
  const to = await ownerEmail();
  if (to) await sendEmail({ to, template: 'agreement_owner', vars: { headline: `Declined: ${r.title} (${r.number})`, details: `${r.client_name} <${r.client_email}> declined the agreement.${reason ? `\n\nTheir note: ${reason}` : ''}`, portal_url: `${siteUrl(ctx.request).replace(/\/+$/, '')}/portal/#agreements/${r.id}` } });
  return json({ ok: true });
}

// The signed agreement as text, with the signing record at the end (attached to both emails)
export function signedCopyText(r, doc){
  return agreementText(doc) + `\nSIGNATURES\nCreator: ${doc.parties.creator[0]} (issued ${doc.date})\nClient: ${r.signer_name}, signed electronically on ${istTime(r.signed_at)}\n\nSIGNING RECORD\nAgreement: ${r.number}\nSigned from internet address: ${r.signer_ip || 'unknown'}${r.signer_country ? ` (${r.signer_country})` : ''}\nDevice: ${r.signer_ua || 'unknown'}\nDocument fingerprint (SHA-256): ${r.document_hash}\nThe drawn signature is kept with the online copy.\n`;
}

// ---- the page ----------------------------------------------------------------------------------------------
const esc = (v) => escapeHtml(String(v ?? ''));
async function creatorSignature(){
  const site = await getSetting('site').catch(() => null);
  const pc = site?.passCard || {}, fonts = site?.details?.customFonts || [];
  const font = fonts.find(f => f.family === pc.signatureFont);
  const face = font && /^(https?:\/\/|\/)[^\s"'()\\]+$/.test(font.url) ? `@font-face{font-family:"ka-sign";src:url("${font.url}");font-display:swap}` : '';
  return { face, family: `${face ? '"ka-sign",' : ''}"Segoe Script","Bradley Hand","Brush Script MT","Lucida Handwriting",cursive`, text: pc.signatureText || 'Kethan Artzz' };
}
function renderAgreement(r, doc, t, sig){
  const signed = r.status === 'signed', open = r.status === 'sent';
  const state = signed ? `<span class="pill ok">&#10003; Signed ${esc(istTime(r.signed_at))}</span>` : r.status === 'declined' ? '<span class="pill bad">Declined</span>' : r.status === 'void' ? '<span class="pill bad">Void: no longer in force</span>' : '<span class="pill wait">Waiting for your signature</span>';
  const parties = (label, rows) => `<div class="party"><p class="eyebrow">${label}</p>${rows.map((x, i) => i ? `<span>${esc(x)}</span>` : `<b>${esc(x)}</b>`).join('')}</div>`;
  const body = `<header class="doc-head"><img class="logo" src="/images/ka-logo.png" alt="" width="54" height="54"><div><p class="eyebrow">Project agreement · ${esc(r.number)}</p><h1>${esc(doc.title)}</h1><p class="meta">Dated ${esc(doc.date)} · ${state}</p></div></header>
<section class="parties">${parties('Creator', doc.parties.creator)}${parties('Client', doc.parties.client)}</section>
<section class="glance" aria-label="At a glance"><p class="eyebrow">At a glance</p><dl>${doc.summary.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></section>
<article class="clauses">${doc.sections.map((s, i) => `<section class="clause"><h2><span>${i + 1}</span>${esc(s.heading)}</h2>${s.paras.map(p => `<p>${esc(p)}</p>`).join('')}</section>`).join('')}</article>
<section class="signs"><div class="sign-box"><p class="eyebrow">For the Creator</p><div class="sig" style="font-family:${esc(sig.family)}">${esc(sig.text)}</div><b>${esc(doc.parties.creator[0])}</b><small>Issued ${esc(doc.date)}</small></div>
<div class="sign-box"><p class="eyebrow">For the Client</p>${signed ? `<img class="sig-img" src="${esc(r.signature)}" alt="Signature of ${esc(r.signer_name)}"><b>${esc(r.signer_name)}</b><small>Signed electronically ${esc(istTime(r.signed_at))}</small>` : '<div class="sig empty">Not signed yet</div>'}</div></section>
${signed ? `<section class="record"><p class="eyebrow">Signing record</p><dl><dt>Agreement</dt><dd>${esc(r.number)}</dd><dt>Signed by</dt><dd>${esc(r.signer_name)} (${esc(r.client_email)})</dd><dt>Date and time</dt><dd>${esc(istTime(r.signed_at))}</dd><dt>Internet address</dt><dd>${esc(r.signer_ip || 'unknown')}${r.signer_country ? ` · ${esc(r.signer_country)}` : ''}</dd><dt>Document fingerprint</dt><dd class="mono">SHA-256 ${esc(r.document_hash)}</dd></dl><p class="small">The fingerprint changes if even one character of the agreement changes, so it shows this is the exact text that was signed.</p></section>
<div class="actions no-print"><button type="button" class="btn primary" data-print>Save as PDF / print</button><a class="btn ghost" href="/">Back to the site</a></div>` : ''}
${open ? signForm(r, doc, t) : ''}
${r.status === 'declined' ? `<p class="lead">You declined this agreement${r.decline_reason ? `: “${esc(r.decline_reason)}”` : ''}. The creator has been told. If you change your mind, reply to the email.</p>` : ''}`;
  return body;
}
function signForm(r, doc, t){
  const f = doc.figures, M = (n) => esc(money(n, f.currency));
  return `<form class="signing no-print" id="sign" data-id="${esc(r.id)}" data-t="${esc(t)}" data-hash="${esc(r.document_hash)}" novalidate>
<h2 class="form-h">Sign this agreement</h2><p class="lead">Please read the whole agreement above. Then confirm each point, type your full name and draw your signature.</p>
<label class="tick"><input type="checkbox" name="read"><span>I have read the whole agreement and I agree to all of its terms.</span></label>
<label class="tick"><input type="checkbox" name="advance"><span>I will pay the advance of <b>${M(f.advance)}</b> (${f.advancePercent}%) before work starts, and I understand it is non-refundable once work has started.</span></label>
<label class="tick"><input type="checkbox" name="cancellation"><span>If I cancel or stop the project after work has started, I will pay the cancellation fee in Clause 6 (at least <b>${M(f.started)}</b>, or <b>${M(f.draft)}</b> after the first drafts) for the time and effort already spent.</span></label>
<label class="tick"><input type="checkbox" name="esign"><span>I agree to sign electronically, and that my electronic signature is legally binding, the same as a handwritten one.</span></label>
<label class="field"><span>Your full legal name</span><input type="text" name="name" autocomplete="name" maxlength="120" required placeholder="${esc(r.client_name)}"></label>
<div class="field"><span>Your signature <button type="button" class="link" data-clear>Clear</button></span><canvas id="pad" width="900" height="260" aria-label="Draw your signature here with your finger, pen or mouse" role="img"></canvas><small>Draw with your finger, a pen or the mouse.</small></div>
<p class="err" id="err" role="alert"></p>
<div class="actions"><button type="submit" class="btn primary" id="go">Sign the agreement</button><button type="button" class="btn ghost" data-decline>I don’t agree</button></div>
<p class="small">Signed on ${esc(istDate())}. When you sign, the date and time, your internet address and device, and a fingerprint of this exact text are recorded, and you’ll get a copy by email.</p>
</form>
<dialog id="decline"><form method="dialog" class="stack"><h2 class="form-h">Decline the agreement</h2><p class="lead">The creator will be told. You can add a note about what you’d like changed.</p>
<textarea name="reason" rows="4" maxlength="1000" placeholder="Optional note"></textarea><div class="actions"><button value="ok" class="btn primary">Decline</button><button value="cancel" class="btn ghost">Go back</button></div></form></dialog>`;
}
const SCRIPT = `(function(){
var f=document.getElementById('sign'),pad=document.getElementById('pad'),err=document.getElementById('err');
document.querySelectorAll('[data-print]').forEach(function(b){b.addEventListener('click',function(){window.print();});});
if(!f||!pad)return;
var g=pad.getContext('2d'),drawn=0,last=null;g.lineWidth=5;g.lineCap='round';g.lineJoin='round';g.strokeStyle='#14100d';
function pt(e){var r=pad.getBoundingClientRect();return{x:(e.clientX-r.left)*pad.width/r.width,y:(e.clientY-r.top)*pad.height/r.height};}
pad.addEventListener('pointerdown',function(e){e.preventDefault();pad.setPointerCapture(e.pointerId);last=pt(e);g.beginPath();g.arc(last.x,last.y,2.4,0,7);g.fillStyle='#14100d';g.fill();});
pad.addEventListener('pointermove',function(e){if(!last)return;var p=pt(e);g.beginPath();g.moveTo(last.x,last.y);g.lineTo(p.x,p.y);g.stroke();drawn+=Math.hypot(p.x-last.x,p.y-last.y);last=p;});
['pointerup','pointercancel','pointerleave'].forEach(function(k){pad.addEventListener(k,function(){last=null;});});
f.querySelector('[data-clear]').addEventListener('click',function(){g.clearRect(0,0,pad.width,pad.height);drawn=0;});
var dlg=document.getElementById('decline');
f.querySelector('[data-decline]').addEventListener('click',function(){if(dlg.showModal)dlg.showModal();});
dlg.addEventListener('close',function(){if(dlg.returnValue!=='ok')return;post('decline',{reason:dlg.querySelector('textarea').value}).then(function(){location.reload();});});
function post(what,extra){var b=Object.assign({t:f.dataset.t},extra);return fetch('/api/agreements/'+f.dataset.id+'/'+what,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json().catch(function(){return{};}).then(function(j){if(!r.ok)throw new Error(j.error||'Something went wrong. Please try again.');return j;});});}
f.addEventListener('submit',function(e){e.preventDefault();err.textContent='';
var c={};['read','advance','cancellation','esign'].forEach(function(k){c[k]=f.elements[k].checked;});
if(!c.read||!c.advance||!c.cancellation||!c.esign){err.textContent='Please tick every box to confirm you agree.';return;}
var name=f.elements.name.value.trim();if(name.length<2){err.textContent='Type your full name.';f.elements.name.focus();return;}
if(drawn<60){err.textContent='Please draw your signature in the box.';return;}
var go=document.getElementById('go');go.disabled=true;go.textContent='Signing…';
post('sign',{name:name,consents:c,hash:f.dataset.hash,signature:pad.toDataURL('image/png')}).then(function(){location.reload();}).catch(function(x){err.textContent=x.message;go.disabled=false;go.textContent='Sign the agreement';});});
})();`;
function page(status, title, body, { script = false, css = '' } = {}){
  const nonce = sha256hex(String(Math.random()) + Date.now()).slice(0, 24);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0f0c0b"><title>${esc(title)} · Kethan Artzz</title><link rel="icon" href="/images/ka-logo.png">
<style>
:root{color-scheme:dark;--ink:#efe9e2;--dim:rgba(239,233,226,.7);--faint:rgba(239,233,226,.46);--line:rgba(255,255,255,.12);--amber:#ff9438}
*{box-sizing:border-box}body{margin:0;background:#0f0c0b radial-gradient(ellipse at 50% -20%,#3a2016 0,transparent 60%) no-repeat;color:var(--ink);font:16px/1.65 Manrope,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:max(22px,env(safe-area-inset-top)) 16px 64px}
main{width:min(820px,100%);margin:0 auto}a{color:#ffc795}
.eyebrow{font:700 11px/1.2 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.18em;text-transform:uppercase;color:#d08a52;margin:0 0 8px}
h1{margin:0;font:500 clamp(26px,5vw,38px)/1.15 Georgia,"Times New Roman",serif}.meta{margin:8px 0 0;color:var(--dim);display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.lead{color:var(--dim)}.small{color:var(--faint);font-size:13px}.mono{font-family:ui-monospace,"JetBrains Mono",monospace;font-size:12.5px;overflow-wrap:anywhere}
.doc-head{display:flex;gap:16px;align-items:center;margin-bottom:26px}.logo{width:54px;height:54px;border-radius:14px;padding:5px;background:radial-gradient(circle at 50% 40%,#2a1d16,#120c09);border:1px solid rgba(240,179,124,.35);flex:none}
.pill{display:inline-flex;padding:5px 12px;border-radius:999px;font:700 11px/1.2 ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}.pill.ok{background:#7fe0a6;color:#0b2416}.pill.bad{background:#ff8c8c;color:#2a0c0c}.pill.wait{background:#ffcf7a;color:#2a1b06}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:14px}.party,.glance,.record,.sign-box,.signing{padding:18px 20px;border-radius:18px;background:rgba(255,255,255,.035);border:1px solid var(--line)}
.party b{display:block;font-size:17px}.party span{display:block;color:var(--dim);font-size:14.5px;overflow-wrap:anywhere}
.glance,.record{margin-top:14px}dl{display:grid;grid-template-columns:minmax(140px,auto) 1fr;gap:6px 18px;margin:0}dt{color:var(--faint);font-size:14px}dd{margin:0;overflow-wrap:anywhere}
.clauses{margin-top:28px}.clause{padding:4px 0 10px;border-top:1px solid var(--line)}.clause h2{display:flex;gap:12px;align-items:baseline;font:600 18px/1.3 Georgia,serif;margin:18px 0 8px}
.clause h2 span{font:700 12px/1 ui-monospace,monospace;color:#d08a52;min-width:22px}.clause p{margin:0 0 10px;color:#e6ded6;padding-left:34px}
.signs{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:26px}.sign-box b{display:block}.sign-box small{color:var(--faint);font-size:12.5px}
.sig{font-size:clamp(30px,6vw,40px);line-height:1.2;color:#f2c27b;min-height:56px}.sig.empty{font:14px/56px Manrope,sans-serif;color:var(--faint)}.sig-img{display:block;width:100%;max-width:300px;height:auto;background:#fff;border-radius:10px;margin-bottom:6px}
.signing{margin-top:26px;border-color:rgba(255,170,120,.4)}.form-h{font:600 22px/1.2 Georgia,serif;margin:0 0 6px}
.tick{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line);cursor:pointer}.tick input{width:22px;height:22px;margin:2px 0 0;flex:none;accent-color:#ff9438}
.field{display:block;margin-top:16px}.field>span{display:flex;justify-content:space-between;align-items:center;font-size:14px;color:var(--dim);margin-bottom:6px}
.field input{width:100%;min-height:50px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.3);color:var(--ink);font:500 17px Manrope,system-ui,sans-serif}
canvas{display:block;width:100%;height:auto;aspect-ratio:900/260;background:#fffdf9;border-radius:12px;touch-action:none;cursor:crosshair;border:1px solid rgba(255,255,255,.2)}
.field small{color:var(--faint);font-size:12.5px}.link{background:none;border:0;color:#ffc795;cursor:pointer;font:inherit;padding:0}
.err{color:#ff8c8c;min-height:1.2em;margin:12px 0 0}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:18px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 24px;border-radius:999px;font:700 12px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;text-decoration:none}
.btn.primary{color:#1a0f0a;background:linear-gradient(145deg,#ffb478,#c8784a);border:1px solid #ffb478}.btn.primary:disabled{opacity:.6;cursor:default}.btn.ghost{color:var(--ink);border:1px solid rgba(255,255,255,.22);background:transparent}
dialog{border:1px solid var(--line);border-radius:18px;background:#191311;color:var(--ink);width:min(480px,92vw)}dialog::backdrop{background:rgba(0,0,0,.6)}dialog textarea{width:100%;border-radius:12px;background:rgba(0,0,0,.3);color:var(--ink);border:1px solid var(--line);padding:10px;font:inherit}
:focus-visible{outline:2px solid var(--amber);outline-offset:3px}
@media (max-width:640px){.parties,.signs{grid-template-columns:1fr}dl{grid-template-columns:1fr}dt{margin-top:6px}.clause p{padding-left:0}}
@media print{:root{color-scheme:light}body{background:#fff;color:#111;padding:0;font-size:11.5pt}.no-print{display:none!important}.party,.glance,.record,.sign-box{background:none;border:1px solid #ccc}
.clause p,.party span,dd,.lead{color:#222}dt,.small,.meta{color:#555}.eyebrow,.clause h2 span{color:#8a4b1a}.clause{break-inside:avoid-page}.sig{color:#5a3a12}.pill{border:1px solid #888;background:none;color:#111}.logo{background:#1a120d}}
${css}
</style></head><body><main>${body}</main>${script ? `<script nonce="${nonce}">${SCRIPT}</script>` : `<script nonce="${nonce}">document.querySelectorAll('[data-print]').forEach(function(b){b.addEventListener('click',function(){window.print();});});</script>`}</body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'` } });
}

export function registerAgreements(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/agreements', listAgreements, a);
  route('POST', '/api/admin/agreements', createAgreement, a);
  route('GET', '/api/admin/agreements/defaults', getDefaults, a);
  route('PUT', '/api/admin/agreements/defaults', saveDefaults, a);
  route('GET', '/api/admin/agreements/:id', getAgreement, a);
  route('PUT', '/api/admin/agreements/:id', updateAgreement, a);
  route('DELETE', '/api/admin/agreements/:id', deleteAgreement, a);
  route('POST', '/api/admin/agreements/:id/send', sendAgreement, a);
  route('POST', '/api/admin/agreements/:id/withdraw', withdrawAgreement, a);
  route('POST', '/api/admin/agreements/:id/void', voidAgreement, a);
  route('POST', '/api/admin/agreements/:id/advance', markAdvance, a);
  route('GET', '/agreement/:id', agreementPage);
  route('POST', '/api/agreements/:id/sign', signAgreement);
  route('POST', '/api/agreements/:id/decline', declineAgreement);
}
