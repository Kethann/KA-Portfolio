// Types for shared/intros.js (plain JS so the Worker, the Pages router, Node and the browser bundles can all import it).
export interface IntroVersion { id: string; name: string; label: string; locked: boolean; description: string; sha256?: string }
export const INTRO_VERSIONS: IntroVersion[];
export const INTRO_IDS: string[];
export const DEFAULT_INTRO: string;
export function introVersion(id: unknown): string;
export const BUBBLE_TYPES: { type: string; label: string }[];
export function cleanBubbles(input: unknown): { enabled: boolean; items: { type: string; label: string; on: boolean }[] } | null;
export function bubbleList(input: unknown): { type: string; label: string }[] | null;
export interface IntroWorld { enabled: boolean; strength: number; smoke: boolean; spread: number }
export const WORLD_DEFAULT: IntroWorld;
export function cleanWorld(input: unknown): IntroWorld | null;
export function worldSettings(input: unknown): { strength: number; smoke: boolean; spread: number } | null;
