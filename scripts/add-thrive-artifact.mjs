// Adds Thrive (the fitness tracker hosted at /artifacts/thrive/) to the Store's Artifacts, the same way the Ledger is listed:
// a product with screenshots, summary, description, tags and a live link. It goes through the portal's own API, so it
// works on the local portal and on the live site alike, and it is safe to re-run (an existing "thrive" item is updated
// and keeps its screenshots).
//
// Usage (the password is read from the environment, so it never lands in your shell history):
//   PowerShell:  $env:KA_PORTAL_PASSWORD = '...'; node scripts/add-thrive-artifact.mjs --site https://kethan.pages.dev --email you@example.com [--code 123456]
//   Local:       node scripts/add-thrive-artifact.mjs --site http://127.0.0.1:8787 --email you@example.com
// --code is the 6-digit authenticator code, if two-step sign-in is on. Add --draft to save it unpublished.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const site = String(args.site || '').replace(/\/+$/, '');
const email = String(args.email || '');
const password = process.env.KA_PORTAL_PASSWORD || '';
if (!/^https?:\/\//.test(site) || !email || !password){
  console.error('Usage: set KA_PORTAL_PASSWORD, then: node scripts/add-thrive-artifact.mjs --site <https://your-site> --email <portal email> [--code 123456] [--draft]');
  process.exit(1);
}

const SHOTS = fileURLToPath(new URL('./artifacts/thrive/', import.meta.url));
const ENTRY = {
  title: 'Thrive',
  slug: 'thrive',
  summary: 'Private fitness, nutrition, hydration, sleep & body tracker. Health and readiness scores, 128 foods including Indian dishes, a fasting timer, habits with streaks, reminders, and 7/30/90-day insights. Works offline, installs as an app, and keeps all data on your device.',
  description: `Thrive is a private fitness, nutrition, hydration, sleep and body tracker. It gives you a daily health score and a readiness score, logs meals from 128 foods (Indian dishes included), and turns your days into clear 7, 30 and 90-day insights. It works offline, installs as an app on your phone or laptop, and keeps every bit of data on your device: no account, no server.

## Try it

Open the **Live demo** and choose *Explore with sample data* to see 90 days of example data, or start fresh. On a phone, use *Add to Home Screen* (or *Install app*) to keep it like any other app.

## What you get

- **Today**: health score (0–100), readiness (sleep, sleep debt, bedtime rhythm and yesterday's load → Primed, Steady or Recover), four activity rings, a week strip, water quick-add, habits with streaks, a fasting timer and guided breathing.
- **Nutrition**: 128 foods with 11 nutrients each, search, favourites, recents, custom foods, copy yesterday's meal and a nutrition-facts panel. Smart picks suggest foods that fit what's left of your calories, protein or fiber.
- **Hydration**: pace against the time of day, quick amounts and a 14-day chart.
- **Activity**: 28 activities with calorie burn, steps, a strength log with personal records and weekly WHO 150-minute tracking.
- **Sleep**: bed and wake times, quality, 7-day average, sleep debt and bedtime consistency.
- **Body**: weight, body fat, waist and BMI, with a 7-day moving average and a goal-date projection.
- **Insights**: this week against last week, 14 charts, a consistency calendar, weekday patterns, top foods, achievements and automatic insights (such as sleep against mood).
- **Reminders**: water, meals, workouts, sleep, weigh-ins and medication, at a set time or on an interval, with snooze. They skip themselves once you're on track.

## Private by design

All data stays in your browser's storage on your own device. Back it up or move it with JSON export and restore, or export CSV.

## Built with

Plain HTML, CSS and JavaScript: no framework and no build step. A service worker keeps it working offline.`,
  categorySlug: 'tools',             // TODO: confirm the category (the Ledger is in Business; Thrive fits Tools best of the existing ones)
  tags: ['fitness', 'health', 'nutrition', 'calorie tracker', 'sleep', 'hydration', 'habits', 'india'],
  techTags: ['PWA', 'Offline', 'Health', 'Vanilla JS'],
  version: '',                       // TODO: set Thrive's version (the Ledger shows 1.0.0; Thrive has no version number yet)
  demoUrl: 'https://kethan.pages.dev/artifacts/thrive/',
  // Artifacts are a showcase and are never sold, so no price, license or download file (unlike the Ledger's old setup).
  sellable: false
};
// gallery order and captions: desktop screens first, then phone screens (the store's Desktop / Mobile switch splits them)
const MEDIA = [
  ['thrive-today-desktop.png', 'Today: health score, four activity rings, readiness and smart food picks'],
  ['thrive-nutrition-desktop.png', 'Nutrition: daily summary, nutrients against targets and meals'],
  ['thrive-insights-desktop.png', 'Insights: 30-day averages, this week against last week and a consistency calendar'],
  ['thrive-hydration-desktop.png', 'Hydration: pace through the day and a 14-day chart'],
  ['thrive-activity-desktop.png', 'Activity: workouts, steps and strength records'],
  ['thrive-sleep-desktop.png', 'Sleep: schedule, quality and sleep debt'],
  ['thrive-body-desktop.png', 'Body: weight trend, moving average and goal projection'],
  ['thrive-today-mobile.png', 'Today on a phone'],
  ['thrive-nutrition-mobile.png', 'Nutrition on a phone'],
  ['thrive-insights-mobile.png', 'Insights on a phone']
];

let cookie = '', csrf = '';
async function api(method, path, body){
  const res = await fetch(site + '/api/admin' + path, {
    method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path}: ${(data && data.error) || res.status}`);
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return data;
}
const pngSize = (buf) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

const login = await api('POST', '/login', { email, password, ...(args.code ? { code: String(args.code) } : {}) });
csrf = login.csrf;
console.log(`Signed in to ${site} as ${email}.`);

const { products } = await api('GET', '/products?kind=artifacts&limit=500').catch(() => api('GET', '/products'));
let p = (products || []).find(x => x.slug === ENTRY.slug);
if (p) p = (await api('GET', `/products/${p.id}`)).product;
else { p = (await api('POST', '/products', { kind: 'artifacts', title: ENTRY.title })).product; console.log('Created the Thrive item.'); }

if (!p.media?.length){
  const files = new Set(readdirSync(SHOTS));
  for (const [name, alt] of MEDIA){
    if (!files.has(name)){ console.warn(`  missing screenshot ${name}, skipped`); continue; }
    const buf = readFileSync(SHOTS + name);
    const sig = await api('POST', '/uploads', { kind: 'image', contentType: 'image/png', bytes: buf.length, filename: name });
    const put = await fetch(new URL(sig.uploadUrl, site), { method: sig.method || 'PUT', headers: { 'Content-Type': 'image/png' }, body: buf });
    if (!put.ok) throw new Error(`Uploading ${name} failed (${put.status}).`);
    p = (await api('POST', `/products/${p.id}/media`, { url: sig.publicUrl, alt, ...pngSize(buf) })).product;
    console.log(`  uploaded ${name}`);
  }
} else console.log(`Kept its ${p.media.length} screenshots.`);

const { categories } = await api('GET', '/categories');
const cat = (categories || []).find(c => c.kind === 'artifacts' && c.slug === ENTRY.categorySlug);
if (!cat) console.warn(`No Artifacts category "${ENTRY.categorySlug}": Thrive is saved without one (choose it in Products).`);

const { product } = await api('PUT', `/products/${p.id}`, {
  ...p, title: ENTRY.title, slug: ENTRY.slug, summary: ENTRY.summary, description: ENTRY.description,
  categoryId: cat ? cat.id : null, tags: ENTRY.tags, techTags: ENTRY.techTags, version: ENTRY.version,
  demoUrl: ENTRY.demoUrl, previewUrl: '', sellable: ENTRY.sellable, isFree: false,
  priceInr: null, priceUsd: null, salePriceInr: null, salePriceUsd: null, saleStartsAt: null, saleEndsAt: null, licenseId: null,
  status: args.draft ? 'draft' : 'published', updatedAt: p.updatedAt
});
console.log(`Thrive is ${product.status} in Artifacts: ${site}/?page=store&product=${product.slug}`);
