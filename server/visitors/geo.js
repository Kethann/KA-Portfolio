// Approximate visitor location, from pluggable providers tried in order:
//   1. the host platform (Vercel's free x-vercel-ip-* headers): no third party involved
//   2. our cache (ip_geo_cache, 30 days)
//   3. ipstack, if IPSTACK_ACCESS_KEY is set (free plan: 100 lookups/month; counted in geo_quota)
//   4. ipwho.is, unless GEO_FALLBACK=none (self-capped; check its terms before commercial use)
// Private/local addresses are never looked up. A lookup never takes longer than 1.5 s.
import { getDb } from '../core/db.js';
import { env } from '../core/env.js';

const CACHE_DAYS = 30;
let fetchImpl = (...a) => fetch(...a);
export function setGeoFetch(f){ fetchImpl = f; }

export function isPublicIp(ip){
  if (!ip || typeof ip !== 'string') return false;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)) return false;
  if (/^(::1?$|fe80:|fc|fd|::ffff:(10|127|192\.168)\.)/i.test(ip)) return false;
  return /^[0-9.]+$|^[0-9a-f:]+$/i.test(ip);
}

const PROVIDERS = {
  ipstack: {
    // The free plan is HTTP-only, so the key and the visitor's IP would travel unencrypted: it is used
    // only with a paid HTTPS plan (IPSTACK_HTTPS=1) or when you explicitly accept that (IPSTACK_ALLOW_HTTP=1).
    enabled: () => !!env('IPSTACK_ACCESS_KEY') && (env('IPSTACK_HTTPS') === '1' || env('IPSTACK_ALLOW_HTTP') === '1'), monthly: 100,
    url: (ip) => `${env('IPSTACK_HTTPS') === '1' ? 'https' : 'http'}://api.ipstack.com/${encodeURIComponent(ip)}?access_key=${encodeURIComponent(env('IPSTACK_ACCESS_KEY'))}&fields=country_code,region_name,city,time_zone.id`,
    parse: (j) => j && j.country_code ? { country: j.country_code, region: j.region_name || null, city: j.city || null, timezone: j.time_zone?.id || null } : null
  },
  ipwhois: {
    enabled: () => (env('GEO_FALLBACK') || 'ipwhois') === 'ipwhois', monthly: 9000,
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,region,city,timezone.id`,
    parse: (j) => j && j.success && j.country_code ? { country: j.country_code, region: j.region || null, city: j.city || null, timezone: j.timezone?.id || null } : null
  }
};

async function takeQuota(db, provider, monthly){
  const period = new Date().toISOString().slice(0, 7);
  const row = await db.one(`insert into geo_quota (provider, period, used) values ($1, $2, 1)
    on conflict (provider, period) do update set used = geo_quota.used + 1 returning used`, [provider, period]);
  return row.used <= monthly;
}

export async function locate(ip, platformGeo){
  if (platformGeo && platformGeo.country) return { ...platformGeo };
  if (!isPublicIp(ip)) return null;
  const db = await getDb();
  const cached = await db.maybeOne(`select country, region, city, timezone, provider from ip_geo_cache where ip = $1 and looked_up_at > now() - make_interval(days => $2)`, [ip, CACHE_DAYS]);
  if (cached) return cached;
  for (const [name, p] of Object.entries(PROVIDERS)){
    if (!p.enabled()) continue;
    if (!(await takeQuota(db, name, p.monthly))) continue;
    try {
      const res = await fetchImpl(p.url(ip), { signal: AbortSignal.timeout(1500), headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const g = p.parse(await res.json());
      if (!g) continue;
      await db.query(`insert into ip_geo_cache (ip, country, region, city, timezone, provider) values ($1,$2,$3,$4,$5,$6)
        on conflict (ip) do update set country = excluded.country, region = excluded.region, city = excluded.city, timezone = excluded.timezone, provider = excluded.provider, looked_up_at = now()`,
        [ip, g.country, g.region, g.city, g.timezone, name]);
      return { ...g, provider: name };
    } catch { /* timeout or network: try the next provider */ }
  }
  return null;
}
