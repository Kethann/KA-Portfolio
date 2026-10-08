// Glyph distance fields for the GPU renderer. Each letter is drawn once in its real font, and for every pixel we store
// how far it is from the letter's edge (inside and outside, sub-pixel exact: the Felzenszwalb–Huttenlocher transform on
// the anti-aliased coverage, as in Mapbox's tiny-sdf). From that single texture the shader gets a crisp edge at any size,
// a smooth bevelled 3D surface, the side walls of the extrusion, soft shadows, glows, and the shapes fire, snow, rain and
// lightning follow. All letters share one atlas texture.
import { baselineIn } from '../typing/handwriting';

const INF = 1e20;

function edt1d(grid: Float64Array, offset: number, stride: number, length: number, f: Float64Array, v: Uint16Array, z: Float64Array){
  v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++){
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do { const r = v[k]; s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++){
    while (z[k + 1] < q) k++;
    const r = v[k], qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
function edt(grid: Float64Array, w: number, h: number){
  const n = Math.max(w, h), f = new Float64Array(n), v = new Uint16Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}

/** signed distance (pixels, positive outside) from an alpha coverage image */
export function signedDistance(alpha: Uint8ClampedArray, w: number, h: number){
  const size = w * h, outer = new Float64Array(size), inner = new Float64Array(size);
  outer.fill(INF); inner.fill(0);
  for (let i = 0; i < size; i++){
    const a = alpha[i * 4 + 3] / 255;
    if (a === 0) continue;
    if (a === 1){ outer[i] = 0; inner[i] = INF; }
    else { const d = 0.5 - a; outer[i] = d > 0 ? d * d : 0; inner[i] = d < 0 ? d * d : 0; }
  }
  edt(outer, w, h); edt(inner, w, h);
  const out = new Float32Array(size);
  for (let i = 0; i < size; i++) out[i] = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
  return out;
}

export interface Tile { x: number; y: number; w: number; h: number; pad: number }
export interface Atlas { canvas: HTMLCanvasElement; tiles: Map<string, Tile>; scale: number; spread: number; version: number }

/**
 * Builds the atlas for a set of letters in one font. `scale` is atlas pixels per CSS pixel; `spread` (atlas pixels) is
 * how far from the edge distances are kept: enough for the bevel, the extrusion, the shadow and the glows.
 * `pad` (CSS px) is the room around each letter box the shader may draw into.
 */
export function buildAtlas(chars: { ch: string; w: number; h: number }[], font: string, scale: number, spreadCss: number, padCss: number, version: number): Atlas {
  const spread = Math.max(4, spreadCss * scale);
  const uniq = new Map<string, { w: number; h: number }>();
  for (const c of chars) if (c.ch.trim() && !uniq.has(c.ch)) uniq.set(c.ch, { w: c.w, h: c.h });
  // shelf packing
  const MAXW = 2048; let x = 0, y = 0, row = 0;
  const place: { ch: string; t: Tile }[] = [];
  for (const [ch, b] of uniq){
    const pad = Math.ceil(padCss * scale), tw = Math.ceil(b.w * scale) + pad * 2, th = Math.ceil(b.h * scale) + pad * 2;
    if (x + tw > MAXW){ x = 0; y += row + 1; row = 0; }
    place.push({ ch, t: { x, y, w: tw, h: th, pad } });
    x += tw + 1; row = Math.max(row, th);
  }
  const W = MAXW, H = Math.max(4, y + row + 1);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const out = canvas.getContext('2d')!;
  const img = out.createImageData(W, H), px = img.data;
  const scratch = document.createElement('canvas'), sx = scratch.getContext('2d', { willReadFrequently: true })!;
  const tiles = new Map<string, Tile>();
  for (const { ch, t } of place){
    const b = uniq.get(ch)!;
    scratch.width = t.w; scratch.height = t.h;
    sx.setTransform(scale, 0, 0, scale, 0, 0); sx.clearRect(0, 0, t.w, t.h);
    sx.font = font; sx.textBaseline = 'alphabetic'; sx.fillStyle = '#000';
    sx.fillText(ch, t.pad / scale, t.pad / scale + baselineIn(sx, ch, b.h));
    const a = sx.getImageData(0, 0, t.w, t.h).data, sd = signedDistance(a, t.w, t.h);
    for (let j = 0; j < t.h; j++) for (let i = 0; i < t.w; i++){
      const v = Math.max(0, Math.min(255, Math.round((0.5 - sd[j * t.w + i] / (2 * spread)) * 255)));
      const o = ((t.y + j) * W + t.x + i) * 4; px[o] = v; px[o + 1] = v; px[o + 2] = v; px[o + 3] = 255;
    }
    tiles.set(ch, t);
  }
  out.putImageData(img, 0, 0);
  return { canvas, tiles, scale, spread, version };
}
