// Tiny method + path router for Web Request handlers.
//   route('GET', '/api/products/:slug', handler, { access: 'public' })
// access:
//   public   anyone; browser writes must be same-origin
//   admin    a valid owner session; writes also need the CSRF header (checked by requireAdmin)
//   cron     Authorization: Bearer $CRON_SECRET (sent automatically by Vercel Cron)
//   webhook  no origin check; the handler verifies the provider's signature itself
import { HttpError, errorResponse, assertSameOrigin, json } from './http.js';
import { env } from './env.js';
import { safeEqual, sha256hex } from './crypto.js';

export function createRouter(){
  const routes = [];
  const guards = {};   // access level -> async (ctx) => void (throws to refuse), e.g. the owner session check
  function route(method, pattern, handler, options = {}){
    const keys = [];
    const regex = new RegExp('^' + pattern.replace(/\/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    routes.push({ method, pattern, regex, keys, handler, access: options.access || 'public', maxAge: options.maxAge });
  }
  async function dispatch(request, platform){
    const url = new URL(request.url);
    // Vercel hands the function the original URL after the /api rewrite; if a host ever passes the
    // rewritten one (/api/index?__path=a/b) instead, recover the original path from __path.
    const rewritten = url.pathname === '/api/index' && url.searchParams.get('__path');
    const path = rewritten ? '/api/' + rewritten.replace(/^\/+/, '') : url.pathname;
    let allowed = [];
    for (const r of routes){
      const m = r.regex.exec(path);
      if (!m) continue;
      if (r.method !== request.method && !(r.method === 'GET' && request.method === 'HEAD')){ allowed.push(r.method); continue; }
      const params = {};
      r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]); } catch { params[k] = m[i + 1]; } });
      const ctx = { request, url, params, platform, ip: platform.clientIp(request), geo: platform.geo(request), route: r };
      try {
        if (r.access === 'public' && request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request, allowedOrigins());
        if (r.access === 'cron') assertCron(request);
        if (r.access === 'admin'){
          if (!guards.admin) throw new HttpError(503, 'Not available.');
          assertSameOrigin(request, []);          // the portal is same-origin only, for every method
          await guards.admin(ctx);
        }
        let res = await r.handler(ctx);
        // a change made in the portal: tell open pages their content moved (never fails the request)
        if (r.access === 'admin' && request.method !== 'GET' && request.method !== 'HEAD' && res.ok && guards.afterAdminWrite)
          await Promise.resolve().then(() => guards.afterAdminWrite(ctx)).catch(() => {});
        // revalidated public reads get an ETag, so "nothing changed" is a 304 without a body
        if (res.status === 200 && (request.method === 'GET' || request.method === 'HEAD') && res.headers.get('cache-control') === 'no-cache') res = await withEtag(request, res);
        return res;
      } catch (err){
        if (!(err instanceof HttpError)) logError(r, err);
        return errorResponse(err);
      }
    }
    if (allowed.length) return json({ error: 'Method not allowed.' }, 405, { Allow: [...new Set(allowed)].join(', ') });
    return json({ error: 'This API endpoint does not exist.' }, 404);
  }
  function setGuard(access, fn){ guards[access] = fn; }
  return { route, dispatch, routes, setGuard };
}

async function withEtag(request, res){
  const body = await res.text();
  const etag = `W/"${sha256hex(body).slice(0, 32)}"`;
  const headers = new Headers(res.headers);
  headers.set('ETag', etag);
  const tags = (request.headers.get('if-none-match') || '').split(',').map(s => s.trim());
  if (tags.includes(etag) || tags.includes('*')){ headers.delete('Content-Length'); return new Response(null, { status: 304, headers }); }
  return new Response(request.method === 'HEAD' ? null : body, { status: res.status, headers });
}

function allowedOrigins(){
  return (env('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean);
}

function assertCron(request){
  const secret = env('CRON_SECRET');
  const header = request.headers.get('authorization') || '';
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) throw new HttpError(401, 'Not allowed.');
}

// Errors are logged by route and type only: request bodies, tokens, emails and payment data
// never reach the logs.
export function redact(message){
  return String(message || '')
    .replace(/[^\s@()<>"']+@[^\s@()<>"']+/g, '[email]')
    .replace(/[A-Za-z0-9_\-+/=]{24,}/g, '[token]')
    .slice(0, 300);
}
function logError(route, err){
  console.error(`[api] ${route.method} ${route.pattern} failed: ${err && err.name ? err.name : 'Error'}${err && err.code ? ' ' + err.code : ''} ${redact(err && err.message)}`);
}
