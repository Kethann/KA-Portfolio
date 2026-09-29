// One shared draft of the site document for the Studio and Content apps: edits in either window
// show up in both, and one Save commits everything (the server checks the revision, so another
// device's newer save is never overwritten silently).
import { useSyncExternalStore } from 'react';
import { get, put } from '../api';

export type SiteImage = { id: string; slug: string; title: string; cat: string; description: string; technologies: string[]; link: string; downloadable?: boolean; src?: string; widths: number[]; full: number; width?: number; height?: number };
export type SiteDoc = {
  revision: number; details: Record<string, any> & { customFonts: { family: string; url: string }[] }; folders: string[]; images: SiteImage[];
  notice: { enabled: boolean; text: string; tone: 'info' | 'warning' }; visibility: { navGallery: boolean; navAbout: boolean };
  stacks: { loop: boolean; covers: Record<string, string> }; layoutOverrides: Record<string, Record<string, { x: number; y: number; scale: number }>>;
  branding: { enabled: boolean; logoUrl: string }; elementStyles: Record<string, any>; socialLinks: { label: string; url: string; icon: string }[];
};
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
  return { ...d, notice: d.notice || { enabled: false, text: '', tone: 'info' }, visibility: d.visibility || { navGallery: true, navAbout: true },
    stacks: d.stacks || { loop: true, covers: {} }, layoutOverrides: d.layoutOverrides || { mobile: {}, tablet: {}, desktop: {} }, branding: d.branding || { enabled: false, logoUrl: '' },
    elementStyles: d.elementStyles || {}, socialLinks: d.socialLinks || [], details: { ...d.details, customFonts: d.details?.customFonts || [] } };
}
export function updateSite(fn: (d: SiteDoc) => SiteDoc){ if (state.doc) emit({ doc: fn(state.doc) }); }
export function discardSite(){ if (state.saved) emit({ doc: { ...JSON.parse(state.saved), revision: state.doc!.revision } }); }
export async function saveSite(){
  if (!state.doc || state.saving) return;
  emit({ saving: true });
  try {
    const r = withDefaults(await put<SiteDoc>('/site', state.doc));
    emit({ doc: r, saved: norm(r), saving: false });
  } catch (e){ emit({ saving: false }); throw e; }
}
export function useSite(){
  const s = useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => state);
  return { ...s, dirty: !!s.doc && norm(s.doc) !== s.saved };
}
export const thumb = (i: SiteImage, w = 480) => i.src || `/images/${i.slug}-${[...i.widths].sort((a, b) => a - b).find(x => x >= w) || i.widths[i.widths.length - 1] || 'full'}.webp`;
