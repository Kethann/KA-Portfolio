// Configuration access. The platform adapter (server/platform/*.js) installs the source of
// environment variables once; handlers only ever call env()/requireEnv(). Secrets never leave
// the server: the only values the browser receives are the explicit PUBLIC_KEYS below.
let source = {};

export function setEnvSource(obj){ source = obj || {}; }
export function env(name, fallback = undefined){
  const v = source[name];
  return v === undefined || v === '' ? fallback : v;
}
export function requireEnv(name){
  const v = env(name);
  if (v === undefined) throw new Error(`Missing required environment variable ${name}.`);
  return v;
}

// true on the live site; preview deployments and local development are not production.
export function isProduction(){
  return env('KA_ENV') === 'production' || env('VERCEL_ENV') === 'production';
}

// Safe to show in the browser (they identify, they don't authorize).
export const PUBLIC_KEYS = ['TURNSTILE_SITE_KEY', 'RAZORPAY_KEY_ID'];

export function siteUrl(request){
  return (env('PUBLIC_SITE_URL') || (request ? new URL(request.url).origin : 'http://127.0.0.1:8787')).replace(/\/+$/, '');
}
