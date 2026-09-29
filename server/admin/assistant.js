// Portal: KA Assistant: usage and cost (estimates, clearly labelled), knowledge base, conversation
// logs with ratings, a playground that runs the real pipeline, and the exact prompt preview.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { getSetting } from '../core/settings.js';
import { str, bool } from '../core/validate.js';
import { onDaily } from '../jobs/hooks.js';
import { providerInfo } from '../assistant/providers.js';
import { reindex, seedIfEmpty } from '../assistant/knowledge.js';
import { runTurn, todayUsage, PROHIBITIONS } from '../assistant/engine.js';
import { audit } from './auth.js';
import { quotaReport } from '../assistant/quota.js';

const LOG_DAYS = 90;

export async function overview(){
  const db = await getDb();
  await seedIfEmpty();
  const [settings, today, days, totals, ratings, kb] = await Promise.all([
    getSetting('assistant'), todayUsage(),
    db.query(`select to_char(day, 'YYYY-MM-DD') as day, requests, tokens_in, tokens_out, cost_micros from assistant_usage where day > current_date - 31 order by day`),
    db.one(`select count(*)::int as conversations, coalesce(sum((select count(*) from assistant_messages m where m.conversation_id = c.id and m.role = 'user')), 0)::int as questions
      from assistant_conversations c where c.started_at > now() - interval '30 days' and c.audience <> 'playground'`),
    db.one(`select count(*) filter (where rating = 1)::int as up, count(*) filter (where rating = -1)::int as down from assistant_messages`),
    db.one(`select (select count(*) from kb_sources)::int as sources, (select count(*) from kb_chunks)::int as chunks`)
  ]);
  const recent = await db.query(`select m.content, m.created_at, m.conversation_id from assistant_messages m join assistant_conversations c on c.id = m.conversation_id
    where m.role = 'user' and c.audience <> 'playground' order by m.id desc limit 12`);
  const provider = providerInfo();
  const quota = provider.name === 'gemini' ? await quotaReport(provider.chain) : null;
  return json({ provider, settings, today, days, totals, ratings, kb, recent, rules: PROHIBITIONS, logDays: LOG_DAYS, quota });
}

// ---- knowledge base
export async function listKb(){
  const db = await getDb();
  await seedIfEmpty();
  return json({ sources: await db.query(`select s.id, s.kind, s.title, s.body, s.enabled, s.updated_at, (select count(*)::int from kb_chunks c where c.source_id = s.id) as chunks from kb_sources s order by s.created_at`) });
}
export async function saveKb(ctx){
  const b = await readJson(ctx.request, 256 * 1024);
  const kind = ['text', 'faq', 'document'].includes(b.kind) ? b.kind : 'text';
  const title = str(b.title, { name: 'Title', max: 120, required: true }), body = str(b.body, { name: 'Text', max: 100000, trim: false });
  const db = await getDb();
  let id = ctx.params.id;
  if (id){
    const r = await db.query('update kb_sources set kind = $2, title = $3, body = $4, enabled = $5, updated_at = now() where id::text = $1 returning id', [id, kind, title, body, bool(b.enabled, true)]);
    if (!r.length) throw new HttpError(404, 'Source not found.');
  } else id = (await db.one('insert into kb_sources (kind, title, body, enabled) values ($1, $2, $3, $4) returning id', [kind, title, body, bool(b.enabled, true)])).id;
  await reindex(db, id, body);
  await audit(ctx, 'kb_saved', title);
  return listKb();
}
export async function deleteKb(ctx){
  const db = await getDb();
  await db.query('delete from kb_sources where id::text = $1', [ctx.params.id]);
  await audit(ctx, 'kb_deleted', ctx.params.id);
  return listKb();
}

// ---- logs
export async function conversations(ctx){
  const db = await getDb();
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 100);
  const aud = ctx.url.searchParams.get('audience');
  const args = [], where = [];
  if (q){ args.push(q); where.push(`exists (select 1 from assistant_messages m where m.conversation_id = c.id and m.search @@ plainto_tsquery('simple', $${args.length}))`); }
  if (['visitor', 'buyer', 'playground'].includes(aud)){ args.push(aud); where.push(`c.audience = $${args.length}`); }
  const rows = await db.query(`select c.id, c.audience, c.country, c.started_at, c.last_at,
      (select content from assistant_messages m where m.conversation_id = c.id and m.role = 'user' order by m.id limit 1) as first_question,
      (select count(*)::int from assistant_messages m where m.conversation_id = c.id and m.role = 'user') as questions,
      (select coalesce(sum(cost_micros), 0)::bigint from assistant_messages m where m.conversation_id = c.id) as cost_micros,
      (select coalesce(sum(rating), 0)::int from assistant_messages m where m.conversation_id = c.id) as rating
    from assistant_conversations c ${where.length ? 'where ' + where.join(' and ') : ''} order by c.last_at desc limit 300`, args);
  return json({ conversations: rows });
}
export async function conversation(ctx){
  const db = await getDb();
  const c = await db.maybeOne('select * from assistant_conversations where id::text = $1', [ctx.params.id]);
  if (!c) throw new HttpError(404, 'Conversation not found.');
  const messages = await db.query('select id, role, content, sources, tokens_in, tokens_out, cost_micros, rating, created_at from assistant_messages where conversation_id = $1 order by id', [c.id]);
  return json({ conversation: c, messages });
}
export async function deleteConversation(ctx){
  const db = await getDb();
  await db.query('delete from assistant_conversations where id::text = $1', [ctx.params.id]);
  return json({ ok: true });
}
export async function rate(ctx){
  const b = await readJson(ctx.request, 256);
  const rating = b.rating === 1 || b.rating === -1 ? b.rating : null;
  const db = await getDb();
  await db.query(`update assistant_messages set rating = $2 where id::text = $1 and role = 'assistant'`, [ctx.params.id, rating]);
  return json({ ok: true });
}

// ---- playground: the real pipeline (it costs money and counts toward the daily cap)
export async function playground(ctx){
  const b = await readJson(ctx.request, 64 * 1024);
  const r = await runTurn({ audience: 'playground', messages: b.messages, conversationId: typeof b.conversationId === 'string' ? b.conversationId : null, locale: 'en', dryRun: b.preview === true });
  if (r.refused || r.error) throw new HttpError(r.refused ? 400 : 502, r.refused || r.error);
  return json(r);
}

onDaily('assistantLogRetention', async () => {
  const db = await getDb();
  const rows = await db.query(`delete from assistant_conversations where last_at < now() - make_interval(days => $1) returning 1`, [LOG_DAYS]);
  return { removed: rows.length };
});

export function registerAssistantAdmin(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/assistant', overview, a);
  route('GET', '/api/admin/assistant/kb', listKb, a);
  route('POST', '/api/admin/assistant/kb', saveKb, a);
  route('PUT', '/api/admin/assistant/kb/:id', saveKb, a);
  route('DELETE', '/api/admin/assistant/kb/:id', deleteKb, a);
  route('GET', '/api/admin/assistant/conversations', conversations, a);
  route('GET', '/api/admin/assistant/conversations/:id', conversation, a);
  route('DELETE', '/api/admin/assistant/conversations/:id', deleteConversation, a);
  route('POST', '/api/admin/assistant/messages/:id/rate', rate, a);
  route('POST', '/api/admin/assistant/playground', playground, a);
}
