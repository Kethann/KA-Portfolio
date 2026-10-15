// System map: how everything fits together, like a database diagram. "How it connects" shows each portal app, the
// data it changes (database tables and settings), the parts of the website that read that data, and the outside
// services involved; pick anything to light up what it is connected to and read what it is for. "Database" shows
// every table live from the database: its columns, which tables it points to, and how many rows it holds.
import { useMemo, useRef, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad } from '../hooks';
import { Badge, ErrorState, SearchBox, Segmented, SkeletonRows } from '../ui';
import { Icon } from '../icons';
import { num } from '../format';

type Kind = 'app' | 'data' | 'setting' | 'site' | 'service';
type N = { id: string; kind: Kind; label: string; desc: string; uses?: string[]; app?: string };
const KIND: Record<Kind, { title: string; color: string }> = {
  app: { title: 'Portal apps', color: '#ff9f5a' }, data: { title: 'Database tables', color: '#7db7ff' }, setting: { title: 'Settings', color: '#c79bff' },
  site: { title: 'Website', color: '#6fe0a8' }, service: { title: 'Outside services', color: '#ffd166' }
};
const T = (id: string, desc: string, uses: string[] = []): N => ({ id: 't:' + id, kind: 'data', label: id, desc, uses });
const S = (id: string, label: string, desc: string): N => ({ id: 's:' + id, kind: 'setting', label, desc });
const A = (id: string, label: string, desc: string, uses: string[]): N => ({ id: 'a:' + id, kind: 'app', label, desc, uses, app: id });
const W = (id: string, label: string, desc: string, uses: string[]): N => ({ id: 'w:' + id, kind: 'site', label, desc, uses });
const X = (id: string, label: string, desc: string): N => ({ id: 'x:' + id, kind: 'service', label, desc });

// what connects to what (kept next to the code it describes: update it when a feature moves)
export const NODES: N[] = [
  A('overview', 'Overview', 'Today at a glance: revenue, orders, conversion, visitors, top items, and the one-tap store open/closed switch.', ['t:orders', 't:order_items', 't:visits', 's:store']),
  A('products', 'Products', 'The catalog: Artzz and Artifacts, prices in ₹ and $, sales, media, the files buyers download, and each product’s delivery email.', ['t:products', 't:product_media', 't:product_files', 't:product_revisions', 't:categories', 's:deliveryEmails', 'x:r2']),
  A('orders', 'Orders', 'Every order and payment: status, refunds, invoices, licenses, resending download links.', ['t:orders', 't:order_items', 't:order_events', 't:licenses', 't:download_tokens', 'x:razorpay', 'x:email']),
  A('reports', 'Reports', 'Revenue by period, product, currency, country and coupon; CSV export; scheduled report emails.', ['t:orders', 't:order_items', 't:coupon_redemptions', 's:reports', 'x:email']),
  A('coupons', 'Coupons', 'Discount codes and their rules; how often each is applied in the cart, paid with and refused.', ['t:coupons', 't:coupon_redemptions']),
  A('downloads', 'Downloads', 'Secure download links: how many times used, expiry, revoking a link.', ['t:download_tokens', 't:download_events']),
  A('visitors', 'Visitors', 'Visitor analytics, live visitors, the visit log, saved logs and how long logs are kept.', ['t:visits', 't:ip_geo_cache', 's:visitors', 's:visitorMarks']),
  A('messages', 'Messages', 'The inbox from the contact form and the chat; replies (emailed and shown on the visitor’s device), saved replies, blocklist.', ['t:messages', 't:message_replies', 't:canned_replies', 't:blocklist', 'x:email']),
  A('assistant', 'KA Assistant', 'The Panda chat’s brain: knowledge, conversations, learned answers, daily AI budget.', ['t:kb_sources', 't:kb_chunks', 't:assistant_conversations', 't:assistant_messages', 't:assistant_usage', 't:assistant_learnings', 's:assistant', 'x:ai']),
  A('social', 'Social', 'Plan and send posts with pictures and hashtags to your networks through your webhook.', ['t:social_posts', 't:social_hashtag_sets', 's:social', 'x:webhook']),
  A('tips', 'Tips', 'Articles shown on the Tips page.', ['t:tips', 't:categories']),
  A('sounds', 'Sounds', 'The site’s soft UI sounds and their volumes.', ['s:site']),
  A('studio', 'Studio', 'The look: colours, fonts, the announcement tab, navigation, links, element styles, the checkout pass and the intro version.', ['s:site', 'x:r2']),
  A('content', 'Content', 'Portfolio pictures and stacks, the Featured Work showcase, site text, the upscaler notify list and every email template.', ['s:site', 't:notify_signups', 't:email_templates', 's:upscaler', 'x:r2']),
  A('wallpaper', 'Wallpaper', 'Records the homepage intro as a live wallpaper video or a still image, at any screen size.', ['w:hero']),
  A('license', 'License card', 'The design of the license / pass card buyers receive.', ['s:site', 't:licenses']),
  A('legal', 'Licenses & Legal', 'License terms, privacy, refunds and delivery pages.', ['t:legal_pages']),
  A('settings', 'Settings', 'Account and team, store status & special access, payments & tax, categories, messages & contact form, reports, system status, backups, activity log.', ['t:admin_users', 't:admin_sessions', 's:store', 's:storeAccess', 's:messages', 't:categories', 't:backups', 't:audit_log', 't:email_log']),

  T('products', 'Every product: title, kind, prices per currency, sale window, status.', ['t:categories']), T('product_media', 'Pictures and previews of a product.', ['t:products']), T('product_files', 'The files a buyer downloads (kept in file storage).', ['t:products', 'x:r2']),
  T('product_revisions', 'Earlier versions of a product, for undo.', ['t:products']), T('product_ratings', 'Stars and reviews from buyers.', ['t:products', 't:orders']), T('categories', 'Groups for products and tips.'),
  T('orders', 'One row per checkout: buyer email, totals, currency, status, payment reference.'), T('order_items', 'What was bought in an order.', ['t:orders', 't:products']), T('order_events', 'The history of an order (created, paid, delivered, refunded).', ['t:orders']),
  T('coupons', 'Discount codes and rules, plus applied / refused counts.'), T('coupon_redemptions', 'A code used on an order (held, then confirmed when paid).', ['t:coupons', 't:orders']),
  T('licenses', 'The license issued with each purchase, checkable on the site.', ['t:orders']), T('download_tokens', 'Secure, expiring download links.', ['t:orders']), T('download_events', 'Each download made with a link.', ['t:download_tokens']),
  T('messages', 'Contact-form and chat messages, with the ticked topics.'), T('message_replies', 'Your replies, and when the visitor saw them on the site.', ['t:messages']), T('canned_replies', 'Saved replies you insert often.'), T('blocklist', 'Emails, domains, IPs and words sent to Spam.'),
  T('notify_signups', 'People waiting for a launch (Image Upscaler).'), T('visits', 'One row per page view: when, where, which device; saved visits are kept forever.'), T('ip_geo_cache', 'Recent IP-to-location lookups (expire after 30 days).', ['x:geo']),
  T('tips', 'Tip articles.', ['t:categories']), T('legal_pages', 'License and policy pages.'), T('email_templates', 'Your edits to the built-in email texts.'), T('email_log', 'Every email sent or failed (never the body).', ['x:email']),
  T('kb_sources', 'What the assistant knows: your notes and pages.'), T('kb_chunks', 'Knowledge split into searchable pieces.', ['t:kb_sources']), T('assistant_conversations', 'Chat conversations with visitors.'),
  T('assistant_messages', 'Each chat message.', ['t:assistant_conversations']), T('assistant_usage', 'AI cost per day, for the budget.'), T('assistant_learnings', 'Answers the assistant learned from your corrections.'),
  T('social_posts', 'Planned and sent social posts.'), T('social_hashtag_sets', 'Saved hashtag groups.'), T('admin_users', 'You and your team (password hash, 2FA).'),
  T('admin_sessions', 'Signed-in portal sessions.', ['t:admin_users']), T('audit_log', 'Everything done in the portal, for the Activity log.', ['t:admin_users']), T('backups', 'Database backups (files in storage).', ['x:r2']),
  S('site', 'site: the website document', 'Portfolio pictures, stacks, Featured Work, text, colours, fonts, announcement, sounds, pass card, intro version.'),
  S('store', 'store', 'Open / closed, the closed board, international payments, tax, coupons stacking, order expiry.'),
  S('storeAccess', 'storeAccess', 'Who may still buy while the store is closed (email and device passes).'),
  S('messages', 'messages', 'Contact topics, auto-reply, business hours, alert email, replies on the site.'),
  S('assistant', 'assistant', 'The assistant’s persona, greeting, rules and daily budget.'), S('visitors', 'visitors', 'How long visit logs are kept.'), S('visitorMarks', 'visitorMarks', 'Visitors you starred, with notes.'),
  S('reports', 'reports', 'Which report emails go out, and to whom.'), S('social', 'social', 'Your posting webhook (stored encrypted) and defaults.'), S('upscaler', 'upscaler', 'The Image Upscaler “coming soon” box and its list.'),
  S('deliveryEmails', 'deliveryEmails', 'Per-product delivery email text and attachments.'), S('live', 'live', 'A version number that moves after every portal change, so open pages refresh by themselves.'),

  W('hero', 'Homepage intro', 'The crystal KA logo that assembles on arrival; the version is chosen in Studio.', ['s:site']),
  W('about', 'About', 'Your story, journey, numbers, skills and promo cuts.', ['s:site']),
  W('featured', 'Featured Work', 'Rows that alternate sides; pictures cross-fade in each frame.', ['s:site', 'x:r2']),
  W('portfolio', 'Portfolio & gallery', 'The picture stacks and the full-screen gallery with downloads.', ['s:site', 'x:r2']),
  W('announce', 'Announcement tab', 'The small megaphone that slides open with your news.', ['s:site']),
  W('store', 'Store', 'Product lists and pages, ratings, ₹ / $ prices.', ['t:products', 't:product_media', 't:categories', 't:product_ratings', 's:store']),
  W('closed', 'Closed board & panda', 'Shown while the store is closed; pass holders can still shop.', ['s:store', 's:storeAccess', 'x:email']),
  W('checkout', 'Checkout & payment', 'Order, coupons, license name, payment; then the download.', ['t:orders', 't:order_items', 't:coupons', 't:coupon_redemptions', 't:licenses', 's:store', 's:storeAccess', 'x:razorpay', 'x:turnstile', 'x:email']),
  W('delivery', 'Download page', 'Secure links to the purchased files, and rating the item.', ['t:download_tokens', 't:download_events', 't:product_files', 't:product_ratings', 'x:r2']),
  W('tips', 'Tips page', 'Articles.', ['t:tips']),
  W('contact', 'Contact form', 'Name, email, the Regarding ticks and the message; spam is filtered.', ['t:messages', 't:blocklist', 's:messages', 'x:turnstile', 'x:email']),
  W('replies', 'Reply pop-up', 'Your reply appears on the device the visitor wrote from.', ['t:messages', 't:message_replies']),
  W('chat', 'Panda chat', 'The KA Assistant chat with the panda.', ['t:assistant_conversations', 't:assistant_messages', 't:kb_chunks', 's:assistant', 'x:ai']),
  W('typography', 'Typography studio', 'Draw and type with effects; runs fully in the visitor’s browser (nothing is saved on the server).', []),
  W('legal', 'Legal & license check', 'Policy pages, and checking a license by its code.', ['t:legal_pages', 't:licenses']),
  W('tracking', 'Visit tracking', 'Counts visits and time on page, without cookies.', ['t:visits', 't:ip_geo_cache', 'x:geo']),
  W('notify', 'Notify-me list', 'Sign up to hear when the Image Upscaler launches.', ['t:notify_signups', 's:upscaler', 'x:email']),
  W('live', 'Live updates', 'Open pages notice portal changes within seconds.', ['s:live']),

  X('db', 'Cloudflare D1 database', 'Holds every table and setting above (SQLite on your computer during development).'),
  X('r2', 'Cloudflare R2 storage', 'Pictures, product files, fonts, sounds and backups.'),
  X('razorpay', 'Razorpay', 'Takes card, UPI and international payments.'),
  X('email', 'Email (Gmail or Brevo)', 'Sends receipts, download links, replies and alerts.'),
  X('turnstile', 'Cloudflare Turnstile', 'Invisible bot check on forms and checkout.'),
  X('ai', 'AI provider', 'Gemini, Claude or OpenAI: answers for the Panda chat.'),
  X('geo', 'IP location (ipstack / ipwho.is)', 'Approximate city and country of a visit.'),
  X('webhook', 'Your posting webhook', 'Zapier, Make or n8n, which posts to your social networks.')
];
const BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]));
const COLS: Kind[][] = [['app'], ['data', 'setting'], ['site'], ['service']];
const BOX_W = 196, BOX_H = 28, GAP = 6, COL_GAP = 150, HEAD = 40;

export default function SystemMap({ open }: AppProps){
  const [view, setView] = useState<'graph' | 'db'>('graph');
  return (
    <div className="app">
      <div className="app-toolbar"><Segmented label="View" value={view} onChange={setView} options={[{ value: 'graph', label: 'How it connects' }, { value: 'db', label: 'Database (live)' }]} /></div>
      {view === 'graph' ? <Graph open={open} /> : <Database />}
    </div>
  );
}

function Graph({ open }: { open: AppProps['open'] }){
  const [sel, setSel] = useState<string | null>('w:checkout');
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [zoom, setZoom] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);
  // positions: one column per kind group, top to bottom
  const { pos, width, height } = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {}; let maxH = 0;
    COLS.forEach((kinds, c) => {
      let y = HEAD;
      for (const k of kinds){ for (const n of NODES.filter(n => n.kind === k)){ pos[n.id] = { x: 20 + c * (BOX_W + COL_GAP), y }; y += BOX_H + GAP; } y += 18; }
      maxH = Math.max(maxH, y);
    });
    return { pos, width: 20 + COLS.length * (BOX_W + COL_GAP) - COL_GAP + 20, height: maxH + 10 };
  }, []);
  const edges = useMemo(() => NODES.flatMap(n => (n.uses || []).filter(u => BY_ID[u]).map(u => ({ from: n.id, to: u }))), []);
  const focus = hover || sel;
  const linked = useMemo(() => {
    if (!focus) return null;
    const s = new Set([focus]); for (const e of edges){ if (e.from === focus) s.add(e.to); if (e.to === focus) s.add(e.from); } return s;
  }, [focus, edges]);
  const match = (n: N) => !q || (n.label + ' ' + n.desc).toLowerCase().includes(q.toLowerCase());
  const node = sel ? BY_ID[sel] : null;
  const usesOf = (id: string) => edges.filter(e => e.from === id).map(e => BY_ID[e.to]);
  const usedBy = (id: string) => edges.filter(e => e.to === id).map(e => BY_ID[e.from]);
  // an edge leaves the right side of the node that is further left
  const path = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    const x1 = l.x + BOX_W, y1 = l.y + BOX_H / 2, x2 = r.x, y2 = r.y + BOX_H / 2;
    if (x1 > x2){ const mx = Math.max(x1, x2) + 40; return `M${l.x + BOX_W} ${y1} C${mx} ${y1} ${mx} ${y2} ${r.x + BOX_W} ${y2}`; }
    const dx = (x2 - x1) * 0.5; return `M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
  };
  return (
    <div className="map">
      <div className="map-main">
        <div className="map-tools">
          <SearchBox value={q} onChange={setQ} placeholder="Find a feature, table or service" label="Search the map" />
          <span className="grow" />
          {(Object.keys(KIND) as Kind[]).map(k => <span key={k} className="map-key"><i style={{ background: KIND[k].color }} />{KIND[k].title}</span>)}
          <button type="button" className="icon-btn sm" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.1).toFixed(2)))}><Icon name="minus" size={13} /></button>
          <span className="faint num" style={{ fontSize: 12, width: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button type="button" className="icon-btn sm" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.6, +(z + 0.1).toFixed(2)))}><Icon name="plus" size={13} /></button>
        </div>
        <div className="map-scroll" ref={scroller}>
          <svg width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="How the portal, the data, the website and outside services connect">
            {COLS.map((kinds, c) => <text key={c} x={20 + c * (BOX_W + COL_GAP)} y={22} className="map-col">{kinds.map(k => KIND[k].title).join(' & ')}</text>)}
            <g className="map-edges">
              {edges.map((e, i) => { const on = !!linked && (e.from === focus || e.to === focus);
                return <path key={i} d={path(pos[e.from], pos[e.to])} className={on ? 'on' : linked ? 'dim' : ''} style={on ? { stroke: KIND[BY_ID[e.from].kind].color } : undefined} />; })}
            </g>
            {NODES.map(n => { const p = pos[n.id], dim = (linked && !linked.has(n.id)) || !match(n);
              return (
                <g key={n.id} className={'map-node' + (sel === n.id ? ' sel' : '') + (dim ? ' dim' : '')} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-label={`${n.label}: ${n.desc}`}
                  onClick={() => setSel(n.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); setSel(n.id); } }} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}>
                  <rect width={BOX_W} height={BOX_H} rx={7} />
                  <rect width={4} height={BOX_H} rx={2} style={{ fill: KIND[n.kind].color }} />
                  <text x={12} y={BOX_H / 2 + 4}>{n.label.length > 27 ? n.label.slice(0, 26) + '…' : n.label}</text>
                </g>
              ); })}
          </svg>
        </div>
      </div>
      <aside className="map-side">
        {node ? <>
          <Badge tone="neutral">{KIND[node.kind].title.replace(/s$/, '')}</Badge>
          <h3>{node.label}</h3>
          <p className="muted">{node.desc}</p>
          {node.app && <button type="button" className="btn primary sm" onClick={() => open(node.app!)}><Icon name="external" /> Open {node.label}</button>}
          {usesOf(node.id).length > 0 && <><div className="eyebrow">{node.kind === 'app' ? 'Changes' : node.kind === 'site' ? 'Uses' : 'Points to'}</div>
            <ul className="map-links">{usesOf(node.id).map(m => <li key={m.id}><button type="button" onClick={() => setSel(m.id)}><i style={{ background: KIND[m.kind].color }} />{m.label}</button></li>)}</ul></>}
          {usedBy(node.id).length > 0 && <><div className="eyebrow">Used by</div>
            <ul className="map-links">{usedBy(node.id).map(m => <li key={m.id}><button type="button" onClick={() => setSel(m.id)}><i style={{ background: KIND[m.kind].color }} />{m.label}</button></li>)}</ul></>}
        </> : <p className="muted">Pick anything on the map to see what it is for and what it connects to.</p>}
      </aside>
    </div>
  );
}

type Table = { name: string; rows: number | null; columns: { name: string; type: string; pk: boolean; required: boolean }[]; refs: { column: string; table: string }[] };
function Database(){
  const s = useLoad<{ tables: Table[]; settings: { key: string; revision: number; updatedAt: string }[] }>('/system/map');
  const [q, setQ] = useState('');
  const [hi, setHi] = useState<string | null>(null);
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <div className="pad"><SkeletonRows rows={8} /></div>;
  const pointedBy = (name: string) => s.data!.tables.filter(t => t.refs.some(r => r.table === name)).map(t => t.name);
  const usedBy = (name: string) => NODES.filter(n => (n.uses || []).includes('t:' + name)).map(n => n.label);
  const tables = s.data.tables.filter(t => !q || t.name.includes(q.toLowerCase()) || t.columns.some(c => c.name.includes(q.toLowerCase())));
  const go = (name: string) => { setHi(name); document.getElementById('dbt-' + name)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  return (
    <div className="app-main">
      <div className="row" style={{ marginBottom: 12 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Find a table or column" label="Search tables" />
        <span className="faint" style={{ fontSize: 12 }}>{s.data.tables.length} tables · {num(s.data.tables.reduce((n, t) => n + (t.rows || 0), 0))} rows · {s.data.settings.length} settings documents</span>
      </div>
      <div className="db-grid">
        {tables.map(t => (
          <section key={t.name} id={'dbt-' + t.name} className={'db-table' + (hi === t.name ? ' hi' : '')}>
            <header><b>{t.name}</b><span className="faint num">{t.rows === null ? '' : num(t.rows) + ' rows'}</span></header>
            <ul>{t.columns.map(c => { const ref = t.refs.find(r => r.column === c.name);
              return <li key={c.name}><span className={c.pk ? 'pk' : ''}>{c.pk ? '🔑 ' : ''}{c.name}</span><span className="faint">{c.type}{c.required && !c.pk ? ' · required' : ''}</span>
                {ref && <button type="button" className="db-ref" onClick={() => go(ref.table)} title={`Points to ${ref.table}`}>→ {ref.table}</button>}</li>; })}</ul>
            {(pointedBy(t.name).length > 0 || usedBy(t.name).length > 0) && <footer>
              {pointedBy(t.name).length > 0 && <div><span className="faint">Pointed to by </span>{pointedBy(t.name).map(n => <button key={n} type="button" className="db-ref" onClick={() => go(n)}>{n}</button>)}</div>}
              {usedBy(t.name).length > 0 && <div><span className="faint">Used by </span>{usedBy(t.name).join(', ')}</div>}
            </footer>}
          </section>
        ))}
      </div>
      <h3 style={{ margin: '24px 0 8px' }}>Settings documents</h3>
      <ul className="list">{s.data.settings.map(x => <li key={x.key}><b className="mono">{x.key}</b><span className="grow faint">{BY_ID['s:' + x.key]?.desc || ''}</span><span className="faint" style={{ fontSize: 12 }}>version {x.revision}</span></li>)}</ul>
    </div>
  );
}
