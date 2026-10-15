import { floral, floralOnReveal } from './floral';
import { MORE_DECORATIONS } from './more';
import type { Effect, EffectContext, CharInfo, Timeline } from '../types';

export interface Decoration extends Effect {
  onReveal?(tl: Timeline, ctx: EffectContext, c: CharInfo, at: number): number;
  /** drawn by the GPU text renderer instead of SVG: fire, snow, rain or lightning, on and around the letters */
  gpu?: 'fire' | 'snow' | 'rain' | 'storm';
}

const none: Decoration = { id: 'none', name: 'None', description: 'Just the letters.', duration: 0, params: [], init(){ /* nothing */ }, play(){ return 0; }, reset(){ /* nothing */ } };

export const DECORATIONS: Decoration[] = [none, { ...floral, onReveal: floralOnReveal }, ...MORE_DECORATIONS];
