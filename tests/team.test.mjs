// The portal team: adding people with a temporary password, roles, switching access off, resetting
// passwords, deleting, and the rules that stop anyone locking the team out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';

const app = await createTestApp({ ADMIN_SETUP_TOKEN: 'setup-code-123', ADMIN_ENCRYPTION_KEY: 'k', PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => app.close());
let n = 0;
const ip = () => `198.51.104.${++n}`;
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
function as(s){ return (method, path, body) => app.call(method, path, { body, headers: { cookie: s.cookie, ...(method !== 'GET' ? { 'x-csrf-token': s.csrf, origin: 'http://shop.test' } : {}) }, ip: s.ip }); }
async function signIn(email, password){
  const r = await app.call('POST', '/api/admin/login', { body: { email, password }, ip: ip() });
  return { res: r, s: r.status === 200 ? { cookie: cookieOf(r), csrf: r.json.csrf, ip: ip() } : null };
}

const setup = await app.call('POST', '/api/admin/setup', { body: { email: 'owner@example.com', password: 'the owner passphrase here', token: 'setup-code-123' }, ip: ip() });
const owner = as({ cookie: cookieOf(setup), csrf: setup.json.csrf, ip: ip() });

test('the first account is the owner; the owner adds a person with a temporary password', async () => {
  assert.equal((await owner('GET', '/api/admin/account')).json.role, 'owner');
  const bad = await owner('POST', '/api/admin/team', { name: 'Asha', email: 'asha@example.com', role: 'admin', password: 'short' });
  assert.equal(bad.status, 400);
  const r = await owner('POST', '/api/admin/team', { name: 'Asha', email: 'Asha@Example.com', role: 'admin', password: 'temporary pass 2026' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const asha = r.json.people.find(p => p.email === 'asha@example.com');
  assert.equal(asha.role, 'admin'); assert.equal(asha.mustChangePassword, true); assert.equal(asha.name, 'Asha');
  assert.equal((await owner('POST', '/api/admin/team', { name: 'x', email: 'asha@example.com', password: 'temporary pass 2026' })).status, 409, 'no duplicates');
});

test('a temporary password must be replaced before anything else works', async () => {
  const { res, s } = await signIn('asha@example.com', 'temporary pass 2026');
  assert.equal(res.status, 200); assert.equal(res.json.mustChangePassword, true);
  const asha = as(s);
  const blocked = await asha('GET', '/api/admin/orders');
  assert.equal(blocked.status, 403); assert.equal(blocked.json.code, 'password_change_required');
  assert.equal((await asha('POST', '/api/admin/password', { current: 'temporary pass 2026', next: 'temporary pass 2026' })).status, 400, 'must be a new password');
  assert.equal((await asha('POST', '/api/admin/password', { current: 'temporary pass 2026', next: 'ashas own passphrase' })).status, 200);
  assert.equal((await asha('GET', '/api/admin/orders')).status, 200);
  assert.equal((await asha('GET', '/api/admin/team')).status, 403, 'admins can’t manage the team');
  assert.equal((await asha('POST', '/api/admin/team', { name: 'x', email: 'x@example.com', password: 'another temp pass 1' })).status, 403);
});

test('switching access off signs the person out at once and blocks sign-in; on again works', async () => {
  const { s } = await signIn('asha@example.com', 'ashas own passphrase');
  const asha = as(s);
  const id = (await owner('GET', '/api/admin/team')).json.people.find(p => p.email === 'asha@example.com').id;
  assert.equal((await owner('POST', `/api/admin/team/${id}/access`, { enabled: false })).status, 200);
  assert.equal((await asha('GET', '/api/admin/orders')).status, 401, 'existing session stops working');
  const again = await signIn('asha@example.com', 'ashas own passphrase');
  assert.equal(again.res.status, 403); assert.equal(again.res.json.code, 'disabled');
  await owner('POST', `/api/admin/team/${id}/access`, { enabled: true });
  assert.equal((await signIn('asha@example.com', 'ashas own passphrase')).res.status, 200);
});

test('resetting a password signs them out and asks for a new one; deleting removes access', async () => {
  const { s } = await signIn('asha@example.com', 'ashas own passphrase');
  const asha = as(s);
  const id = (await owner('GET', '/api/admin/team')).json.people.find(p => p.email === 'asha@example.com').id;
  assert.equal((await owner('POST', `/api/admin/team/${id}/password`, { password: 'reset temp pass 2026' })).status, 200);
  assert.equal((await asha('GET', '/api/admin/orders')).status, 401);
  assert.equal((await signIn('asha@example.com', 'ashas own passphrase')).res.status, 401, 'old password no longer works');
  const fresh = await signIn('asha@example.com', 'reset temp pass 2026');
  assert.equal(fresh.res.json.mustChangePassword, true);
  assert.equal((await owner('DELETE', `/api/admin/team/${id}`)).status, 200);
  assert.equal((await as(fresh.s)('GET', '/api/admin/account')).status, 401);
  assert.equal((await signIn('asha@example.com', 'reset temp pass 2026')).res.status, 401);
});

test('nobody can lock the team out: not yourself, not the last owner', async () => {
  const me = (await owner('GET', '/api/admin/team')).json.people.find(p => p.you);
  assert.equal((await owner('DELETE', `/api/admin/team/${me.id}`)).status, 409);
  assert.equal((await owner('POST', `/api/admin/team/${me.id}/access`, { enabled: false })).status, 409);
  assert.equal((await owner('PUT', `/api/admin/team/${me.id}`, { role: 'admin' })).status, 409);
  // a second owner can be added; then the first owner can be managed by them
  const r = await owner('POST', '/api/admin/team', { name: 'Ravi', email: 'ravi@example.com', role: 'owner', password: 'ravi temp pass 2026' });
  assert.equal(r.json.people.filter(p => p.role === 'owner').length, 2);
  const log = (await owner('GET', '/api/admin/audit?limit=50')).json.entries;
  const added = log.find(e => e.action === 'team_added' && e.target === 'ravi@example.com');
  assert.equal(added.actor, 'owner@example.com', 'the log says who did it');
});
