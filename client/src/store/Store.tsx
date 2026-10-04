import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { overlayLayer } from './overlay';
import { getJson, getCurrency, setCurrency, onCurrency, publicConfig, formatPrice, formatDate, type Currency, type Product, type Category, type Price, type Review } from './api';
import { useFocusTrap, useSwipe } from './hooks';

type Tab = 'artzz' | 'artifacts';
const TABS: { id: Tab; label: string }[] = [{ id: 'artzz', label: 'Artzz' }, { id: 'artifacts', label: 'Artifacts' }];
const TAB_KEY = 'ka-store-tab';

export interface StoreProps { onBuy(product: Product, currency: Currency, opener?: HTMLElement | null): void; onResend(opener?: HTMLElement | null): void; initialProduct?: string | null }

function savedTab(): Tab { try { const t = sessionStorage.getItem(TAB_KEY); return t === 'artifacts' ? 'artifacts' : 'artzz'; } catch { return 'artzz'; } }

export function Store({ onBuy, onResend, initialProduct }: StoreProps){
  const [tab, setTab] = useState<Tab>(savedTab);
  const [data, setData] = useState<{ products: Product[]; categories: Category[] } | null>(null);
  const [error, setError] = useState('');
  const [currency, setCur] = useState<Currency>(getCurrency() || 'USD');
  const [lightbox, setLightbox] = useState<{ items: Product[]; index: number; mediaIndex: number; opener: HTMLElement | null } | null>(null);

  const load = useCallback(() => {
    const ctrl = new AbortController();
    setError('');
    getJson<{ products: Product[]; categories: Category[] }>('/api/store/catalog', ctrl.signal)
      .then(setData)
      .catch(e => { if (e.name !== 'AbortError') setError(e.message || 'The store could not load.'); });
    return () => ctrl.abort();
  }, []);
  useEffect(load, [load]);
  // something was published in the portal: re-read the catalog quietly (what's on screen stays until the new list arrives)
  useEffect(() => {
    let stop: (() => void) | undefined;
    const on = () => { stop?.(); stop = load(); };
    addEventListener('ka-content-changed', on);
    return () => { removeEventListener('ka-content-changed', on); stop?.(); };
  }, [load]);

  // Currency: remembered choice first, otherwise the country suggestion from the server. When the owner
  // pauses international (USD) sales, everyone sees and pays in INR (the server refuses USD too).
  const [intl, setIntl] = useState(true);
  useEffect(() => {
    const off = onCurrency(setCur);
    publicConfig().then(cfg => {
      if (cfg.store?.international === false){ setIntl(false); if (getCurrency() !== 'INR') setCurrency('INR', false); return; }
      if (!getCurrency() && cfg.suggestedCurrency) setCurrency(cfg.suggestedCurrency, false);
    });
    return off;
  }, []);

  const changeTab = (t: Tab) => { setTab(t); try { sessionStorage.setItem(TAB_KEY, t); } catch {} };

  const byKind = useMemo(() => ({
    artzz: (data?.products || []).filter(p => p.kind === 'artzz'),
    artifacts: (data?.products || []).filter(p => p.kind === 'artifacts')
  }), [data]);

  // ?product=slug deep link on first load, and later requests from the page (e.g. a link in the
  // assistant's answer): open that item once the catalog is in.
  const [wanted, setWanted] = useState<string | null>(initialProduct || null);
  useEffect(() => {
    const on = (e: Event) => { const slug = (e as CustomEvent<string>).detail; if (typeof slug === 'string') setWanted(slug); };
    addEventListener('ka-open-product', on);
    return () => removeEventListener('ka-open-product', on);
  }, []);
  useEffect(() => {
    if (!data || !wanted) return;
    setWanted(null);
    const p = data.products.find(x => x.slug === wanted);
    if (!p) return;
    changeTab(p.kind);
    const list = byKind[p.kind];
    setLightbox({ items: list, index: list.indexOf(p), mediaIndex: 0, opener: null });
  }, [data, wanted, byKind]);

  return <div className="kas-store">
    <div className="kas-bar">
      <SegmentedTabs value={tab} onChange={changeTab} />
      <CurrencySwitch value={currency} onChange={(c) => setCurrency(c)} international={intl} />
    </div>
    {error ? <div className="kas-state" role="alert"><p>{error}</p><button type="button" className="kas-btn" onClick={load}>Try again</button></div>
      : !data ? <SkeletonGrid kind={tab} />
      : TABS.map(t => <section key={t.id} id={`kas-panel-${t.id}`} role="tabpanel" aria-labelledby={`kas-tab-${t.id}`} hidden={tab !== t.id} className="kas-panel">
          <Panel kind={t.id} products={byKind[t.id]} categories={data.categories.filter(c => c.kind === t.id)} currency={currency}
            onOpen={(items, index, mediaIndex = 0, opener = null) => setLightbox({ items, index, mediaIndex, opener })} onBuy={onBuy} />
        </section>)}
    <p className="kas-resend">Bought something before? <button type="button" className="kas-link" onClick={(e) => onResend(e.currentTarget)}>Email me my download links</button></p>
    {lightbox && createPortal(<Lightbox {...lightbox} currency={currency} onBuy={onBuy} onClose={() => setLightbox(null)}
      onMove={(index, mediaIndex) => setLightbox(l => l && { ...l, index, mediaIndex })} />, overlayLayer())}
  </div>;
}

function SegmentedTabs({ value, onChange }: { value: Tab; onChange(t: Tab): void }){
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex(t => t.id === value);
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(TABS[next].id);
    refs.current[TABS[next].id]?.focus();
  };
  const index = TABS.findIndex(t => t.id === value);
  return <div className="kas-seg" role="tablist" aria-label="Store sections" onKeyDown={onKey} style={{ ['--i' as string]: index } as React.CSSProperties}>
    <span className="kas-seg-indicator" aria-hidden="true" />
    {TABS.map(t => <button key={t.id} ref={el => { refs.current[t.id] = el; }} id={`kas-tab-${t.id}`} type="button" role="tab"
      aria-selected={value === t.id} aria-controls={`kas-panel-${t.id}`} tabIndex={value === t.id ? 0 : -1}
      className="kas-seg-btn" onClick={() => onChange(t.id)}>{t.label}</button>)}
  </div>;
}

// Small flags drawn inline (Windows has no emoji flags): India for INR, a globe for international USD.
function CurrencyMark({ c }: { c: Currency }){
  return c === 'INR'
    ? <svg className="kas-flag" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="4" fill="#FF9933" /><rect y="4" width="18" height="4" fill="#fff" /><rect y="8" width="18" height="4" fill="#138808" /><circle cx="9" cy="6" r="1.5" fill="none" stroke="#000080" strokeWidth=".6" /></svg>
    : <svg className="kas-flag is-globe" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M1.5 9h15M9 1.5c2.2 2.1 3.2 4.6 3.2 7.5S11.2 14.4 9 16.5C6.8 14.4 5.8 11.9 5.8 9S6.8 3.6 9 1.5z" fill="none" stroke="currentColor" strokeWidth="1.1" /></svg>;
}

function CurrencySwitch({ value, onChange, international }: { value: Currency; onChange(c: Currency): void; international: boolean }){
  if (!international) return <span className="kas-currency is-single" title="Prices are shown in Indian rupees"><CurrencyMark c="INR" /> ₹ INR</span>;
  return <div className="kas-currency" role="group" aria-label="Currency">
    {(['INR', 'USD'] as Currency[]).map(c => <button key={c} type="button" aria-pressed={value === c} className="kas-cur-btn" onClick={() => onChange(c)}
      title={c === 'INR' ? 'Pay in Indian rupees (cards, UPI, net banking, wallets)' : 'Pay in US dollars with an international card'}>
      <CurrencyMark c={c} /><span aria-hidden="true">{c === 'INR' ? '₹' : '$'}</span> {c}</button>)}
  </div>;
}

type PriceFilter = 'all' | 'free' | 'paid' | 'sale';
type Sort = 'featured' | 'price-asc' | 'price-desc' | 'popular' | 'rating';
const PRICE_FILTERS: { id: PriceFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'free', label: 'Free' }, { id: 'paid', label: 'Paid' }, { id: 'sale', label: 'On sale' }];
const isFree = (p: Product, c: Currency) => p.free || (p.sellable && p.prices[c].available && p.prices[c].free);
const priceMatches = (p: Product, c: Currency, f: PriceFilter) => {
  const pr = p.prices[c];
  if (f === 'free') return isFree(p, c);
  if (f === 'paid') return p.sellable && pr.available && !pr.free;
  if (f === 'sale') return p.sellable && pr.available && pr.onSale;
  return true;
};
// what an item costs for sorting: free first, items that can't be bought last
const sortPrice = (p: Product, c: Currency) => !p.sellable || !p.prices[c].available ? Infinity : p.prices[c].free ? 0 : p.prices[c].amount;

function Chips({ options, value, onChange, label }: { options: { id: string; name: string; count: number }[]; value: string; onChange(v: string): void; label: string }){
  if (options.length < 2) return null;
  return <div className="kas-chips" role="radiogroup" aria-label={label}>
    {options.map(c => <button key={c.id || 'all'} type="button" role="radio" aria-checked={value === c.id} className="kas-chip" onClick={() => onChange(c.id)}>
      {c.name}<span className="kas-chip-count" aria-hidden="true">{c.count}</span><span className="kas-sr">, {c.count} item{c.count === 1 ? '' : 's'}</span></button>)}
  </div>;
}

function Panel({ kind, products, categories, currency, onOpen, onBuy }: {
  kind: Tab; products: Product[]; categories: Category[]; currency: Currency;
  onOpen(items: Product[], index: number, mediaIndex?: number, opener?: HTMLElement | null): void; onBuy(p: Product, c: Currency, opener?: HTMLElement | null): void;
}){
  const [cat, setCat] = useState('');
  const [price, setPrice] = useState<PriceFilter>('all');
  const [sort, setSort] = useState<Sort>('featured');
  const used = useMemo(() => categories.filter(c => products.some(p => p.category?.slug === c.slug)), [categories, products]);
  const hasPopular = products.some(p => (p.downloads ?? 0) > 0), hasRating = products.some(p => p.rating);
  // Counts answer "what would I get if I picked this": price counts within the chosen category and vice versa.
  const inCat = useMemo(() => cat ? products.filter(p => p.category?.slug === cat) : products, [products, cat]);
  const inPrice = useMemo(() => products.filter(p => priceMatches(p, currency, price)), [products, currency, price]);
  const priceOptions = PRICE_FILTERS.map(f => ({ id: f.id, name: f.label, count: inCat.filter(p => priceMatches(p, currency, f.id)).length }))
    .filter(f => f.id === 'all' || f.count > 0 || f.id === price);
  const catOptions = [{ id: '', name: 'All', count: inPrice.length },
    ...used.map(c => ({ id: c.slug, name: c.name, count: inPrice.filter(p => p.category?.slug === c.slug).length }))];
  const shown = useMemo(() => {
    const list = inCat.filter(p => priceMatches(p, currency, price));
    if (sort === 'featured') return list;                                   // the owner's order from the portal
    const by: Record<Exclude<Sort, 'featured'>, (a: Product, b: Product) => number> = {
      'price-asc': (a, b) => sortPrice(a, currency) - sortPrice(b, currency),
      'price-desc': (a, b) => { const x = sortPrice(a, currency), y = sortPrice(b, currency); return x === Infinity ? 1 : y === Infinity ? -1 : y - x; },
      popular: (a, b) => (b.downloads ?? 0) - (a.downloads ?? 0),
      rating: (a, b) => (b.rating?.avg ?? 0) - (a.rating?.avg ?? 0) || (b.rating?.count ?? 0) - (a.rating?.count ?? 0)
    };
    return [...list].sort(by[sort]);                                       // Array#sort is stable: ties keep the owner's order
  }, [inCat, currency, price, sort]);
  // "All" in the owner's order is shown grouped by category (a heading per group); filtering or sorting shows one grid.
  const groups = useMemo(() => {
    if (cat || sort !== 'featured' || used.length < 2) return null;
    const out = used.map(c => ({ slug: c.slug, name: c.name, items: shown.filter(p => p.category?.slug === c.slug) }));
    const rest = shown.filter(p => !p.category || !used.some(c => c.slug === p.category!.slug));
    if (rest.length) out.push({ slug: '', name: 'More', items: rest });
    return out.filter(g => g.items.length);
  }, [cat, sort, used, shown]);
  const flat = groups ? groups.flatMap(g => g.items) : shown;              // the lightbox steps through what is on screen, in screen order
  if (!products.length) return <div className="kas-state"><p>{kind === 'artzz' ? 'New artwork is on the way.' : 'Projects and tools are on the way.'}</p></div>;
  const grid = (items: Product[], label: string) => kind === 'artzz'
    ? <ul className="kas-art-grid" aria-label={label}>{items.map(p => { const i = flat.indexOf(p); return <ArtTile key={p.id} product={p} currency={currency} onOpen={(el) => onOpen(flat, i, 0, el)} onBuy={onBuy} />; })}</ul>
    : <ul className="kas-card-grid" aria-label={label}>{items.map(p => { const i = flat.indexOf(p); return <ArtifactCard key={p.id} product={p} currency={currency} onOpen={(m, el) => onOpen(flat, i, m, el)} onBuy={onBuy} />; })}</ul>;
  const section = kind === 'artzz' ? 'Artzz' : 'Artifacts';
  return <>
    <div className="kas-tools">
      <Chips options={priceOptions} value={price} onChange={v => setPrice(v as PriceFilter)} label={`${section}: price`} />
      <label className="kas-sort"><span>Sort</span>
        <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
          <option value="featured">Featured</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          {hasPopular && <option value="popular">Most downloaded</option>}
          {hasRating && <option value="rating">Top rated</option>}
        </select>
      </label>
    </div>
    {kind === 'artifacts' && used.some(c => /business|commerce|e-commerce|enterprise|saas|application|app|software|platform|tool|health|medical|care|wellness|finance|financial|fintech|banking|payment/i.test(c.name)) && <div className="kas-chips" role="group" aria-label="Project types">{[
      { label: 'Business', terms: /business|commerce|e-commerce|enterprise|saas/i },
      { label: 'Applications', terms: /application|app|software|platform|tool/i },
      { label: 'Healthcare', terms: /health|medical|care|wellness/i },
      { label: 'Finance', terms: /finance|financial|fintech|banking|payment/i }
    ].filter(type => used.some(c => type.terms.test(c.name))).map(type => {
      const category = used.find(c => type.terms.test(c.name));
      return <button key={type.label} type="button" className="kas-chip" aria-pressed={cat === category?.slug} onClick={() => setCat(cat === category?.slug ? '' : category!.slug)}>{type.label}</button>;
    })}</div>}
    <Chips options={catOptions} value={cat} onChange={setCat} label={`${section} categories`} />
    {!shown.length ? <div className="kas-state"><p>Nothing matches these filters.</p>
        <button type="button" className="kas-btn" onClick={() => { setCat(''); setPrice('all'); }}>Show everything</button></div>
      : groups ? groups.map(g => <section key={g.slug || 'more'} className="kas-group" aria-label={g.name}>
          <header className="kas-group-head"><h3>{g.name}<span className="kas-chip-count" aria-hidden="true">{g.items.length}</span><span className="kas-sr">, {g.items.length} item{g.items.length === 1 ? '' : 's'}</span></h3>
            {g.slug && <button type="button" className="kas-link" onClick={() => setCat(g.slug)}>Only {g.name}</button>}</header>
          {grid(g.items, `${section}: ${g.name}`)}
        </section>)
      : grid(shown, section)}
  </>;
}

// Corner ribbon on the artwork: Free, or the sale discount
function Ribbon({ product, currency }: { product: Product; currency: Currency }){
  const pr = product.prices[currency];
  if (isFree(product, currency)) return <span className="kas-ribbon is-free">Free</span>;
  if (product.sellable && pr.available && pr.onSale && pr.percentOff > 0) return <span className="kas-ribbon">−{pr.percentOff}%</span>;
  return null;
}

function Img({ media, sizes, className, eager }: { media?: { url: string; alt: string; width: number | null; height: number | null }; sizes: string; className?: string; eager?: boolean }){
  const [loaded, setLoaded] = useState(false);
  if (!media) return <span className={`kas-img kas-img-empty ${className || ''}`} aria-hidden="true" />;
  return <img className={`kas-img ${loaded ? 'is-loaded' : ''} ${className || ''}`} src={media.url} alt={media.alt || ''} sizes={sizes}
    width={media.width || undefined} height={media.height || undefined} loading={eager ? 'eager' : 'lazy'} decoding="async"
    onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} draggable={false} />;
}

function PriceTag({ price }: { price: Price }){
  if (!price.available) return null;
  if (price.free) return <span className="kas-price"><strong>Free</strong></span>;
  return <span className="kas-price">
    <strong>{formatPrice(price.amount, price.currency)}</strong>
    {price.onSale && price.compareAt !== null && <>
      <s aria-label={`was ${formatPrice(price.compareAt, price.currency)}`}>{formatPrice(price.compareAt, price.currency)}</s>
      {price.percentOff > 0 && <span className="kas-badge">−{price.percentOff}%</span>}
    </>}
  </span>;
}

const compact = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
// "★ 4.8 (12) · 340 downloads": nothing when there is nothing to show yet
function Social({ product }: { product: Product }){
  const r = product.rating, d = product.downloads;
  if (!r && !d) return null;
  return <span className="kas-social">
    {r && <span className="kas-stars" aria-label={`Rated ${r.avg.toFixed(1)} out of 5 by ${r.count} buyer${r.count === 1 ? '' : 's'}`}><span aria-hidden="true">★</span> {r.avg.toFixed(1)} <span className="kas-faint">({r.count})</span></span>}
    {r && !!d && <span aria-hidden="true" className="kas-faint">·</span>}
    {!!d && <span>{compact(d)} download{d === 1 ? '' : 's'}</span>}
  </span>;
}

function BuyButton({ product, currency, onBuy, compact }: { product: Product; currency: Currency; onBuy(p: Product, c: Currency, opener?: HTMLElement | null): void; compact?: boolean }){
  const price = product.prices[currency];
  if (!product.sellable || !price.available) return null;
  const label = price.free ? 'Download' : 'Buy';
  return <button type="button" className={`kas-buy ${compact ? 'is-compact' : ''}`} onClick={(e) => onBuy(product, currency, e.currentTarget)}
    aria-label={`${label} ${product.title}${price.free ? ' (free)' : ` for ${formatPrice(price.amount, currency)}`}`}>{label}</button>;
}

function ArtTile({ product, currency, onOpen, onBuy }: { product: Product; currency: Currency; onOpen(opener: HTMLElement): void; onBuy(p: Product, c: Currency, opener?: HTMLElement | null): void }){
  const price = product.prices[currency];
  return <li className="kas-art">
    <button type="button" className="kas-art-open" onClick={(e) => onOpen(e.currentTarget)} aria-label={`View ${product.title}`}>
      <Img media={product.media[0]} sizes="(max-width: 600px) 50vw, 260px" />
      <Ribbon product={product} currency={currency} />
    </button>
    <div className="kas-art-meta">
      <span className="kas-art-title">{product.title}</span>
      <Social product={product} />
      {product.sellable && price.available && <span className="kas-art-row"><PriceTag price={price} /><BuyButton product={product} currency={currency} onBuy={onBuy} compact /></span>}
    </div>
  </li>;
}

function ArtifactCard({ product, currency, onOpen, onBuy }: { product: Product; currency: Currency; onOpen(mediaIndex: number, opener: HTMLElement): void; onBuy(p: Product, c: Currency, opener?: HTMLElement | null): void }){
  const price = product.prices[currency];
  const demo = product.demoUrl || product.previewUrl;
  return <li className="kas-card">
    <button type="button" className="kas-card-shot" onClick={(e) => onOpen(0, e.currentTarget)} aria-label={product.media.length ? `View screenshots of ${product.title}` : `View details of ${product.title}`}>
      <Img media={product.media[0]} sizes="(max-width: 700px) 100vw, 420px" />
      {product.media.length > 1 && <span className="kas-shot-count" aria-hidden="true">{product.media.length}</span>}
      <Ribbon product={product} currency={currency} />
    </button>
    <div className="kas-card-body">
      <div className="kas-card-head">
        <h3>{product.title}</h3>
        {product.version && <span className="kas-version">v{product.version.replace(/^v/i, '')}</span>}
      </div>
      {product.summary && <p className="kas-summary">{product.summary}</p>}
      <Social product={product} />
      {product.techTags.length > 0 && <ul className="kas-tags" aria-label="Built with">{product.techTags.map(t => <li key={t}>{t}</li>)}</ul>}
      <dl className="kas-facts">
        {product.license && <><dt>License</dt><dd>{product.license.name}</dd></>}
        {price.onSale && price.saleEndsAt && <><dt>Sale ends</dt><dd>{formatDate(price.saleEndsAt)}</dd></>}
      </dl>
      <div className="kas-card-foot">
        <PriceTag price={price} />
        <span className="kas-actions">
          {demo && <a className="kas-btn is-ghost" href={demo} target="_blank" rel="noopener noreferrer">{product.demoUrl ? 'Live demo' : 'Preview'}<span className="kas-sr"> (opens in a new tab)</span></a>}
          <BuyButton product={product} currency={currency} onBuy={onBuy} />
        </span>
      </div>
    </div>
  </li>;
}

function Lightbox({ items, index, mediaIndex, opener, currency, onClose, onMove, onBuy }: {
  items: Product[]; index: number; mediaIndex: number; opener: HTMLElement | null; currency: Currency;
  onClose(): void; onMove(index: number, mediaIndex: number): void; onBuy(p: Product, c: Currency, opener?: HTMLElement | null): void;
}){
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose, opener);
  const product = items[index];
  const media = product?.media || [];
  // Artifacts step through their screenshots first; Artzz steps between works.
  const step = useCallback((dir: -1 | 1) => {
    if (!product) return;
    if (product.kind === 'artifacts' && media.length > 1){
      onMove(index, (mediaIndex + dir + media.length) % media.length);
    } else if (items.length > 1){
      onMove((index + dir + items.length) % items.length, 0);
    }
  }, [product, media.length, items.length, index, mediaIndex, onMove]);
  const swipe = useSwipe(step);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight'){ e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft'){ e.preventDefault(); step(-1); }
  };
  if (!product) return null;
  const m = media[mediaIndex] || media[0];
  const canStep = (product.kind === 'artifacts' && media.length > 1) || items.length > 1;
  return <div className="kas-lb" role="dialog" aria-modal="true" aria-label={product.title} ref={ref} onKeyDown={onKey}>
    <div className="kas-lb-backdrop" onClick={onClose} />
    <div className="kas-lb-stage" {...swipe}>
      {m ? <img key={m.url} className="kas-lb-img" src={m.url} alt={m.alt || product.title} decoding="async" draggable={false} /> : <div className="kas-lb-img kas-img-empty" />}
    </div>
    <button type="button" className="kas-lb-close" onClick={onClose} aria-label="Close" data-autofocus>
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
    </button>
    {canStep && <>
      <button type="button" className="kas-lb-nav is-prev" onClick={() => step(-1)} aria-label="Previous"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      <button type="button" className="kas-lb-nav is-next" onClick={() => step(1)} aria-label="Next"><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    </>}
    <div className="kas-lb-caption">
      <div>
        <strong>{product.title}</strong>
        {/* descriptions are Markdown, rendered to safe HTML by the server (the same renderer as Tips) */}
        {product.descriptionHtml ? <div className="kas-lb-desc" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} /> : product.summary ? <p>{product.summary}</p> : null}
        {product.kind === 'artifacts' && media.length > 1 && <span className="kas-lb-count" aria-live="polite">{mediaIndex + 1} / {media.length}</span>}
        <Social product={product} />
        {product.rating && <Reviews slug={product.slug} />}
      </div>
      {product.sellable && product.prices[currency].available && <div className="kas-lb-buy"><PriceTag price={product.prices[currency]} /><BuyButton product={product} currency={currency} onBuy={(p, c) => { onClose(); onBuy(p, c, opener); }} /></div>}
    </div>
  </div>;
}

// The latest written reviews (buyers only), loaded when the item is opened
function Reviews({ slug }: { slug: string }){
  const [list, setList] = useState<Review[] | null>(null);
  useEffect(() => {
    const ctrl = new AbortController(); setList(null);
    getJson<{ reviews: Review[] }>(`/api/store/products/${encodeURIComponent(slug)}/reviews`, ctrl.signal).then(r => setList(r.reviews)).catch(() => {});
    return () => ctrl.abort();
  }, [slug]);
  const written = (list || []).filter(r => r.review).slice(0, 4);
  if (!written.length) return null;
  return <ul className="kas-reviews" aria-label="Reviews">
    {written.map((r, i) => <li key={i}><span className="kas-stars" aria-label={`${r.rating} out of 5`}>{'★'.repeat(r.rating)}<span className="kas-faint">{'★'.repeat(5 - r.rating)}</span></span>
      <p>{r.review}</p><span className="kas-faint">{r.name}</span></li>)}
  </ul>;
}

function SkeletonGrid({ kind }: { kind: Tab }){
  return <div className="kas-panel" aria-busy="true" aria-label="Loading the store">
    <ul className={kind === 'artzz' ? 'kas-art-grid' : 'kas-card-grid'}>
      {Array.from({ length: kind === 'artzz' ? 8 : 4 }, (_, i) => <li key={i} className={`kas-skel ${kind === 'artzz' ? 'is-art' : 'is-card'}`} />)}
    </ul>
  </div>;
}
