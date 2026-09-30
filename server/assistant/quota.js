// Gemini free-quota bookkeeping. Google counts free requests per model per day, resets them at
// midnight Pacific time, and offers no API for "how many are left". So every request this site makes
// is counted per model, and a model's daily limit is learned from Google's own refusal (a 429 whose
// details say GenerateRequestsPerDay... with quotaValue N). The portal shows used / limit per model.
import { getDb } from '../core/db.js';

const PT = 'America/Los_Angeles';
export const quotaDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: PT }).format(now);

function ptOffsetMinutes(d){
  const tz = new Intl.DateTimeFormat('en-US', { timeZone: PT, timeZoneName: 'shortOffset' }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || 'GMT-8';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tz);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : -480;
}
// The next midnight in Pacific time, as an exact instant (handles daylight saving).
export function nextReset(now = new Date()){
  const [y, mo, d] = quotaDay(now).split('-').map(Number);
  const midnightUtc = Date.UTC(y, mo - 1, d + 1, 0, 0);
  return new Date(midnightUtc - ptOffsetMinutes(new Date(midnightUtc)) * 60e3);
}

// From a refusal body: the daily limit, if the refusal was about the daily quota.
export function dailyLimitFrom(body){
  const text = String(body || '');
  if (!/PerDay/i.test(text)) return null;
  const m = /"quotaValue"\s*:\s*"?(\d+)/.exec(text) || /limit:\s*(\d+)/.exec(text);
  return m ? Number(m[1]) : null;
}

// Never lets bookkeeping break a visitor's chat.
export async function recordModel(model, { ok, status = 0, body = '' }){
  try {
    const limit = ok ? null : dailyLimitFrom(body);
    const exhausted = !ok && status === 429 && /PerDay/i.test(String(body));
    const db = await getDb();
    await db.query(`insert into assistant_model_usage (day, model, requests, failures, quota_limit, exhausted_at) values ($1, $2, $3, $4, $5, $6)
      on conflict (day, model) do update set requests = assistant_model_usage.requests + excluded.requests, failures = assistant_model_usage.failures + excluded.failures,
        quota_limit = coalesce(excluded.quota_limit, assistant_model_usage.quota_limit), exhausted_at = coalesce(excluded.exhausted_at, assistant_model_usage.exhausted_at)`,
      [quotaDay(), String(model).slice(0, 80), ok ? 1 : 0, ok ? 0 : 1, limit, exhausted ? new Date() : null]);
  } catch { /* the answer matters more than the counter */ }
}

// Today's picture for each model in the chain. A limit learned on an earlier day is reused (Google's
// free limits rarely change), and marked as such.
export async function quotaReport(chain){
  const db = await getDb();
  const day = quotaDay();
  const today = await db.query('select model, requests, failures, quota_limit, exhausted_at from assistant_model_usage where day = $1', [day]);
  const known = await db.query(`select model, quota_limit from assistant_model_usage u where quota_limit is not null and day = (select max(day) from assistant_model_usage v where v.model = u.model and v.quota_limit is not null)`);
  const models = chain.map(model => {
    const t = today.find(r => r.model === model);
    const limit = t?.quota_limit ?? known.find(r => r.model === model)?.quota_limit ?? null;
    const used = Number(t?.requests || 0);
    return { model, used, failures: Number(t?.failures || 0), limit, left: limit === null ? null : Math.max(0, limit - used),
      exhausted: !!t?.exhausted_at, exhaustedAt: t?.exhausted_at || null, limitLearnedToday: t?.quota_limit != null };
  });
  return { day, resetsAt: nextReset().toISOString(), models };
}
