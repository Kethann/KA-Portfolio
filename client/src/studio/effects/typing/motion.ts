// More ways for the words to arrive. Each one sets every letter's starting look at time 0 (so the loop restarts
// cleanly), animates letter by letter in reading order, and reports each letter's moment (revealAt) so decorations
// can grow from it. They all end on the plain, readable letters, which is the frame stills are exported from.
import { gsap } from 'gsap';
import { between } from '../rng';
import type { CharInfo, Effect, EffectContext, Timeline } from '../types';

type Step = (tl: Timeline, c: CharInfo, at: number, ctx: EffectContext, i: number) => number;   // returns the moment the letter counts as shown

/** builds a letter-by-letter effect: `from` is each letter's hidden look, `step` adds its entrance */
function letterwise(id: string, name: string, description: string, gap: [number, number], from: gsap.TweenVars, step: Step, extra?: Partial<Effect>): Effect {
  return {
    id, name, description, duration: 2.4, params: [],
    init(ctx){ for (const c of ctx.chars) gsap.set(c.el, from); },
    play(tl, ctx){
      const r = ctx.rng, sp = Math.max(0.25, ctx.speed);
      tl.set(ctx.chars.map(c => c.el), from, 0);
      let t = 0.3, end = 0;
      ctx.chars.forEach((c, i) => {
        const shown = step(tl, c, t, ctx, i);
        ctx.revealAt(i, shown); end = Math.max(end, shown + 0.6 / sp);
        const next = ctx.chars[i + 1];
        t += between(r, gap[0], gap[1]) / sp;
        if (next && next.line !== c.line) t += 0.18 / sp;
      });
      return end;
    },
    reset(ctx){ for (const c of ctx.chars) gsap.set(c.el, { clearProps: 'opacity,transform,filter,textShadow,letterSpacing,width,textAlign' }); },
    ...extra,
  };
}
const sp = (ctx: EffectContext) => Math.max(0.25, ctx.speed);

const GLYPHS = '!<>-_\\/[]{}=+*^?#%&@ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
export const decode = letterwise('decode', 'Decode', 'Letters scramble through random symbols before locking in.', [0.035, 0.07], { opacity: 0 },
  (tl, c, at, ctx) => {
    const real = c.char, d = 0.55 / sp(ctx), r = ctx.rng, seq = Array.from({ length: 7 }, () => GLYPHS[Math.floor(r() * GLYPHS.length)]);
    c.el.style.width = c.rect.width + 'px'; c.el.style.textAlign = 'center';   // a scrambled glyph never shifts the line
    const own = c.el.style.color;   // a gradient / outline fill keeps its transparent colour
    tl.set(c.el, { opacity: 1, color: own === 'transparent' && !c.el.querySelector('canvas.fx-mat') ? own : ctx.palette.accent1 }, at);
    const node = Array.from(c.el.childNodes).find(n => n.nodeType === 3) as Text | undefined, art = c.el.querySelector<HTMLElement>('canvas.fx-mat');
    const show = (g: string) => { if (node) node.nodeValue = g; else c.el.textContent = g; };
    if (art){ tl.set(art, { visibility: 'hidden' }, at); tl.set(c.el, { color: ctx.palette.accent1 }, at); }
    seq.forEach((g, k) => tl.call(show, [g], at + (k / seq.length) * d));
    tl.call(show, [real], at + d);
    tl.set(c.el, { color: own }, at + d);
    if (art) tl.set(art, { visibility: 'visible' }, at + d);
    tl.call(show, [real], 0);
    return at + d;
  }, { description: 'Letters scramble through random symbols before locking in.' });

export const blurIn = letterwise('blur-in', 'Cinematic blur', 'Each letter drifts out of a soft blur, like a title card.', [0.05, 0.08], { opacity: 0, filter: 'blur(14px)', scale: 1.25 },
  (tl, c, at, ctx) => { tl.to(c.el, { opacity: 1, filter: 'blur(0px)', scale: 1, duration: 1.1 / sp(ctx), ease: 'power3.out' }, at); return at + 0.35 / sp(ctx); });

export const rise = letterwise('rise', 'Credits rise', 'Letters rise into place from below, smooth and confident.', [0.03, 0.05], { opacity: 0, yPercent: 70, rotate: 4 },
  (tl, c, at, ctx) => { tl.to(c.el, { opacity: 1, yPercent: 0, rotate: 0, duration: 0.9 / sp(ctx), ease: 'expo.out' }, at); return at + 0.25 / sp(ctx); });

export const stamp = letterwise('stamp', 'Stamp', 'Letters slam down like a rubber stamp, with a little kick.', [0.07, 0.12], { opacity: 0, scale: 2.6 },
  (tl, c, at, ctx) => {
    const rot = (ctx.rng() - 0.5) * 14;
    tl.fromTo(c.el, { opacity: 0, scale: 2.6, rotate: rot * 2 }, { opacity: 1, scale: 1, rotate: rot * 0.25, duration: 0.22 / sp(ctx), ease: 'power4.in' }, at);
    tl.to(ctx.textEl, { x: (ctx.rng() - 0.5) * 6, y: 2, duration: 0.04, yoyo: true, repeat: 1, ease: 'none' }, at + 0.22 / sp(ctx));
    return at + 0.22 / sp(ctx);
  });

export const glitch = letterwise('glitch', 'Glitch', 'Digital tearing and colour split, then a clean snap.', [0.03, 0.06], { opacity: 0 },
  (tl, c, at, ctx) => {
    const p = ctx.palette, s = sp(ctx), r = ctx.rng;
    tl.set(c.el, { opacity: 1, x: (r() - 0.5) * 16, skewX: (r() - 0.5) * 40, textShadow: `3px 0 ${p.accent1}, -3px 0 ${p.accent2}` }, at);
    tl.set(c.el, { opacity: 0.3, x: (r() - 0.5) * 10, skewX: 0 }, at + 0.06 / s);
    tl.set(c.el, { opacity: 1, x: (r() - 0.5) * 6, textShadow: `-2px 0 ${p.accent1}, 2px 0 ${p.accent2}` }, at + 0.12 / s);
    tl.set(c.el, { x: 0, skewX: 0, textShadow: 'none' }, at + 0.2 / s);
    return at + 0.2 / s;
  });

export const wave = letterwise('wave', 'Bounce wave', 'Letters bounce in on a playful wave.', [0.04, 0.06], { opacity: 0, yPercent: -120 },
  (tl, c, at, ctx) => { tl.to(c.el, { opacity: 1, yPercent: 0, duration: 0.9 / sp(ctx), ease: 'bounce.out' }, at); return at + 0.45 / sp(ctx); });

export const neon = letterwise('neon', 'Neon flicker', 'Tubes buzz to life: flicker, catch, glow.', [0.05, 0.11], { opacity: 0, textShadow: 'none' },
  (tl, c, at, ctx) => {
    const s = sp(ctx), g = ctx.palette.glow, a = ctx.palette.accent1, glow = `0 0 4px ${g}, 0 0 14px ${a}, 0 0 32px ${a}`;
    const seq = [[0, 0.8], [0.05, 0.1], [0.09, 1], [0.15, 0.25], [0.2, 1]];
    for (const [k, o] of seq) tl.set(c.el, { opacity: o, textShadow: o > 0.5 ? glow : 'none' }, at + k / s);
    return at + 0.2 / s;
  });

export const burn = letterwise('burn', 'Burn in', 'Letters ignite from glowing embers, then cool to their colour.', [0.05, 0.08], { opacity: 0, filter: 'blur(6px) brightness(2.2)', yPercent: 20 },
  (tl, c, at, ctx) => {
    const p = ctx.palette, s = sp(ctx), own = c.el.style.color, clipped = own === 'transparent';
    tl.to(c.el, { opacity: 1, yPercent: 0, filter: 'blur(0px) brightness(1.6)', ...(clipped ? {} : { color: p.glow }), textShadow: `0 0 10px ${p.accent1}, 0 -6px 22px ${p.accent1}`, duration: 0.35 / s, ease: 'power2.out' }, at);
    tl.to(c.el, { filter: 'blur(0px) brightness(1)', ...(clipped ? {} : { color: own || p.text }), textShadow: `0 0 6px ${p.accent1}`, duration: 0.9 / s, ease: 'power1.inOut' }, at + 0.35 / s);
    return at + 0.3 / s;
  });

export const inkBleed = letterwise('ink-bleed', 'Ink bleed', 'Letters soak into the page like ink on wet paper.', [0.05, 0.09], { opacity: 0, filter: 'blur(10px)', scale: 0.92, letterSpacing: '0.1em' },
  (tl, c, at, ctx) => { tl.to(c.el, { opacity: 1, filter: 'blur(0px)', scale: 1, letterSpacing: '0em', duration: 1.3 / sp(ctx), ease: 'sine.out' }, at); return at + 0.5 / sp(ctx); });

export const assemble = letterwise('assemble', 'Assemble', 'Letters fly in from everywhere and lock into the word.', [0.02, 0.04], { opacity: 0 },
  (tl, c, at, ctx) => {
    const r = ctx.rng, a = r() * Math.PI * 2, d = 200 + r() * 260;
    tl.fromTo(c.el, { opacity: 0, x: Math.cos(a) * d, y: Math.sin(a) * d, rotate: (r() - 0.5) * 360, scale: 0.4 }, { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1, duration: 1.1 / sp(ctx), ease: 'power3.inOut' }, at);
    return at + 0.9 / sp(ctx);
  });

export const MOTION_TYPING: Effect[] = [decode, blurIn, rise, stamp, glitch, wave, neon, burn, inkBleed, assemble];
