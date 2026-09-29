// Host-neutral entry point: handle(request, platform) -> Response. Platform adapters
// (server/platform/*.js) call this; nothing in here knows which host it runs on.
import { createRouter } from './core/router.js';
import { json } from './core/http.js';
import * as pub from './handlers/public.js';
import { assistant } from './handlers/assistant-legacy.js';
import * as cron from './handlers/cron.js';
import { registerStorePublic } from './handlers/store-public.js';
import { registerCheckout } from './handlers/checkout.js';

export const router = createRouter();
const { route } = router;
registerStorePublic(route);
registerCheckout(route);

// ---- public site
route('GET', '/api/public-config', pub.publicConfig);
route('GET', '/api/portfolio', pub.portfolio);
route('POST', '/api/contact', pub.contact);
route('POST', '/api/notify', pub.notify);
route('POST', '/api/assistant', assistant);
route('POST', '/api/visit', async () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } }));
route('GET', '/api/health', async () => json({ ok: true }));

// ---- scheduled jobs
route('GET', '/api/cron/daily', cron.daily, { access: 'cron' });
route('GET', '/api/cron/weekly', cron.weekly, { access: 'cron' });

// Extension point for later phases: each module registers its own routes.
export function register(fn){ fn(route); }

export async function handle(request, platform){
  // vercel.json rewrites /api/:path* to /api/index?__path=:path*; restore the original URL.
  const url = new URL(request.url);
  const forwarded = url.searchParams.get('__path');
  if (forwarded !== null && url.pathname.replace(/\/+$/, '') === '/api/index'){
    url.searchParams.delete('__path');
    url.pathname = '/api/' + forwarded.replace(/^\/+/, '');
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body;
    request = new Request(url, { method: request.method, headers: request.headers, body: hasBody ? request.body : undefined, ...(hasBody ? { duplex: 'half' } : {}) });
  }
  return router.dispatch(request, platform);
}
