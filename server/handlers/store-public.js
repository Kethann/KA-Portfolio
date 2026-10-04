// Public catalog + tips. Read-only; only published rows are ever selected.
import { json, HttpError } from '../core/http.js';
import { getDb, ftsQuery } from '../core/db.js';
import { priceFor, percentOff } from '../store/pricing.js';
import { renderMarkdown } from '../core/markdown.js';
import { PUBLIC_CACHE } from './public.js';
import { getSetting } from '../core/settings.js';

const PRODUCT_SELECT = `
  select p.*, c.slug as category_slug, c.name as category_name,
         l.key as license_key, l.name as license_name, l.summary as license_summary,
         (select json_group_array(json_object('url', m.url, 'alt', m.alt, 'width', m.width, 'height', m.height))
            from (select * from product_media m where m.product_id = p.id order by m.sort, m.id) m) as media,
         (select count(*) from order_items i join orders o on o.id = i.order_id where i.product_id = p.id and o.status in ('paid','delivered')) as downloads,
         (select round(avg(r.rating), 2) from product_ratings r where r.product_id = p.id and r.status = 'visible') as rating_avg,
         (select count(*) from product_ratings r where r.product_id = p.id and r.status = 'visible') as rating_count
    from products p
    left join categories c on c.id = p.category_id
    left join licenses l on l.id = p.license_id`;

export function productDto(p, now = new Date(), show = { ratings: true, downloads: true }){
  const prices = {};
  for (const cur of ['INR', 'USD']){
    const pr = priceFor(p, cur, now);
    prices[cur] = { ...pr, percentOff: percentOff(pr) };
  }
  return {
    id: p.id, slug: p.slug, kind: p.kind, title: p.title, summary: p.summary, description: p.description,
    descriptionHtml: p.description ? renderMarkdown(p.description) : '',   // Markdown from the portal, rendered safely here
    category: p.category_slug ? { slug: p.category_slug, name: p.category_name } : null,
    tags: p.tags || [], techTags: p.tech_tags || [], version: p.version || '',
    sellable: !!p.sellable, free: !!p.is_free, prices,
    license: p.license_key ? { key: p.license_key, name: p.license_name, summary: p.license_summary } : null,
    demoUrl: p.demo_url || '', previewUrl: p.preview_url || '',
    media: Array.isArray(p.media) ? p.media : [],
    delivery: { linkHours: p.link_ttl_hours, maxDownloads: p.max_downloads },
    downloads: show.downloads ? Number(p.downloads || 0) : null,
    rating: show.ratings && Number(p.rating_count) > 0 ? { avg: Number(p.rating_avg), count: Number(p.rating_count) } : null
  };
}

export async function catalog(ctx){
  const kind = ctx.url.searchParams.get('kind');
  if (kind && kind !== 'artzz' && kind !== 'artifacts') throw new HttpError(400, 'Unknown store section.');
  const db = await getDb();
  const rows = await db.query(`${PRODUCT_SELECT} where p.status = 'published' and ($1 is null or p.kind = $1) order by p.kind, p.sort, p.created_at desc limit 500`, [kind || null]);
  const categories = await db.query(`select kind, slug, name from categories where kind in ('artzz','artifacts') and ($1 is null or kind = $1) order by kind, sort, name`, [kind || null]);
  const now = new Date(), show = await showFlags();
  return json({ products: rows.map(r => productDto(r, now, show)), categories }, 200, PUBLIC_CACHE);
}

export async function product(ctx){
  const slug = ctx.params.slug;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new HttpError(404, 'Product not found.');
  const db = await getDb();
  const row = await db.maybeOne(`${PRODUCT_SELECT} where p.status = 'published' and p.slug = $1`, [slug]);
  if (!row) throw new HttpError(404, 'Product not found.');
  return json({ product: productDto(row, new Date(), await showFlags()) }, 200, PUBLIC_CACHE);
}

async function showFlags(){
  const s = await getSetting('store');
  return { ratings: s.showRatings !== false, downloads: s.showDownloads !== false };
}

// The latest visible reviews of a published item (name is optional and never includes the buyer's email).
export async function reviews(ctx){
  const slug = ctx.params.slug;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new HttpError(404, 'Product not found.');
  if (!(await showFlags()).ratings) return json({ reviews: [] }, 200, PUBLIC_CACHE);
  const db = await getDb();
  const rows = await db.query(`select r.rating, r.review, r.name, r.created_at from product_ratings r join products p on p.id = r.product_id
    where p.slug = $1 and p.status = 'published' and r.status = 'visible' order by (r.review <> '') desc, r.created_at desc limit 20`, [slug]);
  return json({ reviews: rows.map(r => ({ rating: r.rating, review: r.review, name: r.name || 'Verified buyer', at: r.created_at })) }, 200, PUBLIC_CACHE);
}

// Search terms -> a safe FTS5 prefix query: only letters/numbers survive and each word is quoted, so
// user text can never reach the search parser as syntax. Every word must match (as a prefix).
export const toPrefixQuery = ftsQuery;

const PAGE = 12;
export async function tips(ctx){
  const q = toPrefixQuery(ctx.url.searchParams.get('q'));
  const category = ctx.url.searchParams.get('category') || null;
  if (category && !/^[a-z0-9-]{1,60}$/.test(category)) throw new HttpError(400, 'Unknown category.');
  const page = Math.max(0, Math.min(500, Number.parseInt(ctx.url.searchParams.get('page') || '0', 10) || 0));
  const db = await getDb();
  const rows = await db.query(`
    select t.slug, t.title, t.excerpt, t.cover_url, t.tags, t.published_at, c.slug as category_slug, c.name as category_name
      from tips t left join categories c on c.id = t.category_id
      ${q ? `join (select rowid as rid, rank from tips_fts where tips_fts match $1) f on f.rid = t.rowid` : ''}
     where t.status = 'published'
       and ($2 is null or c.slug = $2)
     order by ${q ? `f.rank, ` : ''}t.published_at desc nulls last, t.created_at desc
     limit ${PAGE + 1} offset ${page * PAGE}`, [q, category]);
  const categories = await db.query(`select slug, name from categories where kind = 'tips' order by sort, name`);
  return json({
    tips: rows.slice(0, PAGE).map(t => ({ slug: t.slug, title: t.title, excerpt: t.excerpt, coverUrl: t.cover_url, tags: t.tags, publishedAt: t.published_at,
      category: t.category_slug ? { slug: t.category_slug, name: t.category_name } : null })),
    categories, page, hasMore: rows.length > PAGE
  }, 200, PUBLIC_CACHE);
}

export async function tip(ctx){
  const slug = ctx.params.slug;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new HttpError(404, 'Tip not found.');
  const db = await getDb();
  const t = await db.maybeOne(`select t.*, c.slug as category_slug, c.name as category_name from tips t left join categories c on c.id = t.category_id
    where t.status = 'published' and t.slug = $1`, [slug]);
  if (!t) throw new HttpError(404, 'Tip not found.');
  return json({ tip: { slug: t.slug, title: t.title, excerpt: t.excerpt, coverUrl: t.cover_url, tags: t.tags, publishedAt: t.published_at,
    category: t.category_slug ? { slug: t.category_slug, name: t.category_name } : null, html: renderMarkdown(t.body_md) } }, 200, PUBLIC_CACHE);
}

export function registerStorePublic(route){
  route('GET', '/api/store/catalog', catalog);
  route('GET', '/api/store/products/:slug', product);
  route('GET', '/api/store/products/:slug/reviews', reviews);
  route('GET', '/api/tips', tips);
  route('GET', '/api/tips/:slug', tip);
}
