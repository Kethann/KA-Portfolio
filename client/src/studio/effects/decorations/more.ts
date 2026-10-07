// The themed decorations. Each grows from the real letters (their outline, top or baseline), at the moment each
// letter appears (onReveal) or once the words are built (play). All are line art in the palette's two accents,
// its glow and its stroke colour, so they recolour with the palette and stay crisp in SVG / 4K exports.
import { between } from '../rng';
import type { CharInfo, EffectContext, Timeline } from '../types';
import type { Decoration } from './index';
import { baseOf, clear, drawOn, f, heartPath, layer, pickLetters, starPath, svgEl, textBox, topOf, unit } from './kit';

const S = (ctx: EffectContext) => Math.max(0.25, ctx.speed);
type Picked = EffectContext & { _pick?: Set<number>; _g?: SVGGElement; _last?: { x: number; y: number } | null };

/** a decoration that grows something from a share of the letters as they appear */
function perLetter(id: string, name: string, description: string, share: number, grow: (tl: Timeline, ctx: EffectContext, g: SVGGElement, c: CharInfo, at: number) => number): Decoration {
  return {
    id, name, description, duration: 2.5, params: [],
    init(ctx){ const p = ctx as Picked; p._g = layer(ctx, 'fx-d-' + id); p._pick = pickLetters(ctx, share); p._last = null; },
    play(){ return 0; },
    onReveal(tl, ctx, c, at){ const p = ctx as Picked; if (!p._g || !p._pick?.has(c.index)) return at; return grow(tl, ctx, p._g, c, at); },
    reset(ctx){ clear(ctx, 'fx-d-' + id); },
  };
}
/** a decoration drawn around the whole text once it is built */
function whole(id: string, name: string, description: string, build: (tl: Timeline, ctx: EffectContext, g: SVGGElement, start: number) => number, startShare = 0.35): Decoration & { _start?: number } {
  let reveals: number[] = [];
  return {
    id, name, description, duration: 2.5, params: [],
    init(ctx){ (ctx as Picked)._g = layer(ctx, 'fx-d-' + id); reveals = []; },
    onReveal(_tl, _ctx, _c, at){ reveals.push(at); return at; },
    play(tl, ctx){ const g = (ctx as Picked)._g; if (!g) return 0; const last = Math.max(0.4, ...reveals); return build(tl, ctx, g, last * startShare + 0.2); },
    reset(ctx){ clear(ctx, 'fx-d-' + id); reveals = []; },
  };
}

// ---------------------------------------------------------------- sparkle & light
const sparkles = perLetter('sparkles', 'Sparkles', 'Four-point stars pop and twinkle around the letters.', 0.45, (tl, ctx, g, c, at) => {
  const r = ctx.rng, u = unit(c), n = 1 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++){
    const o = c.anchors.outline[Math.floor(r() * c.anchors.outline.length)], a = Math.atan2(o.y - c.anchors.center.y, o.x - c.anchors.center.x), d = between(r, 8, 22) * u;
    const x = o.x + Math.cos(a) * d, y = o.y + Math.sin(a) * d, R = between(r, 5, 11) * u;
    const st = svgEl('path', { d: starPath(x, y, R, R * 0.28), fill: k ? ctx.palette.glow : ctx.palette.accent1 });
    g.appendChild(st);
    const t0 = at + k * 0.12 / S(ctx);
    tl.fromTo(st, { scale: 0, rotate: -45, svgOrigin: `${f(x)} ${f(y)}` }, { scale: 1, rotate: 0, svgOrigin: `${f(x)} ${f(y)}`, duration: 0.4 / S(ctx), ease: 'back.out(3)' }, t0);
    tl.to(st, { scale: 0.55, svgOrigin: `${f(x)} ${f(y)}`, duration: 0.5, yoyo: true, repeat: 3, ease: 'sine.inOut' }, t0 + 0.45 / S(ctx));
  }
  return at + 0.5 / S(ctx);
});

const constellation: Decoration = (() => {
  let pts: { x: number; y: number; w: number }[] = [];
  return {
    id: 'constellation', name: 'Constellation', description: 'Stars sit on the letters and lines join them into a star map.', duration: 3, params: [],
    init(ctx){ (ctx as Picked)._g = layer(ctx, 'fx-d-constellation'); pts = []; },
    play(){ return 0; },
    onReveal(tl, ctx, c, at){
      const g = (ctx as Picked)._g; if (!g || /\s/.test(c.char)) return at;
      const r = ctx.rng, o = c.anchors.outline[Math.floor(r() * c.anchors.outline.length)], u = unit(c), p = ctx.palette;
      const star = svgEl('circle', { cx: f(o.x), cy: f(o.y), r: f(between(r, 2, 3.6) * u), fill: p.glow });
      const halo = svgEl('circle', { cx: f(o.x), cy: f(o.y), r: f(9 * u), fill: p.glow, opacity: 0.18 });
      const prev = pts.filter(q => q.w === c.word).at(-1) || (r() < 0.4 ? pts.at(-1) : undefined);
      if (prev){ const ln = svgEl('path', { d: `M${f(prev.x)} ${f(prev.y)} L${f(o.x)} ${f(o.y)}`, stroke: p.accent2, 'stroke-width': f(1.1 * u), fill: 'none', opacity: 0.75 }); g.appendChild(ln); drawOn(tl, ln, at, 0.45 / S(ctx)); }
      g.append(halo, star);
      tl.fromTo([halo, star], { scale: 0, svgOrigin: `${f(o.x)} ${f(o.y)}` }, { scale: 1, svgOrigin: `${f(o.x)} ${f(o.y)}`, duration: 0.35, ease: 'back.out(3)' }, at);
      tl.to(halo, { opacity: 0.05, duration: 0.6, yoyo: true, repeat: 3, ease: 'sine.inOut' }, at + 0.4);
      pts.push({ x: o.x, y: o.y, w: c.word });
      return at + 0.5 / S(ctx);
    },
    reset(ctx){ clear(ctx, 'fx-d-constellation'); pts = []; },
  };
})();

const flare = whole('flare', 'Lens flare', 'A cinematic flare sweeps across the title.', (tl, ctx, g, at) => {
  const b = textBox(ctx), p = ctx.palette, id = 'fxflare' + Math.floor(ctx.rng() * 1e6);
  const defs = svgEl('defs', {}); const rg = svgEl('radialGradient', { id }); rg.append(svgEl('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': 0.95 }), svgEl('stop', { offset: '0.3', 'stop-color': p.glow, 'stop-opacity': 0.5 }), svgEl('stop', { offset: '1', 'stop-color': p.glow, 'stop-opacity': 0 }));
  defs.appendChild(rg); g.appendChild(defs);
  const R = Math.max(40, b.h * 0.9), core = svgEl('circle', { cx: 0, cy: f(b.cy), r: f(R), fill: `url(#${id})` });
  const streak = svgEl('rect', { x: f(-b.sw * 0.4), y: f(b.cy - 1.5), width: f(b.sw * 0.8), height: 3, fill: p.glow, opacity: 0.7, rx: 1.5 });
  const sg = svgEl('g', { opacity: 0 }); sg.append(streak, core); g.appendChild(sg);
  const ghosts = [0.3, 0.55, 0.8].map((k, i) => { const c = svgEl('circle', { cx: 0, cy: f(b.cy), r: f(R * (0.15 + i * 0.1)), fill: i % 2 ? p.accent1 : p.accent2, opacity: 0.2 }); g.appendChild(c); return { c, k }; });
  const d = 1.6 / S(ctx);
  tl.set(sg, { opacity: 1 }, at);
  tl.fromTo(sg, { x: b.x - R }, { x: b.x + b.w + R, duration: d, ease: 'power2.inOut' }, at);
  for (const { c, k } of ghosts) tl.fromTo(c, { x: b.x + b.w + R, opacity: 0.25 }, { x: b.x - R + (b.w + 2 * R) * k * 0.3, opacity: 0, duration: d, ease: 'power2.inOut' }, at);
  tl.to(sg, { opacity: 0, duration: 0.3 }, at + d - 0.3);
  return at + d;
}, 0.6);

// ---------------------------------------------------------------- elements
const flames = perLetter('flames', 'Flames & embers', 'Flames lick up from the letters and embers float away.', 0.6, (tl, ctx, g, c, at) => {
  const r = ctx.rng, p = ctx.palette, u = unit(c), top = topOf(c), H = between(r, 22, 40) * u, W = between(r, 9, 15) * u;
  const fl = (h: number, w: number, col: string, op: number) => svgEl('path', { d: `M${f(top.x)} ${f(top.y + 2)} C${f(top.x - w)} ${f(top.y - h * 0.25)} ${f(top.x - w * 0.3)} ${f(top.y - h * 0.6)} ${f(top.x + w * 0.1)} ${f(top.y - h)} C${f(top.x + w * 0.2)} ${f(top.y - h * 0.55)} ${f(top.x + w)} ${f(top.y - h * 0.35)} ${f(top.x)} ${f(top.y + 2)}Z`, fill: col, opacity: op });
  const outer = fl(H, W, p.accent1, 0.85), inner = fl(H * 0.6, W * 0.55, p.glow, 0.95);
  g.append(outer, inner);
  const o = `${f(top.x)} ${f(top.y)}`;
  tl.fromTo([outer, inner], { scaleY: 0, scaleX: 0.4, svgOrigin: o }, { scaleY: 1, scaleX: 1, svgOrigin: o, duration: 0.35 / S(ctx), ease: 'power2.out' }, at);
  tl.to(outer, { scaleY: 0.82, scaleX: 1.1, skewX: 6, svgOrigin: o, duration: 0.18, yoyo: true, repeat: 9, ease: 'sine.inOut' }, at + 0.35 / S(ctx));
  tl.to(inner, { scaleY: 1.15, skewX: -5, svgOrigin: o, duration: 0.14, yoyo: true, repeat: 11, ease: 'sine.inOut' }, at + 0.35 / S(ctx));
  for (let k = 0; k < 3; k++){
    const e = svgEl('circle', { cx: f(top.x), cy: f(top.y - H * 0.6), r: f(between(r, 1, 2.2) * u), fill: p.glow }); g.appendChild(e);
    tl.fromTo(e, { x: 0, y: 0, opacity: 0 }, { x: (r() - 0.5) * 40 * u, y: -between(r, 50, 110) * u, opacity: 0, keyframes: { opacity: [0, 1, 0] }, duration: between(r, 1.2, 2), ease: 'power1.out' }, at + 0.3 + k * 0.35);
  }
  return at + 0.5 / S(ctx);
});

const frost = perLetter('frost', 'Frost crystals', 'Ice crystals branch out from the letters.', 0.5, (tl, ctx, g, c, at) => {
  const r = ctx.rng, p = ctx.palette, u = unit(c), o = c.anchors.outline[Math.floor(r() * c.anchors.outline.length)];
  const L = between(r, 12, 22) * u; let d = '';
  for (let k = 0; k < 6; k++){
    const a = (k / 6) * Math.PI * 2 + r() * 0.2, ex = o.x + Math.cos(a) * L, ey = o.y + Math.sin(a) * L;
    d += `M${f(o.x)} ${f(o.y)} L${f(ex)} ${f(ey)} `;
    for (const s of [0.45, 0.72]){ const bx = o.x + Math.cos(a) * L * s, by = o.y + Math.sin(a) * L * s, bl = L * (0.4 - s * 0.25);
      for (const sg of [-1, 1]){ const ba = a + sg * 0.75; d += `M${f(bx)} ${f(by)} L${f(bx + Math.cos(ba) * bl)} ${f(by + Math.sin(ba) * bl)} `; } }
  }
  const cr = svgEl('path', { d, stroke: p.glow, 'stroke-width': f(1.2 * u), 'stroke-linecap': 'round', fill: 'none', opacity: 0.95 });
  const sp = svgEl('circle', { cx: f(o.x), cy: f(o.y), r: f(2 * u), fill: '#ffffff' });
  g.append(cr, sp);
  tl.fromTo(cr, { scale: 0, rotate: -30, opacity: 0, svgOrigin: `${f(o.x)} ${f(o.y)}` }, { scale: 1, rotate: 0, opacity: 0.95, svgOrigin: `${f(o.x)} ${f(o.y)}`, duration: 0.7 / S(ctx), ease: 'expo.out' }, at);
  tl.fromTo(sp, { opacity: 0 }, { opacity: 1, duration: 0.2, yoyo: true, repeat: 3 }, at + 0.3);
  return at + 0.7 / S(ctx);
});

const ripples = perLetter('ripples', 'Rain ripples', 'Raindrops land under the letters and ripple outward.', 0.55, (tl, ctx, g, c, at) => {
  const r = ctx.rng, p = ctx.palette, u = unit(c), b = baseOf(c), y = b.y + between(r, 8, 18) * u;
  for (let k = 0; k < 3; k++){
    const e = svgEl('ellipse', { cx: f(b.x), cy: f(y), rx: f(4 * u), ry: f(1.4 * u), fill: 'none', stroke: k ? p.accent2 : p.glow, 'stroke-width': f(1.2 * u) }); g.appendChild(e);
    tl.fromTo(e, { scale: 0.2, opacity: 0.9, svgOrigin: `${f(b.x)} ${f(y)}` }, { scale: 4 + k * 1.5, opacity: 0, svgOrigin: `${f(b.x)} ${f(y)}`, duration: 1.4 / S(ctx), ease: 'power2.out' }, at + k * 0.22);
  }
  const drop = svgEl('path', { d: `M${f(c.anchors.center.x)} ${f(c.rect.height * -0.2 + topOf(c).y)} q ${f(-2.5 * u)} ${f(6 * u)} 0 ${f(8 * u)} q ${f(2.5 * u)} ${f(-2 * u)} 0 ${f(-8 * u)}Z`, fill: p.glow, opacity: 0.85 }); g.appendChild(drop);
  tl.fromTo(drop, { y: 0, opacity: 0 }, { y: c.rect.height * 0.9, keyframes: { opacity: [0, 1, 1, 0] }, duration: 0.9 / S(ctx), ease: 'power2.in' }, at);
  return at + 0.6 / S(ctx);
});

const lightning = whole('lightning', 'Lightning', 'Bolts crack between the letters.', (tl, ctx, g, at) => {
  const p = ctx.palette, r = ctx.rng, cs = ctx.chars.filter(c => !/\s/.test(c.char)); if (cs.length < 2) return at;
  const n = 2 + Math.round(ctx.density * 3);
  for (let k = 0; k < n; k++){
    const a = cs[Math.floor(r() * cs.length)], b = cs[Math.floor(r() * cs.length)]; if (a === b) continue;
    const A = topOf(a), B = topOf(b); let d = `M${f(A.x)} ${f(A.y)}`; const segs = 7;
    for (let i = 1; i < segs; i++){ const t = i / segs; d += ` L${f(A.x + (B.x - A.x) * t + (r() - 0.5) * 26)} ${f(A.y + (B.y - A.y) * t - Math.sin(t * Math.PI) * 40 + (r() - 0.5) * 18)}`; }
    d += ` L${f(B.x)} ${f(B.y)}`;
    const glow = svgEl('path', { d, stroke: p.accent2, 'stroke-width': 6, fill: 'none', opacity: 0, 'stroke-linejoin': 'round' });
    const core = svgEl('path', { d, stroke: '#ffffff', 'stroke-width': 1.6, fill: 'none', opacity: 0, 'stroke-linejoin': 'round' });
    g.append(glow, core);
    const t0 = at + k * 0.45 / S(ctx);
    tl.to([glow, core], { keyframes: { opacity: [0, 1, 0.2, 1, 0] }, duration: 0.45, ease: 'none' }, t0);
    tl.set(glow, { opacity: 0.35 }, t0 + 0.45).to(glow, { opacity: 0, duration: 0.8 }, t0 + 0.5);
  }
  return at + n * 0.45 / S(ctx) + 0.5;
}, 0.5);

const drips = perLetter('drips', 'Ink drips', 'Ink runs down from the letters and drops fall.', 0.5, (tl, ctx, g, c, at) => {
  const r = ctx.rng, p = ctx.palette, u = unit(c), b = c.anchors.base[Math.floor(r() * Math.max(1, c.anchors.base.length))] || baseOf(c), L = between(r, 14, 46) * u, w = between(r, 2.2, 4) * u;
  const run = svgEl('path', { d: `M${f(b.x - w / 2)} ${f(b.y - 2)} L${f(b.x - w / 2)} ${f(b.y + L)} a ${f(w / 2)} ${f(w / 2)} 0 0 0 ${f(w)} 0 L${f(b.x + w / 2)} ${f(b.y - 2)}Z`, fill: p.accent1 });
  const drop = svgEl('circle', { cx: f(b.x), cy: f(b.y + L + w), r: f(w * 0.75), fill: p.accent1 });
  g.append(run, drop);
  tl.fromTo(run, { scaleY: 0, svgOrigin: `${f(b.x)} ${f(b.y)}` }, { scaleY: 1, svgOrigin: `${f(b.x)} ${f(b.y)}`, duration: 1.1 / S(ctx), ease: 'power1.in' }, at + 0.1);
  tl.fromTo(drop, { opacity: 0, y: 0 }, { opacity: 1, duration: 0.1 }, at + 1.1 / S(ctx));
  tl.to(drop, { y: between(r, 60, 140) * u, opacity: 0, duration: 0.7, ease: 'power2.in' }, at + 1.3 / S(ctx));
  return at + 1.3 / S(ctx);
});

const roots = perLetter('roots', 'Roots', 'Roots grow down from the letters and branch into the earth.', 0.55, (tl, ctx, g, c, at) => {
  const r = ctx.rng, p = ctx.palette, u = unit(c), b = baseOf(c);
  const branch = (x: number, y: number, a: number, len: number, w: number, t: number, depth: number) => {
    let d = `M${f(x)} ${f(y)}`, cx = x, cy = y; const n = 5;
    for (let i = 0; i < n; i++){ a += (r() - 0.5) * 0.6; cx += Math.cos(a) * len / n; cy += Math.sin(a) * len / n; d += ` L${f(cx)} ${f(cy)}`; }
    const pth = svgEl('path', { d, stroke: depth ? p.accent2 : p.accent1, 'stroke-width': f(w), fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.9 });
    g.appendChild(pth); const end = drawOn(tl, pth, t, (0.6 + len / 140) / S(ctx), 'power1.out');
    if (depth < 2) for (let k = 0; k < 2; k++) branch(x + (cx - x) * (0.4 + k * 0.3), y + (cy - y) * (0.4 + k * 0.3), a + (k ? 0.7 : -0.7), len * 0.5, w * 0.6, t + 0.25 / S(ctx), depth + 1);
    return end;
  };
  branch(b.x, b.y, Math.PI / 2 + (r() - 0.5) * 0.5, between(r, 30, 60) * u, 2.4 * u, at, 0);
  return at + 1.2 / S(ctx);
});

// ---------------------------------------------------------------- nature
const butterflies = whole('butterflies', 'Butterflies', 'Butterflies flutter in and land on the letters.', (tl, ctx, g, at) => {
  const r = ctx.rng, p = ctx.palette, b = textBox(ctx), cs = ctx.chars.filter(c => !/\s/.test(c.char)), n = Math.min(cs.length, 2 + Math.round(ctx.density * 4));
  for (let k = 0; k < n; k++){
    const c = cs[Math.floor((k + 0.5) * cs.length / n)], land = topOf(c), u = unit(c) * 1.1, col = k % 2 ? p.accent1 : p.accent2;
    const bf = svgEl('g', {}); const wingL = svgEl('path', { d: `M0 0 C${f(-14 * u)} ${f(-16 * u)} ${f(-20 * u)} ${f(2 * u)} 0 ${f(4 * u)} C${f(-12 * u)} ${f(6 * u)} ${f(-8 * u)} ${f(16 * u)} 0 ${f(4 * u)}Z`, fill: col, stroke: p.stroke, 'stroke-width': 0.8 });
    const wingR = svgEl('path', { d: `M0 0 C${f(14 * u)} ${f(-16 * u)} ${f(20 * u)} ${f(2 * u)} 0 ${f(4 * u)} C${f(12 * u)} ${f(6 * u)} ${f(8 * u)} ${f(16 * u)} 0 ${f(4 * u)}Z`, fill: col, stroke: p.stroke, 'stroke-width': 0.8 });
    const body = svgEl('ellipse', { cx: 0, cy: f(3 * u), rx: f(1.4 * u), ry: f(6 * u), fill: p.stroke });
    bf.append(wingL, wingR, body); g.appendChild(bf);
    const sx = r() < 0.5 ? -60 : b.sw + 60, sy = between(r, 0, b.sh), t0 = at + k * 0.3 / S(ctx), d = between(r, 1.6, 2.4) / S(ctx);
    const mid = { x: (sx + land.x) / 2 + (r() - 0.5) * 200, y: Math.min(sy, land.y) - between(r, 40, 140) };
    tl.set(bf, { x: sx, y: sy, opacity: 1 }, 0);
    tl.to(bf, { keyframes: [{ x: mid.x, y: mid.y, duration: d * 0.55, ease: 'sine.inOut' }, { x: land.x, y: land.y - 4, duration: d * 0.45, ease: 'sine.out' }] }, t0);
    tl.fromTo([wingL, wingR], { scaleX: 1 }, { scaleX: 0.15, duration: 0.09, yoyo: true, repeat: Math.round(d / 0.09), ease: 'sine.inOut', transformOrigin: '50% 50%', svgOrigin: '0 0' }, t0);
    tl.to([wingL, wingR], { scaleX: 0.6, svgOrigin: '0 0', duration: 0.6, yoyo: true, repeat: 3, ease: 'sine.inOut' }, t0 + d + 0.1);
  }
  return at + n * 0.3 / S(ctx) + 2.4 / S(ctx);
}, 0.25);

const petals = perLetter('petals', 'Falling petals', 'Blossom petals drift down from the letters.', 0.55, (tl, ctx, g, c, at) => {
  const r = ctx.rng, p = ctx.palette, u = unit(c), o = topOf(c);
  for (let k = 0; k < 2; k++){
    const e = svgEl('ellipse', { cx: f(o.x), cy: f(o.y), rx: f(5 * u), ry: f(2.8 * u), fill: k ? p.glow : p.accent1, opacity: 0.9 }); g.appendChild(e);
    tl.fromTo(e, { x: 0, y: 0, rotate: 0, opacity: 0, svgOrigin: `${f(o.x)} ${f(o.y)}` }, { x: between(r, 20, 80) * u * (r() < 0.5 ? -1 : 1), y: between(r, 80, 180) * u, rotate: between(r, 180, 540), keyframes: { opacity: [0, 0.95, 0.95, 0] }, svgOrigin: `${f(o.x)} ${f(o.y)}`, duration: between(r, 2, 3) / S(ctx), ease: 'sine.inOut' }, at + k * 0.3);
  }
  return at + 0.6;
});

const laurel = whole('laurel', 'Laurel wreath', 'Laurel branches grow around the title, with a classical key line.', (tl, ctx, g, at) => {
  const b = textBox(ctx), p = ctx.palette, r = ctx.rng, R = Math.max(b.w, b.h * 2) * 0.62, cx = b.cx, cy = b.cy + b.h * 0.05;
  for (const side of [-1, 1]){
    const pts: { x: number; y: number; a: number }[] = [];
    for (let i = 0; i <= 12; i++){ const a = Math.PI / 2 + side * (0.35 + i * 0.16); pts.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R * 0.55, a }); }
    const stem = svgEl('path', { d: pts.map((q, i) => (i ? 'L' : 'M') + f(q.x) + ' ' + f(q.y)).join(' '), stroke: p.accent2, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' });
    g.appendChild(stem); drawOn(tl, stem, at, 1.2 / S(ctx), 'power1.out');
    pts.slice(1).forEach((q, i) => {
      for (const s of [-1, 1]){
        const la = Math.atan2(Math.sin(q.a) * 0.55, Math.cos(q.a)) + Math.PI / 2 * side + s * 0.6, L = 14 + r() * 6, x2 = q.x + Math.cos(la) * L, y2 = q.y + Math.sin(la) * L;
        const nx = -Math.sin(la) * L * 0.3, ny = Math.cos(la) * L * 0.3;
        const leaf = svgEl('path', { d: `M${f(q.x)} ${f(q.y)} Q${f((q.x + x2) / 2 + nx)} ${f((q.y + y2) / 2 + ny)} ${f(x2)} ${f(y2)} Q${f((q.x + x2) / 2 - nx)} ${f((q.y + y2) / 2 - ny)} ${f(q.x)} ${f(q.y)}Z`, fill: p.accent2, stroke: p.stroke, 'stroke-width': 0.6, opacity: 0.95 });
        g.appendChild(leaf);
        tl.fromTo(leaf, { scale: 0, svgOrigin: `${f(q.x)} ${f(q.y)}` }, { scale: 1, svgOrigin: `${f(q.x)} ${f(q.y)}`, duration: 0.35, ease: 'back.out(2)' }, at + (i / 12) * 1.2 / S(ctx));
      }
    });
  }
  // a Greek key line under the words
  const u = 6, y0 = b.y + b.h + 16, n = Math.max(2, Math.floor(b.w / (u * 4))), x0 = b.cx - n * u * 2; let d = '';
  for (let i = 0; i < n; i++){ const o = x0 + i * u * 4; d += `${i ? 'L' : 'M'}${f(o)} ${f(y0 + u * 2)} L${f(o)} ${f(y0)} L${f(o + u * 3)} ${f(y0)} L${f(o + u * 3)} ${f(y0 + u * 2)} L${f(o + u)} ${f(y0 + u * 2)} L${f(o + u)} ${f(y0 + u)} L${f(o + u * 2)} ${f(y0 + u)} `; }
  const key = svgEl('path', { d, stroke: p.accent1, 'stroke-width': 1.6, fill: 'none' }); g.appendChild(key);
  drawOn(tl, key, at + 0.4, 1.4 / S(ctx), 'none');
  return at + 1.9 / S(ctx);
}, 0.4);

// ---------------------------------------------------------------- science & tech
const ecg = whole('ecg', 'Heartbeat line', 'An ECG trace beats under the words, with a pulse.', (tl, ctx, g, at) => {
  const b = textBox(ctx), p = ctx.palette, y = b.y + b.h + Math.max(18, b.h * 0.25), x0 = Math.max(10, b.x - 40), x1 = Math.min(b.sw - 10, b.x + b.w + 40), amp = Math.max(18, b.h * 0.35);
  let d = `M${f(x0)} ${f(y)}`; const beats = 3, W = (x1 - x0) / beats;
  for (let k = 0; k < beats; k++){ const o = x0 + k * W; d += ` L${f(o + W * 0.35)} ${f(y)} L${f(o + W * 0.42)} ${f(y - amp * 0.2)} L${f(o + W * 0.48)} ${f(y + amp * 0.25)} L${f(o + W * 0.55)} ${f(y - amp)} L${f(o + W * 0.62)} ${f(y + amp * 0.45)} L${f(o + W * 0.7)} ${f(y)} L${f(o + W)} ${f(y)}`; }
  const glow = svgEl('path', { d, stroke: p.accent1, 'stroke-width': 6, fill: 'none', opacity: 0.25, 'stroke-linejoin': 'round' });
  const line = svgEl('path', { d, stroke: p.accent1, 'stroke-width': 2.2, fill: 'none', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const dot = svgEl('circle', { cx: 0, cy: 0, r: 4, fill: p.glow });
  g.append(glow, line, dot);
  const dur = 1.8 / S(ctx); drawOn(tl, glow, at, dur, 'none'); drawOn(tl, line, at, dur, 'none');
  const len = line.getTotalLength(), proxy = { k: 0 };
  tl.fromTo(proxy, { k: 0 }, { k: 1, duration: dur, ease: 'none', onUpdate: () => { const q = line.getPointAtLength(proxy.k * len); dot.setAttribute('cx', f(q.x)); dot.setAttribute('cy', f(q.y)); } }, at);
  tl.fromTo(dot, { opacity: 0 }, { opacity: 1, duration: 0.1 }, at);
  // a medical cross pulses beside the words
  const cxp = Math.min(b.sw - 24, b.x + b.w + 30), cyp = b.y + 6, k = Math.max(7, b.h * 0.12);
  const cross = svgEl('path', { d: `M${f(cxp - k / 3)} ${f(cyp - k)} h${f(k / 1.5)} v${f(k / 1.5)} h${f(k / 1.5)} v${f(k / 1.5)} h${f(-k / 1.5)} v${f(k / 1.5)} h${f(-k / 1.5)} v${f(-k / 1.5)} h${f(-k / 1.5)} v${f(-k / 1.5)} h${f(k / 1.5)}Z`, fill: p.accent2 });
  g.appendChild(cross);
  tl.fromTo(cross, { scale: 0, svgOrigin: `${f(cxp)} ${f(cyp)}` }, { scale: 1, svgOrigin: `${f(cxp)} ${f(cyp)}`, duration: 0.4, ease: 'back.out(3)' }, at + 0.2);
  tl.to(cross, { scale: 1.2, svgOrigin: `${f(cxp)} ${f(cyp)}`, duration: 0.18, yoyo: true, repeat: 5, ease: 'power1.inOut' }, at + 0.7);
  return at + dur + 0.2;
}, 0.3);

const hud = (() => {
  const base = whole('hud', 'Targeting HUD', 'Corner brackets lock on, a reticle tracks each letter.', (tl, ctx, g, at) => {
    const b = textBox(ctx), p = ctx.palette, pad = Math.max(16, b.h * 0.2), L = Math.max(16, b.h * 0.3);
    const x0 = b.x - pad, y0 = b.y - pad, x1 = b.x + b.w + pad, y1 = b.y + b.h + pad;
    const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
    corners.forEach(([x, y, sx, sy], i) => {
      const c = svgEl('path', { d: `M${f(x + sx * L)} ${f(y)} L${f(x)} ${f(y)} L${f(x)} ${f(y + sy * L)}`, stroke: p.accent2, 'stroke-width': 2.2, fill: 'none' }); g.appendChild(c);
      tl.fromTo(c, { x: -sx * 30, y: -sy * 30, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.5 / S(ctx), ease: 'expo.out' }, at + i * 0.05);
    });
    const label = svgEl('text', { x: f(x0), y: f(y0 - 8), fill: p.accent2, 'font-family': 'ui-monospace, monospace', 'font-size': 11, 'letter-spacing': 1.5 }); label.textContent = 'TARGET ACQUIRED · ' + Math.floor(ctx.rng() * 9000 + 1000);
    g.appendChild(label); tl.fromTo(label, { opacity: 0 }, { keyframes: { opacity: [0, 1, 0.2, 1] }, duration: 0.5 }, at + 0.3);
    const scan = svgEl('rect', { x: f(x0), y: f(y0), width: f(x1 - x0), height: 2, fill: p.accent2, opacity: 0.6 }); g.appendChild(scan);
    tl.fromTo(scan, { y: 0, opacity: 0.7 }, { y: y1 - y0, opacity: 0, duration: 1 / S(ctx), ease: 'power1.inOut' }, at + 0.4);
    return at + 1.4 / S(ctx);
  }, 0.85);
  let ret: SVGGElement | null = null;
  return { ...base, init(ctx: EffectContext, prm: Record<string, unknown>){ base.init(ctx, prm); ret = null; },
    onReveal(tl: Timeline, ctx: EffectContext, c: CharInfo, at: number){
      base.onReveal!(tl, ctx, c, at); if (/\s/.test(c.char)) return at;
      const g = (ctx as Picked)._g!, p = ctx.palette, k = Math.max(10, c.rect.height * 0.32);
      if (!ret){ ret = svgEl('g', { opacity: 0 }); ret.append(svgEl('circle', { cx: 0, cy: 0, r: f(k), stroke: p.accent1, 'stroke-width': 1.5, fill: 'none' }), svgEl('path', { d: `M${-k * 1.5} 0 H${-k * 0.5} M${k * 0.5} 0 H${k * 1.5} M0 ${-k * 1.5} V${-k * 0.5} M0 ${k * 0.5} V${k * 1.5}`, stroke: p.accent1, 'stroke-width': 1.5 })); g.appendChild(ret); tl.set(ret, { opacity: 0.9 }, at); }
      tl.to(ret, { x: c.anchors.center.x, y: c.anchors.center.y, duration: 0.08, ease: 'power2.out' }, at);
      return at;
    },
    reset(ctx: EffectContext){ base.reset(ctx); ret = null; } } as Decoration;
})();

const bones = perLetter('bones', 'Bones', 'Little bones tumble down and settle around the letters.', 0.4, (tl, ctx, g, c, at) => {
  const r = ctx.rng, p = ctx.palette, u = unit(c), b = baseOf(c), L = between(r, 18, 30) * u, w = 4 * u, y = b.y + between(r, 6, 22) * u, x = b.x + (r() - 0.5) * 30 * u, a = (r() - 0.5) * 70;
  const bone = svgEl('g', {});
  bone.append(svgEl('rect', { x: f(-L / 2), y: f(-w / 2), width: f(L), height: f(w), rx: f(w / 2), fill: p.text }));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) bone.appendChild(svgEl('circle', { cx: f(sx * L / 2), cy: f(sy * w * 0.55), r: f(w * 0.7), fill: p.text }));
  g.appendChild(bone);
  tl.fromTo(bone, { x, y: y - 160 * u, rotate: a - 200, opacity: 0 }, { x, y, rotate: a, opacity: 0.9, duration: 0.7 / S(ctx), ease: 'bounce.out' }, at);
  return at + 0.7 / S(ctx);
});

// ---------------------------------------------------------------- celebration & play
const confetti = whole('confetti', 'Confetti burst', 'A burst of confetti once the words land.', (tl, ctx, g, at) => {
  const b = textBox(ctx), p = ctx.palette, r = ctx.rng, cols = [p.accent1, p.accent2, p.glow, p.text], n = Math.round(30 + ctx.density * 50);
  for (let i = 0; i < n; i++){
    const w = between(r, 4, 9), h = between(r, 6, 14), e = r() < 0.3 ? svgEl('circle', { cx: 0, cy: 0, r: f(w / 2), fill: cols[i % 4] }) : svgEl('rect', { x: f(-w / 2), y: f(-h / 2), width: f(w), height: f(h), fill: cols[i % 4], rx: 1 });
    g.appendChild(e);
    const a = -Math.PI / 2 + (r() - 0.5) * 2.4, v = between(r, 120, 320);
    tl.fromTo(e, { x: b.cx, y: b.cy, rotate: 0, opacity: 1 }, { keyframes: [{ x: b.cx + Math.cos(a) * v, y: b.cy + Math.sin(a) * v, rotate: between(r, 180, 540), duration: 0.6, ease: 'power3.out' }, { y: `+=${between(r, 140, 320)}`, x: `+=${(r() - 0.5) * 80}`, rotate: '+=360', opacity: 0, duration: between(r, 1.2, 2), ease: 'power1.in' }] }, at + r() * 0.1);
  }
  return at + 1.6;
}, 1);

const hearts = perLetter('hearts', 'Floating hearts', 'Hearts rise from the letters and fade like a sigh.', 0.5, (tl, ctx, g, c, at) => {
  const r = ctx.rng, p = ctx.palette, u = unit(c), o = topOf(c), k = between(r, 6, 11) * u;
  const h = svgEl('path', { d: heartPath(o.x, o.y, k), fill: r() < 0.5 ? p.accent1 : p.glow }); g.appendChild(h);
  tl.fromTo(h, { scale: 0, y: 0, opacity: 1, svgOrigin: `${f(o.x)} ${f(o.y)}` }, { scale: 1, svgOrigin: `${f(o.x)} ${f(o.y)}`, duration: 0.35, ease: 'back.out(3)' }, at);
  tl.to(h, { y: -between(r, 50, 100) * u, x: (r() - 0.5) * 30, opacity: 0, duration: 1.6 / S(ctx), ease: 'sine.in' }, at + 0.6);
  return at + 0.4;
});

const swash = whole('swash', 'Calligraphy swash', 'A flowing flourish is penned under the words.', (tl, ctx, g, at) => {
  const b = textBox(ctx), p = ctx.palette, y = b.y + b.h + Math.max(10, b.h * 0.12), x0 = b.x + b.w * 0.05, x1 = b.x + b.w * 0.95, h = Math.max(14, b.h * 0.22);
  const d = `M${f(x0)} ${f(y)} C${f(x0 + b.w * 0.25)} ${f(y + h)} ${f(x0 + b.w * 0.45)} ${f(y - h * 0.4)} ${f(b.cx)} ${f(y + h * 0.2)} C${f(b.cx + b.w * 0.12)} ${f(y + h * 0.6)} ${f(b.cx + b.w * 0.05)} ${f(y + h * 1.3)} ${f(b.cx - b.w * 0.03)} ${f(y + h * 0.8)} C${f(b.cx - b.w * 0.08)} ${f(y + h * 0.3)} ${f(b.cx + b.w * 0.2)} ${f(y - h * 0.2)} ${f(x1)} ${f(y + h * 0.1)}`;
  const s1 = svgEl('path', { d, stroke: p.accent1, 'stroke-width': Math.max(1.6, b.h * 0.03), fill: 'none', 'stroke-linecap': 'round' }); g.appendChild(s1);
  drawOn(tl, s1, at, 1.4 / S(ctx), 'power1.inOut');
  for (const x of [x0, x1]){ const dd = svgEl('path', { d: starPath(x, y, 5, 1.6), fill: p.accent2 }); g.appendChild(dd); tl.fromTo(dd, { scale: 0, svgOrigin: `${f(x)} ${f(y)}` }, { scale: 1, svgOrigin: `${f(x)} ${f(y)}`, duration: 0.4, ease: 'back.out(3)' }, at + 1.3 / S(ctx)); }
  return at + 1.7 / S(ctx);
}, 0.85);

const doodles = whole('doodles', 'Doodles', 'Hand-drawn circles, arrows, stars and hearts scribbled around.', (tl, ctx, g, at) => {
  const b = textBox(ctx), p = ctx.palette, r = ctx.rng, wobble = () => (r() - 0.5) * 6;
  // a loose double loop around the words
  let d = ''; const rx = b.w / 2 + 24, ry = b.h / 2 + 16;
  for (let i = 0; i <= 44; i++){ const a = -0.4 + (i / 40) * Math.PI * 2; d += (i ? 'L' : 'M') + f(b.cx + Math.cos(a) * (rx + wobble())) + ' ' + f(b.cy + Math.sin(a) * (ry + wobble())); }
  const loop = svgEl('path', { d, stroke: p.accent1, 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); g.appendChild(loop);
  drawOn(tl, loop, at, 1 / S(ctx));
  // an arrow pointing in, a star and a heart
  const ax = b.x + b.w + rx * 0.3 + 30, ay = b.y - 30, tx = b.x + b.w + 6, ty = b.y + 4;
  const arrow = svgEl('path', { d: `M${f(ax + 40)} ${f(ay - 30)} Q${f(ax + 10)} ${f(ay - 30)} ${f(tx)} ${f(ty)} M${f(tx)} ${f(ty)} l14 -2 M${f(tx)} ${f(ty)} l2 -14`, stroke: p.accent2, 'stroke-width': 2.2, fill: 'none', 'stroke-linecap': 'round' });
  g.appendChild(arrow); drawOn(tl, arrow, at + 0.9 / S(ctx), 0.6 / S(ctx));
  const st = svgEl('path', { d: starPath(b.x - 26, b.y - 14, 12, 5, 5), stroke: p.glow, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' }); g.appendChild(st); drawOn(tl, st, at + 1.3 / S(ctx), 0.5 / S(ctx));
  const hx = b.x + b.w * 0.2, hy = b.y + b.h + 34, ht = svgEl('path', { d: heartPath(hx, hy, 11), stroke: p.accent1, 'stroke-width': 2, fill: 'none' }); g.appendChild(ht); drawOn(tl, ht, at + 1.6 / S(ctx), 0.5 / S(ctx));
  return at + 2.2 / S(ctx);
}, 0.85);

export const MORE_DECORATIONS: Decoration[] = [sparkles, constellation, flare, flames, frost, ripples, lightning, drips, roots, butterflies, petals, laurel, ecg, hud, bones, confetti, hearts, swash, doodles];
