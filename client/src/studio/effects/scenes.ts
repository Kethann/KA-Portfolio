// Scenes: animated, themed backgrounds drawn on a canvas behind the words (and exported with them). Each scene draws
// in CSS pixels from its own state, so the same code paints the live stage, a 4K still and every video frame.
// Heavy static parts (camouflage, rock strata, parchment) are painted once into an offscreen canvas in init().
// Colours come from the palette, so every scene can be recoloured; intensity sets how much is going on.
import { seeded } from './rng';
import { ShaderPainter, fragmentFor } from './shaders';
import type { Palette } from './types';

export interface SceneState { w: number; h: number; pal: Palette; intensity: number; seed: number; r: () => number; d: Record<string, any> }
export interface Scene { id: string; name: string; group: string; init?(s: SceneState): void; draw(x: CanvasRenderingContext2D, s: SceneState, t: number): void }

const TAU = Math.PI * 2;
const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};
const mix = (a: string, b: string, k: number) => {
  const p = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
};
const count = (s: SceneState, base: number) => Math.max(4, Math.round(base * (0.25 + s.intensity * 1.1) * Math.min(1.6, (s.w * s.h) / (1280 * 720) + 0.4)));
const fill = (x: CanvasRenderingContext2D, s: SceneState, c: string | CanvasGradient) => { x.fillStyle = c; x.fillRect(0, 0, s.w, s.h); };
const vgrad = (x: CanvasRenderingContext2D, s: SceneState, stops: [number, string][]) => { const g = x.createLinearGradient(0, 0, 0, s.h); for (const [o, c] of stops) g.addColorStop(o, c); return g; };
const glowAt = (x: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: string, a: number) => {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0)); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
};
const off = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
/** particles that loop forever: each has a fixed random start and its position is a pure function of time */
const parts = (s: SceneState, n: number) => Array.from({ length: n }, () => ({ x: s.r(), y: s.r(), z: s.r(), p: s.r() * TAU, v: 0.4 + s.r() * 0.9 }));
const wrap = (v: number) => ((v % 1) + 1) % 1;

export const SCENES: Scene[] = [
  { id: 'plain', name: 'Plain', group: 'Simple', draw(x, s){ fill(x, s, s.pal.bg); } },
  { id: 'glow', name: 'Soft glow', group: 'Simple', draw(x, s, t){
    fill(x, s, s.pal.bg);
    glowAt(x, s.w * (0.3 + Math.sin(t * 0.13) * 0.08), s.h * 0.35, Math.max(s.w, s.h) * 0.55, s.pal.accent1, 0.22 * (0.4 + s.intensity));
    glowAt(x, s.w * (0.72 + Math.cos(t * 0.11) * 0.08), s.h * 0.7, Math.max(s.w, s.h) * 0.5, s.pal.accent2, 0.18 * (0.4 + s.intensity));
  } },

  { id: 'cinema', name: 'Cinema', group: 'Cinematic', init(s){ s.d.dust = parts(s, count(s, 50)); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, '#000000', 0.4)], [0.5, s.pal.bg], [1, mix(s.pal.bg, '#000000', 0.5)]]));
    // a slow anamorphic streak and a warm key light
    glowAt(x, s.w * 0.5, s.h * 0.5, s.w * 0.6, s.pal.accent1, 0.12 + s.intensity * 0.12);
    const sy = s.h * 0.5 + Math.sin(t * 0.2) * s.h * 0.04, sx = s.w * (0.5 + Math.sin(t * 0.17) * 0.25);
    const g = x.createLinearGradient(0, 0, s.w, 0); g.addColorStop(0, rgba(s.pal.glow, 0)); g.addColorStop(sx / s.w, rgba(s.pal.glow, 0.28 * s.intensity + 0.06)); g.addColorStop(1, rgba(s.pal.glow, 0));
    x.fillStyle = g; x.fillRect(0, sy - 1.5, s.w, 3);
    for (const p of s.d.dust){ const y = wrap(p.y - t * 0.01 * p.v), xx = wrap(p.x + Math.sin(t * 0.3 + p.p) * 0.01); x.fillStyle = rgba(s.pal.text, 0.15 + p.z * 0.25); x.fillRect(xx * s.w, y * s.h, 1 + p.z * 1.5, 1 + p.z * 1.5); }
    // letterbox bars (2.39:1)
    const bar = Math.max(0, (s.h - s.w / 2.39) / 2); x.fillStyle = '#000'; x.fillRect(0, 0, s.w, bar); x.fillRect(0, s.h - bar, s.w, bar);
  } },
  { id: 'spotlight', name: 'Spotlight stage', group: 'Cinematic', draw(x, s, t){
    fill(x, s, mix(s.pal.bg, '#000000', 0.35));
    for (let i = 0; i < 3; i++){
      const a = -Math.PI / 2 + Math.sin(t * 0.25 + i * 2.1) * 0.35, ox = s.w * (0.2 + i * 0.3), oy = -20;
      x.save(); x.translate(ox, oy); x.rotate(a + Math.PI / 2);
      const L = s.h * 1.3, g = x.createLinearGradient(0, 0, 0, L); g.addColorStop(0, rgba(s.pal.glow, 0.25 * (0.4 + s.intensity))); g.addColorStop(1, rgba(s.pal.glow, 0));
      x.fillStyle = g; x.beginPath(); x.moveTo(-6, 0); x.lineTo(6, 0); x.lineTo(L * 0.22, L); x.lineTo(-L * 0.22, L); x.closePath(); x.fill(); x.restore();
    }
    const fl = x.createLinearGradient(0, s.h * 0.75, 0, s.h); fl.addColorStop(0, rgba(s.pal.accent1, 0)); fl.addColorStop(1, rgba(s.pal.accent1, 0.18)); x.fillStyle = fl; x.fillRect(0, s.h * 0.75, s.w, s.h * 0.25);
  } },

  { id: 'medical', name: 'Medical monitor', group: 'Science & medical', draw(x, s, t){
    fill(x, s, s.pal.bg);
    const step = 26; x.strokeStyle = rgba(s.pal.accent2, 0.12); x.lineWidth = 1; x.beginPath();
    for (let gx = (t * 6) % step; gx < s.w; gx += step){ x.moveTo(gx, 0); x.lineTo(gx, s.h); }
    for (let gy = 0; gy < s.h; gy += step){ x.moveTo(0, gy); x.lineTo(s.w, gy); }
    x.stroke();
    // the heartbeat trace sweeps across the lower third, fading behind its head
    const base = s.h * 0.82, head = (t * 0.22 * (0.6 + s.intensity)) % 1.2, amp = s.h * 0.08;
    const beat = (u: number) => { const k = (u * 4) % 1; return k < 0.06 ? -k * 6 : k < 0.1 ? -0.36 + (k - 0.06) * 30 : k < 0.14 ? 0.84 - (k - 0.1) * 34 : k < 0.2 ? -0.5 + (k - 0.14) * 8.3 : 0; };
    x.lineWidth = 2.4; x.lineCap = 'round';
    for (let i = 0; i < 160; i++){
      const u0 = head - i * 0.006, u1 = u0 + 0.006; if (u0 < 0 || u0 > 1) continue;
      x.strokeStyle = rgba(s.pal.accent1, (1 - i / 160) * 0.9); x.beginPath(); x.moveTo(u0 * s.w, base - beat(u0) * amp); x.lineTo(u1 * s.w, base - beat(u1) * amp); x.stroke();
    }
    if (head <= 1) glowAt(x, head * s.w, base - beat(head) * amp, 18, s.pal.glow, 0.9);
    // faint medical crosses
    x.fillStyle = rgba(s.pal.accent2, 0.08 + s.intensity * 0.06);
    for (const [cx, cy] of [[0.1, 0.16], [0.9, 0.2], [0.86, 0.62]] as const){ const k = 14; x.fillRect(cx * s.w - k / 3, cy * s.h - k, k / 1.5, k * 2); x.fillRect(cx * s.w - k, cy * s.h - k / 3, k * 2, k / 1.5); }
  } },
  { id: 'xray', name: 'X-ray light box', group: 'Science & medical', init(s){ s.d.bones = parts(s, 7); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, '#06121d'], [1, '#02070c']]));
    glowAt(x, s.w * 0.5, s.h * 0.5, Math.max(s.w, s.h) * 0.6, s.pal.accent2, 0.18 + 0.1 * Math.sin(t * 2));
    x.strokeStyle = rgba(s.pal.accent2, 0.13 + s.intensity * 0.12); x.lineCap = 'round';
    for (const b of s.d.bones){ drawBone(x, b.x * s.w, b.y * s.h, 60 + b.z * 90, b.p, 10 + b.z * 8); }
    const sy = ((t * 0.12) % 1) * s.h; const g = x.createLinearGradient(0, sy - 40, 0, sy + 4); g.addColorStop(0, rgba(s.pal.glow, 0)); g.addColorStop(1, rgba(s.pal.glow, 0.28)); x.fillStyle = g; x.fillRect(0, sy - 40, s.w, 44);
  } },

  { id: 'military', name: 'Command radar', group: 'Military', init(s){
    const c = off(s.w, s.h), q = c.getContext('2d')!, r = seeded(s.seed);
    q.fillStyle = s.pal.bg; q.fillRect(0, 0, s.w, s.h);
    const tones = [mix(s.pal.bg, s.pal.accent2, 0.25), mix(s.pal.bg, '#000000', 0.25), mix(s.pal.bg, s.pal.accent1, 0.18)];
    for (let i = 0; i < 70; i++){ q.fillStyle = tones[i % 3]; q.globalAlpha = 0.55; q.beginPath(); const cx = r() * s.w, cy = r() * s.h, rr = 30 + r() * 90;
      for (let k = 0; k <= 9; k++){ const a = (k / 9) * TAU, d = rr * (0.6 + r() * 0.5); k ? q.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7) : q.moveTo(cx + d, cy); } q.fill(); }
    s.d.camo = c; s.d.blips = parts(s, 6);
  }, draw(x, s, t){
    x.drawImage(s.d.camo, 0, 0, s.w, s.h);
    fill(x, s, rgba('#000000', 0.35));
    const cx = s.w * 0.5, cy = s.h * 0.5, R = Math.min(s.w, s.h) * 0.46;
    x.strokeStyle = rgba(s.pal.accent2, 0.35); x.lineWidth = 1;
    for (let k = 1; k <= 4; k++){ x.beginPath(); x.arc(cx, cy, R * k / 4, 0, TAU); x.stroke(); }
    x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
    const a = t * 0.9 * (0.5 + s.intensity);
    for (let i = 0; i < 30; i++){ x.fillStyle = rgba(s.pal.accent2, 0.22 * (1 - i / 30)); x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a - (i + 1) * 0.025, a - i * 0.025); x.closePath(); x.fill(); }
    for (const b of s.d.blips){ const ba = b.p, br = R * (0.25 + b.z * 0.7), since = ((a - ba) % TAU + TAU) % TAU; const al = Math.max(0, 1 - since / 3);
      if (al > 0) glowAt(x, cx + Math.cos(ba) * br, cy + Math.sin(ba) * br, 10, s.pal.accent1, al); }
  } },

  { id: 'fire', name: 'Inferno', group: 'Elements', init(s){ s.d.e = parts(s, count(s, 90)); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, '#000000', 0.3)], [0.7, s.pal.bg], [1, mix(s.pal.bg, s.pal.accent1, 0.45)]]));
    for (let i = 0; i < 5; i++) glowAt(x, s.w * (0.1 + i * 0.2) + Math.sin(t * 1.3 + i) * 20, s.h * 1.02, s.h * (0.35 + 0.08 * Math.sin(t * 2.2 + i * 1.7)) * (0.6 + s.intensity), i % 2 ? s.pal.accent1 : s.pal.glow, 0.35);
    x.globalCompositeOperation = 'lighter';
    for (const p of s.d.e){ const y = 1 - wrap(p.y + t * 0.07 * p.v), xx = p.x + Math.sin(t * 1.5 * p.v + p.p) * 0.03 * (1 - y);
      const life = y; x.fillStyle = rgba(life > 0.5 ? s.pal.glow : s.pal.accent1, Math.min(1, (1 - Math.abs(life - 0.6)) * 0.9) * (0.4 + p.z * 0.6));
      const r = 0.8 + p.z * 2.4 * (1 - y * 0.6); x.beginPath(); x.arc(xx * s.w, y * s.h, r, 0, TAU); x.fill(); }
    x.globalCompositeOperation = 'source-over';
  } },
  { id: 'ice', name: 'Frozen', group: 'Elements', init(s){ s.d.f = parts(s, count(s, 110)); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, s.pal.accent2, 0.25)], [1, s.pal.bg]]));
    glowAt(x, s.w * 0.5, 0, s.w * 0.7, s.pal.glow, 0.18);
    for (const p of s.d.f){ const y = wrap(p.y + t * 0.03 * p.v), xx = wrap(p.x + Math.sin(t * 0.6 * p.v + p.p) * 0.02);
      x.fillStyle = rgba('#ffffff', 0.35 + p.z * 0.55); x.beginPath(); x.arc(xx * s.w, y * s.h, 0.6 + p.z * 2.4, 0, TAU); x.fill(); }
    // frosted corners
    for (const [cx, cy] of [[0, 0], [s.w, 0], [0, s.h], [s.w, s.h]]) glowAt(x, cx, cy, Math.min(s.w, s.h) * 0.45, '#ffffff', 0.14 + s.intensity * 0.12);
  } },
  { id: 'rain', name: 'Night rain', group: 'Elements', init(s){ s.d.r = parts(s, count(s, 160)); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, '#000000', 0.2)], [1, mix(s.pal.bg, s.pal.accent2, 0.15)]]));
    // a city glow behind the rain, and a rare lightning flash
    for (let i = 0; i < 6; i++) glowAt(x, s.w * (i + 0.5) / 6, s.h * 0.95, 120, i % 2 ? s.pal.accent1 : s.pal.glow, 0.12);
    const flash = Math.max(0, Math.sin(t * 0.7) > 0.995 ? 1 : 0, Math.pow(Math.max(0, Math.sin(t * 0.37 + 1)), 400));
    if (flash > 0.01) fill(x, s, rgba('#dfe8ff', flash * 0.35 * s.intensity));
    x.lineCap = 'round';
    for (const p of s.d.r){ const sp = 0.9 + p.v, y = wrap(p.y + t * sp), xx = wrap(p.x - y * 0.08);
      x.strokeStyle = rgba(s.pal.text, 0.12 + p.z * 0.3); x.lineWidth = 0.6 + p.z; x.beginPath(); x.moveTo(xx * s.w, y * s.h); x.lineTo(xx * s.w - 3, y * s.h + 14 + p.z * 16); x.stroke(); }
    fill(x, s, vgrad(x, s, [[0.6, rgba(s.pal.text, 0)], [1, rgba(s.pal.text, 0.08)]]));
  } },
  { id: 'storm', name: 'Thunderstorm', group: 'Elements', init(s){ s.d.c = parts(s, 12); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, '#000000', 0.3)], [1, s.pal.bg]]));
    for (const c of s.d.c){ glowAt(x, wrap(c.x + t * 0.01 * c.v) * s.w * 1.2 - s.w * 0.1, c.y * s.h * 0.45, 140 + c.z * 160, s.pal.accent2, 0.22); }
    const k = (t * 0.45) % 3.2, on = k < 0.12 || (k > 0.2 && k < 0.26);
    if (on && s.intensity > 0.05){
      fill(x, s, rgba(s.pal.glow, 0.18 * s.intensity));
      const r = seeded(Math.floor(t * 0.45 / 3.2) + s.seed); let bx = s.w * (0.2 + r() * 0.6), by = 0;
      x.strokeStyle = rgba('#ffffff', 0.9); x.lineWidth = 2; x.shadowColor = s.pal.glow; x.shadowBlur = 18; x.beginPath(); x.moveTo(bx, by);
      while (by < s.h * 0.8){ bx += (r() - 0.5) * 60; by += 20 + r() * 40; x.lineTo(bx, by); } x.stroke(); x.shadowBlur = 0;
    }
  } },

  { id: 'space', name: 'Deep space', group: 'Space', init(s){ s.d.st = parts(s, count(s, 260)); s.d.n = parts(s, 5); }, draw(x, s, t){
    fill(x, s, s.pal.bg);
    for (const n of s.d.n) glowAt(x, n.x * s.w, n.y * s.h, Math.max(s.w, s.h) * (0.25 + n.z * 0.3), n.p > 3 ? s.pal.accent1 : s.pal.accent2, 0.1 + s.intensity * 0.08);
    for (const p of s.d.st){ const tw = 0.5 + 0.5 * Math.sin(t * (1 + p.v * 2) + p.p), xx = wrap(p.x - t * 0.004 * p.z);
      x.fillStyle = rgba('#ffffff', (0.25 + p.z * 0.75) * (0.4 + tw * 0.6)); x.fillRect(xx * s.w, p.y * s.h, p.z > 0.92 ? 2.2 : 1.2, p.z > 0.92 ? 2.2 : 1.2); }
    const k = (t * 0.18) % 1; if (k < 0.12){ const q = k / 0.12, sx = s.w * (0.9 - q * 0.6), sy = s.h * (0.1 + q * 0.3);
      const g = x.createLinearGradient(sx, sy, sx + 120, sy - 60); g.addColorStop(0, rgba('#ffffff', 0.9 * (1 - q))); g.addColorStop(1, rgba('#ffffff', 0));
      x.strokeStyle = g; x.lineWidth = 2; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + 120, sy - 60); x.stroke(); }
  } },
  { id: 'synthwave', name: 'Neon horizon', group: 'Future & tech', draw(x, s, t){
    const hz = s.h * 0.58;
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, '#000000', 0.2)], [0.58, mix(s.pal.bg, s.pal.accent1, 0.3)], [0.58, mix(s.pal.bg, '#000000', 0.4)], [1, s.pal.bg]]));
    // the striped sun
    const R = Math.min(s.w, s.h) * 0.22, cx = s.w / 2, cy = hz - R * 0.35;
    const sg = x.createLinearGradient(0, cy - R, 0, cy + R); sg.addColorStop(0, s.pal.glow); sg.addColorStop(1, s.pal.accent1);
    x.save(); x.beginPath(); x.rect(0, 0, s.w, hz); x.clip(); x.fillStyle = sg; x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fill();
    x.fillStyle = mix(s.pal.bg, s.pal.accent1, 0.3);
    for (let i = 0; i < 7; i++){ const yy = cy + R * (0.1 + i * 0.13), hh = 2 + i * 1.6; x.fillRect(cx - R, yy, R * 2, hh); } x.restore();
    // the moving perspective grid
    x.strokeStyle = rgba(s.pal.accent2, 0.75); x.lineWidth = 1.2; x.shadowColor = s.pal.accent2; x.shadowBlur = 8 * s.intensity; x.beginPath();
    for (let i = -14; i <= 14; i++){ x.moveTo(cx + i * 8, hz); x.lineTo(cx + i * s.w * 0.16, s.h); }
    const sp = (t * 0.35 * (0.4 + s.intensity)) % 1;
    for (let k = 0; k < 14; k++){ const z = (k + sp) / 14, y = hz + (s.h - hz) * z * z; x.moveTo(0, y); x.lineTo(s.w, y); }
    x.stroke(); x.shadowBlur = 0;
  } },
  { id: 'hud', name: 'Holo HUD', group: 'Future & tech', draw(x, s, t){
    fill(x, s, s.pal.bg); glowAt(x, s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.6, s.pal.accent2, 0.12);
    const cx = s.w / 2, cy = s.h / 2, R = Math.min(s.w, s.h) * 0.44;
    x.strokeStyle = rgba(s.pal.accent2, 0.45); x.lineWidth = 1.2;
    for (let k = 0; k < 3; k++){ const a0 = t * (k % 2 ? -0.3 : 0.2) * (0.5 + s.intensity) + k; x.setLineDash([R * 0.3, R * 0.12 + k * 8]); x.beginPath(); x.arc(cx, cy, R * (0.72 + k * 0.14), a0, a0 + TAU); x.stroke(); }
    x.setLineDash([]);
    x.strokeStyle = rgba(s.pal.accent2, 0.12); x.beginPath(); for (let gx = 0; gx < s.w; gx += 40){ x.moveTo(gx, 0); x.lineTo(gx, s.h); } for (let gy = 0; gy < s.h; gy += 40){ x.moveTo(0, gy); x.lineTo(s.w, gy); } x.stroke();
    x.fillStyle = rgba(s.pal.accent2, 0.6); x.font = '11px ui-monospace, monospace';
    for (let i = 0; i < 6; i++) x.fillText(((Math.sin(t * 0.7 + i) * 9999) | 0).toString(16).toUpperCase().padStart(6, '0') + ' · ' + (i * 17 + ((t * 10) | 0) % 90), 18, 28 + i * 16);
  } },
  { id: 'matrix', name: 'Code rain', group: 'Future & tech', init(s){ const cols = Math.ceil(s.w / 16); s.d.c = Array.from({ length: cols }, () => ({ y: s.r(), v: 0.15 + s.r() * 0.35, l: 8 + Math.floor(s.r() * 20) })); }, draw(x, s, t){
    fill(x, s, s.pal.bg); x.font = '14px ui-monospace, monospace'; x.textAlign = 'center';
    const glyphs = 'アイウエオカキクケコサシスセソ0123456789ABCDEF<>/{}=+*';
    s.d.c.forEach((c: { y: number; v: number; l: number }, i: number) => {
      if ((i * 7919) % 10 > 2 + s.intensity * 8) return;
      const head = wrap(c.y + t * c.v * 0.5) * (s.h + c.l * 16);
      for (let k = 0; k < c.l; k++){ const y = head - k * 16; if (y < -16 || y > s.h + 16) continue;
        const g = glyphs[(Math.floor(t * 8) + i * 13 + k * 7) % glyphs.length];
        x.fillStyle = k === 0 ? s.pal.glow : rgba(s.pal.accent2, (1 - k / c.l) * 0.8); x.fillText(g, i * 16 + 8, y); }
    });
    x.textAlign = 'start';
  } },

  { id: 'underground', name: 'Underground cave', group: 'Earth', init(s){
    const c = off(s.w, s.h), q = c.getContext('2d')!, r = seeded(s.seed);
    for (let y = 0; y < s.h; y += 6){ const k = (Math.sin(y * 0.02 + r() * 0.5) + 1) / 2; q.fillStyle = mix(mix(s.pal.bg, s.pal.accent2, 0.22 * k), '#000000', 0.2 + 0.3 * (y / s.h)); q.fillRect(0, y, s.w, 6); }
    q.strokeStyle = rgba('#000000', 0.45); q.lineWidth = 1.2;
    for (let i = 0; i < 26; i++){ let cx = r() * s.w, cy = r() * s.h; q.beginPath(); q.moveTo(cx, cy); for (let k = 0; k < 7; k++){ cx += (r() - 0.5) * 50; cy += r() * 26; q.lineTo(cx, cy); } q.stroke(); }
    for (let i = 0; i < 40; i++){ q.fillStyle = rgba(r() > 0.5 ? s.pal.accent1 : '#ffffff', 0.08 + r() * 0.2); q.beginPath(); q.arc(r() * s.w, r() * s.h, 1 + r() * 3, 0, TAU); q.fill(); }
    s.d.rock = c; s.d.dust = parts(s, count(s, 70));
  }, draw(x, s, t){
    x.drawImage(s.d.rock, 0, 0, s.w, s.h);
    const lx = s.w * (0.5 + Math.sin(t * 0.3) * 0.12), ly = s.h * (0.5 + Math.cos(t * 0.23) * 0.06);
    glowAt(x, lx, ly, Math.max(s.w, s.h) * 0.42 * (1 + Math.sin(t * 7) * 0.015), s.pal.accent1, 0.32 + s.intensity * 0.12);
    const v = x.createRadialGradient(lx, ly, 10, lx, ly, Math.max(s.w, s.h) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.85)'); x.fillStyle = v; x.fillRect(0, 0, s.w, s.h);
    for (const p of s.d.dust){ const y = wrap(p.y + t * 0.012 * p.v); x.fillStyle = rgba(s.pal.glow, 0.15 + p.z * 0.35); x.fillRect(wrap(p.x + Math.sin(t + p.p) * 0.004) * s.w, y * s.h, 1.4, 1.4); }
  } },
  { id: 'crypt', name: 'Crypt fog', group: 'Dark', init(s){ s.d.b = parts(s, 9); s.d.f = parts(s, 8); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, '#000000', 0.5)], [1, s.pal.bg]]));
    x.strokeStyle = rgba(s.pal.text, 0.08 + s.intensity * 0.08); x.lineCap = 'round';
    for (const b of s.d.b) drawBone(x, b.x * s.w, s.h * (0.7 + b.y * 0.3), 50 + b.z * 70, b.p, 8 + b.z * 6);
    for (const f of s.d.f){ glowAt(x, wrap(f.x + t * 0.015 * f.v) * s.w * 1.4 - s.w * 0.2, s.h * (0.55 + f.y * 0.45), 160 + f.z * 140, s.pal.accent2, 0.1 + s.intensity * 0.08); }
    glowAt(x, s.w * 0.5, s.h * 0.4, s.w * 0.4, s.pal.accent1, 0.08 + 0.04 * Math.sin(t * 1.7));
  } },

  { id: 'ancient', name: 'Ancient parchment', group: 'Classic', init(s){
    const c = off(s.w, s.h), q = c.getContext('2d')!, r = seeded(s.seed);
    q.fillStyle = s.pal.bg; q.fillRect(0, 0, s.w, s.h);
    for (let i = 0; i < 90; i++){ const rr = 20 + r() * 120; const g = q.createRadialGradient(0, 0, 0, 0, 0, rr); g.addColorStop(0, rgba(s.pal.stroke, 0.05 + r() * 0.05)); g.addColorStop(1, rgba(s.pal.stroke, 0));
      q.save(); q.translate(r() * s.w, r() * s.h); q.fillStyle = g; q.fillRect(-rr, -rr, rr * 2, rr * 2); q.restore(); }
    const v = q.createRadialGradient(s.w / 2, s.h / 2, Math.min(s.w, s.h) * 0.3, s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.75); v.addColorStop(0, rgba(s.pal.stroke, 0)); v.addColorStop(1, rgba(s.pal.stroke, 0.45)); q.fillStyle = v; q.fillRect(0, 0, s.w, s.h);
    // a Greek key border
    const m = 22, u = 8; q.strokeStyle = rgba(s.pal.accent1, 0.7); q.lineWidth = 2;
    const key = (x0: number, y0: number, horiz: boolean, n: number) => { q.beginPath(); for (let i = 0; i < n; i++){ const o = i * u * 4; const P = (a: number, b: number) => horiz ? [x0 + o + a * u, y0 + b * u] : [x0 + b * u, y0 + o + a * u];
      const pts = [P(0, 2), P(0, 0), P(3, 0), P(3, 2), P(1, 2), P(1, 1), P(2, 1)]; pts.forEach(([a, b], k) => k ? q.lineTo(a, b) : q.moveTo(a, b)); } q.stroke(); };
    key(m, m, true, Math.floor((s.w - m * 2) / (u * 4))); key(m, s.h - m - u * 2, true, Math.floor((s.w - m * 2) / (u * 4)));
    s.d.p = c;
  }, draw(x, s, t){
    x.drawImage(s.d.p, 0, 0, s.w, s.h);
    glowAt(x, s.w * 0.5, s.h * 0.45, Math.max(s.w, s.h) * 0.45, s.pal.glow, 0.1 + s.intensity * 0.1 + Math.sin(t * 0.8) * 0.02);
  } },
  { id: 'temple', name: 'Golden temple', group: 'Classic', draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, '#000000', 0.2)], [1, mix(s.pal.bg, s.pal.accent1, 0.2)]]));
    const cx = s.w / 2, cy = s.h * 0.45;
    for (let i = 0; i < 18; i++){ const a = (i / 18) * TAU + t * 0.04; x.fillStyle = rgba(s.pal.glow, 0.05 + s.intensity * 0.05); x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, Math.max(s.w, s.h), a, a + 0.09); x.closePath(); x.fill(); }
    x.fillStyle = rgba(s.pal.stroke, 0.55); const n = 6, cw = s.w / (n * 2.2);
    for (let i = 0; i < n; i++){ const px = (i + 0.5) * s.w / n - cw / 2; x.fillRect(px, s.h * 0.62, cw, s.h * 0.38); x.fillRect(px - 6, s.h * 0.6, cw + 12, 10); }
    x.fillRect(0, s.h * 0.56, s.w, 14);
  } },

  { id: 'ocean', name: 'Under the sea', group: 'Nature', init(s){ s.d.b = parts(s, count(s, 40)); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, s.pal.accent2, 0.35)], [1, mix(s.pal.bg, '#000000', 0.4)]]));
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++){ const a = -0.25 + i * 0.08 + Math.sin(t * 0.3 + i) * 0.03; x.save(); x.translate(s.w * (0.15 + i * 0.12), -10); x.rotate(a);
      const g = x.createLinearGradient(0, 0, 0, s.h); g.addColorStop(0, rgba(s.pal.glow, 0.12 * (0.4 + s.intensity))); g.addColorStop(1, rgba(s.pal.glow, 0)); x.fillStyle = g; x.fillRect(-14, 0, 28 + i * 4, s.h); x.restore(); }
    x.globalCompositeOperation = 'source-over';
    for (const b of s.d.b){ const y = 1 - wrap(b.y + t * 0.05 * b.v), xx = b.x + Math.sin(t * 2 * b.v + b.p) * 0.01;
      x.strokeStyle = rgba('#ffffff', 0.3 + b.z * 0.4); x.lineWidth = 1; x.beginPath(); x.arc(xx * s.w, y * s.h, 2 + b.z * 6, 0, TAU); x.stroke(); }
  } },
  { id: 'forest', name: 'Firefly forest', group: 'Nature', init(s){ s.d.f = parts(s, count(s, 50)); s.d.tr = parts(s, 16); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, mix(s.pal.bg, s.pal.accent2, 0.18)], [1, mix(s.pal.bg, '#000000', 0.35)]]));
    for (const tr of s.d.tr){ x.fillStyle = rgba('#000000', 0.18 + tr.z * 0.3); const w = 10 + tr.z * 30; x.fillRect(tr.x * s.w, 0, w, s.h); }
    x.globalCompositeOperation = 'lighter';
    for (const f of s.d.f){ const xx = wrap(f.x + Math.sin(t * 0.3 * f.v + f.p) * 0.05), yy = wrap(f.y + Math.cos(t * 0.25 * f.v + f.p) * 0.05), a = Math.max(0, Math.sin(t * 1.4 * f.v + f.p));
      glowAt(x, xx * s.w, yy * s.h, 10 + f.z * 12, s.pal.glow, a * (0.5 + s.intensity * 0.5)); }
    x.globalCompositeOperation = 'source-over';
  } },
  { id: 'sakura', name: 'Petal fall', group: 'Nature', init(s){ s.d.p = parts(s, count(s, 60)); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, s.pal.bg], [1, mix(s.pal.bg, s.pal.accent1, 0.18)]]));
    glowAt(x, s.w * 0.8, s.h * 0.15, s.w * 0.5, s.pal.glow, 0.25);
    for (const p of s.d.p){ const y = wrap(p.y + t * 0.04 * p.v), xx = wrap(p.x + t * 0.015 + Math.sin(t * p.v + p.p) * 0.03), a = t * p.v * 2 + p.p;
      x.save(); x.translate(xx * s.w, y * s.h); x.rotate(a); x.scale(1, 0.4 + 0.6 * Math.abs(Math.sin(a))); x.fillStyle = rgba(s.pal.accent1, 0.5 + p.z * 0.4);
      x.beginPath(); x.ellipse(0, 0, 4 + p.z * 5, 2.5 + p.z * 3, 0, 0, TAU); x.fill(); x.restore(); }
  } },

  { id: 'party', name: 'Party lights', group: 'Celebration', init(s){ s.d.b = parts(s, count(s, 40)); }, draw(x, s, t){
    fill(x, s, s.pal.bg);
    const cols = [s.pal.accent1, s.pal.accent2, s.pal.glow];
    for (const [i, b] of s.d.b.entries()){ const xx = wrap(b.x + Math.sin(t * 0.2 * b.v + b.p) * 0.03), yy = wrap(b.y - t * 0.01 * b.v); const a = 0.12 + 0.12 * Math.sin(t * b.v + b.p);
      x.fillStyle = rgba(cols[i % 3], a * (0.5 + s.intensity)); x.beginPath(); x.arc(xx * s.w, yy * s.h, 14 + b.z * 40, 0, TAU); x.fill(); }
  } },
  { id: 'hearts', name: 'Floating hearts', group: 'Celebration', init(s){ s.d.h = parts(s, count(s, 28)); }, draw(x, s, t){
    fill(x, s, vgrad(x, s, [[0, s.pal.bg], [1, mix(s.pal.bg, s.pal.accent1, 0.2)]]));
    for (const h of s.d.h){ const y = 1.1 - wrap(h.y + t * 0.035 * h.v) * 1.2, xx = h.x + Math.sin(t * h.v + h.p) * 0.02, k = 5 + h.z * 12;
      x.fillStyle = rgba(h.z > 0.5 ? s.pal.accent1 : s.pal.glow, 0.25 + h.z * 0.35); x.save(); x.translate(xx * s.w, y * s.h); x.rotate(Math.sin(t + h.p) * 0.3); heart(x, k); x.fill(); x.restore(); }
  } },
  { id: 'noir', name: 'Film noir', group: 'Cinematic', init(s){ s.d.sm = parts(s, 6); }, draw(x, s, t){
    fill(x, s, mix(s.pal.bg, '#000000', 0.2));
    // light through venetian blinds
    x.save(); x.translate(s.w * 0.6, -s.h * 0.2); x.rotate(0.45);
    for (let i = 0; i < 9; i++){ x.fillStyle = rgba(s.pal.glow, 0.07 + s.intensity * 0.06); x.fillRect(-s.w * 0.2, i * 46, s.w * 0.9, 24); }
    x.restore();
    for (const m of s.d.sm) glowAt(x, wrap(m.x + t * 0.01 * m.v) * s.w, s.h * (0.3 + m.y * 0.6) + Math.sin(t * 0.4 + m.p) * 20, 120 + m.z * 120, s.pal.text, 0.05);
  } },
  { id: 'arcade', name: 'Arcade', group: 'Future & tech', init(s){ s.d.st = parts(s, count(s, 70)); }, draw(x, s, t){
    fill(x, s, s.pal.bg);
    for (const p of s.d.st){ const y = wrap(p.y + t * 0.08 * (0.3 + p.z)); x.fillStyle = rgba(p.z > 0.7 ? s.pal.glow : s.pal.text, 0.3 + p.z * 0.6); const k = p.z > 0.85 ? 4 : 2; x.fillRect(Math.round(p.x * s.w / 4) * 4, Math.round(y * s.h / 4) * 4, k, k); }
    x.fillStyle = rgba(s.pal.accent1, 0.85); const by = s.h - 26;
    for (let i = 0; i < s.w; i += 8) x.fillRect(i, by + ((i / 8) % 2 ? 0 : 4), 8, 26);
  } },
  { id: 'aurora', name: 'Aurora', group: 'Nature', draw(x, s, t){ fill(x, s, s.pal.bg); glowAt(x, s.w * (0.3 + Math.sin(t * 0.13) * 0.08), s.h * 0.35, Math.max(s.w, s.h) * 0.55, s.pal.accent1, 0.25); glowAt(x, s.w * 0.7, s.h * 0.7, Math.max(s.w, s.h) * 0.5, s.pal.accent2, 0.2); } },
  { id: 'clouds', name: 'Sunset clouds', group: 'Nature', draw(x, s, t){ fill(x, s, s.pal.bg); glowAt(x, s.w * (0.3 + Math.sin(t * 0.13) * 0.08), s.h * 0.35, Math.max(s.w, s.h) * 0.55, s.pal.accent1, 0.25); glowAt(x, s.w * 0.7, s.h * 0.7, Math.max(s.w, s.h) * 0.5, s.pal.accent2, 0.2); } },
  { id: 'lava', name: 'Molten lava', group: 'Elements', draw(x, s, t){ fill(x, s, s.pal.bg); glowAt(x, s.w * (0.3 + Math.sin(t * 0.13) * 0.08), s.h * 0.35, Math.max(s.w, s.h) * 0.55, s.pal.accent1, 0.25); glowAt(x, s.w * 0.7, s.h * 0.7, Math.max(s.w, s.h) * 0.5, s.pal.accent2, 0.2); } },
  { id: 'smoke', name: 'Coloured smoke', group: 'Simple', draw(x, s, t){ fill(x, s, s.pal.bg); glowAt(x, s.w * (0.3 + Math.sin(t * 0.13) * 0.08), s.h * 0.35, Math.max(s.w, s.h) * 0.55, s.pal.accent1, 0.25); glowAt(x, s.w * 0.7, s.h * 0.7, Math.max(s.w, s.h) * 0.5, s.pal.accent2, 0.2); } },
  { id: 'golddust', name: 'Gold dust', group: 'Celebration', draw(x, s, t){ fill(x, s, s.pal.bg); glowAt(x, s.w * (0.3 + Math.sin(t * 0.13) * 0.08), s.h * 0.35, Math.max(s.w, s.h) * 0.55, s.pal.accent1, 0.25); glowAt(x, s.w * 0.7, s.h * 0.7, Math.max(s.w, s.h) * 0.5, s.pal.accent2, 0.2); } }
];

function heart(x: CanvasRenderingContext2D, k: number){ x.beginPath(); x.moveTo(0, k * 0.35); x.bezierCurveTo(-k * 1.1, -k * 0.4, -k * 0.45, -k * 1.1, 0, -k * 0.45); x.bezierCurveTo(k * 0.45, -k * 1.1, k * 1.1, -k * 0.4, 0, k * 0.35); x.closePath(); }
function drawBone(x: CanvasRenderingContext2D, cx: number, cy: number, len: number, a: number, w: number){
  x.save(); x.translate(cx, cy); x.rotate(a); x.lineWidth = w * 0.7; x.beginPath(); x.moveTo(-len / 2, 0); x.lineTo(len / 2, 0); x.stroke();
  x.lineWidth = w * 0.5; for (const sx of [-1, 1]) for (const sy of [-1, 1]){ x.beginPath(); x.arc(sx * len / 2, sy * w * 0.35, w * 0.32, 0, TAU); x.stroke(); }
  x.restore();
}

const rgb = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const colsOf = (p: Palette) => ({ bg: rgb(p.bg), text: rgb(p.text), a1: rgb(p.accent1), a2: rgb(p.accent2), glow: rgb(p.glow) });
let exportPainter: ShaderPainter | null = null;

/** the scene's layer, behind the words: realistic scenes run on the GPU (shaders.ts), the rest (and every scene on
 *  a device without WebGL) on a 2D canvas. The GPU resolution adapts: if frames get slow it renders a little smaller
 *  (backgrounds are soft, so it can't be seen) and creeps back up when there is headroom. */
export class SceneRunner {
  canvas: HTMLCanvasElement; gl: HTMLCanvasElement; private x: CanvasRenderingContext2D; scene: Scene = SCENES[0]; state: SceneState | null = null;
  speed = 1; private raf = 0; private t0 = performance.now(); private key = ''; reduced = false;
  flat = false;   // the 2D look: always the drawn (canvas) version of a scene
  private painter: ShaderPainter | null = null; private useGL = false; private quality = 1; private last = 0; private slow = 0;
  constructor(host: HTMLElement){
    this.canvas = document.createElement('canvas'); this.canvas.className = 'fx-scene'; this.canvas.setAttribute('aria-hidden', 'true');
    this.gl = document.createElement('canvas'); this.gl.className = 'fx-scene fx-scene-gl'; this.gl.setAttribute('aria-hidden', 'true'); this.gl.hidden = true;
    host.prepend(this.canvas, this.gl); this.x = this.canvas.getContext('2d')!;
    this.gl.addEventListener('webglcontextlost', e => { e.preventDefault(); this.painter = null; this.useGL = false; this.gl.hidden = true; this.canvas.hidden = false; this.key = ''; });
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.quality = coarse ? 0.7 : 1;   // phones and tablets start a little lighter
  }
  private gpu(){ if (!this.painter){ try { this.painter = new ShaderPainter(this.gl); } catch { this.painter = null; } } return this.painter && this.painter.gl ? this.painter : null; }
  set(id: string, pal: Palette, intensity: number, speed: number, seed: number){
    const r = this.canvas.parentElement!.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    this.scene = SCENES.find(s => s.id === id) || SCENES[0]; this.speed = speed;
    this.useGL = !this.flat && !!fragmentFor(this.scene.id) && !!this.gpu()?.supports(this.scene.id);
    this.gl.hidden = !this.useGL; this.canvas.hidden = this.useGL;
    const key = [this.scene.id, this.useGL, pal.bg, pal.text, pal.accent1, pal.accent2, pal.glow, Math.round(w), Math.round(h), seed, intensity.toFixed(2)].join('|');
    if (key !== this.key){
      this.key = key;
      const dpr = Math.min(2, window.devicePixelRatio || 1); this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.state = { w, h, pal, intensity, seed, r: seeded(seed ^ 0x5eed), d: {} };
      if (!this.useGL){ this.scene.init?.(this.state); this.state.d.inited2d = true; }
      else this.state.d.glReady = true;
    } else if (this.state) this.state.intensity = intensity;
    this.start();
  }
  /** the scene's clock in seconds (scaled by its speed) */
  time(){ return ((performance.now() - this.t0) / 1000) * this.speed; }
  /** draws a frame of the current scene into any context sized in CSS pixels (exports use it, at any resolution) */
  paint(x: CanvasRenderingContext2D, t = this.time()){
    const st = this.state; if (!st) return;
    if (this.useGL && fragmentFor(this.scene.id)){
      const k = Math.max(1, x.getTransform().a);
      exportPainter = exportPainter || new ShaderPainter(document.createElement('canvas'), true);
      if (exportPainter.gl && exportPainter.draw(this.scene.id, Math.round(st.w * k), Math.round(st.h * k), t, st.intensity, st.seed, colsOf(st.pal))){ x.drawImage(exportPainter.canvas, 0, 0, st.w, st.h); return; }
    }
    if (!st.d.inited2d){ st.d.inited2d = true; this.scene.init?.(st); }
    this.scene.draw(x, st, t);
  }
  private frame = (now: number) => {
    this.raf = 0; const st = this.state; if (!st || document.hidden) return;
    if (this.useGL && this.painter){
      // adapt the resolution to how fast frames actually arrive
      if (this.last){ const dt = now - this.last; if (dt > 26){ if (++this.slow > 20 && this.quality > 0.45){ this.quality = Math.max(0.45, this.quality - 0.1); this.slow = 0; } } else { this.slow = Math.max(0, this.slow - 1); if (dt < 18 && this.quality < 1) this.quality = Math.min(1, this.quality + 0.002); } }
      this.last = now;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1) * this.quality;
      this.painter.draw(this.scene.id, Math.max(2, Math.round(st.w * dpr)), Math.max(2, Math.round(st.h * dpr)), this.time(), st.intensity, st.seed, colsOf(st.pal));
    } else {
      if (!st.d.inited2d){ st.d.inited2d = true; if (st.d.glReady) this.scene.init?.(st); }
      const dpr = this.canvas.width / st.w; this.x.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.scene.draw(this.x, st, this.time());
    }
    if (!this.reduced && this.scene.id !== 'plain') this.raf = requestAnimationFrame(this.frame);
  };
  start(){ if (!this.raf){ this.last = 0; this.raf = requestAnimationFrame(this.frame); } }
  stop(){ cancelAnimationFrame(this.raf); this.raf = 0; }
  destroy(){ this.stop(); this.canvas.remove(); this.gl.remove(); this.painter?.gl?.getExtension('WEBGL_lose_context')?.loseContext(); this.painter = null; }
}
