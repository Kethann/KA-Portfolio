// Approximate visitor location, from the explicitly selected IP geo provider, or the host platform.
// IP locations are estimates (normally city/ISP level), never an address or street location.
// Provider selection: GEO_PROVIDER=ipstack|ipwhois|cloudflare|auto. Default auto uses Cloudflare,
// then configured external providers. IPSTACK_ACCESS_KEY is only used with HTTPS unless HTTP is opted into.
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
    url: (ip) => `${env('IPSTACK_HTTPS') === '1' ? 'https' : 'http'}://api.ipstack.com/${encodeURIComponent(ip)}?access_key=${encodeURIComponent(env('IPSTACK_ACCESS_KEY'))}&fields=country_code,region_name,city,time_zone.id,zip,latitude,longitude,connection.isp`,
    parse: (j) => j && j.country_code ? { country: j.country_code, region: j.region_name || null, city: j.city || null, timezone: j.time_zone?.id || null,
      postal: j.zip || null, latitude: Number.isFinite(Number(j.latitude)) ? Number(j.latitude) : null, longitude: Number.isFinite(Number(j.longitude)) ? Number(j.longitude) : null, isp: j.connection?.isp || null } : null
  },
  ipwhois: {
    enabled: () => (env('GEO_FALLBACK') || 'ipwhois') === 'ipwhois', monthly: 9000,
    url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country_code,region,city,timezone.id,postal,latitude,longitude,connection.isp,continent`,
    parse: (j) => j && j.success && j.country_code ? { country: j.country_code, region: j.region || null, city: j.city || null, timezone: j.timezone?.id || null,
      postal: j.postal || null, latitude: Number.isFinite(Number(j.latitude)) ? Number(j.latitude) : null, longitude: Number.isFinite(Number(j.longitude)) ? Number(j.longitude) : null,
      isp: j.connection?.isp || null, continent: j.continent_code || null } : null
  }
};

async function takeQuota(db, provider, monthly){
  const period = new Date().toISOString().slice(0, 7);
  const row = await db.one(`insert into geo_quota (provider, period, used) values ($1, $2, 1)
    on conflict (provider, period) do update set used = geo_quota.used + 1 returning used`, [provider, period]);
  return row.used <= monthly;
}

export async function locate(ip, platformGeo){
  const selected = (env('GEO_PROVIDER') || 'auto').toLowerCase();
  if (!['auto', 'ipstack', 'ipwhois', 'cloudflare'].includes(selected)) return null;
  if (selected === 'cloudflare') return platformGeo?.country ? { ...platformGeo } : null;
  if (selected === 'auto' && platformGeo?.country) return { ...platformGeo };
  if (!isPublicIp(ip)) return null;
  const db = await getDb();
  const providers = selected === 'auto' ? [['ipstack', PROVIDERS.ipstack], ['ipwhois', PROVIDERS.ipwhois]] : [[selected, PROVIDERS[selected]]];
  const cached = await db.maybeOne(`select c.country, c.region, c.city, c.timezone, c.provider, v.postal, v.latitude, v.longitude, v.isp, v.continent
    from ip_geo_cache c left join visits v on v.ip = c.ip and v.country = c.country and v.city is c.city where c.ip = $1 and c.looked_up_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || $2 || ' days')
    order by v.visited_at desc limit 1`, [ip, CACHE_DAYS]);
  if (cached && (selected === 'auto' || cached.provider === selected)) return cached;
  for (const [name, p] of providers){
    if (!p?.enabled()) continue;
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
