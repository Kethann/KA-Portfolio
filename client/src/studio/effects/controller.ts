// EffectController: takes the text, splits it into lines → words → letters, measures every letter and samples its
// outline (glyph anchors), then builds ONE master GSAP timeline that the typing effect, the decoration (and later the
// texture) all add to. Decorations grow exactly when their letter appears (onReveal). The loop ends where it began
// (an empty stage), so it repeats seamlessly; with reduced motion the final composed state is shown and held.
import { gsap } from 'gsap';
import { splitText } from './split';
import { glyphAnchors } from './anchors';
import { seeded } from './rng';
import { TYPING } from './typing';
import { DECORATIONS } from './decorations';
import { PALETTES } from './palettes';
import type { CharInfo, EffectContext, Palette, Timeline } from './types';

export interface Composition {
  text: string; font: string; typing: string; decoration: string; caret: 'bar' | 'block' | 'underscore' | 'nib' | 'none';
  palette: string; seed: number; speed: number; density: number; params?: Record<string, unknown>;
}

const NS = 'http://www.w3.org/2000/svg';

export class EffectController {
  stage: HTMLElement; textEl: HTMLDivElement; svg: SVGSVGElement; caret: HTMLSpanElement; pen: HTMLSpanElement;
  tl: Timeline | null = null; ctx: EffectContext | null = null; comp: Composition | null = null;
  built = 0;   // the time the piece is fully composed (the frame a still export uses)
  private building = 0;
  private reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(stage: HTMLElement){
    this.stage = stage;
    this.textEl = document.createElement('div'); this.textEl.className = 'fx-text';
    this.svg = document.createElementNS(NS, 'svg') as SVGSVGElement; this.svg.setAttribute('class', 'fx-deco'); this.svg.setAttribute('aria-hidden', 'true');
    this.caret = document.createElement('span'); this.caret.className = 'fx-caret'; this.caret.setAttribute('aria-hidden', 'true');
    this.pen = document.createElement('span'); this.pen.className = 'fx-pen'; this.pen.setAttribute('aria-hidden', 'true');
    stage.append(this.svg, this.textEl, this.caret, this.pen);
    document.addEventListener('visibilitychange', this.onVis);
  }
  private onVis = () => { if (!this.tl) return; if (document.hidden) this.tl.pause(); else if (!this.reduced) this.tl.play(); };

  /** palette colours on the stage as CSS variables, tweened when switching so nothing jumps */
  applyPalette(p: Palette, instant = false){
    const vars = { '--fx-bg': p.bg, '--fx-text': p.text, '--fx-a1': p.accent1, '--fx-a2': p.accent2, '--fx-stroke': p.stroke, '--fx-glow': p.glow };
    if (instant || this.reduced){ for (const [k, v] of Object.entries(vars)) this.stage.style.setProperty(k, v); return; }
    gsap.to(this.stage, { ...vars, duration: 0.5, ease: 'power1.out' });
  }

  /** fits the text to the stage: the longest line takes about 86% of the width, never taller than the stage allows */
  private fit(font: string, text: string){
    const lines = text.split('\n'), w = this.stage.clientWidth * 0.86, h = this.stage.clientHeight * 0.62;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = `100px ${font}`;
    const widest = Math.max(...lines.map(l => probe.measureText(l || ' ').width), 1);
    const size = Math.max(22, Math.min(200, (w / widest) * 100, h / (lines.length * 1.18)));
    this.textEl.style.font = `${Math.round(size)}px ${font}`;
    return Math.round(size);
  }

  async compose(c: Composition){
    const run = ++this.building;
    this.stop();
    this.comp = c;
    const palette = PALETTES.find(p => p.id === c.palette) || PALETTES[0];
    this.applyPalette(palette, !this.ctx);
    const typing = TYPING.find(t => t.id === c.typing) || TYPING[0];
    const deco = DECORATIONS.find(d => d.id === c.decoration) || DECORATIONS[0];
    const text = c.text.trim() || 'Your words here';
    const px = this.fit(c.font, text);
    const family = c.font.split(',')[0];
    try { await document.fonts.load(`${px}px ${family}`, text); } catch { /* falls back to the next font in the stack */ }
    if (run !== this.building) return;           // a newer compose started while the font loaded
    this.fit(c.font, text);
    const split = splitText(this.textEl, text);
    this.svg.replaceChildren();
    this.caret.className = 'fx-caret is-' + (typing.id === 'typewriter' ? c.caret : 'none');
    const sr = this.stage.getBoundingClientRect();
    this.svg.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
    const fontCss = getComputedStyle(this.textEl).font;
    const chars: CharInfo[] = split.chars.map((s, index) => {
      const rect = s.el.getBoundingClientRect();
      return { index, char: s.el.textContent || '', el: s.el, rect, anchors: glyphAnchors(s.el.textContent || '', fontCss, rect, sr), word: s.word, line: s.line };
    });
    const reveals: { i: number; t: number }[] = [];
    const ctx: EffectContext = {
      stage: this.stage, textEl: this.textEl, svg: this.svg, chars, rng: seeded(c.seed), palette, speed: c.speed, density: c.density, reduced: this.reduced,
      revealAt: (i, t) => { reveals.push({ i, t }); }, onReveal: () => { /* the controller dispatches below */ },
    };
    this.ctx = ctx;
    typing.init(ctx, c.params || {}); deco.init(ctx, c.params || {});
    const tl = gsap.timeline({ paused: true, repeat: this.reduced ? 0 : -1 });
    tl.set(this.svg, { opacity: 1 }, 0).set(this.textEl, { opacity: 1 }, 0);
    let end = typing.play(tl, ctx, c.params || {});
    // decorations grow from each letter at the moment it is revealed
    for (const r of reveals.sort((a, b) => a.t - b.t)) if (deco.onReveal) end = Math.max(end, deco.onReveal(tl, ctx, chars[r.i], r.t));
    end = Math.max(end, deco.play(tl, ctx, c.params || {}));
    const built = end + 0.15;
    this.built = built;
    // hold the finished piece, then cut back to the empty stage the loop starts from
    const hold = 1.8 / Math.max(0.25, c.speed);
    tl.to([this.textEl, this.svg, this.caret], { opacity: 0, duration: 0.5, ease: 'power1.in' }, built + hold);
    tl.set({}, {}, built + hold + 0.6);
    this.tl = tl;
    if (this.reduced){ tl.progress(Math.min(1, built / tl.duration())); return; }
    tl.play(0);
  }

  replay(){ if (this.tl && !this.reduced) this.tl.play(0); }
  stop(){
    this.tl?.kill(); this.tl = null;
    if (this.ctx){
      for (const t of TYPING) t.reset(this.ctx);
      for (const d of DECORATIONS) d.reset(this.ctx);
    }
    gsap.set([this.textEl, this.svg, this.caret], { opacity: 1 }); gsap.set(this.pen, { opacity: 0 });
  }
  destroy(){ this.stop(); document.removeEventListener('visibilitychange', this.onVis); this.stage.replaceChildren(); }
}
