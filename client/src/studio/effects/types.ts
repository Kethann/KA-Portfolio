// Text Effects: three stackable layers on top of the studio's own text (typing, texture fill, decoration).
// Every effect is a plugin with the same shape, so any typing effect, texture and decoration combine freely.
import type { gsap } from 'gsap';
export type Timeline = gsap.core.Timeline;

export interface Palette { id: string; name: string; bg: string; text: string; accent1: string; accent2: string; stroke: string; glow: string }
export interface Point { x: number; y: number }
/** Where a decoration may attach to a letter: its outline, its baseline and its top, in stage pixels. */
export interface GlyphAnchors { outline: Point[]; base: Point[]; top: Point[]; center: Point }
export interface CharInfo { index: number; char: string; el: HTMLSpanElement; rect: DOMRect; anchors: GlyphAnchors; word: number; line: number }

export interface EffectContext {
  stage: HTMLElement;            // the box everything is laid out in (position: relative)
  textEl: HTMLElement;           // the split text
  svg: SVGSVGElement;            // decorations draw here
  chars: CharInfo[];             // every visible letter, in reading order
  rng: () => number;             // seeded: the same seed gives the same result
  palette: Palette;
  speed: number;                 // 0.5 – 2 (1 = normal)
  density: number;               // 0 – 1
  reduced: boolean;              // prefers-reduced-motion: show the final composed state
  /** typing effects call this when a letter appears; decorations listen and grow from it at that moment */
  revealAt(index: number, time: number): void;
  onReveal(fn: (c: CharInfo, time: number) => void): void;
  /** handwriting: the pen tip at a time, so decorations can follow the pen */
  penAt?(time: number): Point | null;
}

export interface EffectParam { id: string; name: string; type: 'range' | 'select' | 'toggle'; min?: number; max?: number; step?: number; options?: { value: string; name: string }[]; value: number | string | boolean }

export interface Effect {
  id: string; name: string; description: string;
  /** seconds for one pass at speed 1 (before the hold and the reset that make the loop) */
  duration: number;
  params: EffectParam[];
  init(ctx: EffectContext, params: Record<string, unknown>): void;
  /** add tweens to the master timeline; returns the time the effect has finished building */
  play(tl: Timeline, ctx: EffectContext, params: Record<string, unknown>): number;
  reset(ctx: EffectContext): void;
}
