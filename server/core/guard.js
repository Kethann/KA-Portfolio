// Abuse protection shared by public endpoints: database-backed rate limits (work across
// serverless instances) and Cloudflare Turnstile verification.
import { rateLimitHit } from './atomic.js';
import { env, isProduction } from './env.js';
import { HttpError } from './http.js';

// Throws 429 when `key` has been used more than `max` times in `windowSeconds`.
export async function rateLimit(key, max, windowSeconds){
  if (!await rateLimitHit(key, windowSeconds, max)) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.', { retryAfter: windowSeconds, code: 'rate_limited' });
}

// Turnstile. Fails closed in production when the secret is missing; outside production it can be
// switched off with TURNSTILE_DISABLED=1 so local development works without Cloudflare keys.
// For the download button only. The download link is itself a 256-bit secret, redeeming it is rate-limited, and an email scanner can
// only open the page (it never presses the button), so the human check is a bonus, never a gate: a missing secret, a widget that
// couldn't load (in-app browsers block it), or Cloudflare being unreachable must not stop a buyer from getting what they paid for.
// A check that was answered "no" is still refused.
export async function verifyTurnstileLenient(token, ip, fetchImpl = fetch){
  const secret = env('TURNSTILE_SECRET_KEY');
  if (!secret || typeof token !== 'string' || !token) return true;
  try { return await verifyTurnstile(token, ip, fetchImpl); }
  catch (e){ if (e instanceof HttpError && e.status === 400) throw e; return true; }
}

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
