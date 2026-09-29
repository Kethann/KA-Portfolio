// What the assistant knows: the owner's own sources (text / FAQ / documents, split into chunks and
// searched with Postgres full-text search) plus live site data (published products with prices,
// tips, portfolio titles, legal pages). Only published/public information is ever included.
import { getDb } from '../core/db.js';
import { getSetting } from '../core/settings.js';
import { formatMoney, priceFor } from '../store/pricing.js';
import { readFileSync } from 'node:fs';
// new URL(..., import.meta.url) lets Vercel's file tracer see and bundle the JSON (createRequire it can't).
const legacy = JSON.parse(readFileSync(new URL('../knowledge.json', import.meta.url), 'utf8'));

const CHUNK = 900;
export function chunk(text){
  const paras = String(text || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const out = []; let cur = '';
  for (const p of paras){
    if (p.length > CHUNK){ if (cur){ out.push(cur); cur = ''; } for (let i = 0; i < p.length; i += CHUNK) out.push(p.slice(i, i + CHUNK)); continue; }
    if ((cur + '\n\n' + p).length > CHUNK){ out.push(cur); cur = p; } else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur) out.push(cur);
  return out;
}
export async function reindex(db, sourceId, body){
  await db.query('delete from kb_chunks where source_id = $1', [sourceId]);
  const parts = chunk(body);
  for (const [i, c] of parts.entries()) await db.query('insert into kb_chunks (source_id, ord, content) values ($1, $2, $3)', [sourceId, i, c]);
  return parts.length;
}

// First run: turn the real (non-placeholder) facts from the old knowledge.json into a source.
export async function seedIfEmpty(){
  const db = await getDb();
  if ((await db.one('select count(*)::int as n from kb_sources')).n > 0) return;
  const real = (v) => typeof v === 'string' && v.trim() && !/PLACEHOLDER/i.test(v);
  const lines = [];
  if (real(legacy.bio)) lines.push(legacy.bio);
  if (real(legacy.process)) lines.push(`How I work: ${legacy.process}`);
  if (real(legacy.availability)) lines.push(`Availability: ${legacy.availability}`);
  if (real(legacy.pricing_note)) lines.push(`Pricing for custom work: ${legacy.pricing_note}`);
  const socials = Object.entries(legacy.contact?.socials || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
  if (socials) lines.push(`Find my work on ${socials}.`);
  lines.push('For commissions or questions, visitors can use the Contact page on this site.');
  const body = lines.join('\n\n');
  const src = await db.one(`insert into kb_sources (kind, title, body) values ('text', 'About me', $1) returning id`, [body]);
  await reindex(db, src.id, body);
}

const esc = (s) => String(s || '').replace(/<\/?(knowledge|source|order|note|rules)[^>]*>/gi, '');   // content can't close our data tags

export async function retrieve(question, { includeProducts = true } = {}){
  const db = await getDb();
  const q = String(question || '').slice(0, 500);
  let hits = [];
  if (q.trim()){
    hits = await db.query(`select c.content, s.title, ts_rank(c.search, query) as rank
      from kb_chunks c join kb_sources s on s.id = c.source_id, websearch_to_tsquery('simple', $1) query
      where s.enabled and c.search @@ query order by rank desc limit 6`, [q]).catch(() => []);
    if (!hits.length){
      // fall back to OR-matching of the longer words (websearch_to_tsquery is AND-based)
      const words = [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || [])].slice(0, 8);
      if (words.length) hits = await db.query(`select c.content, s.title, ts_rank(c.search, to_tsquery('simple', $1)) as rank
        from kb_chunks c join kb_sources s on s.id = c.source_id where s.enabled and c.search @@ to_tsquery('simple', $1) order by rank desc limit 6`, [words.join(' | ')]).catch(() => []);
    }
  }
  // always include the start of general "text" sources (the about-me basics)
  const basics = await db.query(`select c.content, s.title from kb_chunks c join kb_sources s on s.id = c.source_id where s.enabled and s.kind = 'text' and c.ord = 0 order by s.created_at limit 3`);
  const seen = new Set(), chunks = [];
  for (const h of [...hits, ...basics]){ const k = h.title + '|' + h.content.slice(0, 60); if (!seen.has(k)){ seen.add(k); chunks.push(h); } }

  const site = await getSetting('site');
  const tips = await db.query(`select title, slug, excerpt from tips where status = 'published' order by published_at desc limit 15`);
  const legal = await db.query(`select slug, title from legal_pages where published`);
  let products = [];
  if (includeProducts){
    const rows = await db.query(`select p.*, l.name as license_name, l.summary as license_summary from products p left join licenses l on l.id = p.license_id
      where p.status = 'published' order by p.kind, p.sort limit 40`);
    products = rows.map(p => {
      const price = (cur) => { const pr = priceFor(p, cur); return pr.free ? 'free' : pr.available ? `${formatMoney(pr.amount, cur)}${pr.onSale ? ` (sale, normally ${formatMoney(pr.compareAt, cur)})` : ''}` : null; };
      const inr = price('INR'), usd = price('USD');
      return `- ${p.title} [${p.kind === 'artzz' ? 'Artzz gallery' : 'Artifacts download'}] ${p.sellable ? `price: ${inr || 'n/a'} in India, ${usd || 'n/a'} elsewhere` : 'view only, not for sale'}${p.license_name ? `; license: ${p.license_name}${p.license_summary ? ` (${p.license_summary})` : ''}` : ''}; link: /?product=${p.slug}${p.summary ? `; about: ${p.summary.slice(0, 200)}` : ''}`;
    });
  }
  const context = [
    `<source title="Site">Name: ${esc(site?.details?.creatorName || 'Kethan Artzz')}. Tagline: ${esc(site?.details?.tagline || '')}. Portfolio folders: ${esc((site?.folders || []).join(', '))}. Portfolio pieces: ${esc((site?.images || []).slice(0, 40).map(i => i.title).join('; '))}.</source>`,
    ...chunks.map(c => `<source title="${esc(c.title).replace(/"/g, '')}">${esc(c.content)}</source>`),
    products.length ? `<source title="Store (live prices; the checkout is the final word)">\n${esc(products.join('\n'))}\n</source>` : '',
    tips.length ? `<source title="Tips articles">${esc(tips.map(t => `${t.title} (/?tip=${t.slug})`).join('; '))}</source>` : '',
    legal.length ? `<source title="Policies">${esc(legal.map(l => `${l.title}: /legal/${l.slug}`).join('; '))}</source>` : ''
  ].filter(Boolean).join('\n').slice(0, 14000);
  return { context, sources: [...new Set(['Site', ...chunks.map(c => c.title), ...(products.length ? ['Store'] : []), ...(tips.length ? ['Tips'] : [])])] };
}
