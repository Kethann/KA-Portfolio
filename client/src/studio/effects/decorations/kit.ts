// Small helpers every decoration shares: SVG elements, picking which letters grow something, and the text's box.
import type { CharInfo, EffectContext, Point } from '../types';

export const NS = 'http://www.w3.org/2000/svg';
export const f = (n: number) => n.toFixed(1);
export const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, String(attrs[k])); return n as SVGElementTagNameMap[K];
};
/** a layer for one decoration, removed again by its reset */
export const layer = (ctx: EffectContext, cls: string) => { const g = svgEl('g', { class: cls }); ctx.svg.appendChild(g); return g; };
export const clear = (ctx: EffectContext, cls: string) => ctx.svg.querySelectorAll('.' + cls).forEach(n => n.remove());

/** a share of the letters (never spaces): first and last always, the rest by seeded chance; density scales it */
export function pickLetters(ctx: EffectContext, share: number){
  const idx = ctx.chars.filter(c => !/\s/.test(c.char)).map(c => c.index), out = new Set<number>();
  if (!idx.length) return out;
  out.add(idx[0]); out.add(idx[idx.length - 1]);
  const want = Math.max(1, Math.round(idx.length * Math.min(1, share * (0.4 + ctx.density * 1.2))));
  let guard = 0; while (out.size < Math.min(idx.length, want) && guard++ < 999) out.add(idx[Math.floor(ctx.rng() * idx.length)]);
  return out;
}
/** the words' bounding box in stage pixels */
export function textBox(ctx: EffectContext){
  const sr = ctx.stage.getBoundingClientRect(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of ctx.chars){ if (/\s/.test(c.char)) continue; x0 = Math.min(x0, c.rect.left - sr.left); y0 = Math.min(y0, c.rect.top - sr.top); x1 = Math.max(x1, c.rect.right - sr.left); y1 = Math.max(y1, c.rect.bottom - sr.top); }
  if (!isFinite(x0)) return { x: sr.width / 2, y: sr.height / 2, w: 0, h: 0, cx: sr.width / 2, cy: sr.height / 2, sw: sr.width, sh: sr.height };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, sw: sr.width, sh: sr.height };
}
/** the user's decoration size (set by the controller before each build) */
export const deco = { scale: 1 };
/** size factor from the letter height, so decorations scale with the words (times the chosen size) */
export const unit = (c: CharInfo) => Math.max(0.45, c.rect.height / 90) * deco.scale;
export const topOf = (c: CharInfo): Point => c.anchors.top.length ? c.anchors.top[Math.floor(c.anchors.top.length / 2)] : { x: c.anchors.center.x, y: c.anchors.center.y - c.rect.height * 0.4 };
export const baseOf = (c: CharInfo): Point => c.anchors.base.length ? c.anchors.base[Math.floor(c.anchors.base.length / 2)] : { x: c.anchors.center.x, y: c.anchors.center.y + c.rect.height * 0.3 };
export const heartPath = (x: number, y: number, k: number) => `M${f(x)} ${f(y + k * 0.35)} C${f(x - k * 1.1)} ${f(y - k * 0.4)} ${f(x - k * 0.45)} ${f(y - k * 1.1)} ${f(x)} ${f(y - k * 0.45)} C${f(x + k * 0.45)} ${f(y - k * 1.1)} ${f(x + k * 1.1)} ${f(y - k * 0.4)} ${f(x)} ${f(y + k * 0.35)}Z`;
export const starPath = (x: number, y: number, R: number, r: number, n = 4, rot = 0) => {
  let d = ''; for (let i = 0; i < n * 2; i++){ const a = rot + (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + f(x + Math.cos(a) * rr) + ' ' + f(y + Math.sin(a) * rr); } return d + 'Z';
};
/** draws a path on, from nothing, over `dur` seconds */
export function drawOn(tl: import('../types').Timeline, p: SVGPathElement | SVGPolylineElement, at: number, dur: number, ease = 'power1.inOut'){
  const len = (p as SVGGeometryElement).getTotalLength?.() || 200;
  tl.fromTo(p, { strokeDasharray: len, strokeDashoffset: len, opacity: 1 }, { strokeDashoffset: 0, duration: dur, ease }, at);
  return at + dur;
}
