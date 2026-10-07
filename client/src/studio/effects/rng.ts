// A small seeded random generator (mulberry32): the same seed always gives the same composition.
export function seeded(seed: number){
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const newSeed = () => (Math.random() * 2 ** 31) | 0;
export const between = (r: () => number, a: number, b: number) => a + (b - a) * r();
