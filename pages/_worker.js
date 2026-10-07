// kethan.pages.dev = the whole site. Cloudflare Pages serves the static files (dist/); the dynamic paths
// (_routes.json) are handed to the kethan-artzz Worker through a service binding (env.SITE). The request goes
// across unchanged, so the visitor's IP/location, cookies and same-origin checks behave as on one site.
// The homepage also passes through here: the owner's chosen intro version (Studio > Intro) is switched on before the
// page reaches the browser. V1 (the default, locked) is served exactly as built; anything that fails falls back to it.
const INTRO_CACHE = 'https://intro.cache/version';
async function chosenIntro(request, env, ctx){
  const cache = caches.default;
  try {
    const hit = await cache.match(INTRO_CACHE);
    if (hit) return (await hit.json()).version || 'v1';
    const r = await env.SITE.fetch(new Request(new URL('/api/intro', request.url), { headers: { accept: 'application/json' } }));
    if (!r.ok) return 'v1';
    const { version } = await r.json();
    const v = typeof version === 'string' && /^v\d{1,3}$/.test(version) ? version : 'v1';
    ctx.waitUntil(cache.put(INTRO_CACHE, new Response(JSON.stringify({ version: v }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } })));
    return v;
  } catch { return 'v1'; }
}
export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url), path = url.pathname;
    if (/^\/(api\/|legal(\/|$)|license(\/|$)|__storage\/|__storage-upload\/)/.test(path)) return env.SITE.fetch(request);
    if (request.method === 'GET' && (path === '/' || path === '/index.html')){
      const [page, version] = await Promise.all([env.ASSETS.fetch(request), chosenIntro(request, env, ctx)]);
      if (version === 'v1' || !page.ok || !(page.headers.get('content-type') || '').includes('text/html')) return page;
      try {
        // every intro script runs only if it is the chosen one
        return new HTMLRewriter().on('script[data-intro]', { element(el){
          if (el.getAttribute('data-intro') === version) el.removeAttribute('type'); else el.setAttribute('type', 'text/plain');
        } }).on('html', { element(el){ el.setAttribute('data-ka-intro', version); } }).transform(page);
      } catch { return page; }
    }
    return env.ASSETS.fetch(request);
  }
};
