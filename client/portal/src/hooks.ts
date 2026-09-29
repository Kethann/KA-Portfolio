// Data hooks: load-with-states, live polling that pauses when hidden, persisted prefs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { get, onDataChanged } from './api';
import { useWinDirty } from './shell/desk';

export type Load<T> = { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void>; setData: (fn: T | ((d: T | null) => T | null)) => void };

// GET `path` (re-runs when it changes). `pollMs` keeps it live while the tab and window are visible.
export function useLoad<T = any>(path: string | null, { pollMs = 0, active = true }: { pollMs?: number; active?: boolean } = {}): Load<T>{
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const ctrl = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const edits = useRef(0);
  const wasActive = useRef(active);   // bumps on local setData so an in-flight background refresh is dropped
  const reload = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController(); ctrl.current = c;
    const mine = ++seq.current;
    setLoading(true);
    try {
      const d = await get<T>(path, c.signal);
      if (mine === seq.current){ setDataState(d); setError(null); }
    } catch (err: any){
      if (err?.name !== 'AbortError' && mine === seq.current) setError(err?.message || 'Something went wrong.');
    } finally { if (mine === seq.current) setLoading(false); }
  }, [path]);
  useEffect(() => { setDataState(null); setError(null); void reload(); return () => ctrl.current?.abort(); }, [reload]);
  useEffect(() => {
    if (!path) return;
    let t: number | undefined, soon: number | undefined, stopped = false, busy = false, again = false;
    // Background refresh keeps showing the current data (no skeleton flash). Its result is dropped if
    // a reload started meanwhile (e.g. right after a save) or this view went away, so a slow refresh
    // can never put older data back on screen.
    const quiet = async () => {
      if (busy){ again = true; return; }
      busy = true;
      const mine = seq.current, edit = edits.current;
      try { const d = await get<T>(path); if (!stopped && mine === seq.current && edit === edits.current){ setDataState(d); setError(null); } }
      catch { /* keep last good data */ }
      finally { busy = false; if (again && !stopped){ again = false; void quiet(); } }
    };
    const polling = pollMs > 0 && active;
    const tick = () => { if (document.visibilityState === 'visible') void quiet(); t = window.setTimeout(tick, pollMs); };
    if (polling) t = window.setTimeout(tick, pollMs);
    if (polling && !wasActive.current) void quiet();   // window brought to the front: show current data now
    wasActive.current = active;
    const onVis = () => { if (polling && document.visibilityState === 'visible') void quiet(); };
    document.addEventListener('visibilitychange', onVis);
    // any save anywhere in the portal: refresh shortly (a burst of saves → one refresh)
    const off = onDataChanged(() => { clearTimeout(soon); soon = window.setTimeout(() => void quiet(), 250); });
    return () => { stopped = true; clearTimeout(t); clearTimeout(soon); off(); document.removeEventListener('visibilitychange', onVis); };
  }, [pollMs, active, path]);
  // local edits win over any background refresh already in flight
  const setData = useCallback((fn: any) => { edits.current++; setDataState(prev => (typeof fn === 'function' ? fn(prev) : fn)); }, []);
  return { data, error, loading, reload, setData };
}

// An editable copy of server data. New server data (a background refresh, a save in another window)
// replaces the copy only while it has no unsaved edits, so a refresh never wipes what's being typed;
// with edits, `merge` can still take server-owned fields (e.g. uploaded media). A new `resetKey`
// (a different item) always starts fresh.
const jsonEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function useDraft<T>(server: T | null | undefined, { resetKey = null, same = jsonEq, merge }: { resetKey?: unknown; same?: (a: T, b: T) => boolean; merge?: (draft: T, server: T) => T } = {}){
  const [draft, setDraft] = useState<T | null>(server ?? null);
  const base = useRef<T | null>(server ?? null);
  const key = useRef(resetKey);
  useEffect(() => {
    if (server === null || server === undefined) return;
    const switched = key.current !== resetKey;
    key.current = resetKey;
    if (!switched && server === base.current) return;
    const prevBase = base.current;
    base.current = server;
    setDraft(d => {
      if (switched || d === null || prevBase === null || same(d, prevBase) || same(d, server)) return server;
      return merge ? merge(d, server) : d;   // unsaved edits stay
    });
  }, [server, resetKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  return [draft, setDraft] as const;
}

export function usePref<T>(key: string, initial: T): [T, (v: T) => void]{
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem('ka.portal.' + key); return s === null ? initial : JSON.parse(s); } catch { return initial; }
  });
  const set = useCallback((next: T) => {
    setV(next);
    try { localStorage.setItem('ka.portal.' + key, JSON.stringify(next)); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent('ka:pref', { detail: { key, value: next } }));   // keep every user of this pref in sync
  }, [key]);
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent).detail; if (d.key === key) setV(d.value); };
    window.addEventListener('ka:pref', on);
    return () => window.removeEventListener('ka:pref', on);
  }, [key]);
  return [v, set];
}

export function useMedia(query: string){
  const [m, setM] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => { const q = matchMedia(query); const on = () => setM(q.matches); on(); q.addEventListener('change', on); return () => q.removeEventListener('change', on); }, [query]);
  return m;
}

export function useDebounced<T>(value: T, ms = 250){
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Warns before closing the tab with unsaved edits, and (unless the draft outlives the window, like the
// shared site draft) before closing the window that holds them.
export function useUnsavedGuard(dirty: boolean, { window: perWindow = true }: { window?: boolean } = {}){
  useWinDirty(perWindow && dirty);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}
