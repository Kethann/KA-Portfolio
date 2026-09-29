// Portal UI kit: toasts (with Undo), confirm dialog, skeletons, states, form controls, virtual table.
import { createContext, isValidElement, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, KeyboardEvent as RKeyboardEvent, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

// ---- toasts --------------------------------------------------------------------------------------
type Toast = { id: number; text: string; tone: 'info' | 'success' | 'error'; action?: { label: string; run: () => void }; ms: number };
type ToastApi = { show: (text: string, o?: Partial<Omit<Toast, 'id' | 'text'>>) => void; error: (err: unknown) => void;
  undoable: (text: string, commit: () => Promise<unknown>, revert: () => void, ms?: number) => void };
const ToastCtx = createContext<ToastApi | null>(null);
export const useToast = () => useContext(ToastCtx)!;

export function ToastProvider({ children }: { children: ReactNode }){
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const remove = useCallback((id: number) => setItems(x => x.filter(t => t.id !== id)), []);
  const show = useCallback<ToastApi['show']>((text, o = {}) => {
    const id = ++seq.current;
    setItems(x => [...x.slice(-3), { id, text, tone: o.tone || 'info', action: o.action, ms: o.ms ?? (o.tone === 'error' ? 7000 : 4000) }]);
  }, []);
  const error = useCallback((err: unknown) => show((err as any)?.message || String(err), { tone: 'error' }), [show]);
  // Optimistic delete/archive: the change shows at once; the server call waits out the Undo window.
  const undoable = useCallback<ToastApi['undoable']>((text, commit, revert, ms = 5000) => {
    let undone = false;
    const timer = setTimeout(async () => { if (undone) return; try { await commit(); } catch (e){ revert(); error(e); } }, ms);
    show(text, { ms, action: { label: 'Undo', run: () => { undone = true; clearTimeout(timer); revert(); } } });
  }, [show, error]);
  const api = useMemo(() => ({ show, error, undoable }), [show, error, undoable]);
  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" role="region" aria-label="Notifications">
          <div aria-live="polite" aria-atomic="false" className="toasts-in">
            {items.map(t => <ToastItem key={t.id} t={t} onDone={() => remove(t.id)} />)}
          </div>
        </div>, document.body)}
    </ToastCtx.Provider>
  );
}
function ToastItem({ t, onDone }: { t: Toast; onDone: () => void }){
  const [hover, setHover] = useState(false);
  const left = useRef(t.ms), started = useRef(Date.now());
  const done = useRef(onDone); done.current = onDone;   // a new callback each render must not restart the timer
  useEffect(() => {
    if (hover){ left.current -= Date.now() - started.current; return; }
    started.current = Date.now();
    const id = setTimeout(() => done.current(), Math.max(800, left.current));
    return () => clearTimeout(id);
  }, [hover]);
  return (
    <div className={`toast toast-${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} />
      <span className="toast-text">{t.text}</span>
      {t.action && <button type="button" className="toast-action" onClick={() => { t.action!.run(); onDone(); }}>{t.action.label}</button>}
      <button type="button" className="icon-btn sm" aria-label="Dismiss" onClick={onDone}><Icon name="close" size={14} /></button>
    </div>
  );
}

// ---- modal + confirm -----------------------------------------------------------------------------
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean, onEscape?: () => void){
  useEffect(() => {
    if (!active || !ref.current) return;
    const root = ref.current, before = document.activeElement as HTMLElement | null;
    const focusables = () => [...root.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(e => !e.hasAttribute('disabled') && e.offsetParent !== null);
    // keep focus React's autoFocus already placed inside; else a [data-autofocus] element; else the first control
    if (!root.contains(document.activeElement)) (root.querySelector<HTMLElement>('[data-autofocus]') || focusables()[0] || root).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape){ e.stopPropagation(); onEscape(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    };
    root.addEventListener('keydown', key);
    return () => { root.removeEventListener('keydown', key); if (before && document.contains(before)) before.focus(); };
  }, [active, ref, onEscape]);
}

export function Modal({ title, children, onClose, footer, wide, labelledBy }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean; labelledBy?: string }){
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useFocusTrap(ref, true, onClose);
  return createPortal(
    <div className="modal-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={labelledBy || id} tabIndex={-1}>
        <header className="modal-head"><h2 id={id}>{title}</h2><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" /></button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>, document.body);
}

type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; danger?: boolean; typeToConfirm?: string };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);
export function ConfirmProvider({ children }: { children: ReactNode }){
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => {
    setTyped('');
    setState(prev => { prev?.resolve(false); return { ...o, resolve }; });   // never leave an earlier question hanging
  }), []);
  const done = (v: boolean) => { state?.resolve(v); setState(null); };
  const blocked = !!state?.typeToConfirm && typed !== state.typeToConfirm;
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state && (
        <Modal title={state.title} onClose={() => done(false)} footer={<>
          <button type="button" className="btn" onClick={() => done(false)}>Cancel</button>
          <button type="button" className={'btn ' + (state.danger ? 'danger' : 'primary')} disabled={blocked} onClick={() => done(true)} data-autofocus={!state.typeToConfirm || undefined}>{state.confirm || 'Confirm'}</button>
        </>}>
          {state.body && <div className="confirm-body">{state.body}</div>}
          {state.typeToConfirm && (
            <label className="field"><span>Type <b>{state.typeToConfirm}</b> to confirm</span>
              <input autoFocus value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !blocked) done(true); }} /></label>
          )}
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

// ---- states --------------------------------------------------------------------------------------
export function Skeleton({ w = '100%', h = 14, r = 6, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }){
  return <span className="skel" style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden="true" />;
}
export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }){
  return (
    <div className="skel-rows" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skel-row">{Array.from({ length: cols }, (_, j) => <Skeleton key={j} w={`${[38, 22, 18, 14][j % 4] + ((i * 7 + j * 3) % 9)}%`} />)}</div>
      ))}
    </div>
  );
}
export function Empty({ icon = 'inbox', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }){
  return <div className="empty"><div className="empty-ic"><Icon name={icon} size={26} /></div><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }){
  return <div className="empty error-state" role="alert"><div className="empty-ic"><Icon name="alert" size={26} /></div><h3>Couldn’t load this</h3><p>{message}</p>{retry && <button type="button" className="btn" onClick={retry}><Icon name="refresh" /> Try again</button>}</div>;
}
export function Loadable<T>({ state, children, skeleton }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => ReactNode; skeleton?: ReactNode }){
  if (state.data) return <>{children(state.data)}</>;
  if (state.error) return <ErrorState message={state.error} retry={state.reload} />;
  return <>{skeleton || <SkeletonRows />}</>;
}
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'; children: ReactNode }){
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export const STATUS_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'> = {
  delivered: 'success', paid: 'info', created: 'neutral', failed: 'danger', cancelled: 'neutral', expired: 'neutral', mismatch: 'danger', refunded: 'warning',
  published: 'success', draft: 'neutral', archived: 'neutral', active: 'success', revoked: 'danger', 'used up': 'neutral',
  new: 'accent', read: 'neutral', done: 'success', spam: 'danger', ok: 'success', sent: 'success'
};

// ---- controls ------------------------------------------------------------------------------------
// A <label> only wraps a single form control (or a wrapper whose first control is the input);
// anything with several buttons (segmented controls, swatches, tag chips) becomes a labelled group,
// because a label activates its first labelable descendant when its text is clicked.
function isSingleControl(c: ReactNode){
  if (!isValidElement(c)) return false;
  if (typeof c.type === 'string'){
    if (['input', 'select', 'textarea'].includes(c.type)) return true;
    return c.type === 'span' && /input-affix|input-with-btn/.test(String((c.props as any).className || ''));
  }
  return (c.type as any).labelable === true;
}
export function Field({ label, hint, error, children, inline }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; inline?: boolean }){
  const id = useId();
  const cls = 'field' + (inline ? ' inline' : '') + (error ? ' has-error' : '');
  const foot = error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null;
  if (isSingleControl(children)) return <label className={cls}><span className="field-label">{label}</span>{children}{foot}</label>;
  return <div className={cls} role="group" aria-labelledby={id}><span className="field-label" id={id}>{label}</span>{children}{foot}</div>;
}
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }){
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
      <span className="switch-label">{label}</span>
    </label>
  );
}
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }){
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex(o => o.value === value);
  const onKey = (e: RKeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const n = (idx + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    onChange(options[n].value); refs.current[n]?.focus();
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o, i) => (
        <button key={o.value} ref={el => { refs.current[i] = el; }} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
          className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
// Search field with a clear (✕) button; Esc clears it too. Replaces the browser's own clear button,
// which only some browsers show.
export function SearchBox({ value, onChange, placeholder, label, style }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; style?: CSSProperties }){
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="search" style={style}><Icon name="search" />
      <input ref={ref} type="search" placeholder={placeholder} aria-label={label} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && value){ e.preventDefault(); e.stopPropagation(); onChange(''); } }} />
      {value && <button type="button" className="search-clear" aria-label="Clear search" title="Clear" onClick={() => { onChange(''); ref.current?.focus(); }}><Icon name="close" size={12} /></button>}
    </div>
  );
}
export function Spinner({ size = 14 }: { size?: number }){ return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label="Working" />; }

// Button that shows progress and blocks double submits.
export function AsyncButton({ onClick, children, className = 'btn', disabled, title, type = 'button' }: { onClick: () => Promise<unknown> | unknown; children: ReactNode; className?: string; disabled?: boolean; title?: string; type?: 'button' | 'submit' }){
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  return (
    <button type={type} className={className} title={title} disabled={disabled || busy} aria-busy={busy} onClick={async () => {
      if (busy) return;
      setBusy(true);
      try { await onClick(); } catch (e){ toast.error(e); } finally { if (alive.current) setBusy(false); }
    }}>{busy ? <Spinner /> : null}{children}</button>
  );
}

// ---- virtual table -------------------------------------------------------------------------------
export type Column<T> = { key: string; label: string; width?: string; align?: 'left' | 'right' | 'center'; render: (row: T) => ReactNode; sort?: (a: T, b: T) => number; hideBelow?: number };
export function VirtualTable<T>({ rows, columns, rowKey, onOpen, rowHeight = 44, selected, onSelect, empty, label, footer }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onOpen?: (r: T) => void; rowHeight?: number;
  selected?: Set<string>; onSelect?: (s: Set<string>) => void; empty?: ReactNode; label: string; footer?: ReactNode;
}){
  const scroller = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [height, setHeight] = useState(400);
  const [width, setWidth] = useState(800);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [cursor, setCursor] = useState(-1);
  useLayoutEffect(() => {
    const el = scroller.current; if (!el) return;
    const ro = new ResizeObserver(() => { setHeight(el.clientHeight); setWidth(el.clientWidth); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const cols = columns.filter(c => !c.hideBelow || width >= c.hideBelow);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = columns.find(x => x.key === sort.key);
    return c?.sort ? [...rows].sort((a, b) => c.sort!(a, b) * sort.dir) : rows;
  }, [rows, sort, columns]);
  const overscan = 8;
  const start = Math.max(0, Math.floor(scroll / rowHeight) - overscan);
  const end = Math.min(sorted.length, Math.ceil((scroll + height) / rowHeight) + overscan);
  const grid = (onSelect ? '40px ' : '') + cols.map(c => c.width || '1fr').join(' ');
  const allSel = !!selected && sorted.length > 0 && sorted.every(r => selected.has(rowKey(r)));
  useEffect(() => { if (cursor >= sorted.length) setCursor(sorted.length - 1); }, [sorted.length, cursor]);
  const toggle = (k: string) => { if (!onSelect || !selected) return; const s = new Set(selected); s.has(k) ? s.delete(k) : s.add(k); onSelect(s); };
  const onKey = (e: RKeyboardEvent) => {
    if (!sorted.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      e.preventDefault();
      const n = Math.min(sorted.length - 1, Math.max(0, cursor + (e.key === 'ArrowDown' ? 1 : -1)));
      setCursor(n);
      const el = scroller.current!;
      const top = n * rowHeight, bottom = top + rowHeight;
      if (top < el.scrollTop) el.scrollTop = top; else if (bottom > el.scrollTop + el.clientHeight - rowHeight) el.scrollTop = bottom - el.clientHeight + rowHeight;
    } else if (e.key === 'Enter' && sorted[cursor] && onOpen){ onOpen(sorted[cursor]); }
    else if (e.key === ' ' && sorted[cursor] && onSelect){ e.preventDefault(); toggle(rowKey(sorted[cursor])); }
  };
  return (
    <div className="vtable" role="grid" aria-label={label} aria-rowcount={sorted.length + 1}>
      <div className="vt-head" role="row" style={{ gridTemplateColumns: grid }}>
        {onSelect && <span role="columnheader" className="vt-check"><input type="checkbox" aria-label="Select all" checked={allSel} onChange={() => onSelect(allSel ? new Set() : new Set(sorted.map(rowKey)))} /></span>}
        {cols.map(c => (
          <span key={c.key} role="columnheader" className={'vt-cell ' + (c.align || '')} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
            {c.sort ? <button type="button" className="vt-sort" onClick={() => setSort(s => s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}>
              {c.label}{sort?.key === c.key && <Icon name="chevronDown" size={12} style={{ transform: sort.dir === 1 ? 'rotate(180deg)' : undefined }} />}</button> : c.label}
          </span>
        ))}
      </div>
      <div ref={scroller} className="vt-body" tabIndex={0} onKeyDown={onKey} onScroll={e => setScroll((e.target as HTMLDivElement).scrollTop)} aria-label={`${label}: use arrow keys and Enter`}>
        {!sorted.length ? (empty || <Empty title="Nothing here yet" />) : (
          <div style={{ height: sorted.length * rowHeight, position: 'relative' }}>
            {sorted.slice(start, end).map((r, i) => {
              const idx = start + i, k = rowKey(r);
              return (
                <div key={k} role="row" aria-rowindex={idx + 2} aria-selected={selected?.has(k) || undefined}
                  className={'vt-row' + (idx === cursor ? ' cursor' : '') + (selected?.has(k) ? ' selected' : '') + (onOpen ? ' clickable' : '')}
                  style={{ transform: `translateY(${idx * rowHeight}px)`, height: rowHeight, gridTemplateColumns: grid }}
                  onClick={(e) => { setCursor(idx); if ((e.target as HTMLElement).closest('input,button,a')) return; onOpen?.(r); }}>
                  {onSelect && <span className="vt-check" role="gridcell"><input type="checkbox" aria-label="Select row" checked={!!selected?.has(k)} onChange={() => toggle(k)} /></span>}
                  {cols.map(c => <span key={c.key} role="gridcell" className={'vt-cell ' + (c.align || '')}>{c.render(r)}</span>)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {footer && <div className="vt-foot">{footer}</div>}
    </div>
  );
}

// Tiny SVG chart (no library): one or more series over shared x labels. Includes a text summary.
export function Chart({ labels, series, height = 160, format = (v: number) => String(v), kind = 'area' }: { labels: string[]; series: { name: string; values: number[]; color?: string }[]; height?: number; format?: (v: number) => string; kind?: 'area' | 'bar' }){
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height, pad = 6;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const x = (i: number) => labels.length <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (labels.length - 1);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2 - 14);
  const summary = series.map(s => `${s.name}: total ${format(s.values.reduce((a, b) => a + b, 0))}, peak ${format(Math.max(0, ...s.values))}`).join('; ');
  return (
    <figure className="chart" aria-label={summary}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={summary}
        onPointerMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width) * (labels.length - 1)); setHover(Math.max(0, Math.min(labels.length - 1, i))); }}
        onPointerLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={0} x2={W} y1={H - pad - f * (H - pad * 2 - 14)} y2={H - pad - f * (H - pad * 2 - 14)} className="chart-grid" />)}
        {series.map((s, si) => kind === 'bar' ? s.values.map((v, i) => {
          const bw = Math.min(28, Math.max(2, (W - pad * 2) / labels.length / series.length - 2));   // a few data points stay normal bars, not one giant block
          return <rect key={si + '-' + i} x={x(i) - (bw * series.length) / 2 + si * bw} y={y(v)} width={bw - 1} height={H - pad - y(v)} rx={2} style={{ fill: s.color || 'var(--accent)' }} opacity={hover === null || hover === i ? 1 : .55} />;
        }) : (
          <g key={si}>
            <path d={`M${x(0)},${H - pad} ` + s.values.map((v, i) => `L${x(i)},${y(v)}`).join(' ') + ` L${x(s.values.length - 1)},${H - pad} Z`} style={{ fill: s.color || 'var(--accent)' }} opacity={0.14} />
            <path d={s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')} fill="none" style={{ stroke: s.color || 'var(--accent)' }} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="chart-cursor" />}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{labels[hover]}</b>{series.map(s => <span key={s.name}><i style={{ background: s.color || 'var(--accent)' }} />{s.name}: {format(s.values[hover] || 0)}</span>)}
        </div>
      )}
    </figure>
  );
}
