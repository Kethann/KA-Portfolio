// Replies on the site: a visitor who used the contact form keeps a private thread key in their browser
// ("<message id>.<signature>"), and the reply email links to the same thread. The site asks for new replies now
// and then and shows them in a small pop-up on that device; the portal sees when a reply was read.
import { json, readJson } from '../core/http.js';
import { env } from '../core/env.js';
import { hmacHex, safeEqual } from '../core/crypto.js';
import { getDb } from '../core/db.js';
import { rateLimit } from '../core/guard.js';
import { HttpError } from '../core/http.js';
import { pushPublicKey, sendPush, validEndpoint } from '../core/webpush.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sign = (id) => hmacHex(env('DOWNLOAD_TOKEN_SECRET', 'local-development-only'), `thread:${id}`).slice(0, 32);
export const threadKey = (id) => `${id}.${sign(id)}`;
export function threadId(key){
  if (typeof key !== 'string' || key.length > 80) return null;
  const [id, sig] = key.split('.');
  return id && UUID.test(id) && safeEqual(sig || '', sign(id)) ? id : null;
}
export const threadUrl = (base, id) => `${base.replace(/\/+$/, '')}/?thread=${encodeURIComponent(threadKey(id))}`;

const keysFrom = (b) => (Array.isArray(b.keys) ? b.keys : []).slice(0, 12).map(threadId).filter(Boolean);

// The conversations this browser holds, with their replies (newest last). Unknown or forged keys are skipped.
export async function threads(ctx){
  await rateLimit(`threads:${ctx.ip}`, 60, 10 * 60);
  const ids = keysFrom(await readJson(ctx.request, 8 * 1024));
  if (!ids.length) return json({ threads: [] });
  const db = await getDb();
  const [msgs, replies] = await Promise.all([
    db.query(`select id, name, subject, substr(body, 1, 600) as body, created_at from messages where id in (select value from json_each($1)) and status <> 'spam'`, [ids]),
    db.query(`select id, message_id, body, sent_at, seen_at from message_replies where message_id in (select value from json_each($1)) and status = 'sent' order by sent_at`, [ids])
  ]);
  return json({ threads: msgs.map(m => ({ key: threadKey(m.id), name: m.name, subject: m.subject, body: m.body, createdAt: m.created_at,
    replies: replies.filter(r => r.message_id === m.id).map(r => ({ id: r.id, body: r.body, sentAt: r.sent_at, seen: !!r.seen_at })) })) });
}
// The visitor allowed notifications: their browser's push address is kept with each of their conversations (at most 4
// devices per conversation), so a reply wakes the device even when the site is closed. Only the address is stored.
export async function threadsPush(ctx){
  await rateLimit(`threads-push:${ctx.ip}`, 20, 10 * 60);
  const b = await readJson(ctx.request, 8 * 1024);
  if (!pushPublicKey()) throw new HttpError(409, 'Notifications are not set up on this site.');
  const endpoint = typeof b.endpoint === 'string' ? b.endpoint : '';
  if (!validEndpoint(endpoint)) throw new HttpError(400, 'This browser’s notification address was not accepted.');
  const ids = keysFrom(b), off = b.off === true;
  if (!ids.length) return json({ ok: true });
  const db = await getDb();
  for (const m of await db.query(`select id, meta from messages where id in (select value from json_each($1))`, [ids])){
    const meta = m.meta && typeof m.meta === 'object' ? m.meta : {};
    const list = (Array.isArray(meta.push) ? meta.push : []).filter(e => e !== endpoint);
    const next = off ? list : [...list, endpoint].slice(-4);
    await db.query('update messages set meta = $2 where id = $1', [m.id, { ...meta, push: next }]);
  }
  return json({ ok: true });
}
/** after a reply is sent: wake every device that asked to be told (dead addresses are forgotten) */
export async function pushReply(messageId){
  if (!pushPublicKey()) return 0;
  const db = await getDb();
  const m = await db.maybeOne('select meta from messages where id = $1', [messageId]);
  const list = Array.isArray(m?.meta?.push) ? m.meta.push : [];
  if (!list.length) return 0;
  const results = await Promise.all(list.map(e => sendPush(e)));
  const keep = list.filter((_, i) => results[i] !== 'gone');
  if (keep.length !== list.length) await db.query('update messages set meta = $2 where id = $1', [messageId, { ...m.meta, push: keep }]);
  return results.filter(r => r === 'sent').length;
}

// The visitor opened the pop-up: these replies have been seen (shown as "Seen" in the portal).
export async function threadsSeen(ctx){
  await rateLimit(`threads-seen:${ctx.ip}`, 60, 10 * 60);
  const ids = keysFrom(await readJson(ctx.request, 8 * 1024));
  if (ids.length){
    const db = await getDb();
    await db.query(`update message_replies set seen_at = now() where seen_at is null and status = 'sent' and message_id in (select value from json_each($1))`, [ids]);
  }
  return json({ ok: true });
}
