// The homepage intro versions. Exactly one runs per page load; the owner picks it in the Creator Portal
// (Studio > Intro) and can switch back to any version at any time.
//
// How a version is wired:
//  - its code is one <script data-intro="<id>"> block in index.html; every version except V1 ships with
//    type="text/plain" (so it does not run) and the Pages router (pages/_worker.js) switches on the chosen one
//    before the page reaches the browser;
//  - a version must keep the homepage contract V1 keeps: fade the #boot-veil out, and dispatch the
//    'ka-sequence-complete' window event once the logo is fully revealed (the nav, sounds and pages wait for it).
//
// V1 is LOCKED: its code must never change. tests/intro-lock.test.mjs fails the build if the fingerprint below no
// longer matches the script, so a new idea always becomes a new version instead of an edit to V1.
export const INTRO_VERSIONS = [
  {
    id: 'v1',
    name: 'KA crystal',
    label: 'Version 1',
    locked: true,
    description: 'The shattered KA crystal flies in, reassembles shard by shard and lights up; the skill icons orbit the finished logo.',
    sha256: '56725c66ba5e99a4ae983b28a092ba3d44ebfd3f2740e2e49512746d723c6e7a',
  },
  {
    id: 'v2',
    name: 'KA crystal · your bubbles',
    label: 'Version 2',
    locked: false,
    description: 'The same KA crystal intro, with the skill bubbles under your control: show or hide them, pick which ones, put them in order and rename them (Studio > Intro > Bubbles).',
  },
];
export const INTRO_IDS = INTRO_VERSIONS.map(v => v.id);
export const DEFAULT_INTRO = 'v1';
/** the version a saved setting points at (anything unknown falls back to V1) */
export const introVersion = (id) => INTRO_IDS.includes(id) ? id : DEFAULT_INTRO;

// The skill bubbles that orbit the finished V1 logo (Studio > Intro > Bubbles): which ones show, in what order, and their words.
// Nothing saved = the intro's own eight, exactly as built. The icon drawings are fixed; the owner picks, orders and renames them.
export const BUBBLE_TYPES = [
  { type: 'brush', label: 'Illustration' }, { type: 'pencil', label: 'Sketch' }, { type: 'ps', label: 'Photoshop' }, { type: 'design', label: 'Figma' },
  { type: 'uiux', label: 'UI/UX' }, { type: 'type', label: 'Typography' }, { type: 'image', label: 'Imaging' }, { type: 'briefcase', label: 'Freelance' },
];
/** a saved bubbles setting made safe: known icons only, each once, short plain labels; icons left out are added at the end */
export function cleanBubbles(input){
  if (!input || typeof input !== 'object') return null;
  const seen = new Set(), items = [];
  for (const raw of Array.isArray(input.items) ? input.items : []){
    const base = BUBBLE_TYPES.find(b => b.type === (raw && raw.type));
    if (!base || seen.has(base.type)) continue;
    seen.add(base.type);
    const label = typeof raw.label === 'string' ? raw.label.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) : '';
    items.push({ type: base.type, label: label || base.label, on: raw.on !== false });
  }
  for (const b of BUBBLE_TYPES) if (!seen.has(b.type)) items.push({ type: b.type, label: b.label, on: true });
  return { enabled: input.enabled !== false, items };
}
/** what the intro should draw: null = leave the intro as built; otherwise the list of { type, label } (empty = no bubbles) */
export function bubbleList(input){
  const b = cleanBubbles(input);
  if (!b) return null;
  if (!b.enabled) return [];
  return b.items.filter(i => i.on).map(i => ({ type: i.type, label: i.label }));
}
