// Content > Mosaic: the Portfolio's all-pictures view. Every picture keeps its own shape and the rows fill the block
// edge to edge; the owner decides where each one sits by dragging it like a puzzle piece (or lets "Best fit" solve
// it). The preview uses the very same layout code as the site (client/src/mosaic-layout.ts), so what is arranged
// here is exactly what visitors see, at desktop, tablet and phone widths.
// Mouse: drag straight away. Touch: press and hold a picture to pick it up (a plain swipe still scrolls the page).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { Field, Segmented } from '../ui';
import { Icon } from '../icons';
import { updateSite, useSite, thumb } from './siteDoc';
import type { SiteDoc, SiteImage } from './siteDoc';
import { MOSAIC_DEFAULTS, MOSAIC_LIMITS, applyOrder, bestFit, knownRatio, layoutMosaic, measureRatio, mosaicTarget, rememberRatio, shuffle } from '../../../src/mosaic-layout';
import type { MosaicSettings, MosaicTile } from '../../../src/mosaic-layout';

type Device = 'desktop' | 'tablet' | 'phone';
const DEVICE_WIDTH: Record<Device, number> = { desktop: 1200, tablet: 760, phone: 390 };
const HOLD_MS = 280, EDGE = 64;
// Must match kaFeatured() / kaPanelImages() in index.html: the mosaic lives in the Portfolio panel, which shows every
// stack except the ones featured in About (until some are marked, these two, or the first two stacks).
const FEATURED_DEFAULT = ['Devara Campaign', 'Selected Designs'];
export function portfolioImages(d: SiteDoc): SiteImage[] {
  const all = d.folders.slice();
  let feat = (d.stacks.featured || []).filter(f => all.includes(f));
  if (!feat.length) feat = FEATURED_DEFAULT.filter(f => all.includes(f));
  if (!feat.length) feat = all.slice(0, Math.min(2, Math.max(0, all.length - 1)));
  const visible = d.images.filter(i => !i.hidden), seen = new Set<string>(), key = (i: SiteImage) => i.src || i.slug;
  for (const f of feat) for (const i of visible) if (i.cat === f) seen.add(key(i));
  const out: SiteImage[] = [];
  for (const f of all.filter(x => !feat.includes(x))) for (const i of visible){
    if (i.cat !== f || seen.has(key(i))) continue;
    seen.add(key(i)); out.push(i);
  }
  return out;
}
const ratioOf = (i: SiteImage) => i.width && i.height ? i.width / i.height : knownRatio(i.slug);
const move = <T,>(list: T[], from: number, to: number) => { const out = list.slice(); const [x] = out.splice(from, 1); out.splice(to, 0, x); return out; };
/** The nearest ancestor that actually scrolls (the portal window), else the page. */
function scrollerOf(el: HTMLElement | null): HTMLElement {
  for (let n = el?.parentElement; n; n = n.parentElement){
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

type Drag = { key: string; id: number; touch: boolean; startX: number; startY: number; x: number; y: number; offX: number; offY: number; active: boolean; over: number };

export default function Mosaic(){
  const { doc } = useSite();
  const [device, setDevice] = useState<Device>('desktop');
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d); };
  const [selected, setSelected] = useState('');
  const [, bump] = useState(0);
  const [cw, setCw] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null), stageRef = useRef<HTMLDivElement>(null), cardRef = useRef<HTMLElement>(null);
  const holdTimer = useRef(0), autoRaf = useRef(0);
  const undo = useRef<string[][]>([]), redo = useRef<string[][]>([]);
  const images = useMemo(() => doc ? portfolioImages(doc) : [], [doc]);
  const m: Required<MosaicSettings> = { ...MOSAIC_DEFAULTS, order: [], ...(doc?.stacks.mosaic || {}) };
  const ordered = useMemo(() => applyOrder(images, m.order), [images, m.order]);
  const keys = ordered.map(i => i.slug);

  // pictures without a stored size are measured once from their small export
  const sizeKey = images.map(i => i.slug).join('|');
  useEffect(() => {
    let alive = true;
    for (const i of images){
      if (i.width && i.height){ rememberRatio(i.slug, i.width / i.height); continue; }
      if (!knownRatio(i.slug)) void measureRatio(i.slug, thumb(i, 480)).then(() => { if (alive) bump(v => v + 1); });
    }
    return () => { alive = false; };
  }, [sizeKey]);// eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const fit = () => setCw(el.clientWidth); fit();
    if (typeof ResizeObserver !== 'function'){ window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }
    const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, []);
  // While a picture is held on a touch screen the page must not scroll under the finger (needs a non-passive listener).
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const stop = (e: TouchEvent) => { if (dragRef.current?.active) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  });
  useEffect(() => () => { clearTimeout(holdTimer.current); cancelAnimationFrame(autoRaf.current); }, []);

  const W = DEVICE_WIDTH[device], scale = cw ? Math.min(1, cw / W) : 1;
  const viewKeys = drag?.active ? move(keys, keys.indexOf(drag.key), drag.over) : keys;
  const bySlug = new Map(ordered.map(i => [i.slug, i]));
  const layout = layoutMosaic(viewKeys.filter(k => bySlug.has(k)).map(k => ({ key: k, ratio: ratioOf(bySlug.get(k)!) || 2 / 3 })), W, mosaicTarget(W, m.rowHeight), m.gap);
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const missing = ordered.filter(i => !ratioOf(i)).length;
  if (!doc) return null;

  // Every arranging change also stores the sizes measured here, so the site can lay the mosaic out before any picture loads.
  const set = (fn: (s: Required<MosaicSettings>) => Partial<MosaicSettings>) => updateSite(d => {
    const cur: Required<MosaicSettings> = { ...MOSAIC_DEFAULTS, order: [], ...(d.stacks.mosaic || {}) };
    const imagesWithSize = d.images.map(i => {
      if (i.width && i.height) return i;
      const r = knownRatio(i.slug), w = i.full || (i.widths.length ? Math.max(...i.widths) : 0);
      return r && w ? { ...i, width: Math.round(w), height: Math.max(1, Math.round(w / r)) } : i;
    });
    return { ...d, images: imagesWithSize, stacks: { ...d.stacks, mosaic: { ...cur, ...fn(cur) } } };
  });
  const setOrder = (next: string[], record = true) => {
    if (next.join('|') === keys.join('|')) return;
    if (record){ undo.current = [...undo.current.slice(-49), keys]; redo.current = []; }
    set(() => ({ order: next }));
  };
  // back to the stacks' own order: nothing stored, so new pictures keep following the stacks (still undoable)
  const resetOrder = () => { undo.current = [...undo.current.slice(-49), keys]; redo.current = []; set(() => ({ order: [] })); };
  const doUndo = () => { const prev = undo.current.pop(); if (!prev) return; redo.current.push(keys); setOrder(prev, false); };
  const doRedo = () => { const next = redo.current.pop(); if (!next) return; undo.current.push(keys); setOrder(next, false); };

  const toLocal = (cx: number, cy: number) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (cx - r.left) / scale, y: (cy - r.top) / scale };
  };
  // the slot under the pointer: only the middle of a picture counts, so neighbours don't flicker back and forth at the edges
  const slotAt = (x: number, y: number, tiles: MosaicTile[], self: string) => {
    for (const t of tiles){
      if (t.key === self) continue;
      const mx = t.w * 0.2, my = t.h * 0.15;
      if (x >= t.x + mx && x <= t.x + t.w - mx && y >= t.y + my && y <= t.y + t.h - my) return t.index;
    }
    return -1;
  };
  const follow = (d: Drag, cx: number, cy: number): Drag => {
    const p = toLocal(cx, cy), hit = slotAt(p.x, p.y, layoutRef.current.tiles, d.key);
    return { ...d, x: cx, y: cy, over: hit >= 0 ? hit : d.over };
  };
  // dragging near the top or bottom edge of the window scrolls it, so a long mosaic can be rearranged end to end
  const autoScroll = () => {
    cancelAnimationFrame(autoRaf.current);
    const tick = () => {
      const d = dragRef.current; if (!d?.active) return;
      const sc = scrollerOf(stageRef.current), page = sc === document.scrollingElement || sc === document.documentElement;
      const top = page ? 0 : sc.getBoundingClientRect().top, bottom = page ? window.innerHeight : sc.getBoundingClientRect().bottom;
      const v = d.y < top + EDGE ? -Math.ceil((top + EDGE - d.y) / 4) : d.y > bottom - EDGE ? Math.ceil((d.y - bottom + EDGE) / 4) : 0;
      if (v){ sc.scrollTop += v; setDrag(follow(d, d.x, d.y)); }
      autoRaf.current = requestAnimationFrame(tick);
    };
    autoRaf.current = requestAnimationFrame(tick);
  };
  const pickUp = (d: Drag) => {
    try { stageRef.current?.setPointerCapture(d.id); } catch { /* released */ }
    try { navigator.vibrate?.(12); } catch { /* no haptics */ }
    setDrag({ ...d, active: true }); setSelected(d.key); autoScroll();
  };
  function down(e: ReactPointerEvent<HTMLButtonElement>, t: MosaicTile){
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = toLocal(e.clientX, e.clientY), touch = e.pointerType !== 'mouse';
    const d: Drag = { key: t.key, id: e.pointerId, touch, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, offX: p.x - t.x, offY: p.y - t.y, active: false, over: keys.indexOf(t.key) };
    setDrag(d);
    clearTimeout(holdTimer.current);
    if (touch) holdTimer.current = window.setTimeout(() => { const cur = dragRef.current; if (cur && cur.id === d.id && !cur.active) pickUp(cur); }, HOLD_MS);
  }
  function moveP(e: ReactPointerEvent<HTMLDivElement>){
    const d = dragRef.current; if (!d || d.id !== e.pointerId) return;
    const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.active){
      if (d.touch){ if (dist > 8){ clearTimeout(holdTimer.current); setDrag(null); } return; }   // a swipe before the hold: let the page scroll
      if (dist < 5) return;
      pickUp(d);
    }
    setDrag(follow({ ...d, active: true }, e.clientX, e.clientY));
  }
  function end(e: ReactPointerEvent<HTMLDivElement>, cancelled = false){
    const d = dragRef.current; if (!d || d.id !== e.pointerId) return;
    clearTimeout(holdTimer.current); cancelAnimationFrame(autoRaf.current);
    if (d.active && !cancelled) setOrder(move(keys, keys.indexOf(d.key), d.over));
    else if (!d.active && !cancelled) setSelected(d.key);
    setDrag(null);
  }
  function key(e: ReactKeyboardEvent<HTMLButtonElement>, slug: string){
    const i = keys.indexOf(slug);
    const to = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? i + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? keys.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const focus = (k: string) => requestAnimationFrame(() => stageRef.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"]`)?.focus());
    if (e.shiftKey || e.altKey){
      // Shift/Alt + arrows moves the picture itself
      const j = Math.max(0, Math.min(keys.length - 1, to)); if (j !== i) setOrder(move(keys, i, j));
      setSelected(slug); focus(slug);
    } else {
      // plain arrows move the focus
      const k = keys[Math.max(0, Math.min(keys.length - 1, to))]; setSelected(k); focus(k);
    }
  }
  function cardKey(e: ReactKeyboardEvent<HTMLElement>){
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
    if ((e.target as HTMLElement).matches('input, textarea, select')) return;
    e.preventDefault();
    if (e.key.toLowerCase() === 'y' || e.shiftKey) doRedo(); else doUndo();
  }
  const selIndex = keys.indexOf(selected);
  const ratioPairs = () => ordered.map(i => ({ key: i.slug, ratio: ratioOf(i) || 2 / 3 }));
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

  return (
    <div className="app-main" style={{ maxWidth: 1240, margin: '0 auto', width: '100%' }}>
      <div className="stack-lg">
        <section className="card stack">
          <div className="row between"><h3 style={{ margin: 0 }}>Mosaic view</h3><span className="faint" style={{ fontSize: 12 }}>{ordered.length} pictures in the Portfolio</span></div>
          <p className="muted" style={{ marginTop: -4 }}>Visitors can switch the Portfolio between <b>Stacks</b> (one stack per category) and <b>Mosaic</b> (every picture together). In the mosaic each picture keeps its own shape and the rows always fill the block; you choose where each one sits.</p>
          <div className="form-grid">
            <Field label="Visitors start on"><Segmented label="Default view" value={m.view} onChange={v => set(() => ({ view: v }))} options={[{ value: 'stacks', label: 'Stacks' }, { value: 'mosaic', label: 'Mosaic' }]} /></Field>
            <Field label={`Row height ${m.rowHeight} px`} hint="On a desktop-wide page; phones scale it down"><input type="range" min={MOSAIC_LIMITS.rowHeight[0]} max={MOSAIC_LIMITS.rowHeight[1]} step={10} value={m.rowHeight} onChange={e => set(() => ({ rowHeight: Number(e.target.value) }))} /></Field>
            <Field label={`Gap ${m.gap} px`}><input type="range" min={MOSAIC_LIMITS.gap[0]} max={MOSAIC_LIMITS.gap[1]} step={1} value={m.gap} onChange={e => set(() => ({ gap: Number(e.target.value) }))} /></Field>
          </div>
        </section>

        <section className="card stack" ref={cardRef} onKeyDown={cardKey}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>Arrange</h3>
            <Segmented label="Preview width" value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'tablet', label: 'Tablet' }, { value: 'phone', label: 'Phone' }]} />
          </div>
          <div className="row mzr-tools">
            <button type="button" className="btn" disabled={ordered.length < 3 || missing > 0} title="Tries hundreds of arrangements and keeps the one whose rows are most even on desktop, tablet and phone"
              onClick={() => setOrder(bestFit(ratioPairs(), { rowHeight: m.rowHeight, gap: m.gap, tries: 500 }))}><Icon name="sparkle" /> Best fit</button>
            <button type="button" className="btn" disabled={ordered.length < 2} onClick={() => setOrder(shuffle(keys, Date.now()))}><Icon name="refresh" /> Shuffle</button>
            <button type="button" className="btn ghost" disabled={!m.order.length} onClick={resetOrder} title="Back to the order of the stacks"><Icon name="undo" /> Reset order</button>
            <span className="mzr-history">
              <button type="button" className="btn sm ghost" disabled={!undo.current.length} onClick={doUndo} aria-label="Undo move" title="Undo (Ctrl+Z)"><Icon name="undo" /></button>
              <button type="button" className="btn sm ghost mzr-redo" disabled={!redo.current.length} onClick={doRedo} aria-label="Redo move" title="Redo (Ctrl+Shift+Z)"><Icon name="undo" /></button>
            </span>
          </div>
          {selIndex >= 0 && <div className="row mzr-sel">
            <span className="faint truncate" style={{ fontSize: 12, minWidth: 0, flex: '1 1 160px' }}>#{selIndex + 1} {bySlug.get(selected)?.title}</span>
            <button type="button" className="btn sm" disabled={selIndex === 0} onClick={() => setOrder(move(keys, selIndex, selIndex - 1))} aria-label="Move earlier">‹</button>
            <button type="button" className="btn sm" disabled={selIndex === keys.length - 1} onClick={() => setOrder(move(keys, selIndex, selIndex + 1))} aria-label="Move later">›</button>
            <button type="button" className="btn sm" disabled={selIndex === 0} onClick={() => setOrder(move(keys, selIndex, 0))}>To start</button>
            <button type="button" className="btn sm" disabled={selIndex === keys.length - 1} onClick={() => setOrder(move(keys, selIndex, keys.length - 1))}>To end</button>
          </div>}
          <p className="field-hint" style={{ margin: 0 }}>
            {coarse ? 'Press and hold a picture, then drag it onto another to move it there.' : 'Drag a picture onto another to move it there; the others slide around it.'} Keyboard: arrows move the focus, Shift + arrows move the picture, Ctrl+Z undoes. {missing > 0 && <b>Measuring {missing} picture{missing === 1 ? '' : 's'}…</b>}
          </p>
          <div className="mzr-box" ref={boxRef}>
            {!ordered.length ? <p className="muted" style={{ padding: 24, textAlign: 'center' }}>No Portfolio pictures yet. Pictures in featured stacks show in About &gt; Featured Work instead.</p> :
            <div className="mzr-frame" style={{ width: W * scale, height: layout.height * scale }}>
              <div className={'mzr-stage' + (drag?.active ? ' is-dragging' : '')} ref={stageRef} style={{ width: W, height: layout.height, transform: `scale(${scale})` }}
                onPointerMove={moveP} onPointerUp={e => end(e)} onPointerCancel={e => end(e, true)} onContextMenu={e => { if (dragRef.current) e.preventDefault(); }}>
                {layout.tiles.map(t => {
                  const img = bySlug.get(t.key)!, dragging = drag?.active && drag.key === t.key, holding = drag && !drag.active && drag.touch && drag.key === t.key;
                  const style: CSSProperties = { width: t.w, height: t.h, transform: `translate3d(${t.x}px,${t.y}px,0)` };
                  return <div key={t.key} className={'mzr-cell' + (dragging ? ' is-slot' : '') + (holding ? ' is-holding' : '')} style={style}>
                    <button type="button" data-key={t.key} className={'mzr-tile' + (selected === t.key ? ' is-sel' : '')} aria-label={`${t.index + 1}: ${img.title}. Shift and arrow keys to move.`}
                      onPointerDown={e => down(e, t)} onKeyDown={e => key(e, t.key)} onFocus={() => setSelected(t.key)}>
                      <img src={thumb(img, Math.min(1080, Math.round(t.w * 1.5)))} alt="" draggable={false} loading="lazy" />
                      <span className="mzr-num">{t.index + 1}</span>
                    </button>
                  </div>;
                })}
                {drag?.active && (() => {
                  const t = layout.tiles.find(x => x.key === drag.key), img = bySlug.get(drag.key);
                  if (!t || !img || !stageRef.current) return null;
                  const p = toLocal(drag.x, drag.y), w = Math.min(t.w, 320 / scale), h = w * t.h / t.w;
                  const fx = Math.min(1, drag.offX / t.w), fy = Math.min(1, drag.offY / t.h);
                  return <div className="mzr-ghost" style={{ width: w, height: h, transform: `translate3d(${p.x - fx * w}px,${p.y - fy * h}px,0) rotate(-1.5deg) scale(1.04)` }} aria-hidden="true"><img src={thumb(img, 480)} alt="" draggable={false} /></div>;
                })()}
              </div>
            </div>}
          </div>
          <span className="faint" style={{ fontSize: 12 }}>Changes go live when you press <b>Publish changes</b>. New pictures join at the end until you move them.</span>
        </section>
      </div>
    </div>
  );
}
