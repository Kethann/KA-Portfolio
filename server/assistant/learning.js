// Reuse only concise answers approved by a positive admin rating and grounded in live owner knowledge.
const STOP = new Set(['a','an','and','are','can','could','do','does','for','how','i','in','is','it','me','my','of','on','please','the','to','what','when','where','which','who','why','would','you','your']);
const EMAIL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const ORDER = /\bka-[a-z0-9]{6,12}\b/i;
const PHONE = /(?:\+?\d[\s().-]*){9,}/;
function containsCardNumber(text){
  for (const m of String(text).matchAll(/(?:\d[ -]?){13,19}/g)){
    const digits = m[0].replace(/\D/g, ''); if (digits.length < 13 || digits.length > 19) continue;
    let sum = 0;
    for (let i = 0; i < digits.length; i++){ let n = +digits[digits.length - 1 - i]; if (i % 2){ n *= 2; if (n > 9) n -= 9; } sum += n; }
    if (sum % 10 === 0) return true;
  }
  return false;
}

export function learningQuestionKey(value){
  const text = String(value || '').trim();
  if (text.length < 14 || text.length > 500 || EMAIL.test(text) || ORDER.test(text) || PHONE.test(text) || containsCardNumber(text)) return '';
  if (/\b(password|passcode|otp|one[- ]time code|medical|diagnos|legal advice|tax advice|investment)\b/i.test(text)) return '';
  const words = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[\p{L}\p{N}]+/gu) || [];
  const key = words.filter(w => !STOP.has(w)).join(' ');
  return key.length >= 8 && key.split(' ').length >= 2 ? key.slice(0, 500) : '';
}

export async function maybeLearnFromRatedAnswer(db, messageId){
  const message = await db.maybeOne(`select m.id, m.conversation_id, m.content, m.sources, m.rating
    from assistant_messages m join assistant_conversations c on c.id = m.conversation_id
    where m.id = $1 and m.role = 'assistant' and m.rating = 1 and c.audience in ('visitor','buyer')`, [messageId]);
  if (!message || !message.content || message.content.length > 2000 || EMAIL.test(message.content) || PHONE.test(message.content) || containsCardNumber(message.content)) return false;
  const sourceNames = Array.isArray(message.sources) ? message.sources : [];
  const grounded = sourceNames.filter(x => typeof x === 'string' && !['Site','Store','Tips','Policies','Learned answer'].includes(x));
  if (!grounded.length) return false;
  const active = await db.query(`select title from kb_sources where enabled and title in (select value from json_each($1))`, [grounded]);
  if (!active.length) return false;
  const questionRow = await db.maybeOne(`select content from assistant_messages where conversation_id = $1 and role = 'user' and id < $2 order by id desc limit 1`, [message.conversation_id, message.id]);
  const key = learningQuestionKey(questionRow?.content);
  if (!key) return false;

  // Require the same normalized question in two separate visitor conversations.
  const rows = await db.query(`select u.content, u.conversation_id, a.id as answer_id from assistant_messages u
    join assistant_conversations c on c.id = u.conversation_id
    join assistant_messages a on a.conversation_id = u.conversation_id and a.role = 'assistant' and a.id > u.id
    where u.role = 'user' and c.audience in ('visitor','buyer')
      and c.last_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')
    order by u.id desc limit 2000`);
  const conversations = new Set(rows.filter(r => learningQuestionKey(r.content) === key).map(r => r.conversation_id));
  if (conversations.size < 2) return false;

  const titles = [...new Set(active.map(s => s.title))];
  await db.query(`insert into assistant_learnings (question_key, question, answer, source_titles, expires_at)
    values ($1, $2, $3, $4, strftime('%Y-%m-%dT%H:%M:%fZ','now','+14 days'))
    on conflict (question_key) do update set question = excluded.question, answer = excluded.answer,
      source_titles = excluded.source_titles, expires_at = excluded.expires_at, updated_at = now()`,
    [key, questionRow.content.slice(0, 500), message.content.trim(), titles]);
  return true;
}

export async function findLearnedAnswer(db, question){
  const key = learningQuestionKey(question);
  if (!key) return null;
  const row = await db.maybeOne(`select l.question, l.answer, l.source_titles from assistant_learnings l
    where l.question_key = $1 and l.expires_at > now()
      and exists (select 1 from kb_sources s where s.enabled and s.title in (select value from json_each(l.source_titles)))`, [key]);
  return row || null;
}
