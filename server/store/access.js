// Store status (open / closed) and special access while it is closed.
// The owner closes the store in the portal; visitors then see the "closed" board instead of buying. A few people
// can still be let in: by email (they ask for a link on the closed board and get it in their inbox) or by device
// (the owner sends them a private link; opening it once unlocks that browser). Either way the browser keeps a
// pass: "<id>.<signature>". Removing the pass in the portal locks it out again.
import { json, readJson, HttpError } from '../core/http.js';
import { env, siteUrl } from '../core/env.js';
import { hmacHex, randomToken, safeEqual } from '../core/crypto.js';
import { getSetting, getSettingWithRevision, setSetting } from '../core/settings.js';
import { rateLimit } from '../core/guard.js';
import { email as vEmail, str } from '../core/validate.js';
import { sendEmail } from '../core/email.js';
import { audit } from '../admin/auth.js';

export const MAX_PASSES = 200;
export const SCENES = ['panda', 'emoji'];
const secret = () => env('DOWNLOAD_TOKEN_SECRET', 'local-development-only');
const sign = (id) => hmacHex(secret(), `store-pass:${id}`).slice(0, 32);
export const passToken = (id) => `${id}.${sign(id)}`;

/** the pass entry a token belongs to, or null (bad signature, removed pass, or no token) */
export function findPass(passes, token){
  if (typeof token !== 'string' || token.length > 80) return null;
  const [id, sig] = token.trim().split('.');
  if (!id || !sig || !/^[A-Za-z0-9_-]{8,24}$/.test(id) || !safeEqual(sig, sign(id))) return null;
  return (passes || []).find(p => p.id === id) || null;
}
const passFrom = (request) => request.headers.get('x-ka-pass') || '';

/** what the site needs to know about the store, for this visitor */
export async function storeState(request, emailAddress = null){
  const [store, access] = await Promise.all([getSetting('store'), getSetting('storeAccess')]);
  const open = store.enabled !== false;
  let pass = open ? null : findPass(access.passes, passFrom(request));
  if (!open && !pass && emailAddress) pass = (access.passes || []).find(p => p.kind === 'email' && p.email === String(emailAddress).toLowerCase()) || null;
  return { open, store, pass, access };
}

/** the public "closed board" text, with a pass holder let through */
export function publicStore(state){
  const s = state.store;
  return {
    enabled: state.open, international: s.international !== false, access: !state.open && !!state.pass,
    closed: state.open ? null : { title: s.closedTitle, message: s.closedMessage, reopensAt: s.reopensAt || null, scene: SCENES.includes(s.closedScene) ? s.closedScene : 'panda', emailAccess: (state.access.passes || []).some(p => p.kind === 'email') }
  };
}

// Records when a pass was last used (at most once an hour, so a busy pass doesn't rewrite settings constantly).
async function touch(id){
  try {
    const { value, revision } = await getSettingWithRevision('storeAccess');
    const p = (value.passes || []).find(x => x.id === id);
    if (!p || (p.lastUsedAt && Date.now() - new Date(p.lastUsedAt).getTime() < 3600e3)) return;
    await setSetting('storeAccess', { ...value, passes: value.passes.map(x => x.id === id ? { ...x, lastUsedAt: new Date().toISOString(), uses: (x.uses || 0) + 1 } : x) }, revision);
  } catch { /* usage stats only */ }
}

// ---- public ------------------------------------------------------------------------------------------------
// A link (?pass=...) or a saved pass is checked here; the browser keeps it only when this says it's valid.
export async function checkPass(ctx){
  await rateLimit(`pass:${ctx.ip}`, 30, 10 * 60);
  const b = await readJson(ctx.request, 2048);
  const access = await getSetting('storeAccess');
  const p = findPass(access.passes, String(b.pass || ''));
  if (!p) return json({ ok: false });
  await touch(p.id);
  return json({ ok: true, label: p.kind === 'email' ? 'your email' : p.label });
}
// "Have early access? Email me a link": the same answer whether or not the address is on the list.
export async function requestEmailPass(ctx){
  await rateLimit(`pass-mail:${ctx.ip}`, 5, 60 * 60);
  const b = await readJson(ctx.request, 2048);
  const address = vEmail(b.email);
  await rateLimit(`pass-mail:${address}`, 3, 60 * 60);
  const access = await getSetting('storeAccess');
  const p = (access.passes || []).find(x => x.kind === 'email' && x.email === address);
  if (p) await sendPassEmail(p, siteUrl(ctx.request));
  return json({ ok: true });
}
function passLink(p, base){ return `${base.replace(/\/+$/, '')}/?page=store&pass=${encodeURIComponent(passToken(p.id))}`; }
async function sendPassEmail(p, base){
  const link = passLink(p, base);
  return sendEmail({ to: p.email, template: 'store_access', vars: { link, label: p.label || p.email }, buttons: { [link]: 'Open the store' } });
}

// ---- portal --------------------------------------------------------------------------------------------------
async function adminView(base){
  const [store, access] = await Promise.all([getSetting('store'), getSetting('storeAccess')]);
  return json({
    status: { open: store.enabled !== false, closedTitle: store.closedTitle, closedMessage: store.closedMessage, reopensAt: store.reopensAt || '', closedScene: store.closedScene },
    passes: (access.passes || []).map(p => ({ ...p, link: p.kind === 'device' ? passLink(p, base) : null }))
  });
}
export async function getAccess(ctx){ return adminView(siteUrl(ctx.request)); }

// Open or close the store (and the words on the closed board) in one quick change, without the other store settings.
export async function setStatus(ctx){
  const b = await readJson(ctx.request, 8 * 1024);
  const { value, revision } = await getSettingWithRevision('store');
  const next = { ...value };
  if (typeof b.open === 'boolean') next.enabled = b.open;
  if (b.closedTitle !== undefined) next.closedTitle = str(b.closedTitle, { name: 'Title', max: 80 }) || 'The store is taking a nap';
  if (b.closedMessage !== undefined) next.closedMessage = str(b.closedMessage, { name: 'Message', max: 400 });
  if (b.closedScene !== undefined) next.closedScene = SCENES.includes(b.closedScene) ? b.closedScene : 'panda';
  if (b.reopensAt !== undefined){
    const at = b.reopensAt ? new Date(b.reopensAt) : null;
    if (at && Number.isNaN(at.getTime())) throw new HttpError(400, 'Choose a valid reopening time, or leave it empty.');
    next.reopensAt = at ? at.toISOString() : '';
  }
  const rev = await setSetting('store', next, revision);
  if (rev === null) throw new HttpError(409, 'The store settings changed in another window. Try again.', { code: 'stale' });
  if (typeof b.open === 'boolean' && b.open !== (value.enabled !== false)) await audit(ctx, b.open ? 'store_opened' : 'store_closed', null);
  return adminView(siteUrl(ctx.request));
}

export async function addPass(ctx){
  const b = await readJson(ctx.request, 4096);
  const kind = b.kind === 'email' ? 'email' : 'device';
  const label = str(b.label, { name: 'Name', max: 60 });
  const address = kind === 'email' ? vEmail(b.email) : null;
  if (kind === 'device' && !label) throw new HttpError(400, 'Name the person or device, so you know whose pass it is.');
  const { value, revision } = await getSettingWithRevision('storeAccess');
  const passes = value.passes || [];
  if (passes.length >= MAX_PASSES) throw new HttpError(409, `You can keep up to ${MAX_PASSES} passes. Remove some first.`);
  if (address && passes.some(p => p.kind === 'email' && p.email === address)) throw new HttpError(409, 'That email already has access.');
  const p = { id: randomToken(9), kind, label: label || address, email: address, createdAt: new Date().toISOString(), lastUsedAt: null, uses: 0 };
  const rev = await setSetting('storeAccess', { ...value, passes: [...passes, p] }, revision);
  if (rev === null) throw new HttpError(409, 'The access list changed in another window. Try again.', { code: 'stale' });
  await audit(ctx, 'store_pass_added', kind);
  if (address && b.notify !== false) await sendPassEmail(p, siteUrl(ctx.request));
  return adminView(siteUrl(ctx.request));
}
export async function removePass(ctx){
  const { value, revision } = await getSettingWithRevision('storeAccess');
  const passes = (value.passes || []).filter(p => p.id !== ctx.params.id);
  const rev = await setSetting('storeAccess', { ...value, passes }, revision);
  if (rev === null) throw new HttpError(409, 'The access list changed in another window. Try again.', { code: 'stale' });
  await audit(ctx, 'store_pass_removed', ctx.params.id);
  return adminView(siteUrl(ctx.request));
}
export async function resendPass(ctx){
  const access = await getSetting('storeAccess');
  const p = (access.passes || []).find(x => x.id === ctx.params.id && x.kind === 'email');
  if (!p) throw new HttpError(404, 'That pass is gone.');
  const res = await sendPassEmail(p, siteUrl(ctx.request));
  if (!res.ok) throw new HttpError(502, 'The email couldn’t be sent. Check the email settings in Settings > System status.');
  return json({ ok: true });
}

export function registerStoreAccess(route){
  route('POST', '/api/store/pass', checkPass);
  route('POST', '/api/store/pass/email', requestEmailPass);
  const a = { access: 'admin' };
  route('GET', '/api/admin/store/access', getAccess, a);
  route('POST', '/api/admin/store/status', setStatus, a);
  route('POST', '/api/admin/store/access', addPass, a);
  route('DELETE', '/api/admin/store/access/:id', removePass, a);
  route('POST', '/api/admin/store/access/:id/resend', resendPass, a);
}
