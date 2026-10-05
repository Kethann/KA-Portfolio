// Portal: Social app routes. Posts (draft, scheduled, sent), saved hashtag sets, and the automation webhook.
import { json, readJson } from '../core/http.js';
import { uuid as vUuid } from '../core/validate.js';
import { audit } from './auth.js';
import * as social from '../store/social.js';
import { PLATFORMS, STARTER_SETS } from '../../shared/social.js';

export function registerSocial(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/social', async (ctx) => {
    const u = ctx.url.searchParams;
    const [list, settings, hashtagSets, popular] = await Promise.all([
      social.listPosts({ status: u.get('status') || '', q: (u.get('q') || '').trim() }), social.socialSettings(), social.listHashtagSets(), social.popularTags()]);
    return json({ ...list, settings, hashtagSets, popular, starterSets: STARTER_SETS, platforms: PLATFORMS });
  }, a);
  route('GET', '/api/admin/social/posts/:id', async (ctx) => json({ post: await social.getPost(vUuid(ctx.params.id, 'Post')) }), a);
  route('POST', '/api/admin/social/posts', async (ctx) => {
    const post = await social.savePost(null, await readJson(ctx.request, 64 * 1024));
    await audit(ctx, 'social_post_saved', post.id, { status: post.status });
    return json({ post }, 201);
  }, a);
  route('PUT', '/api/admin/social/posts/:id', async (ctx) => {
    const id = vUuid(ctx.params.id, 'Post');
    const post = await social.savePost(id, await readJson(ctx.request, 64 * 1024));
    await audit(ctx, 'social_post_saved', id, { status: post.status });
    return json({ post });
  }, a);
  route('DELETE', '/api/admin/social/posts/:id', async (ctx) => {
    const id = vUuid(ctx.params.id, 'Post');
    await social.deletePost(id);
    await audit(ctx, 'social_post_deleted', id);
    return json({ ok: true });
  }, a);
  route('POST', '/api/admin/social/posts/:id/duplicate', async (ctx) => json({ post: await social.duplicatePost(vUuid(ctx.params.id, 'Post')) }, 201), a);
  route('POST', '/api/admin/social/posts/:id/send', async (ctx) => {
    const id = vUuid(ctx.params.id, 'Post');
    const post = await social.sendPost(id, { request: ctx.request });
    await audit(ctx, 'social_post_sent', id, { status: post.status });
    return json({ post });
  }, a);
  route('POST', '/api/admin/social/posts/:id/mark', async (ctx) => {
    const b = await readJson(ctx.request, 1024);
    return json({ post: await social.markPosted(vUuid(ctx.params.id, 'Post'), String(b.platform || ''), b.done !== false) });
  }, a);
  route('PUT', '/api/admin/social/settings', async (ctx) => {
    const settings = await social.saveSocialSettings(await readJson(ctx.request, 4096));
    await audit(ctx, 'social_settings_saved', null, { connected: settings.connected });
    return json({ settings });
  }, a);
  route('POST', '/api/admin/social/settings/test', async (ctx) => json(await social.testWebhook({ request: ctx.request })), a);
  route('POST', '/api/admin/social/hashtag-sets', async (ctx) => json({ set: await social.saveHashtagSet(null, await readJson(ctx.request, 8192)) }, 201), a);
  route('PUT', '/api/admin/social/hashtag-sets/:id', async (ctx) => json({ set: await social.saveHashtagSet(vUuid(ctx.params.id, 'Set'), await readJson(ctx.request, 8192)) }), a);
  route('DELETE', '/api/admin/social/hashtag-sets/:id', async (ctx) => { await social.deleteHashtagSet(vUuid(ctx.params.id, 'Set')); return json({ ok: true }); }, a);
}
