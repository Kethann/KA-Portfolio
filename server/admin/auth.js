// Access to the portal: the owner (set up first) and the people they add (server/admin/team.js).
//   * first-time setup needs ADMIN_SETUP_TOKEN and only works while no one exists yet
//   * someone added with a temporary password can only change it (and sign out) until they do
//   * switched-off people can't sign in and their sessions stop working at once
//   * passwords: scrypt; brute force: per-IP rate limit + per-account lockout that doubles
//   * optional 2FA (authenticator app, TOTP); a code can't be reused; the seed is encrypted
//   * sessions: random token in an HttpOnly, Secure, SameSite=Strict cookie scoped to /api/admin;
//     only its SHA-256 is stored; 12 h absolute / 2 h idle; every write needs the CSRF header
//   * every portal API call is authorised here on the server (router access: 'admin')
import { json, readJson, parseCookies, serializeCookie, HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { env, isProduction } from '../core/env.js';
import { rateLimit } from '../core/guard.js';
import { email as vEmail, str } from '../core/validate.js';
import { hashPassword, verifyPassword, randomToken, sha256hex, safeEqual, newTotpSecret, verifyTotp, encrypt, decrypt } from '../core/crypto.js';
import UAParser from 'ua-parser-js';

const COOKIE = 'ka_admin';
const ABSOLUTE_MS = 12 * 3600e3, IDLE_MS = 2 * 3600e3;
const MIN_PASSWORD = 12;

function secureCookies(request){ return new URL(request.url).protocol === 'https:' || isProduction(); }
function encKey(){
  const k = env('ADMIN_ENCRYPTION_KEY');
  if (k) return k;
  if (isProduction()) throw new HttpError(503, 'Two-factor sign-in isn’t configured on the server (ADMIN_ENCRYPTION_KEY).');
  return 'local-development-only-key';
}

export async function audit(ctx, action, target = null, data = {}){
  const db = await getDb();
  await db.query('insert into audit_log (action, target, data, ip, actor) values ($1, $2, $3, $4, $5)', [action, target, data, ctx.ip || null, ctx.admin?.email || null]);
}

export function passwordPolicy(pw){
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD || pw.length > 200) throw new HttpError(400, `Use a password of at least ${MIN_PASSWORD} characters.`);
  if (/^(.)\1+$/.test(pw) || /^(password|123456789012|qwertyuiopas)/i.test(pw)) throw new HttpError(400, 'That password is too easy to guess.');
  return pw;
}

// ---- the guard every admin route runs through --------------------------------------------------
async function findSession(ctx){
  const token = parseCookies(ctx.request)[COOKIE];
  if (!token || token.length > 100) return null;
  const db = await getDb();
  return db.maybeOne(`select s.*, u.email, u.role, u.name, u.must_change_password from admin_sessions s join admin_users u on u.id = s.user_id
    where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and s.last_seen_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || $2 || ' seconds') and u.disabled_at is null`, [sha256hex(token), IDLE_MS / 1000]);
}

export async function requireAdmin(ctx){
  const token = parseCookies(ctx.request)[COOKIE];
  if (!token || token.length > 100) throw new HttpError(401, 'Please sign in.', { code: 'signed_out' });
  const db = await getDb();
  const s = await findSession(ctx);
  if (!s) throw new HttpError(401, 'Your session ended. Please sign in again.', { code: 'signed_out' });
  const m = ctx.request.method;
  if (m !== 'GET' && m !== 'HEAD'){
    const csrf = ctx.request.headers.get('x-csrf-token') || '';
    if (!csrf || !safeEqual(sha256hex(csrf), s.csrf_hash)) throw new HttpError(403, 'Security check failed. Reload the portal and try again.', { code: 'csrf' });
  }
  // a temporary password must be replaced before anything else can be done
  if (s.must_change_password && !['/api/admin/session', '/api/admin/account', '/api/admin/password', '/api/admin/logout'].includes(ctx.url.pathname))
    throw new HttpError(403, 'Choose your own password first.', { code: 'password_change_required' });
  if (Date.now() - new Date(s.last_seen_at).getTime() > 60e3) await db.query('update admin_sessions set last_seen_at = now() where id = $1', [s.id]);
  ctx.admin = { sessionId: s.id, userId: s.user_id, email: s.email, role: s.role, name: s.name };
}

async function startSession(ctx, userId){
  const db = await getDb();
  const token = randomToken(32), csrf = randomToken(24);
  await db.query(`insert into admin_sessions (user_id, token_hash, csrf_hash, expires_at, ip, user_agent) values ($1,$2,$3,$4,$5,$6)`,
    [userId, sha256hex(token), sha256hex(csrf), new Date(Date.now() + ABSOLUTE_MS), ctx.ip, String(ctx.request.headers.get('user-agent') || '').slice(0, 300)]);
  return { cookie: serializeCookie(COOKIE, token, { maxAge: ABSOLUTE_MS / 1000, path: '/api/admin', secure: secureCookies(ctx.request) }), csrf };
}

// ---- handlers ----------------------------------------------------------------------------------
// Public and always 200, so the portal can choose a screen without a 401 in the browser console.
export async function setupStatus(ctx){
  const db = await getDb();
  const n = (await db.one('select count(*) as n from admin_users')).n;
  const signedIn = n > 0 && !!(await findSession(ctx));
  return json({ needsSetup: n === 0, signedIn, setupConfigured: !!env('ADMIN_SETUP_TOKEN') || !isProduction() }, 200, { 'Cache-Control': 'no-store' });
}

export async function setup(ctx){
  await rateLimit(`admin-setup:${ctx.ip}`, 5, 15 * 60);
  const body = await readJson(ctx.request, 4096);
  const expected = env('ADMIN_SETUP_TOKEN') || (isProduction() ? '' : 'local-setup');
  if (!expected || !safeEqual(String(body.token || ''), expected)) throw new HttpError(403, 'The setup code is wrong.');
  const email = vEmail(body.email);
  const password = passwordPolicy(body.password);
  const db = await getDb();
  // one atomic statement: the owner is created only while nobody exists yet (two racing setups can't both win)
  const user = await db.maybeOne(`insert into admin_users (email, password_hash, role) select $1, $2, 'owner'
    where not exists (select 1 from admin_users) returning id`, [email, await hashPassword(password)]);
  if (!user) throw new HttpError(409, 'The owner account already exists. Sign in instead.');
  await audit(ctx, 'owner_created', email);
  const { cookie, csrf } = await startSession(ctx, user.id);
  return json({ ok: true, csrf, email }, 201, { 'Set-Cookie': cookie });
}

export async function login(ctx){
  await rateLimit(`admin-login:${ctx.ip}`, 10, 15 * 60);
  const body = await readJson(ctx.request, 4096);
  const email = str(body.email, { max: 254 }).toLowerCase();
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  const db = await getDb();
  const u = await db.maybeOne('select * from admin_users where email = $1', [email]);
  const generic = new HttpError(401, 'Email or password is wrong.');
  if (!u){ await verifyPassword(password, 'scrypt$32768$8$1$c2FsdHNhbHRzYWx0$' + 'A'.repeat(86)).catch(() => {}); await audit(ctx, 'login_failed', email); throw generic; }
  if (u.locked_until && new Date(u.locked_until) > new Date()){
    throw new HttpError(429, 'Too many attempts. This account is locked for a while; try again later.', { retryAfter: Math.ceil((new Date(u.locked_until) - Date.now()) / 1000), code: 'locked' });
  }
  const fail = async () => {
    const attempts = u.failed_attempts + 1;
    const lockMinutes = attempts >= 5 ? Math.min(24 * 60, 15 * 2 ** (attempts - 5)) : 0;
    await db.query('update admin_users set failed_attempts = $2, locked_until = $3 where id = $1', [u.id, attempts, lockMinutes ? new Date(Date.now() + lockMinutes * 60e3) : null]);
    await audit(ctx, 'login_failed', email, { attempts });
  };
  if (!(await verifyPassword(password, u.password_hash))){ await fail(); throw generic; }
  if (u.totp_enabled){
    const code = String(body.code || '').replace(/\s/g, '');
    if (!code) return json({ error: 'Enter the 6-digit code from your authenticator app.', code: 'totp_required' }, 401);
    const step = verifyTotp(decrypt(u.totp_secret, encKey()), code);
    if (step === null || (u.totp_last_step !== null && step <= Number(u.totp_last_step))){ await fail(); throw new HttpError(401, 'That code isn’t right. Codes change every 30 seconds.', { code: 'totp_wrong' }); }
    await db.query('update admin_users set totp_last_step = $2 where id = $1', [u.id, step]);
  }
  if (u.disabled_at){ await audit(ctx, 'login_blocked', email); throw new HttpError(403, 'Your access to the portal is switched off. Ask the owner.', { code: 'disabled' }); }
  await db.query('update admin_users set failed_attempts = 0, locked_until = null where id = $1', [u.id]);
  await audit({ ...ctx, admin: { email: u.email } }, 'login', email);
  const { cookie, csrf } = await startSession(ctx, u.id);
  return json({ ok: true, csrf, email: u.email, role: u.role, name: u.name, mustChangePassword: u.must_change_password }, 200, { 'Set-Cookie': cookie });
}

export async function session(ctx){
  // a fresh CSRF token for this session (the portal keeps it in memory only)
  const db = await getDb();
  const csrf = randomToken(24);
  await db.query('update admin_sessions set csrf_hash = $2 where id = $1', [ctx.admin.sessionId, sha256hex(csrf)]);
  const u = await db.one('select email, name, role, totp_enabled, must_change_password from admin_users where id = $1', [ctx.admin.userId]);
  return json({ email: u.email, name: u.name, role: u.role, twoFactor: u.totp_enabled, mustChangePassword: u.must_change_password, csrf });
}

// Read-only account details (unlike /session, it doesn't rotate the CSRF token).
export async function account(ctx){
  const db = await getDb();
  const u = await db.one('select email, name, role, totp_enabled, password_changed_at, created_at, must_change_password from admin_users where id = $1', [ctx.admin.userId]);
  return json({ email: u.email, name: u.name, role: u.role, twoFactor: u.totp_enabled, passwordChangedAt: u.password_changed_at, createdAt: u.created_at, mustChangePassword: u.must_change_password });
}

export async function logout(ctx){
  const db = await getDb();
  await db.query('update admin_sessions set revoked_at = now() where id = $1', [ctx.admin.sessionId]);
  await audit(ctx, 'logout', ctx.admin.email);
  return json({ ok: true }, 200, { 'Set-Cookie': serializeCookie(COOKIE, '', { maxAge: 0, path: '/api/admin', secure: secureCookies(ctx.request) }) });
}

export async function logoutEverywhere(ctx){
  const db = await getDb();
  await db.query('update admin_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [ctx.admin.userId]);
  await audit(ctx, 'logout_everywhere', ctx.admin.email);
  return json({ ok: true }, 200, { 'Set-Cookie': serializeCookie(COOKIE, '', { maxAge: 0, path: '/api/admin', secure: secureCookies(ctx.request) }) });
}

export async function listSessions(ctx){
  const db = await getDb();
  const rows = await db.query(`select id, created_at, last_seen_at, expires_at, ip, user_agent from admin_sessions
    where user_id = $1 and revoked_at is null and expires_at > now() order by last_seen_at desc limit 50`, [ctx.admin.userId]);
  return json({ sessions: rows.map(r => {
    const parsed = new UAParser(r.user_agent || '').getResult();
    return { ...r, current: r.id === ctx.admin.sessionId,
      device: [parsed.device.vendor, parsed.device.model, parsed.device.type].filter(Boolean).join(' ') || (parsed.os.name ? `${parsed.os.name} device` : 'Unknown device'),
      browser: [parsed.browser.name, parsed.browser.version?.split('.').slice(0, 2).join('.')].filter(Boolean).join(' '),
      system: [parsed.os.name, parsed.os.version].filter(Boolean).join(' ') };
  }) });
}

export async function revokeSession(ctx){
  const db = await getDb();
  await db.query('update admin_sessions set revoked_at = now() where id = $1 and user_id = $2', [ctx.params.id, ctx.admin.userId]);
  await audit(ctx, 'session_revoked', ctx.params.id);
  return json({ ok: true });
}

export async function changePassword(ctx){
  const body = await readJson(ctx.request, 4096);
  const db = await getDb();
  const u = await db.one('select * from admin_users where id = $1', [ctx.admin.userId]);
  if (!(await verifyPassword(String(body.current || '').slice(0, 200), u.password_hash))) throw new HttpError(400, 'Your current password is wrong.');
  const next = passwordPolicy(body.next);
  if (String(body.current || '') === next) throw new HttpError(400, 'Choose a password different from the current one.');
  await db.query('update admin_users set password_hash = $2, password_changed_at = now(), must_change_password = false where id = $1', [u.id, await hashPassword(next)]);
  await db.query('update admin_sessions set revoked_at = now() where user_id = $1 and id <> $2 and revoked_at is null', [u.id, ctx.admin.sessionId]);
  await audit(ctx, 'password_changed', u.email);
  return json({ ok: true });
}

export async function twoFactorStart(ctx){
  const db = await getDb();
  const u = await db.one('select email, totp_enabled from admin_users where id = $1', [ctx.admin.userId]);
  if (u.totp_enabled) throw new HttpError(409, 'Two-factor sign-in is already on.');
  const secret = newTotpSecret();
  await db.query('update admin_users set totp_secret = $2 where id = $1', [ctx.admin.userId, encrypt(secret, encKey())]);
  const issuer = encodeURIComponent(env('SITE_NAME', 'Kethan Artzz'));
  return json({ secret, otpauth: `otpauth://totp/${issuer}:${encodeURIComponent(u.email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30` });
}

export async function twoFactorEnable(ctx){
  const body = await readJson(ctx.request, 1024);
  const db = await getDb();
  const u = await db.one('select * from admin_users where id = $1', [ctx.admin.userId]);
  if (!u.totp_secret) throw new HttpError(400, 'Start two-factor setup first.');
  const step = verifyTotp(decrypt(u.totp_secret, encKey()), String(body.code || '').replace(/\s/g, ''));
  if (step === null) throw new HttpError(400, 'That code isn’t right. Check the time on your phone and try the next code.');
  await db.query('update admin_users set totp_enabled = true, totp_last_step = $2 where id = $1', [u.id, step]);
  await audit(ctx, 'two_factor_on', u.email);
  return json({ ok: true });
}

export async function twoFactorDisable(ctx){
  const body = await readJson(ctx.request, 1024);
  const db = await getDb();
  const u = await db.one('select * from admin_users where id = $1', [ctx.admin.userId]);
  if (!(await verifyPassword(String(body.password || '').slice(0, 200), u.password_hash))) throw new HttpError(400, 'Your password is wrong.');
  if (u.totp_enabled){
    const step = verifyTotp(decrypt(u.totp_secret, encKey()), String(body.code || '').replace(/\s/g, ''));
    if (step === null) throw new HttpError(400, 'That code isn’t right.');
  }
  await db.query('update admin_users set totp_enabled = false, totp_secret = null, totp_last_step = null where id = $1', [u.id]);
  await audit(ctx, 'two_factor_off', u.email);
  return json({ ok: true });
}

export function registerAuth(route){
  route('GET', '/api/admin/setup-status', setupStatus);
  route('POST', '/api/admin/setup', setup);
  route('POST', '/api/admin/login', login);
  route('GET', '/api/admin/session', session, { access: 'admin' });
  route('GET', '/api/admin/account', account, { access: 'admin' });
  route('POST', '/api/admin/logout', logout, { access: 'admin' });
  route('POST', '/api/admin/logout-everywhere', logoutEverywhere, { access: 'admin' });
  route('GET', '/api/admin/sessions', listSessions, { access: 'admin' });
  route('DELETE', '/api/admin/sessions/:id', revokeSession, { access: 'admin' });
  route('POST', '/api/admin/password', changePassword, { access: 'admin' });
  route('POST', '/api/admin/2fa/start', twoFactorStart, { access: 'admin' });
  route('POST', '/api/admin/2fa/enable', twoFactorEnable, { access: 'admin' });
  route('POST', '/api/admin/2fa/disable', twoFactorDisable, { access: 'admin' });
}
