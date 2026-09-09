export const activities = ['relaxing','sleeping','calling','eating','playing','stretching','watching'] as const;
export type Activity = typeof activities[number];

/** Active time only: callers stop advancing while hidden, detached or reduced motion. */
export function createActivityClock(seed = 1, available: readonly Activity[] = activities) {
  const pool = [...new Set(available)];
  if (!pool.length) throw new Error('The panda needs at least one supported activity.');
  let state = seed >>> 0 || 1, elapsed = 0, current: Activity = pool.includes('relaxing') ? 'relaxing' : pool[0];
  let bag: Activity[] = [];
  const random = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
  function next() {
    if (!bag.length) {
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [bag[i],bag[j]] = [bag[j],bag[i]]; }
    }
    if (bag[bag.length-1] === current && pool.length > 1) {
      const index = bag.findIndex(item => item !== current);
      if (index >= 0) [bag[index],bag[bag.length-1]] = [bag[bag.length-1],bag[index]];
      else { bag = []; next(); return; }
    }
    current = bag.pop()!;
  }
  return {
    advance(seconds: number) {
      if (Number.isFinite(seconds) && seconds > 0) elapsed += seconds;
      while (elapsed >= 60) { elapsed -= 60; next(); }
      // Return to idle before the next activity; no abrupt prop or pose changes.
      const edge = Math.min(1, elapsed / 2.4, (60-elapsed) / 2.4);
      return { activity: current, elapsed, weight: edge * edge * (3 - 2 * edge) };
    }
  };
}
