// Orders: search and filter, detail with timeline, resend links/receipt, invoice, refunds, CSV export.
import { useEffect, useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useDebounced, useLoad, usePref } from '../hooks';
import { downloadFile, post } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Modal, Segmented, SkeletonRows, STATUS_TONE, Switch, VirtualTable, useConfirm, useToast, SearchBox } from '../ui';
import type { Column } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { Copy, DetailHeader, MoneyInput } from './common';
import { ago, dateTime, money, todayIST } from '../format';

type Order = { id: string; public_id: string; email: string; currency: 'INR' | 'USD'; subtotal: number; discount: number; tax: number; total: number; status: string; is_free: boolean;
  invoice_number: number | null; country: string | null; created_at: string; paid_at: string | null; delivered_at: string | null; refunded_at: string | null; razorpay_payment_id: string | null; refund_id: string | null; items: string; codes: string | null;
  payment_method: PayMethod | null };
type PayMethod = { type: string; network?: string; last4?: string; detail?: string };
// "Visa •••• 4242", "UPI", "Net banking · HDFC"
function paidWith(m: PayMethod | null | undefined){
  if (!m) return '';
  if (m.type === 'card') return `${m.network || 'Card'}${m.last4 ? ` •••• ${m.last4}` : ''}`;
  const name = ({ upi: 'UPI', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay later' } as Record<string, string>)[m.type] || m.type;
  return m.detail ? `${name} · ${m.detail}` : name;
}
const STATUSES = ['all', 'attention', 'delivered', 'paid', 'refunded', 'failed', 'created', 'expired', 'cancelled', 'mismatch'];
const PAGE = 200;

export default function Orders({ route, go, active, open }: AppProps){
  const [exporting, setExporting] = useState(route === 'export');
  useEffect(() => { if (route === 'export'){ setExporting(true); go(''); } }, [route, go]);
  const list = route && route !== 'export' && route !== 'attention' ? null : <List go={go} active={active} initialStatus={route === 'attention' ? 'attention' : undefined} onExport={() => setExporting(true)} />;
  return <>
    {list || <Detail id={route} go={go} open={open} />}
    {exporting && <ExportDialog onClose={() => setExporting(false)} />}
  </>;
}

function List({ go, active, initialStatus, onExport }: { go: (r: string) => void; active: boolean; initialStatus?: string; onExport: () => void }){
  const [status, setStatus] = usePref('orders.status', 'all');
  const [currency, setCurrency] = usePref<'all' | 'INR' | 'USD'>('orders.currency', 'all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { if (initialStatus) setStatus(initialStatus); }, [initialStatus, setStatus]);
  const qs = new URLSearchParams({ limit: String(limit) });
  if (status !== 'all') qs.set('status', status);
  if (currency !== 'all') qs.set('currency', currency);
  if (dq.trim()) qs.set('q', dq.trim());
  const s = useLoad<{ orders: Order[]; total: number; hasMore: boolean }>(`/orders?${qs}`, { pollMs: 30e3, active });
  const cols: Column<Order>[] = useMemo(() => [
    { key: 'id', label: 'Order', width: '124px', render: o => <span className="mono">{o.public_id}</span>, sort: (a, b) => a.public_id.localeCompare(b.public_id) },
    { key: 'buyer', label: 'Buyer', width: '1.6fr', render: o => <span className="truncate" title={o.email}>{o.email}</span>, sort: (a, b) => a.email.localeCompare(b.email), hideBelow: 480 },
    { key: 'items', label: 'Items', width: '1.5fr', render: o => <span className="truncate muted">{o.items}</span>, hideBelow: 820 },
    { key: 'total', label: 'Total', width: '110px', align: 'right', render: o => o.is_free ? <span className="muted">Free</span> : money(o.total, o.currency), sort: (a, b) => a.currency.localeCompare(b.currency) || a.total - b.total },
    { key: 'paid', label: 'Paid with', width: '1fr', hideBelow: 980, render: o => <span className="truncate muted">{paidWith(o.payment_method) || (o.is_free ? 'Free' : '—')}</span> },
    { key: 'status', label: 'Status', width: '104px', render: o => <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>, sort: (a, b) => a.status.localeCompare(b.status) },
    { key: 'date', label: 'Created', width: '118px', render: o => <span className="muted" title={dateTime(o.created_at)}>{ago(o.created_at)}</span>, sort: (a, b) => a.created_at.localeCompare(b.created_at), hideBelow: 620 }
  ], []);
  return (
    <div className="app">
      <WinTools><button type="button" className="btn sm" onClick={onExport}><Icon name="downloads" /> Export</button></WinTools>
      <div className="app-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Order, email or payment ID" label="Search orders" />
        <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value)} style={{ width: 'auto' }}>
          {STATUSES.map(x => <option key={x} value={x}>{x === 'all' ? 'All statuses' : x === 'attention' ? 'Needs attention' : x[0].toUpperCase() + x.slice(1)}</option>)}
        </select>
        <Segmented label="Currency" value={currency} onChange={setCurrency} options={[{ value: 'all', label: 'All' }, { value: 'INR', label: '₹ INR' }, { value: 'USD', label: '$ USD' }]} />
      </div>
      <div className="app-main fill">
        {s.error && !s.data ? <ErrorState message={s.error} retry={s.reload} /> : !s.data ? <SkeletonRows rows={10} cols={5} /> : (
          <VirtualTable label="Orders" rows={s.data.orders} columns={cols} rowKey={o => o.id} onOpen={o => go(o.id)}
            empty={<Empty icon="orders" title={q || status !== 'all' ? 'No orders match' : 'No orders yet'}>{q || status !== 'all' ? 'Clear the filters to see everything.' : 'Orders appear here the moment a checkout starts.'}</Empty>}
            footer={<><span>{s.data.orders.length} of {s.data.total}</span>{s.data.hasMore && <button type="button" className="btn sm" onClick={() => setLimit(l => l + PAGE)}>Load more</button>}<span className="grow" />{s.loading && <span>Updating…</span>}</>} />
        )}
      </div>
    </div>
  );
}

function Detail({ id, go, open }: { id: string; go: (r: string) => void; open: AppProps['open'] }){
  const s = useLoad<any>(`/orders/${id}`);
  const toast = useToast();
  const confirm = useConfirm();
  const [refunding, setRefunding] = useState(false);
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <div className="pad"><SkeletonRows rows={10} /></div>;
  const { order: o, items, events, downloads, links } = s.data;
  const paid = o.status === 'paid' || o.status === 'delivered';
  return (
    <div className="app-main">
      <DetailHeader back={() => go('')} title={<span className="mono">{o.public_id}</span>} meta={<><Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge><span className="faint">{dateTime(o.created_at)}</span></>}>
        {paid && <AsyncButton className="btn sm" onClick={async () => { if (await confirm({ title: 'Send fresh download links?', body: `New links go to ${o.email}. Earlier links keep working until they expire.`, confirm: 'Send links' })){ await post(`/orders/${o.id}/resend`); toast.show('Links sent', { tone: 'success' }); s.reload(); } }}><Icon name="send" /> Resend links</AsyncButton>}
        {o.invoice_number && <AsyncButton className="btn sm ghost" onClick={async () => { await post(`/orders/${o.id}/receipt`); toast.show('Receipt sent', { tone: 'success' }); }}><Icon name="mail" /> Email receipt</AsyncButton>}
        {o.invoice_number && <a className="btn sm ghost" href={`/api/admin/orders/${o.id}/invoice`} target="_blank" rel="noopener"><Icon name="file" /> Invoice</a>}
        {paid && !o.is_free && !o.refund_id && <button type="button" className="btn sm ghost" onClick={() => setRefunding(true)}><Icon name="undo" /> Refund</button>}
      </DetailHeader>

      <div className="editor-grid">
        <div className="stack-lg">
          <section className="card" aria-labelledby="od-items"><h3 id="od-items">Items</h3>
            <ul className="list">{items.map((i: any) => (
              <li key={i.id}><span className="grow truncate"><b>{i.title}</b>{i.license_key && <span className="faint"> · {i.license_key} license v{i.license_version}</span>}</span>
                {i.discount > 0 && <span className="faint num"><s>{money(i.unit_price, o.currency)}</s></span>}<span className="num">{money(i.total, o.currency)}</span>
                {i.product_id && <button type="button" className="icon-btn sm" aria-label="Open product" onClick={() => open('products', i.product_id)}><Icon name="external" size={13} /></button>}</li>
            ))}</ul>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Subtotal</dt><dd className="num">{money(o.subtotal, o.currency)}</dd>
              {o.discount > 0 && <><dt>Discount{o.codes ? ` (${o.codes})` : ''}</dt><dd className="num">−{money(o.discount, o.currency)}</dd></>}
              {o.tax > 0 && <><dt>Tax</dt><dd className="num">{money(o.tax, o.currency)}</dd></>}
              <dt><b>Total</b></dt><dd className="num"><b>{o.is_free ? 'Free' : money(o.total, o.currency)}</b></dd>
              {o.refund_amount > 0 && <><dt>Refunded</dt><dd className="num">{money(o.refund_amount, o.currency)}</dd></>}
            </dl>
          </section>

          <section className="card" aria-labelledby="od-links"><h3 id="od-links">Download links</h3>
            {!links.length ? <p className="muted">No links issued.</p> : (
              <ul className="list">{links.map((l: any) => (
                <li key={l.id}><Badge tone={STATUS_TONE[l.state]}>{l.state}</Badge><span className="grow truncate">{l.title} <span className="faint">· via {l.channel}</span></span>
                  <span className="num muted">{l.download_count}/{l.max_downloads}</span><span className="faint" style={{ fontSize: 12 }}>until {dateTime(l.expires_at)}</span>
                  {l.state === 'active' && <AsyncButton className="btn sm ghost" onClick={async () => { if (await confirm({ title: 'Revoke this link?', body: 'It stops working immediately. You can send fresh links any time.', confirm: 'Revoke', danger: true })){ await post(`/links/${l.id}/revoke`); s.reload(); } }}>Revoke</AsyncButton>}</li>
              ))}</ul>
            )}
            {downloads.length > 0 && <>
              <h3 style={{ marginTop: 16 }}>Downloads</h3>
              <ul className="list">{downloads.map((d: any, i: number) => (
                <li key={i}><Icon name="downloads" size={14} /><span className="grow truncate">{d.title || 'File'}</span><span className="faint mono" style={{ fontSize: 12 }}>{d.ip || ''}{d.country ? ` · ${d.country}` : ''}</span><span className="faint" style={{ fontSize: 12 }}>{dateTime(d.created_at)}</span></li>
              ))}</ul>
            </>}
          </section>
        </div>

        <aside className="stack">
          <dl className="kv card">
            <dt>Buyer</dt><dd><span className="row" style={{ gap: 4 }}><span className="truncate">{o.email}</span><Copy text={o.email} label="Copy email" /></span></dd>
            <dt>Country</dt><dd>{o.country || '—'}</dd>
            <dt>Currency</dt><dd>{o.currency}</dd>
            <dt>Paid with</dt><dd>{paidWith(o.payment_method) || (o.is_free ? 'Free order' : '—')}</dd>
            {o.razorpay_payment_id && <><dt>Payment</dt><dd><span className="row" style={{ gap: 4 }}><span className="mono truncate" style={{ fontSize: 12 }}>{o.razorpay_payment_id}</span><Copy text={o.razorpay_payment_id} label="Copy payment ID" /></span></dd></>}
            {o.invoice_number && <><dt>Invoice</dt><dd className="mono">INV-{String(o.invoice_number).padStart(6, '0')}</dd></>}
            <dt>Verified</dt><dd>{o.signature_verified_at ? 'Signature ✓ ' : ''}{o.api_verified_at ? 'API ✓ ' : ''}{o.captured_at ? 'Captured ✓' : o.is_free ? 'Free order' : '—'}</dd>
          </dl>
          <section className="card" aria-labelledby="od-tl"><h3 id="od-tl">Timeline</h3>
            <ol className="timeline">{events.map((e: any, i: number) => (
              <li key={i} className={/failed|mismatch/.test(e.type) ? 'bad' : /paid|delivered/.test(e.type) ? 'good' : ''}>
                <span className="tl-dot" aria-hidden="true" /><span className="tl-what">{e.type.replace(/_/g, ' ')}</span><time className="faint">{dateTime(e.created_at)}</time>
              </li>
            ))}</ol>
          </section>
        </aside>
      </div>
      {refunding && <RefundDialog order={o} onClose={() => setRefunding(false)} onDone={() => { setRefunding(false); s.reload(); }} />}
    </div>
  );
}

function RefundDialog({ order, onClose, onDone }: { order: any; onClose: () => void; onDone: () => void }){
  const toast = useToast();
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState<number | null>(order.total);
  const [reason, setReason] = useState('');
  const [needsOk, setNeedsOk] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const min = 100;   // the smallest refund a card can take (₹1 / $1)
  const bad: string | null = full ? null : (amount === null ? 'Enter an amount.' : amount > order.total ? `That’s more than the order total (${money(order.total, order.currency)}).` : amount < min ? `The smallest refund is ${money(min, order.currency)}.` : null);
  const submit = async () => {
    try {
      const r = await post<{ amount: number }>(`/orders/${order.id}/refund`, { amount: full ? undefined : amount, reason, confirmAfterDownload: ok });
      toast.show(`Refund of ${money(r.amount, order.currency)} started. Razorpay confirms it in a few minutes.`, { tone: 'success', ms: 7000 });
      onDone();
    } catch (e: any){
      if (e.code === 'refund_needs_confirmation'){ setNeedsOk(e.message); return; }
      throw e;
    }
  };
  return (
    <Modal title={`Refund ${order.public_id}`} onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <AsyncButton className="btn danger" disabled={(!!needsOk && !ok) || !!bad} onClick={submit}>Refund {full ? money(order.total, order.currency) : amount ? money(amount, order.currency) : ''}</AsyncButton>
    </>}>
      <p className="muted">Money goes back to the buyer’s original payment method. Their download links stop working right away.</p>
      <Switch checked={full} onChange={setFull} label="Refund the full amount" />
      {!full && <Field label={`Amount (up to ${money(order.total, order.currency)})`} error={amount !== null ? bad : null}><MoneyInput currency={order.currency} label="Refund amount" value={amount} onChange={setAmount} /></Field>}
      <Field label="Reason (kept in Razorpay notes)"><input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Optional" /></Field>
      {needsOk && <div className="notice warn" role="alert"><Icon name="alert" /> <div>{needsOk}<Switch checked={ok} onChange={setOk} label="Refund anyway" /></div></div>}
    </Modal>
  );
}

function ExportDialog({ onClose }: { onClose: () => void }){
  const [from, setFrom] = useState(todayIST(-29));
  const [to, setTo] = useState(todayIST());
  const [status, setStatus] = useState('all');
  const toast = useToast();
  return (
    <Modal title="Export orders" onClose={onClose} footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <AsyncButton className="btn primary" onClick={async () => {
        const qs = new URLSearchParams({ from, to }); if (status !== 'all') qs.set('status', status);
        await downloadFile(`/orders.csv?${qs}`, `orders-${from}-to-${to}.csv`);
        toast.show('CSV downloaded', { tone: 'success' }); onClose();
      }}><Icon name="downloads" /> Download CSV</AsyncButton>
    </>}>
      <div className="form-grid">
        <Field label="From"><input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} /></Field>
        <Field label="To"><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></Field>
      </div>
      <Field label="Status"><select value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(x => <option key={x} value={x}>{x === 'all' ? 'All statuses' : x}</option>)}</select></Field>
      <p className="field-hint">Opens in Excel, Numbers or Google Sheets. Amounts are in each order’s own currency; cells that start with = + - @ are made safe.</p>
    </Modal>
  );
}
