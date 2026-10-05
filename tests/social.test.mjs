// Social app: the shared rules (tags, counts, checks), the portal API, the webhook that publishes, the scheduler,
// manual "posted" marks, saved hashtag sets.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp } from './helpers/app.mjs';
import { setEnvSource } from '../server/core/env.js';
import { setSocialFetch, runDue, checkWebhookUrl } from '../server/store/social.js';
import { cleanTag, parseTags, composeText, textLength, checkPost, suggestTags, PLATFORMS } from '../shared/social.js';

const app = await createTestApp({ ADMIN_SETUP_TOKEN: 'setup-code-123', ADMIN_ENCRYPTION_KEY: 'test-admin-key', PUBLIC_SITE_URL: 'http://shop.test' });
test.after(() => { setSocialFetch(null); return app.close(); });

const OWNER = { email: 'owner@example.com', password: 'correct horse battery staple' };
let n = 0; const ip = () => `198.51.100.${++n % 250}`;
const cookieOf = (res) => (res.headers.get('set-cookie') || '').split(';')[0];
await app.call('POST', '/api/admin/setup', { body: { ...OWNER, token: 'setup-code-123' }, ip: ip() });
const login = await app.call('POST', '/api/admin/login', { body: OWNER, ip: ip() });
const S = { cookie: cookieOf(login), csrf: login.json.csrf };
const admin = (method, path, body) => app.call(method, path, { body, headers: { cookie: S.cookie, ...(method !== 'GET' ? { 'x-csrf-token': S.csrf } : {}) }, ip: ip() });

const IMG = { url: '/images/poster-one.webp', alt: 'A poster' };
const HOOK = 'https://hooks.example.com/catch/12345/abcdef';
const future = (mins = 60) => new Date(Date.now() + mins * 60e3).toISOString();
let sent = [];
function hook(status = 200){ sent = []; setSocialFetch(async (url, init) => { sent.push({ url, body: JSON.parse(init.body), headers: init.headers }); return new Response('{}', { status }); }); }
const newPost = async (extra = {}) => (await admin('POST', '/api/admin/social/posts', { caption: 'New poster out now', hashtags: ['movieposter'], platforms: ['instagram', 'x'], media: [IMG], ...extra })).json.post;

test('hashtags: cleaned, de-duplicated, never all digits; text is the caption then the tags', () => {
  assert.equal(cleanTag('#Movie Poster!'), 'MoviePoster');
  assert.equal(cleanTag('2024'), ''); assert.equal(cleanTag('#'), ''); assert.equal(cleanTag('தமிழ்'), 'தமிழ்');
  assert.deepEqual(parseTags('#poster, Design  #poster;DESIGN #123'), ['poster', 'Design']);
  assert.deepEqual(parseTags(['a b', '#c']), ['a', 'b', 'c']);
  assert.equal(composeText({ caption: ' Hello ', hashtags: ['a', 'b'] }), 'Hello\n\n#a #b');
  assert.equal(composeText({ caption: '', hashtags: ['a'] }), '#a'); assert.equal(composeText({ caption: 'Hi', hashtags: [] }), 'Hi');
});

test('counts and checks: X counts links as 23, Instagram needs a picture and allows 30 tags, limits are errors', () => {
  assert.equal(textLength('go https://example.com/a/very/long/link/that/goes/on/and/on now', 'x'), 3 + 23 + 4);
  assert.equal(textLength('😀a', 'instagram'), 2);
  const ok = { caption: 'Hello', hashtags: ['a'], platforms: ['instagram', 'x'], media: [IMG] };
  assert.deepEqual(checkPost(ok), []);
  const codes = (p) => checkPost(p).map(i => `${i.platform}:${i.code}`);
  assert.deepEqual(codes({ ...ok, media: [] }), ['instagram:needs_image']);
  assert.ok(codes({ ...ok, caption: 'x'.repeat(281) }).includes('x:too_long'));
  assert.ok(codes({ ...ok, hashtags: Array.from({ length: 31 }, (_, i) => 't' + i) }).includes('instagram:too_many_tags'));
  assert.ok(codes({ ...ok, media: Array(5).fill(IMG) }).includes('x:too_many_images'));
  assert.deepEqual(codes({ caption: '', platforms: [], media: [] }), ['null:no_platform', 'null:empty']);
  assert.equal(PLATFORMS.instagram.limit, 2200);
});

test('suggested tags come from the caption, skip used ones, and fall back to starter sets', () => {
  const s = suggestTags('Behind the scenes of the new movie poster, poster poster', { used: ['poster'] });
  assert.ok(!s.map(x => x.toLowerCase()).includes('poster'), 'a tag already on the post is not suggested');
  assert.ok(s.length > 3 && s.every(t => /^[\p{L}\p{M}\p{N}_]+$/u.test(t)));
  assert.ok(suggestTags('', { popular: ['mytag'] }).includes('mytag'));
});

test('webhook addresses: https and a real hostname only', () => {
  assert.equal(checkWebhookUrl(HOOK), HOOK);
  setEnvSource({ ...app.vars, KA_ENV: 'production' });   // the localhost allowance is for development only
  after(() => setEnvSource(app.vars));
  for (const bad of ['http://hooks.example.com/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://intranet/x', 'https://svc.internal/x', 'https://user:pw@hooks.example.com/x', 'nonsense'])
    assert.throws(() => checkWebhookUrl(bad), /webhook|link|https|public|user name/i, bad);
});

test('the portal API needs a signed-in owner', async () => {
  assert.equal((await app.call('GET', '/api/admin/social', { ip: ip() })).status, 401);
  assert.equal((await app.call('POST', '/api/admin/social/posts', { body: {}, ip: ip() })).status, 401);
});

test('posts: draft saves anything, scheduling checks the rules, picture links must be your own, edits and duplicates', async () => {
  const draft = (await admin('POST', '/api/admin/social/posts', { caption: 'Just a thought', hashtags: '#a #b', platforms: ['instagram'] })).json.post;
  assert.equal(draft.status, 'draft'); assert.deepEqual(draft.hashtags, ['a', 'b']);
  // scheduling: needs a time in the future, and a post that passes the network rules
  assert.equal((await admin('POST', '/api/admin/social/posts', { caption: 'x', platforms: ['instagram'], media: [IMG], status: 'scheduled' })).status, 400);
  assert.equal((await admin('POST', '/api/admin/social/posts', { caption: 'x', platforms: ['instagram'], media: [IMG], status: 'scheduled', scheduledAt: new Date(Date.now() - 3600e3).toISOString() })).status, 400);
  const noPic = await admin('POST', '/api/admin/social/posts', { caption: 'x', platforms: ['instagram'], status: 'scheduled', scheduledAt: future() });
  assert.equal(noPic.status, 400); assert.match(noPic.json.error, /Instagram needs at least one picture/);
  assert.equal((await admin('POST', '/api/admin/social/posts', { caption: 'x', platforms: ['x'], media: [{ url: 'https://evil.example/a.png' }] })).status, 400);
  const sch = (await admin('POST', '/api/admin/social/posts', { caption: 'Soon', platforms: ['instagram'], media: [IMG], status: 'scheduled', scheduledAt: future() })).json.post;
  assert.equal(sch.status, 'scheduled');
  // editing: back to a draft; a stale copy is refused
  const edit = await admin('PUT', `/api/admin/social/posts/${sch.id}`, { ...sch, caption: 'Changed', status: 'draft', scheduledAt: null });
  assert.equal(edit.json.post.status, 'draft'); assert.equal(edit.json.post.caption, 'Changed');
  assert.equal((await admin('PUT', `/api/admin/social/posts/${sch.id}`, { ...sch, caption: 'older', updatedAt: '2000-01-01T00:00:00.000Z' })).status, 409);
  const dup = (await admin('POST', `/api/admin/social/posts/${sch.id}/duplicate`)).json.post;
  assert.notEqual(dup.id, sch.id); assert.equal(dup.status, 'draft'); assert.equal(dup.caption, 'Changed');
  const list = (await admin('GET', '/api/admin/social')).json;
  assert.ok(list.counts.draft >= 3 && list.counts.scheduled === 0);
  assert.equal((await admin('GET', '/api/admin/social?status=scheduled')).json.posts.length, 0);
  assert.equal((await admin('DELETE', `/api/admin/social/posts/${dup.id}`)).status, 200);
  assert.equal((await admin('GET', `/api/admin/social/posts/${dup.id}`)).status, 404);
});

test('connect: the link is saved encrypted and never returned; a bad link is refused; clearing works', async () => {
  assert.equal((await admin('PUT', '/api/admin/social/settings', { webhookUrl: 'http://hooks.example.com/x' })).status, 400);
  const r = await admin('PUT', '/api/admin/social/settings', { webhookUrl: HOOK, defaultPlatforms: ['instagram', 'bogus', 'x'], defaultHashtags: '#one two', signature: 'Thanks!  ' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.settings, { connected: true, host: 'hooks.example.com', defaultPlatforms: ['instagram', 'x'], defaultHashtags: ['one', 'two'], signature: 'Thanks!', lastTest: null });
  assert.ok(!JSON.stringify(r.json).includes('abcdef'));
  const stored = (await app.pg.query(`select value from settings where key = 'social'`)).rows[0].value;
  assert.ok(!String(typeof stored === 'string' ? stored : JSON.stringify(stored)).includes('abcdef'), 'the webhook link is encrypted at rest');
  assert.ok(!JSON.stringify((await admin('GET', '/api/admin/social')).json).includes('abcdef'));
  hook(200);
  const t = await admin('POST', '/api/admin/social/settings/test');
  assert.deepEqual(t.json, { ok: true, note: '' }); assert.equal(sent[0].url, HOOK); assert.equal(sent[0].body.event, 'ping');
});

test('send now: the webhook gets the text per network and full picture links; success marks it posted and locks it; failure can be retried', async () => {
  hook(200);
  const p = await newPost({ caption: 'Out now', hashtags: ['movieposter', 'design'] });
  const r = await admin('POST', `/api/admin/social/posts/${p.id}/send`);
  assert.equal(r.status, 200); assert.equal(r.json.post.status, 'posted');
  assert.equal(r.json.post.results.instagram.state, 'sent'); assert.equal(r.json.post.results.x.via, 'webhook');
  const body = sent.at(-1).body;
  assert.equal(body.event, 'post.send'); assert.deepEqual(body.platforms, ['instagram', 'x']);
  assert.equal(body.text.x, 'Out now\n\n#movieposter #design'); assert.equal(body.media[0].url, 'http://shop.test/images/poster-one.webp'); assert.equal(body.media[0].alt, 'A poster');
  assert.equal((await admin('POST', `/api/admin/social/posts/${p.id}/send`)).status, 409, 'a sent post is not sent twice');
  assert.equal((await admin('PUT', `/api/admin/social/posts/${p.id}`, { ...r.json.post, caption: 'edit' })).status, 409, 'and cannot be edited');
  // failure: kept, marked failed with the reason, and can be sent again
  hook(500);
  const q = await newPost();
  const bad = await admin('POST', `/api/admin/social/posts/${q.id}/send`);
  assert.equal(bad.json.post.status, 'failed'); assert.match(bad.json.post.results.instagram.note, /HTTP 500/);
  hook(200);
  assert.equal((await admin('POST', `/api/admin/social/posts/${q.id}/send`)).json.post.status, 'posted');
  // a post that breaks a network rule is never sent
  hook(200);
  const long = await newPost({ caption: 'x'.repeat(300) });
  const refused = await admin('POST', `/api/admin/social/posts/${long.id}/send`);
  assert.equal(refused.status, 400); assert.match(refused.json.error, /X: .* over the 280/); assert.equal(sent.length, 0);
});

test('scheduler: due posts are sent once, future ones wait, nothing is sent without a webhook, stuck sends fail', async () => {
  hook(200);
  const due = await newPost({ status: 'scheduled', scheduledAt: future(30) });
  const later = await newPost({ status: 'scheduled', scheduledAt: future(600) });
  await app.pg.query(`update social_posts set scheduled_at = $2 where id = $1`, [due.id, new Date(Date.now() - 60e3).toISOString()]);
  assert.ok((await admin('GET', '/api/admin/social')).json.due >= 1, 'the portal counts what is due');
  const r1 = await runDue();
  assert.equal(r1.sent, 1);
  assert.equal((await admin('GET', `/api/admin/social/posts/${due.id}`)).json.post.status, 'posted');
  assert.equal((await admin('GET', `/api/admin/social/posts/${later.id}`)).json.post.status, 'scheduled');
  assert.equal((await runDue()).sent, 0, 'not twice');
  // no webhook: it stays scheduled and is reported as waiting
  await admin('PUT', '/api/admin/social/settings', { clearWebhook: true });
  await app.pg.query(`update social_posts set scheduled_at = $2 where id = $1`, [later.id, new Date(Date.now() - 60e3).toISOString()]);
  const r2 = await runDue();
  assert.equal(r2.sent, 0); assert.equal(r2.waiting, 1);
  assert.equal((await admin('GET', `/api/admin/social/posts/${later.id}`)).json.post.status, 'scheduled');
  assert.equal((await admin('POST', `/api/admin/social/posts/${later.id}/send`)).json.code, 'not_connected');
  // a send that never finished
  await app.pg.query(`update social_posts set status = 'sending', updated_at = $2 where id = $1`, [later.id, new Date(Date.now() - 30 * 60e3).toISOString()]);
  assert.equal((await runDue()).unstuck, 1);
  assert.equal((await admin('GET', `/api/admin/social/posts/${later.id}`)).json.post.status, 'failed');
});

test('posting by hand: mark each network; all done = posted; undo returns it to a draft', async () => {
  const p = await newPost({ platforms: ['instagram', 'x'] });
  const one = await admin('POST', `/api/admin/social/posts/${p.id}/mark`, { platform: 'instagram' });
  assert.equal(one.json.post.status, 'draft'); assert.equal(one.json.post.results.instagram.via, 'manual');
  const both = await admin('POST', `/api/admin/social/posts/${p.id}/mark`, { platform: 'x' });
  assert.equal(both.json.post.status, 'posted'); assert.ok(both.json.post.sentAt);
  const undo = await admin('POST', `/api/admin/social/posts/${p.id}/mark`, { platform: 'x', done: false });
  assert.equal(undo.json.post.status, 'draft'); assert.equal(undo.json.post.results.x, undefined);
  assert.equal((await admin('POST', `/api/admin/social/posts/${p.id}/mark`, { platform: 'threads' })).status, 400, 'a network that is not on the post');
  assert.equal((await admin('POST', `/api/admin/social/posts/${p.id}/mark`, { platform: 'nope' })).status, 400);
});

test('hashtag sets: save, rename, no duplicates, delete; the most used tags are listed', async () => {
  const a = await admin('POST', '/api/admin/social/hashtag-sets', { name: 'Posters', tags: '#movieposter #keyart #movieposter' });
  assert.equal(a.status, 201); assert.deepEqual(a.json.set.tags, ['movieposter', 'keyart']);
  assert.equal((await admin('POST', '/api/admin/social/hashtag-sets', { name: 'Posters', tags: 'x' })).status, 409);
  assert.equal((await admin('POST', '/api/admin/social/hashtag-sets', { name: 'Empty', tags: '   ' })).status, 400);
  const ren = await admin('PUT', `/api/admin/social/hashtag-sets/${a.json.set.id}`, { name: 'Key art', tags: ['keyart'] });
  assert.equal(ren.json.set.name, 'Key art');
  const list = (await admin('GET', '/api/admin/social')).json;
  assert.deepEqual(list.hashtagSets.map(s => s.name), ['Key art']);
  assert.equal(list.popular[0], 'movieposter', 'used on the most posts');
  assert.equal((await admin('DELETE', `/api/admin/social/hashtag-sets/${a.json.set.id}`)).status, 200);
  assert.equal((await admin('DELETE', `/api/admin/social/hashtag-sets/${a.json.set.id}`)).status, 404);
});

test('production: only an https public address is accepted for the webhook (no localhost)', async () => {
  setEnvSource({ ...app.vars, KA_ENV: 'production' });
  try { assert.throws(() => checkWebhookUrl('http://localhost:5678/webhook/x'), /https/); }
  finally { setEnvSource(app.vars); }
  assert.equal(checkWebhookUrl('http://localhost:5678/webhook/x'), 'http://localhost:5678/webhook/x', 'a local n8n works while developing');
});
