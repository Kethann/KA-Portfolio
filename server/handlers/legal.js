// Public legal pages: /legal (index) and /legal/terms|privacy|refunds|delivery. Server-rendered
// HTML (they're linked from checkout, receipts and the footer, and must load without the site's
// JavaScript). Only published text is ever shown; an unpublished page says it's being updated.
import { getDb } from '../core/db.js';
import { renderMarkdown } from '../core/markdown.js';
import { LEGAL_TITLES } from '../content/legal-drafts.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(title, bodyHtml, status = 200){
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · Kethan Artzz</title><meta name="theme-color" content="#0f0e0e"><link rel="icon" href="/favicon.ico">
<style>
:root{color-scheme:dark;--ink:#efece8;--dim:rgba(239,236,232,.66);--accent:#ff9438;--line:rgba(255,255,255,.1)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:#0f0e0e radial-gradient(ellipse at 20% -10%,#2a1712 0,transparent 60%);color:var(--ink);font:16px/1.7 Manrope,system-ui,-apple-system,"Segoe UI",sans-serif;min-height:100vh}
main{max-width:760px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) max(20px,env(safe-area-inset-right)) 64px max(20px,env(safe-area-inset-left))}
a{color:var(--accent)}a:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
.back{display:inline-flex;gap:6px;align-items:center;text-decoration:none;color:var(--dim);font-size:14px;margin-bottom:28px}.back:hover{color:var(--ink)}
h1{font-size:clamp(28px,5vw,40px);line-height:1.15;letter-spacing:-.02em;margin:0 0 22px}
h2,h3{font-size:20px;margin:34px 0 8px}p,li{color:var(--dim)}strong{color:var(--ink)}
ul{padding-left:1.2em}li{margin:4px 0}
nav.pages{display:flex;flex-wrap:wrap;gap:8px;margin-top:44px;padding-top:20px;border-top:1px solid var(--line)}
nav.pages a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;color:var(--dim);font-size:14px}
nav.pages a[aria-current]{color:var(--ink);border-color:var(--accent)}
.note{padding:16px 18px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.03)}
</style></head>
<body><main><a class="back" href="/">&larr; Back to the site</a>${bodyHtml}</main></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300', 'X-Content-Type-Options': 'nosniff' } });
}
const nav = (current) => `<nav class="pages" aria-label="Legal pages">${Object.entries(LEGAL_TITLES).map(([slug, t]) =>
  `<a href="/legal/${slug}"${slug === current ? ' aria-current="page"' : ''}>${esc(t)}</a>`).join('')}</nav>`;

async function legalIndex(){
  return page('Legal', `<h1>Legal</h1><p>The rules for buying and downloading from this site, and how your data is handled.</p>${nav('')}`);
}
async function legalPage(ctx){
  const slug = ctx.params.slug;
  if (!LEGAL_TITLES[slug]) return page('Not found', `<h1>Page not found</h1><p>There's no legal page at this address.</p>${nav('')}`, 404);
  const db = await getDb();
  const row = await db.maybeOne('select title, body_md, published, updated_at from legal_pages where slug = $1 and published', [slug]);
  if (!row || !row.body_md.trim()) return page(LEGAL_TITLES[slug], `<h1>${esc(LEGAL_TITLES[slug])}</h1><p class="note">This page is being updated. If you have a question in the meantime, please use the <a href="/?page=contact">Contact page</a>.</p>${nav(slug)}`);
  return page(row.title, `<h1>${esc(row.title)}</h1>${renderMarkdown(row.body_md)}${nav(slug)}`);
}

export function registerLegal(route){
  route('GET', '/legal', legalIndex);
  route('GET', '/legal/:slug', legalPage);
}
