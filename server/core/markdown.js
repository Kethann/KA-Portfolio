// Safe Markdown subset -> HTML for tips, licenses and legal pages. Safety by construction: the
// source is HTML-escaped FIRST, then only these patterns are turned into tags:
//   # ## ### headings, paragraphs, - / 1. lists, > quotes, ``` code blocks, ---,
//   **bold**, *italic*, `code`, [text](url), ![alt](url)
// Links/images accept https://, http:// and site-relative /paths only (no javascript:, data:).
// Raw HTML in the source is shown as text, never rendered.

function esc(s){ return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function safeUrl(escapedUrl){
  // escapedUrl is already HTML-escaped; decode only &amp; for the check
  const raw = escapedUrl.replace(/&amp;/g, '&');
  if (raw.includes('\\')) return null;          // browsers read "/\evil.com" as "//evil.com"
  if (/^https?:\/\//i.test(raw) || /^\/(?!\/)/.test(raw)) return escapedUrl;
  return null;
}

function inline(escaped){
  const codes = [];
  let s = escaped.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const u = safeUrl(url);
    return u ? `<img src="${u}" alt="${alt}" loading="lazy" decoding="async">` : m;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = safeUrl(url);
    if (!u) return label;
    const external = /^https?:/i.test(u);
    return `<a href="${u}"${external ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

export function renderMarkdown(source){
  const lines = esc(String(source || '').replace(/\r\n?/g, '\n')).split('\n');
  const out = [];
  let para = [], list = null, quote = [], code = null;
  const flushPara = () => { if (para.length){ out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
  const flushList = () => { if (list){ out.push(`<${list.type}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.type}>`); list = null; } };
  const flushQuote = () => { if (quote.length){ out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`); quote = []; } };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };
  for (const line of lines){
    if (code !== null){
      if (/^```/.test(line)){ out.push(`<pre><code>${code.join('\n')}</code></pre>`); code = null; } else code.push(line);
      continue;
    }
    if (/^```/.test(line)){ flushAll(); code = []; continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))){ flushAll(); const level = m[1].length + 1; out.push(`<h${level}>${inline(m[2])}</h${level}>`); continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)){ flushAll(); out.push('<hr>'); continue; }
    if ((m = /^\s*[-*]\s+(.*)$/.exec(line))){ flushPara(); flushQuote(); if (!list || list.type !== 'ul'){ flushList(); list = { type: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))){ flushPara(); flushQuote(); if (!list || list.type !== 'ol'){ flushList(); list = { type: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^&gt;\s?(.*)$/.exec(line))){ flushPara(); flushList(); quote.push(m[1]); continue; }
    if (!line.trim()){ flushAll(); continue; }
    flushList(); flushQuote(); para.push(line.trim());
  }
  if (code !== null) out.push(`<pre><code>${code.join('\n')}</code></pre>`);
  flushAll();
  return out.join('\n');
}

// Plain-text version (emails, license files inside downloads).
export function markdownToText(source){
  return String(source || '').replace(/\r\n?/g, '\n')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/^#{1,3}\s+/gm, '').replace(/`([^`]+)`/g, '$1');
}
