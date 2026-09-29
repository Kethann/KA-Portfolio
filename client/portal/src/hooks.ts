// Data hooks: load-with-states, live polling that pauses when hidden, persisted prefs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from './api';

export type Load<T> = { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void>; setData: (fn: T | ((d: T | null) => T | null)) => void };

// GET `path` (re-runs when it changes). `pollMs` keeps it live while the tab and window are visible.
export function useLoad<T = any>(path: string | null, { pollMs = 0, active = true }: { pollMs?: number; active?: boolean } = {}): Load<T>{
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const ctrl = useRef<AbortController | null>(null);
  const seq = useRef(0);
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
    if (!pollMs || !active || !path) return;
    let t: number | undefined;
    const tick = () => { if (document.visibilityState === 'visible') void quiet(); t = window.setTimeout(tick, pollMs); };
    // background refresh keeps showing the current data (no skeleton flash)
    const quiet = async () => { try { const d = await get<T>(path); setDataState(d); setError(null); } catch { /* keep last good data */ } };
    t = window.setTimeout(tick, pollMs);
    const onVis = () => { if (document.visibilityState === 'visible') void quiet(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVis); };
  }, [pollMs, active, path]);
  const setData = useCallback((fn: any) => setDataState(prev => (typeof fn === 'function' ? fn(prev) : fn)), []);
  return { data, error, loading, reload, setData };
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

// Warns before closing the tab with unsaved edits.
export function useUnsavedGuard(dirty: boolean){
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}
