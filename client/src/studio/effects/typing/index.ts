import { typewriter } from './typewriter';
import { handwriting } from './handwriting';
import { MOTION_TYPING } from './motion';
import type { Effect } from '../types';
export const TYPING: Effect[] = [typewriter, handwriting, ...MOTION_TYPING];
