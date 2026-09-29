// Coupons: create/edit with all rules, pause (optimistic), duplicate, usage, delete (unused only, with Undo).
import { useEffect, useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad } from '../hooks';
import { del, post, put } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Modal, Segmented, SkeletonRows, Switch, VirtualTable, useConfirm, useToast, SearchBox } from '../ui';
import type { Column } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { DateTimeInput, MoneyInput } from './common';
import { dateTime, money, pct } from '../format';

type Coupon = { id: string; code: string; description: string; kind: 'percent' | 'fixed'; percent_bp: number | null; amount_inr: number | null; amount_usd: number | null;
  currencies: string[]; starts_at: string | null; ends_at: string | null; max_uses: number | null; per_email_limit: number | null; first_order_only: boolean;
  min_order_inr: number; min_order_usd: number; max_discount_inr: number | null; max_discount_usd: number | null; applies_to: string; product_ids: string[]; category_id: string | null;
  stackable: boolean; paused: boolean; confirmed_uses: number; given: { currency: string; discount: number }[] | null; created_at: string };
type Form = { code: string; description: string; kind: 'percent' | 'fixed'; percent: string; amountInr: number | null; amountUsd: number | null; currencies: string[];
  startsAt: string; endsAt: string; maxUses: string; perEmailLimit: string; firstOrderOnly: boolean; minOrderInr: number | null; minOrderUsd: number | null;
  maxDiscountInr: number | null; maxDiscountUsd: number | null; appliesTo: string; productIds: string[]; categoryId: string; stackable: boolean; paused: boolean };

function state(c: Coupon){
  const now = Date.now();
  if (c.paused) return ['paused', 'neutral'] as const;
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return ['ended', 'neutral'] as const;
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return ['scheduled', 'info'] as const;
  if (c.max_uses !== null && c.confirmed_uses >= c.max_uses) return ['used up', 'warning'] as const;
  return ['active', 'success'] as const;
}
const value = (c: Coupon) => c.kind === 'percent' ? `${pct(c.percent_bp || 0)} off` : [c.amount_inr ? money(c.amount_inr, 'INR') : '', c.amount_usd ? money(c.amount_usd, 'USD') : ''].filter(Boolean).join(' / ') + ' off';

export default function Coupons({ route, go }: AppProps){
  const s = useLoad<{ coupons: Coupon[] }>('/coupons');
  const toast = useToast();
  const [editing, setEditing] = useState<Coupon | 'new' | { copy: Coupon } | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (route === 'new'){ setEditing('new'); go(''); }
    else if (route && s.data){ const c = s.data.coupons.find(x => x.id === route); if (c){ setEditing(c); go(''); } }
  }, [route, s.data, go]);
  const rows = useMemo(() => (s.data?.coupons || []).filter(c => !q || (c.code + ' ' + c.description).toLowerCase().includes(q.toLowerCase())), [s.data, q]);

  const togglePause = async (c: Coupon) => {
    const prev = s.data!;
    s.setData({ coupons: prev.coupons.map(x => x.id === c.id ? { ...x, paused: !c.paused } : x) });
    try { s.setData(await post(`/coupons/${c.id}/pause`, { paused: !c.paused })); toast.show(c.paused ? `${c.code} is active again` : `${c.code} paused`, { tone: 'success' }); }
    catch (e){ s.setData(prev); toast.error(e); }
  };
  const remove = (c: Coupon) => {
    const prev = s.data!;
    s.setData({ coupons: prev.coupons.filter(x => x.id !== c.id) });
    toast.undoable(`Deleted ${c.code}`, async () => { s.setData(await del(`/coupons/${c.id}`)); }, () => s.setData(prev));
  };

  const cols: Column<Coupon>[] = [
    { key: 'code', label: 'Code', width: '1.2fr', render: c => <span className="mono" style={{ fontWeight: 700 }}>{c.code}</span>, sort: (a, b) => a.code.localeCompare(b.code) },
    { key: 'value', label: 'Discount', width: '1.3fr', render: c => <span className="truncate">{value(c)}</span> },
    { key: 'uses', label: 'Used', width: '90px', align: 'right', render: c => <span className="num">{c.confirmed_uses}{c.max_uses !== null ? ` / ${c.max_uses}` : ''}</span>, sort: (a, b) => a.confirmed_uses - b.confirmed_uses },
    { key: 'given', label: 'Given away', width: '1.2fr', hideBelow: 760, render: c => <span className="muted truncate">{c.given?.map(g => money(Number(g.discount), g.currency)).join(' · ') || '—'}</span> },
    { key: 'state', label: 'Status', width: '100px', render: c => { const [t, tone] = state(c); return <Badge tone={tone}>{t}</Badge>; } },
    { key: 'actions', label: '', width: '92px', align: 'right', render: c => (
      <span className="row" style={{ gap: 0, justifyContent: 'flex-end' }}>
        <button type="button" className="icon-btn sm" aria-label={c.paused ? `Resume ${c.code}` : `Pause ${c.code}`} title={c.paused ? 'Resume' : 'Pause'} onClick={() => togglePause(c)}><Icon name={c.paused ? 'play' : 'pause'} size={13} /></button>
        <button type="button" className="icon-btn sm" aria-label={`Duplicate ${c.code}`} title="Duplicate" onClick={() => setEditing({ copy: c })}><Icon name="copy" size={13} /></button>
        <button type="button" className="icon-btn sm" aria-label={`Delete ${c.code}`} title={c.confirmed_uses ? 'Used codes can only be paused' : 'Delete'} disabled={c.confirmed_uses > 0} onClick={() => remove(c)}><Icon name="trash" size={13} /></button>
      </span>) }
  ];
  return (
    <div className="app">
      <WinTools><button type="button" className="btn primary sm" onClick={() => setEditing('new')}><Icon name="plus" /> New code</button></WinTools>
      <div className="app-toolbar"><SearchBox value={q} onChange={setQ} placeholder="Search codes" label="Search coupons" /></div>
      <div className="app-main fill">
        {s.error && !s.data ? <ErrorState message={s.error} retry={s.reload} /> : !s.data ? <SkeletonRows rows={6} /> : (
          <VirtualTable label="Coupons" rows={rows} columns={cols} rowKey={c => c.id} onOpen={c => setEditing(c)}
            empty={<Empty icon="coupons" title="No codes yet" action={<button type="button" className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" /> Create a code</button>}>Percent or fixed discounts, with limits, dates and which items they apply to.</Empty>} />
        )}
      </div>
      {editing && <Editor coupon={editing} onClose={() => setEditing(null)} onSaved={(d) => { s.setData(d); setEditing(null); }} />}
    </div>
  );
}

function toForm(c: Coupon | null, copy = false): Form {
  const local = (v: string | null) => v ? new Date(new Date(v).getTime() + 330 * 60e3).toISOString().slice(0, 16) : '';
  if (!c) return { code: '', description: '', kind: 'percent', percent: '10', amountInr: null, amountUsd: null, currencies: ['INR', 'USD'], startsAt: '', endsAt: '', maxUses: '', perEmailLimit: '1',
    firstOrderOnly: false, minOrderInr: null, minOrderUsd: null, maxDiscountInr: null, maxDiscountUsd: null, appliesTo: 'all', productIds: [], categoryId: '', stackable: false, paused: false };
  return { code: copy ? (c.code.slice(0, 31) + '2') : c.code, description: c.description, kind: c.kind, percent: c.percent_bp ? String(c.percent_bp / 100) : '', amountInr: c.amount_inr, amountUsd: c.amount_usd,
    currencies: c.currencies, startsAt: local(c.starts_at), endsAt: local(c.ends_at), maxUses: c.max_uses?.toString() || '', perEmailLimit: c.per_email_limit?.toString() || '',
    firstOrderOnly: c.first_order_only, minOrderInr: c.min_order_inr || null, minOrderUsd: c.min_order_usd || null, maxDiscountInr: c.max_discount_inr, maxDiscountUsd: c.max_discount_usd,
    appliesTo: c.applies_to, productIds: c.product_ids || [], categoryId: c.category_id || '', stackable: c.stackable, paused: copy ? false : c.paused };
}

function Editor({ coupon, onClose, onSaved }: { coupon: Coupon | 'new' | { copy: Coupon }; onClose: () => void; onSaved: (d: { coupons: Coupon[] }) => void }){
  const existing = coupon !== 'new' && !('copy' in coupon) ? coupon : null;
  const [f, setF] = useState<Form>(() => coupon === 'new' ? toForm(null) : 'copy' in coupon ? toForm(coupon.copy, true) : toForm(coupon));
  const [start] = useState(() => JSON.stringify(f));
  const dirty = JSON.stringify(f) !== start;
  const confirm = useConfirm();
  // Esc, the ✕ and a click outside ask first when there are unsaved changes
  const close = async () => { if (!dirty || await confirm({ title: 'Discard this code?', body: 'Your changes haven’t been saved.', confirm: 'Discard', danger: true })) onClose(); };
  const [tab, setTab] = useState<'rules' | 'uses'>('rules');
  const products = useLoad<{ products: { id: string; title: string; kind: string }[] }>(f.appliesTo === 'products' ? '/products' : null);
  const cats = useLoad<{ categories: { id: string; name: string; kind: string }[] }>(f.appliesTo === 'category' ? '/categories' : null);
  const uses = useLoad<{ uses: any[] }>(existing && tab === 'uses' ? `/coupons/${existing.id}/uses` : null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(x => ({ ...x, [k]: v }));
  const iso = (v: string) => v ? new Date(v + ':00+05:30').toISOString() : null;
  // the rules the server also enforces, explained before anything is sent
  const problem = (() => {
    if (f.code.length < 3) return 'The code needs at least 3 characters.';
    if (!f.currencies.length) return 'Choose at least one currency it works for.';
    if (f.kind === 'percent'){ const n = Number(f.percent); if (!(n > 0 && n <= 100)) return 'Percent off must be more than 0 and at most 100.'; }
    else {
      if (f.currencies.includes('INR') && !f.amountInr) return 'Set the amount off in ₹ (or untick buyers in India).';
      if (f.currencies.includes('USD') && !f.amountUsd) return 'Set the amount off in $ (or untick everyone else).';
    }
    if (f.appliesTo === 'category' && !f.categoryId) return 'Choose the category it applies to.';
    if (f.appliesTo === 'products' && !f.productIds.length) return 'Tick at least one product it applies to.';
    if (f.startsAt && f.endsAt && f.endsAt <= f.startsAt) return 'The end must be after the start.';
    if (f.maxUses === '0') return 'Total uses must be at least 1 (leave it empty for unlimited).';
    if (f.perEmailLimit === '0') return 'Uses per email must be at least 1 (leave it empty for unlimited).';
    return null;
  })();
  const save = async () => {
    if (problem) throw new Error(problem);
    const body = { code: f.code, description: f.description, kind: f.kind, percentBp: f.kind === 'percent' ? Math.round(Number(f.percent) * 100) : null,
      amountInr: f.amountInr, amountUsd: f.amountUsd, currencies: f.currencies, startsAt: iso(f.startsAt), endsAt: iso(f.endsAt),
      maxUses: f.maxUses || null, perEmailLimit: f.perEmailLimit || null, firstOrderOnly: f.firstOrderOnly, minOrderInr: f.minOrderInr || 0, minOrderUsd: f.minOrderUsd || 0,
      maxDiscountInr: f.maxDiscountInr, maxDiscountUsd: f.maxDiscountUsd, appliesTo: f.appliesTo, productIds: f.productIds, categoryId: f.categoryId || null, stackable: f.stackable, paused: f.paused };
    onSaved(existing ? await put(`/coupons/${existing.id}`, body) : await post('/coupons', body));
  };
  const genCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(8)); set('code', 'KA-' + [...r].map(x => a[x % a.length]).join('')); };
  return (
    <Modal wide title={existing ? `Edit ${existing.code}` : 'New discount code'} onClose={() => void close()} footer={<>
      {problem && tab === 'rules' && <span className="field-hint grow" role="status">{problem}</span>}
      <button type="button" className="btn" onClick={() => void close()}>Cancel</button>
      <AsyncButton className="btn primary" disabled={!!problem} onClick={save}>{existing ? 'Save changes' : 'Create code'}</AsyncButton>
    </>}>
      {existing && <div className="tabs" role="tablist" style={{ margin: '-8px -20px 0', padding: '0 20px' }}>
        {(['rules', 'uses'] as const).map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'rules' ? 'Rules' : `Uses (${existing.confirmed_uses})`}</button>)}
      </div>}
      {tab === 'uses' && existing ? (
        !uses.data ? <SkeletonRows rows={4} /> : !uses.data.uses.length ? <Empty icon="coupons" title="Not used yet" /> : (
          <ul className="list">{uses.data.uses.map((u, i) => (
            <li key={i}><Badge tone={u.status === 'confirmed' ? 'success' : u.status === 'reserved' ? 'info' : 'neutral'}>{u.status}</Badge><span className="grow truncate">{u.email}</span>
              <span className="mono faint" style={{ fontSize: 12 }}>{u.public_id}</span><span className="num">−{money(u.amount, u.currency)}</span><span className="faint" style={{ fontSize: 12 }}>{dateTime(u.created_at)}</span></li>
          ))}</ul>
        )
      ) : <>
        <div className="form-grid">
          <Field label="Code" hint="Buyers type this. Letters, numbers, - and _."><span className="input-with-btn"><input value={f.code} onChange={e => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} maxLength={32} className="mono" autoFocus={!existing} />
            <button type="button" className="icon-btn" aria-label="Generate a random code" title="Generate" onClick={genCode}><Icon name="sparkle" /></button></span></Field>
          <Field label="Note to self"><input value={f.description} onChange={e => set('description', e.target.value)} maxLength={200} placeholder="e.g. Instagram launch" /></Field>
        </div>
        <Field label="Discount"><Segmented label="Discount type" value={f.kind} onChange={v => set('kind', v)} options={[{ value: 'percent', label: 'Percent' }, { value: 'fixed', label: 'Fixed amount' }]} /></Field>
        {f.kind === 'percent' ? (
          <div className="form-grid">
            <Field label="Percent off"><span className="input-affix"><span>%</span><input inputMode="decimal" value={f.percent} onChange={e => set('percent', e.target.value.replace(/[^\d.]/g, ''))} className="num" /></span></Field>
            <Field label="Cap (INR)" hint="Optional"><MoneyInput currency="INR" label="Maximum discount INR" value={f.maxDiscountInr} onChange={v => set('maxDiscountInr', v)} clearable /></Field>
            <Field label="Cap (USD)"><MoneyInput currency="USD" label="Maximum discount USD" value={f.maxDiscountUsd} onChange={v => set('maxDiscountUsd', v)} clearable /></Field>
          </div>
        ) : (
          <div className="form-grid">
            <Field label="Amount off (INR)"><MoneyInput currency="INR" label="Amount off INR" value={f.amountInr} onChange={v => set('amountInr', v)} /></Field>
            <Field label="Amount off (USD)"><MoneyInput currency="USD" label="Amount off USD" value={f.amountUsd} onChange={v => set('amountUsd', v)} /></Field>
          </div>
        )}
        <Field label="Works for">
          <div className="row">{['INR', 'USD'].map(c => (
            <label key={c} className="check"><input type="checkbox" checked={f.currencies.includes(c)} onChange={e => set('currencies', e.target.checked ? [...f.currencies, c] : f.currencies.filter(x => x !== c))} />{c === 'INR' ? 'Buyers in India (₹)' : 'Everyone else ($)'}</label>
          ))}</div>
        </Field>
        <div className="form-grid">
          <Field label="Applies to"><select value={f.appliesTo} onChange={e => set('appliesTo', e.target.value)}>
            <option value="all">Everything</option><option value="artifacts">Artifacts only</option><option value="artzz">Artzz only</option><option value="category">One category</option><option value="products">Chosen products</option></select></Field>
          {f.appliesTo === 'category' && <Field label="Category"><select value={f.categoryId} onChange={e => set('categoryId', e.target.value)}><option value="">Choose…</option>
            {cats.data?.categories.filter(c => c.kind !== 'tips').map(c => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}</select></Field>}
        </div>
        {f.appliesTo === 'products' && <Field label="Products">
          <div className="check-list">{!products.data ? <SkeletonRows rows={3} cols={1} /> : products.data.products.map(p => (
            <label key={p.id}><input type="checkbox" checked={f.productIds.includes(p.id)} onChange={e => set('productIds', e.target.checked ? [...f.productIds, p.id] : f.productIds.filter(x => x !== p.id))} /> {p.title} <span className="faint">· {p.kind}</span></label>
          ))}</div></Field>}
        <div className="form-grid">
          <Field label="Starts" hint="India time; empty = now"><DateTimeInput label="Start" value={f.startsAt} onChange={v => set('startsAt', v)} /></Field>
          <Field label="Ends" hint="Empty = never"><DateTimeInput label="End" value={f.endsAt} min={f.startsAt || undefined} onChange={v => set('endsAt', v)} /></Field>
          <Field label="Total uses" hint="Empty = unlimited"><input inputMode="numeric" value={f.maxUses} onChange={e => set('maxUses', e.target.value.replace(/\D/g, ''))} className="num" /></Field>
          <Field label="Uses per email"><input inputMode="numeric" value={f.perEmailLimit} onChange={e => set('perEmailLimit', e.target.value.replace(/\D/g, ''))} className="num" /></Field>
          <Field label="Minimum order (INR)"><MoneyInput currency="INR" label="Minimum INR" value={f.minOrderInr} onChange={v => set('minOrderInr', v)} clearable /></Field>
          <Field label="Minimum order (USD)"><MoneyInput currency="USD" label="Minimum USD" value={f.minOrderUsd} onChange={v => set('minOrderUsd', v)} clearable /></Field>
        </div>
        <div className="stack">
          <Switch checked={f.firstOrderOnly} onChange={v => set('firstOrderOnly', v)} label="Only for a buyer’s first order" />
          <Switch checked={f.stackable} onChange={v => set('stackable', v)} label="Can combine with other codes (when stacking is on in Settings)" />
          <Switch checked={f.paused} onChange={v => set('paused', v)} label="Paused" />
        </div>
        <p className="field-hint">The discount is always worked out on the server at checkout. A code never takes an order below the Razorpay minimum; free items need no code.</p>
      </>}
    </Modal>
  );
}
