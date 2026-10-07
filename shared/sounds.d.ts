// Types for shared/sounds.js (plain JS so the Worker, Node and the browser bundles can all import it).
export type SoundCategory = 'ui' | 'gallery' | 'assistant' | 'store' | 'feedback' | 'studio' | 'particles' | 'ambient';
export interface SoundEvent { id: string; label: string; category: SoundCategory; file: string; alt: string; volume: number; gap: number; jitter: number; on: boolean }
/** per-event overrides saved from the portal: on/off, volume, and a library name or an uploaded file URL */
export interface SoundEventSetting { on?: boolean; volume?: number; file?: string }
export interface SoundSettings { defaultOn: boolean; master: number; categories: Partial<Record<SoundCategory, number>>; events: Record<string, SoundEventSetting> }
export const SOUND_CATEGORIES: { id: SoundCategory; label: string; volume: number }[];
export const SOUND_LIBRARY: string[];
export const SOUND_EVENTS: SoundEvent[];
export const SOUND_EVENT_IDS: string[];
export const SOUND_DEFAULTS: SoundSettings;
export function librarySrc(name: string, ext: 'webm' | 'mp3'): string;
