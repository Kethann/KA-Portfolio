// Abuse protection shared by public endpoints: database-backed rate limits (work across
// serverless instances) and Cloudflare Turnstile verification.
import { getDb } from './db.js';
import { env, isProduction } from './env.js';
import { HttpError } from './http.js';

// Throws 429 when `key` has been used more than `max` times in `windowSeconds`.
export async function rateLimit(key, max, windowSeconds){
  const db = await getDb();
  const row = await db.one('select rate_limit_hit($1, $2, $3) as ok', [key, windowSeconds, max]);
  if (!row.ok) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', { retryAfter: windowSeconds, code: 'rate_limited' });
}

// Turnstile. Fails closed in production when the secret is missing; outside production it can be
// switched off with TURNSTILE_DISABLED=1 so local development works without Cloudflare keys.
export async function verifyTurnstile(token, ip, fetchImpl = fetch){
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret){
    if (!isProduction() && env('TURNSTILE_DISABLED') === '1') return true;
    if (!isProduction() && !env('TURNSTILE_SITE_KEY')) return true;   // no widget is shown either
    throw new HttpError(503, 'Verification is not available right now. Please try again later.');
  }
  if (typeof token !== 'string' || !token || token.length > 4096) throw new HttpError(400, 'Please complete the verification check.', { code: 'turnstile' });
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  let result;
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    result = await res.json();
  } catch {
    throw new HttpError(503, 'Verification is not available right now. Please try again.');
  }
  if (!result || result.success !== true) throw new HttpError(400, 'The verification check failed. Please try again.', { code: 'turnstile' });
  return true;
}
