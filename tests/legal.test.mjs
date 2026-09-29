// Phase 7: legal pages (drafts in the portal, public HTML only once published), and the delete
// buttons for licenses (only when unused) and backups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';

const app = await createTestApp({ KA_DEMO_PAYMENTS: '1', ADMIN_SETUP_TOKEN: 'setup-code-123', ADMIN_ENCRYPTION_KEY: 'k', PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());
const setup = await app.call('POST', '/api/admin/setup', { body: { email: 'owner@example.com', password: 'a long owner passphrase', token: 'setup-code-123' }, ip: '198.51.103.9' });
const S = { cookie: setup.headers.get('set-cookie').split(';')[0], csrf: setup.json.csrf };
const admin = (method, path, body) => app.call(method, path, { body, headers: { cookie: S.cookie, ...(method !== 'GET' ? { 'x-csrf-token': S.csrf, origin: 'http://shop.test' } : {}) }, ip: '198.51.103.9' });

test('legal: the portal starts from drafts with blanks; nothing is public until published', async () => {
  const list = (await admin('GET', '/api/admin/legal')).json.pages;
  assert.deepEqual(list.map(p => p.slug).sort(), ['delivery', 'privacy', 'refunds', 'terms']);
  for (const p of list){ assert.equal(p.published, false); assert.equal(p.isDraftText, true); assert.equal(p.hasBlanks, true); assert.ok(p.body.length > 200, p.slug); }
  const pub = await app.call('GET', '/legal/terms');
  assert.equal(pub.status, 200);
  assert.match(pub.headers.get('content-type'), /text\/html/);
  assert.match(pub.text, /being updated/);
  assert.ok(!pub.text.includes('YOUR FULL NAME'), 'draft text is never shown publicly');
});

test('legal: published text renders as safe HTML with the page list; unknown pages 404', async () => {
  const empty = await admin('PUT', '/api/admin/legal/refunds', { title: 'Refunds', body: '   ', published: true });
  assert.equal(empty.status, 400);
  const r = await admin('PUT', '/api/admin/legal/refunds', { title: 'Refunds <b>', body: '## When\nWithin **7 days**.\n\n<script>alert(1)</script>', published: true });
  assert.equal(r.status, 200);
  const page = await app.call('GET', '/legal/refunds');
  assert.equal(page.status, 200);
  assert.match(page.text, /<h3>When<\/h3>/);   // the site's renderer maps ## to h3 (h1 is the page title) assert.match(page.text, /<strong>7 days<\/strong>/);
  assert.ok(!page.text.includes('<script>alert'), 'markdown is escaped');
  assert.ok(page.text.includes('Refunds &lt;b&gt;'), 'title is escaped');
  for (const slug of ['terms', 'privacy', 'refunds', 'delivery']) assert.ok(page.text.includes(`href="/legal/${slug}"`));
  assert.equal((await app.call('GET', '/legal/cookies')).status, 404);
  assert.equal((await app.call('GET', '/legal')).status, 200);
  // unpublishing takes it down again
  await admin('PUT', '/api/admin/legal/refunds', { title: 'Refunds', body: 'x', published: false });
  assert.match((await app.call('GET', '/legal/refunds')).text, /being updated/);
});

test('licenses: delete only when no product uses it and nothing was sold under it', async () => {
  const made = (await admin('POST', '/api/admin/licenses', { name: 'Throwaway', key: 'throwaway', summary: '', body: 'x' })).json.licenses.find(l => l.key === 'throwaway');
  const p = (await admin('POST', '/api/admin/products', { kind: 'artifacts', title: 'Uses it' })).json.product;
  await admin('PUT', `/api/admin/products/${p.id}`, { ...p, licenseId: made.id, updatedAt: p.updatedAt });
  const blocked = await admin('DELETE', `/api/admin/licenses/${made.id}`);
  assert.equal(blocked.status, 409); assert.match(blocked.json.error, /used by 1 product/);
  const p2 = (await admin('GET', `/api/admin/products/${p.id}`)).json.product;
  await admin('PUT', `/api/admin/products/${p.id}`, { ...p2, licenseId: null, updatedAt: p2.updatedAt });
  const ok = await admin('DELETE', `/api/admin/licenses/${made.id}`);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.ok(!ok.json.licenses.some(l => l.id === made.id));
});

test('backups: delete removes the file and the record', async () => {
  const run = await admin('POST', '/api/admin/backups');
  assert.equal(run.status, 200, JSON.stringify(run.json));
  const b = (await admin('GET', '/api/admin/backups')).json.backups[0];
  const path = (await app.pg.query('select storage_path from backups where id = $1', [b.id])).rows[0].storage_path;
  assert.ok(await app.storage.get('backups', path));
  const del = await admin('DELETE', `/api/admin/backups/${b.id}`);
  assert.equal(del.status, 200);
  assert.ok(!del.json.backups.some(x => x.id === b.id));
  await assert.rejects(app.storage.get('backups', path));
});
