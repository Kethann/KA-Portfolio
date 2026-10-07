// Types for shared/fonts.js (plain JS so the Worker, Node and the browser bundles can all import it).
export type FontGroup = 'script' | 'hand' | 'serif' | 'sans' | 'display' | 'deco' | 'mono';
export const FONT_GROUPS: { id: FontGroup; label: string }[];
export const FONT_LIBRARY: { name: string; group: FontGroup; axes: string; fallback: string }[];
export const FONT_NAMES: string[];
export function fontStack(name: string): string;
export function googleFontsUrl(names: string[]): string;
