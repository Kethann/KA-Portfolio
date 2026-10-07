// Typography studio (lazy bundle dist/assets/studio.js), opened from the site menu.
// A full-screen writing/drawing canvas with a cursor/finger trail. Everything runs in the
// browser; nothing is uploaded. The drawing stays in memory while the page is open.
import css from './studio.css?inline';
import {
  BRUSHES, BLENDS, FILTERS, DEFAULT_SETTINGS, MAX_POINTS, POINT_STRIDE, drawBackground, drawItem, drawSpaceFallback, isAlive, needsAnimation,
  newStroke, pushPoint, renderScene, replayTimeline, retimed, totalPoints,
  type Background, type BrushId, type Item, type Settings, type Stroke, type TextItem
} from './engine';

export interface StudioOptions { returnFocus?: HTMLElement | null }

const FONTS: { family: string; label: string; kind: 'hand' | 'display' }[] = [
  { family: "'Caveat', cursive", label: 'Caveat', kind: 'hand' }, { family: "'Dancing Script', cursive", label: 'Dancing Script', kind: 'hand' },
  { family: "'Permanent Marker', cursive", label: 'Permanent Marker', kind: 'hand' }, { family: "'Pacifico', cursive", label: 'Pacifico', kind: 'hand' },
  { family: "'Shadows Into Light', cursive", label: 'Shadows Into Light', kind: 'hand' }, { family: "'Kalam', cursive", label: 'Kalam', kind: 'hand' },
  { family: "'Bebas Neue', sans-serif", label: 'Bebas Neue', kind: 'display' }, { family: "'Abril Fatface', serif", label: 'Abril Fatface', kind: 'display' },
  { family: "'Fraunces', serif", label: 'Fraunces', kind: 'display' }, { family: "'Space Grotesk', sans-serif", label: 'Space Grotesk', kind: 'display' }
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500&family=Dancing+Script:wght@600&family=Permanent+Marker&family=Pacifico&family=Shadows+Into+Light&family=Kalam:wght@400&family=Bebas+Neue&family=Abril+Fatface&display=swap';

// ---- session (kept while the page is open) -----------------------------------------------------
type Entry = { type: 'add'; item: Item } | { type: 'clear'; items: Item[] };
const session = {
  items: [] as Item[], undo: [] as Entry[], redo: [] as Entry[], nextId: 1,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  tool: 'brush' as 'brush' | 'eraser' | 'text',
  bg: { kind: 'space' } as Background, filter: 'none', hoverDraw: false,
  font: FONTS[0].family, fontPx: 56, clock0: performance.now(), world: { w: 0, h: 0 }, toolbarHidden: false, lastTrail: 2.5
};
const now = () => performance.now() - session.clock0;

let open: Studio | null = null;
export function openStudio(options: StudioOptions = {}){
  if (open) return;
  open = new Studio(options);
}

// Hides the rest of the page while the studio is open, so the site's live space background
// (#nebula-bg) shows through behind the drawing.
const PAGE_CSS = `html.ka-studio-open{overflow:hidden!important}
html.ka-studio-open body > *:not(#nebula-bg):not(.ka-studio-host):not(script):not(style):not(link){visibility:hidden!important}`;

class Studio {
  host: HTMLDivElement; root: ShadowRoot; stage: HTMLDivElement;
  bgC: HTMLCanvasElement; inkC: HTMLCanvasElement; liveC: HTMLCanvasElement;
  bgX: CanvasRenderingContext2D; inkX: CanvasRenderingContext2D; liveX: CanvasRenderingContext2D;
  dpr = 1; scale = 1; offX = 0; offY = 0;
  current: Stroke | null = null; pointerId: number | null = null;
  sx = 0; sy = 0; lastX = 0; lastY = 0; lastT = 0; pressure = 0.6; hoverTimer = 0;
  midX = 0; midY = 0; lastP = 0.6;   // the curve so far ends at (midX, midY); (lastX, lastY) is its next control point
  raf = 0; replay: { t0: number; items: Item[]; duration: number; record?: (p: number) => void; done?: () => void } | null = null;
  baked = new Set<number>(); animated = new Set<number>();
  opts: StudioOptions; cleanups: (() => void)[] = [];
  textEditor: HTMLTextAreaElement | null = null;
  constructor(opts: StudioOptions){
    this.opts = opts;
    if (!document.getElementById('ka-studio-page-css')){
      const s = document.createElement('style'); s.id = 'ka-studio-page-css'; s.textContent = PAGE_CSS; document.head.appendChild(s);
    }
    if (!document.getElementById('ka-studio-fonts')){
      const l = document.createElement('link'); l.id = 'ka-studio-fonts'; l.rel = 'stylesheet'; l.href = FONT_CSS; document.head.appendChild(l);
    }
    this.host = document.createElement('div');
    this.host.className = 'ka-studio-host';
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = css;
    this.root.appendChild(style);
    const wrap = document.createElement('div');
    wrap.className = 'studio';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Typography studio');
    wrap.innerHTML = TEMPLATE;
    this.root.appendChild(wrap);
    this.stage = wrap.querySelector('.stage') as HTMLDivElement;
    [this.bgC, this.inkC, this.liveC] = ['bg', 'ink', 'live'].map(n => wrap.querySelector(`canvas.${n}`) as HTMLCanvasElement);
    const ctx = (c: HTMLCanvasElement) => c.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
    this.bgX = ctx(this.bgC); this.inkX = ctx(this.inkC); this.liveX = ctx(this.liveC);
    document.body.appendChild(this.host);
    document.documentElement.classList.add('ka-studio-open');
    if (!session.world.w){ session.world = { w: window.innerWidth, h: window.innerHeight }; }
    this.buildToolbar();
    this.layoutForScreen();
    this.bindInput();
    this.resize();
    this.applyToolbarState();
    this.on(window, 'resize', () => this.resize());
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.stopLoop(); else this.kick(); });
    this.on(document, 'fullscreenchange', () => this.syncFullscreen());
    (this.root.querySelector('[data-act="brush-menu"]') as HTMLElement).focus();
    this.announce('Studio open. Draw with your mouse, finger or pen. Press question mark for shortcuts.');
  }
  $(sel: string){ return this.root.querySelector(sel) as HTMLElement; }
  on(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions){ target.addEventListener(type, fn, opts); this.cleanups.push(() => target.removeEventListener(type, fn, opts)); }
  announce(text: string){ const l = this.$('.live-region'); l.textContent = ''; requestAnimationFrame(() => { l.textContent = text; }); }
  toast(text: string){
    const t = this.$('.toast'); t.textContent = text; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout((t as unknown as { _t: number })._t); (t as unknown as { _t: number })._t = window.setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---- geometry: the drawing keeps its own "world" size; the view letterboxes it on resize ----
  resize(){
    const vw = window.innerWidth, vh = window.innerHeight;
    const budget = (navigator as unknown as { deviceMemory?: number }).deviceMemory && (navigator as unknown as { deviceMemory: number }).deviceMemory <= 4 ? 2_500_000 : 5_000_000;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(budget / (vw * vh)));
    this.scale = Math.min(vw / session.world.w, vh / session.world.h);
    this.offX = (vw - session.world.w * this.scale) / 2; this.offY = (vh - session.world.h * this.scale) / 2;
    for (const c of [this.bgC, this.inkC, this.liveC]){ c.width = Math.round(vw * this.dpr); c.height = Math.round(vh * this.dpr); c.style.width = vw + 'px'; c.style.height = vh + 'px'; }
    this.renderBackground();
    this.rebuildInk();
    this.kick();
  }
  viewTransform(ctx: CanvasRenderingContext2D){ ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.offX, this.dpr * this.offY); }
  toWorld(e: PointerEvent | MouseEvent){ const r = this.stage.getBoundingClientRect(); return { x: (e.clientX - r.left - this.offX) / this.scale, y: (e.clientY - r.top - this.offY) / this.scale }; }
  renderOpts(){ return { now: now(), cx: session.world.w / 2, cy: session.world.h / 2 }; }

  renderBackground(){
    const x = this.bgX, bg = session.bg;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.bgC.width, this.bgC.height);
    this.stage.classList.toggle('is-space', bg.kind === 'space');
    if (bg.kind !== 'space') drawBackground(x, bg, this.bgC.width, this.bgC.height);
    this.stage.style.setProperty('--filter', FILTERS.find(f => f.id === session.filter)?.css || 'none');
  }
  isStatic(it: Item){ return it.s.lifetime <= 0 && !(it.kind === 'stroke' && it.s.brush === 'particles' && needsAnimation(it, now())); }
  rebuildInk(){
    const x = this.inkX;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.inkC.width, this.inkC.height);
    this.viewTransform(x);
    this.baked.clear(); this.animated.clear();
    const o = { ...this.renderOpts(), frozen: true };
    for (const it of session.items){
      if (this.isStatic(it)){ drawItem(x, it, o); this.baked.add(it.id); }
      else if (isAlive(it, o.now)) this.animated.add(it.id);
    }
  }
  bake(it: Item){ this.viewTransform(this.inkX); drawItem(this.inkX, it, { ...this.renderOpts(), frozen: true }); this.baked.add(it.id); this.animated.delete(it.id); }

  // ---- frame loop: runs only while something moves ----
  kick(){ if (!this.raf && !document.hidden) this.raf = requestAnimationFrame((t) => this.frame(t)); }
  stopLoop(){ cancelAnimationFrame(this.raf); this.raf = 0; }
  frame(_t: number){
    this.raf = 0;
    const x = this.liveX, n = now();
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.liveC.width, this.liveC.height);
    this.viewTransform(x);
    let again = false;
    if (this.replay){
      const clock = n - this.replay.t0;
      const o = { now: clock, clip: clock, cx: session.world.w / 2, cy: session.world.h / 2 };
      for (const it of this.replay.items) drawItem(x, it, o);
      this.replay.record?.(Math.min(1, clock / this.replay.duration));
      if (clock < this.replay.duration) again = true; else this.endReplay();
    } else {
      const o = this.renderOpts();
      for (const it of session.items){
        if (!this.animated.has(it.id)) continue;
        if (!isAlive(it, n)){ this.animated.delete(it.id); continue; }
        if (it.s.lifetime <= 0 && !needsAnimation(it, n)){ this.bake(it); continue; }   // settled particles become ink
        drawItem(x, it, o); again = true;
      }
      if (this.current){ drawItem(x, this.current, o); again = true; }
    }
    if (again) this.kick();
  }

  // ---- drawing input ----
  bindInput(){
    const c = this.liveC;
    this.on(c, 'pointerdown', ((e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (this.replay) return;
      this.closePanels();
      if (session.tool === 'text'){ e.preventDefault(); this.placeText(e); return; }
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      this.begin(e);
    }) as EventListener);
    this.on(c, 'pointermove', ((e: PointerEvent) => {
      if (this.pointerId === e.pointerId && this.current){
        const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
        for (const ce of (list.length ? list : [e])) this.extend(ce);
        this.kick();
      } else if (session.hoverDraw && e.pointerType !== 'touch' && e.buttons === 0 && session.tool === 'brush' && !this.replay){
        if (!this.current) this.begin(e, true);
        this.extend(e); this.kick();
        clearTimeout(this.hoverTimer);
        this.hoverTimer = window.setTimeout(() => this.finish(), 280);
      }
    }) as EventListener);
    const end = ((e: PointerEvent) => { if (this.pointerId === e.pointerId) this.finish(); }) as EventListener;
    this.on(c, 'pointerup', end); this.on(c, 'pointercancel', end);
    this.on(c, 'pointerleave', ((e: PointerEvent) => { if (this.pointerId === null && this.current) this.finish(); void e; }) as EventListener);
    this.on(c, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  }
  begin(e: PointerEvent, hover = false){
    if (totalPoints(session.items) > MAX_POINTS){ this.toast('The canvas is full. Clear some strokes or export first.'); return; }
    const kind = session.tool === 'eraser' ? 'erase' : 'stroke';
    const s = { ...session.settings };
    if (kind === 'erase'){ s.lifetime = 0; s.size = Math.max(s.size, 6) * 2; s.symmetry = 'none'; s.glow = 0; s.blur = 0; }
    this.current = newStroke(kind, session.nextId++, s, now());
    this.pointerId = hover ? null : e.pointerId;
    const p = this.toWorld(e);
    this.sx = p.x; this.sy = p.y; this.lastX = p.x; this.lastY = p.y; this.midX = p.x; this.midY = p.y; this.lastT = e.timeStamp; this.pressure = 0.6; this.lastP = 0.6;
    pushPoint(this.current, p.x, p.y, 0, this.pressureOf(e, 0));
    this.kick();
  }
  pressureOf(e: PointerEvent, speed: number){
    if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
    // mouse/touch have no real pressure: slower strokes read as heavier, like ink pooling
    const target = Math.max(0.28, Math.min(1, 1.05 - speed * 0.35));
    this.pressure += (target - this.pressure) * 0.35;
    return this.pressure;
  }
  extend(e: PointerEvent){
    const st = this.current; if (!st) return;
    const p = this.toWorld(e);
    // stabilizer (lazy follow): lighter on touch, where events are fewer and a heavy lag reads as stiff, straight lines
    const k = e.pointerType === 'touch' ? 0.55 : 0.9;
    const follow = 1 - Math.min(0.92, session.settings.smoothing * k);
    this.sx += (p.x - this.sx) * follow; this.sy += (p.y - this.sy) * follow;
    const dx = this.sx - this.lastX, dy = this.sy - this.lastY, dist = Math.hypot(dx, dy);
    if (dist < 0.6) return;
    const dt = Math.max(1, e.timeStamp - this.lastT);
    const pr = this.pressureOf(e, dist / dt);
    // A smooth curve, not straight segments: from the last midpoint, bending through the last point, to the new midpoint.
    // Sampled every couple of pixels, so a phone that reports few touch points still draws a fluid freehand line.
    const mx = (this.lastX + this.sx) / 2, my = (this.lastY + this.sy) / 2;
    const len = Math.hypot(this.lastX - this.midX, this.lastY - this.midY) + Math.hypot(mx - this.lastX, my - this.lastY);
    const steps = Math.max(1, Math.min(48, Math.ceil(len / (2.2 / Math.max(0.25, this.scale)))));
    const t1 = now() - st.start;
    for (let i = 1; i <= steps; i++){
      const t = i / steps, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      pushPoint(st, a * this.midX + b * this.lastX + c * mx, a * this.midY + b * this.lastY + c * my, t1, this.lastP + (pr - this.lastP) * t);
    }
    this.midX = mx; this.midY = my; this.lastP = pr;
    this.lastX = this.sx; this.lastY = this.sy; this.lastT = e.timeStamp;
  }
  finish(){
    const st = this.current;
    // the line ends where the finger was lifted, not where the stabilizer had got to
    if (st && st.n > 0 && Math.hypot(this.lastX - this.midX, this.lastY - this.midY) > 0.6) pushPoint(st, this.lastX, this.lastY, now() - st.start, this.lastP);
    this.current = null; this.pointerId = null;
    clearTimeout(this.hoverTimer);
    if (!st || st.n === 0) return;
    // shrink storage to what was used
    st.pts = st.pts.slice(0, st.n * POINT_STRIDE);
    this.commit(st);
  }
  commit(it: Item){
    session.items.push(it); session.undo.push({ type: 'add', item: it }); session.redo = [];
    if (this.isStatic(it)) this.bake(it); else this.animated.add(it.id);
    this.kick(); this.updateHistoryButtons();
  }

  // ---- text tool ----
  placeText(e: PointerEvent){
    this.commitText();
    const p = this.toWorld(e);
    const ta = document.createElement('textarea');
    ta.className = 'text-editor';
    ta.setAttribute('aria-label', 'Type your text. Enter to place it, Shift+Enter for a new line, Escape to cancel.');
    ta.rows = 1;
    const px = session.fontPx * this.scale;
    Object.assign(ta.style, { left: `${p.x * this.scale + this.offX}px`, top: `${p.y * this.scale + this.offY}px`, font: `${px}px ${session.font}`, color: session.settings.color });
    ta.dataset.x = String(p.x); ta.dataset.y = String(p.y); ta.dataset.start = String(now());
    this.stage.appendChild(ta);
    this.textEditor = ta;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; ta.style.width = 'auto'; ta.style.width = Math.max(40, ta.scrollWidth + 8) + 'px'; };
    ta.addEventListener('input', grow);
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); this.commitText(); }
      else if (ev.key === 'Escape'){ ev.preventDefault(); ev.stopPropagation(); ta.remove(); this.textEditor = null; }
    });
    ta.addEventListener('blur', () => this.commitText());
    requestAnimationFrame(() => ta.focus());
  }
  commitText(){
    const ta = this.textEditor; if (!ta) return;
    this.textEditor = null;
    const text = ta.value.replace(/\s+$/, '');
    const x = Number(ta.dataset.x), y = Number(ta.dataset.y), start = Number(ta.dataset.start);
    ta.remove();
    if (!text) return;
    const item: TextItem = { kind: 'text', id: session.nextId++, seed: (Math.random() * 2 ** 31) | 0, s: { ...session.settings }, x, y, text: text.slice(0, 500), font: session.font, px: session.fontPx, start, end: Math.min(now(), start + 2400) };
    const family = session.font.split(',')[0];
    (document.fonts ? document.fonts.load(`${session.fontPx}px ${family}`) : Promise.resolve()).catch(() => {}).then(() => this.commit(item));
  }

  // ---- history ----
  undoAct(){
    const e = session.undo.pop(); if (!e) return;
    if (e.type === 'add') session.items = session.items.filter(i => i !== e.item);
    else session.items = e.items.slice();
    session.redo.push(e); this.rebuildInk(); this.kick(); this.updateHistoryButtons(); this.announce('Undone');
  }
  redoAct(){
    const e = session.redo.pop(); if (!e) return;
    if (e.type === 'add') session.items.push(e.item); else session.items = [];
    session.undo.push(e); this.rebuildInk(); this.kick(); this.updateHistoryButtons(); this.announce('Redone');
  }
  clearAct(){
    if (!session.items.length) return;
    this.confirm('Clear the whole canvas?', 'You can undo this.', 'Clear', () => {
      session.undo.push({ type: 'clear', items: session.items.slice() }); session.redo = [];
      session.items = []; this.rebuildInk(); this.kick(); this.updateHistoryButtons(); this.announce('Canvas cleared');
    });
  }
  updateHistoryButtons(){
    (this.$('[data-act="undo"]') as HTMLButtonElement).disabled = !session.undo.length;
    (this.$('[data-act="redo"]') as HTMLButtonElement).disabled = !session.redo.length;
    (this.$('[data-act="replay"]') as HTMLButtonElement).disabled = !session.items.length;
  }

  // ---- replay ----
  startReplay(record?: (p: number) => void, done?: () => void){
    if (!session.items.length) return;
    this.commitText();
    const { offsets, duration } = replayTimeline(session.items);
    this.replay = { t0: now(), items: retimed(session.items, offsets), duration, record, done };
    this.stage.classList.add('is-replaying');
    this.$('[data-act="replay"]').setAttribute('aria-pressed', 'true');
    this.kick();
  }
  endReplay(){
    const r = this.replay; this.replay = null;
    this.stage.classList.remove('is-replaying');
    this.$('[data-act="replay"]').setAttribute('aria-pressed', 'false');
    r?.done?.();
    this.kick();
  }

  // ---- export ----
  spaceSnapshot(): Promise<HTMLCanvasElement | null>{
    // the nebula is a WebGL canvas; its pixels are readable in the same frame it was drawn
    const src = document.querySelector('#nebula-bg canvas') as HTMLCanvasElement | null;
    if (!src || !src.width) return Promise.resolve(null);
    return new Promise(resolve => requestAnimationFrame(() => {
      try {
        const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
        const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(src, 0, 0);
        const probe = x.getImageData(0, 0, c.width, c.height).data;
        let lit = 0; for (let i = 0; i < probe.length; i += 4 * 997) if (probe[i] + probe[i + 1] + probe[i + 2] > 12) lit++;
        resolve(lit > 3 ? c : null);
      } catch { resolve(null); }
    }));
  }
  exportSize(kind: string){
    const w = session.world.w, h = session.world.h;
    const lowMem = ((navigator as unknown as { deviceMemory?: number }).deviceMemory || 8) <= 4;
    const longEdge = kind === '4k' ? (lowMem ? 2560 : 3840) : kind === '2x' ? Math.max(w, h) * 2 : Math.max(w, h) * Math.min(2, window.devicePixelRatio || 1);
    const s = Math.min(longEdge / Math.max(w, h), Math.sqrt((lowMem ? 9e6 : 16.6e6) / (w * h)));
    return { W: Math.round(w * s), H: Math.round(h * s), s };
  }
  async exportImage(format: 'png' | 'jpg', size: string, transparent: boolean){
    this.commitText();
    const { W, H, s } = this.exportSize(size);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    const opaque = format === 'jpg' || !transparent;
    if (opaque){
      if (session.bg.kind === 'space'){ const snap = await this.spaceSnapshot(); drawBackground(x, session.bg, W, H, snap); this.toast(snap ? 'Exported with your space background.' : 'Exported with a drawn version of the space background.'); }
      else drawBackground(x, session.bg, W, H);
    }
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    renderScene(layer.getContext('2d')!, session.items, { now: now(), cx: session.world.w / 2, cy: session.world.h / 2, frozen: false }, s);
    const filter = FILTERS.find(f => f.id === session.filter)?.css || 'none';
    if (filter !== 'none' && 'filter' in x) x.filter = filter;
    x.drawImage(layer, 0, 0); x.filter = 'none';
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95));
    layer.width = layer.height = 0; c.width = c.height = 0;
    if (!blob){ this.toast('This browser couldn’t create the image. Try a smaller size.'); return; }
    this.download(blob, `ka-typography-${stamp()}.${format}`);
  }
  videoType(){
    if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
    for (const t of ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) if (MediaRecorder.isTypeSupported(t)) return t;
    return null;
  }
  async exportVideo(){
    const type = this.videoType();
    if (!type){ this.toast('Video export isn’t supported in this browser. Try Chrome, Edge or Firefox, or export an image.'); return; }
    if (!session.items.length){ this.toast('Draw something first.'); return; }
    this.commitText();
    const w = session.world.w, h = session.world.h, s = Math.min(1920 / Math.max(w, h), 1080 / Math.min(w, h), 2);
    const W = Math.round(w * s / 2) * 2, H = Math.round(h * s / 2) * 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d')!;
    const snap = session.bg.kind === 'space' ? await this.spaceSnapshot() : null;
    const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
    const bgx = bg.getContext('2d')!;
    if (session.bg.kind === 'space' && !snap) drawSpaceFallback(bgx, W, H); else drawBackground(bgx, session.bg, W, H, snap);
    const filter = FILTERS.find(f => f.id === session.filter)?.css || 'none';
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    const bar = this.$('.progress'), barFill = this.$('.progress i');
    bar.hidden = false; this.$('.progress-label').textContent = 'Recording video…';
    const { offsets, duration } = replayTimeline(session.items);
    const items = retimed(session.items, offsets);
    const t0 = performance.now();
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    const lx = layer.getContext('2d')!;
    await new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
      rec.start(250);
      const tick = () => {
        const clock = performance.now() - t0;
        x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(bg, 0, 0);
        lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, W, H);
        renderScene(lx, items, { now: clock, clip: clock, cx: w / 2, cy: h / 2 }, s);
        if (filter !== 'none' && 'filter' in x) x.filter = filter;
        x.drawImage(layer, 0, 0); x.filter = 'none';
        (barFill as HTMLElement).style.transform = `scaleX(${Math.min(1, clock / duration)})`;
        if (clock < duration + 600) requestAnimationFrame(tick); else rec.stop();
      };
      requestAnimationFrame(tick);
    });
    stream.getTracks().forEach(t => t.stop());
    this.$('.progress-label').textContent = 'Preparing file…';
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    bar.hidden = true; c.width = c.height = layer.width = layer.height = bg.width = bg.height = 0;
    this.download(blob, `ka-typography-${stamp()}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`);
  }
  download(blob: Blob, name: string){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.announce(`Saved ${name}`);
  }

  // ---- fullscreen / toolbar visibility ----
  toggleFullscreen(){
    const el = this.host as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => this.toast('Fullscreen isn’t available here.'));
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else this.toast('Fullscreen isn’t available here.');
  }
  syncFullscreen(){ this.$('[data-act="fullscreen"]').setAttribute('aria-pressed', String(!!document.fullscreenElement)); setTimeout(() => this.resize(), 60); }
  applyToolbarState(){
    this.$('.studio').classList.toggle('tools-hidden', session.toolbarHidden);
    this.$('[data-act="show-tools"]').hidden = !session.toolbarHidden;
    this.updateToolButtons(); this.updateHistoryButtons();
  }

  // ---- phone layout: the same buttons are moved (never copied) into a top bar, a Save corner and a swipe strip, and back on a larger screen ----
  layoutForScreen(){
    const mq = window.matchMedia('(max-width:700px), (max-width:1100px) and (pointer:coarse), (max-height:500px) and (pointer:coarse)');
    const moves: [string, string][] = [
      ['[data-act="undo"]', '.tb-history'], ['[data-act="redo"]', '.tb-history'], ['[data-act="hide-tools"]', '.tb-hide'], ['[data-act="export"]', '.savebar'],
      ['[data-act="replay"]', '.rare'], ['[data-act="fullscreen"]', '.rare'], ['[data-act="clear"]', '.rare'], ['[data-act="help"]', '.rare']
    ];
    const nodes = moves.map(([sel, dest]) => { const el = this.$(sel), mark = document.createComment('slot'); el.before(mark); return { el, mark, dest }; });
    const apply = () => {
      for (const n of nodes){ if (mq.matches) this.$(n.dest).appendChild(n.el); else n.mark.after(n.el); }
      this.$('.studio').classList.toggle('is-compact', mq.matches);
      this.closePanels();
    };
    apply();
    mq.addEventListener('change', apply);
    this.cleanups.push(() => mq.removeEventListener('change', apply));
  }

  // ---- toolbar ----
  buildToolbar(){
    const r = this.root;
    const brushGrid = this.$('.brush-grid');
    for (const [i, b] of BRUSHES.entries()){
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'brush-opt'; btn.dataset.brush = b.id; btn.setAttribute('role', 'menuitemradio');
      btn.innerHTML = `<canvas width="120" height="44" aria-hidden="true"></canvas><span>${b.name}</span><kbd>${(i + 1) % 10}</kbd>`;
      brushGrid.appendChild(btn);
    }
    const fontSel = this.$('select[name="font"]') as HTMLSelectElement;
    for (const f of FONTS){ const o = document.createElement('option'); o.value = f.family; o.textContent = `${f.label}${f.kind === 'hand' ? ' (handwriting)' : ''}`; fontSel.appendChild(o); }
    const blendSel = this.$('select[name="blend"]') as HTMLSelectElement;
    for (const b of BLENDS){ const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; blendSel.appendChild(o); }
    const filterSel = this.$('select[name="filter"]') as HTMLSelectElement;
    for (const f of FILTERS){ const o = document.createElement('option'); o.value = f.id; o.textContent = f.name; filterSel.appendChild(o); }
    this.syncControls();
    this.drawBrushPreviews();

    this.on(r, 'click', ((e: Event) => {
      const t = (e.target as HTMLElement).closest('[data-act],[data-brush],[data-bg]') as HTMLElement | null;
      if (!t) return;
      const act = t.dataset.act;
      if (t.dataset.brush){ this.setBrush(t.dataset.brush as BrushId); this.closePanels(); return; }
      if (t.dataset.bg){ this.setBackground(t.dataset.bg); return; }
      switch (act){
        case 'brush-menu': this.togglePanel('brushes', t); break;
        case 'eraser': this.setTool(session.tool === 'eraser' ? 'brush' : 'eraser'); break;
        case 'text': this.setTool(session.tool === 'text' ? 'brush' : 'text'); break;
        case 'trail': this.toggleTrail(); break;
        case 'effects': this.togglePanel('effects', t); break;
        case 'background': this.togglePanel('backgrounds', t); break;
        case 'export': this.togglePanel('export', t); break;
        case 'undo': this.undoAct(); break;
        case 'redo': this.redoAct(); break;
        case 'replay': this.replay ? this.endReplay() : this.startReplay(); break;
        case 'clear': this.clearAct(); break;
        case 'fullscreen': this.toggleFullscreen(); break;
        case 'hide-tools': session.toolbarHidden = true; this.closePanels(); this.applyToolbarState(); this.$('[data-act="show-tools"]').focus(); break;
        case 'show-tools': session.toolbarHidden = false; this.applyToolbarState(); this.$('[data-act="brush-menu"]').focus(); break;
        case 'help': this.togglePanel('help', t); break;
        case 'close': this.close(); break;
        case 'do-export': this.runExport(); break;
      }
    }) as EventListener);
    this.on(r, 'input', ((e: Event) => this.onControl(e.target as HTMLInputElement)) as EventListener);
    this.on(r, 'change', ((e: Event) => this.onControl(e.target as HTMLInputElement)) as EventListener);
    this.on(r, 'keydown', ((e: KeyboardEvent) => this.onKey(e)) as EventListener);
    this.on(document, 'keydown', ((e: KeyboardEvent) => { if (!this.root.contains(this.root.activeElement) && open === this) this.onKey(e); }) as EventListener);
    // toolbar arrow-key navigation (roving focus among visible buttons)
    this.on(this.$('.toolbar'), 'keydown', ((e: KeyboardEvent) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const btns = Array.from(this.$('.toolbar').querySelectorAll<HTMLElement>(':scope > .group > button:not([disabled]), :scope > .group > label')).filter(b => b.offsetParent);
      const i = btns.indexOf(this.root.activeElement as HTMLElement);
      if (i < 0) return;
      e.preventDefault();
      btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length].focus();
    }) as EventListener);
  }
  drawBrushPreviews(){
    this.root.querySelectorAll<HTMLButtonElement>('.brush-opt').forEach(btn => {
      const c = btn.querySelector('canvas')!, x = c.getContext('2d')!;
      x.clearRect(0, 0, c.width, c.height);
      const st = newStroke('stroke', -1, { ...session.settings, brush: btn.dataset.brush as BrushId, size: 5, lifetime: 0, symmetry: 'none', glow: 0, blur: 0, opacity: 1 }, 0);
      st.seed = 7;
      for (let i = 0; i <= 40; i++){ const t = i / 40; pushPoint(st, 10 + t * 100, 22 + Math.sin(t * Math.PI * 2) * 11, t * 400, 0.35 + 0.65 * Math.sin(t * Math.PI)); }
      drawItem(x, st, { now: 0, cx: 60, cy: 22, frozen: true });
    });
  }
  syncControls(){
    const s = session.settings, set = (name: string, v: string | number | boolean) => {
      const el = this.root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) return;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const out = this.root.querySelector(`output[for="${name}"]`); if (out) out.textContent = this.fmt(name, Number(v));
    };
    set('color', s.color); set('color2', s.color2); set('gradient', s.gradient); set('size', s.size); set('opacity', s.opacity);
    set('smoothing', s.smoothing); set('pressure', s.pressure); set('symmetry', s.symmetry); set('radial', s.radial); set('blend', s.blend);
    set('glow', s.glow); set('blur', s.blur); set('lifetime', s.lifetime); set('flow', s.flow); set('wobble', s.wobble);
    set('filter', session.filter); set('hover', session.hoverDraw); set('font', session.font); set('fontPx', session.fontPx);
    (this.$('.swatch2') as HTMLElement).hidden = !s.gradient;
    (this.$('.radial-row') as HTMLElement).hidden = s.symmetry !== 'radial';
    this.$('[data-act="trail"]').setAttribute('aria-pressed', String(s.lifetime > 0));
    this.$('.color-dot').style.background = s.gradient ? `linear-gradient(135deg, ${s.color}, ${s.color2})` : s.color;
  }
  fmt(name: string, v: number){
    if (name === 'opacity' || name === 'smoothing') return Math.round(v * 100) + '%';
    if (name === 'lifetime') return v <= 0 ? 'Permanent' : `${v.toFixed(1)} s`;
    if (name === 'flow' || name === 'wobble') return v.toFixed(1) + '×';
    return String(Math.round(v));
  }
  onControl(el: HTMLInputElement){
    const name = el.name; if (!name) return;
    const s = session.settings;
    const num = Number(el.value);
    switch (name){
      case 'color': s.color = el.value; break; case 'color2': s.color2 = el.value; break;
      case 'gradient': s.gradient = el.checked; break; case 'size': s.size = num; break; case 'opacity': s.opacity = num; break;
      case 'smoothing': s.smoothing = num; break; case 'pressure': s.pressure = el.checked; break;
      case 'symmetry': s.symmetry = el.value as Settings['symmetry']; break; case 'radial': s.radial = num; break;
      case 'blend': s.blend = el.value as GlobalCompositeOperation; break; case 'glow': s.glow = num; break; case 'blur': s.blur = num; break;
      case 'lifetime': s.lifetime = num; if (num > 0) session.lastTrail = num; break; case 'flow': s.flow = num; break; case 'wobble': s.wobble = num; break;
      case 'filter': session.filter = el.value; this.renderBackground(); break;
      case 'hover': session.hoverDraw = el.checked; break;
      case 'font': session.font = el.value; break; case 'fontPx': session.fontPx = num; break;
      case 'bgcolor': this.setBackground('solid', el.value); return;
      case 'bga': case 'bgb': case 'bgangle': this.setBackground('gradient'); return;
      default: return;
    }
    this.syncControls();
    if (['color', 'color2', 'gradient'].includes(name)) this.drawBrushPreviews();
  }
  // Ink <-> fading cursor trail in one tap (the length is remembered and set in Effects).
  toggleTrail(){
    const s = session.settings;
    if (s.lifetime > 0){ session.lastTrail = s.lifetime; s.lifetime = 0; } else s.lifetime = session.lastTrail || 2.5;
    this.syncControls();
    this.announce(s.lifetime > 0 ? `Trail on: strokes fade after ${s.lifetime} seconds` : 'Permanent ink');
  }
  setBrush(id: BrushId){
    session.settings.brush = id; session.tool = 'brush';
    this.updateToolButtons(); this.announce(`${BRUSHES.find(b => b.id === id)?.name} brush`);
  }
  setTool(t: 'brush' | 'eraser' | 'text'){
    this.commitText();
    session.tool = t; this.updateToolButtons();
    this.announce(t === 'text' ? 'Text tool: click the canvas to type' : t === 'eraser' ? 'Eraser' : 'Brush');
  }
  updateToolButtons(){
    const b = BRUSHES.find(x => x.id === session.settings.brush)!;
    this.$('[data-act="brush-menu"] .label').textContent = b.name;
    this.$('[data-act="brush-menu"]').setAttribute('aria-pressed', String(session.tool === 'brush'));
    this.$('[data-act="eraser"]').setAttribute('aria-pressed', String(session.tool === 'eraser'));
    this.$('[data-act="text"]').setAttribute('aria-pressed', String(session.tool === 'text'));
    this.$('.text-options').hidden = session.tool !== 'text';
    this.root.querySelectorAll<HTMLElement>('.brush-opt').forEach(el => el.setAttribute('aria-checked', String(el.dataset.brush === session.settings.brush)));
    this.stage.dataset.tool = session.tool;
  }
  setBackground(kind: string, color?: string){
    if (kind === 'space') session.bg = { kind: 'space' };
    else if (kind === 'black') session.bg = { kind: 'solid', color: '#000000' };
    else if (kind === 'white') session.bg = { kind: 'solid', color: '#ffffff' };
    else if (kind === 'solid') session.bg = { kind: 'solid', color: color || (this.$('[name="bgcolor"]') as HTMLInputElement).value };
    else if (kind === 'gradient') session.bg = { kind: 'gradient', a: (this.$('[name="bga"]') as HTMLInputElement).value, b: (this.$('[name="bgb"]') as HTMLInputElement).value, angle: Number((this.$('[name="bgangle"]') as HTMLInputElement).value) };
    this.root.querySelectorAll<HTMLElement>('[data-bg]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.bg === kind || (kind === 'solid' && el.dataset.bg === 'solid'))));
    this.renderBackground();
  }
  openPanel: string | null = null;
  togglePanel(name: string, trigger: HTMLElement){
    const was = this.openPanel === name;
    this.closePanels();
    if (was) return;
    const p = this.$(`.panel[data-panel="${name}"]`);
    p.hidden = false; this.openPanel = name; trigger.setAttribute('aria-expanded', 'true');
    const first = p.querySelector<HTMLElement>('button, input, select'); first?.focus();
  }
  closePanels(){
    this.root.querySelectorAll<HTMLElement>('.panel').forEach(p => { p.hidden = true; });
    this.root.querySelectorAll<HTMLElement>('[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    this.openPanel = null;
  }
  runExport(){
    const fmt = (this.root.querySelector('[name="xformat"]:checked') as HTMLInputElement).value;
    const size = (this.$('[name="xsize"]') as HTMLSelectElement).value;
    const transparent = (this.$('[name="xtransparent"]') as HTMLInputElement).checked;
    this.closePanels();
    if (fmt === 'video') this.exportVideo(); else this.exportImage(fmt as 'png' | 'jpg', size, transparent);
  }
  confirm(title: string, body: string, ok: string, onOk: () => void){
    const d = this.$('.confirm');
    d.querySelector('h2')!.textContent = title; d.querySelector('p')!.textContent = body;
    const okBtn = d.querySelector('[data-confirm="ok"]') as HTMLButtonElement, cancel = d.querySelector('[data-confirm="cancel"]') as HTMLButtonElement;
    okBtn.textContent = ok; d.hidden = false; cancel.focus();
    const done = (yes: boolean) => { d.hidden = true; okBtn.onclick = cancel.onclick = null; if (yes) onOk(); };
    okBtn.onclick = () => done(true); cancel.onclick = () => done(false);
  }
  onKey(e: KeyboardEvent){
    const target = e.composedPath()[0] as HTMLElement;
    const typing = target && (target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'color'].includes((target as HTMLInputElement).type)) || target.tagName === 'SELECT');
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape'){
      if (!this.$('.confirm').hidden){ this.$('[data-confirm="cancel"]').click(); e.preventDefault(); return; }
      if (this.openPanel){ this.closePanels(); e.preventDefault(); return; }
      if (this.replay){ this.endReplay(); e.preventDefault(); return; }
      e.preventDefault(); this.close(); return;
    }
    if (mod && e.key.toLowerCase() === 'z'){ e.preventDefault(); e.shiftKey ? this.redoAct() : this.undoAct(); return; }
    if (mod && e.key.toLowerCase() === 'y'){ e.preventDefault(); this.redoAct(); return; }
    if (typing || mod || e.altKey) return;
    const k = e.key.toLowerCase();
    const s = session.settings;
    if (/^[0-9]$/.test(k)){ const i = (Number(k) + 9) % 10; this.setBrush(BRUSHES[i].id); }
    else if (k === 'b') this.setTool('brush');
    else if (k === 'e') this.setTool('eraser');
    else if (k === 't') this.setTool('text');
    else if (k === 'l') this.toggleTrail();
    else if (k === '[') { s.size = Math.max(1, s.size - (s.size > 10 ? 2 : 1)); this.syncControls(); }
    else if (k === ']') { s.size = Math.min(80, s.size + (s.size >= 10 ? 2 : 1)); this.syncControls(); }
    else if (k === 'r') this.replay ? this.endReplay() : this.startReplay();
    else if (k === 'f') this.toggleFullscreen();
    else if (k === 'h'){ session.toolbarHidden = !session.toolbarHidden; this.closePanels(); this.applyToolbarState(); }
    else if (k === 'delete' || k === 'backspace') this.clearAct();
    else if (k === '?') this.togglePanel('help', this.$('[data-act="help"]'));
    else return;
    e.preventDefault();
  }
  close(){
    this.commitText();
    this.stopLoop(); this.endReplayQuiet();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.cleanups.forEach(fn => fn()); this.cleanups = [];
    for (const c of [this.bgC, this.inkC, this.liveC]){ c.width = c.height = 0; }
    this.host.remove();
    document.documentElement.classList.remove('ka-studio-open');
    open = null;
    this.opts.returnFocus?.focus({ preventScroll: true });
  }
  endReplayQuiet(){ this.replay = null; }
}

function stamp(){ const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`; }

const I = {
  pen: '<path d="M4 20c3.5-.2 5.2-2 6.4-5.2L14 5.5"/><path d="m14 5.5 3.2-1.8 2.3 2.3-1.8 3.2-4.6 1.7z"/>',
  eraser: '<path d="m7 21-4-4 11-11 7 7-8 8z"/><path d="M10 21h11"/><path d="m9 9 7 7"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  replay: '<path d="M7 5v14l11-7z"/>',
  effects: '<path d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5"/><circle cx="12" cy="12" r="3.2"/>',
  bg: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>',
  export: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  hide: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 22 12a14 14 0 0 1-3 3.7M6.1 6.1A14 14 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.4-1"/>',
  clear: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 2-2.5 2.2-2.5 4"/><path d="M12 17.5h.01"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  tools: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  trail: '<circle cx="17.5" cy="6.5" r="2.5"/><path d="M15.5 8.5 4 20M12.5 6.5 5 14M17.5 11.5 10 19"/>'
};
const icon = (p: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
const range = (name: string, label: string, min: number, max: number, step: number) =>
  `<label class="row"><span>${label}</span><input type="range" name="${name}" min="${min}" max="${max}" step="${step}"><output for="${name}"></output></label>`;
const check = (name: string, label: string) => `<label class="row check"><input type="checkbox" name="${name}"><span>${label}</span></label>`;

const TEMPLATE = `
<div class="stage" data-tool="brush">
  <canvas class="bg" aria-hidden="true"></canvas>
  <canvas class="ink" aria-hidden="true"></canvas>
  <canvas class="live" role="img" aria-label="Drawing canvas. Draw with a mouse, finger or pen."></canvas>
</div>
<button type="button" class="corner close" data-act="close" aria-label="Close studio (Escape)">${icon(I.close)}</button>
<button type="button" class="show-tools" data-act="show-tools" hidden aria-label="Show tools (H)">${icon(I.tools)}<span>Tools</span></button>
<div class="topbar"><div class="tb-history" role="group" aria-label="History"></div><div class="tb-hide"></div></div>
<div class="toolbar-wrap">
  <div class="panel" data-panel="brushes" hidden role="menu" aria-label="Brushes"><div class="brush-grid"></div></div>
  <div class="panel" data-panel="effects" hidden aria-label="Brush and trail settings">
    <div class="cols">
      <fieldset><legend>Stroke</legend>
        ${range('opacity', 'Opacity', 0.05, 1, 0.05)}${range('smoothing', 'Smoothing', 0, 1, 0.05)}${check('pressure', 'Pressure (pen) / speed (mouse, touch)')}
        <label class="row"><span>Symmetry</span><select name="symmetry"><option value="none">None</option><option value="mirror-x">Mirror left–right</option><option value="mirror-y">Mirror top–bottom</option><option value="quad">Four-way</option><option value="radial">Radial</option></select></label>
        <div class="radial-row">${range('radial', 'Radial copies', 2, 24, 1)}</div>
      </fieldset>
      <fieldset><legend>Look</legend>
        <label class="row"><span>Blend</span><select name="blend"></select></label>
        ${range('glow', 'Glow', 0, 60, 1)}${range('blur', 'Blur', 0, 20, 0.5)}
        <label class="row"><span>Filter</span><select name="filter"></select></label>
      </fieldset>
      <fieldset><legend>Trail animation</legend>
        ${range('lifetime', 'Trail lifetime', 0, 10, 0.5)}${range('flow', 'Flow speed', 0.2, 4, 0.1)}${range('wobble', 'Wobble', 0, 3, 0.1)}
        ${check('hover', 'Draw without pressing (mouse / pen hover)')}
        <p class="hint">Lifetime 0 = permanent ink. Anything above fades like a cursor trail.</p>
      </fieldset>
    </div>
  </div>
  <div class="panel" data-panel="backgrounds" hidden aria-label="Background">
    <div class="bg-row">
      <button type="button" data-bg="space" aria-pressed="true"><span class="sw sw-space"></span>Space</button>
      <button type="button" data-bg="black"><span class="sw" style="background:#000"></span>Black</button>
      <button type="button" data-bg="white"><span class="sw" style="background:#fff"></span>White</button>
      <button type="button" data-bg="solid"><span class="sw sw-custom"></span>Color</button>
      <button type="button" data-bg="gradient"><span class="sw sw-grad"></span>Gradient</button>
    </div>
    <div class="bg-controls">
      <label class="row"><span>Color</span><input type="color" name="bgcolor" value="#1b1420"></label>
      <label class="row"><span>Gradient from</span><input type="color" name="bga" value="#2a0f3d"></label>
      <label class="row"><span>to</span><input type="color" name="bgb" value="#c9864f"></label>
      <label class="row"><span>Angle</span><input type="range" name="bgangle" min="0" max="360" step="5" value="135"></label>
    </div>
  </div>
  <div class="panel" data-panel="export" hidden aria-label="Export">
    <fieldset class="fmt"><legend>Format</legend>
      <label><input type="radio" name="xformat" value="png" checked> PNG</label>
      <label><input type="radio" name="xformat" value="jpg"> JPG</label>
      <label><input type="radio" name="xformat" value="video"> Video (replay)</label>
    </fieldset>
    <label class="row"><span>Size</span><select name="xsize"><option value="screen">Screen</option><option value="2x">2×</option><option value="4k">4K</option></select></label>
    <label class="row check"><input type="checkbox" name="xtransparent"><span>Transparent background (PNG)</span></label>
    <p class="hint">Video records the replay as MP4 where your browser supports it, otherwise WebM (up to 1080p).</p>
    <button type="button" class="primary" data-act="do-export">${icon(I.export)} Export</button>
  </div>
  <div class="panel help" data-panel="help" hidden aria-label="Keyboard shortcuts">
    <h2>Shortcuts</h2>
    <dl>
      <dt>1 – 0</dt><dd>Pick a brush</dd><dt>B / E / T</dt><dd>Brush / eraser / text</dd><dt>L</dt><dd>Fading trail on / off</dd><dt>[ ]</dt><dd>Smaller / bigger</dd>
      <dt>Ctrl Z</dt><dd>Undo</dd><dt>Ctrl Shift Z / Ctrl Y</dt><dd>Redo</dd><dt>R</dt><dd>Replay</dd><dt>F</dt><dd>Fullscreen</dd>
      <dt>H</dt><dd>Hide / show tools</dd><dt>Delete</dt><dd>Clear (asks first)</dd><dt>Esc</dt><dd>Close panel / studio</dd>
    </dl>
  </div>
  <div class="text-options" hidden>
    <label class="row"><span>Font</span><select name="font"></select></label>
    ${range('fontPx', 'Text size', 16, 220, 2)}
  </div>
  <div class="savebar"></div>
  <div class="toolbar" role="toolbar" aria-label="Studio tools">
    <div class="group">
      <button type="button" data-act="brush-menu" aria-haspopup="menu" aria-expanded="false" aria-pressed="true" title="Brushes (1–0)">${icon(I.pen)}<span class="label">Round pen</span></button>
      <button type="button" data-act="eraser" aria-pressed="false" aria-label="Eraser (E)" title="Eraser (E)">${icon(I.eraser)}</button>
      <button type="button" data-act="text" aria-pressed="false" aria-label="Text (T)" title="Text (T)">${icon(I.text)}</button>
      <button type="button" data-act="trail" aria-pressed="false" title="Fading cursor trail (L)">${icon(I.trail)}<span class="label">Trail</span></button>
    </div>
    <div class="group colors">
      <label class="swatch" title="Color"><span class="color-dot"></span><input type="color" name="color" aria-label="Color"></label>
      <label class="swatch2" title="Second gradient color"><input type="color" name="color2" aria-label="Second gradient color"></label>
      <label class="grad-toggle" title="Gradient stroke"><input type="checkbox" name="gradient"><span>Gradient</span></label>
    </div>
    <div class="group size">
      <label class="size-label"><span class="sr">Size</span><input type="range" name="size" min="1" max="80" step="1" aria-label="Brush size ([ and ])"><output for="size"></output></label>
    </div>
    <div class="group">
      <button type="button" data-act="undo" aria-label="Undo (Ctrl Z)" title="Undo (Ctrl Z)">${icon(I.undo)}</button>
      <button type="button" data-act="redo" aria-label="Redo (Ctrl Shift Z)" title="Redo (Ctrl Shift Z)">${icon(I.redo)}</button>
      <button type="button" data-act="replay" aria-pressed="false" aria-label="Replay (R)" title="Replay (R)">${icon(I.replay)}<span class="lbl">Replay</span></button>
    </div>
    <div class="group">
      <button type="button" data-act="effects" aria-haspopup="true" aria-expanded="false" aria-label="Brush and trail settings" title="Effects">${icon(I.effects)}</button>
      <button type="button" data-act="background" aria-haspopup="true" aria-expanded="false" aria-label="Background" title="Background">${icon(I.bg)}</button>
      <button type="button" data-act="export" aria-haspopup="true" aria-expanded="false" aria-label="Save or export" title="Export">${icon(I.export)}<span class="lbl">Save</span></button>
    </div>
    <div class="group">
      <button type="button" data-act="fullscreen" aria-pressed="false" aria-label="Fullscreen (F)" title="Fullscreen (F)">${icon(I.full)}<span class="lbl">Fullscreen</span></button>
      <button type="button" data-act="hide-tools" aria-label="Hide tools (H)" title="Hide tools (H)">${icon(I.hide)}<span class="lbl">Hide</span></button>
      <button type="button" data-act="clear" aria-label="Clear canvas (Delete)" title="Clear (Delete)">${icon(I.clear)}<span class="lbl">Clear</span></button>
      <button type="button" data-act="help" aria-haspopup="true" aria-expanded="false" aria-label="Keyboard shortcuts (?)" title="Shortcuts (?)">${icon(I.help)}<span class="lbl">Help</span></button>
    </div>
    <div class="group rare" aria-label="More tools"></div>
  </div>
</div>
<div class="progress" hidden role="status"><span class="progress-label"></span><b><i></i></b></div>
<div class="confirm" hidden role="alertdialog" aria-modal="true" aria-labelledby="ka-confirm-title"><div class="confirm-card"><h2 id="ka-confirm-title"></h2><p></p>
  <div class="confirm-actions"><button type="button" data-confirm="cancel">Cancel</button><button type="button" class="primary" data-confirm="ok">OK</button></div></div></div>
<div class="toast" role="status" aria-live="polite"></div>
<div class="live-region sr" aria-live="polite"></div>
`;
