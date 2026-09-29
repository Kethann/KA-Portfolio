import { useEffect, useRef, useState } from 'react';
import { getJson, formatDate, type Tip, type TipSummary } from './api';
import { useDebounced } from './hooks';

interface ListResponse { tips: TipSummary[]; categories: { slug: string; name: string }[]; page: number; hasMore: boolean }

export function Tips({ initialTip }: { initialTip?: string | null }){
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [list, setList] = useState<TipSummary[]>([]);
  const [categories, setCategories] = useState<{ slug: string; name: string }[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(initialTip || null);
  const [attempt, setAttempt] = useState(0);
  const q = useDebounced(query.trim(), 250);
  const listTop = useRef<HTMLDivElement>(null);
  const lastOpener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setState('loading');
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (page) params.set('page', String(page));
    getJson<ListResponse>(`/api/tips?${params}`, ctrl.signal).then(r => {
      setList(prev => page ? [...prev, ...r.tips] : r.tips);
      setCategories(r.categories); setHasMore(r.hasMore); setState('ready');
    }).catch(e => { if (e.name !== 'AbortError'){ setError(e.message); setState('error'); } });
    return () => ctrl.abort();
  }, [q, category, page, attempt]);

  // new search or filter starts from the first page
  useEffect(() => { setPage(0); }, [q, category]);

  // The list stays mounted (just hidden) while a post is open, so going back keeps the search,
  // filters, loaded pages and scroll position, and focus returns to the card that was opened.
  const back = () => {
    setOpen(null);
    requestAnimationFrame(() => { (lastOpener.current?.isConnected ? lastOpener.current : listTop.current)?.focus({ preventScroll: false }); });
  };
  return <>
  {open && <TipView slug={open} onBack={back} />}
  <div className="kat-tips" ref={listTop} tabIndex={-1} hidden={!!open}>
    <div className="kat-controls">
      <label className="kat-search">
        <span className="kas-sr">Search tips</span>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tips" maxLength={80} enterKeyHint="search" />
      </label>
      {categories.length > 0 && <div className="kas-chips" role="radiogroup" aria-label="Tip categories">
        {[{ slug: '', name: 'All' }, ...categories].map(c => <button key={c.slug || 'all'} type="button" role="radio" aria-checked={category === c.slug} className="kas-chip" onClick={() => setCategory(c.slug)}>{c.name}</button>)}
      </div>}
    </div>
    <p className="kas-sr" aria-live="polite">{state === 'ready' ? `${list.length}${hasMore ? '+' : ''} tips` : ''}</p>
    {state === 'error' && <div className="kas-state" role="alert"><p>{error}</p><button type="button" className="kas-btn" onClick={() => setAttempt(a => a + 1)}>Try again</button></div>}
    {state !== 'error' && list.length === 0 && state === 'ready' && <div className="kas-state"><p>{q || category ? 'No tips match that yet.' : 'The first tips are on the way.'}</p></div>}
    <ul className="kat-grid">
      {list.map(t => <li key={t.slug}>
        <button type="button" className="kat-card" onClick={(e) => { lastOpener.current = e.currentTarget; setOpen(t.slug); }}>
          <span className="kat-cover">{t.coverUrl ? <img src={t.coverUrl} alt="" loading="lazy" decoding="async" /> : <span className="kas-img-empty" />}</span>
          <span className="kat-meta">
            {t.category && <span className="kat-cat">{t.category.name}</span>}
            <span className="kat-title">{t.title}</span>
            {t.excerpt && <span className="kat-excerpt">{t.excerpt}</span>}
            {t.publishedAt && <span className="kat-date">{formatDate(t.publishedAt)}</span>}
          </span>
        </button>
      </li>)}
      {state === 'loading' && Array.from({ length: page ? 2 : 6 }, (_, i) => <li key={'s' + i} className="kas-skel is-tip" />)}
    </ul>
    {hasMore && state === 'ready' && <div className="kat-more"><button type="button" className="kas-btn" onClick={() => setPage(p => p + 1)}>Show more tips</button></div>}
  </div>
  </>;
}

function TipView({ slug, onBack }: { slug: string; onBack(): void }){
  const [tip, setTip] = useState<Tip | null>(null);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    getJson<{ tip: Tip }>(`/api/tips/${encodeURIComponent(slug)}`, ctrl.signal).then(r => setTip(r.tip)).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => ctrl.abort();
  }, [slug]);
  useEffect(() => { if (tip) heading.current?.focus({ preventScroll: false }); }, [tip]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('input,textarea')) onBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);
  return <article className="kat-post">
    <button type="button" className="kas-link kat-back" onClick={onBack}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> All tips
    </button>
    {error ? <div className="kas-state" role="alert"><p>{error}</p></div> : !tip ? <div className="kas-skel is-post" aria-busy="true" /> : <>
      {tip.coverUrl && <img className="kat-post-cover" src={tip.coverUrl} alt="" decoding="async" />}
      <header>
        {tip.category && <span className="kat-cat">{tip.category.name}</span>}
        <h2 ref={heading} tabIndex={-1}>{tip.title}</h2>
        {tip.publishedAt && <time dateTime={tip.publishedAt}>{formatDate(tip.publishedAt)}</time>}
      </header>
      {/* server-rendered from a safe Markdown subset: source is escaped before any tag is added */}
      <div className="kat-body" dangerouslySetInnerHTML={{ __html: tip.html }} />
    </>}
  </article>;
}
