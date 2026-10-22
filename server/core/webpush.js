// Web Push for "you have a reply" (VAPID, RFC 8292). Pushes carry NO payload: the service worker on the visitor's
// device (client/public/ka-sw.js) wakes up, asks /api/messages/threads for its own conversations and shows the reply.
// So nothing personal ever passes through the browser's push service, and no payload encryption is needed.
//
// Keys: VAPID_PUBLIC_KEY (base64url, 65-byte uncompressed P-256 point) and VAPID_PRIVATE_KEY (base64url, 32 bytes).
// Make a pair with:  node scripts/vapid-keys.mjs
import { env } from './env.js';

const b64u = {
  dec(s){ const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)); return Uint8Array.from(b, c => c.charCodeAt(0)); },
  enc(bytes){ let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
};

export function pushPublicKey(){
  const k = env('VAPID_PUBLIC_KEY') || '';
  return k && env('VAPID_PRIVATE_KEY') ? k : '';
}

// only real browser push services: an endpoint is an https URL on one of these hosts
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|web\.push\.apple\.com)$/i;
export function validEndpoint(url){
  try { const u = new URL(url); return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) && url.length <= 1024; } catch { return false; }
}

let keyPromise = null;
function signingKey(){
  if (!keyPromise){
    const pub = b64u.dec(env('VAPID_PUBLIC_KEY')), d = env('VAPID_PRIVATE_KEY');
    if (pub.length !== 65 || pub[0] !== 4) return Promise.reject(new Error('VAPID_PUBLIC_KEY is not an uncompressed P-256 key'));
    keyPromise = crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d, x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33)), ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']).catch(e => { keyPromise = null; throw e; });
  }
  return keyPromise;
}
async function vapidJwt(audience){
  const enc = (o) => b64u.enc(new TextEncoder().encode(JSON.stringify(o)));
  const subject = env('VAPID_SUBJECT') || (env('OWNER_EMAIL') ? `mailto:${env('OWNER_EMAIL')}` : 'mailto:hello@example.com');
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(), new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64u.enc(sig)}`;   // WebCrypto gives r||s, which is exactly the JWS form
}

/** wake one device. Resolves 'sent' | 'gone' (the subscription is dead: forget it) | 'failed' */
export async function sendPush(endpoint, fetchImpl = fetch){
  if (!pushPublicKey() || !validEndpoint(endpoint)) return 'failed';
  try {
    const jwt = await vapidJwt(new URL(endpoint).origin);
    const res = await fetchImpl(endpoint, { method: 'POST', headers: { Authorization: `vapid t=${jwt}, k=${env('VAPID_PUBLIC_KEY')}`, TTL: String(4 * 86400), Urgency: 'high', 'Content-Length': '0' } });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}
