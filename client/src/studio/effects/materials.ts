// 3D letter materials. Each letter is rendered as a lit, solid object instead of flat paint:
//  - its shape is measured (how far each pixel is from the edge) and turned into a height field: a bevel, a pillow
//    (balloon), a tube (neon, built along the letter's centre line) or an engraving cut into the surface;
//  - normals come from that height field and are lit by one key light (angle adjustable) with diffuse + specular,
//    and metals reflect a studio environment (sky, horizon, floor) the way chrome and gold lettering do;
//  - surface textures (granite, marble veins, lava crust, brushed steel, foil wrinkles, bone pores, ice) perturb it;
//  - the letter gets real depth: an extruded side away from the light, and a soft shadow cast on the background.
// The result is one canvas per letter, placed inside the letter's own element, so every typing effect still moves,
// fades and blurs it. Rendering is done once per composition (cached), never per frame.
import type { Palette } from './types';
import { insideDistance, skeletonOf, baselineIn } from './typing/handwriting';

export interface Material { id: string; name: string; shaded: boolean }
export const MATERIALS: Material[] = [
  { id: 'solid', name: 'Flat colour', shaded: false }, { id: 'gradient', name: 'Gradient', shaded: false }, { id: 'outline', name: 'Outline', shaded: false },
  { id: 'chrome', name: 'Chrome 3D', shaded: true }, { id: 'gold', name: 'Gold 3D', shaded: true }, { id: 'rosegold', name: 'Rose gold 3D', shaded: true },
  { id: 'steel', name: 'Brushed steel 3D', shaded: true }, { id: 'glass', name: 'Glass 3D', shaded: true }, { id: 'ice', name: 'Ice 3D', shaded: true },
  { id: 'neon', name: 'Neon tube 3D', shaded: true }, { id: 'lava', name: 'Lava 3D', shaded: true }, { id: 'stone', name: 'Stone 3D', shaded: true },
  { id: 'carved', name: 'Carved stone', shaded: true }, { id: 'marble', name: 'Marble 3D', shaded: true }, { id: 'bone', name: 'Bone 3D', shaded: true },
  { id: 'candy', name: 'Glossy candy 3D', shaded: true }, { id: 'foil', name: 'Foil balloon 3D', shaded: true }, { id: 'extrude', name: 'Block extrude 3D', shaded: true },
  { id: 'emboss', name: 'Letterpress', shaded: true }, { id: 'satin', name: 'Satin 3D', shaded: true },
];
/** old fill names from earlier versions → today's materials */
export const LEGACY_FILL: Record<string, string> = { 'metal-gold': 'gold', fire: 'lava', 'outline-glow': 'neon' };
export const isShaded = (id: string) => !!MATERIALS.find(m => m.id === (LEGACY_FILL[id] || id))?.shaded;

export interface MatOptions { depth: number; light: number; dpr: number; seed: number }
export interface GlyphArt { canvas: HTMLCanvasElement; pad: number; extra: number }

type RGB = [number, number, number];
const hex = (h: string): RGB => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const mixc = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp = (v: number, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const sstep = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function ramp(stops: [number, RGB][], t: number): RGB {
  t = clamp(t); for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]){ const [a, ca] = stops[i - 1], [b, cb] = stops[i]; return mixc(ca, cb, (t - a) / Math.max(1e-6, b - a)); }
  return stops[stops.length - 1][1];
}
// value noise + fbm (deterministic)
function hash(x: number, y: number){ let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number){
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, o = 4){ let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++){ s += a * vnoise(x * f, y * f); n += a; f *= 2.03; a *= 0.5; } return s / n; }

const ENV: Record<string, [number, RGB][]> = {
  chrome: [[0, hex('#ffffff')], [0.22, hex('#d6e4f2')], [0.44, hex('#6f8aa6')], [0.5, hex('#1b2129')], [0.53, hex('#4a3a2c')], [0.72, hex('#c9b291')], [0.9, hex('#f4ead8')], [1, hex('#ffffff')]],
  gold: [[0, hex('#fffbe6')], [0.2, hex('#ffe39a')], [0.45, hex('#c98d22')], [0.52, hex('#5a3606')], [0.58, hex('#8a5a12')], [0.78, hex('#f2c661')], [1, hex('#fff1bf')]],
  rosegold: [[0, hex('#fff2ee')], [0.22, hex('#f7c2b2')], [0.46, hex('#c07a68')], [0.52, hex('#5a2a22')], [0.6, hex('#8e4f42')], [0.8, hex('#efb3a1')], [1, hex('#fff0ea')]],
  steel: [[0, hex('#f2f4f6')], [0.3, hex('#b9c0c8')], [0.5, hex('#6b737c')], [0.56, hex('#4c535b')], [0.8, hex('#a6aeb7')], [1, hex('#e9edf1')]],
};

/** one letter as a lit 3D object (or null for flat paints) */
export function renderGlyph(ch: string, font: string, w: number, h: number, matId: string, pal: Palette, o: MatOptions, word: { x0: number; y0: number; h: number }, at: { x: number; y: number }): GlyphArt | null {
  const mat = LEGACY_FILL[matId] || matId; if (!isShaded(mat) || !ch.trim()) return null;
  const fontPx = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] || String(h));
  const depth = clamp(o.depth, 0, 1);
  const la = (o.light * Math.PI) / 180, Lraw = [Math.cos(la) * 0.72, Math.sin(la) * 0.72, 0.7], Ln = Math.hypot(...Lraw), L = Lraw.map(v => v / Ln);
  const Hn = Math.hypot(L[0], L[1], L[2] + 1), Hv = [L[0] / Hn, L[1] / Hn, (L[2] + 1) / Hn];
  const away = [-Math.cos(la), -Math.sin(la)];                 // extrusion and shadow fall away from the light
  const flat = mat === 'carved' || mat === 'emboss';
  const ext = flat ? 0 : (mat === 'extrude' ? fontPx * 0.16 : mat === 'neon' || mat === 'foil' ? 0 : mat === 'satin' ? fontPx * 0.03 : fontPx * 0.055) * depth;
  const shadowLen = flat ? 0 : fontPx * (mat === 'neon' ? 0.05 : 0.07) * (0.4 + depth);
  const blur = fontPx * 0.05;
  const pad = Math.ceil(fontPx * 0.12 + ext + shadowLen + blur * 2.2);
  const s = Math.max(0.5, Math.min(o.dpr, 2, 340 / (h + pad * 2)));   // raster scale: sharp, but bounded so it stays quick
  const W = Math.max(4, Math.ceil((w + pad * 2) * s)), H = Math.max(4, Math.ceil((h + pad * 2) * s));
  // 1. the shape (for neon: a tube along the letter's centre line)
  const shape = document.createElement('canvas'); shape.width = W; shape.height = H;
  const sx = shape.getContext('2d', { willReadFrequently: true })!; sx.scale(s, s); sx.font = font; sx.textBaseline = 'alphabetic';
  const base = pad + baselineIn(sx, ch, h);
  if (mat === 'neon'){
    const sk = skeletonOf(ch, font, w, h), tube = Math.max(2.5, fontPx * 0.075);
    sx.strokeStyle = '#000'; sx.lineWidth = tube; sx.lineCap = 'round'; sx.lineJoin = 'round';
    for (const st of sk.strokes){ sx.beginPath(); st.pts.forEach((p, i) => i ? sx.lineTo(p.x + pad, p.y + pad) : sx.moveTo(p.x + pad, p.y + pad)); if (st.pts.length === 1) sx.lineTo(st.pts[0].x + pad + 0.1, st.pts[0].y + pad); sx.stroke(); }
  } else { sx.fillStyle = '#000'; sx.fillText(ch, pad, base); }
  const src = sx.getImageData(0, 0, W, H).data, A = new Float32Array(W * H), bin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++){ A[i] = src[i * 4 + 3] / 255; bin[i] = A[i] > 0.5 ? 1 : 0; }
  // 2. the height field
  const D = insideDistance(bin, W, H); let maxD = 1; for (let i = 0; i < W * H; i++) if (D[i] > maxD) maxD = D[i];
  const bevel = mat === 'satin' ? maxD * 0.85 : mat === 'foil' || mat === 'neon' || mat === 'glass' || mat === 'ice' || mat === 'candy' ? maxD : mat === 'extrude' ? Math.max(1.5, maxD * 0.3) : mat === 'carved' ? maxD * 0.85 : mat === 'emboss' ? maxD * 0.55 : Math.max(2, maxD * 0.62);
  const round = !(mat === 'chrome' || mat === 'gold' || mat === 'rosegold' || mat === 'steel' || mat === 'carved' || mat === 'extrude');
  const lift = (mat === 'emboss' ? 0.5 : mat === 'carved' ? -1 : 1) * (0.55 + depth * 0.7);
  const Hm = new Float32Array(W * H), ox = at.x - pad, oy = at.y - pad;
  const rough = mat === 'stone' ? 0.5 : mat === 'lava' ? 0.9 : mat === 'bone' ? 0.25 : mat === 'foil' ? 0.07 : mat === 'emboss' ? 0.12 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const i = y * W + x; if (A[i] <= 0) continue;
    const d = Math.max(0, D[i] - 0.5 + A[i]), u = clamp(d / bevel);
    let ht = round ? Math.sqrt(1 - (1 - u) * (1 - u)) : u;
    if (rough){ const wx = (ox + x / s) * 0.09, wy = (oy + y / s) * 0.09; ht += (fbm(mat === 'foil' ? wx * 0.5 : wx, mat === 'foil' ? wy * 0.5 : wy, 3) - 0.5) * rough * (mat === 'foil' ? (1 - u) * 2 : 1); }
    Hm[i] = ht * bevel * lift;
  }
  // 3. shading
  const out = sx.createImageData(W, H), px = out.data;
  const tx = hex(pal.text), a1 = hex(pal.accent1), a2 = hex(pal.accent2), gl = hex(pal.glow), bg = hex(pal.bg);
  const env = ENV[mat === 'steel' ? 'steel' : mat === 'gold' ? 'gold' : mat === 'rosegold' ? 'rosegold' : 'chrome'];
  const foilEnv: [number, RGB][] = [[0, [1, 1, 1]], [0.2, mixc(a1, [1, 1, 1], 0.55)], [0.48, a1], [0.56, mixc(a1, [0, 0, 0], 0.55)], [0.75, mixc(a1, [1, 1, 1], 0.2)], [1, mixc(a1, [1, 1, 1], 0.7)]];
  const seedX = (o.seed % 997) * 0.37;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++){
    const i = y * W + x, a = A[i]; if (a <= 0.003) continue;
    let nx = (Hm[i - 1] - Hm[i + 1]) * 0.5, ny = (Hm[i - W] - Hm[i + W]) * 0.5; const nl = Math.hypot(nx, ny, 1); nx /= nl; ny /= nl; const nz = 1 / nl;
    const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
    const nh = Math.max(0, nx * Hv[0] + ny * Hv[1] + nz * Hv[2]);
    const ry = 2 * nz * ny;                                       // where the reflection looks (up/down)
    const wy = clamp(((oy + y / s) - word.y0) / Math.max(1, word.h));   // position on the word, top to bottom
    const wxp = (ox + x / s), wyp = (oy + y / s);
    const d = D[i] / maxD;
    let c: RGB, alpha = a;
    switch (mat){
      case 'chrome': case 'gold': case 'rosegold': case 'steel': {
        let t = wy * 0.92 + ry * 0.55;
        if (mat === 'steel') t += (vnoise(wxp * 0.02 + seedX, wyp * 1.4) - 0.5) * 0.12;
        c = ramp(env, t);
        c = mixc(c, [0, 0, 0], (1 - diff) * 0.25);
        const sp = Math.pow(nh, mat === 'steel' ? 40 : 90) * 1.1; c = mixc(c, [1, 1, 1], clamp(sp));
        break;
      }
      case 'foil': {
        c = ramp(foilEnv, wy * 0.6 + ry * 0.75 + 0.1);
        c = mixc(c, [1, 1, 1], clamp(Math.pow(nh, 60) * 1.3));
        c = mixc(c, mixc(a1, [0, 0, 0], 0.4), (1 - diff) * 0.35);
        break;
      }
      case 'glass': case 'ice': {
        const tint = mat === 'ice' ? mixc([0.75, 0.93, 1], gl, 0.25) : mixc(gl, [1, 1, 1], 0.45);
        const fres = Math.pow(1 - nz, 2.2);
        let frost = 0; if (mat === 'ice'){ const n = fbm(wxp * 0.05 + seedX, wyp * 0.05, 4); frost = Math.pow(n, 3) * 1.6 + (Math.abs(vnoise(wxp * 0.08, wyp * 0.08) - 0.5) < 0.03 ? 0.6 : 0); }
        c = mixc(mixc(tint, [0, 0, 0], 0.25), [1, 1, 1], clamp(fres * 0.7 + frost * 0.5));
        const sp = Math.pow(nh, 120) * 1.4 + Math.pow(Math.max(0, -nx * L[0] - ny * L[1]), 6) * 0.25;   // a sharp highlight and a soft caustic on the far side
        c = mixc(c, [1, 1, 1], clamp(sp));
        alpha = a * clamp((mat === 'ice' ? 0.42 : 0.2) + fres * 0.75 + sp + frost * 0.35);
        break;
      }
      case 'neon': {
        const core = Math.pow(d, 1.6);
        c = mixc(mixc(a1, [0, 0, 0], 0.15), mixc(a1, [1, 1, 1], 0.85), core);
        c = mixc(c, [1, 1, 1], clamp(Math.pow(nh, 50) * 0.9));
        alpha = a * (0.55 + core * 0.45);
        break;
      }
      case 'lava': {
        const n = fbm(wxp * 0.045 + seedX, wyp * 0.045, 4), crack = 1 - sstep(0.0, 0.06, Math.abs(n - 0.5));
        const crust = mixc([0.09, 0.04, 0.03], [0.22, 0.11, 0.07], diff);
        const hot = mixc(a1, [1, 0.86, 0.45], crack * 0.8 + d * 0.2);
        c = mixc(crust, hot, clamp(crack * 1.1 + Math.pow(d, 3) * 0.35));
        c = mixc(c, [1, 0.9, 0.7], clamp(Math.pow(nh, 30) * 0.3 * (1 - crack)));
        break;
      }
      case 'stone': case 'carved': {
        const g = fbm(wxp * 0.12 + seedX, wyp * 0.12, 4), speck = hash(Math.floor(wxp * 1.3), Math.floor(wyp * 1.3));
        const baseC = mat === 'carved' ? mixc(bg, [0, 0, 0], 0.12) : mixc(mixc(tx, [0.55, 0.53, 0.5], 0.65), [0.3, 0.29, 0.28], g * 0.6);
        c = mixc(baseC, speck > 0.93 ? [0.95, 0.95, 0.92] : speck < 0.06 ? [0.12, 0.12, 0.12] : baseC, 0.6);
        c = mixc([0, 0, 0], c, 0.25 + diff * 0.95);
        if (mat === 'carved') c = mixc(c, [0, 0, 0], (1 - d) * 0.1 + 0.08);
        c = mixc(c, [1, 1, 1], clamp(Math.pow(nh, 20) * 0.12));
        break;
      }
      case 'marble': {
        const n = fbm(wxp * 0.02 + seedX, wyp * 0.02, 5), v = Math.abs(Math.sin((wxp * 0.6 + wyp * 0.35) * 0.06 + n * 7));
        const vein = Math.pow(1 - v, 14);
        c = mixc([0.96, 0.95, 0.93], [0.36, 0.36, 0.38], vein * 0.75);
        c = mixc(c, mixc(a1, [0.85, 0.7, 0.4], 0.5), Math.pow(1 - v, 40) * 0.6);
        c = mixc([0.25, 0.25, 0.27], c, 0.45 + diff * 0.6);
        c = mixc(c, [1, 1, 1], clamp(Math.pow(nh, 70) * 0.9));
        break;
      }
      case 'bone': {
        const n = fbm(wxp * 0.08 + seedX, wyp * 0.08, 4);
        c = mixc([0.93, 0.89, 0.78], [0.78, 0.72, 0.58], n);
        c = mixc(c, [0.98, 0.95, 0.88], d * 0.3);
        c = mixc([0.2, 0.17, 0.12], c, 0.3 + diff * 0.8);
        c = mixc(c, [1, 1, 1], clamp(Math.pow(nh, 18) * 0.15));
        break;
      }
      case 'candy': {
        c = mixc(mixc(a1, [0, 0, 0], 0.35), mixc(a1, [1, 1, 1], 0.18), diff);
        c = mixc(c, mixc(a1, [1, 1, 1], 0.4), Math.pow(d, 2) * 0.35);   // light glowing through the thick middle
        c = mixc(c, [1, 1, 1], clamp(Math.pow(nh, 140) * 1.5 + Math.pow(1 - nz, 3) * 0.25));
        break;
      }
      case 'satin': {   // the letters' own colour, softly bevelled and lit: 3D without changing the design
        c = mixc(mixc(tx, [0, 0, 0], 0.32), mixc(tx, [1, 1, 1], 0.08), diff);
        c = mixc(c, [1, 1, 1], clamp(Math.pow(nh, 36) * 0.35));
        break;
      }
      case 'extrude': {
        c = mixc(mixc(tx, [0, 0, 0], 0.18), tx, diff);
        c = mixc(c, [1, 1, 1], clamp(Math.pow(nh, 40) * 0.4));
        break;
      }
      default: {   // emboss / letterpress: the paper itself, raised
        const paper = mixc(bg, [1, 1, 1], 0.06);
        c = mixc(mixc(paper, [0, 0, 0], 0.22), mixc(paper, [1, 1, 1], 0.35), diff);
        alpha = a * clamp(0.35 + (1 - nz) * 3);
      }
    }
    px[i * 4] = clamp(c[0]) * 255; px[i * 4 + 1] = clamp(c[1]) * 255; px[i * 4 + 2] = clamp(c[2]) * 255; px[i * 4 + 3] = clamp(alpha) * 255;
  }
  const face = document.createElement('canvas'); face.width = W; face.height = H; face.getContext('2d')!.putImageData(out, 0, 0);
  // 4. depth and the cast shadow, then the face on top
  const art = document.createElement('canvas'); art.width = W; art.height = H;
  const x = art.getContext('2d')!;
  const tinted = (col: string) => { const t = document.createElement('canvas'); t.width = W; t.height = H; const q = t.getContext('2d')!; q.drawImage(shape, 0, 0); q.globalCompositeOperation = 'source-in'; q.fillStyle = col; q.fillRect(0, 0, W, H); return t; };
  if (shadowLen > 0){
    x.save(); x.shadowColor = mat === 'neon' ? hexA(pal.accent1, 0.35) : 'rgba(0,0,0,0.5)'; x.shadowBlur = blur * s * (mat === 'neon' ? 2.5 : 1.4);
    x.shadowOffsetX = (away[0] * (ext + shadowLen)) * s + 20000; x.shadowOffsetY = away[1] * (ext + shadowLen) * s;
    x.drawImage(shape, -20000, 0); x.restore();
  }
  if (ext > 0){
    const sideNear = sideColour(mat, pal, 0.75), sideFar = sideColour(mat, pal, 0.35);
    const near = tinted(sideNear), far = tinted(sideFar), steps = Math.max(1, Math.ceil(ext * s));
    for (let k = steps; k >= 1; k--){
      const f = k / steps; x.globalAlpha = mat === 'glass' || mat === 'ice' ? 0.35 : 1;
      x.drawImage(f > 0.5 ? far : near, away[0] * f * ext * s, away[1] * f * ext * s);
    }
    x.globalAlpha = 1;
    // a thin bright rim where the face meets the side
    x.drawImage(tinted(sideColour(mat, pal, 1)), away[0] * 0.6 * s, away[1] * 0.6 * s);
  }
  x.drawImage(face, 0, 0);
  art.className = 'fx-mat'; art.setAttribute('aria-hidden', 'true');
  art.dataset.pad = String(pad); art.dataset.extra = String(Math.round(ext + shadowLen * 0.6));
  art.style.left = -pad + 'px'; art.style.top = -pad + 'px'; art.style.width = (w + pad * 2) + 'px'; art.style.height = (h + pad * 2) + 'px';
  return { canvas: art, pad, extra: ext + shadowLen * 0.6 };
}
function hexA(h: string, a: number){ const [r, g, b] = hex(h); return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`; }
/** the colour of a letter's side (its depth), from the material, at a brightness */
function sideColour(mat: string, pal: Palette, k: number){
  const pick: Record<string, string> = { chrome: '#5b6774', gold: '#8a5a12', rosegold: '#8e4f42', steel: '#5c636b', glass: pal.glow, ice: '#7fc7e6', lava: '#3a120a', stone: '#4a4744', marble: '#9a9690', bone: '#9c8f74', candy: pal.accent1, extrude: pal.accent1, satin: pal.text };
  const [r, g, b] = hex(pick[mat] || pal.accent1), m = (v: number) => Math.round(clamp(v * k * (mat === 'candy' || mat === 'extrude' ? 0.9 : mat === 'satin' ? 0.55 : 1.15)) * 255);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
