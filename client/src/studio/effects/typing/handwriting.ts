// Real handwriting: every letter is written the way a hand writes it, stroke by stroke.
//  1. The letter is drawn on a small canvas in its real font, measured (how thick it is at every point: a distance
//     transform) and thinned to its centre line (Zhang–Suen skeleton).
//  2. The centre line is traced into pen strokes in a natural order: start top-left, follow the line without lifting,
//     then lift and move to the nearest unwritten stroke. Strokes run top/left to bottom/right unless they continue
//     from where the pen just was. Thinning spurs are dropped; dots (i, j, punctuation) are kept and written last.
//  3. The nib is as wide as the letter is at each point, so thick and thin calligraphic strokes fill exactly as they
//     are written. Speed follows the shape like a real wrist: it slows into tight curves and runs along straights
//     (the two-thirds power law), and eases in and out of every stroke. Between strokes the pen lifts and glides
//     through the air to the next one; longer pauses between words and lines.
//  The ink is drawn on a canvas over the words; when the last letter is done the real letters take over in the same
//  frame (same font, place, fill or 3D material), so stills and exports stay crisp. The pen tip is exposed for decorations.
import type { CharInfo, Effect, EffectContext, Point } from '../types';
import { between } from '../rng';

interface Stroke { pts: Point[]; r: number[]; cum: number[]; tcum: number[]; len: number; dot: boolean }
export interface Skeleton { strokes: Stroke[]; pen: number; pad: number; scale: number }
interface Plan { c: CharInfo; sk: Skeleton; img: HTMLCanvasElement; mask: HTMLCanvasElement; ox: number; oy: number; t0: number; t1: number; spans: [number, number][]; drawn: number; total: number; extra: number }

const cache = new Map<string, Skeleton>();
let plans: Plan[] = [];
let ink: HTMLCanvasElement | null = null;
let tmp: HTMLCanvasElement | null = null;

/** baseline of a letter inside its inline-block box (half the line's extra leading above the ascent) */
export function baselineIn(x: CanvasRenderingContext2D, ch: string, boxH: number){
  const m = x.measureText(ch), a = m.fontBoundingBoxAscent || boxH * 0.75, d = m.fontBoundingBoxDescent || boxH * 0.25;
  return (boxH - (a + d)) / 2 + a;
}

// ---------------------------------------------------------------- measuring the letter
function thin(img: Uint8Array, W: number, H: number){
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : img[y * W + x];
  let changed = true, guard = 0;
  while (changed && guard++ < 80){
    changed = false;
    for (const pass of [0, 1]){
      const del: number[] = [];
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++){
        if (!img[y * W + x]) continue;
        const p = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
        const b = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7]; if (b < 2 || b > 6) continue;
        let a = 0; for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
        if (a !== 1) continue;
        if (pass === 0 ? (p[0] * p[2] * p[4] === 0 && p[2] * p[4] * p[6] === 0) : (p[0] * p[2] * p[6] === 0 && p[0] * p[4] * p[6] === 0)) del.push(y * W + x);
      }
      for (const i of del) img[i] = 0;
      if (del.length) changed = true;
    }
  }
}
/** distance (in pixels) from every inside pixel to the nearest outside pixel: the letter's half-thickness there */
export function insideDistance(bin: Uint8Array, W: number, H: number){
  const D = new Float32Array(W * H), INF = 1e6, R2 = Math.SQRT2;
  for (let i = 0; i < W * H; i++) D[i] = bin[i] ? INF : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y * W + x; if (!D[i]) continue; let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + 1); else v = Math.min(v, 1);
    if (y > 0){ v = Math.min(v, D[i - W] + 1); if (x > 0) v = Math.min(v, D[i - W - 1] + R2); if (x < W - 1) v = Math.min(v, D[i - W + 1] + R2); } else v = Math.min(v, 1);
    D[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--){
    const i = y * W + x; if (!D[i]) continue; let v = D[i];
    if (x < W - 1) v = Math.min(v, D[i + 1] + 1); else v = Math.min(v, 1);
    if (y < H - 1){ v = Math.min(v, D[i + W] + 1); if (x < W - 1) v = Math.min(v, D[i + W + 1] + R2); if (x > 0) v = Math.min(v, D[i + W - 1] + R2); } else v = Math.min(v, 1);
    D[i] = v;
  }
  return D;
}
const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export function skeletonOf(ch: string, font: string, w: number, h: number): Skeleton {
  const key = `${ch}|${font}|${Math.round(w)}|${Math.round(h)}`;
  const hit = cache.get(key); if (hit) return hit;
  const scale = Math.min(1.5, 150 / Math.max(1, h)), pad = Math.ceil(h * 0.45);
  const W = Math.max(8, Math.ceil((w + pad * 2) * scale)), H = Math.max(8, Math.ceil((h + pad * 2) * scale));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.scale(scale, scale); x.font = font; x.textBaseline = 'alphabetic'; x.fillStyle = '#000';
  x.fillText(ch, pad, pad + baselineIn(x, ch, h));
  const data = x.getImageData(0, 0, W, H).data, bin = new Uint8Array(W * H);
  let area = 0; for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] > 100){ bin[i] = 1; area++; }
  const dist = insideDistance(bin, W, H);
  thin(bin, W, H);
  let skel = 0; for (let i = 0; i < W * H; i++) skel += bin[i];
  const avg = skel ? area / skel : 2;   // average stroke width (raster px)
  const on = (px: number, py: number) => px >= 0 && py >= 0 && px < W && py < H && bin[py * W + px] === 1;
  const seen = new Uint8Array(W * H);
  const raw: { pts: Point[]; joinedStart: boolean; joinedEnd: boolean }[] = [];
  let last: Point = { x: 0, y: 0 };
  const freeDeg = (px: number, py: number) => { let n = 0; for (const [dx, dy] of N8) if (on(px + dx, py + dy) && !seen[(py + dy) * W + px + dx]) n++; return n; };
  const touchesSeen = (px: number, py: number) => N8.some(([dx, dy]) => on(px + dx, py + dy) && seen[(py + dy) * W + px + dx]);
  const pickStart = () => {
    let best = -1, bd = Infinity, bestEnd = -1, be = Infinity;
    for (let i = 0; i < W * H; i++){
      if (!bin[i] || seen[i]) continue;
      const px = i % W, py = (i / W) | 0, deg = freeDeg(px, py);
      const d = raw.length ? Math.hypot(px - last.x, py - last.y) : px * 0.7 + py * 0.55;
      if (deg <= 1 && d < be){ be = d; bestEnd = i; }
      if (d < bd){ bd = d; best = i; }
    }
    return bestEnd >= 0 ? bestEnd : best;
  };
  for (let guard = 0; guard < 60; guard++){
    const s = pickStart(); if (s < 0) break;
    let px = s % W, py = (s / W) | 0, dir = -1;
    const joinedStart = touchesSeen(px, py);
    const pts: Point[] = [{ x: px, y: py }]; seen[s] = 1;
    let joinedEnd = false;
    for (;;){
      const opts = N8.map(([dx, dy], k) => ({ k, x: px + dx, y: py + dy })).filter(o => on(o.x, o.y) && !seen[o.y * W + o.x]);
      if (!opts.length){
        const prev = pts[pts.length - 2];
        const j = N8.map(([dx, dy]) => ({ x: px + dx, y: py + dy })).find(o => on(o.x, o.y) && seen[o.y * W + o.x] && pts.length > 2 && !(prev && o.x === prev.x && o.y === prev.y));
        if (j){ pts.push(j); joinedEnd = true; }
        break;
      }
      // keep going the same way where possible (a hand doesn't zig-zag); straight neighbours before diagonals
      const turn = (k: number) => dir < 0 ? 0 : Math.min((k - dir + 8) % 8, (dir - k + 8) % 8);
      opts.sort((a, b) => turn(a.k) - turn(b.k) || (a.k % 2) - (b.k % 2));
      const o = opts[0]; dir = o.k; px = o.x; py = o.y; seen[py * W + px] = 1; pts.push({ x: px, y: py });
    }
    last = pts[pts.length - 1];
    raw.push({ pts, joinedStart, joinedEnd });
  }
  // spurs: short branches hanging off another stroke are thinning noise; an isolated short piece is a dot: keep it
  const spur = avg * 1.25;
  const kept = raw.filter(s => s.pts.length > spur || !(s.joinedStart || s.joinedEnd) || raw.length === 1);
  const strokes: Stroke[] = [];
  let prevEnd: Point | null = null;
  // dots last (an i is dotted after its stem), everything else in the traced order
  const ordered = [...kept.filter(s => s.pts.length > spur || s.joinedStart || s.joinedEnd), ...kept.filter(s => !(s.pts.length > spur || s.joinedStart || s.joinedEnd))];
  for (const s of ordered){
    let p = s.pts;
    // write top/left → bottom/right, unless this stroke carries on from where the pen just was
    const a = p[0], b = p[p.length - 1];
    const cont = prevEnd && Math.hypot(a.x - prevEnd.x, a.y - prevEnd.y) < avg * 2.5;
    const contRev = prevEnd && Math.hypot(b.x - prevEnd.x, b.y - prevEnd.y) < avg * 2.5;
    if ((!cont && contRev) || (!cont && !contRev && (b.x * 0.8 + b.y) < (a.x * 0.8 + a.y) - avg)) p = [...p].reverse();
    prevEnd = p[p.length - 1];
    // smooth the pixel steps away, then into letter pixels (CSS) with the local half-thickness at every point
    const sm = p.map((q, i) => {
      const k0 = p[Math.max(0, i - 2)], k1 = p[Math.max(0, i - 1)], k3 = p[Math.min(p.length - 1, i + 1)], k4 = p[Math.min(p.length - 1, i + 2)];
      return { x: ((k0.x + k1.x * 2 + q.x * 3 + k3.x * 2 + k4.x) / 9) / scale - pad, y: ((k0.y + k1.y * 2 + q.y * 3 + k3.y * 2 + k4.y) / 9) / scale - pad };
    });
    const r = p.map(q => (Math.max(1, dist[q.y * W + q.x]) * 1.18 + 1.2) / scale);
    const cum = [0]; for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + Math.hypot(sm[i].x - sm[i - 1].x, sm[i].y - sm[i - 1].y));
    const len = Math.max(0.5, cum[cum.length - 1]);
    // time along the stroke: slower where it bends (speed ∝ curvature^-1/3, the power law of hand motion)
    const cost = [0];
    for (let i = 1; i < sm.length; i++){
      const i0 = Math.max(0, i - 3), i1 = Math.min(sm.length - 1, i + 3);
      const a1 = Math.atan2(sm[i].y - sm[i0].y, sm[i].x - sm[i0].x), a2 = Math.atan2(sm[i1].y - sm[i].y, sm[i1].x - sm[i].x);
      let th = Math.abs(a2 - a1); if (th > Math.PI) th = Math.PI * 2 - th;
      const span = Math.max(1e-3, cum[i1] - cum[i0]), curv = th / span;
      const v = Math.min(1.25, Math.max(0.35, Math.pow(1 + curv * h * 0.6, -1 / 3)));
      cost.push(cost[i - 1] + (cum[i] - cum[i - 1]) / v);
    }
    const T = cost[cost.length - 1] || 1;
    strokes.push({ pts: sm, r, cum, tcum: cost.map(c => c / T), len, dot: !(s.pts.length > spur || s.joinedStart || s.joinedEnd) });
  }
  const res: Skeleton = { strokes: strokes.length ? strokes : [{ pts: [{ x: w / 2, y: h / 2 }], r: [h / 4], cum: [0], tcum: [0], len: 0.5, dot: true }], pen: avg / scale, pad, scale };
  if (cache.size > 800) cache.clear();
  cache.set(key, res);
  return res;
}

// ---------------------------------------------------------------- motion
const jerk = (u: number) => { const t = Math.max(0, Math.min(1, u)); return t * t * t * (10 - 15 * t + 6 * t * t); };
function pointAt(s: Stroke, d: number): Point {
  if (d <= 0) return s.pts[0];
  let i = 1; while (i < s.cum.length && s.cum[i] < d) i++;
  if (i >= s.pts.length) return s.pts[s.pts.length - 1];
  const a = s.pts[i - 1], b = s.pts[i], k = (d - s.cum[i - 1]) / Math.max(1e-6, s.cum[i] - s.cum[i - 1]);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}
/** length written along one stroke after a share `u` of its time: eased at both ends, slowed through curves */
function lengthAt(s: Stroke, u: number){
  const e = jerk(u) * 0.55 + Math.max(0, Math.min(1, u)) * 0.45;
  let i = 1; while (i < s.tcum.length && s.tcum[i] < e) i++;
  if (i >= s.tcum.length) return s.len;
  const k = (e - s.tcum[i - 1]) / Math.max(1e-6, s.tcum[i] - s.tcum[i - 1]);
  return s.cum[i - 1] + (s.cum[i] - s.cum[i - 1]) * k;
}
/** how much of a letter is written at a time, as one number along its strokes laid end to end */
function writtenAt(p: Plan, time: number){
  if (time <= p.t0) return 0; if (time >= p.t1) return p.total;
  let base = 0;
  for (let i = 0; i < p.sk.strokes.length; i++){
    const [s0, s1] = p.spans[i], s = p.sk.strokes[i];
    if (time < s0) return base;
    if (time < s1) return base + lengthAt(s, (time - s0) / (s1 - s0));
    base += s.len;
  }
  return p.total;
}
/** ink the mask from length `from` to `to`, each piece as wide as the letter is there */
function inkMask(p: Plan, from: number, to: number){
  const x = p.mask.getContext('2d')!;
  x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#000'; x.fillStyle = '#000';
  let base = 0; const P = p.sk.pad;
  for (const s of p.sk.strokes){
    const a = Math.max(0, from - base), b = Math.min(s.len, to - base);
    if (b > a){
      if (s.pts.length === 1){ x.beginPath(); x.arc(s.pts[0].x + P, s.pts[0].y + P, s.r[0] + p.extra, 0, Math.PI * 2); x.fill(); }
      let prev = pointAt(s, a), prevR = s.r[0];
      for (let i = 1; i < s.cum.length && s.cum[i - 1] < b; i++){
        if (s.cum[i] <= a) { prevR = s.r[i]; continue; }
        const q = s.cum[i] > b ? pointAt(s, b) : s.pts[i];
        x.lineWidth = (Math.max(prevR, s.r[i]) + p.extra) * 2;   // a 3D letter's depth and shadow reach a little past its face
        x.beginPath(); x.moveTo(prev.x + P, prev.y + P); x.lineTo(q.x + P + 0.01, q.y + P); x.stroke();
        prev = q; prevR = s.r[i];
      }
    }
    base += s.len;
  }
}

// ---------------------------------------------------------------- the pen
const PEN_SVG = `<svg viewBox="-4 -12 108 24" width="108" height="24" aria-hidden="true"><defs>
<linearGradient id="fxNib" x1="0" y1="-5" x2="0" y2="5" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff2c4"/><stop offset=".45" stop-color="#d7a94a"/><stop offset="1" stop-color="#7a5414"/></linearGradient>
<linearGradient id="fxBody" x1="0" y1="-7" x2="0" y2="7" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5b5b66"/><stop offset=".3" stop-color="#1b1b22"/><stop offset="1" stop-color="#050507"/></linearGradient></defs>
<path d="M0 0 L13 -4.2 L22 -5 L22 5 L13 4.2 Z" fill="url(#fxNib)"/><path d="M1.5 0 L15 0" stroke="#3a2a0a" stroke-width=".7"/><circle cx="15.5" cy="0" r="1.1" fill="#3a2a0a"/>
<rect x="22" y="-6" width="15" height="12" rx="2" fill="url(#fxBody)"/><rect x="37" y="-6.6" width="4" height="13.2" fill="url(#fxNib)"/>
<rect x="41" y="-7" width="62" height="14" rx="6.5" fill="url(#fxBody)"/><rect x="46" y="-5.2" width="50" height="1.6" rx=".8" fill="#ffffff" opacity=".28"/></svg>`;

export const handwriting: Effect = {
  id: 'handwriting', name: 'Real handwriting', description: 'Written stroke by stroke with a real pen: it slows into curves, follows every thick and thin, and lifts between strokes.', duration: 3,
  params: [{ id: 'pen', name: 'Show the pen', type: 'toggle', value: false }],
  init(ctx){
    plans = [];
    const sr = ctx.stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    ink = document.createElement('canvas'); ink.className = 'fx-ink'; ink.setAttribute('aria-hidden', 'true');
    ink.width = Math.round(sr.width * dpr); ink.height = Math.round(sr.height * dpr);
    const caret = ctx.stage.querySelector('.fx-caret'); (caret?.parentElement || ctx.stage).insertBefore(ink, caret);
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
      const cw = c.rect.width + sk.pad * 2, ch = c.rect.height + sk.pad * 2;
      const img = document.createElement('canvas'); img.width = Math.ceil(cw * dpr); img.height = Math.ceil(ch * dpr);
      const x = img.getContext('2d')!; x.scale(dpr, dpr); x.font = font; x.textBaseline = 'alphabetic';
      const art = c.el.querySelector<HTMLCanvasElement>('canvas.fx-mat');
      if (art){
        // a 3D material letter: the very same picture the page shows
        const ap = Number(art.dataset.pad || 0); x.drawImage(art, sk.pad - ap, sk.pad - ap, c.rect.width + ap * 2, c.rect.height + ap * 2);
      } else {
        if (paint?.stops){
          const st = paint.stops, g = st.angle === 'h' ? x.createLinearGradient(bx0 - ox, 0, bx1 - ox, 0) : st.angle === 'v-up' ? x.createLinearGradient(0, by1 - oy, 0, by0 - oy) : x.createLinearGradient(0, by0 - oy, 0, by1 - oy);
          for (const [o, col] of st.stops) g.addColorStop(o, col); x.fillStyle = g;
        } else x.fillStyle = paint?.color || ctx.palette.text;
        const by = sk.pad + baselineIn(x, c.char, c.rect.height);
        if (paint?.outline){ x.strokeStyle = paint.outline; x.lineWidth = Math.max(1.5, parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '60') * 0.03); x.strokeText(c.char, sk.pad, by); }
        else x.fillText(c.char, sk.pad, by);
      }
      const mask = document.createElement('canvas'); mask.width = Math.ceil(cw); mask.height = Math.ceil(ch);
      plans.push({ c, sk, img, mask, ox, oy, t0: 0, t1: 0, spans: [], drawn: 0, total: sk.strokes.reduce((s, q) => s + q.len, 0), extra: art ? Number(art.dataset.extra || 0) : 0 });
    }
    ctx.penAt = (time: number) => penAt(time).p;
  },
  play(tl, ctx, params){
    // the ink writes itself either way; the fountain pen is shown only when asked for
    const r = ctx.rng, sp = Math.max(0.25, ctx.speed), pen = params.pen === true ? ctx.stage.querySelector<HTMLElement>('.fx-pen') : null;
    const px = plans.length ? plans[0].c.rect.height : 60, v = px * between(r, 3.1, 3.7) * sp;   // about three and a half letter-heights a second
    let t = 0.45;
    plans.forEach((p, i) => {
      p.t0 = t; p.spans = [];
      const tempo = between(r, 0.9, 1.12);   // each letter a little quicker or slower, like a real hand
      p.sk.strokes.forEach((s, k) => {
        if (k){ const prev = p.sk.strokes[k - 1], a = prev.pts[prev.pts.length - 1], b = s.pts[0];
          t += (0.05 + Math.min(0.16, Math.hypot(b.x - a.x, b.y - a.y) / (v * 1.6))) / sp; }   // a lift: longer for a longer move
        const d = Math.max((s.dot ? 0.07 : 0.1) / sp, (s.tcum.length ? s.len : 1) / v * (s.dot ? 0.6 : 1)) * tempo;
        p.spans.push([t, t + d]); t += d;
      });
      p.t1 = t;
      ctx.revealAt(i, p.t0 + (p.t1 - p.t0) * 0.6);
      const next = plans[i + 1]?.c;
      if (next) t += next.line !== p.c.line ? between(r, 0.38, 0.55) / sp : next.word !== p.c.word ? between(r, 0.2, 0.32) / sp : between(r, 0.03, 0.08) / sp;
    });
    const end = t;
    const els = ctx.chars.map(c => c.el);
    tl.set(els, { opacity: 0 }, 0);
    if (ink) tl.set(ink, { opacity: 1 }, 0);
    const scale = Math.max(0.45, px / 110);
    if (pen){ pen.classList.add('is-nib'); pen.innerHTML = PEN_SVG; }
    const proxy = { t: 0 };
    let lastTip: Point | null = null, sway = 0;
    const render = () => {
      if (!ink) return;
      const x = ink.getContext('2d')!, dpr = ink.width / Math.max(1, ctx.stage.clientWidth);
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, ink.width, ink.height);
      for (const p of plans){
        const w = writtenAt(p, proxy.t);
        if (w <= 0){ if (p.drawn){ p.mask.getContext('2d')!.clearRect(0, 0, p.mask.width, p.mask.height); p.drawn = 0; } continue; }
        if (w >= p.total){ x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(p.img, Math.round(p.ox * dpr), Math.round(p.oy * dpr)); continue; }
        if (w < p.drawn){ p.mask.getContext('2d')!.clearRect(0, 0, p.mask.width, p.mask.height); p.drawn = 0; }
        if (w > p.drawn){ inkMask(p, p.drawn, w); p.drawn = w; }
        tmp!.width = p.img.width; tmp!.height = p.img.height;
        const q = tmp!.getContext('2d')!; q.drawImage(p.img, 0, 0); q.globalCompositeOperation = 'destination-in'; q.drawImage(p.mask, 0, 0, p.img.width, p.img.height); q.globalCompositeOperation = 'source-over';
        x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(tmp!, Math.round(p.ox * dpr), Math.round(p.oy * dpr));
      }
      if (!pen) return;
      const { p: tip, lifted } = penAt(proxy.t);
      if (!tip || proxy.t >= end){ pen.style.opacity = '0'; lastTip = null; return; }
      // the pen leans like a right hand holds it, sways a little with the motion and rises when it lifts
      if (lastTip){ const dx = tip.x - lastTip.x, dy = tip.y - lastTip.y; if (Math.abs(dx) + Math.abs(dy) > 0.2) sway += (Math.max(-9, Math.min(9, dx * 0.9 - dy * 0.4)) - sway) * 0.2; }
      lastTip = tip;
      const lift = lifted ? 1 : 0;
      pen.style.opacity = '1';
      pen.style.transform = `translate(${tip.x.toFixed(1)}px, ${(tip.y - lift * 5 * scale).toFixed(1)}px) rotate(${(38 + sway).toFixed(1)}deg) scale(${(scale * (1 + lift * 0.04)).toFixed(3)})`;
      pen.style.filter = `drop-shadow(${(4 + lift * 7).toFixed(0)}px ${(6 + lift * 9).toFixed(0)}px ${(4 + lift * 5).toFixed(0)}px rgba(0,0,0,${(0.42 - lift * 0.14).toFixed(2)}))`;
    };
    tl.fromTo(proxy, { t: 0 }, { t: end, duration: end, ease: 'none', onUpdate: render, onStart: render }, 0);
    tl.set(els, { opacity: 1 }, end + 0.02);
    if (ink) tl.set(ink, { opacity: 0 }, end + 0.02);
    if (pen){ tl.set(pen, { opacity: 0 }, end + 0.05); tl.call(() => { proxy.t = end; }, [], end + 0.05); }
    return end;
  },
  reset(ctx){
    plans = []; ctx.penAt = undefined; ink?.remove(); ink = null;
    for (const c of ctx.chars){ c.el.style.opacity = ''; c.el.style.clipPath = ''; }
    const pen = ctx.stage.querySelector<HTMLElement>('.fx-pen'); if (pen){ pen.style.transform = ''; pen.style.filter = ''; pen.style.opacity = '0'; pen.classList.remove('is-nib'); pen.innerHTML = ''; }
  },
};

/** where the pen tip is at a time: on a stroke, or gliding through the air between two (lifted) */
function penAt(time: number): { p: Point | null; lifted: boolean } {
  let prevEnd: { p: Point; t: number } | null = null;
  for (const p of plans){
    for (let k = 0; k < p.sk.strokes.length; k++){
      const s = p.sk.strokes[k], [s0, s1] = p.spans[k] || [0, 0];
      const at = (q: Point) => ({ x: q.x + p.ox + p.sk.pad, y: q.y + p.oy + p.sk.pad });
      if (time < s0){
        if (!prevEnd) return { p: null, lifted: true };
        // in the air: glide from the last stroke's end to this stroke's start, on a gentle arc
        const u = jerk((time - prevEnd.t) / Math.max(1e-6, s0 - prevEnd.t)), a = prevEnd.p, b = at(s.pts[0]);
        return { p: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * Math.min(30, Math.hypot(b.x - a.x, b.y - a.y) * 0.18) }, lifted: true };
      }
      if (time <= s1) return { p: at(pointAt(s, lengthAt(s, (time - s0) / Math.max(1e-6, s1 - s0)))), lifted: false };
      prevEnd = { p: at(s.pts[s.pts.length - 1]), t: s1 };
    }
  }
  return { p: prevEnd ? prevEnd.p : null, lifted: true };
}
