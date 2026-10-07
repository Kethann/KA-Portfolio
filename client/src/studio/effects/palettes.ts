import type { Palette } from './types';
// Each palette: background, text, two accents, the line-art stroke and a glow. Decorations use at most the two accents.
export const PALETTES: Palette[] = [
  { id: 'rose-noir', name: 'Rose noir', bg: '#140b10', text: '#f6ebe6', accent1: '#e2557a', accent2: '#7fb88f', stroke: '#2b141d', glow: '#ff9ab3' },
  { id: 'paper', name: 'Paper', bg: '#f3ece0', text: '#1d1a17', accent1: '#c8452f', accent2: '#4c7a55', stroke: '#1d1a17', glow: '#f2b48a' },
  { id: 'midnight', name: 'Midnight', bg: '#0b1020', text: '#e8eefc', accent1: '#7aa2ff', accent2: '#f3d27a', stroke: '#050814', glow: '#9fb8ff' },
  { id: 'citrus', name: 'Citrus', bg: '#fff6dc', text: '#1f2a12', accent1: '#ff8a1f', accent2: '#5aa02c', stroke: '#1f2a12', glow: '#ffd36b' },
  { id: 'orchid', name: 'Orchid', bg: '#1a0f22', text: '#f4e8ff', accent1: '#c86cf0', accent2: '#6fd1c3', stroke: '#140a1b', glow: '#e3a6ff' },
  { id: 'moss', name: 'Moss', bg: '#0f1a12', text: '#eaf3e4', accent1: '#d9a441', accent2: '#79b46a', stroke: '#0a120c', glow: '#b9e39c' },
  { id: 'tomato', name: 'Tomato', bg: '#fff1ea', text: '#2a120d', accent1: '#e8452c', accent2: '#2f7d6d', stroke: '#2a120d', glow: '#ff9c80' },
  { id: 'butter', name: 'Butter', bg: '#fff8d6', text: '#2b2414', accent1: '#e0a21b', accent2: '#8a6bd1', stroke: '#2b2414', glow: '#ffe28a' },
  { id: 'blush', name: 'Blush', bg: '#fde9ee', text: '#3a1621', accent1: '#e0607e', accent2: '#5f9e8f', stroke: '#3a1621', glow: '#ffb3c4' },
  { id: 'mono', name: 'Mono', bg: '#0e0e10', text: '#f2f2f2', accent1: '#bdbdbd', accent2: '#7a7a7a', stroke: '#000000', glow: '#ffffff' },
];
