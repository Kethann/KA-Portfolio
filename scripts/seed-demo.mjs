// Demo catalog for LOCAL development and screenshots only (never run against the live database).
// Uses the posters already in /images. Safe to re-run: existing slugs are skipped.
// Usage: npm run db:seed-demo
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setEnvSource, isProduction } from '../server/core/env.js';
import { getDb, setDatabase } from '../server/core/db.js';

const root = fileURLToPath(new URL('..', import.meta.url));
config({ path: resolve(root, '.env') });
process.env.KA_DATA_DIR ||= resolve(root, '.data');
setEnvSource(process.env);
if (isProduction() || false){
  console.error('Refusing to seed demo data into a live database.');
  process.exit(1);
}
const { openSqlite } = await import('../server/dev/sqlite.js');
setDatabase(openSqlite(resolve(process.env.KA_DATA_DIR || resolve(root, '.data'), 'ka.sqlite')));
const db = await getDb();

async function category(kind, name, slug, sort){
  const row = await db.maybeOne('select id from categories where kind=$1 and slug=$2', [kind, slug]);
  return row ? row.id : (await db.one('insert into categories (kind,name,slug,sort) values ($1,$2,$3,$4) returning id', [kind, name, slug, sort])).id;
}
async function license(key, name, summary){
  const row = await db.maybeOne('select id from licenses where key=$1', [key]);
  return row ? row.id : (await db.one('insert into licenses (key,name,summary,body_md) values ($1,$2,$3,$4) returning id', [key, name, summary, `# ${name}\n\n(demo text)`])).id;
}
async function product(p, media){
  if (await db.maybeOne('select 1 from products where slug=$1', [p.slug])) return false;
  const cols = Object.keys(p), vals = Object.values(p);
  const { id } = await db.one(`insert into products (${cols.join(',')}) values (${cols.map((_, i) => '$' + (i + 1)).join(',')}) returning id`, vals);
  for (const [i, m] of media.entries()) await db.query('insert into product_media (product_id,url,alt,width,height,sort) values ($1,$2,$3,$4,$5,$6)', [id, m.url, m.alt, m.width, m.height, i]);
  return true;
}

const posters = await category('artzz', 'Film posters', 'film-posters', 0);
const keyArt = await category('artzz', 'Key art', 'key-art', 1);
const templates = await category('artifacts', 'Templates', 'templates', 0);
const tools = await category('artifacts', 'Tools', 'tools', 1);
const personal = await license('personal', 'Personal', 'For your own non-commercial projects.');
const commercial = await license('commercial', 'Commercial', 'Use in client and commercial work.');

const art = [
  ['tiger-blue', 'All Hail the Tiger', posters, true], ['devara-11-days', 'Devara — 11 Days', posters, false], ['devara-14-days', 'Devara — 14 Days', posters, true],
  ['vara-23-days', 'Vara — 23 Days', keyArt, false], ['wa-00-40-18', 'Night Frame', keyArt, true]
];
let added = 0;
for (const [i, [slug, title, cat, sell]] of art.entries()){
  added += await product({ kind: 'artzz', slug: `art-${slug}`, title, summary: 'Theatrical key art.', description: 'High-resolution poster artwork. Digital download.',
    category_id: cat, status: 'published', sellable: sell, price_inr: sell ? 49900 + i * 10000 : null, price_usd: sell ? 799 + i * 100 : null, license_id: personal, sort: i },
    [{ url: `/images/${slug}-768.webp`, alt: title, width: 768, height: 1152 }]) ? 1 : 0;
}
const now = Date.now();
added += await product({ kind: 'artifacts', slug: 'poster-kit', title: 'Poster Layout Kit', version: '2.1',
  summary: 'Grid systems, title lockups and credit blocks for movie posters.', description: 'PSD + Figma files with 40 layouts.',
  category_id: templates, tech_tags: ['Photoshop', 'Figma'], status: 'published', sellable: true, price_inr: 149900, price_usd: 2900,
  sale_price_inr: 99900, sale_price_usd: 1900, sale_starts_at: new Date(now - 864e5), sale_ends_at: new Date(now + 7 * 864e5), license_id: commercial, demo_url: 'https://example.com/demo', sort: 0 },
  [{ url: '/images/tiger-blue-768.webp', alt: 'Kit preview', width: 768, height: 1152 }, { url: '/images/devara-11-days-768.webp', alt: 'Kit preview 2', width: 768, height: 1152 }]) ? 1 : 0;
added += await product({ kind: 'artifacts', slug: 'grain-brushes', title: 'Film Grain Brushes', version: '1.0',
  summary: 'Twelve grain and dust brushes for poster finishing.', category_id: tools, tech_tags: ['Photoshop'], status: 'published', sellable: true, is_free: true, license_id: personal, sort: 1 },
  [{ url: '/images/vara-23-days-768.webp', alt: 'Brush preview', width: 768, height: 1152 }]) ? 1 : 0;
added += await product({ kind: 'artifacts', slug: 'credit-generator', title: 'Credit Block Generator', version: '0.9',
  summary: 'Type your cast and crew, get a print-ready credit block.', category_id: tools, tech_tags: ['React', 'TypeScript'], status: 'published', sellable: true,
  price_inr: 79900, price_usd: 1500, license_id: commercial, preview_url: 'https://example.com/preview', sort: 2 }, []) ? 1 : 0;

const tipsCat = await category('tips', 'Design', 'design', 0);
const devCat = await category('tips', 'Development', 'development', 1);
for (const [slug, title, excerpt, body, cat, cover] of [
  ['warm-palettes', 'Warm palettes that print well', 'Bronze and amber survive print better than neon.', '## Why warm\nWarm tones hold up in **print**.\n\n- Keep saturation under 80%\n- Proof on paper\n\n> Always proof.', tipsCat, '/images/tiger-blue-768.webp'],
  ['type-scale', 'A type scale for posters', 'Three sizes are usually enough.', 'Use **three** sizes: title, billing, credits.', tipsCat, '/images/devara-14-days-768.webp'],
  ['lazy-images', 'Lazy images without layout shift', 'Always reserve the space.', 'Set `width` and `height` or `aspect-ratio`.\n\n```\nimg{aspect-ratio:4/5}\n```', devCat, '']
]){
  if (await db.maybeOne('select 1 from tips where slug=$1', [slug])) continue;
  await db.query(`insert into tips (slug,title,excerpt,body_md,category_id,status,published_at,cover_url) values ($1,$2,$3,$4,$5,'published',now(),$6)`, [slug, title, excerpt, body, cat, cover]);
  added++;
}
// placeholder deliverables so a local test purchase can be downloaded end to end
const { getStorage } = await import('../server/core/storage.js');
const storage = getStorage();
for (const p of await db.query(`select p.id, p.slug, p.title from products p where p.sellable and not exists (select 1 from product_files f where f.product_id = p.id and f.is_current)`)){
  const path = `demo/${p.slug}.txt`;
  const bytes = Buffer.from(`Demo deliverable for "${p.title}". Replace it by uploading the real file in the portal.\n`);
  await storage.put('deliverables', path, bytes, 'text/plain');
  await db.query(`insert into product_files (product_id, storage_path, filename, bytes) values ($1, $2, $3, $4)`, [p.id, path, `${p.slug}.txt`, bytes.length]);
  added++;
}
console.log(`Demo data ready (${added} new rows).`);
process.exit(0);
