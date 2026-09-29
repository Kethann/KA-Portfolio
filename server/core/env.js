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

// Local file-backed drivers (dev server and tests only). Serverless hosts have a read-only
// filesystem, so a missing provider key there is a configuration error, never a reason to write
// files. KA_DATA_DIR has no default on purpose: a literal path here would also make Vercel's file
// tracer bundle the local .data folder (test emails, uploads) into the function.
export function localDataDir(provider){
  if (env('VERCEL') || isProduction()) throw new Error(`${provider} is not configured on this deployment. Add its environment variables in Vercel and redeploy.`);
  const dir = env('KA_DATA_DIR');
  if (!dir) throw new Error('KA_DATA_DIR is not set. Start the app with npm start, which sets it.');
  return dir;
}

// Safe to show in the browser (they identify, they don't authorize).
export const PUBLIC_KEYS = ['TURNSTILE_SITE_KEY', 'RAZORPAY_KEY_ID'];

export function siteUrl(request){
  return (env('PUBLIC_SITE_URL') || (request ? new URL(request.url).origin : 'http://127.0.0.1:9878')).replace(/\/+$/, '');
}
