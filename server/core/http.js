// Standard Web Request/Response helpers shared by every handler. No host-specific APIs here.

export class HttpError extends Error {
  constructor(status, message, extra = {}){
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// Headers on every API response. Private data must never be cached by browsers or CDNs.
const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

export function json(data, status = 200, headers = {}){
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

export function text(body, status = 200, headers = {}){
  return new Response(body, { status, headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers } });
}

export function redirect(location, status = 302, headers = {}){
  return new Response(null, { status, headers: { ...BASE_HEADERS, Location: location, ...headers } });
}

export function errorResponse(err){
  if (err instanceof HttpError){
    const headers = err.extra.retryAfter ? { 'Retry-After': String(err.extra.retryAfter) } : {};
    return json({ error: err.message, ...(err.extra.code ? { code: err.extra.code } : {}) }, err.status, headers);
  }
  return json({ error: 'Unable to complete the request right now. Please try again.' }, 500);
}

// Reads a JSON body with a hard size limit and a strict content type. Never trusts
// Content-Length alone: the stream is counted as it arrives.
export async function readJson(request, maxBytes = 64 * 1024){
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!/^application\/json\s*(;\s*charset=utf-8\s*)?$/.test(type)) throw new HttpError(415, 'Send the request as JSON.');
  const raw = await readBody(request, maxBytes);
  if (!raw.length) throw new HttpError(400, 'The request body is empty.');
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new HttpError(400, 'The request body is not valid JSON.'); }
}

export async function readBody(request, maxBytes){
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new HttpError(413, 'The request is too large.');
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;){
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes){ try { await reader.cancel(); } catch {} throw new HttpError(413, 'The request is too large.'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export function parseCookies(request){
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')){
    const i = part.indexOf('=');
    if (i < 1) continue;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { out[name] = decodeURIComponent(value); } catch { out[name] = value; }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, httpOnly = true, secure = true, sameSite = 'Strict', path = '/' } = {}){
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (maxAge !== undefined) c += `; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

// Browser-originated writes must come from this site. Server-to-server calls (webhooks, cron)
// carry no Origin and are authenticated separately by their own signatures/secrets.
export function assertSameOrigin(request, allowedOrigins){
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'This request must come from this website.');
  const origin = request.headers.get('origin');
  if (!origin) return;
  const self = new URL(request.url).origin;
  if (origin !== self && !allowedOrigins.includes(origin)) throw new HttpError(403, 'This request must come from this website.');
}
