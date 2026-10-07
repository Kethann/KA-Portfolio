// Real handwriting: every letter is written the way a hand writes it, stroke by stroke.
//  1. The letter is drawn on a small canvas in its real font and thinned to its centre line (Zhang–Suen skeleton).
//  2. The centre line is traced into pen strokes in a natural order: start top-left, follow the line without lifting,
//     then lift and move to the nearest unwritten stroke. Loops (o, a, e) are written as one continuous turn.
//  3. A round nib as wide as the letter's own stroke runs along those strokes: each stroke eases in and out
//     (minimum-jerk, like a real wrist), the pen lifts briefly between strokes, longer between words and lines.
//  The ink is drawn on a canvas over the words while writing; when the last letter is done the real letters take over
//  (same font, same place, same fill), so stills and exports show crisp text. The pen tip is exposed for decorations.
import type { CharInfo, Effect, EffectContext, Point } from '../types';
import { between } from '../rng';

interface Stroke { pts: Point[]; cum: number[]; len: number }
interface Skeleton { strokes: Stroke[]; pen: number; pad: number; scale: number }
interface Plan { c: CharInfo; sk: Skeleton; img: HTMLCanvasElement; mask: HTMLCanvasElement; ox: number; oy: number; t0: number; t1: number; spans: [number, number][]; drawn: number; total: number }

const cache = new Map<string, Skeleton>();
let plans: Plan[] = [];
let ink: HTMLCanvasElement | null = null;
let tmp: HTMLCanvasElement | null = null;

/** baseline of a letter inside its inline-block box (half the line's extra leading above the ascent) */
export function baselineIn(x: CanvasRenderingContext2D, ch: string, boxH: number){
  const m = x.measureText(ch), a = m.fontBoundingBoxAscent || boxH * 0.75, d = m.fontBoundingBoxDescent || boxH * 0.25;
  return (boxH - (a + d)) / 2 + a;
}

// ---------------------------------------------------------------- skeleton
function thin(img: Uint8Array, W: number, H: number){
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : img[y * W + x];
  let changed = true, guard = 0;
  while (changed && guard++ < 60){
    changed = false;
    for (const pass of [0, 1]){
      const del: number[] = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++){
        if (!img[y * W + x]) continue;
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const b = p.reduce((s, v) => s + v, 0); if (b < 2 || b > 6) continue;
        let a = 0; for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
        if (a !== 1) continue;
        if (pass === 0 ? (p[0] * p[2] * p[4] === 0 && p[2] * p[4] * p[6] === 0) : (p[0] * p[2] * p[6] === 0 && p[0] * p[4] * p[6] === 0)) del.push(y * W + x);
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
}
const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function skeletonOf(ch: string, font: string, w: number, h: number): Skeleton {
  const key = `${ch}|${font}|${Math.round(w)}|${Math.round(h)}`;
  const hit = cache.get(key); if (hit) return hit;
  // work at a modest size (fast), then scale the strokes back
  const scale = Math.min(1, 130 / Math.max(1, h)), pad = Math.ceil(h * 0.45);
  const W = Math.max(8, Math.ceil((w + pad * 2) * scale)), H = Math.max(8, Math.ceil((h + pad * 2) * scale));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.scale(scale, scale); x.font = font; x.textBaseline = 'alphabetic'; x.fillStyle = '#000';
  x.fillText(ch, pad, pad + baselineIn(x, ch, h));
  const data = x.getImageData(0, 0, W, H).data, bin = new Uint8Array(W * H);
  let area = 0; for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] > 100){ bin[i] = 1; area++; }
  thin(bin, W, H);
  let skel = 0; for (let i = 0; i < W * H; i++) skel += bin[i];
  const penPx = skel ? Math.max(1.5, (area / skel) * 1.35 + 1) : 2;   // the letter's own stroke width (a touch wider so the ink fully covers it)
  // trace: endpoints first (top-left first), then whatever is left (closed loops)
  const on = (px: number, py: number) => px >= 0 && py >= 0 && px < W && py < H && bin[py * W + px] === 1;
  const seen = new Uint8Array(W * H);
  const nbrs = (px: number, py: number) => N8.map(([dx, dy]) => [px + dx, py + dy]).filter(([a, b]) => on(a, b));
  const strokes: Point[][] = [];
  let last: Point = { x: 0, y: 0 };
  const pickStart = () => {
    let best = -1, bd = Infinity, bestEnd = -1, be = Infinity;
    for (let i = 0; i < W * H; i++){
      if (!bin[i] || seen[i]) continue;
      const px = i % W, py = (i / W) | 0, deg = nbrs(px, py).filter(([a, b]) => !seen[b * W + a]).length;
      const d = strokes.length ? Math.hypot(px - last.x, py - last.y) : px * 0.7 + py * 0.5;
      if (deg <= 1 && d < be){ be = d; bestEnd = i; }
      if (d < bd){ bd = d; best = i; }
    }
    return bestEnd >= 0 ? bestEnd : best;
  };
  for (let guard = 0; guard < 40; guard++){
    const s = pickStart(); if (s < 0) break;
    let px = s % W, py = (s / W) | 0, dir = -1; const pts: Point[] = [{ x: px, y: py }]; seen[s] = 1;
    for (;;){
      const opts = N8.map(([dx, dy], k) => ({ k, x: px + dx, y: py + dy })).filter(o => on(o.x, o.y) && !seen[o.y * W + o.x]);
      if (!opts.length){
        // join up with an already-written neighbour so strokes meet instead of leaving gaps
        const j = N8.map(([dx, dy]) => ({ x: px + dx, y: py + dy })).find(o => on(o.x, o.y) && pts.length > 2 && !(o.x === pts[pts.length - 2]?.x && o.y === pts[pts.length - 2]?.y));
        if (j) pts.push(j);
        break;
      }
      // keep going in the same direction where possible (a hand doesn't zig-zag)
      opts.sort((a, b) => (dir < 0 ? 0 : Math.min((a.k - dir + 8) % 8, (dir - a.k + 8) % 8) - Math.min((b.k - dir + 8) % 8, (dir - b.k + 8) % 8)) || (a.k % 2) - (b.k % 2));
      const o = opts[0]; dir = o.k; px = o.x; py = o.y; seen[py * W + px] = 1; pts.push({ x: px, y: py });
    }
    last = pts[pts.length - 1];
    strokes.push(pts);
  }
  // drop tiny spurs (thinning noise) unless they are all there is, smooth, and scale back to letter pixels
  const keep = strokes.filter(p => p.length * 1 > penPx * 0.9 || strokes.length === 1);
  const out: Stroke[] = keep.map(p => {
    const sm = p.map((q, i) => { const a = p[Math.max(0, i - 2)], b = p[Math.min(p.length - 1, i + 2)]; return { x: ((a.x + q.x * 2 + b.x) / 4) / scale - pad, y: ((a.y + q.y * 2 + b.y) / 4) / scale - pad }; });
    const cum = [0]; for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + Math.hypot(sm[i].x - sm[i - 1].x, sm[i].y - sm[i - 1].y));
    return { pts: sm, cum, len: cum[cum.length - 1] || 0.5 };
  });
  const res: Skeleton = { strokes: out.length ? out : [{ pts: [{ x: w / 2, y: h / 2 }], cum: [0], len: 0.5 }], pen: penPx / scale, pad, scale };
  if (cache.size > 800) cache.clear();
  cache.set(key, res);
  return res;
}

// ---------------------------------------------------------------- drawing
const jerk = (u: number) => { const t = Math.max(0, Math.min(1, u)); return t * t * t * (10 - 15 * t + 6 * t * t); };
function pointAt(s: Stroke, d: number): Point {
  if (d <= 0) return s.pts[0];
  let i = 1; while (i < s.cum.length && s.cum[i] < d) i++;
  if (i >= s.pts.length) return s.pts[s.pts.length - 1];
  const a = s.pts[i - 1], b = s.pts[i], k = (d - s.cum[i - 1]) / Math.max(1e-6, s.cum[i] - s.cum[i - 1]);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}
/** how much of a letter is written at a time, as one number along its strokes laid end to end */
function writtenAt(p: Plan, time: number){
  if (time <= p.t0) return 0; if (time >= p.t1) return p.total;
  let base = 0;
  for (let i = 0; i < p.sk.strokes.length; i++){
    const [s0, s1] = p.spans[i], L = p.sk.strokes[i].len;
    if (time < s0) return base;
    if (time < s1) return base + jerk((time - s0) / (s1 - s0)) * L;
    base += L;
  }
  return p.total;
}
/** strokes the mask from length `from` to `to` (a round nib) */
function inkMask(p: Plan, from: number, to: number){
  const x = p.mask.getContext('2d')!;
  x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = p.sk.pen; x.strokeStyle = '#000';
  let base = 0;
  for (const s of p.sk.strokes){
    const a = Math.max(0, from - base), b = Math.min(s.len, to - base);
    if (b > a){
      x.beginPath(); const st = pointAt(s, a); x.moveTo(st.x + p.sk.pad, st.y + p.sk.pad);
      for (let i = 1; i < s.cum.length; i++) if (s.cum[i] > a && s.cum[i] < b){ const q = s.pts[i]; x.lineTo(q.x + p.sk.pad, q.y + p.sk.pad); }
      const en = pointAt(s, b); x.lineTo(en.x + p.sk.pad + 0.01, en.y + p.sk.pad);
      x.stroke();
    }
    base += s.len;
  }
}

export const handwriting: Effect = {
  id: 'handwriting', name: 'Real handwriting', description: 'Written stroke by stroke like a real hand: the pen follows each letter, eases through every curve and lifts between strokes.', duration: 3,
  params: [],
  init(ctx){
    plans = [];
    const sr = ctx.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    ink = document.createElement('canvas'); ink.className = 'fx-ink'; ink.setAttribute('aria-hidden', 'true');
    ink.width = Math.round(sr.width * dpr); ink.height = Math.round(sr.height * dpr);
    ctx.stage.insertBefore(ink, ctx.stage.querySelector('.fx-caret'));
    // the glow the words have, on the ink too
    const ts = ctx.textEl.style.textShadow, fl = ctx.textEl.style.filter;
    ink.style.filter = fl || (ts ? ts.split(/,(?![^(]*\))/).map(s => `drop-shadow(${s.trim()})`).join(' ') : '');
    tmp = tmp || document.createElement('canvas');
    const font = getComputedStyle(ctx.textEl).font, paint = ctx.paint;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const c of ctx.chars){ bx0 = Math.min(bx0, c.rect.left - sr.left); by0 = Math.min(by0, c.rect.top - sr.top); bx1 = Math.max(bx1, c.rect.right - sr.left); by1 = Math.max(by1, c.rect.bottom - sr.top); }
    for (const c of ctx.chars){
      c.el.style.opacity = '0';
      const sk = skeletonOf(c.char, font, c.rect.width, c.rect.height);
      const ox = c.rect.left - sr.left - sk.pad, oy = c.rect.top - sr.top - sk.pad;
      const w = Math.ceil((c.rect.width + sk.pad * 2) * dpr), h = Math.ceil((c.rect.height + sk.pad * 2) * dpr);
      // the finished letter, exactly as the page draws it (font, fill, outline)
      const img = document.createElement('canvas'); img.width = w; img.height = h;
      const x = img.getContext('2d')!; x.scale(dpr, dpr); x.font = font; x.textBaseline = 'alphabetic';
      if (paint?.stops){
        const st = paint.stops, g = st.angle === 'h' ? x.createLinearGradient(bx0 - ox, 0, bx1 - ox, 0) : st.angle === 'v-up' ? x.createLinearGradient(0, by1 - oy, 0, by0 - oy) : x.createLinearGradient(0, by0 - oy, 0, by1 - oy);
        for (const [o, col] of st.stops) g.addColorStop(o, col); x.fillStyle = g;
      } else x.fillStyle = paint?.color || ctx.palette.text;
      const by = sk.pad + baselineIn(x, c.char, c.rect.height);
      if (paint?.outline){ x.strokeStyle = paint.outline; x.lineWidth = Math.max(1.5, parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '60') * 0.03); x.strokeText(c.char, sk.pad, by); }
      else x.fillText(c.char, sk.pad, by);
      const mask = document.createElement('canvas'); mask.width = Math.ceil((c.rect.width + sk.pad * 2)); mask.height = Math.ceil((c.rect.height + sk.pad * 2));
      plans.push({ c, sk, img, mask, ox, oy, t0: 0, t1: 0, spans: [], drawn: 0, total: sk.strokes.reduce((s, q) => s + q.len, 0) });
    }
    ctx.penAt = (time: number) => {
      const p = plans.find(q => time >= q.t0 && time <= q.t1); if (!p) return null;
      let d = writtenAt(p, time);
      for (const s of p.sk.strokes){ if (d <= s.len){ const q = pointAt(s, d); return { x: q.x + p.ox + p.sk.pad, y: q.y + p.oy + p.sk.pad }; } d -= s.len; }
      return null;
    };
  },
  play(tl, ctx){
    const r = ctx.rng, sp = Math.max(0.25, ctx.speed), pen = ctx.stage.querySelector<HTMLElement>('.fx-pen');
    const px = plans.length ? plans[0].c.rect.height : 60, v = px * between(r, 3.6, 4.4) * sp;   // writing speed: about four letter-heights a second
    let t = 0.35;
    plans.forEach((p, i) => {
      p.t0 = t; p.spans = [];
      p.sk.strokes.forEach((s, k) => {
        if (k) t += between(r, 0.05, 0.1) / sp;                       // the pen lifts between strokes of one letter
        const d = Math.max(0.08 / sp, s.len / v) * between(r, 0.9, 1.12);
        p.spans.push([t, t + d]); t += d;
      });
      p.t1 = t;
      ctx.revealAt(i, p.t0 + (p.t1 - p.t0) * 0.6);
      const next = plans[i + 1]?.c;
      if (next) t += next.line !== p.c.line ? between(r, 0.3, 0.45) / sp : next.word !== p.c.word ? between(r, 0.16, 0.28) / sp : between(r, 0.02, 0.06) / sp;
    });
    const end = t;
    const els = ctx.chars.map(c => c.el);
    tl.set(els, { opacity: 0 }, 0);
    if (ink) tl.set(ink, { opacity: 1 }, 0);
    const proxy = { t: 0 };
    const render = () => {
      if (!ink) return;
      const x = ink.getContext('2d')!, dpr = ink.width / Math.max(1, ctx.stage.clientWidth);
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, ink.width, ink.height);
      let tip: Point | null = null, lifting = false;
      for (const p of plans){
        const w = writtenAt(p, proxy.t);
        if (w <= 0){ if (p.drawn){ p.mask.getContext('2d')!.clearRect(0, 0, p.mask.width, p.mask.height); p.drawn = 0; } continue; }
        if (w >= p.total){ x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(p.img, Math.round(p.ox * dpr), Math.round(p.oy * dpr)); continue; }
        if (w < p.drawn){ p.mask.getContext('2d')!.clearRect(0, 0, p.mask.width, p.mask.height); p.drawn = 0; }
        if (w > p.drawn){ inkMask(p, p.drawn, w); p.drawn = w; }
        // the letter, revealed only where the nib has passed
        tmp!.width = p.img.width; tmp!.height = p.img.height;
        const q = tmp!.getContext('2d')!; q.drawImage(p.img, 0, 0); q.globalCompositeOperation = 'destination-in'; q.drawImage(p.mask, 0, 0, p.img.width, p.img.height); q.globalCompositeOperation = 'source-over';
        x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(tmp!, Math.round(p.ox * dpr), Math.round(p.oy * dpr));
        let d = w; for (let k = 0; k < p.sk.strokes.length; k++){ const s = p.sk.strokes[k]; if (d <= s.len){ const pt = pointAt(s, d); tip = { x: pt.x + p.ox + p.sk.pad, y: pt.y + p.oy + p.sk.pad }; lifting = proxy.t > p.spans[k][1]; break; } d -= s.len; }
      }
      if (pen){ if (tip){ pen.style.opacity = lifting ? '0.45' : '1'; pen.style.transform = `translate(${tip.x.toFixed(1)}px, ${tip.y.toFixed(1)}px)`; } else pen.style.opacity = '0'; }
    };
    tl.fromTo(proxy, { t: 0 }, { t: end, duration: end, ease: 'none', onUpdate: render, onStart: render }, 0);
    // the real letters take over from the ink, in the same frame
    tl.set(els, { opacity: 1 }, end + 0.02);
    if (ink) tl.set(ink, { opacity: 0 }, end + 0.02);
    if (pen) tl.set(pen, { opacity: 0 }, end + 0.05);
    return end;
  },
  reset(ctx){
    plans = []; ctx.penAt = undefined; ink?.remove(); ink = null;
    for (const c of ctx.chars){ c.el.style.opacity = ''; c.el.style.clipPath = ''; }
    const pen = ctx.stage.querySelector<HTMLElement>('.fx-pen'); if (pen){ pen.style.transform = ''; pen.style.opacity = '0'; }
  },
};
