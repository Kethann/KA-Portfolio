// kethan.pages.dev = the whole site. Cloudflare Pages serves the static files (dist/); the dynamic paths
// (_routes.json) are handed to the kethan-artzz Worker through a service binding (env.SITE). The request goes
// across unchanged, so the visitor's IP/location, cookies and same-origin checks behave as on one site.
export default {
  async fetch(request, env){
    const path = new URL(request.url).pathname;
    if (/^\/(api\/|legal(\/|$)|__storage\/|__storage-upload\/)/.test(path)) return env.SITE.fetch(request);
    return env.ASSETS.fetch(request);
  }
};
