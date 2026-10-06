// Portal: products (Artzz / Artifacts), categories, media, deliverable files, licenses.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { env } from '../core/env.js';
import { getStorage } from '../core/storage.js';
import { randomToken } from '../core/crypto.js';
import { str, int, bool, url as vUrl, stringArray, slug as vSlug, uuid as vUuid } from '../core/validate.js';
import { productDto } from '../handlers/store-public.js';
import { audit } from './auth.js';
import { getSettingWithRevision, setSetting } from '../core/settings.js';
import { sendEmail, DEFAULT_TEMPLATES } from '../core/email.js';
import { loadSiteDocument } from '../handlers/public.js';

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };
const FONT_TYPES = { 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf' };
const MB = 1024 * 1024;
// Size limits: none of our own for images and buyer files — R2's maximum object size (5 TiB) is the only one.
// Up to SINGLE_UPLOAD a file goes up in one request; bigger files go up in PART_SIZE chunks (a Worker accepts
// at most 100 MB per request on the free plan), so any size works.
export const MAX_FILE = 5 * 1024 * 1024 * MB, SINGLE_UPLOAD = 90 * MB, PART_SIZE = 50 * MB;

export function slugify(s){ return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item'; }

// Friendly messages for database rules the portal can hit.
export function mapDbError(err){
  const m = String(err && err.message || '');
  if (/priced_when_selling/.test(m)) return new HttpError(400, 'A published item for sale needs both an INR and a USD price (or mark it free).');
  if (/sale_below_price/.test(m)) return new HttpError(400, 'The sale price must be lower than the normal price.');
  if (/sale_window|coupon_window/.test(m)) return new HttpError(400, 'The end date must be after the start date.');
  // SQLite/D1 wording: "UNIQUE constraint failed: products.slug", "CHECK constraint failed: <name or rule>"
  if (/UNIQUE constraint failed: (products|tips)\.slug/.test(m)) return new HttpError(409, 'That web address (slug) is already used by another item.');
  if (/UNIQUE constraint failed: coupons\.code/.test(m)) return new HttpError(409, 'That code already exists.');
  if (/coupon_value/.test(m)) return new HttpError(400, 'Set a percentage, or a fixed amount for at least one currency.');
  if (/json_array_length\(currencies\)/.test(m)) return new HttpError(400, 'Choose at least one currency.');
  return null;
}
async function guarded(fn){
  try { return await fn(); } catch (err){ throw mapDbError(err) || err; }
}

// ---- uploads (signed, direct to storage) --------------------------------------------------------
export async function signUpload(ctx){
  const body = await readJson(ctx.request, 4096);
  const kind = body.kind;
  let type = str(body.contentType, { max: 100 }).toLowerCase();
  // the file's own extension is more reliable than the type a browser reports (fonts often arrive as application/x-font-ttf or empty)
  const ext = String(body.filename || '').toLowerCase().split('.').pop();
  if (kind === 'font'){ const byExt = Object.entries(FONT_TYPES).find(([, e]) => e === ext); if (byExt) type = byExt[0]; }
  if (kind === 'image'){ const byExt = Object.entries(IMAGE_TYPES).find(([, e]) => e === ext || (ext === 'jpeg' && e === 'jpg')); if (byExt) type = byExt[0]; }
  const bytes = int(body.bytes, { name: 'File size', min: 1, max: MAX_FILE });
  const name = str(body.filename, { name: 'File name', max: 160, required: true }).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(-100) || 'file';
  let bucket, path;
  if (kind === 'image'){
    if (!IMAGE_TYPES[type]) throw new HttpError(400, 'Upload a PNG, JPG, WebP, AVIF or GIF image.');
    bucket = 'media'; path = `images/${randomToken(9)}.${IMAGE_TYPES[type]}`;
  } else if (kind === 'font'){
    if (!FONT_TYPES[type]) throw new HttpError(400, 'Upload a WOFF2, WOFF, TTF or OTF font.');
    if (bytes > 50 * MB) throw new HttpError(400, 'Fonts can be up to 50 MB.');
    bucket = 'media'; path = `fonts/${randomToken(9)}.${FONT_TYPES[type]}`;
  } else if (kind === 'deliverable'){
    bucket = 'deliverables'; path = `files/${randomToken(12)}/${name}`;
  } else throw new HttpError(400, 'Unknown upload type.');
  const storage = getStorage();
  const chunked = bytes > SINGLE_UPLOAD;
  // a big upload can take hours on a slow connection: its link stays valid for a day
  const up = await storage.signedUploadUrl(bucket, path, chunked ? 24 * 3600 : 600);
  return json({ bucket, path, uploadUrl: up.url, method: up.method, contentType: type, publicUrl: bucket === 'media' ? storage.publicUrl(bucket, path) : null,
    chunked, partSize: PART_SIZE });
}

// URLs the site may show as images: our own public media bucket, or the site's /images folder.
export function isOwnMediaUrl(u){
  if (typeof u !== 'string' || !u) return false;
  if (/^\/images\/[A-Za-z0-9._-]+\.(webp|avif|png|jpg|jpeg)$/.test(u)) return true;
  const prefix = getStorage().publicUrl('media', 'x').slice(0, -1);
  return u.startsWith(prefix) && /^[A-Za-z0-9._/-]+$/.test(u.slice(prefix.length)) && !u.includes('..');
}

// ---- products ------------------------------------------------------------------------------------
const LIST_SELECT = `select p.*, c.name as category_name, c.slug as category_slug, l.name as license_name, l.key as license_key, l.summary as license_summary,
  (select json_group_array(json_object('id', m.id, 'url', m.url, 'alt', m.alt, 'width', m.width, 'height', m.height))
     from (select * from product_media m where m.product_id = p.id order by m.sort, m.id) m) as media,
  (select json_object('id', f.id, 'filename', f.filename, 'bytes', f.bytes, 'licenseVersion', f.license_version, 'createdAt', f.created_at) from product_files f where f.product_id = p.id and f.is_current) as file,
  (select count(*) from order_items i join orders o on o.id = i.order_id where i.product_id = p.id and o.status in ('paid','delivered')) as sales
  from products p left join categories c on c.id = p.category_id left join licenses l on l.id = p.license_id`;

function adminDto(p){
  return {
    id: p.id, kind: p.kind, slug: p.slug, title: p.title, summary: p.summary, description: p.description,
    categoryId: p.category_id, category: p.category_name || null, tags: p.tags, techTags: p.tech_tags, version: p.version,
    status: p.status, sellable: p.sellable, isFree: p.is_free, priceInr: p.price_inr, priceUsd: p.price_usd,
    salePriceInr: p.sale_price_inr, salePriceUsd: p.sale_price_usd, saleStartsAt: p.sale_starts_at, saleEndsAt: p.sale_ends_at,
    licenseId: p.license_id, license: p.license_name || null, demoUrl: p.demo_url, previewUrl: p.preview_url,
    maxDownloads: p.max_downloads, linkTtlHours: p.link_ttl_hours, refundAfterDownload: p.refund_after_download,
    sort: p.sort, media: p.media || [], file: p.file || null, sales: p.sales || 0,
    createdAt: p.created_at, updatedAt: p.updated_at, publishedAt: p.published_at,
    preview: productDto({ ...p, status: 'published' })     // exactly what the storefront card will show
  };
}

export async function listProducts(ctx){
  const kind = ctx.url.searchParams.get('kind');
  if (kind && kind !== 'artzz' && kind !== 'artifacts') throw new HttpError(400, 'Unknown section.');
  const db = await getDb();
  const archived = ctx.url.searchParams.get('status') === 'archived';   // the Archived view: items hidden because they were sold, with Restore
  const rows = await db.query(`${LIST_SELECT} where ($1 is null or p.kind = $1) and p.status ${archived ? '=' : '<>'} 'archived' order by p.kind, p.sort, p.created_at desc`, [kind || null]);
  return json({ products: rows.map(adminDto) });
}

export async function getProduct(ctx){
  const db = await getDb();
  const row = await db.maybeOne(`${LIST_SELECT} where p.id = $1`, [ctx.params.id]);
  if (!row) throw new HttpError(404, 'Product not found.');
  return json({ product: adminDto(row) });
}

async function uniqueSlug(db, base, exceptId = null){
  let s = base, i = 2;
  while (await db.maybeOne('select 1 from products where slug = $1 and ($2 is null or id <> $2)', [s, exceptId])) s = `${base.slice(0, 54)}-${i++}`;
  return s;
}

export async function createProduct(ctx){
  const body = await readJson(ctx.request, 8 * 1024);
  const kind = body.kind === 'artifacts' ? 'artifacts' : 'artzz';
  const title = str(body.title, { name: 'Title', max: 160, required: true });
  const db = await getDb();
  const slug = await uniqueSlug(db, slugify(title));
  const sort = (await db.one('select coalesce(min(sort), 0) - 1 as s from products where kind = $1', [kind])).s;
  const row = await db.one(`insert into products (kind, slug, title, status, sort, sellable) values ($1, $2, $3, 'draft', $4, $5) returning id`, [kind, slug, title, sort, kind === 'artifacts']);
  await audit(ctx, 'product_created', row.id, { title });
  return getProduct({ ...ctx, params: { id: row.id } });
}

function money(v, name){ return v === null || v === undefined || v === '' ? null : int(v, { name, min: 0, max: 100_000_000 }); }
function when(v, name){
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `${name} isn’t a valid date.`);
  return d;
}

export async function updateProduct(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const b = await readJson(ctx.request, 64 * 1024);
  const db = await getDb();
  const current = await db.maybeOne('select * from products where id = $1', [id]);
  if (!current) throw new HttpError(404, 'Product not found.');
  if (b.updatedAt && new Date(b.updatedAt).getTime() !== new Date(current.updated_at).getTime()) throw new HttpError(409, 'This item was changed somewhere else. Reload it to see the latest version.', { code: 'stale' });
  const status = ['draft', 'published', 'archived'].includes(b.status) ? b.status : current.status;
  const publishedNow = status === 'published' && current.status !== 'published';
  const v = {
    title: str(b.title, { name: 'Title', max: 160, required: true }),
    slug: await uniqueSlug(db, vSlug(b.slug || slugify(b.title)), id),
    summary: str(b.summary, { name: 'Short description', max: 400 }),
    description: str(b.description, { name: 'Description', max: 8000, trim: false }).trim(),
    category_id: b.categoryId ? vUuid(b.categoryId, 'Category') : null,
    tags: stringArray(b.tags, { name: 'Tags', maxItems: 20, maxLength: 40 }),
    tech_tags: stringArray(b.techTags, { name: 'Tech tags', maxItems: 20, maxLength: 40 }),
    version: str(b.version, { name: 'Version', max: 30 }),
    status, sellable: bool(b.sellable), is_free: bool(b.isFree),
    price_inr: money(b.priceInr, 'INR price'), price_usd: money(b.priceUsd, 'USD price'),
    sale_price_inr: money(b.salePriceInr, 'INR sale price'), sale_price_usd: money(b.salePriceUsd, 'USD sale price'),
    sale_starts_at: when(b.saleStartsAt, 'Sale start'), sale_ends_at: when(b.saleEndsAt, 'Sale end'),
    license_id: b.licenseId ? vUuid(b.licenseId, 'License') : null,
    demo_url: vUrl(b.demoUrl, { name: 'Demo link' }), preview_url: vUrl(b.previewUrl, { name: 'Preview link' }),
    max_downloads: int(b.maxDownloads ?? current.max_downloads, { name: 'Download limit', min: 1, max: 100 }),
    link_ttl_hours: int(b.linkTtlHours ?? current.link_ttl_hours, { name: 'Link lifetime', min: 1, max: 168 }),
    refund_after_download: bool(b.refundAfterDownload, current.refund_after_download)
  };
  // prices: a sale must be a real discount inside a real window, and anything charged must clear
  // Razorpay's minimum (₹1 / $1), so a published item can always be bought
  if (v.sale_starts_at && v.sale_ends_at && v.sale_ends_at <= v.sale_starts_at) throw new HttpError(400, 'The sale must end after it starts.');
  for (const [sale, full, cur] of [[v.sale_price_inr, v.price_inr, 'INR'], [v.sale_price_usd, v.price_usd, 'USD']]){
    if (sale === null) continue;
    if (sale < 100) throw new HttpError(400, `The ${cur} sale price must be at least ${cur === 'INR' ? '₹1' : '$1'}.`);
    if (full !== null && sale >= full) throw new HttpError(400, 'The sale price must be lower than the normal price.');
  }
  if (status === 'published' && v.sellable && !v.is_free){
    if (v.price_inr === null || v.price_usd === null) throw new HttpError(400, 'A published item for sale needs both an INR and a USD price (or mark it free).');
    if (v.price_inr < 100 || v.price_usd < 100) throw new HttpError(400, 'Prices must be at least ₹1 and $1 (the lowest amount cards can be charged), or mark it free.');
  }
  if (v.category_id){
    const cat = await db.maybeOne('select kind from categories where id = $1', [v.category_id]);
    if (!cat || cat.kind !== current.kind) throw new HttpError(400, 'Choose a category from the same section.');
  }
  if (status === 'published' && current.kind === 'artzz' && !(await db.maybeOne('select 1 from product_media where product_id = $1', [id]))) throw new HttpError(400, 'Add at least one image before publishing an Artzz item.');
  if (status === 'published' && v.sellable && !(await db.maybeOne('select 1 from product_files where product_id = $1 and is_current', [id]))) throw new HttpError(400, 'Upload the file buyers will download before publishing it for sale.');
  const cols = Object.keys(v);
  await guarded(() => db.query(`update products set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now(),
    published_at = case when $${cols.length + 2} = 'published' and published_at is null then now() else published_at end where id = $1`, [id, ...cols.map(c => v[c]), status]));
  if (publishedNow) await saveProductRevision(db, id, 'publish', ctx.admin?.email);
  await audit(ctx, 'product_saved', id, { status });
  return getProduct({ ...ctx, params: { id } });
}

async function productSnapshot(db, id){
  const p = await db.maybeOne('select * from products where id = $1', [id]);
  if (!p) throw new HttpError(404, 'Product not found.');
  const media = await db.query('select url, alt, width, height, sort from product_media where product_id = $1 order by sort, id', [id]);
  return { product: p, media };
}
async function saveProductRevision(db, id, action, actor){
  const snapshot = await productSnapshot(db, id);
  if (snapshot.product.status !== 'published') return;
  await db.query('insert into product_revisions (product_id, action, snapshot, actor) values ($1,$2,$3,$4)', [id, action, snapshot, actor || null]);
}
export async function productHistory(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const db = await getDb();
  if (!(await db.maybeOne('select 1 from products where id = $1', [id]))) throw new HttpError(404, 'Product not found.');
  const revisions = await db.query('select id, action, created_at, actor from product_revisions where product_id = $1 order by created_at desc, id desc limit 100', [id]);
  return json({ revisions });
}
export async function restoreProductRevision(ctx){
  const id = vUuid(ctx.params.id, 'Product'), revisionId = Number(ctx.params.revisionId);
  if (!Number.isSafeInteger(revisionId) || revisionId < 1) throw new HttpError(400, 'Choose a valid publish revision.');
  const db = await getDb();
  const row = await db.maybeOne('select snapshot from product_revisions where id = $1 and product_id = $2', [revisionId, id]);
  if (!row) throw new HttpError(404, 'Publish revision not found.');
  const { product, media } = row.snapshot;
  if (!product || product.id !== id || !Array.isArray(media)) throw new HttpError(400, 'This revision cannot be restored.');
  const current = await db.maybeOne('select * from products where id = $1', [id]);
  if (!current) throw new HttpError(404, 'Product not found.');
  if (product.kind !== current.kind) throw new HttpError(400, 'The product section cannot be changed by restoring a revision.');
  if (product.status === 'published' && current.kind === 'artzz' && media.length === 0) throw new HttpError(400, 'This revision has no image and cannot be published.');
  if (product.status === 'published' && product.sellable && !product.is_free &&
    (product.price_inr < 100 || product.price_usd < 100 || product.price_inr == null || product.price_usd == null)) throw new HttpError(400, 'This revision does not have valid prices.');
  if (product.status === 'published' && product.sellable && !(await db.maybeOne('select 1 from product_files where product_id = $1 and is_current', [id])))
    throw new HttpError(400, 'The current download file is missing, so this revision cannot be published.');
  const cols = ['title','slug','summary','description','category_id','tags','tech_tags','version','status','sellable','is_free','price_inr','price_usd','sale_price_inr','sale_price_usd','sale_starts_at','sale_ends_at','license_id','demo_url','preview_url','max_downloads','link_ttl_hours','refund_after_download','sort'];
  const args = [id, ...cols.map(k => product[k])];
  const assignments = cols.map((k, i) => `${k} = $${i + 2}`).join(', ');
  await guarded(async () => {
    await db.query(`update products set ${assignments}, updated_at = now(), published_at = case when $10 = 'published' then coalesce(published_at, now()) else published_at end where id = $1`, args);
    await db.query('delete from product_media where product_id = $1', [id]);
    for (const m of media) await db.query('insert into product_media (product_id,url,alt,width,height,sort) values ($1,$2,$3,$4,$5,$6)', [id,m.url,m.alt,m.width,m.height,m.sort]);
  });
  await saveProductRevision(db, id, 'restore', ctx.admin?.email);
  await audit(ctx, 'product_revision_restored', id, { revisionId });
  return getProduct({ ...ctx, params: { id } });
}

export async function duplicateProduct(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const db = await getDb();
  const p = await db.maybeOne('select * from products where id = $1', [id]);
  if (!p) throw new HttpError(404, 'Product not found.');
  const slug = await uniqueSlug(db, `${p.slug.slice(0, 50)}-copy`);
  const copy = { id: crypto.randomUUID() };
  await db.batch([
    [`insert into products (id, kind, slug, title, summary, description, category_id, tags, tech_tags, version, status, sellable, is_free, price_inr, price_usd,
      sale_price_inr, sale_price_usd, sale_starts_at, sale_ends_at, license_id, demo_url, preview_url, max_downloads, link_ttl_hours, refund_after_download, sort)
      select $3, kind, $2, title || ' (copy)', summary, description, category_id, tags, tech_tags, version, 'draft', sellable, is_free, price_inr, price_usd,
      sale_price_inr, sale_price_usd, sale_starts_at, sale_ends_at, license_id, demo_url, preview_url, max_downloads, link_ttl_hours, refund_after_download, sort from products where id = $1`, [id, slug, copy.id]],
    ['insert into product_media (product_id, url, alt, width, height, sort) select $2, url, alt, width, height, sort from product_media where product_id = $1', [id, copy.id]],
  ]);
  await audit(ctx, 'product_duplicated', copy.id, { from: id });
  return getProduct({ ...ctx, params: { id: copy.id } });
}

// A license can be deleted only while nothing depends on it: no product uses it and no order was
// sold under it (buyers keep the version they bought, so those texts must stay).
export async function deleteLicense(ctx){
  const id = vUuid(ctx.params.id, 'License');
  const db = await getDb();
  const l = await db.maybeOne('select key, name from licenses where id = $1', [id]);
  if (!l) throw new HttpError(404, 'License not found.');
  const used = await db.maybeOne('select (select count(*) from products where license_id = $1) as products, (select count(*) from order_items where license_key = $2) as orders', [id, l.key]);
  if (used.products) throw new HttpError(409, `“${l.name}” is used by ${used.products} product${used.products === 1 ? '' : 's'}. Choose another license for ${used.products === 1 ? 'it' : 'them'} first.`);
  if (used.orders) throw new HttpError(409, `“${l.name}” was sold with ${used.orders} order${used.orders === 1 ? '' : 's'}, so it has to stay (buyers keep the text they agreed to).`);
  await db.query('delete from licenses where id = $1', [id]);
  await audit(ctx, 'license_deleted', l.key);
  return listLicenses();
}

// Items that were ever sold are archived (orders keep pointing at them); others are deleted.
export async function deleteProduct(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const db = await getDb();
  const sold = await db.maybeOne('select 1 from order_items where product_id = $1', [id]);
  if (sold){ await db.query(`update products set status = 'archived', updated_at = now() where id = $1`, [id]); await audit(ctx, 'product_archived', id); return json({ ok: true, archived: true }); }
  const files = await db.query('select storage_path from product_files where product_id = $1', [id]);
  await db.query('delete from products where id = $1', [id]);
  if (files.length) await getStorage().remove('deliverables', files.map(f => f.storage_path)).catch(() => {});
  await audit(ctx, 'product_deleted', id);
  return json({ ok: true, archived: false });
}

// Restores an archived or deleted-by-mistake item (the portal's Undo for delete/archive).
export async function restoreProduct(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const db = await getDb();
  await db.query(`update products set status = 'draft', updated_at = now() where id = $1 and status = 'archived'`, [id]);
  return getProduct({ ...ctx, params: { id } });
}

export async function reorderProducts(ctx){
  const body = await readJson(ctx.request, 64 * 1024);
  if (!Array.isArray(body.ids) || body.ids.length > 1000) throw new HttpError(400, 'Send the new order as a list.');
  const ids = body.ids.map(i => vUuid(i, 'Product'));
  const db = await getDb();
  await db.batch(ids.map((id, i) => ['update products set sort = $2 where id = $1', [id, i]]));
  return json({ ok: true });
}

export async function addMedia(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const b = await readJson(ctx.request, 8 * 1024);
  const u = str(b.url, { max: 600, required: true });
  if (!isOwnMediaUrl(u)) throw new HttpError(400, 'Upload the image first.');
  const db = await getDb();
  const sort = (await db.one('select coalesce(max(sort), -1) + 1 as s from product_media where product_id = $1', [id])).s;
  await db.query('insert into product_media (product_id, url, alt, width, height, sort) values ($1,$2,$3,$4,$5,$6)',
    [id, u, str(b.alt, { max: 200 }), int(b.width, { min: 1, max: 20000, required: false }), int(b.height, { min: 1, max: 20000, required: false }), sort]);
  await db.query('update products set updated_at = now() where id = $1', [id]);
  return getProduct({ ...ctx, params: { id } });
}
export async function updateMedia(ctx){
  vUuid(ctx.params.id, 'Product');
  const b = await readJson(ctx.request, 16 * 1024);
  const db = await getDb();
  if (Array.isArray(b.order)){
    const ids = b.order.map(x => vUuid(x, 'Image'));
    await db.batch(ids.map((mid, i) => ['update product_media set sort = $3 where id = $1 and product_id = $2', [mid, ctx.params.id, i]]));
  }
  if (b.alt && typeof b.alt === 'object') for (const [mid, alt] of Object.entries(b.alt)) await db.query('update product_media set alt = $3 where id = $1 and product_id = $2', [vUuid(mid, 'Image'), ctx.params.id, str(alt, { max: 200 })]);
  await db.query('update products set updated_at = now() where id = $1', [ctx.params.id]);
  return getProduct(ctx);
}
export async function deleteMedia(ctx){
  const db = await getDb();
  await db.query('delete from product_media where id = $1 and product_id = $2', [ctx.params.mediaId, ctx.params.id]);
  await db.query('update products set updated_at = now() where id = $1', [ctx.params.id]);
  return getProduct(ctx);
}

export async function setFile(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const b = await readJson(ctx.request, 8 * 1024);
  const path = str(b.path, { max: 300, required: true });
  if (!/^files\/[A-Za-z0-9_-]{16}\/[A-Za-z0-9._-]{1,100}$/.test(path)) throw new HttpError(400, 'Upload the file first.');
  const filename = str(b.filename, { name: 'File name', max: 160, required: true }).replace(/["\\\r\n]/g, '');
  const bytes = int(b.bytes, { min: 1, max: MAX_FILE });
  const db = await getDb();
  // earlier versions stay in storage so links already sent keep working until they expire
  await db.batch([
    ['update product_files set is_current = 0 where product_id = $1 and is_current = 1', [id]],
    [`insert into product_files (product_id, storage_path, filename, bytes, sha256, license_version) values ($1,$2,$3,$4,$5,$6)`,
      [id, path, filename, bytes, str(b.sha256, { max: 64 }), int(b.licenseVersion, { min: 1, max: 1e6, required: false })]],
    ['update products set updated_at = now() where id = $1', [id]],
  ]);
  await audit(ctx, 'product_file_set', id, { filename, bytes });
  return getProduct({ ...ctx, params: { id } });
}

// A short-lived link so the portal can download the current deliverable (e.g. to repackage).
export async function fileLink(ctx){
  const db = await getDb();
  const f = await db.maybeOne('select storage_path, filename from product_files where product_id = $1 and is_current', [ctx.params.id]);
  if (!f) throw new HttpError(404, 'No file uploaded yet.');
  return json({ url: await getStorage().signedUrl('deliverables', f.storage_path, 120, f.filename) });
}

// ---- categories + licenses ----------------------------------------------------------------------
export async function listCategories(){
  const db = await getDb();
  const rows = await db.query(`select c.*, (select count(*) from products p where p.category_id = c.id) + (select count(*) from tips t where t.category_id = c.id) as used from categories c order by kind, sort, name`);
  return json({ categories: rows });
}
export async function saveCategory(ctx){
  const b = await readJson(ctx.request, 4096);
  const db = await getDb();
  const name = str(b.name, { name: 'Name', max: 60, required: true });
  const kind = ['artzz', 'artifacts', 'tips'].includes(b.kind) ? b.kind : null;
  if (!kind) throw new HttpError(400, 'Choose where the category is used.');
  const slug = slugify(b.slug || name);
  try {
    if (ctx.params.id) await db.query('update categories set name = $2, slug = $3, sort = coalesce($4, sort) where id = $1', [ctx.params.id, name, slug, b.sort ?? null]);
    else await db.query('insert into categories (kind, name, slug, sort) values ($1, $2, $3, (select coalesce(max(sort), -1) + 1 from categories where kind = $1))', [kind, name, slug]);
  } catch (err){ if (/unique|duplicate/i.test(err.message)) throw new HttpError(409, 'A category with that name already exists.'); throw err; }
  return listCategories();
}
export async function reorderCategories(ctx){
  const b = await readJson(ctx.request, 32 * 1024);
  if (!['artifacts','artzz','tips'].includes(b.kind) || !Array.isArray(b.ids) || b.ids.length > 500) throw new HttpError(400, 'Send a valid category order.');
  const ids = b.ids.map(id => vUuid(id, 'Category'));
  const db = await getDb();
  const existing = await db.query('select id from categories where kind = $1 order by sort, name', [b.kind]);
  if (existing.length !== ids.length || new Set(ids).size !== ids.length || existing.some(r => !ids.includes(r.id))) throw new HttpError(400, 'Refresh the categories and try again.');
  await db.batch(ids.map((id, i) => ['update categories set sort = $2 where id = $1 and kind = $3', [id, i, b.kind]]));
  return listCategories();
}
export async function deleteCategory(ctx){
  const db = await getDb();
  await db.query('delete from categories where id = $1', [ctx.params.id]);   // items fall back to "no category"
  return listCategories();
}
export async function listLicenses(){
  const db = await getDb();
  return json({ licenses: await db.query('select id, key, name, summary, body_md, version, updated_at from licenses order by key') });
}
export async function saveLicense(ctx){
  const b = await readJson(ctx.request, 64 * 1024);
  const db = await getDb();
  const name = str(b.name, { name: 'Name', max: 60, required: true }), summary = str(b.summary, { name: 'Summary', max: 300 }), body = str(b.body, { name: 'License text', max: 40000, trim: false });
  if (ctx.params.id){
    await db.query('update licenses set name = $2, summary = $3, body_md = $4, version = version + case when body_md is not $4 then 1 else 0 end, updated_at = now() where id = $1', [ctx.params.id, name, summary, body]);
  } else {
    const key = slugify(b.key || name);
    try { await db.query('insert into licenses (key, name, summary, body_md) values ($1, $2, $3, $4)', [key, name, summary, body]); }
    catch (err){ if (/unique|duplicate/i.test(err.message)) throw new HttpError(409, 'A license with that key already exists.'); throw err; }
  }
  await audit(ctx, 'license_saved', name);
  return listLicenses();
}

// ---- ratings (buyers rate from their download page; the owner can hide or delete any of them)
export async function productRatings(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const db = await getDb();
  const ratings = await db.query(`select r.id, r.rating, r.review, r.name, r.status, r.created_at, r.updated_at, o.public_id as order_ref
    from product_ratings r join orders o on o.id = r.order_id where r.product_id = $1 order by r.created_at desc limit 500`, [id]);
  const sum = await db.one(`select (select round(avg(rating), 2) from product_ratings where product_id = $1 and status = 'visible') as avg,
      (select count(*) from product_ratings where product_id = $1 and status = 'visible') as count,
      (select count(*) from order_items i join orders o on o.id = i.order_id where i.product_id = $1 and o.status in ('paid','delivered')) as downloads`, [id]);
  return json({ ratings, avg: sum.avg === null ? null : Number(sum.avg), count: Number(sum.count), downloads: Number(sum.downloads) });
}
export async function updateRating(ctx){
  const id = vUuid(ctx.params.id, 'Rating');
  const b = await readJson(ctx.request, 1024);
  if (!['visible', 'hidden'].includes(b.status)) throw new HttpError(400, 'Choose visible or hidden.');
  const db = await getDb();
  const r = await db.maybeOne('update product_ratings set status = $2, updated_at = now() where id = $1 returning product_id', [id, b.status]);
  if (!r) throw new HttpError(404, 'Rating not found.');
  await audit(ctx, b.status === 'hidden' ? 'rating_hidden' : 'rating_shown', id);
  return productRatings({ ...ctx, params: { id: r.product_id } });
}
export async function deleteRating(ctx){
  const id = vUuid(ctx.params.id, 'Rating');
  const db = await getDb();
  const r = await db.maybeOne('delete from product_ratings where id = $1 returning product_id', [id]);
  if (!r) throw new HttpError(404, 'Rating not found.');
  await audit(ctx, 'rating_deleted', id);
  return productRatings({ ...ctx, params: { id: r.product_id } });
}

// ---- sell a gallery image as a product, from the gallery itself ------------------------------------------------
// Creates an Artzz product from one image (its picture, title, description and tools), with the image as the file buyers
// download, and tags it so the gallery editor can find it again. Hiding it from the gallery is a separate switch there.
export async function sellImage(ctx){
  const slug = String(ctx.params.slug || '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(slug)) throw new HttpError(400, 'Unknown image.');
  const b = await readJson(ctx.request, 4096);
  const doc = await loadSiteDocument();
  const img = (doc.images || []).find(i => i.slug === slug);
  if (!img) throw new HttpError(404, 'That image is not in the gallery.');
  const db = await getDb();
  const tag = `from-gallery:${slug}`;
  const already = await db.maybeOne('select id from products where exists (select 1 from json_each(products.tags) where value = $1)', [tag]);
  if (already) throw new HttpError(409, 'This image is already in the store.', { code: 'exists', id: already.id });
  const priceInr = money(b.priceInr, 'Price in India'), priceUsd = money(b.priceUsd, 'Price elsewhere');
  // the picture buyers get: our own upload, or the full-size export that ships with the site
  const storage = getStorage();
  let bytes = null, ext = 'webp', contentType = 'image/webp';
  try {
    if (img.src){
      const prefix = storage.publicUrl('media', 'x').slice(0, -1);
      if (img.src.startsWith(prefix)){ bytes = await storage.get('media', img.src.slice(prefix.length)); ext = (/\.([a-z0-9]+)$/i.exec(img.src) || [])[1] || 'webp'; }
    } else {
      const w = img.full ? 'full' : Math.max(...(img.widths || [1600]));
      const origin = (env('PUBLIC_SITE_URL') || new URL(ctx.request.url).origin).replace(/\/+$/, '');
      const r = await fetch(`${origin}/images/${slug}-${w}.webp`);
      if (r.ok) bytes = new Uint8Array(await r.arrayBuffer());
    }
  } catch { bytes = null; }
  if (bytes) contentType = ext === 'png' ? 'image/png' : /^jpe?g$/i.test(ext) ? 'image/jpeg' : ext === 'avif' ? 'image/avif' : 'image/webp';
  const lic = (await db.maybeOne(`select id from licenses where key = 'personal'`)) || (await db.maybeOne('select id from licenses order by key limit 1'));
  const canPublish = b.publish === true && !!bytes && priceInr !== null && priceUsd !== null && !!lic;
  const sort = (await db.one(`select coalesce(min(sort), 0) - 1 as s from products where kind = 'artzz'`)).s;
  const mediaUrl = img.src || `/images/${slug}-${(img.widths || []).includes(1600) ? 1600 : Math.max(...(img.widths || [1080]))}.webp`;
  const row = await db.one(`insert into products (kind, slug, title, summary, description, tags, tech_tags, status, sellable, is_free, price_inr, price_usd, license_id, max_downloads, link_ttl_hours, sort, published_at)
    values ('artzz', $1, $2, '', $3, $4, $5, $6, 1, 0, $7, $8, $9, 5, 72, $10, ${canPublish ? "strftime('%Y-%m-%dT%H:%M:%fZ','now')" : 'null'}) returning id`,
    [await uniqueSlug(db, slugify(slug)), img.title, (img.description || '').slice(0, 8000), [tag], (img.technologies || []).slice(0, 20), canPublish ? 'published' : 'draft', priceInr, priceUsd, lic ? lic.id : null, sort]);
  await db.query('insert into product_media (product_id, url, alt, width, height, sort) values ($1,$2,$3,$4,$5,0)', [row.id, mediaUrl, img.title.slice(0, 200), img.width || null, img.height || null]);
  if (bytes){
    const name = `${slugify(img.title)}.${ext}`, path = `files/${randomToken(12)}/${name}`;
    await storage.put('deliverables', path, bytes, contentType);
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    await db.query('insert into product_files (product_id, storage_path, filename, bytes, sha256, is_current) values ($1,$2,$3,$4,$5,1)', [row.id, path, name, bytes.byteLength ?? bytes.length, sha]);
  }
  await audit(ctx, 'product_from_gallery', row.id, { slug });
  return getProduct({ ...ctx, params: { id: row.id } });
}

// ---- the email a buyer gets after paying: an extra message, a subject and attachments, per product -------------
const FILE_PATH = /^files\/[A-Za-z0-9_-]{16}\/[A-Za-z0-9._-]{1,100}$/;
export const DELIVERY_LIMITS = { attachments: 5, each: 10 * MB, total: 15 * MB };
async function readDelivery(){ const { value, revision } = await getSettingWithRevision('deliveryEmails'); return { map: value && typeof value === 'object' ? value : {}, revision }; }
export async function getDelivery(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const { map } = await readDelivery(); const cfg = map[id] || {};
  return json({ subject: cfg.subject || '', note: cfg.note || '', attachments: Array.isArray(cfg.attachments) ? cfg.attachments : [], defaultSubject: DEFAULT_TEMPLATES.order_delivery.subject, limits: DELIVERY_LIMITS });
}
export async function saveDelivery(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const b = await readJson(ctx.request, 16 * 1024);
  const db = await getDb();
  if (!(await db.maybeOne('select 1 from products where id = $1', [id]))) throw new HttpError(404, 'Product not found.');
  const raw = Array.isArray(b.attachments) ? b.attachments : [];
  if (raw.length > DELIVERY_LIMITS.attachments) throw new HttpError(400, `Attach up to ${DELIVERY_LIMITS.attachments} files.`);
  let total = 0; const attachments = [];
  for (const a of raw){
    if (!a || typeof a !== 'object' || !FILE_PATH.test(String(a.path || ''))) throw new HttpError(400, 'Upload each attachment first.');
    const bytes = int(a.bytes, { name: 'File size', min: 1, max: DELIVERY_LIMITS.each });
    total += bytes;
    attachments.push({ name: str(a.name, { name: 'File name', max: 100, required: true }).replace(/[^A-Za-z0-9._ -]+/g, '-'), path: a.path, bytes });
  }
  if (total > DELIVERY_LIMITS.total) throw new HttpError(400, `The attachments are over ${Math.round(DELIVERY_LIMITS.total / MB)} MB together. Email providers refuse larger messages; put big files in the download itself.`);
  const cfg = { subject: str(b.subject, { name: 'Subject', max: 200 }), note: str(b.note, { name: 'Message', max: 1500, trim: false }).trim(), attachments };
  const { map, revision } = await readDelivery();
  const next = { ...map };
  if (!cfg.subject && !cfg.note && !attachments.length) delete next[id]; else next[id] = cfg;
  const rev = await setSetting('deliveryEmails', next, revision || 0);
  if (rev === null) throw new HttpError(409, 'These settings were changed in another window. Reload and try again.', { code: 'stale' });
  await audit(ctx, 'delivery_email_saved', id, { attachments: attachments.length });
  return json({ ok: true, ...cfg });
}
// Sends the purchase email for this product to the signed-in person, with sample order details, so the wording can be checked.
export async function testDelivery(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const db = await getDb();
  const p = await db.maybeOne('select p.title, p.summary, p.version, p.max_downloads, p.link_ttl_hours, l.name as license_name from products p left join licenses l on l.id = p.license_id where p.id = $1', [id]);
  if (!p) throw new HttpError(404, 'Product not found.');
  const { deliveryExtras } = await import('../store/delivery.js');
  const extra = await deliveryExtras(id);
  const site = (env('PUBLIC_SITE_URL') || new URL(ctx.request.url).origin).replace(/\/+$/, '');
  const res = await sendEmail({ to: ctx.admin.email, template: 'order_delivery', subjectOverride: extra.subject ? `[Test] ${extra.subject}` : `[Test] ${DEFAULT_TEMPLATES.order_delivery.subject}`,
    vars: { order_id: 'KA-TEST0000', product_title: p.title, product_summary: p.summary, product_version: p.version, download_url: `${site}/api/download/this-is-a-test-link`,
      expires: new Date(Date.now() + p.link_ttl_hours * 3600e3).toDateString(), max_downloads: p.max_downloads, license_name: p.license_name || 'Personal',
      license_text: 'The key points of the license appear here, as written for this product.', extra_note: extra.note },
    attachments: extra.files });
  if (!res.ok) throw new HttpError(502, 'The test email could not be sent. Check Settings > System status (email).');
  return json({ ok: true, to: ctx.admin.email, attached: extra.files.length });
}

export function registerCatalog(route){
  const a = { access: 'admin' };
  route('GET', '/api/admin/products/:id/ratings', productRatings, a);
  route('PATCH', '/api/admin/ratings/:id', updateRating, a);
  route('DELETE', '/api/admin/ratings/:id', deleteRating, a);
  route('POST', '/api/admin/uploads', signUpload, a);
  route('GET', '/api/admin/products', listProducts, a);
  route('POST', '/api/admin/products', createProduct, a);
  route('POST', '/api/admin/products/reorder', reorderProducts, a);
  route('GET', '/api/admin/products/:id', getProduct, a);
  route('PUT', '/api/admin/products/:id', updateProduct, a);
  route('GET', '/api/admin/products/:id/history', productHistory, a);
  route('POST', '/api/admin/products/:id/history/:revisionId/restore', restoreProductRevision, a);
  route('DELETE', '/api/admin/products/:id', deleteProduct, a);
  route('POST', '/api/admin/products/:id/duplicate', duplicateProduct, a);
  route('POST', '/api/admin/products/:id/restore', restoreProduct, a);
  route('POST', '/api/admin/products/:id/media', addMedia, a);
  route('PATCH', '/api/admin/products/:id/media', updateMedia, a);
  route('DELETE', '/api/admin/products/:id/media/:mediaId', deleteMedia, a);
  route('PUT', '/api/admin/products/:id/file', setFile, a);
  route('GET', '/api/admin/products/:id/delivery', getDelivery, a);
  route('PUT', '/api/admin/products/:id/delivery', saveDelivery, a);
  route('POST', '/api/admin/products/:id/delivery/test', testDelivery, a);
  route('POST', '/api/admin/gallery/:slug/sell', sellImage, a);
  route('GET', '/api/admin/products/:id/file', fileLink, a);
  route('GET', '/api/admin/categories', listCategories, a);
  route('POST', '/api/admin/categories/reorder', reorderCategories, a);
  route('POST', '/api/admin/categories', saveCategory, a);
  route('PUT', '/api/admin/categories/:id', saveCategory, a);
  route('DELETE', '/api/admin/categories/:id', deleteCategory, a);
  route('GET', '/api/admin/licenses', listLicenses, a);
  route('POST', '/api/admin/licenses', saveLicense, a);
  route('PUT', '/api/admin/licenses/:id', saveLicense, a);
  route('DELETE', '/api/admin/licenses/:id', deleteLicense, a);
}
