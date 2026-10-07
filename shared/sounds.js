// The site's UI sounds: one registry shared by the site (what plays when), the Creator Portal (the Sounds panel)
// and the server (what a saved sound setting may contain). Every built-in sound is a CC0 file by Kenney
// (kenney.nl), taken from soundcn (soundcn.xyz) and processed by scripts/process-sounds.sh into
// /sounds/ui/<name>.webm (Opus) + .mp3. Volumes are deliberately low: sound is a quiet layer, never a feature.

export const SOUND_CATEGORIES = [
  { id: 'ui', label: 'Navigation & interface', volume: 0.6 },
  { id: 'gallery', label: 'Gallery & stacks', volume: 0.6 },
  { id: 'assistant', label: 'Panda assistant', volume: 0.55 },
  { id: 'store', label: 'Store & checkout', volume: 0.6 },
  { id: 'feedback', label: 'Success & error', volume: 0.6 },
  { id: 'studio', label: 'Typography studio', volume: 0.5 },
  { id: 'particles', label: 'Particles', volume: 0.45 },
  { id: 'ambient', label: 'Ambient & intro bed', volume: 0.35 },
];

/** the built-in library: every file in /sounds/ui (all CC0, Kenney via soundcn) */
export const SOUND_LIBRARY = [
  'impact-glass-light-001', 'impact-glass-light-002', 'impact-glass-light-003', 'click-soft', 'select-001', 'tick-001', 'hover-tick',
  'open-001', 'open-002', 'close-001', 'close-002', 'maximize-008', 'minimize-007', 'minimize-008',
  'card-slide-2', 'card-slide-4', 'card-fan-1', 'book-flip-2', 'book-flip-3', 'book-open', 'book-close',
  'notification-pop', 'pluck-001', 'pluck-002', 'drop-002', 'drop-004', 'question-002', 'question-003',
  'toggle-002', 'switch-001', 'switch-on', 'switch-off', 'handle-coins-2', 'coin-collect',
  'confirmation-002', 'confirmation-003', 'two-tone-1', 'two-tone-2', 'success-chime', 'three-tone-1', 'jingles-steel-09',
  'error-002', 'error-006', 'error-008', 'scratch-001', 'scratch-003',
];

const E = (id, label, category, file, alt, volume, extra = {}) => ({ id, label, category, file, alt, volume, gap: 60, jitter: 0, on: true, ...extra });
/** every moment that can make a sound. file / alt: two fitting choices from the library; volume 0-1 (before the
 *  category and master volume); gap: the least time between two plays (ms); jitter: random pitch spread (0-0.5) */
export const SOUND_EVENTS = [
  E('nav.select', 'Nav: choose a page', 'ui', 'impact-glass-light-002', 'click-soft', 0.32),
  E('nav.tick', 'Nav: liquid drag / conveyor tick', 'ui', 'tick-001', 'hover-tick', 0.2, { gap: 60, jitter: 0.06 }),
  E('nav.menu-open', 'Menu opens', 'ui', 'open-002', 'maximize-008', 0.28),
  E('nav.menu-close', 'Menu closes', 'ui', 'close-002', 'minimize-008', 0.25),
  E('page.change', 'Page changes (tap or swipe)', 'ui', 'card-slide-4', 'book-flip-3', 0.18, { gap: 320 }),
  E('sound.on', 'Sound switched on', 'ui', 'switch-on', 'toggle-002', 0.3),

  E('stack.open', 'Folder / stack opens', 'gallery', 'book-open', 'card-fan-1', 0.32, { gap: 200 }),
  E('stack.close', 'Folder / stack closes', 'gallery', 'book-close', 'card-slide-2', 0.28, { gap: 200 }),
  E('gallery.swipe', 'Poster gallery: next / previous', 'gallery', 'book-flip-3', 'card-slide-4', 0.18, { gap: 90, jitter: 0.08 }),
  E('gallery.view', 'Click to view (full image)', 'gallery', 'maximize-008', 'open-001', 0.26, { gap: 200 }),
  E('gallery.back', 'Back from the full image', 'gallery', 'minimize-008', 'close-001', 0.22, { gap: 200 }),

  E('panda.open', 'Panda: chat opens', 'assistant', 'notification-pop', 'pluck-002', 0.26, { gap: 300 }),
  E('panda.close', 'Panda: chat closes', 'assistant', 'minimize-007', 'close-001', 0.2, { gap: 300 }),
  E('panda.send', 'Panda: message sent', 'assistant', 'pluck-001', 'drop-002', 0.26),
  E('panda.reply', 'Panda: reply received', 'assistant', 'question-002', 'pluck-002', 0.22, { gap: 400 }),
  E('panda.idle', 'Panda: idle chirp (rare, very quiet)', 'assistant', 'pluck-002', 'question-003', 0.08, { gap: 45000 }),

  E('store.tab', 'Store: Artzz / Artifacts', 'store', 'toggle-002', 'switch-001', 0.28),
  E('store.filter', 'Store: filters, sort, currency', 'store', 'click-soft', 'select-001', 0.25),
  E('store.buy', 'Store: Buy (opens checkout)', 'store', 'handle-coins-2', 'coin-collect', 0.26, { gap: 400 }),
  E('store.coupon', 'Store: coupon applied', 'store', 'confirmation-003', 'two-tone-1', 0.3, { gap: 400 }),
  E('store.paid', 'Store: payment successful', 'feedback', 'success-chime', 'jingles-steel-09', 0.34, { gap: 1000 }),
  E('store.failed', 'Store: payment failed / code rejected', 'feedback', 'error-006', 'error-002', 0.26, { gap: 600 }),

  E('studio.theme', 'Studio: pick a theme / option', 'studio', 'impact-glass-light-003', 'click-soft', 0.2, { gap: 90 }),
  E('studio.export', 'Studio: export / download done', 'studio', 'confirmation-002', 'two-tone-2', 0.3, { gap: 600 }),
  E('studio.trail', 'Studio: faint pencil while drawing', 'studio', 'scratch-003', 'scratch-001', 0.05, { gap: 75, jitter: 0.25, on: false }),

  E('contact.sent', 'Contact form sent', 'feedback', 'three-tone-1', 'success-chime', 0.3, { gap: 1000 }),
  E('contact.error', 'Contact form error', 'feedback', 'error-002', 'error-008', 0.24, { gap: 600 }),

  E('particles.spark', 'Particles: sparkle as they fly', 'particles', 'impact-glass-light-001', 'pluck-001', 0.06, { gap: 150, jitter: 0.45 }),
  E('intro.bed', 'Intro sound bed (upload your own)', 'ambient', '', '', 0.25, { gap: 5000, on: false }),
];
export const SOUND_EVENT_IDS = SOUND_EVENTS.map(e => e.id);

/** the settings a fresh site starts with (sound is off for visitors until they switch it on) */
export const SOUND_DEFAULTS = { defaultOn: false, master: 0.7, categories: {}, events: {} };

/** where a library sound lives */
export const librarySrc = (name, ext) => `/sounds/ui/${name}.${ext}`;
