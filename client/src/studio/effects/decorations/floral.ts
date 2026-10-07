// Floral garden: vines grow out of the letters as they appear. Each stem is a procedural Bézier that leaves the
// letter's outline heading outward (so it never covers the letter), bends with noise and ends in a spiral tendril.
// Leaves pop along it and a rose, a peony or a bud blooms at the tip. Line art: outline + flat fill, two accents.
import { between } from '../rng';
import { deco } from './kit';
import type { Effect, EffectContext, Point, CharInfo, Timeline } from '../types';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag: string, attrs: Record<string, string | number>) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, String(attrs[k])); return n; };
const f = (n: number) => n.toFixed(1);
let group: SVGGElement | null = null;

function rot(p: Point, a: number, o: Point){ const c = Math.cos(a), s = Math.sin(a); return { x: o.x + p.x * c - p.y * s, y: o.y + p.x * s + p.y * c }; }

/** a leaf whose base sits at `o`, pointing along angle `a`: two smooth curves meeting at a pointed tip */
function leafPath(o: Point, a: number, size: number){
  const tip = rot({ x: size, y: 0 }, a, o), c1 = rot({ x: size * 0.3, y: -size * 0.42 }, a, o), c2 = rot({ x: size * 0.75, y: -size * 0.3 }, a, o);
  const c3 = rot({ x: size * 0.75, y: size * 0.26 }, a, o), c4 = rot({ x: size * 0.3, y: size * 0.36 }, a, o);
  return `M${f(o.x)} ${f(o.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(tip.x)} ${f(tip.y)} C${f(c3.x)} ${f(c3.y)} ${f(c4.x)} ${f(c4.y)} ${f(o.x)} ${f(o.y)}Z`;
}
/** a rounded petal from `o` outward along `a` (wide, soft tip) */
function petalPath(o: Point, a: number, len: number, wid: number){
  const P = (x: number, y: number) => rot({ x, y }, a, o);
  const l1 = P(len * 0.2, -wid * 0.9), l2 = P(len * 1.05, -wid * 0.95), tip = P(len, 0), r2 = P(len * 1.05, wid * 0.95), r1 = P(len * 0.2, wid * 0.9);
  return `M${f(o.x)} ${f(o.y)} C${f(l1.x)} ${f(l1.y)} ${f(l2.x)} ${f(l2.y)} ${f(tip.x)} ${f(tip.y)} C${f(r2.x)} ${f(r2.y)} ${f(r1.x)} ${f(r1.y)} ${f(o.x)} ${f(o.y)}Z`;
}
interface Bloom { layers: { d: string; fill: string; op: number }[]; heart: string }
/** rose (three rings of petals around a spiral), peony (ruffled layers), daisy (fine rays) or tulip bud */
function bloom(kind: number, o: Point, size: number, r: () => number, p: { accent1: string; glow: string; text: string }): Bloom {
  const layers: Bloom['layers'] = [];
  const ring = (n: number, len: number, wid: number, off: number, fill: string, op: number) => {
    let d = ''; for (let k = 0; k < n; k++) d += petalPath(o, off + (k / n) * Math.PI * 2 + (r() - 0.5) * 0.15, len * (0.9 + r() * 0.2), wid) + ' ';
    layers.push({ d, fill, op });
  };
  if (kind === 0){            // rose
    ring(5, size * 0.95, size * 0.42, r() * 6, p.accent1, 0.95); ring(5, size * 0.68, size * 0.36, r() * 6, p.accent1, 0.8); ring(4, size * 0.42, size * 0.3, r() * 6, p.glow, 0.7);
    let sp = ''; for (let k = 0; k <= 20; k++){ const a = k * 0.62, rr = size * 0.02 + k * size * 0.012; sp += (k ? 'L' : 'M') + f(o.x + Math.cos(a) * rr) + ' ' + f(o.y + Math.sin(a) * rr); }
    return { layers, heart: sp };
  }
  if (kind === 1){            // peony
    ring(9, size * 1.0, size * 0.32, r() * 6, p.accent1, 0.85); ring(8, size * 0.75, size * 0.3, r() * 6, p.glow, 0.7); ring(6, size * 0.45, size * 0.26, r() * 6, p.accent1, 0.9);
    return { layers, heart: '' };
  }
  if (kind === 2){            // daisy
    ring(14, size * 1.0, size * 0.13, r() * 6, p.text, 0.92);
    return { layers, heart: '' };
  }
  const a = -Math.PI / 2 + (r() - 0.5) * 0.6;   // tulip bud
  layers.push({ d: petalPath(o, a - 0.32, size * 0.95, size * 0.36) + ' ' + petalPath(o, a + 0.32, size * 0.95, size * 0.36), fill: p.accent1, op: 0.9 });
  layers.push({ d: petalPath(o, a, size * 1.05, size * 0.38), fill: p.glow, op: 0.85 });
  return { layers, heart: '' };
}

function grow(tl: Timeline, ctx: EffectContext, c: CharInfo, at: number){
  const r = ctx.rng, p = ctx.palette, scale = Math.max(0.5, c.rect.height / 90) * deco.scale;
  // an anchor on the outline facing up or out (never from inside the letter), heading away from its centre
  const ol = c.anchors.outline.filter(q => q.y <= c.anchors.center.y + c.rect.height * 0.12);
  const a0 = (ol.length ? ol : c.anchors.outline)[Math.floor(r() * (ol.length || c.anchors.outline.length))];
  let dx = a0.x - c.anchors.center.x, dy = a0.y - c.anchors.center.y - c.rect.height * 0.35; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const L = between(r, 34, 78) * scale * (0.7 + ctx.density * 0.6), nx = -dy, ny = dx, bend = (r() - 0.5) * 0.9;
  const E = { x: a0.x + dx * L, y: a0.y + dy * L };
  const c1 = { x: a0.x + dx * L * 0.35 + nx * bend * L * 0.45, y: a0.y + dy * L * 0.35 + ny * bend * L * 0.45 };
  const c2 = { x: a0.x + dx * L * 0.75 - nx * bend * L * 0.35, y: a0.y + dy * L * 0.75 - ny * bend * L * 0.35 };
  // spiral tendril at the end
  let tend = ''; const sr = L * 0.11, dir = r() < 0.5 ? 1 : -1; let ang = Math.atan2(dy, dx);
  for (let k = 1; k <= 8; k++){ ang += dir * 0.8; const rr = sr * (1 - k / 10); tend += ` L${f(E.x + Math.cos(ang) * rr)} ${f(E.y + Math.sin(ang) * rr)}`; }
  const g = el('g', { class: 'fx-flora' });
  const stem = el('path', { d: `M${f(a0.x)} ${f(a0.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(E.x)} ${f(E.y)}${tend}`, fill: 'none', stroke: p.accent2, 'stroke-width': f(1.9 * scale), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) as SVGPathElement;
  const under = stem.cloneNode() as SVGPathElement; under.setAttribute('stroke-width', f(4.2 * scale)); under.setAttribute('stroke-opacity', '0.22');
  g.append(under, stem); group!.appendChild(g);
  const len = stem.getTotalLength(), growDur = between(r, 0.7, 1.15) / Math.max(0.25, ctx.speed);
  tl.fromTo([under, stem], { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: growDur, ease: 'power1.out' }, at);
  // leaves along the stem
  const nLeaves = 1 + Math.floor(r() * 3);
  for (let k = 0; k < nLeaves; k++){
    const fr = between(r, 0.25, 0.75), pt = stem.getPointAtLength(fr * len), pt2 = stem.getPointAtLength(Math.min(len, fr * len + 2));
    const ta = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) + (k % 2 ? 0.9 : -0.9);
    const ls = between(r, 10, 17) * scale, leaf = el('g', {});
    leaf.append(el('path', { d: leafPath({ x: pt.x, y: pt.y }, ta, ls), fill: 'url(#fxgA2)', 'fill-opacity': 0.92, stroke: p.stroke, 'stroke-width': f(0.8 * scale), 'stroke-linejoin': 'round' }),
      el('path', { d: `M${f(pt.x)} ${f(pt.y)} L${f(pt.x + Math.cos(ta) * ls * 0.85)} ${f(pt.y + Math.sin(ta) * ls * 0.85)}`, stroke: p.stroke, 'stroke-width': f(0.6 * scale), 'stroke-opacity': 0.55, fill: 'none' }));
    g.appendChild(leaf);
    tl.fromTo(leaf, { scale: 0, svgOrigin: `${f(pt.x)} ${f(pt.y)}` }, { scale: 1, svgOrigin: `${f(pt.x)} ${f(pt.y)}`, duration: 0.42, ease: 'back.out(2.4)' }, at + growDur * fr);
  }
  // the bloom at the tip: layers open one after another, a little turn as they unfold
  const kind = Math.floor(r() * 4), bs = between(r, 13, 21) * scale, bl = bloom(kind, E, bs, r, p), O = `${f(E.x)} ${f(E.y)}`;
  bl.layers.forEach((ly, i) => {
    const n = el('path', { d: ly.d, fill: ly.fill === p.accent1 ? 'url(#fxgA1)' : ly.fill === p.glow ? 'url(#fxgGlow)' : ly.fill, 'fill-opacity': Math.min(1, ly.op + 0.05), stroke: p.stroke, 'stroke-width': f(0.7 * scale), 'stroke-linejoin': 'round' }); g.appendChild(n);
    tl.fromTo(n, { scale: 0, rotate: -40, svgOrigin: O }, { scale: 1, rotate: 0, svgOrigin: O, duration: 0.65, ease: 'back.out(1.8)' }, at + growDur * 0.85 + i * 0.12);
  });
  const heart = el('circle', { cx: f(E.x), cy: f(E.y), r: f(bs * (kind === 2 ? 0.26 : 0.16)), fill: kind === 2 ? p.accent1 : p.glow, stroke: p.stroke, 'stroke-width': f(0.6 * scale) });
  g.appendChild(heart);
  if (bl.heart){ const sp = el('path', { d: bl.heart, fill: 'none', stroke: p.stroke, 'stroke-width': f(0.8 * scale), 'stroke-opacity': 0.7 }); g.appendChild(sp); tl.fromTo(sp, { opacity: 0 }, { opacity: 1, duration: 0.4 }, at + growDur + 0.3); }
  tl.fromTo(heart, { scale: 0, svgOrigin: O }, { scale: 1, svgOrigin: O, duration: 0.4, ease: 'back.out(3)' }, at + growDur * 0.85 + bl.layers.length * 0.12);
  // a few seed dots near the bloom
  for (let k = 0; k < 2; k++){ const da = r() * Math.PI * 2, dd = bs * between(r, 1.3, 1.8), dot = el('circle', { cx: f(E.x + Math.cos(da) * dd), cy: f(E.y + Math.sin(da) * dd), r: f(1.4 * scale), fill: p.accent1 }); g.appendChild(dot);
    tl.fromTo(dot, { opacity: 0 }, { opacity: 0.8, duration: 0.3 }, at + growDur + 0.4 + k * 0.1); }
  return at + growDur + 0.6 + bl.layers.length * 0.12;
}

export const floral: Effect = {
  id: 'floral', name: 'Floral garden', description: 'Vines grow from the letters, leaves pop and flowers bloom at the tips.', duration: 3.2,
  params: [],
  init(ctx){
    group = el('g', deco.flat ? { class: 'fx-floral' } : { class: 'fx-floral', filter: 'url(#fxShade)' }) as SVGGElement;
    ctx.svg.appendChild(group);
    let last = 0;
    const picked = new Set<number>();
    const n = ctx.chars.length, want = Math.max(1, Math.round(n * (0.25 + ctx.density * 0.45)));
    // spread the flowers across the word: the first and last letters always grow one, the rest by seeded chance
    picked.add(0); if (n > 1) picked.add(n - 1);
    while (picked.size < Math.min(n, want)) picked.add(Math.floor(ctx.rng() * n));
    (ctx as EffectContext & { _floralPicked?: Set<number> })._floralPicked = picked;
    void last;
  },
  play(){ return 0; },
  reset(ctx){ ctx.svg.querySelectorAll('.fx-floral').forEach(n => n.remove()); group = null; },
};

/** the controller calls this for every revealed letter, at the moment it appears */
export function floralOnReveal(tl: Timeline, ctx: EffectContext, c: CharInfo, at: number){
  const picked = (ctx as EffectContext & { _floralPicked?: Set<number> })._floralPicked;
  if (!group || !picked || !picked.has(c.index) || /\s/.test(c.char)) return at;
  return grow(tl, ctx, c, at);
}
