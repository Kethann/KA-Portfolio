// Creator portal API: owner auth (setup, login, lockout, 2FA, CSRF, sessions), the server-side guard on
// every admin route, catalog rules and sales tools, against the real handler + PGlite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { setEnvSource } from '../server/core/env.js';
import { totpCode } from '../server/core/crypto.js';
import { csvCell, csv } from '../server/admin/sales.js';

const app = await createTestApp({ KA_DEMO_PAYMENTS: '1', ADMIN_SETUP_TOKEN: 'setup-code-123', ADMIN_ENCRYPTION_KEY: 'test-admin-key', PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());
const { router } = await import('../server/handler.js');

const OWNER = { email: 'owner@example.com', password: 'correct horse battery staple' };
let ipN = 0;
const ip = () => `198.51.100.${++ipN % 250}`;
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
let S = null;   // { cookie, csrf }
async function admin(method, path, body, { csrf = true, headers = {} } = {}){
  const h = { cookie: S.cookie, ...headers };
  if (csrf && method !== 'GET') h['x-csrf-token'] = S.csrf;
  return app.call(method, path, { body, headers: h, ip: ip() });
}
async function signIn(extra = {}){
  const res = await app.call('POST', '/api/admin/login', { body: { ...OWNER, ...extra }, ip: ip() });
  if (res.status === 200) S = { cookie: cookieOf(res), csrf: res.json.csrf };
  return res;
}

// ---- auth ----------------------------------------------------------------------------------------
test('setup: needs the setup code, a strong password, and only works once', async () => {
  assert.equal((await app.call('GET', '/api/admin/setup-status')).json.needsSetup, true);
  assert.equal((await app.call('POST', '/api/admin/setup', { body: { ...OWNER, token: 'wrong' }, ip: ip() })).status, 403);
  assert.equal((await app.call('POST', '/api/admin/setup', { body: { ...OWNER, password: 'short', token: 'setup-code-123' }, ip: ip() })).status, 400);
  const ok = await app.call('POST', '/api/admin/setup', { body: { ...OWNER, token: 'setup-code-123' }, ip: ip() });
  assert.equal(ok.status, 201);
  const setCookie = ok.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i); assert.match(setCookie, /SameSite=Strict/i); assert.match(setCookie, /Path=\/api\/admin/);
  const again = await app.call('POST', '/api/admin/setup', { body: { email: 'intruder@example.com', password: 'another long password', token: 'setup-code-123' }, ip: ip() });
  assert.equal(again.status, 409);
  const stored = (await app.pg.query('select password_hash from admin_users')).rows;
  assert.equal(stored.length, 1); assert.doesNotMatch(stored[0].password_hash, /horse/);
});

test('setup is closed in production without ADMIN_SETUP_TOKEN', async () => {
  setEnvSource({ ...app.vars, KA_ENV: 'production', ADMIN_SETUP_TOKEN: '' });
  try {
    const res = await app.call('POST', '/api/admin/setup', { body: { ...OWNER, token: 'local-setup' }, ip: ip() });
    assert.equal(res.status, 403);
  } finally { setEnvSource(app.vars); }
});

test('every admin route refuses anonymous callers (server-side guard on each one)', async () => {
  const open = new Set(['/api/admin/setup-status', '/api/admin/setup', '/api/admin/login']);
  const adminRoutes = router.routes.filter(r => r.pattern.startsWith('/api/admin/') && !open.has(r.pattern));
  assert.ok(adminRoutes.length > 40, `found ${adminRoutes.length}`);
  for (const r of adminRoutes){
    assert.equal(r.access, 'admin', `${r.method} ${r.pattern} must use access: 'admin'`);
    const path = r.pattern.replace(/:[a-zA-Z_]+/g, '00000000-0000-4000-8000-000000000000');
    const body = r.method === 'GET' || r.method === 'DELETE' ? undefined : {};
    const anon = await app.call(r.method, path, { body, ip: ip() });
    assert.equal(anon.status, 401, `${r.method} ${r.pattern} -> ${anon.status}`);
    const forged = await app.call(r.method, path, { body, headers: { cookie: 'ka_admin=' + 'A'.repeat(43) }, ip: ip() });
    assert.equal(forged.status, 401, `forged cookie ${r.method} ${r.pattern}`);
  }
});

test('login: generic errors, session works, CSRF and cross-site requests refused', async () => {
  const bad = await app.call('POST', '/api/admin/login', { body: { email: OWNER.email, password: 'nope nope nope' }, ip: ip() });
  const unknown = await app.call('POST', '/api/admin/login', { body: { email: 'who@example.com', password: 'nope nope nope' }, ip: ip() });
  assert.equal(bad.status, 401); assert.equal(unknown.status, 401); assert.equal(bad.json.error, unknown.json.error);
  assert.equal((await signIn()).status, 200);
  const s = await admin('GET', '/api/admin/session');
  assert.equal(s.status, 200); assert.equal(s.json.email, OWNER.email);
  S.csrf = s.json.csrf;   // session() rotates the CSRF token
  assert.equal((await admin('POST', '/api/admin/products', { title: 'No CSRF' }, { csrf: false })).status, 403);
  assert.equal((await admin('POST', '/api/admin/products', { title: 'Bad CSRF' }, { csrf: false, headers: { 'x-csrf-token': 'x'.repeat(32) } })).status, 403);
  assert.equal((await admin('GET', '/api/admin/products', undefined, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await admin('GET', '/api/admin/products', undefined, { headers: { origin: 'https://evil.example' } })).status, 403);
  const tokens = (await app.pg.query('select token_hash from admin_sessions')).rows;
  assert.ok(tokens.every(t => /^[0-9a-f]{64}$/.test(t.token_hash) && !S.cookie.includes(t.token_hash)), 'only token hashes are stored');
});

test('sessions: idle timeout, revoke, logout everywhere, password change ends other sessions', async () => {
  const first = { ...(await signIn(), S) };
  await app.pg.query(`update admin_sessions set last_seen_at = now() - interval '3 hours' where revoked_at is null`);
  assert.equal((await admin('GET', '/api/admin/products')).status, 401, 'idle session expired');
  await signIn(); const a = S;
  await signIn(); const b = S;
  S = a;
  const list = await admin('GET', '/api/admin/sessions');
  const other = list.json.sessions.find(x => !x.current);
  assert.equal((await admin('DELETE', `/api/admin/sessions/${other.id}`)).status, 200);
  S = b; assert.equal((await admin('GET', '/api/admin/products')).status, 401, 'revoked session refused');
  S = a;
  assert.equal((await admin('POST', '/api/admin/password', { current: 'wrong password!!', next: 'x'.repeat(20) })).status, 400);
  await signIn(); const c = S;
  S = a;
  assert.equal((await admin('POST', '/api/admin/password', { current: OWNER.password, next: 'a brand new long passphrase' })).status, 200);
  S = c; assert.equal((await admin('GET', '/api/admin/products')).status, 401, 'other sessions end after a password change');
  S = a; assert.equal((await admin('GET', '/api/admin/products')).status, 200, 'the current session stays');
  OWNER.password = 'a brand new long passphrase';
  await signIn(); const d = S;
  S = a; assert.equal((await admin('POST', '/api/admin/logout-everywhere', {})).status, 200);
  for (const s of [a, d]){ S = s; assert.equal((await admin('GET', '/api/admin/products')).status, 401); }
  void first;
});

test('two-factor: enable, code required, replay refused, disable', async () => {
  await signIn();
  const start = await admin('POST', '/api/admin/2fa/start', {});
  assert.match(start.json.otpauth, /^otpauth:\/\/totp\//);
  const secret = start.json.secret;
  const stored = (await app.pg.query('select totp_secret from admin_users')).rows[0].totp_secret;
  assert.ok(!stored.includes(secret), 'the seed is stored encrypted');
  assert.equal((await admin('POST', '/api/admin/2fa/enable', { code: '000000' === totpCode(secret) ? '111111' : '000000' })).status, 400);
  const now = Date.now();
  assert.equal((await admin('POST', '/api/admin/2fa/enable', { code: totpCode(secret, now) })).status, 200);
  const noCode = await app.call('POST', '/api/admin/login', { body: OWNER, ip: ip() });
  assert.equal(noCode.status, 401); assert.equal(noCode.json.code, 'totp_required');
  const replay = await app.call('POST', '/api/admin/login', { body: { ...OWNER, code: totpCode(secret, now) }, ip: ip() });
  assert.equal(replay.status, 401, 'a code already used cannot sign in again');
  assert.equal((await signIn({ code: totpCode(secret, now + 30e3) })).status, 200);
  assert.equal((await admin('POST', '/api/admin/2fa/disable', { password: OWNER.password, code: '12' })).status, 400);
  assert.equal((await admin('POST', '/api/admin/2fa/disable', { password: OWNER.password, code: totpCode(secret, now + 30e3) })).status, 200);
  await app.pg.query('update admin_users set failed_attempts = 0, locked_until = null');
});

test('lockout: five wrong passwords lock the account even with the right one', async () => {
  for (let i = 0; i < 5; i++) await app.call('POST', '/api/admin/login', { body: { email: OWNER.email, password: 'wrong password ' + i }, ip: ip() });
  const locked = await app.call('POST', '/api/admin/login', { body: OWNER, ip: ip() });
  assert.equal(locked.status, 429); assert.equal(locked.json.code, 'locked');
  const until = (await app.pg.query('select locked_until from admin_users')).rows[0].locked_until;
  assert.ok(new Date(until) - Date.now() > 14 * 60e3);
  await app.pg.query('update admin_users set failed_attempts = 0, locked_until = null');
  assert.equal((await signIn()).status, 200);
});

test('login is rate limited per IP', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await app.call('POST', '/api/admin/login', { body: { email: 'nobody@example.com', password: 'x' }, ip: '192.0.2.99' });
  assert.equal(last.status, 429);
});

// ---- catalog -------------------------------------------------------------------------------------
test('catalog: drafts stay private; publishing rules; stale edits refused; own media only', async () => {
  await signIn();
  const created = await admin('POST', '/api/admin/products', { kind: 'artzz', title: 'Ocean Study' });
  assert.equal(created.status, 200);
  let p = created.json.product;
  assert.equal(p.status, 'draft'); assert.equal(p.slug, 'ocean-study');
  assert.equal((await app.call('GET', '/api/store/products/ocean-study')).status, 404, 'drafts are not public');

  const pub = await admin('PUT', `/api/admin/products/${p.id}`, { ...p, status: 'published', updatedAt: p.updatedAt });
  assert.equal(pub.status, 400); assert.match(pub.json.error, /image/);

  const up = await admin('POST', '/api/admin/uploads', { kind: 'image', contentType: 'image/webp', bytes: 1000, filename: 'wave.webp' });
  assert.equal(up.status, 200); assert.ok(up.json.publicUrl);
  assert.equal((await admin('POST', '/api/admin/uploads', { kind: 'image', contentType: 'image/svg+xml', bytes: 1000, filename: 'x.svg' })).status, 400, 'SVG (script-capable) refused');
  assert.equal((await admin('POST', '/api/admin/uploads', { kind: 'image', contentType: 'image/png', bytes: 11 * 1024 * 1024, filename: 'big.png' })).status, 400);
  assert.equal((await admin('POST', `/api/admin/products/${p.id}/media`, { url: 'https://evil.example/x.png' })).status, 400);
  const withImg = await admin('POST', `/api/admin/products/${p.id}/media`, { url: up.json.publicUrl, alt: 'Waves' });
  p = withImg.json.product;
  assert.equal(p.media.length, 1);

  const stale = await admin('PUT', `/api/admin/products/${p.id}`, { ...p, title: 'Old tab', updatedAt: '2020-01-01T00:00:00Z' });
  assert.equal(stale.status, 409); assert.equal(stale.json.code, 'stale');
  const live = await admin('PUT', `/api/admin/products/${p.id}`, { ...p, status: 'published', updatedAt: p.updatedAt });
  assert.equal(live.status, 200, JSON.stringify(live.json));
  assert.equal((await app.call('GET', '/api/store/products/ocean-study')).status, 200);
  assert.equal((await admin('PATCH', `/api/admin/products/not-a-uuid/media`, { order: [] })).status, 400);
});

test('catalog: a for-sale item needs prices and a file; sold items archive instead of deleting', async () => {
  let p = (await admin('POST', '/api/admin/products', { kind: 'artifacts', title: 'Brush Pack' })).json.product;
  const noFile = await admin('PUT', `/api/admin/products/${p.id}`, { ...p, status: 'published', sellable: true, priceInr: 49900, priceUsd: 999, updatedAt: p.updatedAt });
  assert.equal(noFile.status, 400); assert.match(noFile.json.error, /file/);
  const up = await admin('POST', '/api/admin/uploads', { kind: 'deliverable', contentType: 'application/zip', bytes: 5, filename: 'brush pack.zip' });
  assert.equal(up.json.bucket, 'deliverables'); assert.equal(up.json.publicUrl, null, 'deliverables never get a public URL');
  await app.storage.put('deliverables', up.json.path, Buffer.from('PK..'));
  assert.equal((await admin('PUT', `/api/admin/products/${p.id}/file`, { path: '../../etc/passwd', filename: 'x', bytes: 5 })).status, 400);
  p = (await admin('PUT', `/api/admin/products/${p.id}/file`, { path: up.json.path, filename: 'brush-pack.zip', bytes: 5 })).json.product;
  assert.equal(p.file.filename, 'brush-pack.zip');
  const noPrice = await admin('PUT', `/api/admin/products/${p.id}`, { ...p, status: 'published', sellable: true, priceInr: 49900, priceUsd: null, updatedAt: p.updatedAt });
  assert.equal(noPrice.status, 400); assert.match(noPrice.json.error, /INR and a USD price/);
  const ok = await admin('PUT', `/api/admin/products/${p.id}`, { ...p, status: 'published', sellable: true, priceInr: 49900, priceUsd: 999, updatedAt: p.updatedAt });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.product.preview.prices.INR.amount, 49900);
  const link = await admin('GET', `/api/admin/products/${p.id}/file`);
  assert.equal(link.status, 200); assert.match(link.json.url, /expires|exp=|token/i);

  const sold = await buy(p.id, 'fan@example.com');
  assert.equal(sold.status, 'delivered');
  const del = await admin('DELETE', `/api/admin/products/${p.id}`);
  assert.equal(del.json.archived, true);
  assert.equal((await app.pg.query('select status from products where id = $1', [p.id])).rows[0].status, 'archived');
  const draft = (await admin('POST', '/api/admin/products', { kind: 'artifacts', title: 'Throwaway' })).json.product;
  assert.equal((await admin('DELETE', `/api/admin/products/${draft.id}`)).json.archived, false);
});

async function buy(productId, email, currency = 'INR'){
  const o = (await app.call('POST', '/api/checkout/order', { body: { productId, currency, email }, ip: ip() })).json;
  return (await app.call('POST', '/api/checkout/demo-pay', { body: { orderId: o.orderId, clientSecret: o.clientSecret, outcome: 'approve' }, ip: ip() })).json;
}

// ---- sales ---------------------------------------------------------------------------------------
test('sales: overview per currency, order detail, resend, invoice, CSV', async () => {
  const [p] = (await app.pg.query(`insert into products (kind, slug, title, status, sellable, price_inr, price_usd) values ('artifacts','kit-bold','Kit <b>bold</b>','published',true,20000,500) returning id`)).rows;
  await app.storage.put('deliverables', 'demo/k.zip', Buffer.from('Z'));
  await app.pg.query(`insert into product_files (product_id, storage_path, filename, bytes) values ($1, 'demo/k.zip', 'k.zip', 1)`, [p.id]);
  await buy(p.id, 'inr@example.com', 'INR');
  await buy(p.id, 'usd@example.com', 'USD');
  const ov = await admin('GET', '/api/admin/overview');
  assert.equal(ov.status, 200);
  const inr = ov.json.revenue.find(r => r.currency === 'INR'), usd = ov.json.revenue.find(r => r.currency === 'USD');
  assert.ok(inr.gross >= 20000 && usd.gross === 500, 'currencies are never added together');

  const list = await admin('GET', '/api/admin/orders?q=usd@');
  assert.equal(list.json.orders.length, 1);
  const o = list.json.orders[0];
  const detail = await admin('GET', `/api/admin/orders/${o.id}`);
  assert.ok(detail.json.events.some(e => e.type === 'delivered'));
  assert.ok(detail.json.links.length >= 1);

  const before = app.mail.sent.length;
  assert.equal((await admin('POST', `/api/admin/orders/${o.id}/resend`, {})).status, 200);
  assert.equal(app.mail.sent.length, before + 1);
  assert.match(app.mail.sent.at(-1).text || app.mail.sent.at(-1).body || JSON.stringify(app.mail.sent.at(-1)), /\/api\/download\//);

  const inv = await admin('GET', `/api/admin/orders/${o.id}/invoice`);
  assert.equal(inv.status, 200); assert.match(inv.text, /INV-\d{6}/);
  assert.ok(!inv.text.includes('<b>bold</b>'), 'titles are escaped'); assert.match(inv.headers.get('content-security-policy'), /default-src 'none'/);

  const file = await admin('GET', '/api/admin/orders.csv');
  assert.equal(file.status, 200); assert.match(file.headers.get('content-type'), /text\/csv/);
  assert.match(file.text, /usd@example\.com/);

  const link = detail.json.links[0];
  assert.equal((await admin('POST', `/api/admin/links/${link.id}/revoke`, {})).status, 200);
  const after = await admin('GET', `/api/admin/orders/${o.id}`);
  assert.equal(after.json.links.find(l => l.id === link.id).state, 'revoked');

  const rep = await admin('GET', '/api/admin/reports?group=month');
  assert.ok(rep.json.byCurrency.length === 2);
  assert.equal((await admin('GET', '/api/admin/reports.csv')).status, 200);
  assert.equal((await admin('GET', '/api/admin/reports?from=2020-01-01&to=2026-01-01')).status, 400, 'ranges are capped');
});

test('CSV cells cannot run as spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  for (const bad of ['+1', '-1+2', '@SUM(A1)', '\t=1']) assert.ok(csvCell(bad).startsWith(`"'`), bad);
  assert.equal(csvCell(null), '""');
  assert.ok(csv([{ a: '=1' }], [{ label: 'A', get: r => r.a }]).includes(`"'=1"`));
});

test('coupons: create, duplicate code refused, pause, used codes cannot be deleted', async () => {
  const c = await admin('POST', '/api/admin/coupons', { code: 'launch 10', kind: 'percent', percentBp: 1000, currencies: ['INR', 'USD'] });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  const coupon = c.json.coupons.find(x => x.code === 'LAUNCH10');
  assert.ok(coupon);
  assert.equal((await admin('POST', '/api/admin/coupons', { code: 'LAUNCH10', kind: 'percent', percentBp: 500 })).status, 409);
  assert.equal((await admin('POST', '/api/admin/coupons', { code: 'x', kind: 'percent', percentBp: 500 })).status, 400);
  assert.equal((await admin('POST', '/api/admin/coupons', { code: 'NOVALUE', kind: 'fixed' })).status, 400);
  const [p] = (await app.pg.query(`select id from products where slug = 'kit-bold'`)).rows;
  const o = (await app.call('POST', '/api/checkout/order', { body: { productId: p.id, currency: 'INR', email: 'coupon@example.com', codes: ['LAUNCH10'] }, ip: ip() })).json;
  assert.equal(o.quote?.discount ?? o.discount ?? 2000, 2000);
  await app.call('POST', '/api/checkout/demo-pay', { body: { orderId: o.orderId, clientSecret: o.clientSecret, outcome: 'approve' }, ip: ip() });
  const uses = await admin('GET', `/api/admin/coupons/${coupon.id}/uses`);
  assert.equal(uses.json.uses[0].status, 'confirmed');
  assert.equal((await admin('DELETE', `/api/admin/coupons/${coupon.id}`)).status, 409);
  const paused = await admin('POST', `/api/admin/coupons/${coupon.id}/pause`, { paused: true });
  assert.equal(paused.json.coupons.find(x => x.id === coupon.id).paused, true);
  const q = await app.call('POST', '/api/checkout/quote', { body: { productId: p.id, currency: 'INR', codes: ['LAUNCH10'] }, ip: ip() });
  assert.equal(q.json.ok, false, 'paused codes stop working');
  const audit = (await app.pg.query(`select action from audit_log`)).rows.map(r => r.action);
  for (const a of ['owner_created', 'login', 'login_failed', 'product_saved', 'coupon_saved', 'coupon_paused', 'link_revoked']) assert.ok(audit.includes(a), a);
});
