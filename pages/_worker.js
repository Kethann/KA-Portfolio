// kethan.pages.dev = the whole site. Cloudflare Pages serves the static files (dist/); the dynamic paths
// (_routes.json) are handed to the kethan-artzz Worker through a service binding (env.SITE). The request goes
// across unchanged, so the visitor's IP/location, cookies and same-origin checks behave as on one site.
// The homepage also passes through here: the owner's chosen intro version (Studio > Intro) is switched on before the
// page reaches the browser. V1 (the default, locked) is served exactly as built; anything that fails falls back to it.
// The owner's skill-bubble choice for V2 (Studio > Intro > Bubbles) rides along as window.KA_INTRO_BUBBLES, set before the intro starts.
const INTRO_CACHE = 'https://intro.cache/version';
const NONE = { version: 'v1', bubbles: null };
async function chosenIntro(request, env, ctx){
  const cache = caches.default;
  try {
    const hit = await cache.match(INTRO_CACHE);
    if (hit){ const c = await hit.json(); return { version: c.version || 'v1', bubbles: Array.isArray(c.bubbles) ? c.bubbles : null }; }
    const r = await env.SITE.fetch(new Request(new URL('/api/intro', request.url), { headers: { accept: 'application/json' } }));
    if (!r.ok) return NONE;
    const { version, bubbles } = await r.json();
    const v = typeof version === 'string' && /^v\d{1,3}$/.test(version) ? version : 'v1';
    const b = Array.isArray(bubbles) ? bubbles.slice(0, 8).map(i => ({ type: String(i && i.type || '').slice(0, 20), label: String(i && i.label || '').slice(0, 24) })) : null;
    ctx.waitUntil(cache.put(INTRO_CACHE, new Response(JSON.stringify({ version: v, bubbles: b }), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } })));
    return { version: v, bubbles: b };
  } catch { return NONE; }
}
export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url), path = url.pathname;
    if (/^\/(api\/|legal(\/|$)|license(\/|$)|__storage\/|__storage-upload\/)/.test(path)) return env.SITE.fetch(request);
    if (request.method === 'GET' && (path === '/' || path === '/index.html')){
      const [page, { version, bubbles }] = await Promise.all([env.ASSETS.fetch(request), chosenIntro(request, env, ctx)]);
      if (version === 'v1' || !page.ok || !(page.headers.get('content-type') || '').includes('text/html')) return page;
      try {
        // every intro script runs only if it is the chosen one
        return new HTMLRewriter().on('script[data-intro]', { element(el){
          if (el.getAttribute('data-intro') === version){
            el.removeAttribute('type');
            // the owner's bubbles are set just before the chosen intro runs (the page has no explicit <head> to put them in)
            if (bubbles) el.before('<script>window.KA_INTRO_BUBBLES=' + JSON.stringify(bubbles).replace(/</g, '\\u003c') + ';</script>', { html: true });
          } else el.setAttribute('type', 'text/plain');
        } }).on('html', { element(el){ el.setAttribute('data-ka-intro', version); } }).transform(page);
      } catch { return page; }
    }
    return env.ASSETS.fetch(request);
  }
};
