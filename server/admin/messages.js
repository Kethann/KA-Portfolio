// Portal: inbox (contact form + assistant hand-offs), replies, labels, canned replies, blocklist.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb, ftsQuery } from '../core/db.js';
import { sendEmail } from '../core/email.js';
import { str, stringArray, uuid as vUuid } from '../core/validate.js';
import { audit } from './auth.js';

const STATUSES = ['new', 'read', 'done', 'spam'];

export async function listMessages(ctx){
  const u = ctx.url.searchParams;
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll('?', `$${args.length}`)); };
  const status = u.get('status');
  if (status === 'inbox') where.push(`status in ('new','read')`);
  else if (STATUSES.includes(status)) add('status = ?', status);
  else where.push(`status <> 'spam'`);
  if (u.get('label')) add('exists (select 1 from json_each(labels) where value = ?)', u.get('label').slice(0, 40));
  if (['contact', 'assistant', 'system'].includes(u.get('source'))) add('source = ?', u.get('source'));
  const q = ftsQuery((u.get('q') || '').trim().slice(0, 100));
  if (q) add(`rowid in (select rowid from messages_fts where messages_fts match ?)`, q);
  const limit = Math.min(200, Math.max(1, Number(u.get('limit')) || 50)), offset = Math.max(0, Number(u.get('offset')) || 0);
  const db = await getDb();
  const w = where.length ? `where ${where.join(' and ')}` : '';
  const rows = await db.query(`select id, source, name, email, subject, substr(body, 1, 240) as preview, status, labels, created_at, replied_at, meta->>'country' as country
    from messages ${w} order by created_at desc limit ${limit + 1} offset ${offset}`, args);
  const counts = await db.one(`select count(*) filter (where status = 'new') as new, count(*) filter (where status in ('new','read')) as inbox,
    count(*) filter (where status = 'spam') as spam, count(*) filter (where status = 'done') as done from messages`);
  const labels = (await db.query(`select distinct j.value as l from messages, json_each(messages.labels) j order by 1 limit 100`)).map(r => r.l);
  return json({ messages: rows.slice(0, limit), hasMore: rows.length > limit, counts, labels });
}

export async function getMessage(ctx){
  const id = vUuid(ctx.params.id, 'Message');
  const db = await getDb();
  const m = await db.maybeOne('select id, source, name, email, subject, body, status, labels, ip, meta, created_at, replied_at from messages where id = $1', [id]);
  if (!m) throw new HttpError(404, 'Message not found.');
  if (m.status === 'new'){ await db.query(`update messages set status = 'read' where id = $1 and status = 'new'`, [id]); m.status = 'read'; }
  const replies = await db.query('select id, body, sent_at, status from message_replies where message_id = $1 order by sent_at', [id]);
  const history = m.email ? await db.query('select id, subject, created_at, status from messages where lower(email) = lower($1) and id <> $2 order by created_at desc limit 10', [m.email, id]) : [];
  const orders = m.email ? await db.query(`select id, public_id, status, total, currency, created_at from orders where email = lower($1) and status in ('paid','delivered','refunded') order by created_at desc limit 10`, [m.email]) : [];
  return json({ message: m, replies, history, orders });
}

export async function updateMessage(ctx){
  const id = vUuid(ctx.params.id, 'Message');
  const b = await readJson(ctx.request, 8 * 1024);
  const db = await getDb();
  if (b.status !== undefined && !STATUSES.includes(b.status)) throw new HttpError(400, 'Unknown status.');
  const labels = b.labels === undefined ? null : stringArray(b.labels, { name: 'Labels', maxItems: 10, maxLength: 40 });
  await db.query('update messages set status = coalesce($2, status), labels = coalesce($3, labels) where id = $1', [id, b.status ?? null, labels]);
  return json({ ok: true });
}

export async function bulkMessages(ctx){
  const b = await readJson(ctx.request, 64 * 1024);
  if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 500) throw new HttpError(400, 'Choose up to 500 messages.');
  const ids = b.ids.map(x => vUuid(x, 'Message'));
  const db = await getDb();
  if (b.action === 'delete'){
    await db.query('delete from messages where id in (select value from json_each($1))', [ids]);
    await audit(ctx, 'messages_deleted', null, { count: ids.length });
  } else if (STATUSES.includes(b.action)){
    await db.query('update messages set status = $2 where id in (select value from json_each($1))', [ids, b.action]);
  } else throw new HttpError(400, 'Unknown action.');
  return json({ ok: true });
}

export async function reply(ctx){
  const id = vUuid(ctx.params.id, 'Message');
  const b = await readJson(ctx.request, 32 * 1024);
  const body = str(b.body, { name: 'Reply', max: 20000, required: true, trim: false }).trim();
  if (!body) throw new HttpError(400, 'Write a reply first.');
  const db = await getDb();
  const m = await db.maybeOne('select id, name, email, subject from messages where id = $1', [id]);
  if (!m) throw new HttpError(404, 'Message not found.');
  if (!m.email) throw new HttpError(400, 'This message has no email address to reply to.');
  const res = await sendEmail({ to: m.email, template: 'reply', vars: { subject: m.subject || 'your message', body, name: m.name } });
  await db.query('insert into message_replies (message_id, body, status) values ($1, $2, $3)', [id, body, res.ok ? 'sent' : 'failed']);
  if (!res.ok) throw new HttpError(502, 'The reply couldn’t be sent. It’s saved; check the email settings and try again.');
  await db.query(`update messages set replied_at = now(), status = case when $2 then 'done' else status end where id = $1`, [id, b.markDone !== false]);
  await audit(ctx, 'message_replied', id);
  return json({ ok: true });
}

// ---- canned replies ------------------------------------------------------------------------------
export async function listCanned(){
  const db = await getDb();
  return json({ canned: await db.query('select id, title, body from canned_replies order by title') });
}
export async function saveCanned(ctx){
  const b = await readJson(ctx.request, 32 * 1024);
  const title = str(b.title, { name: 'Title', max: 80, required: true }), body = str(b.body, { name: 'Text', max: 10000, required: true, trim: false });
  const db = await getDb();
  if (ctx.params.id) await db.query('update canned_replies set title = $2, body = $3 where id = $1', [ctx.params.id, title, body]);
  else await db.query('insert into canned_replies (title, body) values ($1, $2)', [title, body]);
  return listCanned();
}
export async function deleteCanned(ctx){
  const db = await getDb();
  await db.query('delete from canned_replies where id = $1', [ctx.params.id]);
  return listCanned();
}

// ---- blocklist -----------------------------------------------------------------------------------
export async function listBlocklist(){
  const db = await getDb();
  return json({ blocklist: await db.query('select id, kind, value, created_at from blocklist order by created_at desc') });
}
export async function addBlock(ctx){
  const b = await readJson(ctx.request, 4096);
  if (!['email', 'domain', 'ip', 'keyword'].includes(b.kind)) throw new HttpError(400, 'Choose email, domain, IP or keyword.');
  const value = str(b.value, { name: 'Value', max: 200, required: true }).toLowerCase();
  if (b.kind === 'email' && !/^[^@\s]+@[^@\s]+$/.test(value)) throw new HttpError(400, 'That isn’t an email address.');
  if (b.kind === 'domain' && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) throw new HttpError(400, 'That isn’t a domain like example.com.');
  if (b.kind === 'ip' && !/^[0-9a-f:.]{3,45}$/.test(value)) throw new HttpError(400, 'That isn’t an IP address.');
  const db = await getDb();
  await db.query('insert into blocklist (kind, value) values ($1, $2) on conflict (kind, value) do nothing', [b.kind, value]);
  // Blocking a sender also moves their earlier messages to Spam.
  if (b.kind === 'email' && b.moveExisting !== false) await db.query(`update messages set status = 'spam' where lower(email) = $1`, [value]);
  await audit(ctx, 'blocklist_added', b.kind);
  return listBlocklist();
}
export async function removeBlock(ctx){
  const db = await getDb();
  await db.query('delete from blocklist where id = $1', [ctx.params.id]);
  return listBlocklist();
}

export function registerMessages(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/messages', listMessages, a);
  route('POST', '/api/admin/messages/bulk', bulkMessages, a);
  route('GET', '/api/admin/messages/:id', getMessage, a);
  route('PATCH', '/api/admin/messages/:id', updateMessage, a);
  route('POST', '/api/admin/messages/:id/reply', reply, a);
  route('GET', '/api/admin/canned', listCanned, a);
  route('POST', '/api/admin/canned', saveCanned, a);
  route('PUT', '/api/admin/canned/:id', saveCanned, a);
  route('DELETE', '/api/admin/canned/:id', deleteCanned, a);
  route('GET', '/api/admin/blocklist', listBlocklist, a);
  route('POST', '/api/admin/blocklist', addBlock, a);
  route('DELETE', '/api/admin/blocklist/:id', removeBlock, a);
}
