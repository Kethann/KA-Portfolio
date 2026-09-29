import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { overlayLayer } from './overlay';
import { getJson, getCurrency, setCurrency, onCurrency, publicConfig, formatPrice, formatDate, type Currency, type Product, type Category, type Price } from './api';
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

  // Currency: remembered choice first, otherwise the country suggestion from the server.
  useEffect(() => {
    const off = onCurrency(setCur);
    if (!getCurrency()) publicConfig().then(cfg => { if (cfg.suggestedCurrency && !getCurrency()) setCurrency(cfg.suggestedCurrency, false); });
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
      <CurrencySwitch value={currency} onChange={(c) => setCurrency(c)} />
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

function CurrencySwitch({ value, onChange }: { value: Currency; onChange(c: Currency): void }){
  return <div className="kas-currency" role="group" aria-label="Currency">
    {(['INR', 'USD'] as Currency[]).map(c => <button key={c} type="button" aria-pressed={value === c} className="kas-cur-btn" onClick={() => onChange(c)}>
      <span aria-hidden="true">{c === 'INR' ? '₹' : '$'}</span> {c}</button>)}
  </div>;
}

function Chips({ categories, value, onChange, label }: { categories: { slug: string; name: string }[]; value: string; onChange(v: string): void; label: string }){
  if (!categories.length) return null;
  const all = [{ slug: '', name: 'All' }, ...categories];
  return <div className="kas-chips" role="radiogroup" aria-label={label}>
    {all.map(c => <button key={c.slug || 'all'} type="button" role="radio" aria-checked={value === c.slug} className="kas-chip" onClick={() => onChange(c.slug)}>{c.name}</button>)}
  </div>;
}

function Panel({ kind, products, categories, currency, onOpen, onBuy }: {
  kind: Tab; products: Product[]; categories: Category[]; currency: Currency;
  onOpen(items: Product[], index: number, mediaIndex?: number, opener?: HTMLElement | null): void; onBuy(p: Product, c: Currency, opener?: HTMLElement | null): void;
}){
  const [cat, setCat] = useState('');
  const used = useMemo(() => categories.filter(c => products.some(p => p.category?.slug === c.slug)), [categories, products]);
  const shown = useMemo(() => cat ? products.filter(p => p.category?.slug === cat) : products, [products, cat]);
  if (!products.length) return <div className="kas-state"><p>{kind === 'artzz' ? 'New artwork is on the way.' : 'Projects and tools are on the way.'}</p></div>;
  return <>
    <Chips categories={used} value={cat} onChange={setCat} label={kind === 'artzz' ? 'Artzz categories' : 'Artifacts categories'} />
    {kind === 'artzz'
      ? <ul className="kas-art-grid" aria-label="Artzz">{shown.map((p, i) => <ArtTile key={p.id} product={p} currency={currency} onOpen={(el) => onOpen(shown, i, 0, el)} onBuy={onBuy} />)}</ul>
      : <ul className="kas-card-grid" aria-label="Artifacts">{shown.map((p, i) => <ArtifactCard key={p.id} product={p} currency={currency} onOpen={(m, el) => onOpen(shown, i, m, el)} onBuy={onBuy} />)}</ul>}
  </>;
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
    </button>
    <div className="kas-art-meta">
      <span className="kas-art-title">{product.title}</span>
      {product.sellable && price.available && <span className="kas-art-row"><PriceTag price={price} /><BuyButton product={product} currency={currency} onBuy={onBuy} compact /></span>}
    </div>
  </li>;
}

function ArtifactCard({ product, currency, onOpen, onBuy }: { product: Product; currency: Currency; onOpen(mediaIndex: number, opener: HTMLElement): void; onBuy(p: Product, c: Currency, opener?: HTMLElement | null): void }){
  const price = product.prices[currency];
  const demo = product.demoUrl || product.previewUrl;
  return <li className="kas-card">
    <button type="button" className="kas-card-shot" onClick={(e) => onOpen(0, e.currentTarget)} aria-label={`View screenshots of ${product.title}`} disabled={!product.media.length}>
      <Img media={product.media[0]} sizes="(max-width: 700px) 100vw, 420px" />
      {product.media.length > 1 && <span className="kas-shot-count" aria-hidden="true">{product.media.length}</span>}
    </button>
    <div className="kas-card-body">
      <div className="kas-card-head">
        <h3>{product.title}</h3>
        {product.version && <span className="kas-version">v{product.version.replace(/^v/i, '')}</span>}
      </div>
      {product.summary && <p className="kas-summary">{product.summary}</p>}
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
        {product.description ? <p>{product.description}</p> : product.summary ? <p>{product.summary}</p> : null}
        {product.kind === 'artifacts' && media.length > 1 && <span className="kas-lb-count" aria-live="polite">{mediaIndex + 1} / {media.length}</span>}
      </div>
      {product.sellable && product.prices[currency].available && <div className="kas-lb-buy"><PriceTag price={product.prices[currency]} /><BuyButton product={product} currency={currency} onBuy={(p, c) => { onClose(); onBuy(p, c, opener); }} /></div>}
    </div>
  </div>;
}

function SkeletonGrid({ kind }: { kind: Tab }){
  return <div className="kas-panel" aria-busy="true" aria-label="Loading the store">
    <ul className={kind === 'artzz' ? 'kas-art-grid' : 'kas-card-grid'}>
      {Array.from({ length: kind === 'artzz' ? 8 : 4 }, (_, i) => <li key={i} className={`kas-skel ${kind === 'artzz' ? 'is-art' : 'is-card'}`} />)}
    </ul>
  </div>;
}
