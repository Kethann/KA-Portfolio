// Glyph anchors: each letter is drawn on a small offscreen canvas in its real font, and points are sampled along
// its outline (about 20, one per direction from the letter's centre), along its baseline and along its top.
// Decorations attach to these, so they grow from the actual shape of the letter, not from its box.
import type { GlyphAnchors, Point } from './types';

const cache = new Map<string, { outline: Point[]; base: Point[]; top: Point[]; center: Point; w: number; h: number }>();
let canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
function surface(w: number, h: number){
  if (!canvas) canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  return canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
}

/** points are in the letter's own box (0..w, 0..h); the controller moves them into stage space */
function sample(ch: string, font: string, w: number, h: number, count = 20){
  const key = `${ch}|${font}|${w}|${h}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = Math.max(4, Math.ceil(w)), H = Math.max(4, Math.ceil(h));
  const x = surface(W, H);
  x.clearRect(0, 0, W, H); x.font = font; x.textBaseline = 'alphabetic'; x.fillStyle = '#000';
  const m = x.measureText(ch), asc = m.fontBoundingBoxAscent || H * 0.8;
  x.fillText(ch, 0, Math.min(H, asc + (H - (asc + (m.fontBoundingBoxDescent || H * 0.2))) / 2));
  const data = x.getImageData(0, 0, W, H).data, on = (px: number, py: number) => px >= 0 && py >= 0 && px < W && py < H && data[(py * W + px) * 4 + 3] > 110;
  const edge: Point[] = []; let cx = 0, cy = 0, n = 0, minY = H, maxY = 0;
  const step = Math.max(1, Math.round(Math.min(W, H) / 90));
  for (let py = 0; py < H; py += step) for (let px = 0; px < W; px += step){
    if (!on(px, py)) continue;
    cx += px; cy += py; n++; if (py < minY) minY = py; if (py > maxY) maxY = py;
    if (!on(px - step, py) || !on(px + step, py) || !on(px, py - step) || !on(px, py + step)) edge.push({ x: px, y: py });
  }
  const center = n ? { x: cx / n, y: cy / n } : { x: W / 2, y: H / 2 };
  // the outline: in each of `count` directions, the farthest edge point from the centre (the outer contour)
  const outline: Point[] = [];
  for (let k = 0; k < count; k++){
    const a0 = (k / count) * Math.PI * 2 - Math.PI, a1 = ((k + 1) / count) * Math.PI * 2 - Math.PI;
    let best: Point | null = null, bd = -1;
    for (const p of edge){ const a = Math.atan2(p.y - center.y, p.x - center.x); if (a < a0 || a >= a1) continue; const d = (p.x - center.x) ** 2 + (p.y - center.y) ** 2; if (d > bd){ bd = d; best = p; } }
    if (best) outline.push(best);
  }
  const band = (yy: number) => edge.filter(p => Math.abs(p.y - yy) <= step * 2).sort((a, b) => a.x - b.x);
  const pick = (arr: Point[], k: number) => arr.length <= k ? arr : Array.from({ length: k }, (_, i) => arr[Math.round(i * (arr.length - 1) / (k - 1))]);
  const res = { outline: outline.length ? outline : [center], base: pick(band(maxY), 5), top: pick(band(minY), 5), center, w: W, h: H };
  if (cache.size > 600) cache.clear();
  cache.set(key, res);
  return res;
}

export function glyphAnchors(ch: string, font: string, rect: DOMRect, stageRect: DOMRect): GlyphAnchors {
  const s = sample(ch, font, rect.width, rect.height);
  const ox = rect.left - stageRect.left, oy = rect.top - stageRect.top, kx = rect.width / s.w, ky = rect.height / s.h;
  const map = (p: Point) => ({ x: ox + p.x * kx, y: oy + p.y * ky });
  return { outline: s.outline.map(map), base: s.base.map(map), top: s.top.map(map), center: map(s.center) };
}
