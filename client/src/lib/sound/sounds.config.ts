// The sound registry (events → file, volume, category). The single source of truth is shared/sounds.js so the
// site, the Creator Portal and the server agree; this module re-exports it for the client code.
export { SOUND_EVENTS, SOUND_CATEGORIES, SOUND_LIBRARY, SOUND_DEFAULTS, SOUND_EVENT_IDS, librarySrc } from '../../../../shared/sounds.js';
export type { SoundEvent, SoundSettings, SoundEventSetting, SoundCategory } from '../../../../shared/sounds.js';
