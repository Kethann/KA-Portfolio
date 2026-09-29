// HOST ADAPTER: VERCEL. Everything Vercel-specific lives in this file:
//   * environment variables come from process.env
//   * the client IP comes from x-forwarded-for / x-real-ip (Vercel overwrites these; clients
//     cannot spoof them)
//   * approximate location comes from Vercel's free x-vercel-ip-* headers
// Moving to Cloudflare later means writing server/platform/cloudflare.js with the same three
// functions (env from the Worker `env`, IP from cf-connecting-ip, geo from request.cf).
import { setEnvSource } from '../core/env.js';
import { handle } from '../handler.js';

setEnvSource(process.env);

function header(request, name){
  const v = request.headers.get(name);
  if (!v) return null;
  try { return decodeURIComponent(v); } catch { return v; }
}

export const platform = {
  name: 'vercel',
  clientIp(request){
    const xff = request.headers.get('x-forwarded-for');
    const ip = (xff ? xff.split(',')[0] : request.headers.get('x-real-ip') || '').trim();
    return ip || null;
  },
  geo(request){
    const country = header(request, 'x-vercel-ip-country');
    if (!country) return null;
    return {
      country,
      region: header(request, 'x-vercel-ip-country-region'),
      city: header(request, 'x-vercel-ip-city'),
      timezone: header(request, 'x-vercel-ip-timezone'),
      provider: 'vercel'
    };
  }
};

export function vercelFetch(request){ return handle(request, platform); }
