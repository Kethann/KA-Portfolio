// Types for shared/intros.js (plain JS so the Worker, the Pages router, Node and the browser bundles can all import it).
export interface IntroVersion { id: string; name: string; label: string; locked: boolean; description: string; sha256: string }
export const INTRO_VERSIONS: IntroVersion[];
export const INTRO_IDS: string[];
export const DEFAULT_INTRO: string;
export function introVersion(id: unknown): string;
