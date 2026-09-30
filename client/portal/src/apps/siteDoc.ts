// One shared draft of the site document for the Studio and Content apps: edits in either window
// show up in both, and one Save commits everything (the server checks the revision, so another
// device's newer save is never overwritten silently).
import { useSyncExternalStore } from 'react';
import { get, put } from '../api';

export type SiteImage = { id: string; slug: string; title: string; cat: string; description: string; technologies: string[]; link: string; downloadable?: boolean; src?: string; widths: number[]; full: number; width?: number; height?: number };
export type SiteDoc = {
  revision: number; details: Record<string, any> & { customFonts: { family: string; url: string }[] }; folders: string[]; images: SiteImage[];
  notice: { enabled: boolean; text: string; tone: 'info' | 'warning' }; visibility: { navGallery: boolean; navAbout: boolean; autoFullscreen?: boolean };
  stacks: { loop: boolean; covers: Record<string, string> }; layoutOverrides: Record<string, Record<string, { x: number; y: number; scale: number }>>;
  branding: { enabled: boolean; logoUrl: string }; elementStyles: Record<string, any>; socialLinks: { label: string; url: string; icon: string }[];
  passCard: PassDraft;
};
export type PassDraft = { label: string; logoUrl: string; logoSize: number; showTag: boolean; tagText: string; titleFont: string; priceFont: string;
  textPosition: 'bottom' | 'center' | 'top'; pricePosition: 'right' | 'left' | 'below'; stampText: string; foil: boolean; dim: number };
export const PASS_DRAFT_DEFAULTS: PassDraft = { label: 'KA PASS', logoUrl: '', logoSize: 24, showTag: true, tagText: '', titleFont: '', priceFont: '',
  textPosition: 'bottom', pricePosition: 'right', stampText: 'PAID', foil: true, dim: 55 };
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
  return { ...d, notice: d.notice || { enabled: false, text: '', tone: 'info' }, visibility: { navGallery: d.visibility?.navGallery ?? true, navAbout: d.visibility?.navAbout ?? true, autoFullscreen: d.visibility?.autoFullscreen ?? true },
    stacks: d.stacks || { loop: true, covers: {} }, layoutOverrides: d.layoutOverrides || { mobile: {}, tablet: {}, desktop: {} }, branding: d.branding || { enabled: false, logoUrl: '' },
    elementStyles: d.elementStyles || {}, socialLinks: d.socialLinks || [], passCard: { ...PASS_DRAFT_DEFAULTS, ...(d.passCard || {}) }, details: { ...d.details, customFonts: d.details?.customFonts || [] } };
}
export function updateSite(fn: (d: SiteDoc) => SiteDoc){ if (state.doc) emit({ doc: fn(state.doc) }); }
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
