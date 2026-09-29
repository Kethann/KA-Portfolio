// One app window: drag by the title bar, resize from any edge, snap to halves/maximise at screen
// edges, traffic-light controls, and an error boundary so one app failing never takes the desktop down.
// While dragging, the element is moved directly (no React re-render per frame); the result is committed on release.
import { Component, Suspense, createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, PointerEvent as RPointerEvent } from 'react';
import { APP } from '../apps/registry';
import { useDesk, clamp } from './desk';
import type { Win } from './desk';
import { Icon } from '../icons';
import { SkeletonRows } from '../ui';

// Apps put their toolbar buttons into the title bar with <WinTools>.
const WinId = createContext('');
export function WinTools({ children }: { children: ReactNode }){
  const id = useContext(WinId);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setHost(document.getElementById(`win-tools-${id}`)); }, [id]);
  return host ? createPortal(children, host) : null;
}

const MIN_W = 360, MIN_H = 260;
type Snap = 'left' | 'right' | 'max' | null;

export function Window({ win, compact }: { win: Win; compact: boolean }){
  const desk = useDesk();
  const app = APP[win.id];
  const el = useRef<HTMLElement>(null);
  const [snap, setSnap] = useState<Snap>(null);
  const focused = desk.focused === win.id;
  const go = useCallback((route: string) => desk.setRoute(win.id, route), [desk, win.id]);

  const startDrag = (e: RPointerEvent) => {
    if (compact || e.button !== 0 || (e.target as HTMLElement).closest('button,input,a,select,[data-nodrag]')) return;
    desk.focus(win.id);
    const node = el.current!, a = desk.area();
    const start = { px: e.clientX, py: e.clientY, x: win.max ? e.clientX - a.left - win.w / 2 : win.x, y: win.max ? 0 : win.y };
    let x = start.x, y = start.y, moved = false, s: Snap = null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px, dy = ev.clientY - start.py;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved && win.max){ node.style.width = win.w + 'px'; node.style.height = win.h + 'px'; }
      moved = true;
      x = clamp(start.x + dx, -win.w + 120, a.width - 120);
      y = clamp(start.y + dy, 0, a.height - 40);
      node.style.transform = `translate3d(${x}px,${y}px,0)`;
      const rx = ev.clientX - a.left, ry = ev.clientY - a.top;
      s = ry < 6 ? 'max' : rx < 8 ? 'left' : rx > a.width - 8 ? 'right' : null;
      setSnap(s);
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      setSnap(null);
      if (!moved) return;
      if (s === 'max'){ desk.setGeom(win.id, { x: win.x, y: win.y }); desk.toggleMax(win.id); }
      else if (s) desk.tile(win.id, s);
      else desk.setGeom(win.id, { x, y });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };

  const startResize = (e: RPointerEvent, edge: string) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    desk.focus(win.id);
    const node = el.current!, a = desk.area();
    const s = { px: e.clientX, py: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h };
    let g = { ...s };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - s.px, dy = ev.clientY - s.py;
      g = { ...s };
      if (edge.includes('e')) g.w = clamp(s.w + dx, MIN_W, a.width - s.x);
      if (edge.includes('s')) g.h = clamp(s.h + dy, MIN_H, a.height - s.y);
      if (edge.includes('w')){ g.w = clamp(s.w - dx, MIN_W, s.x + s.w); g.x = s.x + s.w - g.w; }
      if (edge.includes('n')){ g.h = clamp(s.h - dy, MIN_H, s.y + s.h); g.y = s.y + s.h - g.h; }
      node.style.transform = `translate3d(${g.x}px,${g.y}px,0)`; node.style.width = g.w + 'px'; node.style.height = g.h + 'px';
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); desk.setGeom(win.id, g); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  };

  const full = compact || win.max;
  const style = full ? undefined : { transform: `translate3d(${win.x}px,${win.y}px,0)`, width: win.w, height: win.h };
  return (
    <>
      {snap && <div className={`snap-preview snap-${snap}`} aria-hidden="true" />}
      <section ref={el} className={'win' + (focused ? ' focused' : '') + (full ? ' maxed' : '') + (win.min ? ' minimized' : '')}
        style={{ ...style, zIndex: win.z }} aria-label={app.title} aria-hidden={win.min || undefined}
        onPointerDownCapture={() => { if (!focused) desk.focus(win.id); }} data-app={win.id} {...(win.min ? { inert: '' } as object : {})}>
        <header className="win-bar" onPointerDown={startDrag} onDoubleClick={(e) => { if (!compact && !(e.target as HTMLElement).closest('button')) desk.toggleMax(win.id); }}>
          {compact ? (
            <button type="button" className="win-back" onClick={() => desk.close(win.id)} aria-label="Back to apps"><Icon name="chevronLeft" size={18} /> Apps</button>
          ) : (
            <div className="traffic" role="group" aria-label="Window controls">
              <button type="button" className="tl tl-close" aria-label={`Close ${app.title}`} title="Close (Alt+W)" onClick={() => desk.close(win.id)}><Icon name="close" size={8} /></button>
              <button type="button" className="tl tl-min" aria-label={`Minimise ${app.title}`} title="Minimise (Alt+M)" onClick={() => desk.minimize(win.id)}><Icon name="minus" size={8} /></button>
              <button type="button" className="tl tl-max" aria-label={win.max ? 'Restore size' : 'Zoom'} title="Zoom" onClick={() => desk.toggleMax(win.id)}><Icon name="maximize" size={8} /></button>
            </div>
          )}
          <h1 className="win-title">{app.title}</h1>
          <div className="win-bar-end" id={`win-tools-${win.id}`} />
        </header>
        <div className="win-body">
          <WinId.Provider value={win.id}><Boundary name={app.title}>
            <Suspense fallback={<div className="pad"><SkeletonRows rows={8} /></div>}>
              <app.Component route={win.route} go={go} active={focused && !win.min} open={desk.open} />
            </Suspense>
          </Boundary></WinId.Provider>
        </div>
        {!full && ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(edge => <div key={edge} className={`rz rz-${edge}`} onPointerDown={(e) => startResize(e, edge)} aria-hidden="true" />)}
      </section>
    </>
  );
}

class Boundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }>{
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error){ return { error }; }
  render(){
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(String(this.state.error.message));
    return (
      <div className="empty error-state" role="alert">
        <div className="empty-ic"><Icon name="alert" size={26} /></div>
        <h3>{chunk ? 'The portal was updated' : `${this.props.name} hit a problem`}</h3>
        <p>{chunk ? 'Reload to get the latest version.' : 'Your other windows are fine. Reopen this one to try again.'}</p>
        <button type="button" className="btn" onClick={() => (chunk ? location.reload() : this.setState({ error: null }))}><Icon name="refresh" /> {chunk ? 'Reload' : 'Try again'}</button>
      </div>
    );
  }
}
