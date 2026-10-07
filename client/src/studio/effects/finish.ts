// Finishes: a texture laid over the whole piece (film grain, scanlines, vignette…), drawn on a canvas above the
// words. Same code for the live stage and for exports; grain re-rolls a few times a second so it feels like film.
import { seeded } from './rng';
import type { Palette } from './types';

export const FINISHES = [
  { id: 'none', name: 'Clean' }, { id: 'grain', name: 'Film grain' }, { id: 'vignette', name: 'Vignette' }, { id: 'cinema', name: 'Grain + vignette' },
  { id: 'scanlines', name: 'Scanlines' }, { id: 'vhs', name: 'VHS' }, { id: 'paper', name: 'Paper' }, { id: 'leak', name: 'Light leak' },
  { id: 'dust', name: 'Dust & scratches' }, { id: 'halftone', name: 'Halftone' },
];

let noise: HTMLCanvasElement | null = null;
function noiseTile(seed: number){
  const c = noise || (noise = document.createElement('canvas')); c.width = c.height = 160;
  const q = c.getContext('2d')!, img = q.createImageData(160, 160), r = seeded(seed);
  // light and dark specks on transparent: it reads as grain over anything, on the live stage and in exports alike
  for (let i = 0; i < img.data.length; i += 4){ const v = r(), c = v > 0.5 ? 255 : 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = c; img.data[i + 3] = Math.abs(v - 0.5) * 2 * 255; }
  q.putImageData(img, 0, 0); return c;
}

/** paints a finish over a w×h area (CSS pixels); `amount` 0–1 */
export function paintFinish(x: CanvasRenderingContext2D, id: string, w: number, h: number, amount: number, pal: Palette, t: number){
  if (id === 'none' || amount <= 0) return;
  const A = Math.min(1, amount);
  x.save();
  const grain = (a: number) => { const tile = noiseTile(Math.floor(t * 12)); x.globalAlpha = a; x.fillStyle = x.createPattern(tile, 'repeat')!; x.fillRect(0, 0, w, h); x.globalAlpha = 1; };
  const vignette = (a: number) => { const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); x.fillStyle = g; x.fillRect(0, 0, w, h); };
  const lines = (a: number, gap = 3) => { x.fillStyle = `rgba(0,0,0,${a})`; for (let y = 0; y < h; y += gap) x.fillRect(0, y, w, 1); };
  if (id === 'grain') grain(0.13 * A);
  else if (id === 'vignette') vignette(0.75 * A);
  else if (id === 'cinema'){ grain(0.1 * A); vignette(0.65 * A); }
  else if (id === 'scanlines'){ lines(0.28 * A); vignette(0.3 * A); }
  else if (id === 'vhs'){
    lines(0.22 * A, 4); grain(0.09 * A);
    const y = ((t * 0.18) % 1) * h; x.fillStyle = `rgba(255,255,255,${0.06 * A})`; x.fillRect(0, y, w, 18);
    x.globalCompositeOperation = 'screen'; x.fillStyle = `rgba(255,0,80,${0.05 * A})`; x.fillRect(2, 0, w, h); x.fillStyle = `rgba(0,200,255,${0.05 * A})`; x.fillRect(-2, 0, w, h);
  } else if (id === 'paper'){
    grain(0.08 * A); x.globalCompositeOperation = 'multiply'; x.fillStyle = `rgba(214,196,160,${0.35 * A})`; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over'; vignette(0.35 * A);
  } else if (id === 'leak'){
    x.globalCompositeOperation = 'screen';
    const k = 0.5 + 0.5 * Math.sin(t * 0.4);
    const g = x.createRadialGradient(w * (0.05 + k * 0.1), h * 0.2, 0, w * 0.1, h * 0.2, Math.max(w, h) * 0.7); g.addColorStop(0, `rgba(255,140,60,${0.55 * A})`); g.addColorStop(0.5, `rgba(255,60,90,${0.22 * A})`); g.addColorStop(1, 'rgba(255,60,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const g2 = x.createRadialGradient(w, h, 0, w, h, Math.max(w, h) * 0.5); g2.addColorStop(0, `rgba(${parseInt(pal.glow.slice(1, 3), 16)},${parseInt(pal.glow.slice(3, 5), 16)},${parseInt(pal.glow.slice(5, 7), 16)},${0.35 * A})`); g2.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g2; x.fillRect(0, 0, w, h);
  } else if (id === 'dust'){
    grain(0.07 * A); const r = seeded(Math.floor(t * 8));
    x.fillStyle = `rgba(255,255,255,${0.5 * A})`; for (let i = 0; i < 30; i++) x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    x.strokeStyle = `rgba(255,255,255,${0.25 * A})`; x.lineWidth = 1; for (let i = 0; i < 2; i++){ const sx = r() * w; x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + (r() - 0.5) * 10, h); x.stroke(); }
    vignette(0.4 * A);
  } else if (id === 'halftone'){
    x.fillStyle = `rgba(0,0,0,${0.22 * A})`; const g = 8;
    for (let y = 0; y < h; y += g) for (let xx = (y / g) % 2 ? g / 2 : 0; xx < w; xx += g){ const d = 0.6 + 2.2 * (Math.hypot(xx - w / 2, y - h / 2) / Math.hypot(w, h)); x.beginPath(); x.arc(xx, y, d, 0, Math.PI * 2); x.fill(); }
  }
  x.restore();
}

/** the finish layer on the stage, redrawn a few times a second (only when it moves) */
export class FinishRunner {
  canvas: HTMLCanvasElement; private x: CanvasRenderingContext2D; private timer = 0; id = 'none'; amount = 0.6; pal: Palette | null = null; reduced = false;
  constructor(host: HTMLElement){ this.canvas = document.createElement('canvas'); this.canvas.className = 'fx-finish'; this.canvas.setAttribute('aria-hidden', 'true'); host.appendChild(this.canvas); this.x = this.canvas.getContext('2d')!; }
  set(id: string, amount: number, pal: Palette){
    this.id = id; this.amount = amount; this.pal = pal;
    const r = this.canvas.parentElement!.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr)); this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.hidden = id === 'none';
    clearInterval(this.timer); this.draw();
    if (!this.reduced && ['grain', 'cinema', 'vhs', 'dust', 'leak', 'paper'].includes(id)) this.timer = window.setInterval(() => { if (!document.hidden) this.draw(); }, 90);
  }
  draw(){
    const dpr = this.canvas.width / Math.max(1, this.canvas.parentElement?.clientWidth || 1), w = this.canvas.width / dpr, h = this.canvas.height / dpr;
    this.x.setTransform(1, 0, 0, 1, 0, 0); this.x.clearRect(0, 0, this.canvas.width, this.canvas.height); this.x.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.pal) paintFinish(this.x, this.id, w, h, this.amount, this.pal, performance.now() / 1000);
  }
  destroy(){ clearInterval(this.timer); this.canvas.remove(); }
}
