// The download page must work in every browser, including in-app ones (Snapchat, Instagram, Gmail) that send "Origin: null"
// on a form post, and a site reached through another host name. Also: the Google Drive source and the store-wide link expiry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { assertSameOrigin } from '../server/core/http.js';
import { setDriveFetch } from '../server/store/drive.js';
import { getSetting, setSetting } from '../server/core/settings.js';

const app = await createTestApp({ PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());
let ipSeq = 40;
const ip = () => `198.19.0.${++ipSeq % 250}`;

const [lic] = (await app.pg.query(`insert into licenses (key, name, summary, body_md) values ('personal','Personal','Own use','No resale.') returning id`)).rows;
const [cat] = (await app.pg.query(`insert into categories (kind, name, slug) values ('artifacts','Kits','kits') returning id`)).rows;
async function freeProduct(slug, over = {}){
  const p = { kind: 'artifacts', slug, title: slug, status: 'published', sellable: true, is_free: 1, license_id: lic.id, category_id: cat.id, max_downloads: 3, link_ttl_hours: 48, ...over };
  const cols = Object.keys(p);
  const [r] = (await app.pg.query(`insert into products (${cols}) values (${cols.map((_, i) => '$' + (i + 1))}) returning id`, Object.values(p))).rows;
  return r.id;
}
async function withUploadedFile(id){
  await app.storage.put('deliverables', `products/${id}/file.zip`, Buffer.from('ZIPDATA'));
  await app.pg.query(`insert into product_files (product_id, storage_path, filename, bytes) values ($1, $2, 'file.zip', 7)`, [id, `products/${id}/file.zip`]);
}
async function claim(productId, email){
  const r = await app.call('POST', '/api/checkout/order', { body: { productId, currency: 'INR', email, licenseHolder: 'Test Buyer' }, ip: ip() });
  assert.equal(r.status, 201, r.text);
  return r.json.downloadUrl.split('/').pop();
}
const form = { 'content-type': 'application/x-www-form-urlencoded' };
const post = (token, headers = {}) => app.call('POST', `/api/download/${token}`, { body: '', raw: true, headers: { ...form, ...headers }, ip: ip() });

test('the download button works whatever Origin the browser sends: null, this site, or none', async () => {
  const id = await freeProduct('origin-kit', { delivery_custom: 1 }); await withUploadedFile(id);
  const token = await claim(id, 'origin@example.com');
  assert.equal((await post(token, { origin: 'null' })).status, 303, 'in-app browsers / no-referrer pages send Origin: null');
  assert.equal((await post(token, { origin: 'http://shop.test', 'sec-fetch-site': 'same-origin' })).status, 303);
  assert.equal((await post(token, { origin: 'null', 'sec-fetch-site': 'same-origin' })).status, 303, 'same-origin is accepted whatever Origin says');
  assert.equal((await post(token, { origin: 'null' })).status, 410, 'then the 3-download limit applies: a plain "limit reached" page, never a 403');
  const page = await app.call('GET', `/api/download/${token}`, { ip: ip() });
  assert.match(page.headers.get('referrer-policy'), /same-origin/, 'the page no longer makes the browser send Origin: null');
});

test('other sites are still refused: cross-site posts and unknown origins', async () => {
  const id = await freeProduct('guarded-kit', { delivery_custom: 1 }); await withUploadedFile(id);
  const token = await claim(id, 'guard@example.com');
  assert.equal((await post(token, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await post(token, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(token, { origin: 'null', 'sec-fetch-site': 'cross-site' })).status, 403, 'a sandboxed cross-site frame is not let in');
  // the rest of the public API keeps the strict rule: a null origin is not this site
  const contact = await app.call('POST', '/api/contact', { body: {}, headers: { origin: 'null' }, ip: ip() });
  assert.equal(contact.status, 403);
});

test('assertSameOrigin: this site under another host name is recognised through PUBLIC_SITE_URL / ALLOWED_ORIGINS', () => {
  const req = (headers) => new Request('https://worker.internal/api/x', { method: 'POST', headers });
  assert.doesNotThrow(() => assertSameOrigin(req({ origin: 'https://kethan.pages.dev' }), ['https://kethan.pages.dev']));
  assert.doesNotThrow(() => assertSameOrigin(req({ origin: 'https://kethan.pages.dev', 'sec-fetch-site': 'same-site' }), ['https://kethan.pages.dev']));
  assert.throws(() => assertSameOrigin(req({ origin: 'https://kethan.pages.dev' }), []), /must come from/);
  assert.throws(() => assertSameOrigin(req({ 'sec-fetch-site': 'cross-site' }), []), /must come from/);
  assert.doesNotThrow(() => assertSameOrigin(req({}), []), 'server-to-server calls carry no Origin');
});

// ---- Google Drive source: the buyer never sees the Drive link; our own short-lived link streams the file
const DRIVE = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing';
const DRIVE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const driveCalls = [];
setDriveFetch(async (url, init = {}) => {
  driveCalls.push({ url: String(url), range: (init.headers || {}).Range || (init.headers || {}).range || '' });
  if (!String(url).includes(DRIVE_ID)) return new Response('<html>no</html>', { status: 404, headers: { 'content-type': 'text/html' } });
  const body = Buffer.from('FILE-FROM-DRIVE-0123456789');
  return new Response(body, { status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': String(body.length), 'content-disposition': 'attachment; filename="Brush Pack.zip"' } });
});

test('Google Drive files: parsing links, and refusing folders or random links', async () => {
  const { parseDriveId } = await import('../server/store/drive.js');
  assert.equal(parseDriveId(DRIVE), DRIVE_ID);
  assert.equal(parseDriveId(`https://drive.google.com/open?id=${DRIVE_ID}`), DRIVE_ID);
  assert.equal(parseDriveId(`https://drive.google.com/uc?export=download&id=${DRIVE_ID}`), DRIVE_ID);
  assert.equal(parseDriveId(`https://docs.google.com/document/d/${DRIVE_ID}/edit`), '', 'Google Docs are not downloadable files');
  assert.equal(parseDriveId(DRIVE_ID), DRIVE_ID, 'a bare file id works too');
  assert.equal(parseDriveId('https://drive.google.com/drive/folders/' + DRIVE_ID), '', 'folders are not files');
  assert.equal(parseDriveId('https://evil.example/file/d/' + DRIVE_ID), '', 'only Google Drive hosts');
  assert.equal(parseDriveId('nonsense'), '');
});

test('a Drive-backed product: the buyer gets our link, which streams the file, and the Drive link never appears', async () => {
  const id = await freeProduct('drive-kit');
  await app.pg.query(`insert into product_files (product_id, storage_path, filename, bytes, source, drive_id) values ($1, $2, 'Brush Pack.zip', 26, 'drive', $3)`, [id, `drive/${DRIVE_ID}`, DRIVE_ID]);
  const token = await claim(id, 'drive@example.com');
  const mail = app.mail.sent.filter(m => m.to === 'drive@example.com')[0];
  assert.ok(!JSON.stringify(mail).includes(DRIVE_ID), 'the email never contains the Drive id');
  const page = await app.call('GET', `/api/download/${token}`, { ip: ip() });
  assert.ok(!page.text.includes(DRIVE_ID));
  const dl = await post(token, { origin: 'null' });
  assert.equal(dl.status, 303);
  const loc = dl.headers.get('location');
  assert.match(loc, /^\/api\/file\/[^?]+\?exp=\d+&sig=[0-9a-f]+$/, 'a new link of our own');
  assert.ok(!loc.includes(DRIVE_ID), 'the redirect target does not reveal the Drive file');
  const file = await app.call('GET', loc, { ip: ip() });
  assert.equal(file.status, 200); assert.equal(file.text, 'FILE-FROM-DRIVE-0123456789');
  assert.match(file.headers.get('content-disposition'), /attachment; filename="Brush Pack\.zip"/);
  assert.equal(file.headers.get('cache-control'), 'no-store');
  assert.ok(driveCalls.length >= 1 && driveCalls.every(c => !c.url.includes('/api/')));
  // the new link cannot be altered or kept for ever
  assert.equal((await app.call('GET', loc.slice(0, -1) + (loc.endsWith('a') ? 'b' : 'a'), { ip: ip() })).status, 403, 'tampered signature');
  assert.equal((await app.call('GET', loc.replace(/exp=\d+/, 'exp=1'), { ip: ip() })).status, 403, 'expired');
  assert.equal((await app.call('GET', '/api/file/' + id + '?exp=9999999999&sig=' + 'a'.repeat(64), { ip: ip() })).status, 403);
});

test('store-wide link expiry: products follow the portal default unless they set their own', async () => {
  await setSetting('store', { ...(await getSetting('store')), downloadLinkHours: 6, downloadMaxDownloads: 2 });
  const follow = await freeProduct('follows-default', { delivery_custom: 0, link_ttl_hours: 48, max_downloads: 5 });
  const own = await freeProduct('own-terms', { delivery_custom: 1, link_ttl_hours: 24, max_downloads: 4 });
  for (const id of [follow, own]) await withUploadedFile(id);
  await claim(follow, 'f@example.com'); await claim(own, 'o@example.com');
  const rows = (await app.pg.query(`select distinct p.slug, t.max_downloads, round((julianday(t.expires_at) - julianday(t.created_at)) * 24) as hours from download_tokens t join products p on p.id = t.product_id where p.slug in ('follows-default','own-terms') order by p.slug`)).rows;
  assert.deepEqual(rows.map(r => [r.slug, Number(r.hours), r.max_downloads]), [['follows-default', 6, 2], ['own-terms', 24, 4]], JSON.stringify(rows));
  const pub = await app.call('GET', '/api/store/products/follows-default', { ip: ip() });
  assert.equal(pub.status, 200); assert.deepEqual(pub.json.product.delivery, { linkHours: 6, maxDownloads: 2 }, 'the store shows the default');
  assert.deepEqual((await app.call('GET', '/api/store/products/own-terms', { ip: ip() })).json.product.delivery, { linkHours: 24, maxDownloads: 4 });
});

test('the human check on the download button never blocks a buyer: no secret, no widget token, or Cloudflare down', async () => {
  const { verifyTurnstileLenient } = await import('../server/core/guard.js');
  const { setEnvSource } = await import('../server/core/env.js');
  const fetchAns = (body, ok = true) => async () => ({ ok, json: async () => body });
  try {
    setEnvSource({ ...app.vars, KA_ENV: 'production' });
    assert.equal(await verifyTurnstileLenient('', ip(), fetchAns({})), true, 'no secret configured (production): allowed');
    setEnvSource({ ...app.vars, KA_ENV: 'production', TURNSTILE_SECRET_KEY: 's', TURNSTILE_SITE_KEY: 'k' });
    assert.equal(await verifyTurnstileLenient('', ip(), fetchAns({})), true, 'the widget did not load (in-app browser): allowed');
    assert.equal(await verifyTurnstileLenient('tok', ip(), async () => { throw new Error('offline'); }), true, 'Cloudflare unreachable: allowed');
    assert.equal(await verifyTurnstileLenient('tok', ip(), fetchAns({ success: true })), true);
    await assert.rejects(verifyTurnstileLenient('tok', ip(), fetchAns({ success: false })), /verification check failed/, 'an answered "no" is still refused');
  } finally { setEnvSource(app.vars); }
});

test('the download page counts down live and the button downloads without leaving the page (JSON), with the meter updated', async () => {
  const id = await freeProduct('live-kit', { delivery_custom: 1, max_downloads: 2, link_ttl_hours: 5 });
  await withUploadedFile(id);
  const token = await claim(id, 'live@example.com');
  const page = await app.call('GET', `/api/download/${token}`, { ip: ip() });
  assert.match(page.text, /id="dl-time">0?4:5\d:\d\d<\/b>/, 'about 5 hours left, shown as a countdown');
  assert.match(page.text, /id="dl-left">2<\/b> of <span id="dl-max">2<\/span> downloads left/);
  const nonce = /<script nonce="([A-Za-z0-9_-]+)">/.exec(page.text)?.[1];
  assert.ok(nonce, 'the live script is inline with a nonce');
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, new RegExp(`script-src[^;]*'nonce-${nonce}'`)); assert.match(csp, /connect-src 'self'/);
  // status: never counts
  const s1 = await app.call('GET', `/api/download/${token}/status`, { ip: ip() });
  assert.equal(s1.status, 200); assert.deepEqual([s1.json.state, s1.json.used, s1.json.max, s1.json.left], ['ok', 0, 2, 2]);
  assert.equal(s1.headers.get('cache-control'), 'no-store');
  const json = { accept: 'application/json', origin: 'null' };
  const d1 = await post(token, json);
  assert.equal(d1.status, 200); assert.equal(d1.json.ok, true); assert.match(d1.json.url, /^\/__storage\/deliverables\//); assert.deepEqual([d1.json.used, d1.json.max, d1.json.left], [1, 2, 1]);
  assert.equal((await app.call('GET', `/api/download/${token}/status`, { ip: ip() })).json.left, 1, 'the meter sees the new count');
  assert.equal((await post(token, json)).json.left, 0);
  const d3 = await post(token, json);
  assert.equal(d3.status, 410); assert.equal(d3.json.state, 'limit'); assert.match(d3.json.message, /maximum number of times/);
  assert.equal((await app.call('GET', `/api/download/${token}/status`, { ip: ip() })).json.state, 'limit');
  assert.equal((await app.call('GET', '/api/download/not-a-token/status', { ip: ip() })).status, 404);
});

test('a Google Drive link becomes a private copy: downloads never touch Drive afterwards', async () => {
  const { setStorage } = await import('../server/core/storage.js');
  void setStorage;
  const id = await freeProduct('copied-kit', { delivery_custom: 1 });
  const { importDrive } = await import('../server/store/drive.js');
  const before = driveCalls.length;
  const c = await importDrive(DRIVE_ID, app.storage);
  assert.equal(c.filename, 'Brush Pack.zip'); assert.equal(c.bytes, 26); assert.match(c.path, /^files\/[A-Za-z0-9_-]{16}\/Brush-Pack\.zip$/);
  assert.equal((await app.storage.get('deliverables', c.path)).toString(), 'FILE-FROM-DRIVE-0123456789', 'the bytes are in our own private storage');
  await app.pg.query(`insert into product_files (product_id, storage_path, filename, bytes, source, drive_id) values ($1, $2, $3, $4, 'upload', $5)`, [id, c.path, c.filename, c.bytes, DRIVE_ID]);
  const token = await claim(id, 'copied@example.com');
  const called = driveCalls.length;
  const d = await post(token, { accept: 'application/json', origin: 'null' });
  assert.equal(d.status, 200); assert.match(d.json.url, /^\/__storage\/deliverables\/files\//, 'served from our storage, not from Drive');
  assert.ok(!d.json.url.includes(DRIVE_ID));
  assert.equal(driveCalls.length, called, 'Drive is not contacted for the download');
  assert.ok(called > before, 'Drive was only read once, when the copy was made');
});
