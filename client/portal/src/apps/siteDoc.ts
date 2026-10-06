// One shared draft of the site document for the Studio and Content apps: edits in either window
// show up in both, and one Save commits everything (the server checks the revision, so another
// device's newer save is never overwritten silently).
import { useSyncExternalStore } from 'react';
import { get, put } from '../api';
import { PASS_DEFAULTS, type PassSettings } from '../../../src/store/checkout/PassCard';
import { ABOUT_DEFAULT, ABOUT_LIMITS } from '../../../../shared/about-default.js';

export type SiteImage = { id: string; slug: string; title: string; cat: string; description: string; technologies: string[]; link: string; downloadable?: boolean; hidden?: boolean; archived?: boolean; focusX?: number; focusY?: number; zoom?: number; src?: string; widths: number[]; full: number; width?: number; height?: number };
export type SiteDoc = {
  revision: number; details: Record<string, any> & { customFonts: { family: string; url: string }[] }; folders: string[]; images: SiteImage[];
  notice: { enabled: boolean; text: string; tone: 'info' | 'warning' }; visibility: { navGallery: boolean; navAbout: boolean; autoFullscreen?: boolean; downloadFormat?: 'png' | 'jpeg' };
  stacks: { loop: boolean; loops?: Record<string, boolean>; covers: Record<string, string> }; layoutOverrides: Record<string, Record<string, { x: number; y: number; scale: number }>>;
  branding: { enabled: boolean; logoUrl: string }; elementStyles: Record<string, any>; socialLinks: { label: string; url: string; icon: string }[];
  passCard: PassDraft;
  stats: StatsDraft;
  skills: SkillsDraft;
  about: AboutDraft;
};
// About > story: the bio, the journey since a year and the promo-cut clips (validated on the server; the shared defaults fill an older document)
export type JourneyStep = { title: string; text: string };
export type ReelVideo = { id: string; len: number; title: string };
export type AboutDraft = {
  bio: string;
  journey: { enabled: boolean; since: number; steps: JourneyStep[] };
  reel: { enabled: boolean; title: string; intro: string; panelLabel: string; panelText: string; buttonLabel: string; channelLabel: string; channelUrl: string; clipMin: number; clipMax: number; videos: ReelVideo[] };
};
export { ABOUT_DEFAULT, ABOUT_LIMITS };
export const aboutDefaults = (): AboutDraft => structuredClone(ABOUT_DEFAULT) as AboutDraft;
export type StatItem = { label: string; value: number; suffix: string; auto?: boolean };   // auto: the Projects total follows the portfolio items (default); off = the number typed here
export type StatsDraft = { enabled: boolean; items: StatItem[] };
export const STATS_DEFAULTS: StatsDraft = { enabled: true, items: [{ label: 'Projects', value: 150, suffix: '+' }, { label: 'Delivered', value: 120, suffix: '+' }, { label: 'Happy clients', value: 60, suffix: '+' }, { label: 'Years', value: 6, suffix: '+' }] };
// About > Skills (validated on the server; the server's SKILLS_DEFAULT fills a document saved before skills existed)
export const SKILL_ICONS = ['design', 'arts', 'motion', 'video', 'ai', 'languages', 'frontend', 'backend', 'database', 'apis', 'tools', 'star'] as const;
export const SKILL_LIMITS = { categories: 14, items: 24 };
export type SkillItem = { name: string; code: string; color: string; level: number; note: string; logo?: string; logoUrl?: string };
export type SkillCategory = { name: string; icon: string; items: SkillItem[] };
export type SkillsDraft = { enabled: boolean; title: string; intro: string; categories: SkillCategory[] };
// the checkout pass draft is exactly the card's own settings (one definition, in PassCard.tsx)
export type PassDraft = PassSettings;
export const PASS_DRAFT_DEFAULTS: PassDraft = PASS_DEFAULTS;
type State = { doc: SiteDoc | null; saved: string; error: string | null; loading: boolean; saving: boolean };
let state: State = { doc: null, saved: '', error: null, loading: false, saving: false };
const subs = new Set<() => void>();
const emit = (s: Partial<State>) => { state = { ...state, ...s }; subs.forEach(f => f()); };
const norm = (d: SiteDoc) => JSON.stringify({ ...d, revision: 0 });

export async function loadSite(force = false){
  if (state.loading || (state.doc && !force)) return;
  emit({ loading: true, error: null });
  try {
    const d = await get<SiteDoc>('/site');
    const doc = withDefaults(d);
    emit({ doc, saved: norm(doc), loading: false });
  } catch (e: any){ emit({ error: e.message, loading: false }); }
}
function withDefaults(d: SiteDoc): SiteDoc {
  return { ...d, notice: d.notice || { enabled: false, text: '', tone: 'info' }, visibility: { navGallery: d.visibility?.navGallery ?? true, navAbout: d.visibility?.navAbout ?? true, autoFullscreen: d.visibility?.autoFullscreen ?? true, downloadFormat: d.visibility?.downloadFormat === 'jpeg' ? 'jpeg' : 'png' },
    stacks: d.stacks || { loop: true, covers: {} }, layoutOverrides: d.layoutOverrides || { mobile: {}, tablet: {}, desktop: {} }, branding: d.branding || { enabled: false, logoUrl: '' },
    elementStyles: d.elementStyles || {}, socialLinks: d.socialLinks || [], passCard: { ...PASS_DRAFT_DEFAULTS, ...(d.passCard || {}) }, stats: d.stats ? { enabled: d.stats.enabled !== false, items: d.stats.items || [] } : STATS_DEFAULTS,
    skills: d.skills ? { enabled: d.skills.enabled !== false, title: d.skills.title || 'Skills', intro: d.skills.intro || '', categories: d.skills.categories || [] } : { enabled: true, title: 'Skills', intro: '', categories: [] }, about: d.about ? { ...aboutDefaults(), ...d.about, journey: { ...ABOUT_DEFAULT.journey, ...(d.about.journey || {}) }, reel: { ...ABOUT_DEFAULT.reel, ...(d.about.reel || {}) } } : aboutDefaults(), details: { ...d.details, customFonts: d.details?.customFonts || [] } };
}
export function updateSite(fn: (d: SiteDoc) => SiteDoc){ if (state.doc) emit({ doc: fn(state.doc) }); }
// A hide or a removal goes live at once, so the site matches what the owner just did. If other edits are still unsaved the
// draft keeps them apart (nothing half-finished is published by accident) and the caller says to press Publish.
export async function updateSiteLive(fn: (d: SiteDoc) => SiteDoc): Promise<boolean>{
  const clean = !!state.doc && norm(state.doc) === state.saved;
  updateSite(fn);
  if (!clean) return false;
  await saveSite();
  return true;
}
export function discardSite(){ if (state.saved) emit({ doc: { ...JSON.parse(state.saved), revision: state.doc!.revision } }); }
let inFlight: Promise<void> | null = null;
export function saveSite(): Promise<void>{
  if (inFlight) return inFlight;            // a second Save waits for the first instead of reporting a save that didn't happen
  if (!state.doc) return Promise.resolve();
  const sent = state.doc;
  emit({ saving: true });
  inFlight = (async () => {
    try {
      const r = withDefaults(await put<SiteDoc>('/site', sent));
      // edits typed while the save was in flight stay (and stay marked unsaved); only the revision moves on
      emit({ doc: state.doc === sent ? r : { ...state.doc!, revision: r.revision }, saved: norm(r), saving: false });
    } catch (e){ emit({ saving: false }); throw e; }
    finally { inFlight = null; }
  })();
  return inFlight;
}
// Someone saved the site elsewhere after this draft was loaded: take their revision number so the
// next save deliberately replaces their version with this draft.
export async function keepMineOverTheirs(){
  const latest = await get<SiteDoc>('/site');
  if (state.doc) emit({ doc: { ...state.doc, revision: latest.revision } });
}
export function useSite(){
  const s = useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => state);
  return { ...s, dirty: !!s.doc && norm(s.doc) !== s.saved };
}
export const thumb = (i: SiteImage, w = 480) => i.src || `/images/${i.slug}-${[...i.widths].sort((a, b) => a - b).find(x => x >= w) || i.widths[i.widths.length - 1] || 'full'}.webp`;
