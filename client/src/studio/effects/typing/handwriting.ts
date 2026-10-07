// Handwriting sync: each letter is written by a pen that travels across it (following the letter's own outline),
// in reading order, like the studio's hand-drawn strokes being replayed. The pen tip is exposed (ctx.penAt), so
// decorations can follow it.
import { between } from '../rng';
import type { Effect, Point } from '../types';

interface Seg { t0: number; t1: number; pts: Point[] }
let segs: Seg[] = [];

export const handwriting: Effect = {
  id: 'handwriting', name: 'Handwriting sync', description: 'A pen writes each letter in order; decorations can follow its tip.', duration: 3,
  params: [],
  init(ctx){
    segs = [];
    for (const c of ctx.chars){ c.el.style.opacity = '1'; c.el.style.clipPath = 'inset(-25% 100% -25% -12%)'; }
    ctx.penAt = (time: number) => {
      const s = segs.find(g => time >= g.t0 && time <= g.t1); if (!s) return null;
      const k = (time - s.t0) / Math.max(1e-6, s.t1 - s.t0) * (s.pts.length - 1), i = Math.floor(k), f = k - i;
      const a = s.pts[i], b = s.pts[Math.min(s.pts.length - 1, i + 1)];
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    };
  },
  play(tl, ctx){
    const r = ctx.rng, sp = Math.max(0.25, ctx.speed), sr = ctx.stage.getBoundingClientRect();
    const pen = ctx.stage.querySelector<HTMLElement>('.fx-pen');
    let t = 0.3;
    tl.set(ctx.chars.map(c => c.el), { clipPath: 'inset(-25% 100% -25% -12%)' }, 0);
    if (pen) tl.set(pen, { opacity: 0 }, 0);
    ctx.chars.forEach((c, i) => {
      const dur = between(r, 0.16, 0.26) * Math.max(0.6, Math.min(1.6, c.rect.width / 40)) / sp;
      // the pen's path over this letter: left to right, rising and falling along its outline
      const x0 = c.rect.left - sr.left, x1 = c.rect.right - sr.left, ol = c.anchors.outline, pts: Point[] = [];
      for (let k = 0; k <= 6; k++){
        const x = x0 + (x1 - x0) * (k / 6);
        const near = ol.filter(p => Math.abs(p.x - x) < (x1 - x0) / 5);
        const ys = near.length ? near.map(p => p.y) : [c.anchors.center.y];
        pts.push({ x, y: k % 2 ? Math.min(...ys) : Math.max(...ys) });
      }
      segs.push({ t0: t, t1: t + dur, pts });
      tl.fromTo(c.el, { clipPath: 'inset(-25% 100% -25% -12%)' }, { clipPath: 'inset(-25% 0% -25% -12%)', duration: dur, ease: 'none' }, t);
      if (pen) tl.to(pen, { opacity: 1, keyframes: pts.map(p => ({ x: p.x, y: p.y, duration: dur / pts.length })), ease: 'none' }, t);
      ctx.revealAt(i, t + dur * 0.55);
      t += dur;
      const next = ctx.chars[i + 1];
      if (next && (next.word !== c.word || next.line !== c.line)) t += between(r, 0.12, 0.24) / sp;   // the pen lifts between words
    });
    if (pen) tl.to(pen, { opacity: 0, duration: 0.3 }, t + 0.1);
    return t;
  },
  reset(ctx){ segs = []; ctx.penAt = undefined; for (const c of ctx.chars) c.el.style.clipPath = ''; },
};
