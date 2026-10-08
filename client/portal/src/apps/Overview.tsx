// Overview: today's picture. Money is shown per currency (INR and USD are never added together).
// The owner can hide every amount (screen sharing), choose which cards show, and count revenue net of
// refunds or gross; those choices are remembered on this device.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad, usePref } from '../hooks';
import { Chart, Empty, ErrorState, Segmented, Skeleton, Badge } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { money, moneyCompact, num, ago, todayIST } from '../format';
import { CurrencyMark, MASK, Money, Sparkline, useCountUp, useMoneyHidden } from '../money';

type Range = '7' | '30' | '90';
const ACT: Record<string, { icon: string; tone: string; text: (a: any) => string; app: string }> = {
  paid: { icon: 'check', tone: 'good', text: a => `Payment received · ${a.ref}`, app: 'orders' },
  delivered: { icon: 'downloads', tone: 'good', text: a => `Delivered to ${a.who} · ${a.ref}`, app: 'orders' },
  refunded: { icon: 'undo', tone: '', text: a => `Refunded · ${a.ref}`, app: 'orders' },
  refund_requested: { icon: 'undo', tone: '', text: a => `Refund started · ${a.ref}`, app: 'orders' },
  payment_failed: { icon: 'close', tone: 'bad', text: a => `Payment failed · ${a.ref}`, app: 'orders' },
  mismatch: { icon: 'alert', tone: 'bad', text: a => `Amount mismatch, check · ${a.ref}`, app: 'orders' },
  delivery_email_failed: { icon: 'alert', tone: 'bad', text: a => `Delivery email failed · ${a.ref}`, app: 'orders' }
};
// Cards the owner can show or hide (Customize). Revenue cards are per currency.
const CARDS: { id: string; label: string }[] = [
  { id: 'rev-INR', label: 'Revenue · INR' }, { id: 'rev-USD', label: 'Revenue · USD' }, { id: 'conversion', label: 'Conversion' },
  { id: 'visitors', label: 'Visitors' }, { id: 'chart', label: 'Revenue per day' }, { id: 'top', label: 'Top items' }, { id: 'activity', label: 'Latest activity' },
  { id: 'storage', label: 'Cloudflare storage' }
];

export default function Overview({ active, open }: AppProps){
  const [range, setRange] = usePref<Range>('overview.range', '30');
  const from = todayIST(-(Number(range) - 1)), to = todayIST();
  const s = useLoad<any>(`/overview?from=${from}&to=${to}`, { pollMs: 30e3, active });
  const d = s.data;
  const currencies: string[] = useMemo(() => {
    const set = new Set<string>(['INR', 'USD']);
    d?.revenue?.forEach((r: any) => set.add(r.currency));
    return [...set];
  }, [d]);
  const [cur, setCur] = useState<string>('INR');
  const [hidden, setHidden] = useMoneyHidden();
  const [off, setOff] = usePref<string[]>('overview.hiddenCards', []);
  const [net, setNet] = usePref<boolean>('overview.net', true);
  const show = (id: string) => !off.includes(id);

  const days = useMemo(() => {
    const out: string[] = [];
    const start = new Date(from + 'T00:00:00Z');
    for (let i = 0; i < Number(range); i++){ const x = new Date(start); x.setUTCDate(x.getUTCDate() + i); out.push(x.toISOString().slice(0, 10)); }
    return out;
  }, [from, range]);
  const seriesFor = useMemo(() => (c: string) => {
    const m = new Map<string, number>();
    d?.series?.filter((r: any) => r.currency === c).forEach((r: any) => m.set(r.day, Number(r.revenue)));
    return days.map(x => m.get(x) || 0);
  }, [d, days]);
  const series = useMemo(() => seriesFor(cur), [seriesFor, cur]);
  const hour = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
  const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (s.error && !d) return <ErrorState message={s.error} retry={s.reload} />;
  const rev = (c: string) => d?.revenue?.find((r: any) => r.currency === c);
  const topMax = Math.max(1, ...(d?.top || []).map((t: any) => t.sold));
  const revCards = currencies.filter(c => show('rev-' + c));
  return (
    <div className="app-main">
      <WinTools>
        <Segmented label="Date range" value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
        <button type="button" className="icon-btn" aria-pressed={hidden} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} title={hidden ? 'Show amounts' : 'Hide amounts (for screen sharing)'} onClick={() => setHidden(!hidden)}><Icon name={hidden ? 'eyeOff' : 'eye'} /></button>
        <Customize off={off} setOff={setOff} net={net} setNet={setNet} />
        <button type="button" className="icon-btn" aria-label="Refresh" title="Refresh" onClick={s.reload}><Icon name="refresh" /></button>
      </WinTools>
      <div className="hello">
        <div><h2>{greet}, Kethan</h2><p>{d ? `${num(d.counts.paid)} paid orders and ${num(d.visitors)} visits in the last ${range} days.` : <Skeleton w={280} />}</p></div>
        <div className="row">
          <button type="button" className="btn" onClick={() => open('products', 'new')}><Icon name="plus" /> Product</button>
          <button type="button" className="btn" onClick={() => open('coupons', 'new')}><Icon name="coupons" /> Coupon</button>
          <button type="button" className="btn primary" onClick={() => open('orders')}><Icon name="orders" /> Orders</button>
        </div>
      </div>

      {(revCards.length > 0 || show('conversion') || show('visitors')) && <div className="kpis">
        {revCards.map(c => {
          const refunded = Number(rev(c)?.refunded || 0), gross = Number(rev(c)?.gross || 0);
          return (
            <Kpi key={c} mark={<CurrencyMark currency={c} size={22} />} label={`Revenue · ${c}${net ? '' : ' (gross)'}`} loading={!d} className="kpi-rev"
              value={<Money minor={net ? gross - refunded : gross} currency={c} hidden={hidden} />}
              sub={d ? <>{num(rev(c)?.orders || 0)} orders{refunded ? <> · {hidden ? MASK : money(refunded, c)} refunded</> : null}</> : ''}
              foot={d && !hidden ? <Sparkline values={seriesFor(c)} /> : null} />
          );
        })}
        {show('conversion') && <Kpi icon="orders" label="Conversion" loading={!d} value={d ? (d.conversion === null ? '—' : <CountNum value={d.conversion} suffix="%" digits={1} />) : ''} sub={d ? `${num(d.counts.paid)} of ${num(d.counts.started)} checkouts${d.counts.failedAttempts ? ` · ${d.counts.failedAttempts} failed attempts` : ''}` : ''} />}
        {show('visitors') && <Kpi icon="visitors" label="Visitors" loading={!d} value={d ? <CountNum value={d.visitors} /> : ''} sub={d ? <><span className={'live-dot' + (d.liveVisitors ? ' on' : '')} style={{ display: 'inline-block', marginRight: 6 }} />{d.liveVisitors} on the site now</> : ''} />}
      </div>}

      {(show('chart') || show('top')) && <div className={'ov-grid' + (show('chart') && show('top') ? '' : ' is-single')}>
        {show('chart') && <section className="card" aria-labelledby="ov-rev">
          <h3 id="ov-rev"><Icon name="reports" /> <span className="grow">Revenue per day</span>
            <Segmented label="Currency" value={cur} onChange={setCur} options={currencies.map(c => ({ value: c, label: c }))} /></h3>
          {d ? (series.some(v => v > 0) ? <Chart key={cur + range} labels={days} series={[{ name: cur, values: series }]} format={(v) => hidden ? MASK : money(v, cur)} height={190} />
            : <Empty icon="reports" title={`No ${cur} sales in this period`}>Sales show up here the moment a payment is confirmed.</Empty>) : <Skeleton h={190} />}
        </section>}
        {show('top') && <section className="card" aria-labelledby="ov-top">
          <h3 id="ov-top"><Icon name="star" /> <span className="grow">Top items</span></h3>
          {!d ? <div className="stack">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={28} />)}</div> : d.top.length ? (
            <ul className="list bar-list">
              {d.top.map((t: any) => (
                <li key={t.product_id + t.currency}>
                  <span className="truncate">{t.title}</span><span className="num muted">{t.sold} · {hidden ? MASK : moneyCompact(Number(t.revenue), t.currency)}</span>
                  <span className="bar" aria-hidden="true"><i style={{ width: `${(t.sold / topMax) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : <Empty icon="products" title="No sales yet">Your best sellers will rank here.</Empty>}
        </section>}
      </div>}

      {show('storage') && <StorageCard open={open} />}

      {show('activity') && <section className="card" aria-labelledby="ov-act">
        <h3 id="ov-act"><Icon name="bell" /> <span className="grow">Latest activity</span>{s.loading && d && <span className="faint" style={{ fontSize: 12 }}>Updating…</span>}</h3>
        {!d ? <div className="stack">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={30} />)}</div> : d.activity.length ? (
          <ul className="list activity">
            {d.activity.map((a: any, i: number) => {
              const k = a.kind === 'order' ? ACT[a.what] : null;
              const text = k ? k.text(a) : a.kind === 'message' ? `Message from ${a.who || 'someone'}: ${a.ref || '(no subject)'}` : `Notify-me signup · ${a.ref}`;
              const app = k ? k.app : a.kind === 'message' ? 'messages' : 'content';
              return (
                <li key={a.kind + (a.target || '') + a.what + a.at}>
                  <span className={'act-ic ' + (k?.tone || (a.kind === 'message' ? 'acc' : ''))}><Icon name={k?.icon || (a.kind === 'message' ? 'messages' : 'mail')} size={14} /></span>
                  <button type="button" className="btn ghost truncate" style={{ flex: 1, justifyContent: 'flex-start', padding: 0, height: 'auto', fontWeight: 500 }} onClick={() => open(app, a.kind === 'signup' ? 'notify' : a.target || '')}>{text}</button>
                  {a.kind === 'message' && a.what === 'new' && <Badge tone="accent">new</Badge>}
                  <time className="faint num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{ago(a.at)}</time>
                </li>
              );
            })}
          </ul>
        ) : <Empty icon="bell" title="All quiet">New orders, messages and signups appear here live.</Empty>}
      </section>}
      {CARDS.every(c => off.includes(c.id)) && <Empty icon="eyeOff" title="Every card is hidden" action={<button type="button" className="btn" onClick={() => setOff([])}>Show all cards</button>}>Choose what to show from the Customize menu.</Empty>}
    </div>
  );
}

function Kpi({ icon, mark, label, value, sub, foot, loading, className }: { icon?: string; mark?: React.ReactNode; label: string; value: React.ReactNode; sub: React.ReactNode; foot?: React.ReactNode; loading: boolean; className?: string }){
  return (
    <div className={'kpi' + (className ? ' ' + className : '')}>
      <div className="kpi-label">{mark || (icon && <Icon name={icon} size={13} />)}{label}</div>
      <div className="kpi-value">{loading ? <Skeleton w="70%" h={28} /> : value}</div>
      <div className="kpi-sub">{loading ? <Skeleton w="50%" h={12} /> : sub}</div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

function CountNum({ value, suffix = '', digits = 0 }: { value: number; suffix?: string; digits?: number }){
  const v = useCountUp(Number(value) || 0);
  const text = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(digits ? n : Math.round(n)) + suffix;
  return <span className="num"><span aria-hidden="true">{text(v)}</span><span className="sr-only">{text(Number(value) || 0)}</span></span>;
}

// Customize: which cards show, and whether revenue is net of refunds. A small menu in the window bar.
function Customize({ off, setOff, net, setNet }: { off: string[]; setOff: (v: string[]) => void; net: boolean; setNet: (v: boolean) => void }){
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null), btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape'){ e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true);
    requestAnimationFrame(() => box.current?.querySelector<HTMLButtonElement>('.menu-item')?.focus());
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); };
  }, [open]);
  const toggle = (id: string) => setOff(off.includes(id) ? off.filter(x => x !== id) : [...off, id]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab'){ setOpen(false); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(box.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') || [])], i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return (
    <span className="pop-anchor" ref={box}>
      <button ref={btn} type="button" className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Customize" title="Customize cards" onClick={() => setOpen(!open)}><Icon name="grid" /></button>
      {open && <div className="menu-pop is-right" role="menu" aria-label="Customize the overview" onKeyDown={onKey}>
        <div className="menu-head" role="presentation">Show</div>
        {CARDS.map(c => <button key={c.id} type="button" role="menuitemcheckbox" aria-checked={!off.includes(c.id)} className="menu-item" onClick={() => toggle(c.id)}>
          <span className="menu-check">{!off.includes(c.id) ? <Icon name="check" size={13} /> : null}</span><span className="menu-label">{c.label}</span></button>)}
        <div className="menu-sep" role="separator" />
        <div className="menu-head" role="presentation">Revenue counts</div>
        {[{ v: true, l: 'Net (after refunds)' }, { v: false, l: 'Gross (before refunds)' }].map(o => <button key={String(o.v)} type="button" role="menuitemradio" aria-checked={net === o.v} className="menu-item" onClick={() => setNet(o.v)}>
          <span className="menu-check">{net === o.v ? <Icon name="check" size={13} /> : null}</span><span className="menu-label">{o.l}</span></button>)}
        <div className="menu-sep" role="separator" />
        <button type="button" role="menuitem" className="menu-item" disabled={!off.length && net} onClick={() => { setOff([]); setNet(true); }}><span className="menu-check" /><span className="menu-label">Reset to default</span></button>
      </div>}
    </span>
  );
}

// How much of Cloudflare's free plan is used: file storage (R2, 10 GB) and the database (D1, 500 MB). Measured on the
// server every few hours; Refresh measures again now.
type UsageItem = { key: string; label: string; used: number | null; limit: number; ratio: number | null };
const gb = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(0, Math.round(n / 1024))} KB`;
function StorageCard({ open }: { open: AppProps['open'] }){
  const [fresh, setFresh] = useState(0);
  const u = useLoad<{ items: UsageItem[]; level: string; measuredAt: string }>(`/usage${fresh ? '?fresh=1&n=' + fresh : ''}`);
  const items = u.data?.items || [];
  const used = items.reduce((a, i) => a + (i.used || 0), 0), total = items.reduce((a, i) => a + i.limit, 0);
  return (
    <section className="card storage-card" aria-labelledby="ov-st">
      <h3 id="ov-st"><Icon name="downloads" /> <span className="grow">Cloudflare storage <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>free plan</span></span>
        <button type="button" className="icon-btn" aria-label="Measure again" title="Measure again" onClick={() => setFresh(Date.now())}><Icon name="refresh" /></button></h3>
      {u.error && !u.data ? <p className="field-error">{u.error}</p> : !u.data ? <div className="stack">{[0, 1].map(i => <Skeleton key={i} h={44} />)}</div> : <>
        <p className="storage-total"><b className="num">{gb(used)}</b> used of <span className="num">{gb(total)}</span> free <span className="faint">({items.map(i => `${gb(i.limit)} ${i.key === 'files' ? 'files' : 'database'}`).join(' + ')})</span></p>
        <ul className="storage-list">
          {items.map(i => {
            const pct = i.used === null ? 0 : Math.min(100, (i.used / i.limit) * 100);
            const tone = pct >= 95 ? 'bad' : pct >= 80 ? 'warn' : 'ok';
            return (
              <li key={i.key}>
                <div className="row between"><span>{i.key === 'files' ? 'Files (R2)' : 'Database (D1)'} <span className="faint">· {i.label.replace(/^[^(]*\(|\)$/g, '')}</span></span>
                  <span className="num">{i.used === null ? '—' : gb(i.used)} <span className="faint">of {gb(i.limit)}</span></span></div>
                <span className={'storage-bar is-' + tone} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={`${i.key === 'files' ? 'File storage' : 'Database'} used`}><i style={{ width: `${Math.max(pct, i.used ? 1.5 : 0)}%` }} /></span>
                <div className="row between faint" style={{ fontSize: 12 }}><span>{pct < 1 && i.used ? '<1' : Math.round(pct)}% used</span><span>{i.used === null ? '' : `${gb(Math.max(0, i.limit - i.used))} free`}</span></div>
              </li>
            );
          })}
        </ul>
        <p className="faint" style={{ fontSize: 12, margin: 0 }}>Measured {ago(u.data.measuredAt)}. <button type="button" className="btn sm ghost" onClick={() => open('settings', 'system')}>Details in System status</button></p>
      </>}
    </section>
  );
}
