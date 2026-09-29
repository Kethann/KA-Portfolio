// Portal: products (Artzz / Artifacts), categories, media, deliverable files, licenses.
import { json, readJson, HttpError } from '../core/http.js';
import { getDb } from '../core/db.js';
import { getStorage } from '../core/storage.js';
import { randomToken } from '../core/crypto.js';
import { str, int, bool, url as vUrl, stringArray, slug as vSlug, uuid as vUuid } from '../core/validate.js';
import { productDto } from '../handlers/store-public.js';
import { audit } from './auth.js';

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };
const FONT_TYPES = { 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf' };
const MB = 1024 * 1024;

export function slugify(s){ return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item'; }

// Friendly messages for database rules the portal can hit.
export function mapDbError(err){
  const m = String(err && err.message || '');
  if (/priced_when_selling/.test(m)) return new HttpError(400, 'A published item for sale needs both an INR and a USD price (or mark it free).');
  if (/sale_below_price/.test(m)) return new HttpError(400, 'The sale price must be lower than the normal price.');
  if (/sale_window|coupon_window/.test(m)) return new HttpError(400, 'The end date must be after the start date.');
  if (/duplicate key.*slug|products_slug_key|tips_slug_key/.test(m)) return new HttpError(409, 'That web address (slug) is already used by another item.');
  if (/coupons_code/.test(m)) return new HttpError(409, 'That code already exists.');
  if (/coupon_value/.test(m)) return new HttpError(400, 'Set a percentage, or a fixed amount for at least one currency.');
  if (/coupon_currencies/.test(m)) return new HttpError(400, 'Choose at least one currency.');
  return null;
}
async function guarded(fn){
  try { return await fn(); } catch (err){ throw mapDbError(err) || err; }
}

// ---- uploads (signed, direct to storage) --------------------------------------------------------
export async function signUpload(ctx){
  const body = await readJson(ctx.request, 4096);
  const kind = body.kind;
  const type = str(body.contentType, { max: 100 }).toLowerCase();
  const bytes = int(body.bytes, { name: 'File size', min: 1, max: 50 * MB });
  const name = str(body.filename, { name: 'File name', max: 160, required: true }).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+/, '').slice(-100) || 'file';
  let bucket, path;
  if (kind === 'image'){
    if (!IMAGE_TYPES[type]) throw new HttpError(400, 'Upload a PNG, JPG, WebP, AVIF or GIF image.');
    if (bytes > 10 * MB) throw new HttpError(400, 'Images can be up to 10 MB.');
    bucket = 'media'; path = `images/${randomToken(9)}.${IMAGE_TYPES[type]}`;
  } else if (kind === 'font'){
    if (!FONT_TYPES[type]) throw new HttpError(400, 'Upload a WOFF2, WOFF, TTF or OTF font.');
    if (bytes > 6 * MB) throw new HttpError(400, 'Fonts can be up to 6 MB.');
    bucket = 'media'; path = `fonts/${randomToken(9)}.${FONT_TYPES[type]}`;
  } else if (kind === 'deliverable'){
    bucket = 'deliverables'; path = `files/${randomToken(12)}/${name}`;
  } else throw new HttpError(400, 'Unknown upload type.');
  const storage = getStorage();
  const up = await storage.signedUploadUrl(bucket, path);
  return json({ bucket, path, uploadUrl: up.url, method: up.method, contentType: type, publicUrl: bucket === 'media' ? storage.publicUrl(bucket, path) : null });
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
  coalesce((select json_agg(json_build_object('id', m.id, 'url', m.url, 'alt', m.alt, 'width', m.width, 'height', m.height) order by m.sort, m.id) from product_media m where m.product_id = p.id), '[]'::json) as media,
  (select json_build_object('id', f.id, 'filename', f.filename, 'bytes', f.bytes, 'licenseVersion', f.license_version, 'createdAt', f.created_at) from product_files f where f.product_id = p.id and f.is_current) as file,
  (select count(*)::int from order_items i join orders o on o.id = i.order_id where i.product_id = p.id and o.status in ('paid','delivered')) as sales
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
  const rows = await db.query(`${LIST_SELECT} where ($1::text is null or p.kind = $1) and p.status <> 'archived' order by p.kind, p.sort, p.created_at desc`, [kind || null]);
  return json({ products: rows.map(adminDto) });
}

export async function getProduct(ctx){
  const db = await getDb();
  const row = await db.maybeOne(`${LIST_SELECT} where p.id::text = $1`, [ctx.params.id]);
  if (!row) throw new HttpError(404, 'Product not found.');
  return json({ product: adminDto(row) });
}

async function uniqueSlug(db, base, exceptId = null){
  let s = base, i = 2;
  while (await db.maybeOne('select 1 from products where slug = $1 and ($2::uuid is null or id <> $2)', [s, exceptId])) s = `${base.slice(0, 54)}-${i++}`;
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
  if (v.category_id){
    const cat = await db.maybeOne('select kind from categories where id = $1', [v.category_id]);
    if (!cat || cat.kind !== current.kind) throw new HttpError(400, 'Choose a category from the same section.');
  }
  if (status === 'published' && current.kind === 'artzz' && !(await db.maybeOne('select 1 from product_media where product_id = $1', [id]))) throw new HttpError(400, 'Add at least one image before publishing an Artzz item.');
  if (status === 'published' && v.sellable && !(await db.maybeOne('select 1 from product_files where product_id = $1 and is_current', [id]))) throw new HttpError(400, 'Upload the file buyers will download before publishing it for sale.');
  const cols = Object.keys(v);
  await guarded(() => db.query(`update products set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now(),
    published_at = case when $${cols.length + 2} = 'published' and published_at is null then now() else published_at end where id = $1`, [id, ...cols.map(c => v[c]), status]));
  await audit(ctx, 'product_saved', id, { status });
  return getProduct({ ...ctx, params: { id } });
}

export async function duplicateProduct(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const db = await getDb();
  const p = await db.maybeOne('select * from products where id = $1', [id]);
  if (!p) throw new HttpError(404, 'Product not found.');
  const slug = await uniqueSlug(db, `${p.slug.slice(0, 50)}-copy`);
  const copy = await db.tx(async (tx) => {
    const row = await tx.one(`insert into products (kind, slug, title, summary, description, category_id, tags, tech_tags, version, status, sellable, is_free, price_inr, price_usd,
      sale_price_inr, sale_price_usd, sale_starts_at, sale_ends_at, license_id, demo_url, preview_url, max_downloads, link_ttl_hours, refund_after_download, sort)
      select kind, $2, title || ' (copy)', summary, description, category_id, tags, tech_tags, version, 'draft', sellable, is_free, price_inr, price_usd,
      sale_price_inr, sale_price_usd, sale_starts_at, sale_ends_at, license_id, demo_url, preview_url, max_downloads, link_ttl_hours, refund_after_download, sort from products where id = $1 returning id`, [id, slug]);
    await tx.query('insert into product_media (product_id, url, alt, width, height, sort) select $2, url, alt, width, height, sort from product_media where product_id = $1', [id, row.id]);
    return row;
  });
  await audit(ctx, 'product_duplicated', copy.id, { from: id });
  return getProduct({ ...ctx, params: { id: copy.id } });
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
  await db.tx(async (tx) => { for (const [i, id] of ids.entries()) await tx.query('update products set sort = $2 where id = $1', [id, i]); });
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
    await db.tx(async (tx) => { for (const [i, mid] of ids.entries()) await tx.query('update product_media set sort = $3 where id = $1 and product_id = $2', [mid, ctx.params.id, i]); });
  }
  if (b.alt && typeof b.alt === 'object') for (const [mid, alt] of Object.entries(b.alt)) await db.query('update product_media set alt = $3 where id = $1 and product_id = $2', [vUuid(mid, 'Image'), ctx.params.id, str(alt, { max: 200 })]);
  await db.query('update products set updated_at = now() where id::text = $1', [ctx.params.id]);
  return getProduct(ctx);
}
export async function deleteMedia(ctx){
  const db = await getDb();
  await db.query('delete from product_media where id::text = $1 and product_id::text = $2', [ctx.params.mediaId, ctx.params.id]);
  await db.query('update products set updated_at = now() where id::text = $1', [ctx.params.id]);
  return getProduct(ctx);
}

export async function setFile(ctx){
  const id = vUuid(ctx.params.id, 'Product');
  const b = await readJson(ctx.request, 8 * 1024);
  const path = str(b.path, { max: 300, required: true });
  if (!/^files\/[A-Za-z0-9_-]{16}\/[A-Za-z0-9._-]{1,100}$/.test(path)) throw new HttpError(400, 'Upload the file first.');
  const filename = str(b.filename, { name: 'File name', max: 160, required: true }).replace(/["\\\r\n]/g, '');
  const bytes = int(b.bytes, { min: 1, max: 50 * MB });
  const db = await getDb();
  const old = await db.tx(async (tx) => {
    const prev = await tx.query('update product_files set is_current = false where product_id = $1 and is_current returning storage_path', [id]);
    await tx.query(`insert into product_files (product_id, storage_path, filename, bytes, sha256, license_version) values ($1,$2,$3,$4,$5,$6)`,
      [id, path, filename, bytes, str(b.sha256, { max: 64 }), int(b.licenseVersion, { min: 1, max: 1e6, required: false })]);
    await tx.query('update products set updated_at = now() where id = $1', [id]);
    return prev;
  });
  void old;   // earlier versions stay in storage so links already sent keep working until they expire
  await audit(ctx, 'product_file_set', id, { filename, bytes });
  return getProduct({ ...ctx, params: { id } });
}

// A short-lived link so the portal can download the current deliverable (e.g. to repackage).
export async function fileLink(ctx){
  const db = await getDb();
  const f = await db.maybeOne('select storage_path, filename from product_files where product_id::text = $1 and is_current', [ctx.params.id]);
  if (!f) throw new HttpError(404, 'No file uploaded yet.');
  return json({ url: await getStorage().signedUrl('deliverables', f.storage_path, 120, f.filename) });
}

// ---- categories + licenses ----------------------------------------------------------------------
export async function listCategories(){
  const db = await getDb();
  const rows = await db.query(`select c.*, (select count(*)::int from products p where p.category_id = c.id) + (select count(*)::int from tips t where t.category_id = c.id) as used from categories c order by kind, sort, name`);
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
    if (ctx.params.id) await db.query('update categories set name = $2, slug = $3, sort = coalesce($4, sort) where id::text = $1', [ctx.params.id, name, slug, b.sort ?? null]);
    else await db.query('insert into categories (kind, name, slug, sort) values ($1, $2, $3, (select coalesce(max(sort), -1) + 1 from categories where kind = $1))', [kind, name, slug]);
  } catch (err){ if (/unique|duplicate/i.test(err.message)) throw new HttpError(409, 'A category with that name already exists.'); throw err; }
  return listCategories();
}
export async function deleteCategory(ctx){
  const db = await getDb();
  await db.query('delete from categories where id::text = $1', [ctx.params.id]);   // items fall back to "no category"
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
    await db.query('update licenses set name = $2, summary = $3, body_md = $4, version = version + case when body_md is distinct from $4 then 1 else 0 end, updated_at = now() where id::text = $1', [ctx.params.id, name, summary, body]);
  } else {
    const key = slugify(b.key || name);
    try { await db.query('insert into licenses (key, name, summary, body_md) values ($1, $2, $3, $4)', [key, name, summary, body]); }
    catch (err){ if (/unique|duplicate/i.test(err.message)) throw new HttpError(409, 'A license with that key already exists.'); throw err; }
  }
  await audit(ctx, 'license_saved', name);
  return listLicenses();
}

export function registerCatalog(route){
  const a = { access: 'admin' };
  route('POST', '/api/admin/uploads', signUpload, a);
  route('GET', '/api/admin/products', listProducts, a);
  route('POST', '/api/admin/products', createProduct, a);
  route('POST', '/api/admin/products/reorder', reorderProducts, a);
  route('GET', '/api/admin/products/:id', getProduct, a);
  route('PUT', '/api/admin/products/:id', updateProduct, a);
  route('DELETE', '/api/admin/products/:id', deleteProduct, a);
  route('POST', '/api/admin/products/:id/duplicate', duplicateProduct, a);
  route('POST', '/api/admin/products/:id/restore', restoreProduct, a);
  route('POST', '/api/admin/products/:id/media', addMedia, a);
  route('PATCH', '/api/admin/products/:id/media', updateMedia, a);
  route('DELETE', '/api/admin/products/:id/media/:mediaId', deleteMedia, a);
  route('PUT', '/api/admin/products/:id/file', setFile, a);
  route('GET', '/api/admin/products/:id/file', fileLink, a);
  route('GET', '/api/admin/categories', listCategories, a);
  route('POST', '/api/admin/categories', saveCategory, a);
  route('PUT', '/api/admin/categories/:id', saveCategory, a);
  route('DELETE', '/api/admin/categories/:id', deleteCategory, a);
  route('GET', '/api/admin/licenses', listLicenses, a);
  route('POST', '/api/admin/licenses', saveLicense, a);
  route('PUT', '/api/admin/licenses/:id', saveLicense, a);
}
