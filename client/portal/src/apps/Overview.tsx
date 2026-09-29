// Overview: today's picture. Money is shown per currency (INR and USD are never added together).
import { useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad, usePref } from '../hooks';
import { Chart, Empty, ErrorState, Segmented, Skeleton, Badge } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { money, moneyCompact, num, ago, todayIST } from '../format';

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

  const days = useMemo(() => {
    const out: string[] = [];
    const start = new Date(from + 'T00:00:00Z');
    for (let i = 0; i < Number(range); i++){ const x = new Date(start); x.setUTCDate(x.getUTCDate() + i); out.push(x.toISOString().slice(0, 10)); }
    return out;
  }, [from, range]);
  const series = useMemo(() => {
    const m = new Map<string, number>();
    d?.series?.filter((r: any) => r.currency === cur).forEach((r: any) => m.set(r.day, Number(r.revenue)));
    return days.map(x => m.get(x) || 0);
  }, [d, cur, days]);
  const hour = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(new Date()));
  const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  if (s.error && !d) return <ErrorState message={s.error} retry={s.reload} />;
  const rev = (c: string) => d?.revenue?.find((r: any) => r.currency === c);
  const topMax = Math.max(1, ...(d?.top || []).map((t: any) => t.sold));
  return (
    <div className="app-main">
      <WinTools>
        <Segmented label="Date range" value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
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

      <div className="kpis" aria-live="polite">
        {currencies.map(c => (
          <Kpi key={c} icon={c === 'INR' ? 'reports' : 'visitors'} label={`Revenue · ${c}`} loading={!d}
            value={d ? money(Number(rev(c)?.gross || 0) - Number(rev(c)?.refunded || 0), c) : ''}
            sub={d ? `${num(rev(c)?.orders || 0)} orders${Number(rev(c)?.refunded) ? ` · ${money(rev(c).refunded, c)} refunded` : ''}` : ''} />
        ))}
        <Kpi icon="orders" label="Conversion" loading={!d} value={d ? (d.conversion === null ? '—' : `${d.conversion}%`) : ''} sub={d ? `${num(d.counts.paid)} of ${num(d.counts.started)} checkouts${d.counts.failedAttempts ? ` · ${d.counts.failedAttempts} failed attempts` : ''}` : ''} />
        <Kpi icon="visitors" label="Visitors" loading={!d} value={d ? num(d.visitors) : ''} sub={d ? <><span className={'live-dot' + (d.liveVisitors ? ' on' : '')} style={{ display: 'inline-block', marginRight: 6 }} />{d.liveVisitors} on the site now</> : ''} />
      </div>

      <div className="ov-grid">
        <section className="card" aria-labelledby="ov-rev">
          <h3 id="ov-rev"><Icon name="reports" /> <span className="grow">Revenue per day</span>
            <Segmented label="Currency" value={cur} onChange={setCur} options={currencies.map(c => ({ value: c, label: c }))} /></h3>
          {d ? (series.some(v => v > 0) ? <Chart labels={days} series={[{ name: cur, values: series }]} format={(v) => money(v, cur)} height={190} />
            : <Empty icon="reports" title={`No ${cur} sales in this period`}>Sales show up here the moment a payment is confirmed.</Empty>) : <Skeleton h={190} />}
        </section>
        <section className="card" aria-labelledby="ov-top">
          <h3 id="ov-top"><Icon name="star" /> <span className="grow">Top items</span></h3>
          {!d ? <div className="stack">{[0, 1, 2, 3].map(i => <Skeleton key={i} h={28} />)}</div> : d.top.length ? (
            <ul className="list bar-list">
              {d.top.map((t: any) => (
                <li key={t.product_id + t.currency}>
                  <span className="truncate">{t.title}</span><span className="num muted">{t.sold} · {moneyCompact(Number(t.revenue), t.currency)}</span>
                  <span className="bar" aria-hidden="true"><i style={{ width: `${(t.sold / topMax) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          ) : <Empty icon="products" title="No sales yet">Your best sellers will rank here.</Empty>}
        </section>
      </div>

      <section className="card" aria-labelledby="ov-act">
        <h3 id="ov-act"><Icon name="bell" /> <span className="grow">Latest activity</span>{s.loading && d && <span className="faint" style={{ fontSize: 12 }}>Updating…</span>}</h3>
        {!d ? <div className="stack">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} h={30} />)}</div> : d.activity.length ? (
          <ul className="list activity">
            {d.activity.map((a: any, i: number) => {
              const k = a.kind === 'order' ? ACT[a.what] : null;
              const text = k ? k.text(a) : a.kind === 'message' ? `Message from ${a.who || 'someone'}: ${a.ref || '(no subject)'}` : `Notify-me signup · ${a.ref}`;
              const app = k ? k.app : a.kind === 'message' ? 'messages' : 'content';
              return (
                <li key={i}>
                  <span className={'act-ic ' + (k?.tone || (a.kind === 'message' ? 'acc' : ''))}><Icon name={k?.icon || (a.kind === 'message' ? 'messages' : 'mail')} size={14} /></span>
                  <button type="button" className="btn ghost truncate" style={{ flex: 1, justifyContent: 'flex-start', padding: 0, height: 'auto', fontWeight: 500 }} onClick={() => open(app, a.kind === 'signup' ? 'notify' : '')}>{text}</button>
                  {a.kind === 'message' && a.what === 'new' && <Badge tone="accent">new</Badge>}
                  <time className="faint num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{ago(a.at)}</time>
                </li>
              );
            })}
          </ul>
        ) : <Empty icon="bell" title="All quiet">New orders, messages and signups appear here live.</Empty>}
      </section>
    </div>
  );
}

function Kpi({ icon, label, value, sub, loading }: { icon: string; label: string; value: string; sub: React.ReactNode; loading: boolean }){
  return (
    <div className="kpi">
      <div className="kpi-label"><Icon name={icon} size={13} />{label}</div>
      <div className="kpi-value">{loading ? <Skeleton w="70%" h={28} /> : value}</div>
      <div className="kpi-sub">{loading ? <Skeleton w="50%" h={12} /> : sub}</div>
    </div>
  );
}
