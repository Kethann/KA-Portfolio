// Typography studio (lazy bundle dist/assets/studio.js), opened from the site menu.
// A full-screen writing/drawing canvas with a cursor/finger trail. Everything runs in the
// browser; nothing is uploaded. The drawing stays in memory while the page is open.
import { FONT_GROUPS, FONT_LIBRARY, fontStack, googleFontsUrl } from '../../../shared/fonts.js';
import css from './studio.css?inline';
import {
  BRUSHES, BLENDS, FILTERS, DEFAULT_SETTINGS, MAX_POINTS, POINT_STRIDE, drawBackground, drawItem, drawSpaceFallback, isAlive, needsAnimation,
  newStroke, pushPoint, renderScene, replayTimeline, retimed, totalPoints, itemBox,
  type Background, type BrushId, type Item, type Settings, type Stroke, type TextItem
} from './engine';

import { EffectController, fillStops, type Composition } from './effects/controller';
import { SCENES } from './effects/scenes';
import { baselineIn } from './effects/typing/handwriting';
import { FINISHES, paintFinish } from './effects/finish';
import { THEMES, THEME_GROUPS, FILLS } from './effects/themes';
import type { Palette } from './effects/types';
import { TYPING } from './effects/typing';
import { DECORATIONS } from './effects/decorations';
import { PALETTES } from './effects/palettes';
import { newSeed } from './effects/rng';

export interface StudioOptions { returnFocus?: HTMLElement | null }
const fxState: Composition & { theme: string } = { theme: 'garden', text: 'Bloom where\nyou are planted', font: "'Playfair Display', serif", typing: 'typewriter', decoration: 'floral', caret: 'bar', palette: 'rose-noir', seed: newSeed(), speed: 1, density: 0.6, params: { typo: true },
  scene: 'glow', sceneIntensity: 0.6, sceneSpeed: 1, finish: 'none', finishAmount: 0.6, fill: 'solid', glow: 0, textCase: 'as-typed', tracking: 0, decoSize: 1, colors: {} };
let fxTextEdited = false;   // once you type your own words, themes stop replacing them with their sample
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
/** a random, always-readable palette from OKLCH: one hue family, dark or light, with two accents a third apart */
function randomPalette(): Partial<Palette> {
  const h = Math.random() * 360, dark = Math.random() < 0.65, hex = (l: number, c: number, hh: number) => oklchHex(l, c, hh);
  return dark ? { bg: hex(0.17, 0.04, h), text: hex(0.95, 0.02, h), accent1: hex(0.72, 0.17, h + 30), accent2: hex(0.74, 0.12, h + 150), glow: hex(0.88, 0.1, h + 30) }
    : { bg: hex(0.96, 0.025, h), text: hex(0.24, 0.04, h), accent1: hex(0.62, 0.18, h + 30), accent2: hex(0.55, 0.12, h + 150), glow: hex(0.85, 0.1, h + 30) };
}
function oklchHex(L: number, C: number, H: number){
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return '#' + lin.map(v => { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0'); }).join('');
}

// the shared font library (also offered in the portal for the site): grouped, each option drawn in its own face
const FONTS = FONT_LIBRARY.map(f => ({ family: fontStack(f.name), label: f.name, group: f.group }));
const FONT_CSS = googleFontsUrl(FONT_LIBRARY.map(f => f.name));
const fontOptions = (sel: HTMLSelectElement) => {
  for (const g of FONT_GROUPS){
    const og = document.createElement('optgroup'); og.label = g.label;
    for (const f of FONTS.filter(x => x.group === g.id)){ const o = document.createElement('option'); o.value = f.family; o.textContent = f.label; o.style.fontFamily = f.family; og.appendChild(o); }
    sel.appendChild(og);
  }
};

// ---- session (kept while the page is open) -----------------------------------------------------
type Entry = { type: 'add'; item: Item } | { type: 'clear'; items: Item[] };
const session = {
  items: [] as Item[], undo: [] as Entry[], redo: [] as Entry[], nextId: 1,
  settings: { ...DEFAULT_SETTINGS } as Settings,
  tool: 'brush' as 'brush' | 'eraser' | 'text',
  bg: { kind: 'space' } as Background, filter: 'none', hoverDraw: false,
  font: fontStack('Caveat'), fontPx: 56, clock0: performance.now(), world: { w: 0, h: 0 }, toolbarHidden: false, lastTrail: 2.5,
  // how everything you made comes in and goes out when it plays back (Replay and video export), and how trails leave.
  // Global: change it any time, even after drawing, and it applies to everything already on the canvas.
  motion: { inStyle: 'write', inDur: 0.8, outStyle: 'none', outDur: 1, hold: 1.2, trailOut: 'fade' } as { inStyle: string; inDur: number; outStyle: string; outDur: number; hold: number; trailOut: string }
};
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t: number) => Math.pow(Math.min(1, Math.max(0, t)), 2.2);
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
  raf = 0; replay: { t0: number; items: Item[]; duration: number; build: number; total: number; record?: (p: number) => void; done?: () => void } | null = null;
  boxes = new Map<number, { x: number; y: number; w: number; h: number }>();
  box(it: Item){ let b = this.boxes.get(it.id); if (!b){ b = itemBox(it); this.boxes.set(it.id, b); } return b; }
  /** draws one item with an in / out look: opacity, scale around its centre, a vertical move and blur */
  drawWith(x: CanvasRenderingContext2D, it: Item, o: Parameters<typeof drawItem>[2], alpha: number, scale = 1, dy = 0, blur = 0){
    if (alpha <= 0.002 || scale <= 0.01) return;
    const b = this.box(it), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    x.save(); x.globalAlpha = Math.min(1, alpha);
    if (blur > 0.2 && 'filter' in x) x.filter = `blur(${(blur * this.scale * this.dpr).toFixed(1)}px)`;
    if (scale !== 1 || dy !== 0){ x.translate(cx, cy + dy); x.scale(scale, scale); x.translate(-cx, -cy); }
    drawItem(x, it, o);
    x.restore();
  }
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
    this.boxes.clear();
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
      const R = this.replay, M = session.motion, clock = n - R.t0;
      const cx = session.world.w / 2, cy = session.world.h / 2;
      const outStart = R.build + M.hold * 1000, outMs = Math.max(1, M.outDur * 1000), inMs = Math.max(1, M.inDur * 1000);
      if (M.outStyle !== 'none' && clock >= outStart){
        // going out: everything leaves together
        const q = easeIn((clock - outStart) / outMs);
        if (M.outStyle === 'unwrite'){ const o = { now: clock, clip: R.build * (1 - q), cx, cy }; for (const it of R.items) drawItem(x, it, o); }
        else {
          const o = { now: R.build, clip: Infinity, cx, cy };
          for (const it of R.items){
            if (M.outStyle === 'fade') this.drawWith(x, it, o, 1 - q);
            else if (M.outStyle === 'shrink') this.drawWith(x, it, o, 1 - q * 0.6, 1 - q * 0.9);
            else if (M.outStyle === 'fall') this.drawWith(x, it, o, 1 - q, 1, q * q * 240);
            else if (M.outStyle === 'blur') this.drawWith(x, it, o, 1 - q * 0.95, 1 + q * 0.06, 0, q * 16);
            else drawItem(x, it, o);
          }
        }
      } else if (M.inStyle === 'write'){
        const o = { now: clock, clip: clock, cx, cy };
        for (const it of R.items) drawItem(x, it, o);
      } else {
        // coming in: each item at its own moment, whole, with the chosen look
        const o = { now: clock, clip: Infinity, cx, cy };
        for (const it of R.items){
          const p = (clock - it.start) / inMs; if (p <= 0) continue;
          const e = easeOut(p);
          if (M.inStyle === 'fade') this.drawWith(x, it, o, e);
          else if (M.inStyle === 'grow') this.drawWith(x, it, o, Math.min(1, e * 1.6), 0.25 + 0.75 * e);
          else if (M.inStyle === 'rise') this.drawWith(x, it, o, e, 1, (1 - e) * 46);
          else if (M.inStyle === 'drop') this.drawWith(x, it, o, e, 1, -(1 - e) * 70);
          else if (M.inStyle === 'focus') this.drawWith(x, it, o, e, 1, 0, (1 - e) * 14);
          else drawItem(x, it, o);
        }
      }
      R.record?.(Math.min(1, clock / R.total));
      if (clock < R.total) again = true; else this.endReplay();
    } else {
      const o = this.renderOpts();
      for (const it of session.items){
        if (!this.animated.has(it.id)) continue;
        if (!isAlive(it, n)){ this.animated.delete(it.id); continue; }
        if (it.s.lifetime <= 0 && !needsAnimation(it, n)){ this.bake(it); continue; }   // settled particles become ink
        const tOut = session.motion.trailOut, a = it.s.lifetime > 0 ? Math.min(1, Math.max(0, (n - it.end) / (it.s.lifetime * 1000))) : 0;
        if (a > 0 && tOut === 'shrink') this.drawWith(x, it, o, 1, 1 - a * 0.7);
        else if (a > 0 && tOut === 'blur') this.drawWith(x, it, o, 1, 1, 0, a * 10);
        else if (a > 0 && tOut === 'rise') this.drawWith(x, it, o, 1, 1, -a * 40);
        else drawItem(x, it, o);
        again = true;
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
    const items = retimed(session.items, offsets), M = session.motion;
    const build = M.inStyle === 'write' ? duration : Math.max(...items.map(i => i.start), 0) + M.inDur * 1000 + 200;
    const total = M.outStyle === 'none' ? build : build + M.hold * 1000 + M.outDur * 1000 + 150;
    this.replay = { t0: now(), items, duration, build, total, record, done };
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
      ['[data-act="fx"]', '.rare'], ['[data-act="replay"]', '.rare'], ['[data-act="fullscreen"]', '.rare'], ['[data-act="clear"]', '.rare'], ['[data-act="help"]', '.rare']
    ];
    const nodes = moves.map(([sel, dest]) => { const el = this.$(sel), mark = document.createComment('slot'); el.before(mark); return { el, mark, dest }; });
    const apply = () => {
      for (const n of nodes){ if (mq.matches) this.$(n.dest).appendChild(n.el); else n.mark.after(n.el); }
      this.$('.studio').classList.toggle('is-compact', mq.matches);
      // which guide to show: a phone, a tablet / iPad, or a laptop / desktop
      const coarse = window.matchMedia('(pointer: coarse)').matches, small = Math.min(window.innerWidth, window.innerHeight) < 600;
      const dev = coarse ? (small ? 'phone' : 'tablet') : 'laptop';
      const was = this.$('.studio').dataset.device;
      this.$('.studio').dataset.device = dev;
      if (was && was !== dev && this.fx) this.fxSections();
      this.$('.fx-panel').querySelectorAll<HTMLElement>('.fx-key').forEach(k => { k.hidden = dev !== 'laptop'; });
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
    const fxFont = this.$('select[name="fxFont"]') as HTMLSelectElement;
    fontOptions(fxFont);
    fxFont.value = fxState.font; (this.$('textarea[name="fxText"]') as HTMLTextAreaElement).value = fxState.text;
    const chip = (kind: string, e: { id: string; name: string; description: string }) =>
      `<button type="button" class="fx-chip" data-act="fx-${kind}" data-v="${e.id}" aria-pressed="false" title="${esc(e.description)}">${esc(e.name)}</button>`;
    this.$('.fx-typing').innerHTML = TYPING.map(e => chip('typing', e)).join('');
    this.$('.fx-decos').innerHTML = DECORATIONS.map(e => chip('deco', e)).join('');
    this.$('.fx-tabs').innerHTML = ['All', ...THEME_GROUPS].map((g, i) => `<button type="button" class="fx-tab" data-act="fx-tab" data-v="${esc(g)}" aria-pressed="${i === 0}">${esc(g)}</button>`).join('');
    this.$('.fx-themes').innerHTML = THEMES.map(t => {
      const p = PALETTES.find(x => x.id === t.palette) || PALETTES[0];
      return `<button type="button" class="fx-theme" data-act="fx-theme" data-v="${t.id}" data-group="${esc(t.group)}" aria-pressed="false" title="${esc(t.name)}">`
        + `<span class="fx-theme-sw" style="background:radial-gradient(120% 90% at 80% 0%, ${p.accent1}66, transparent 60%), radial-gradient(90% 80% at 0% 100%, ${p.accent2}55, transparent 60%), ${p.bg};color:${p.text};font-family:${esc(fontStack(t.font))}">${esc(t.sample.split('\n')[0].slice(0, 10))}</span><b>${esc(t.name)}</b></button>`;
    }).join('');
    const sceneSel = this.$('select[name="fxScene"]') as HTMLSelectElement;
    for (const g of [...new Set(SCENES.map(x => x.group))]){ const og = document.createElement('optgroup'); og.label = g; for (const sc of SCENES.filter(x => x.group === g)){ const o = document.createElement('option'); o.value = sc.id; o.textContent = sc.name; og.appendChild(o); } sceneSel.appendChild(og); }
    const finSel = this.$('select[name="fxFinish"]') as HTMLSelectElement;
    for (const fi of FINISHES){ const o = document.createElement('option'); o.value = fi.id; o.textContent = fi.name; finSel.appendChild(o); }
    void FILLS;
    this.$('.fx-pals').innerHTML = PALETTES.map(p => `<button type="button" class="fx-pal" data-act="fx-pal" data-v="${p.id}" aria-pressed="false" title="${p.name}"><i style="background:${p.bg}"></i><i style="background:${p.accent1}"></i><i style="background:${p.accent2}"></i><span>${p.name}</span></button>`).join('');
    const fontSel = this.$('select[name="font"]') as HTMLSelectElement;
    fontOptions(fontSel);
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
        case 'fx': this.toggleFx(t); break;
        case 'fx-typing': fxState.typing = t.dataset.v || 'typewriter'; this.fxCompose(); break;
        case 'fx-deco': fxState.decoration = t.dataset.v || 'none'; this.fxCompose(); break;
        case 'fx-pal': fxState.palette = t.dataset.v || 'rose-noir'; fxState.colors = {}; this.fxCompose(); break;
        case 'fx-theme': this.applyTheme(t.dataset.v || 'garden'); break;
        case 'fx-tab': {
          const g = t.dataset.v || 'All';
          this.root.querySelectorAll<HTMLElement>('.fx-tab').forEach(b => b.setAttribute('aria-pressed', String(b === t)));
          this.root.querySelectorAll<HTMLElement>('.fx-theme').forEach(b => { b.hidden = g !== 'All' && b.dataset.group !== g; });
          break;
        }
        case 'fx-sec': { const sec = t.closest('.fx-sec') as HTMLElement; const open = t.getAttribute('aria-expanded') !== 'true'; t.setAttribute('aria-expanded', String(open)); sec.classList.toggle('is-shut', !open); break; }
        case 'fx-randpal': fxState.colors = randomPalette(); this.fxCompose(); break;
        case 'fx-resetcol': fxState.colors = {}; this.fxCompose(); break;
        case 'fx-regen': fxState.seed = newSeed(); this.fxCompose(); break;
        case 'fx-replay': this.fx?.replay(); break;
        case 'fx-close': this.closeFx(); break;
        case 'fx-download': void this.exportFx(); break;
        case 'undo': this.undoAct(); break;
        case 'redo': this.redoAct(); break;
        case 'replay': this.replay ? this.endReplay() : this.startReplay(); break;
        case 'replay-preview': this.closePanels(); if (this.replay) this.endReplay(); this.startReplay(); break;
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
    set('filter', session.filter); set('hover', session.hoverDraw);
    set('inStyle', session.motion.inStyle); set('outStyle', session.motion.outStyle); set('trailOut', session.motion.trailOut); set('inDur', session.motion.inDur); set('outDur', session.motion.outDur); set('hold', session.motion.hold); set('font', session.font); set('fontPx', session.fontPx);
    (this.$('.swatch2') as HTMLElement).hidden = !s.gradient;
    (this.$('.radial-row') as HTMLElement).hidden = s.symmetry !== 'radial';
    this.$('[data-act="trail"]').setAttribute('aria-pressed', String(s.lifetime > 0));
    this.$('.color-dot').style.background = s.gradient ? `linear-gradient(135deg, ${s.color}, ${s.color2})` : s.color;
  }
  fmt(name: string, v: number){
    if (name === 'opacity' || name === 'smoothing' || name === 'fxDensity' || name === 'fxGlow' || name === 'fxDecoSize' || name === 'fxSceneI' || name === 'fxFinishA') return Math.round(v * 100) + '%';
    if (name === 'fxSceneS') return v.toFixed(1) + '×';
    if (name === 'fxTracking') return v.toFixed(2) + ' em';
    if (name === 'fxSpeed') return v.toFixed(1) + '×';
    if (name === 'lifetime') return v <= 0 ? 'Permanent' : `${v.toFixed(1)} s`;
    if (name === 'flow' || name === 'wobble') return v.toFixed(1) + '×';
    if (name === 'inDur' || name === 'outDur' || name === 'hold') return v.toFixed(1) + ' s';
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
      case 'inStyle': case 'outStyle': case 'trailOut': (session.motion as Record<string, unknown>)[name] = el.value; this.syncControls(); return;
      case 'inDur': case 'outDur': case 'hold': (session.motion as Record<string, unknown>)[name] = num; this.syncControls(); return;
      case 'fxText': fxTextEdited = true; fxState.text = el.value.slice(0, 120); clearTimeout(this.fxTimer); this.fxTimer = window.setTimeout(() => this.fxCompose(), 350); return;
      case 'fxFont': fxState.font = el.value; this.fxCompose(); return;
      case 'fxFill': fxState.fill = el.value; this.fxCompose(); return;
      case 'fxCase': fxState.textCase = el.value as Composition['textCase']; this.fxCompose(); return;
      case 'fxScene': fxState.scene = el.value; this.fxLive(); return;
      case 'fxFinish': fxState.finish = el.value; this.fxLive(); return;
      case 'fxSceneI': case 'fxSceneS': case 'fxFinishA': {
        if (name === 'fxSceneI') fxState.sceneIntensity = num; else if (name === 'fxSceneS') fxState.sceneSpeed = num; else fxState.finishAmount = num;
        const out = this.root.querySelector(`output[for="${name}"]`); if (out) out.textContent = this.fmt(name, num);
        this.fxLive(); return;
      }
      case 'fxTracking': case 'fxGlow': case 'fxDecoSize': {
        if (name === 'fxTracking') fxState.tracking = num; else if (name === 'fxGlow') fxState.glow = num; else fxState.decoSize = num;
        const out = this.root.querySelector(`output[for="${name}"]`); if (out) out.textContent = this.fmt(name, num);
        clearTimeout(this.fxTimer); this.fxTimer = window.setTimeout(() => this.fxCompose(), 300); return;
      }
      case 'fxC_bg': case 'fxC_text': case 'fxC_accent1': case 'fxC_accent2': case 'fxC_glow':
        fxState.colors = { ...fxState.colors, [name.slice(4)]: el.value };
        clearTimeout(this.fxTimer); this.fxTimer = window.setTimeout(() => this.fxCompose(), 250); return;
      case 'fxCaret': fxState.caret = el.value as Composition['caret']; this.fxCompose(); return;
      case 'fxTypo': fxState.params = { ...fxState.params, typo: el.checked }; this.fxCompose(); return;
      case 'fxSpeed': case 'fxDensity': {
        if (name === 'fxSpeed') fxState.speed = num; else fxState.density = num;
        const out = this.root.querySelector(`output[for="${name}"]`); if (out) out.textContent = this.fmt(name, num);
        clearTimeout(this.fxTimer); this.fxTimer = window.setTimeout(() => this.fxCompose(), 300); return;
      }
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
  // ---- Text effects: a composer on top of the studio's text (typing + decoration + palette), exported as a still
  fx: EffectController | null = null; fxOn = false; fxTimer = 0;
  fxCompose(){ if (!this.fx) return; void this.fx.compose({ ...fxState }); this.fxSync(); }
  /** scene and finish changes apply at once, without restarting the words */
  fxLive(){
    const c = this.fx; if (!c || !c.palette) return;
    c.scene.set(fxState.scene || 'plain', c.palette, fxState.sceneIntensity ?? 0.6, fxState.sceneSpeed ?? 1, fxState.seed);
    c.finish.set(fxState.finish || 'none', fxState.finishAmount ?? 0.6, c.palette);
    this.fxSync();
  }
  applyTheme(id: string){
    const t = THEMES.find(x => x.id === id); if (!t) return;
    Object.assign(fxState, { theme: t.id, font: fontStack(t.font), typing: t.typing, decoration: t.decoration, palette: t.palette, scene: t.scene, finish: t.finish,
      fill: t.fill || 'solid', glow: t.glow ?? 0, textCase: t.textCase || 'as-typed', tracking: t.tracking ?? 0, speed: t.speed ?? 1, density: t.density ?? 0.6,
      sceneIntensity: t.sceneIntensity ?? 0.6, caret: t.caret || 'bar', colors: {}, decoSize: 1, sceneSpeed: 1, finishAmount: 0.6 });
    if (!fxTextEdited) fxState.text = t.sample;
    this.fxSyncInputs(); this.fxCompose();
  }
  /** puts every control back in step with fxState (after a theme, or opening the panel) */
  fxSyncInputs(){
    const r = this.root, set = (n: string, v: string | number | boolean) => { const el = r.querySelector<HTMLInputElement>(`[name="${n}"]`); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v);
      const out = r.querySelector(`output[for="${n}"]`); if (out && typeof v === 'number') out.textContent = this.fmt(n, v); };
    set('fxText', fxState.text); set('fxFont', fxState.font); set('fxFill', fxState.fill || 'solid'); set('fxCase', fxState.textCase || 'as-typed'); set('fxCaret', fxState.caret);
    set('fxTracking', fxState.tracking ?? 0); set('fxGlow', fxState.glow ?? 0); set('fxSpeed', fxState.speed); set('fxDensity', fxState.density); set('fxDecoSize', fxState.decoSize ?? 1);
    set('fxScene', fxState.scene || 'plain'); set('fxFinish', fxState.finish || 'none'); set('fxSceneI', fxState.sceneIntensity ?? 0.6); set('fxSceneS', fxState.sceneSpeed ?? 1); set('fxFinishA', fxState.finishAmount ?? 0.6);
  }
  fxSync(){
    const r = this.root;
    r.querySelectorAll<HTMLElement>('[data-act="fx-theme"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === fxState.theme)));
    const base = PALETTES.find(p => p.id === fxState.palette) || PALETTES[0], pal = { ...base, ...fxState.colors };
    for (const k of ['bg', 'text', 'accent1', 'accent2', 'glow'] as const){ const el = r.querySelector<HTMLInputElement>(`[name="fxC_${k}"]`); if (el) el.value = pal[k]; }
    const ty = TYPING.find(x => x.id === fxState.typing), de = DECORATIONS.find(x => x.id === fxState.decoration), th = THEMES.find(x => x.id === fxState.theme);
    const d1 = r.querySelector('[data-desc="typing"]'), d2 = r.querySelector('[data-desc="deco"]'); if (d1) d1.textContent = ty?.description || ''; if (d2) d2.textContent = de?.description || '';
    const sum = (k: string, v: string) => { const n = r.querySelector(`[data-sum="${k}"]`); if (n) n.textContent = v; };
    sum('themes', th?.name || ''); sum('text', (FONTS.find(f => f.family === fxState.font)?.label || '') + (fxState.fill && fxState.fill !== 'solid' ? ' · ' + (FILLS.find(f => f.id === fxState.fill)?.name || '') : ''));
    sum('motion', ty?.name || ''); sum('deco', de?.name || ''); sum('scene', (SCENES.find(x => x.id === fxState.scene)?.name || '') + ' · ' + (FINISHES.find(x => x.id === fxState.finish)?.name || ''));
    sum('color', Object.keys(fxState.colors || {}).length ? 'Custom' : base.name);
    r.querySelectorAll<HTMLElement>('[data-act="fx-typing"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === fxState.typing)));
    r.querySelectorAll<HTMLElement>('[data-act="fx-deco"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === fxState.decoration)));
    r.querySelectorAll<HTMLElement>('[data-act="fx-pal"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === fxState.palette)));
    const seed = r.querySelector('.fx-seed'); if (seed) seed.textContent = String(fxState.seed);
    r.querySelectorAll<HTMLElement>('.fx-caret-row').forEach(n => { n.hidden = fxState.typing !== 'typewriter'; });   // caret and typo only apply to the typewriter
  }
  /** how many sections start open: everything on a laptop, the first two on a tablet, only Themes on a phone */
  fxSections(){
    const dev = this.$('.studio').dataset.device || 'laptop', keep = dev === 'laptop' ? 99 : dev === 'tablet' ? 2 : 1;
    this.root.querySelectorAll<HTMLElement>('.fx-sec').forEach((sec, i) => { const open = i < keep; sec.classList.toggle('is-shut', !open); sec.querySelector('.fx-sec-h')?.setAttribute('aria-expanded', String(open)); });
  }
  toggleFx(trigger: HTMLElement){
    const stage = this.$('.fx-stage');
    if (this.fxOn && this.openPanel === 'fx'){ this.closePanels(); return; }
    this.fxOn = true; stage.hidden = false;
    this.togglePanel('fx', trigger);
    if (!this.fx){ this.fx = new EffectController(stage); this.fxSections(); }
    this.fxSyncInputs();
    this.fxLayout();
  }
  /** the stage takes the space the panel leaves: beside it on wide screens, above it on phones */
  fxLayout(){
    const stage = this.$('.fx-stage'), panel = this.$('.panel[data-panel="fx"]'), wrap = this.$('.toolbar-wrap');
    const compact = this.$('.studio').classList.contains('is-compact');
    stage.style.right = ''; stage.style.bottom = ''; stage.style.top = '';
    if (panel.hidden) return;
    if (compact){
      const wr = wrap.getBoundingClientRect(), tb = this.$('.topbar').getBoundingClientRect();
      if (tb.height) stage.style.top = Math.round(tb.bottom + 6) + 'px';   // below undo / Hide / close
      panel.style.setProperty('--fxb', Math.max(0, window.innerHeight - wr.top + 8) + 'px');
      requestAnimationFrame(() => { const pr = panel.getBoundingClientRect(); stage.style.bottom = Math.max(0, window.innerHeight - pr.top + 4) + 'px'; this.fxCompose(); });
    } else {
      stage.style.right = (panel.getBoundingClientRect().width + 32) + 'px';
      this.fxCompose();
    }
  }
  closeFx(){ this.fxOn = false; this.fx?.stop(); this.$('.fx-stage').hidden = true; this.closePanels(); }
  /** a full-resolution still of the composed piece: PNG (with or without background) or SVG */
  async exportFx(){
    const ctrl = this.fx; if (!ctrl || !ctrl.tl) return;
    const fmt = (this.$('[name="fxFormat"]') as HTMLSelectElement).value, size = (this.$('[name="fxSize"]') as HTMLSelectElement).value;
    const tl = ctrl.tl, playing = !tl.paused();
    tl.pause(); tl.seek(ctrl.built, false);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const stage = ctrl.stage, sr = stage.getBoundingClientRect(), pal = ctrl.palette || PALETTES[0];
    const font = getComputedStyle(ctrl.textEl).font, ls = getComputedStyle(ctrl.textEl).letterSpacing;
    const chars = Array.from(ctrl.textEl.querySelectorAll<HTMLElement>('.fx-char')).map(c => ({ ch: c.dataset.ch || c.textContent || '', r: c.getBoundingClientRect() }));
    const svgText = new XMLSerializer().serializeToString(ctrl.svg);
    const fill = fxState.fill || 'solid', stops = fillStops(fill, pal), glow = fill === 'outline-glow' ? Math.max(0.6, fxState.glow ?? 0) : (fxState.glow ?? 0);
    const outline = fill === 'outline' || fill === 'outline-glow', strokeCol = fill === 'outline' ? pal.text : pal.accent1;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const c of chars){ bx0 = Math.min(bx0, c.r.left - sr.left); by0 = Math.min(by0, c.r.top - sr.top); bx1 = Math.max(bx1, c.r.right - sr.left); by1 = Math.max(by1, c.r.bottom - sr.top); }
    const t = ctrl.scene.time(), W = sr.width, H = sr.height, withBg = fmt !== 'png-t';
    /** the scene or the finish as a PNG data URL (for the SVG file) */
    const layerUrl = (draw: (x: CanvasRenderingContext2D) => void) => { const c = document.createElement('canvas'); c.width = Math.round(W * 2); c.height = Math.round(H * 2); const x = c.getContext('2d')!; x.scale(2, 2); draw(x); return c.toDataURL('image/png'); };
    try {
      if (fmt === 'svg'){
        const fam = font.replace(/^.*?\d+px\s*/, '').replace(/"/g, "'"), px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] || '64');
        const m = document.createElement('canvas').getContext('2d')!; m.font = font;
        const texts = chars.map(c => `<text x="${(c.r.left - sr.left).toFixed(1)}" y="${(c.r.top - sr.top + baselineIn(m, c.ch, c.r.height)).toFixed(1)}">${c.ch.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('');
        const gid = 'fxfill';
        const grad = stops ? `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" ${stops.angle === 'h' ? `x1="${bx0}" y1="0" x2="${bx1}" y2="0"` : stops.angle === 'v-up' ? `x1="0" y1="${by1}" x2="0" y2="${by0}"` : `x1="0" y1="${by0}" x2="0" y2="${by1}"`}>${stops.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient></defs>` : '';
        const paint = outline ? `fill="none" stroke="${strokeCol}" stroke-width="${Math.max(1.5, px * 0.03).toFixed(1)}"` : `fill="${stops ? `url(#${gid})` : pal.text}"`;
        const scene = layerUrl(x => ctrl.scene.paint(x, t)), fin = (fxState.finish || 'none') !== 'none' ? layerUrl(x => paintFinish(x, fxState.finish!, W, H, fxState.finishAmount ?? 0.6, pal, t)) : '';
        const doc = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>@import url('${googleFontsUrl([fam.split(',')[0].replace(/['"]/g, '').trim()]).replace(/&/g, '&amp;')}');</style>${grad}<image href="${scene}" width="${W}" height="${H}"/>${svgText.replace(/^<svg[^>]*>|<\/svg>$/g, '')}<g font-family="${fam}" font-size="${px}" letter-spacing="${ls === 'normal' ? 0 : ls}" ${paint}>${texts}</g>${fin ? `<image href="${fin}" width="${W}" height="${H}"/>` : ''}</svg>`;
        this.download(new Blob([doc], { type: 'image/svg+xml' }), `ka-text-effect-${stamp()}.svg`);
      } else {
        const scale = size === '4k' ? 3840 / W : size === '2x' ? 2 : Math.max(1, window.devicePixelRatio || 1);
        const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
        const x = c.getContext('2d')!; x.scale(scale, scale);
        if (withBg){ x.fillStyle = pal.bg; x.fillRect(0, 0, W, H); ctrl.scene.paint(x, t); }
        const img = new Image(); const url = URL.createObjectURL(new Blob([svgText.replace('<svg', `<svg width="${W}" height="${H}"`)], { type: 'image/svg+xml' }));
        await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = url; });
        try { x.drawImage(img, 0, 0, W, H); } catch { /* no decorations to draw */ }
        URL.revokeObjectURL(url);
        x.font = font; x.textBaseline = 'alphabetic';
        if (stops){
          const g = stops.angle === 'h' ? x.createLinearGradient(bx0, 0, bx1, 0) : stops.angle === 'v-up' ? x.createLinearGradient(0, by1, 0, by0) : x.createLinearGradient(0, by0, 0, by1);
          for (const [o, col] of stops.stops) g.addColorStop(o, col); x.fillStyle = g;
        } else x.fillStyle = pal.text;
        x.strokeStyle = strokeCol; x.lineWidth = Math.max(1.5, parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] || '64') * 0.03);
        const drawText = () => { for (const ch of chars){ const yy = ch.r.top - sr.top + baselineIn(x, ch.ch, ch.r.height); if (outline) x.strokeText(ch.ch, ch.r.left - sr.left, yy); else x.fillText(ch.ch, ch.r.left - sr.left, yy); } };
        if (glow > 0){ x.save(); x.shadowColor = pal.glow; x.shadowBlur = 6 + glow * 18; drawText(); x.shadowColor = pal.accent1; x.shadowBlur = 18 + glow * 30; drawText(); x.restore(); }
        drawText();
        if (withBg) paintFinish(x, fxState.finish || 'none', W, H, fxState.finishAmount ?? 0.6, pal, t);
        const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/png'));
        if (blob) this.download(blob, `ka-text-effect-${stamp()}-${c.width}x${c.height}.png`);
      }
      this.toast('Downloaded');
    } finally { if (playing) tl.play(); }
  }
  togglePanel(name: string, trigger: HTMLElement){
    const was = this.openPanel === name;
    this.closePanels();
    if (was) return;
    const p = this.$(`.panel[data-panel="${name}"]`);
    p.hidden = false; this.openPanel = name; trigger.setAttribute('aria-expanded', 'true');
    const first = p.querySelector<HTMLElement>('button, input, select'); first?.focus();
  }
  closePanels(){
    const wasFx = this.openPanel === 'fx';
    this.root.querySelectorAll<HTMLElement>('.panel').forEach(p => { p.hidden = true; });
    this.root.querySelectorAll<HTMLElement>('[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    this.openPanel = null;
    if (wasFx && this.fxOn) this.fxLayout();   // the panel went away: the words take the whole stage again
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
      if (this.fxOn){ this.closeFx(); e.preventDefault(); return; }
      if (this.replay){ this.endReplay(); e.preventDefault(); return; }
      e.preventDefault(); this.close(); return;
    }
    if (this.fxOn && !typing && !mod && !e.altKey){
      if (e.key === ' '){ e.preventDefault(); this.fx?.replay(); return; }
      if (e.key.toLowerCase() === 'r'){ e.preventDefault(); fxState.seed = newSeed(); this.fxCompose(); return; }
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
    this.fx?.destroy(); this.fx = null;
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
  textfx: '<path d="M4 18 8.5 6h1L14 18M5.6 14h6.8"/><path d="M17.5 4.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/><path d="M17 13c1 2 2.6 3.6 4.5 4.5"/>',
  trail: '<circle cx="17.5" cy="6.5" r="2.5"/><path d="M15.5 8.5 4 20M12.5 6.5 5 14M17.5 11.5 10 19"/>'
};
const icon = (p: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
const range = (name: string, label: string, min: number, max: number, step: number) =>
  `<label class="row"><span>${label}</span><input type="range" name="${name}" min="${min}" max="${max}" step="${step}"><output for="${name}"></output></label>`;
const check = (name: string, label: string) => `<label class="row check"><input type="checkbox" name="${name}"><span>${label}</span></label>`;

const TEMPLATE = `
<div class="fx-stage" hidden></div>
<div class="stage" data-tool="brush">
  <canvas class="bg" aria-hidden="true"></canvas>
  <canvas class="ink" aria-hidden="true"></canvas>
  <canvas class="live" role="img" aria-label="Drawing canvas. Draw with a mouse, finger or pen."></canvas>
</div>
<button type="button" class="corner close" data-act="close" aria-label="Close studio (Escape)">${icon(I.close)}</button>
<button type="button" class="show-tools" data-act="show-tools" hidden aria-label="Show tools (H)">${icon(I.tools)}<span>Tools</span></button>
<div class="topbar"><div class="tb-history" role="group" aria-label="History"></div><div class="tb-hide"></div></div>
  <div class="panel fx-panel fx-dock" data-panel="fx" hidden aria-label="Text effects">
    <section class="fx-sec" data-sec="themes"><button type="button" class="fx-sec-h" data-act="fx-sec" aria-expanded="true"><span>Themes</span><small class="fx-sum" data-sum="themes"></small><i aria-hidden="true"></i></button><div class="fx-sec-b">
      <div class="fx-tabs" role="group" aria-label="Theme groups"></div>
      <div class="fx-themes"></div>
      <p class="hint fx-theme-hint">A theme sets everything below at once. Change any part after.</p>
    </div></section>
    <section class="fx-sec" data-sec="text"><button type="button" class="fx-sec-h" data-act="fx-sec" aria-expanded="true"><span>Text &amp; font</span><small class="fx-sum" data-sum="text"></small><i aria-hidden="true"></i></button><div class="fx-sec-b">
      <label class="fx-field"><span>Your words</span><textarea name="fxText" rows="2" maxlength="120"></textarea></label>
      <div class="fx-two">
        <label class="fx-field"><span>Font</span><select name="fxFont"></select></label>
        <label class="fx-field"><span>Fill</span><select name="fxFill"><option value="solid">Solid</option><option value="gradient">Gradient</option><option value="outline">Outline</option><option value="outline-glow">Neon tube</option><option value="metal-gold">Gold foil</option><option value="chrome">Chrome</option><option value="fire">Fire</option><option value="ice">Ice</option></select></label>
        <label class="fx-field"><span>Letters</span><select name="fxCase"><option value="as-typed">As typed</option><option value="upper">CAPITALS</option></select></label>
        <label class="fx-field fx-caret-row"><span>Caret</span><select name="fxCaret"><option value="bar">Bar</option><option value="block">Block</option><option value="underscore">Underscore</option><option value="nib">Pen nib</option><option value="none">None</option></select></label>
      </div>
      <label class="row"><span>Spacing</span><input type="range" name="fxTracking" min="-0.05" max="0.4" step="0.01" value="0"><output for="fxTracking">0.00 em</output></label>
      <label class="row"><span>Glow</span><input type="range" name="fxGlow" min="0" max="1" step="0.05" value="0"><output for="fxGlow">0%</output></label>
    </div></section>
    <section class="fx-sec" data-sec="motion"><button type="button" class="fx-sec-h" data-act="fx-sec" aria-expanded="true"><span>Animation</span><small class="fx-sum" data-sum="motion"></small><i aria-hidden="true"></i></button><div class="fx-sec-b">
      <div class="fx-chips fx-typing" role="group" aria-label="How the words arrive"></div>
      <p class="hint fx-desc" data-desc="typing"></p>
      <label class="row check fx-caret-row"><input type="checkbox" name="fxTypo" checked><span>Make a typo and backspace it</span></label>
      <label class="row"><span>Speed</span><input type="range" name="fxSpeed" min="0.5" max="2" step="0.1" value="1"><output for="fxSpeed">1.0×</output></label>
    </div></section>
    <section class="fx-sec" data-sec="deco"><button type="button" class="fx-sec-h" data-act="fx-sec" aria-expanded="true"><span>Decoration</span><small class="fx-sum" data-sum="deco"></small><i aria-hidden="true"></i></button><div class="fx-sec-b">
      <div class="fx-chips fx-decos" role="group" aria-label="Decoration"></div>
      <p class="hint fx-desc" data-desc="deco"></p>
      <label class="row"><span>Amount</span><input type="range" name="fxDensity" min="0" max="1" step="0.05" value="0.6"><output for="fxDensity">60%</output></label>
      <label class="row"><span>Size</span><input type="range" name="fxDecoSize" min="0.5" max="2" step="0.05" value="1"><output for="fxDecoSize">100%</output></label>
    </div></section>
    <section class="fx-sec" data-sec="scene"><button type="button" class="fx-sec-h" data-act="fx-sec" aria-expanded="true"><span>Background &amp; finish</span><small class="fx-sum" data-sum="scene"></small><i aria-hidden="true"></i></button><div class="fx-sec-b">
      <div class="fx-two">
        <label class="fx-field"><span>Scene</span><select name="fxScene"></select></label>
        <label class="fx-field"><span>Finish</span><select name="fxFinish"></select></label>
      </div>
      <label class="row"><span>Scene amount</span><input type="range" name="fxSceneI" min="0" max="1" step="0.05" value="0.6"><output for="fxSceneI">60%</output></label>
      <label class="row"><span>Scene motion</span><input type="range" name="fxSceneS" min="0" max="2" step="0.1" value="1"><output for="fxSceneS">1.0×</output></label>
      <label class="row"><span>Finish strength</span><input type="range" name="fxFinishA" min="0" max="1" step="0.05" value="0.6"><output for="fxFinishA">60%</output></label>
    </div></section>
    <section class="fx-sec" data-sec="color"><button type="button" class="fx-sec-h" data-act="fx-sec" aria-expanded="true"><span>Colours</span><small class="fx-sum" data-sum="color"></small><i aria-hidden="true"></i></button><div class="fx-sec-b">
      <div class="fx-pals"></div>
      <div class="fx-swatches">
        <label><input type="color" name="fxC_bg"><span>Background</span></label><label><input type="color" name="fxC_text"><span>Text</span></label>
        <label><input type="color" name="fxC_accent1"><span>Accent</span></label><label><input type="color" name="fxC_accent2"><span>Accent 2</span></label><label><input type="color" name="fxC_glow"><span>Glow</span></label>
      </div>
      <div class="fx-actions"><button type="button" class="fx-btn" data-act="fx-randpal">Random colours</button><button type="button" class="fx-btn" data-act="fx-resetcol">Reset to palette</button></div>
    </div></section>
    <div class="fx-actions fx-main">
      <button type="button" class="fx-btn" data-act="fx-replay">Replay<span class="fx-key"> (Space)</span></button>
      <button type="button" class="fx-btn" data-act="fx-regen">New variation<span class="fx-key"> (R)</span></button>
      <button type="button" class="fx-btn" data-act="fx-close">Close effects</button>
      <span class="fx-seedbox">Seed <b class="fx-seed"></b></span>
    </div>
    <div class="fx-actions fx-export">
      <select name="fxFormat" aria-label="Download format"><option value="png">PNG</option><option value="png-t">PNG, transparent</option><option value="svg">SVG (vector)</option></select>
      <select name="fxSize" aria-label="Resolution"><option value="screen">Screen (sharp)</option><option value="2x">2×</option><option value="4k" selected>4K (3840 px wide)</option></select>
      <button type="button" class="primary" data-act="fx-download">Download</button>
    </div>
  </div>
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
        <label class="row"><span>Trail leaves by</span><select name="trailOut"><option value="fade">Fading</option><option value="shrink">Shrinking</option><option value="blur">Blurring away</option><option value="rise">Drifting up</option></select></label>
        <p class="hint">Lifetime 0 = permanent ink. Anything above fades like a cursor trail.</p>
      </fieldset>
      <fieldset><legend>In &amp; out (replay and video)</legend>
        <label class="row"><span>Comes in</span><select name="inStyle"><option value="write">Writes on</option><option value="fade">Fades in</option><option value="grow">Grows</option><option value="rise">Rises</option><option value="drop">Drops in</option><option value="focus">Comes into focus</option></select></label>
        ${range('inDur', 'In length', 0.2, 3, 0.1)}
        <label class="row"><span>Goes out</span><select name="outStyle"><option value="none">Stays</option><option value="fade">Fades out</option><option value="shrink">Shrinks away</option><option value="fall">Falls</option><option value="blur">Blurs away</option><option value="unwrite">Unwrites</option></select></label>
        ${range('hold', 'Hold first', 0, 5, 0.1)}${range('outDur', 'Out length', 0.2, 3, 0.1)}
        <p class="hint">Applies to everything on the canvas, including what you have already drawn or written. Press Replay to see it.</p>
        <button type="button" class="primary" data-act="replay-preview">Preview</button>
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
  <div class="panel help" data-panel="help" hidden aria-label="Guide">
    <div class="guide guide-laptop">
      <h2>Guide · laptop &amp; desktop</h2>
      <h3>Drawing</h3>
      <dl>
        <dt>1 – 0</dt><dd>Pick a brush</dd><dt>B / E / T</dt><dd>Brush / eraser / text</dd><dt>L</dt><dd>Fading trail on / off</dd><dt>[ ]</dt><dd>Smaller / bigger</dd>
        <dt>Ctrl Z</dt><dd>Undo</dd><dt>Ctrl Shift Z / Ctrl Y</dt><dd>Redo</dd><dt>H</dt><dd>Hide / show tools</dd><dt>F</dt><dd>Fullscreen</dd>
        <dt>Delete</dt><dd>Clear (asks first)</dd><dt>Esc</dt><dd>Close a panel, then the studio</dd>
      </dl>
      <h3>Playback</h3>
      <dl><dt>R</dt><dd>Replay with your In &amp; out (set in Effects)</dd><dt>Save</dt><dd>PNG, JPG or a video of the replay</dd></dl>
      <h3>Text effects</h3>
      <dl><dt>Themes</dt><dd>One click sets font, animation, decoration, background and colours</dd><dt>Sections</dt><dd>Change any part after; click a title to fold it</dd>
        <dt>Space</dt><dd>Replay the effect</dd><dt>R</dt><dd>New variation of the same look</dd></dl>
    </div>
    <div class="guide guide-phone">
      <h2>Guide · phone</h2>
      <ul>
        <li><b>Draw</b> with one finger anywhere on the canvas.</li>
        <li><b>Bottom row:</b> brush (tap again for all brushes), eraser, text, trail, effects, background. <b>Row above:</b> colour, gradient and size.</li>
        <li><b>Swipe the top strip</b> of the tools for Text effects, Replay, Fullscreen, Clear and this guide.</li>
        <li><b>Top left</b> undo / redo · <b>top middle</b> hide everything (tap Tools to bring it back) · <b>top right</b> close · <b>Save</b> bottom right.</li>
        <li><b>In &amp; out:</b> Effects → In &amp; out picks how your drawing comes in and leaves; Preview plays it.</li>
        <li><b>Text effects:</b> swipe the row of themes and tap one. Tap a section title (Text, Animation, Decoration…) to open its controls; your words play above the panel.</li>
        <li>Turn your phone sideways for a wider canvas.</li>
      </ul>
    </div>
    <div class="guide guide-tablet">
      <h2>Guide · tablet &amp; iPad</h2>
      <ul>
        <li><b>Draw</b> with a finger, or with Apple Pencil or a stylus: pressure makes lines thicker and thinner.</li>
        <li><b>Tools</b> at the bottom · <b>undo / redo</b> top left · <b>hide everything</b> top middle · <b>Save</b> bottom right.</li>
        <li><b>Swipe the top strip</b> of the tools for Text effects, Replay, Fullscreen, Clear and this guide.</li>
        <li><b>In &amp; out:</b> Effects → In &amp; out sets how everything enters and leaves on Replay and in the video.</li>
        <li><b>Text effects:</b> tap a theme, then open any section to fine-tune it: font, fill, animation, decoration size and amount, scene, finish and colours.</li>
        <li>Landscape gives the most room; the tools rearrange when you turn the tablet.</li>
        <li>With a keyboard attached, the laptop shortcuts work too (R replays, Ctrl Z undoes).</li>
      </ul>
    </div>
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
      <button type="button" data-act="fx" aria-haspopup="true" aria-expanded="false" aria-label="Text effects" title="Text effects">${icon(I.textfx)}<span class="lbl">Text effects</span></button>
      <button type="button" data-act="export" aria-haspopup="true" aria-expanded="false" aria-label="Save or export" title="Export">${icon(I.export)}<span class="lbl">Save</span></button>
    </div>
    <div class="group">
      <button type="button" data-act="fullscreen" aria-pressed="false" aria-label="Fullscreen (F)" title="Fullscreen (F)">${icon(I.full)}<span class="lbl">Fullscreen</span></button>
      <button type="button" data-act="hide-tools" aria-label="Hide tools (H)" title="Hide tools (H)">${icon(I.hide)}<span class="lbl">Hide</span></button>
      <button type="button" data-act="clear" aria-label="Clear canvas (Delete)" title="Clear (Delete)">${icon(I.clear)}<span class="lbl">Clear</span></button>
      <button type="button" data-act="help" aria-haspopup="true" aria-expanded="false" aria-label="Guide (?)" title="Guide (?)">${icon(I.help)}<span class="lbl">Guide</span></button>
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
