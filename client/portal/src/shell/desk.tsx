// Window manager state: one window per app, z-order, minimise/zoom, geometry saved per app, and the
// URL hash (#app/route) kept in sync so links like /portal/#messages/<id> open the right place.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { APP, APPS } from '../apps/registry';
import { useConfirm } from '../ui';

// Which window a component lives in (set by <Window>), and which windows hold unsaved edits.
export const WinIdCtx = createContext('');
const dirtyWins = new Map<string, number>();
export function useWinDirty(dirty: boolean){
  const id = useContext(WinIdCtx);
  useEffect(() => {
    if (!id || !dirty) return;
    dirtyWins.set(id, (dirtyWins.get(id) || 0) + 1);
    return () => { const n = (dirtyWins.get(id) || 1) - 1; if (n) dirtyWins.set(id, n); else dirtyWins.delete(id); };
  }, [id, dirty]);
}

export type Win = { id: string; route: string; x: number; y: number; w: number; h: number; z: number; min: boolean; max: boolean; opened: number };
type Desk = {
  wins: Win[]; focused: string | null;
  open: (id: string, route?: string) => void; close: (id: string) => void; focus: (id: string) => void;
  minimize: (id: string) => void; toggleMax: (id: string) => void; setRoute: (id: string, route: string) => void;
  setGeom: (id: string, g: Partial<Pick<Win, 'x' | 'y' | 'w' | 'h'>>) => void; area: () => DOMRect; cycle: (dir: 1 | -1) => void; tile: (id: string, side: 'left' | 'right') => void;
};
const Ctx = createContext<Desk | null>(null);
export const useDesk = () => useContext(Ctx)!;

const GEOM_KEY = 'ka.portal.geom';
function loadGeoms(): Record<string, { x: number; y: number; w: number; h: number }>{
  try { return JSON.parse(localStorage.getItem(GEOM_KEY) || '{}') || {}; } catch { return {}; }
}
function saveGeoms(g: Record<string, unknown>){ try { localStorage.setItem(GEOM_KEY, JSON.stringify(g)); } catch { /* private mode */ } }

function parseHash(): { app: string; route: string } | null {
  const raw = location.hash.replace(/^#\/?/, '');
  let h = raw;
  try { h = decodeURIComponent(raw); } catch { /* keep it as typed */ }
  if (!h) return null;
  const [app, ...rest] = h.split('/');
  return APP[app] ? { app, route: rest.join('/') } : null;
}

export function DeskProvider({ areaRef, children }: { areaRef: React.RefObject<HTMLElement>; children: ReactNode }){
  const [wins, setWins] = useState<Win[]>([]);
  const z = useRef(10);
  const geoms = useRef(loadGeoms());
  const area = useCallback(() => areaRef.current?.getBoundingClientRect() || new DOMRect(0, 0, innerWidth, innerHeight), [areaRef]);

  const place = useCallback((id: string): Pick<Win, 'x' | 'y' | 'w' | 'h'> => {
    const a = area(), def = APP[id].size, saved = geoms.current[id];
    const w = Math.min(saved?.w || def[0], Math.max(360, a.width - 24)), h = Math.min(saved?.h || def[1], Math.max(300, a.height - 16));
    if (saved) return { w, h, x: clamp(saved.x, 0, Math.max(0, a.width - w)), y: clamp(saved.y, 0, Math.max(0, a.height - 60)) };
    // cascade new windows from the centre
    const n = APPS.findIndex(x => x.id === id) % 6;
    return { w, h, x: clamp(Math.round((a.width - w) / 2) + (n - 3) * 26, 0, Math.max(0, a.width - w)), y: clamp(Math.round((a.height - h) / 2.6) + (n - 3) * 22, 0, Math.max(0, a.height - h)) };
  }, [area]);

  const open = useCallback((id: string, route?: string) => {
    if (!APP[id]) return;
    setWins(ws => {
      const zi = ++z.current;
      const cur = ws.find(w => w.id === id);
      if (cur) return ws.map(w => w.id === id ? { ...w, z: zi, min: false, route: route ?? w.route } : w);
      return [...ws, { id, route: route || '', z: zi, min: false, max: false, opened: Date.now(), ...place(id) }];
    });
  }, [place]);
  const confirm = useConfirm();
  const close = useCallback((id: string) => {
    const shut = () => setWins(ws => ws.filter(w => w.id !== id));
    if (!dirtyWins.has(id)) return shut();
    void confirm({ title: `Close ${APP[id]?.title || 'this window'}?`, body: 'It has changes you haven’t saved. Closing discards them.', confirm: 'Discard and close', danger: true })
      .then(ok => { if (ok){ dirtyWins.delete(id); shut(); } });
  }, [confirm]);
  const focus = useCallback((id: string) => setWins(ws => {
    const top = ws.reduce((m, w) => Math.max(m, w.z), 0);
    const cur = ws.find(w => w.id === id);
    if (!cur || (cur.z === top && !cur.min)) return ws;
    const zi = ++z.current;
    return ws.map(w => w.id === id ? { ...w, z: zi, min: false } : w);
  }), []);
  const minimize = useCallback((id: string) => setWins(ws => ws.map(w => w.id === id ? { ...w, min: true } : w)), []);
  const toggleMax = useCallback((id: string) => setWins(ws => ws.map(w => w.id === id ? { ...w, max: !w.max } : w)), []);
  const setRoute = useCallback((id: string, route: string) => setWins(ws => ws.map(w => w.id === id && w.route !== route ? { ...w, route } : w)), []);
  const setGeom = useCallback((id: string, g: Partial<Pick<Win, 'x' | 'y' | 'w' | 'h'>>) => {
    setWins(ws => ws.map(w => {
      if (w.id !== id) return w;
      const next = { ...w, ...g, max: false };
      geoms.current = { ...geoms.current, [id]: { x: next.x, y: next.y, w: next.w, h: next.h } };
      return next;
    }));
  }, []);
  // keep windows on screen when the viewport shrinks (tablet rotation, browser resize)
  useEffect(() => {
    let raf = 0;
    const fit = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
      const a = area();
      setWins(ws => {
        let changed = false;
        const next = ws.map(w => {
          const nw = Math.min(w.w, Math.max(360, a.width - 24)), nh = Math.min(w.h, Math.max(300, a.height - 16));
          const nx = clamp(w.x, 0, Math.max(0, a.width - nw)), ny = clamp(w.y, 0, Math.max(0, a.height - 60));
          if (nw === w.w && nh === w.h && nx === w.x && ny === w.y) return w;
          changed = true;
          return { ...w, w: nw, h: nh, x: nx, y: ny };
        });
        return changed ? next : ws;
      });
    }); };
    addEventListener('resize', fit);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); };
  }, [area]);
  // persist geometry lazily (not on every pointer move)
  useEffect(() => { const t = setTimeout(() => saveGeoms(geoms.current), 400); return () => clearTimeout(t); }, [wins]);
  const tile = useCallback((id: string, side: 'left' | 'right') => {
    const a = area(), w = Math.round(a.width / 2);
    setGeom(id, { x: side === 'left' ? 0 : a.width - w, y: 0, w, h: Math.round(a.height) });
    focus(id);
  }, [area, setGeom, focus]);

  const visible = wins.filter(w => !w.min).sort((a, b) => b.z - a.z);
  const focused = visible[0]?.id || null;
  const cycle = useCallback((dir: 1 | -1) => {
    const order = [...wins].filter(w => !w.min).sort((a, b) => b.z - a.z);
    if (order.length < 2) return;
    const target = dir === 1 ? order[order.length - 1] : order[1];
    focus(target.id);
  }, [wins, focus]);

  // hash ⇄ focused window
  const booted = useRef(false);
  useEffect(() => {
    if (!booted.current){ booted.current = true; const h = parseHash(); open(h?.app || 'overview', h?.route); }
    // attached on every run (StrictMode runs effects twice in development)
    const onHash = () => { const x = parseHash(); if (x) open(x.app, x.route); };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, [open]);
  const focusedRoute = wins.find(w => w.id === focused)?.route;
  useEffect(() => {
    const next = focused ? `#${focused}${focusedRoute ? '/' + focusedRoute : ''}` : '#';
    if (location.hash !== next) history.replaceState(null, '', next);
    document.title = focused ? `${APP[focused].title} · KA Portal` : 'KA Portal';
  }, [focused, focusedRoute]);

  const value = useMemo(() => ({ wins, focused, open, close, focus, minimize, toggleMax, setRoute, setGeom, area, cycle, tile }), [wins, focused, open, close, focus, minimize, toggleMax, setRoute, setGeom, area, cycle, tile]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
