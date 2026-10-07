// The site's UI sounds: one registry shared by the site (what plays when), the Creator Portal (the Sounds panel)
// and the server (what a saved sound setting may contain).
// Two kinds of sound:
//  - "synth:<name>": generated in the browser (client/src/lib/sound/synth.ts): soft air, glints, taps and chimes,
//    no download at all. These are the defaults: they sit quietly under the site.
//  - <name>: a CC0 file by Kenney (kenney.nl) from soundcn (soundcn.xyz), processed by scripts/process-sounds.sh into
//    /sounds/ui/<name>.webm (Opus) + .mp3. Offered as the alternative for each moment, and in the full library.
// Volumes are deliberately low: sound is a quiet layer, never a feature.

export const SOUND_CATEGORIES = [
  { id: 'ui', label: 'Navigation & interface', volume: 0.6 },
  { id: 'gallery', label: 'Gallery & stacks', volume: 0.6 },
  { id: 'assistant', label: 'Panda assistant', volume: 0.55 },
  { id: 'store', label: 'Store & checkout', volume: 0.6 },
  { id: 'feedback', label: 'Success & error', volume: 0.6 },
  { id: 'studio', label: 'Typography studio', volume: 0.5 },
  { id: 'particles', label: 'Particles', volume: 0.45 },
  { id: 'ambient', label: 'Intro & ambient', volume: 0.45 },
];

/** generated sounds (no files) */
export const SOUND_SYNTHS = ['synth:glass', 'synth:frost', 'synth:flick', 'synth:bloom', 'synth:fold', 'synth:glide', 'synth:pad', 'synth:air', 'synth:swish', 'synth:drift', 'synth:gather', 'synth:assemble', 'synth:shimmer', 'synth:tap', 'synth:tick', 'synth:chime', 'synth:low'];
/** the built-in files: every one in /sounds/ui (all CC0, Kenney via soundcn) */
export const SOUND_FILES = [
  'impact-glass-light-001', 'impact-glass-light-002', 'impact-glass-light-003', 'click-soft', 'select-001', 'tick-001', 'hover-tick',
  'open-001', 'open-002', 'close-001', 'close-002', 'maximize-008', 'minimize-007', 'minimize-008',
  'card-slide-2', 'card-slide-4', 'card-fan-1', 'book-flip-2', 'book-flip-3', 'book-open', 'book-close',
  'notification-pop', 'pluck-001', 'pluck-002', 'drop-002', 'drop-004', 'question-002', 'question-003',
  'toggle-002', 'switch-001', 'switch-on', 'switch-off', 'handle-coins-2', 'coin-collect',
  'confirmation-002', 'confirmation-003', 'two-tone-1', 'two-tone-2', 'success-chime', 'three-tone-1', 'jingles-steel-09',
  'error-002', 'error-006', 'error-008', 'scratch-001', 'scratch-003',
];
export const SOUND_LIBRARY = [...SOUND_SYNTHS, ...SOUND_FILES];

const E = (id, label, category, file, alt, volume, extra = {}) => ({ id, label, category, file, alt, volume, gap: 60, jitter: 0, on: true, ...extra });
/** every moment that can make a sound. file / alt: two fitting choices; volume 0-1 (before the category and master
 *  volume); gap: the least time between two plays (ms); jitter: random pitch spread (0-0.5) */
export const SOUND_EVENTS = [
  E('nav.select', 'Nav: choose a page', 'ui', 'synth:glass', 'impact-glass-light-002', 0.3),
  E('nav.tick', 'Nav: liquid drag / conveyor tick', 'ui', 'synth:frost', 'tick-001', 0.16, { gap: 60, jitter: 0.08 }),
  E('nav.menu-open', 'Menu opens', 'ui', 'synth:bloom', 'open-002', 0.22),
  E('nav.menu-close', 'Menu closes', 'ui', 'synth:fold', 'close-002', 0.16, { jitter: 0.1 }),
  E('page.change', 'Page changes (tap or swipe)', 'ui', 'synth:bloom', 'card-slide-4', 0.22, { gap: 320, jitter: 0.05 }),
  E('ui.open', 'A window or viewer opens', 'ui', 'synth:bloom', 'open-001', 0.18, { gap: 250 }),
  E('ui.close', 'A window or viewer closes', 'ui', 'synth:fold', 'close-001', 0.15, { gap: 250 }),
  E('ui.click', 'Any other button / touch (very quiet)', 'ui', 'synth:frost', 'click-soft', 0.12, { gap: 70, jitter: 0.06 }),
  E('ui.share', 'Share menu / link copied', 'ui', 'synth:glass', 'pluck-002', 0.22, { gap: 150 }),
  E('sound.on', 'Sound switched on (the KA assembled sound)', 'ui', 'synth:assemble', 'synth:chime', 0.2, { gap: 1500 }),

  E('stack.open', 'Folder / stack opens', 'gallery', 'synth:bloom', 'book-open', 0.26, { gap: 200 }),
  E('stack.close', 'Folder / stack closes', 'gallery', 'synth:fold', 'book-close', 0.2, { gap: 200 }),
  E('gallery.swipe', 'Poster gallery: each picture passing (follows the spin speed)', 'gallery', 'synth:flick', 'synth:glide', 0.16, { gap: 85, jitter: 0.07 }),   // never faster than ~12 a second: fast ticks blur into a motor-like hum
  E('stack.roll', 'Stack: roll the pictures (swipe a stack)', 'gallery', 'synth:glide', 'card-slide-4', 0.16, { gap: 120 }),
  E('gallery.view', 'Click to view (full image)', 'gallery', 'synth:bloom', 'maximize-008', 0.2, { gap: 200 }),
  E('gallery.back', 'Back from the full image', 'gallery', 'synth:fold', 'minimize-008', 0.16, { gap: 200 }),
  E('gallery.pin', 'Pin / unpin an image', 'gallery', 'synth:glass', 'drop-002', 0.22, { gap: 150 }),

  E('panda.open', 'Panda: chat opens', 'assistant', 'notification-pop', 'synth:bloom', 0.22, { gap: 300 }),
  E('panda.close', 'Panda: chat closes', 'assistant', 'synth:fold', 'minimize-007', 0.16, { gap: 300 }),
  E('panda.send', 'Panda: message sent', 'assistant', 'pluck-001', 'synth:tap', 0.22),
  E('panda.reply', 'Panda: reply received', 'assistant', 'synth:shimmer', 'question-002', 0.2, { gap: 400 }),
  E('panda.idle', 'Panda: idle chirp (rare, very quiet)', 'assistant', 'synth:shimmer', 'pluck-002', 0.06, { gap: 45000 }),

  E('store.tab', 'Store: Artzz / Artifacts', 'store', 'synth:glass', 'toggle-002', 0.26),
  E('store.filter', 'Store: filters, sort, currency', 'store', 'synth:frost', 'click-soft', 0.18),
  E('store.view', 'Store: open an item / next image', 'store', 'synth:glide', 'card-slide-4', 0.18, { gap: 150 }),
  E('store.buy', 'Store: Buy (opens checkout)', 'store', 'synth:glass', 'handle-coins-2', 0.26, { gap: 400 }),
  E('store.coupon', 'Store: coupon applied', 'store', 'confirmation-003', 'synth:chime', 0.26, { gap: 400 }),
  E('store.paid', 'Store: payment successful', 'feedback', 'synth:chime', 'success-chime', 0.3, { gap: 1000 }),
  E('store.failed', 'Store: payment failed / code rejected', 'feedback', 'synth:low', 'error-006', 0.24, { gap: 600 }),

  E('tips.open', 'Tips: open an article', 'ui', 'synth:bloom', 'book-open', 0.2, { gap: 250 }),

  E('studio.open', 'Studio: opens / closes', 'studio', 'synth:bloom', 'open-002', 0.22, { gap: 300 }),
  E('studio.tool', 'Studio: tools and panels', 'studio', 'synth:frost', 'click-soft', 0.14, { gap: 60 }),
  E('studio.theme', 'Studio: pick a theme / option', 'studio', 'synth:glass', 'impact-glass-light-003', 0.18, { gap: 90 }),
  E('studio.export', 'Studio: export / download done', 'studio', 'synth:chime', 'confirmation-002', 0.26, { gap: 600 }),
  E('studio.trail', 'Studio: faint pencil while drawing', 'studio', 'scratch-003', 'synth:glide', 0.05, { gap: 75, jitter: 0.25, on: false }),

  E('contact.sent', 'Contact form sent', 'feedback', 'synth:chime', 'three-tone-1', 0.28, { gap: 1000 }),
  E('contact.error', 'Contact form error', 'feedback', 'synth:low', 'error-002', 0.22, { gap: 600 }),

  E('particles.spark', 'Particles: glint as they fly', 'particles', 'synth:shimmer', 'impact-glass-light-001', 0.05, { gap: 150, jitter: 0.35 }),

  E('intro.air', 'Intro: a warm chord while the shards fly (off: a held chord can sound like a hum)', 'ambient', 'synth:pad', '', 0.12, { gap: 8000, on: false }),
  E('intro.gather', 'Intro: particles gathering', 'ambient', 'synth:gather', 'synth:shimmer', 0.12, { gap: 4000 }),
  E('intro.assemble', 'Intro: KA assembled', 'ambient', 'synth:assemble', 'synth:chime', 0.15, { gap: 8000 }),
  E('intro.bed', 'Intro: your own sound bed (upload)', 'ambient', '', '', 0.25, { gap: 5000, on: false }),
];
export const SOUND_EVENT_IDS = SOUND_EVENTS.map(e => e.id);

/** the settings a fresh site starts with: sound on for visitors (from their first tap or key press; muted for people who
 *  prefer reduced motion), at a quiet level. Visitors can switch it off in the menu, and the owner can change this in the portal. */
export const SOUND_DEFAULTS = { defaultOn: true, master: 0.7, categories: {}, events: {} };

/** where a library file lives */
export const librarySrc = (name, ext) => `/sounds/ui/${name}.${ext}`;
