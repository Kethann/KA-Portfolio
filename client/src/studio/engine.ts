// Typography studio engine: strokes are stored as data (points, time, pressure, settings, seed)
// and every brush has its own renderer. The same renderers draw the live view, the replay, and
// every export, so what you export is exactly what you drew. No DOM here except canvases.

export type BrushId = 'pen' | 'marker' | 'calligraphy' | 'pencil' | 'spray' | 'neon' | 'ribbon' | 'particles' | 'dotted' | 'dashed';
export const BRUSHES: { id: BrushId; name: string }[] = [
  { id: 'pen', name: 'Round pen' }, { id: 'marker', name: 'Marker' }, { id: 'calligraphy', name: 'Calligraphy' },
  { id: 'pencil', name: 'Pencil / chalk' }, { id: 'spray', name: 'Spray' }, { id: 'neon', name: 'Neon glow' },
  { id: 'ribbon', name: 'Ribbon' }, { id: 'particles', name: 'Particle trail' }, { id: 'dotted', name: 'Dotted' }, { id: 'dashed', name: 'Dashed' }
];
export type Symmetry = 'none' | 'mirror-x' | 'mirror-y' | 'quad' | 'radial';
export const BLENDS: { id: GlobalCompositeOperation; name: string }[] = [
  { id: 'source-over', name: 'Normal' }, { id: 'lighter', name: 'Add (glow)' }, { id: 'screen', name: 'Screen' }, { id: 'multiply', name: 'Multiply' },
  { id: 'overlay', name: 'Overlay' }, { id: 'difference', name: 'Difference' }, { id: 'color-dodge', name: 'Dodge' }
];
export const FILTERS: { id: string; name: string; css: string }[] = [
  { id: 'none', name: 'None', css: 'none' }, { id: 'mono', name: 'Mono', css: 'grayscale(1)' }, { id: 'sepia', name: 'Sepia', css: 'sepia(.85)' },
  { id: 'vivid', name: 'Vivid', css: 'saturate(1.7) contrast(1.1)' }, { id: 'dream', name: 'Dream', css: 'saturate(1.3) hue-rotate(-25deg) brightness(1.08)' },
  { id: 'invert', name: 'Invert', css: 'invert(1) hue-rotate(180deg)' }
];

export interface Settings {
  brush: BrushId; color: string; color2: string; gradient: boolean; opacity: number; size: number;
  smoothing: number; pressure: boolean; symmetry: Symmetry; radial: number; blend: GlobalCompositeOperation;
  glow: number; blur: number; lifetime: number; flow: number; wobble: number;
}
export const DEFAULT_SETTINGS: Settings = {
  brush: 'pen', color: '#ffb37a', color2: '#9b6bff', gradient: false, opacity: 1, size: 8,
  smoothing: 0.5, pressure: true, symmetry: 'none', radial: 6, blend: 'source-over',
  glow: 0, blur: 0, lifetime: 0, flow: 1, wobble: 0
};

export interface Stroke { kind: 'stroke' | 'erase'; id: number; seed: number; s: Settings; pts: Float32Array; n: number; start: number; end: number }
export interface TextItem { kind: 'text'; id: number; seed: number; s: Settings; x: number; y: number; text: string; font: string; px: number; start: number; end: number }
export type Item = Stroke | TextItem;

export type Background = { kind: 'space' } | { kind: 'solid'; color: string } | { kind: 'gradient'; a: string; b: string; angle: number };

// ---- small helpers -----------------------------------------------------------------------------
export function rng(seed: number){
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function hexToRgb(hex: string): [number, number, number]{
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0xffffff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: [number, number, number], b: [number, number, number], t: number, alpha: number){
  return `rgba(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)},${alpha.toFixed(3)})`;
}
// smooth value noise for wobble/turbulence (deterministic)
function noise1(x: number, seed: number){
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const h = (k: number) => { let v = Math.sin((k + seed * 0.618) * 127.1) * 43758.5453; return v - Math.floor(v); };
  return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
}

export const POINT_STRIDE = 4;   // x, y, t(ms since stroke start), pressure
export function newStroke(kind: 'stroke' | 'erase', id: number, s: Settings, start: number): Stroke {
  return { kind, id, seed: (Math.random() * 2 ** 31) | 0, s: { ...s }, pts: new Float32Array(256 * POINT_STRIDE), n: 0, start, end: start };
}
export function pushPoint(st: Stroke, x: number, y: number, t: number, p: number){
  if ((st.n + 1) * POINT_STRIDE > st.pts.length){
    const grown = new Float32Array(st.pts.length * 2); grown.set(st.pts); st.pts = grown;
  }
  const o = st.n * POINT_STRIDE;
  st.pts[o] = x; st.pts[o + 1] = y; st.pts[o + 2] = t; st.pts[o + 3] = p;
  st.n++;
  st.end = st.start + t;
}

// ---- render context ----------------------------------------------------------------------------
export interface RenderOpts {
  now: number;            // session clock (ms) used for fading / animation
  clip?: number;          // replay: only points with start + t <= clip are drawn
  frozen?: boolean;       // permanent bake: no fading, animation frozen at its settled state
  cx: number; cy: number; // symmetry centre (world units)
}

const PARTICLE_LIFE = 1400;

// Visibility of a point (0..1). Permanent ink = 1; fading trail = each point fades on its own
// clock, so a moving pen leaves a comet-like trail.
function pointAlpha(it: Item, tAbs: number, o: RenderOpts){
  if (o.frozen || it.s.lifetime <= 0) return 1;
  const age = o.now - tAbs;
  const life = it.s.lifetime * 1000;
  return age <= 0 ? 1 : Math.max(0, 1 - age / life);
}
export function isAlive(it: Item, now: number){
  if (it.s.lifetime <= 0) return true;
  return now - it.end < it.s.lifetime * 1000;
}
// Fading trails animate until gone; permanent particle strokes animate until their particles
// settle (then they're baked as ink). Everything else permanent is static the moment it's drawn.
export function needsAnimation(it: Item, now: number){
  if (it.s.lifetime > 0) return isAlive(it, now);
  return it.kind === 'stroke' && it.s.brush === 'particles' && now - it.end < PARTICLE_LIFE;
}

function symmetryTransforms(s: Settings, cx: number, cy: number): DOMMatrix[] {
  const id = new DOMMatrix();
  if (s.symmetry === 'none') return [id];
  const flipX = new DOMMatrix().translate(cx, 0).scale(-1, 1).translate(-cx, 0);
  const flipY = new DOMMatrix().translate(0, cy).scale(1, -1).translate(0, -cy);
  if (s.symmetry === 'mirror-x') return [id, flipX];
  if (s.symmetry === 'mirror-y') return [id, flipY];
  if (s.symmetry === 'quad') return [id, flipX, flipY, flipX.multiply(flipY)];
  const n = Math.max(2, Math.min(24, s.radial | 0));
  return Array.from({ length: n }, (_, i) => new DOMMatrix().translate(cx, cy).rotate((360 / n) * i).translate(-cx, -cy));
}

// Draws one item. `ctx` is already scaled so 1 unit = 1 world pixel.
export function drawItem(ctx: CanvasRenderingContext2D, it: Item, o: RenderOpts){
  const base = ctx.getTransform();
  for (const m of symmetryTransforms(it.s, o.cx, o.cy)){
    ctx.save();
    ctx.setTransform(base.multiply(m));
    ctx.globalCompositeOperation = it.kind === 'erase' ? 'destination-out' : it.s.blend;
    if (it.s.blur > 0 && 'filter' in ctx) ctx.filter = `blur(${it.s.blur}px)`;
    if (it.s.glow > 0 && it.kind !== 'erase'){ ctx.shadowBlur = it.s.glow; ctx.shadowColor = it.s.color; }
    if (it.kind === 'text') drawText(ctx, it, o);
    else drawStroke(ctx, it, o);
    ctx.restore();
  }
}

function visibleCount(st: Stroke, o: RenderOpts){
  if (o.clip === undefined) return st.n;
  const limit = o.clip - st.start;
  if (limit < 0) return 0;
  let n = st.n;
  while (n > 0 && st.pts[(n - 1) * POINT_STRIDE + 2] > limit) n--;
  return n;
}

function wobbleAt(st: Stroke, i: number, o: RenderOpts, axis: number){
  if (st.s.wobble <= 0) return 0;
  const t = st.pts[i * POINT_STRIDE + 2];
  // permanent ink keeps a fixed wobble shape (so it never jumps when the pen lifts); trails move
  const clock = o.frozen || st.s.lifetime <= 0 ? 0 : o.now * 0.001 * st.s.flow;
  return noise1(t * 0.004 + clock + axis * 31.7, st.seed + axis) * st.s.wobble * st.s.size * 0.6;
}

function drawStroke(ctx: CanvasRenderingContext2D, st: Stroke, o: RenderOpts){
  const n = visibleCount(st, o);
  if (!n) return;
  const P = st.pts, S = POINT_STRIDE, s = st.s;
  const X = (i: number) => P[i * S] + wobbleAt(st, i, o, 0);
  const Y = (i: number) => P[i * S + 1] + wobbleAt(st, i, o, 1);
  const T = (i: number) => st.start + P[i * S + 2];
  const W = (i: number) => {
    const p = s.pressure ? P[i * S + 3] : 0.62;
    return Math.max(0.5, s.size * (0.25 + p * 1.2));
  };
  const c1 = hexToRgb(s.color), c2 = hexToRgb(s.gradient ? s.color2 : s.color);
  const col = (i: number, a = 1) => mix(c1, c2, n > 1 ? i / (n - 1) : 0, s.opacity * a * pointAlpha(st, T(i), o));
  const brush = st.kind === 'erase' ? 'pen' : s.brush;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  if (n === 1){
    if (brush === 'spray' || brush === 'pencil' || brush === 'particles') { /* fall through to their loops */ }
    else { ctx.fillStyle = col(0); ctx.beginPath(); ctx.arc(X(0), Y(0), W(0) / 2, 0, Math.PI * 2); ctx.fill(); return; }
  }
  const r = rng(st.seed);
  switch (brush){
    case 'pen': {
      for (let i = 1; i < n; i++){
        const a = pointAlpha(st, T(i), o); if (a <= 0) continue;
        const mx0 = (X(i - 1) + X(i)) / 2, my0 = (Y(i - 1) + Y(i)) / 2;
        const mx1 = i + 1 < n ? (X(i) + X(i + 1)) / 2 : X(i), my1 = i + 1 < n ? (Y(i) + Y(i + 1)) / 2 : Y(i);
        ctx.strokeStyle = col(i); ctx.lineWidth = W(i);
        ctx.beginPath(); ctx.moveTo(i === 1 ? X(0) : mx0, i === 1 ? Y(0) : my0); ctx.quadraticCurveTo(X(i), Y(i), mx1, my1); ctx.stroke();
      }
      break;
    }
    case 'marker': {
      // one path, so overlapping segments don't darken; flat ends like a chisel marker
      if (s.lifetime > 0 && !o.frozen){ drawSegments(ctx, n, X, Y, (i) => col(i, 0.7), () => s.size * 1.7, 'butt'); break; }
      ctx.lineCap = 'butt'; ctx.lineWidth = s.size * 1.7;
      ctx.strokeStyle = s.gradient ? linearGrad(ctx, X(0), Y(0), X(n - 1), Y(n - 1), s, 0.7 * s.opacity) : col(0, 0.7);
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(i)); ctx.stroke();
      break;
    }
    case 'calligraphy': {
      const ang = -Math.PI / 4, nx = Math.cos(ang), ny = Math.sin(ang);
      for (let i = 1; i < n; i++){
        const a = pointAlpha(st, T(i), o); if (a <= 0) continue;
        const w0 = W(i - 1) * 0.9, w1 = W(i) * 0.9;
        ctx.fillStyle = col(i);
        ctx.beginPath();
        ctx.moveTo(X(i - 1) - nx * w0, Y(i - 1) - ny * w0); ctx.lineTo(X(i - 1) + nx * w0, Y(i - 1) + ny * w0);
        ctx.lineTo(X(i) + nx * w1, Y(i) + ny * w1); ctx.lineTo(X(i) - nx * w1, Y(i) - ny * w1);
        ctx.closePath(); ctx.fill();
        // a hairline outline in the same colour closes the anti-aliasing seams between segments
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke();
      }
      break;
    }
    case 'pencil': {
      for (let i = 1; i < n; i++){
        // random values are always drawn, even for faded points, so grain never shifts as a trail fades
        const a = pointAlpha(st, T(i), o);
        const dx = X(i) - X(i - 1), dy = Y(i) - Y(i - 1), len = Math.hypot(dx, dy);
        const count = Math.max(1, Math.ceil(len * 1.4));
        const w = W(i) * 0.6;
        ctx.fillStyle = col(i, 0.55);
        for (let k = 0; k < count; k++){
          const f = k / count, g1 = r(), g2 = r(), g3 = r();
          const px = X(i - 1) + dx * f + (g1 - 0.5) * w, py = Y(i - 1) + dy * f + (g2 - 0.5) * w;
          const sz = 0.6 + g3 * 1.4;
          if (a > 0 && g3 > 0.18) ctx.fillRect(px, py, sz, sz);   // gaps give the chalk grain
        }
      }
      break;
    }
    case 'spray': {
      for (let i = 0; i < n; i++){
        const a = pointAlpha(st, T(i), o);
        const rad = W(i) * 1.6, count = Math.max(4, Math.round(rad * 0.9));
        ctx.fillStyle = col(i, 0.8);
        for (let k = 0; k < count; k++){
          const t = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * (0.4 + r() * 0.6);
          const sz = 0.6 + r() * 1.2;
          if (a > 0) ctx.fillRect(X(i) + Math.cos(t) * d, Y(i) + Math.sin(t) * d, sz, sz);
        }
      }
      break;
    }
    case 'neon': {
      ctx.globalCompositeOperation = s.blend === 'source-over' ? 'lighter' : s.blend;
      const passes: [number, number, number][] = [[2.6, 0.18, 22], [1.4, 0.45, 10], [0.45, 1, 0]];
      for (const [wm, am, blur] of passes){
        ctx.shadowBlur = blur + s.glow; ctx.shadowColor = s.color;
        drawSegments(ctx, n, X, Y, (i) => wm < 1 ? mix([255, 255, 255], c1, 0.25, s.opacity * am * pointAlpha(st, T(i), o)) : col(i, am), (i) => W(i) * wm, 'round');
      }
      break;
    }
    case 'ribbon': {
      const clock = o.frozen || s.lifetime <= 0 ? 0 : o.now * 0.002 * s.flow;
      for (let i = 1; i < n; i++){
        const a = pointAlpha(st, T(i), o); if (a <= 0) continue;
        const dx = X(i) - X(i - 1), dy = Y(i) - Y(i - 1), len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const tw0 = Math.sin(P[(i - 1) * S + 2] * 0.012 + clock) * W(i - 1), tw1 = Math.sin(P[i * S + 2] * 0.012 + clock) * W(i);
        // the twist is shaded by darkening (not transparency), so segments stay solid and seamless
        const shade = 0.55 + 0.45 * Math.abs(Math.cos(P[i * S + 2] * 0.012 + clock));
        const t = n > 1 ? i / (n - 1) : 0, base: [number, number, number] = [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
        ctx.fillStyle = mix([0, 0, 0], base, shade, s.opacity * a);
        ctx.beginPath();
        ctx.moveTo(X(i - 1) + nx * tw0, Y(i - 1) + ny * tw0); ctx.lineTo(X(i) + nx * tw1, Y(i) + ny * tw1);
        ctx.lineTo(X(i) - nx * tw1 * 0.25, Y(i) - ny * tw1 * 0.25); ctx.lineTo(X(i - 1) - nx * tw0 * 0.25, Y(i - 1) - ny * tw0 * 0.25);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke();
      }
      break;
    }
    case 'particles': {
      // each point sheds seeded particles that drift (flow) and fade; baked ink keeps them settled
      for (let i = 0; i < n; i++){
        const born = T(i);
        const age = Math.max(0, (o.clip ?? o.now) - born);
        const a = pointAlpha(st, born, o);
        for (let k = 0; k < 3; k++){
          const ang = r() * Math.PI * 2, speed = (0.012 + r() * 0.05) * s.flow, jitter = r();
          if (a <= 0) continue;
          const life = PARTICLE_LIFE * (0.5 + jitter * 0.5), settle = life * 0.45;
          let t: number, fade: number;
          if (s.lifetime > 0){ t = Math.min(age, life); fade = Math.max(0, 1 - t / life); }
          else { t = o.frozen ? settle : Math.min(age, settle); fade = 1 - 0.25 * (t / settle); }   // permanent: drift, then settle as ink
          if (fade <= 0) continue;
          const px = X(i) + Math.cos(ang) * speed * t, py = Y(i) + Math.sin(ang) * speed * t - t * 0.01 * s.flow;
          const sz = Math.max(0.4, W(i) * 0.35 * (0.4 + fade * 0.6));
          ctx.fillStyle = col(i, fade);
          ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
        }
      }
      break;
    }
    case 'dotted': {
      const gap = Math.max(4, s.size * 1.8);
      let carry = 0;
      for (let i = 1; i < n; i++){
        const dx = X(i) - X(i - 1), dy = Y(i) - Y(i - 1), len = Math.hypot(dx, dy);
        let d = gap - carry;
        const a = pointAlpha(st, T(i), o);
        while (d <= len){
          if (a > 0){ ctx.fillStyle = col(i); ctx.beginPath(); ctx.arc(X(i - 1) + dx * d / len, Y(i - 1) + dy * d / len, W(i) / 2, 0, Math.PI * 2); ctx.fill(); }
          d += gap;
        }
        carry = len - (d - gap);
      }
      break;
    }
    case 'dashed': {
      ctx.setLineDash([Math.max(4, s.size * 3), Math.max(3, s.size * 2)]);
      if (s.lifetime > 0 && !o.frozen){ drawSegments(ctx, n, X, Y, (i) => col(i), () => s.size, 'butt'); break; }
      ctx.lineCap = 'butt'; ctx.lineWidth = s.size;
      ctx.strokeStyle = s.gradient ? linearGrad(ctx, X(0), Y(0), X(n - 1), Y(n - 1), s, s.opacity) : col(0);
      ctx.beginPath(); ctx.moveTo(X(0), Y(0)); for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(i)); ctx.stroke();
      break;
    }
  }
}

function drawSegments(ctx: CanvasRenderingContext2D, n: number, X: (i: number) => number, Y: (i: number) => number, color: (i: number) => string, width: (i: number) => number, cap: CanvasLineCap){
  ctx.lineCap = cap;
  for (let i = 1; i < n; i++){
    ctx.strokeStyle = color(i); ctx.lineWidth = width(i);
    ctx.beginPath(); ctx.moveTo(X(i - 1), Y(i - 1)); ctx.lineTo(X(i), Y(i)); ctx.stroke();
  }
}
function linearGrad(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, s: Settings, alpha: number){
  const g = ctx.createLinearGradient(x0, y0, x1 === x0 && y1 === y0 ? x0 + 1 : x1, y1);
  g.addColorStop(0, mix(hexToRgb(s.color), hexToRgb(s.color), 0, alpha));
  g.addColorStop(1, mix(hexToRgb(s.color2), hexToRgb(s.color2), 0, alpha));
  return g;
}

function drawText(ctx: CanvasRenderingContext2D, it: TextItem, o: RenderOpts){
  let chars = it.text.length;
  if (o.clip !== undefined){
    const elapsed = o.clip - it.start;
    if (elapsed < 0) return;
    chars = Math.min(it.text.length, Math.ceil((elapsed / Math.max(1, it.end - it.start)) * it.text.length));
  }
  const alpha = it.s.opacity * pointAlpha(it, it.end, o);
  if (alpha <= 0 || chars <= 0) return;
  ctx.font = `${it.px}px ${it.font}`;
  ctx.textBaseline = 'top';
  const lines = it.text.slice(0, chars).split('\n');
  const w = Math.max(...lines.map(l => ctx.measureText(l).width), 1);
  const c1 = hexToRgb(it.s.color), c2 = hexToRgb(it.s.gradient ? it.s.color2 : it.s.color);
  if (it.s.gradient){
    const g = ctx.createLinearGradient(it.x, it.y, it.x + w, it.y);
    g.addColorStop(0, mix(c1, c1, 0, alpha)); g.addColorStop(1, mix(c2, c2, 0, alpha));
    ctx.fillStyle = g;
  } else ctx.fillStyle = mix(c1, c1, 0, alpha);
  const wob = it.s.wobble > 0 && !o.frozen ? it.s.wobble * 3 : 0;
  lines.forEach((line, li) => {
    if (!wob){ ctx.fillText(line, it.x, it.y + li * it.px * 1.2); return; }
    let x = it.x;
    for (let ci = 0; ci < line.length; ci++){
      const ch = line[ci];
      ctx.fillText(ch, x, it.y + li * it.px * 1.2 + noise1(ci * 0.7 + o.now * 0.002 * it.s.flow, it.seed) * wob);
      x += ctx.measureText(ch).width;
    }
  });
}

// ---- backgrounds ------------------------------------------------------------------------------
// The "space" background: a snapshot of the site's own live nebula when available (it is drawn
// behind the studio while you work), otherwise a drawn stand-in in the same colours.
export function drawBackground(ctx: CanvasRenderingContext2D, bg: Background, w: number, h: number, space?: CanvasImageSource | null){
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  if (bg.kind === 'solid'){ ctx.fillStyle = bg.color; ctx.fillRect(0, 0, w, h); }
  else if (bg.kind === 'gradient'){
    const a = (bg.angle * Math.PI) / 180, r = Math.hypot(w, h) / 2, cx = w / 2, cy = h / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.addColorStop(0, bg.a); g.addColorStop(1, bg.b);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } else if (space){
    ctx.drawImage(space, 0, 0, w, h);
  } else {
    drawSpaceFallback(ctx, w, h);
  }
  ctx.restore();
}
export function drawSpaceFallback(ctx: CanvasRenderingContext2D, w: number, h: number){
  const base = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
  base.addColorStop(0, '#0a0a0d'); base.addColorStop(0.6, '#050506'); base.addColorStop(1, '#020203');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  const blob = (x: number, y: number, rx: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };
  blob(w * 0.62, h * 0.38, Math.max(w, h) * 0.45, 'rgba(158,61,235,0.30)');
  blob(w * 0.3, h * 0.62, Math.max(w, h) * 0.35, 'rgba(41,13,77,0.55)');
  blob(w * 0.62, h * 0.38, Math.max(w, h) * 0.28, 'rgba(120,40,20,0.22)');
  const r = rng(20260929);
  const stars = Math.round((w * h) / 9000);
  for (let i = 0; i < stars; i++){
    const s = 0.4 + r() * 1.3;
    ctx.fillStyle = `rgba(255,255,255,${(0.35 + r() * 0.6).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(r() * w, r() * h, s * Math.max(1, w / 1600), 0, Math.PI * 2); ctx.fill();
  }
}

// ---- document --------------------------------------------------------------------------------
export const MAX_POINTS = 250000;
export function totalPoints(items: Item[]){ let n = 0; for (const it of items) if (it.kind !== 'text') n += it.n; return n; }

// Full render of the document at `now` into ctx (world units scaled by `scale`).
export function renderScene(ctx: CanvasRenderingContext2D, items: Item[], o: RenderOpts, scale: number){
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  for (const it of items){
    if (o.clip === undefined && !isAlive(it, o.now)) continue;
    drawItem(ctx, it, o);
  }
  ctx.restore();
}

// The box an item covers (world pixels): in / out animations grow, shrink and move it around its own centre.
export function itemBox(it: Item){
  if (it.kind === 'text'){
    const lines = it.text.split('\n'), w = Math.max(...lines.map(l => l.length), 1) * it.px * 0.55;
    return { x: it.x, y: it.y, w, h: lines.length * it.px * 1.2 };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < it.n; i++){ const x = it.pts[i * POINT_STRIDE], y = it.pts[i * POINT_STRIDE + 1]; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Replay timeline: original timings, with long pauses between strokes shortened to 600 ms.
export function replayTimeline(items: Item[]){
  const map = new Map<number, number>();
  let clock = 0, prevEnd: number | null = null;
  for (const it of [...items].sort((a, b) => a.start - b.start)){
    const gap = prevEnd === null ? 0 : Math.min(600, Math.max(0, it.start - prevEnd));
    clock += gap;
    map.set(it.id, clock - it.start);   // offset to add to original time
    clock += it.end - it.start;
    prevEnd = it.end;
  }
  return { offsets: map, duration: clock + 300 };
}
// Items retimed onto the replay clock (shallow copies; point data shared, never mutated).
export function retimed(items: Item[], offsets: Map<number, number>): Item[] {
  return items.map(it => ({ ...it, start: it.start + (offsets.get(it.id) || 0), end: it.end + (offsets.get(it.id) || 0) }) as Item);
}
