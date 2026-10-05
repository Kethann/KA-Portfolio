export type SkillLogo =
  | { slug: string; k: 'b'; n: string; c: string; p: string }
  | { slug: string; k: 't'; n: string; bg: string; fg: string; t: string }
  | { slug: string; k: 'g'; n: string; p: string }
  | { slug: string; k: 'f'; n: string; g: [string, string]; p: string };
export const SKILL_LOGOS: Record<string, Omit<SkillLogo, 'slug'>>;
export const SKILL_LOGO_ALIASES: Record<string, string>;
export function skillLogoFor(item: { name?: string; logo?: string } | null | undefined): SkillLogo | null;
export const SKILL_LOGO_LIST: { slug: string; name: string; kind: 'b' | 't' | 'g' | 'f' }[];
