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
import { SceneRunner } from './scenes';
import { FinishRunner } from './finish';
import { deco as decoSize } from './decorations/kit';
import type { CharInfo, EffectContext, Palette, Timeline } from './types';

export interface Composition {
  text: string; font: string; typing: string; decoration: string; caret: 'bar' | 'block' | 'underscore' | 'nib' | 'none';
  palette: string; seed: number; speed: number; density: number; params?: Record<string, unknown>;
  /** animated background, its amount and pace */
  scene?: string; sceneIntensity?: number; sceneSpeed?: number;
  /** texture over everything, and how strong */
  finish?: string; finishAmount?: number;
  /** text styling: fill, glow 0-1, case, letter spacing (em) */
  fill?: string; glow?: number; textCase?: 'as-typed' | 'upper'; tracking?: number;
  /** decoration size multiplier */
  decoSize?: number;
  /** your own colours over the palette */
  colors?: Partial<Pick<Palette, 'bg' | 'text' | 'accent1' | 'accent2' | 'glow'>>;
}

/** the CSS gradient for a fill (null = a flat colour) */
export function fillGradient(fill: string, p: Palette){
  const st = fillStops(fill, p); if (!st) return null;
  const dir = st.angle === 'h' ? '100deg' : st.angle === 'v-up' ? '0deg' : '180deg';
  return `linear-gradient(${dir}, ${st.stops.map(([o, c]) => `${c} ${Math.round(o * 100)}%`).join(', ')})`;
}
/** gradient stops for each fill (CSS on the stage, canvas gradients in exports) */
export function fillStops(fill: string, p: Palette): { angle: 'h' | 'v-up' | 'v'; stops: [number, string][] } | null {
  switch (fill){
    case 'gradient': return { angle: 'h', stops: [[0, p.accent1], [0.5, p.glow], [1, p.accent2]] };
    case 'metal-gold': return { angle: 'v', stops: [[0, '#fff6d0'], [0.32, '#f0c75e'], [0.52, '#8a5a12'], [0.68, '#f6dc8c'], [1, '#b8862b']] };
    case 'chrome': return { angle: 'v', stops: [[0, '#ffffff'], [0.38, '#d5dde7'], [0.5, '#3e4855'], [0.63, '#e3e9f0'], [1, '#8e99a6']] };
    case 'fire': return { angle: 'v-up', stops: [[0, p.accent1], [0.55, '#ffb21a'], [1, '#fff3b0']] };
    case 'ice': return { angle: 'v', stops: [[0, '#ffffff'], [0.45, '#c9f1ff'], [1, '#5fb6e6']] };
    default: return null;
  }
}

const NS = 'http://www.w3.org/2000/svg';

export class EffectController {
  stage: HTMLElement; textEl: HTMLDivElement; svg: SVGSVGElement; caret: HTMLSpanElement; pen: HTMLSpanElement;
  tl: Timeline | null = null; ctx: EffectContext | null = null; comp: Composition | null = null; palette: Palette | null = null;
  scene: SceneRunner; finish: FinishRunner;
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
    this.scene = new SceneRunner(stage); this.finish = new FinishRunner(stage);
    (stage as HTMLElement & { fxController?: EffectController }).fxController = this;   // for tests and debugging
    this.scene.reduced = this.finish.reduced = this.reduced;
    document.addEventListener('visibilitychange', this.onVis);
  }
  private onVis = () => { if (document.hidden){ this.tl?.pause(); this.scene.stop(); } else { if (!this.reduced) this.tl?.play(); this.scene.start(); } };

  /** palette colours on the stage as CSS variables, tweened when switching so nothing jumps */
  applyPalette(p: Palette, instant = false){
    const vars = { '--fx-bg': p.bg, '--fx-text': p.text, '--fx-a1': p.accent1, '--fx-a2': p.accent2, '--fx-stroke': p.stroke, '--fx-glow': p.glow };
    if (instant || this.reduced){ for (const [k, v] of Object.entries(vars)) this.stage.style.setProperty(k, v); return; }
    gsap.to(this.stage, { ...vars, duration: 0.5, ease: 'power1.out' });
  }

  /** fits the text to the stage: the longest line takes about 86% of the width, never taller than the stage allows */
  private fit(font: string, text: string, tracking = 0){
    const lines = text.split('\n'), w = this.stage.clientWidth * 0.86, h = this.stage.clientHeight * 0.62;
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = `100px ${font}`;
    const widest = Math.max(...lines.map(l => probe.measureText(l || ' ').width + Array.from(l).length * tracking * 100), 1);
    const size = Math.max(22, Math.min(200, (w / widest) * 100, h / (lines.length * 1.18)));
    this.textEl.style.font = `${Math.round(size)}px ${font}`;
    return Math.round(size);
  }

  async compose(c: Composition){
    const run = ++this.building;
    this.stop();
    this.comp = c;
    const base = PALETTES.find(p => p.id === c.palette) || PALETTES[0];
    const palette: Palette = { ...base, ...Object.fromEntries(Object.entries(c.colors || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(String(v)))) };
    this.palette = palette;
    decoSize.scale = Math.max(0.4, Math.min(2.5, c.decoSize ?? 1));
    this.textEl.style.letterSpacing = (c.tracking || 0) + 'em';
    this.applyPalette(palette, !this.ctx);
    const typing = TYPING.find(t => t.id === c.typing) || TYPING[0];
    const deco = DECORATIONS.find(d => d.id === c.decoration) || DECORATIONS[0];
    const raw = c.text.trim() || 'Your words here', text = c.textCase === 'upper' ? raw.toUpperCase() : raw;
    const px = this.fit(c.font, text, c.tracking || 0);
    const family = c.font.split(',')[0];
    try { await document.fonts.load(`${px}px ${family}`, text); } catch { /* falls back to the next font in the stack */ }
    if (run !== this.building) return;           // a newer compose started while the font loaded
    this.fit(c.font, text, c.tracking || 0);
    const split = splitText(this.textEl, text);
    for (const ch of split.chars) ch.el.dataset.ch = ch.el.textContent || '';
    this.scene.set(c.scene || 'plain', palette, c.sceneIntensity ?? 0.6, c.sceneSpeed ?? 1, c.seed);
    this.finish.set(c.finish || 'none', c.finishAmount ?? 0.6, palette);
    this.svg.replaceChildren();
    this.caret.className = 'fx-caret is-' + (typing.id === 'typewriter' ? c.caret : 'none');
    const sr = this.stage.getBoundingClientRect();
    this.svg.setAttribute('viewBox', `0 0 ${sr.width} ${sr.height}`);
    const fontCss = getComputedStyle(this.textEl).font;
    const chars: CharInfo[] = split.chars.map((s, index) => {
      const rect = s.el.getBoundingClientRect();
      return { index, char: s.el.textContent || '', el: s.el, rect, anchors: glyphAnchors(s.el.textContent || '', fontCss, rect, sr), word: s.word, line: s.line };
    });
    this.styleText(chars, c, palette);
    const reveals: { i: number; t: number }[] = [];
    const ctx: EffectContext = {
      stage: this.stage, textEl: this.textEl, svg: this.svg, chars, rng: seeded(c.seed), palette, speed: c.speed, density: c.density, reduced: this.reduced,
      revealAt: (i, t) => { reveals.push({ i, t }); }, onReveal: () => { /* the controller dispatches below */ },
      paint: { color: palette.text, stops: fillStops(c.fill || 'solid', palette), outline: c.fill === 'outline' ? palette.text : c.fill === 'outline-glow' ? palette.accent1 : null },
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

  /** fill (a gradient across the whole text, outline, metal...) and glow on every letter */
  private styleText(chars: CharInfo[], c: Composition, p: Palette){
    const fill = c.fill || 'solid', grad = fillGradient(fill, p), g = Math.max(0, Math.min(1, c.glow ?? 0));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ch of chars){ x0 = Math.min(x0, ch.rect.left); y0 = Math.min(y0, ch.rect.top); x1 = Math.max(x1, ch.rect.right); y1 = Math.max(y1, ch.rect.bottom); }
    const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0);
    for (const ch of chars){
      const st = ch.el.style;
      if (grad){ st.backgroundImage = grad; st.backgroundSize = `${W}px ${H}px`; st.backgroundPosition = `${-(ch.rect.left - x0)}px ${-(ch.rect.top - y0)}px`; st.setProperty('-webkit-background-clip', 'text'); st.backgroundClip = 'text'; st.color = 'transparent'; }
      if (fill === 'outline' || fill === 'outline-glow'){ st.color = 'transparent'; st.setProperty('-webkit-text-stroke', `max(1.5px, 0.03em) ${fill === 'outline' ? p.text : p.accent1}`); }
    }
    const glow = fill === 'outline-glow' ? Math.max(g, 0.6) : g;
    // flat letters glow with a text-shadow; clipped fills use a drop-shadow filter (a text-shadow would sit on top of them)
    this.textEl.style.textShadow = glow && !grad && fill !== 'outline-glow' ? `0 0 ${(6 + glow * 10).toFixed(0)}px ${p.glow}, 0 0 ${(18 + glow * 30).toFixed(0)}px ${p.accent1}` : '';
    this.textEl.style.filter = glow && (grad || fill === 'outline-glow') ? `drop-shadow(0 0 ${(4 + glow * 8).toFixed(0)}px ${p.glow}) drop-shadow(0 0 ${(10 + glow * 22).toFixed(0)}px ${p.accent1})` : '';
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
  destroy(){ this.stop(); this.scene.destroy(); this.finish.destroy(); document.removeEventListener('visibilitychange', this.onVis); this.stage.replaceChildren(); }
}
