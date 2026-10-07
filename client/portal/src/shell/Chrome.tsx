// Desktop chrome: menu bar, dock (with magnification), command palette, shortcut sheet, first-run tour,
// the phone home screen, and the global keyboard shortcuts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as RKeyboardEvent, ReactNode } from 'react';
import { APPS, APP } from '../apps/registry';
import { useDesk } from './desk';
import { Icon } from '../icons';
import { get, post } from '../api';
import { Modal, useConfirm, useFocusTrap, useToast } from '../ui';
import { useDebounced, useLoad, usePref } from '../hooks';
import { TZ } from '../format';
import { useFullscreen } from './fullscreen';
import { useRotation } from './rotate';
import { ChartBar, ChatCircleText, DownloadSimple, Gauge, GearSix, GlobeHemisphereWest, Images, Lightbulb, Package, Palette as PaletteGlyph, Receipt, Scales, Ticket } from '@phosphor-icons/react';
import type { Icon as PhIcon } from '@phosphor-icons/react';

// App tiles use Phosphor's two-tone ("duotone") glyphs: modern, and they read like iOS icons on glass.
const GLYPH: Record<string, PhIcon> = { overview: Gauge, products: Package, orders: Receipt, reports: ChartBar, coupons: Ticket, downloads: DownloadSimple,
  visitors: GlobeHemisphereWest, messages: ChatCircleText, tips: Lightbulb, studio: PaletteGlyph, content: Images, legal: Scales, settings: GearSix };
// "Obsidian glass": every tile is the same dark glass; each app is told apart by its symbol's soft colour.
const HUE: Record<string, string> = { overview: '#FFB26B', products: '#A5B4FC', orders: '#6EE7B7', reports: '#7DD3FC', coupons: '#F9A8D4', downloads: '#BEF264',
  visitors: '#5EEAD4', messages: '#93C5FD', tips: '#FDE68A', studio: '#D8B4FE', content: '#FDBA74', legal: '#E7E5E4', settings: '#D6D3D1' };
import logo from '../assets/ka-logo.png';

export type Theme = 'system' | 'dark' | 'light';
export type Accent = 'ember' | 'crimson';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';
export const ALT = isMac ? '⌥' : 'Alt';

// ---- user activity: live polling stops after 10 idle minutes, so the server's idle timeout still works
let lastInput = Date.now();
if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
export function useUserActive(ms = 10 * 60e3){
  const [active, setActive] = useState(true);
  useEffect(() => { const t = setInterval(() => setActive(Date.now() - lastInput < ms), 15e3); return () => clearInterval(t); }, [ms]);
  return active;
}

// ---- menu bar ------------------------------------------------------------------------------------
type MenuItem = { label: string; run?: () => void; hint?: string; checked?: boolean; danger?: boolean; sep?: boolean; disabled?: boolean };
function Menu({ label, button, items, className }: { label: string; button: ReactNode; items: MenuItem[]; className?: string }){
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const real = items.filter(i => !i.sep && !i.disabled);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!btn.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('pointerdown', off, true);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus());
    return () => removeEventListener('pointerdown', off, true);
  }, [open]);
  const onKey = (e: RKeyboardEvent) => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') || [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown'){ e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
    else if (e.key === 'ArrowUp'){ e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab'){ setOpen(false); if (e.key === 'Escape') btn.current?.focus(); }
    else if (e.key === 'Home'){ e.preventDefault(); els[0]?.focus(); }
    else if (e.key === 'End'){ e.preventDefault(); els[els.length - 1]?.focus(); }
  };
  return (
    <div className={'mb-menu ' + (className || '')}>
      <button ref={btn} type="button" className={'mb-btn' + (open ? ' open' : '')} aria-haspopup="menu" aria-expanded={open} aria-label={label}
        onClick={() => setOpen(o => !o)} onKeyDown={e => { if (e.key === 'ArrowDown'){ e.preventDefault(); setOpen(true); } }}>{button}</button>
      {open && real.length > 0 && (
        <div ref={list} className="menu-pop" role="menu" aria-label={label} onKeyDown={onKey}>
          {items.map((it, i) => it.sep ? <div key={i} className="menu-sep" role="separator" /> : (
            <button key={i} type="button" role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={it.checked} disabled={it.disabled} tabIndex={-1}
              className={'menu-item' + (it.danger ? ' danger' : '')} onClick={() => { setOpen(false); it.run?.(); }}>
              <span className="menu-check">{it.checked ? <Icon name="check" size={13} /> : null}</span>
              <span className="menu-label">{it.label}</span>{it.hint && <kbd>{it.hint}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Clock(){
  const fmt = useMemo(() => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), []);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15e3); return () => clearInterval(t); }, []);
  return <time className="mb-clock" dateTime={now.toISOString()} title="India Standard Time">{fmt.format(now)}</time>;
}

export function MenuBar({ theme, setTheme, accent, setAccent, pulse, onPalette, onShortcuts, onTour, onSignOut, email, fs }: {
  theme: Theme; setTheme: (t: Theme) => void; accent: Accent; setAccent: (a: Accent) => void; pulse: any; onPalette: () => void; onShortcuts: () => void; onTour: () => void; onSignOut: (everywhere: boolean) => void; email: string;
  fs: ReturnType<typeof useFullscreen>;
}){
  const desk = useDesk();
  const f = desk.focused;
  const openWins = desk.wins;
  const toast = useToast();
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;   // phones and tablets: the only screens that rotate
  const rot = useRotation(async () => { if (!fs.active) await fs.toggle(); }, (text, ok) => toast.show(text, { tone: ok ? 'success' : 'info' }));
  return (
    <nav className="menubar" aria-label="Portal menu bar">
      <Menu label="KA Portal menu" className="mb-logo" button={<img src={logo} alt="" width={18} height={18} />} items={[
        { label: 'Open Overview', run: () => desk.open('overview') },
        { label: 'Settings…', run: () => desk.open('settings'), hint: `${ALT}+,` },
        { sep: true, label: '' },
        { label: 'Take the tour', run: onTour },
        { label: 'Keyboard shortcuts', run: onShortcuts, hint: '?' },
        { label: 'View the site', run: () => window.open('/', '_blank', 'noopener') },
        { sep: true, label: '' },
        { label: 'Sign out', run: () => onSignOut(false) },
        { label: 'Sign out everywhere…', run: () => onSignOut(true), danger: true }
      ]} />
      <span className="mb-app">{f ? APP[f].title : 'Desktop'}</span>
      <Menu label="View" button="View" className="mb-hide-sm" items={[
        { label: 'Match system', checked: theme === 'system', run: () => setTheme('system') },
        { label: 'Dark', checked: theme === 'dark', run: () => setTheme('dark') },
        { label: 'Light', checked: theme === 'light', run: () => setTheme('light'), hint: `${ALT}+T` },
        { sep: true, label: '' },
        { label: 'Ember accent', checked: accent === 'ember', run: () => setAccent('ember') },
        { label: 'Crimson accent', checked: accent === 'crimson', run: () => setAccent('crimson') }
      ]} />
      <Menu label="Window" button="Window" className="mb-hide-sm" items={[
        { label: 'Minimise', run: () => f && desk.minimize(f), hint: `${ALT}+M`, disabled: !f },
        { label: 'Zoom', run: () => f && desk.toggleMax(f), disabled: !f },
        { label: 'Tile left', run: () => f && desk.tile(f, 'left'), disabled: !f },
        { label: 'Tile right', run: () => f && desk.tile(f, 'right'), disabled: !f },
        { label: 'Close', run: () => f && desk.close(f), hint: `${ALT}+W`, disabled: !f },
        ...(fs.available ? [{ sep: true, label: '' }, { label: fs.active ? 'Exit full screen' : 'Enter full screen', run: () => void fs.toggle() }] : []),
        { sep: true, label: '' },
        ...(openWins.length ? openWins.map(w => ({ label: APP[w.id].title, checked: w.id === f, run: () => desk.focus(w.id) })) : [{ label: 'No open windows', disabled: true }])
      ]} />
      <div className="mb-spacer" />
      {pulse?.needsAttention > 0 && <button type="button" className="mb-pill warn" onClick={() => desk.open('orders', 'attention')} title="Orders that need a look"><Icon name="alert" size={13} /> {pulse.needsAttention}</button>}
      <button type="button" className="mb-pill" onClick={() => desk.open('visitors', 'live')} title="Visitors in the last 5 minutes" aria-label={`${pulse?.liveVisitors ?? 0} live visitors`}>
        <span className={'live-dot' + (pulse?.liveVisitors ? ' on' : '')} aria-hidden="true" />{pulse?.liveVisitors ?? '–'}
      </button>
      <button type="button" className="mb-icon" onClick={() => desk.open('messages', 'inbox')} aria-label={`Messages, ${pulse?.newMessages || 0} new`} title="Messages">
        <Icon name="bell" size={15} />{pulse?.newMessages > 0 && <span className="mb-badge">{pulse.newMessages > 99 ? '99+' : pulse.newMessages}</span>}
      </button>
      {touch && <button type="button" className={'mb-icon' + (rot.mode !== 'auto' ? ' is-on' : '')} onClick={() => void rot.next()}
        aria-label={`Rotate screen: ${rot.mode === 'auto' ? 'follows the device' : rot.mode}. Tap to change`} title={rot.mode === 'auto' ? 'Rotate: auto (tap for landscape)' : rot.mode === 'landscape' ? 'Rotate: landscape (tap for portrait)' : 'Rotate: portrait (tap for auto)'}>
        <Icon name="refresh" size={15} />{rot.mode !== 'auto' && <span className="mb-badge" aria-hidden="true">{rot.mode === 'landscape' ? 'L' : 'P'}</span>}</button>}
      {fs.available && <button type="button" className="mb-icon" onClick={() => void fs.toggle()} aria-label={fs.active ? 'Exit full screen' : 'Full screen'} aria-pressed={fs.active} title={fs.active ? 'Exit full screen' : 'Full screen'}>
        <Icon name={fs.active ? 'unmaximize' : 'maximize'} size={15} /></button>}
      <button type="button" className="mb-icon mb-search" onClick={onPalette} aria-label={`Search and commands (${MOD}+K)`} title={`Search (${MOD}+K)`}><Icon name="search" size={15} /></button>
      <Clock />
      <Menu label="Account" className="mb-hide-sm" button={<span className="mb-avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span>} items={[
        { label: email, disabled: true },
        { label: 'Security settings', run: () => desk.open('settings', 'security') },
        { label: 'Sign out', run: () => onSignOut(false) }
      ]} />
    </nav>
  );
}

// ---- dock ----------------------------------------------------------------------------------------
export function AppTile({ id, size }: { id: string; size?: number }){
  const a = APP[id];
  return (
    <span className={'tile tile-' + id} style={{ '--g': HUE[id] || '#E7E5E4', width: size, height: size } as React.CSSProperties} aria-hidden="true">
      {id === 'assistant' ? <img src={logo} alt="" /> : (() => { const G = GLYPH[id]; const px = Math.round((size || 52) * 0.56);
        return G ? <G className="glyph" size={px} weight="duotone" color="currentColor" aria-hidden="true" /> : <Icon name={a.icon} size={Math.round((size || 52) * 0.5)} />; })()}
    </span>
  );
}

export function Dock({ pulse, compact }: { pulse: any; compact: boolean }){
  const desk = useDesk();
  const ref = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const raf = useRef(0);
  const [tabIdx, setTabIdx] = useState(0);
  const magnify = !compact && typeof matchMedia !== 'undefined' && matchMedia('(pointer: fine) and (prefers-reduced-motion: no-preference)').matches;
  const onMove = (e: React.PointerEvent) => {
    if (!magnify || e.pointerType !== 'mouse') return;
    const x = e.clientX;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      for (const el of items.current){
        if (!el) continue;
        const r = el.getBoundingClientRect(), d = Math.abs(x - (r.left + r.width / 2)), range = 150;
        el.style.setProperty('--s', String(1 + 0.55 * Math.max(0, Math.cos(Math.min(d / range, 1) * Math.PI / 2)) ** 2));
        el.style.setProperty('--lx', String(Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / range))));   // glass sheen leans toward the pointer
      }
    });
  };
  const reset = () => { cancelAnimationFrame(raf.current); for (const el of items.current){ el?.style.setProperty('--s', '1'); el?.style.setProperty('--lx', '0'); } };
  const click = (id: string) => {
    const w = desk.wins.find(x => x.id === id);
    if (w && !w.min && desk.focused === id && !compact) desk.minimize(id);
    else desk.open(id);
  };
  const onKey = (e: RKeyboardEvent) => {
    const n = APPS.length;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : (tabIdx + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    setTabIdx(next); items.current[next]?.querySelector('button')?.focus();
  };
  return (
    <div className={'dock-wrap' + (compact ? ' compact' : '')}>
      <div ref={ref} className="dock" role="toolbar" aria-label="Apps" onPointerMove={onMove} onPointerLeave={reset} onKeyDown={onKey} style={{ '--n': APPS.length } as React.CSSProperties}>
        {APPS.map((a, i) => {
          const w = desk.wins.find(x => x.id === a.id);
          const badge = a.id === 'messages' ? pulse?.newMessages : 0;
          return (
            <div key={a.id} ref={el => { items.current[i] = el; }} className={'dock-item' + (w ? ' running' : '') + (desk.focused === a.id ? ' front' : '')}>
              <button type="button" tabIndex={i === tabIdx ? 0 : -1} onClick={() => click(a.id)} onFocus={() => setTabIdx(i)}
                aria-label={a.title + (badge ? `, ${badge} new` : '') + (w ? ', open' : '')} data-tip={a.title}>
                <AppTile id={a.id} />
                {badge > 0 && <span className="dock-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
                {compact && <span className="dock-label">{a.title.replace('Licenses & Legal', 'Legal').replace('KA Assistant', 'Assistant')}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Phone home screen: shown when no window is open on small screens.
export function HomeScreen(){
  const desk = useDesk();
  return (
    <div className="home" role="navigation" aria-label="Apps">
      <div className="home-grid">
        {APPS.map(a => (
          <button key={a.id} type="button" className="home-app" onClick={() => desk.open(a.id)}>
            <AppTile id={a.id} size={58} /><span>{a.title.replace('Licenses & Legal', 'Legal')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- command palette -----------------------------------------------------------------------------
type Cmd = { id: string; title: string; kind: string; meta?: string; icon?: string; app?: string; run: () => void };
export function Palette({ onClose, commands }: { onClose: () => void; commands: Cmd[] }){
  const desk = useDesk();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const dq = useDebounced(q, 180);
  const [remote, setRemote] = useState<Cmd[]>([]);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, true, onClose);
  useEffect(() => {
    if (dq.trim().length < 2){ setRemote([]); return; }
    const c = new AbortController();
    get<{ results: any[] }>(`/search?q=${encodeURIComponent(dq.trim())}`, c.signal)
      .then(r => setRemote(r.results.map((x, i) => ({ id: 'r' + i, title: x.title, kind: x.kind, meta: x.meta, app: x.app, run: () => desk.open(x.app, x.route) }))))
      .catch(() => {});
    return () => c.abort();
  }, [dq, desk]);
  const local = useMemo(() => {
    const t = q.trim().toLowerCase();
    const apps: Cmd[] = APPS.map(a => ({ id: 'app-' + a.id, title: a.title, kind: 'App', app: a.id, run: () => desk.open(a.id), meta: a.keywords }));
    const all = [...apps, ...commands];
    if (!t) return all.slice(0, 20);
    const words = t.split(/\s+/);
    return all.map(c => {
      const hay = (c.title + ' ' + (c.meta || '') + ' ' + c.kind).toLowerCase();
      if (!words.every(w => hay.includes(w))) return null;
      return { c, score: c.title.toLowerCase().startsWith(t) ? 0 : c.title.toLowerCase().includes(t) ? 1 : 2 };
    }).filter(Boolean).sort((a, b) => a!.score - b!.score).map(x => x!.c).slice(0, 12);
  }, [q, commands, desk]);
  const results = [...local, ...remote];
  useEffect(() => setSel(0), [q, remote.length]);
  const run = (c: Cmd | undefined) => { if (!c) return; onClose(); c.run(); };
  return (
    <div className="palette-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} className="palette" role="dialog" aria-modal="true" aria-label="Search and commands">
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search orders, products, messages… or type a command"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[sel] ? 'pal-' + results[sel].id : undefined} aria-autocomplete="list"
            onKeyDown={e => {
              if (e.key === 'ArrowDown'){ e.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)); }
              else if (e.key === 'ArrowUp'){ e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
              else if (e.key === 'Enter'){ e.preventDefault(); run(results[sel]); }
            }} />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-list" className="palette-list" role="listbox" aria-label="Results">
          {results.map((c, i) => (
            <li key={c.id} id={'pal-' + c.id} role="option" aria-selected={i === sel} className={i === sel ? 'sel' : ''} onPointerMove={() => setSel(i)} onClick={() => run(c)}>
              {c.app ? <AppTile id={c.app} size={24} /> : <span className="pal-ic"><Icon name={c.icon || 'sparkle'} size={14} /></span>}
              <span className="pal-title">{c.title}</span>
              <span className="pal-kind">{c.kind === 'App' ? 'Open app' : c.kind}{c.meta && c.kind !== 'App' ? ` · ${c.meta}` : ''}</span>
            </li>
          ))}
          {!results.length && <li className="pal-empty" role="presentation">No matches. Try an order number, email or product name.</li>}
        </ul>
        <div className="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>{MOD}</kbd><kbd>K</kbd> toggle</span></div>
      </div>
    </div>
  );
}

// ---- shortcut sheet ------------------------------------------------------------------------------
export function Shortcuts({ onClose }: { onClose: () => void }){
  const rows: [string, string][] = [
    [`${MOD} K`, 'Search and commands'], [`${ALT} 1 … 9, 0`, 'Open the first ten dock apps'], [`${ALT} W`, 'Close the front window'], [`${ALT} M`, 'Minimise the front window'],
    [`${ALT} \``, 'Switch between windows'], [`${ALT} T`, 'Switch dark / light'], [`${ALT} ,`, 'Settings'], ['?', 'This list'], ['Esc', 'Close dialogs and menus'],
    ['↑ ↓ Enter', 'Move through tables and open a row'], ['Double-click title bar', 'Zoom a window'], ['Drag to screen edge', 'Tile left / right or maximise']
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <dl className="shortcut-list">{rows.map(([k, v]) => <div key={k}><dt>{k.split(' ').map((p, i) => <kbd key={i}>{p}</kbd>)}</dt><dd>{v}</dd></div>)}</dl>
    </Modal>
  );
}

// ---- first-run tour ------------------------------------------------------------------------------
const STEPS = [
  { sel: '.dock', title: 'Your apps live in the dock', text: 'Each app opens in its own window. Click an open app again to minimise it.' },
  { sel: '.mb-search', title: `Find anything with ${MOD}+K`, text: 'Search orders, buyers, products and messages, or run a command like “New coupon”.' },
  { sel: '.win.focused .win-bar', title: 'Windows work like a Mac', text: 'Drag the title bar, resize from any edge, drag to a screen edge to tile, double-click to zoom.' },
  { sel: '.mb-pill', title: 'Live at a glance', text: 'Live visitors, new messages and orders that need attention stay in the menu bar.' },
  { sel: '.mb-logo', title: 'Help is here', text: 'Shortcuts, this tour, theme and sign-out live under the KA menu.' }
];
export function Tour({ onDone }: { onDone: () => void }){
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, true, onDone);
  useEffect(() => {
    const find = () => { const el = document.querySelector(STEPS[i].sel); setRect(el ? el.getBoundingClientRect() : null); };
    find(); const t = setTimeout(find, 350);
    addEventListener('resize', find);
    return () => { clearTimeout(t); removeEventListener('resize', find); };
  }, [i]);
  const s = STEPS[i];
  const below = !rect || rect.top < innerHeight / 2;
  const pos = rect ? { left: Math.min(innerWidth - 336, Math.max(16, rect.left + rect.width / 2 - 160)), top: below ? rect.bottom + 14 : undefined, bottom: below ? undefined : innerHeight - rect.top + 14 } : { left: innerWidth / 2 - 160, top: innerHeight / 3 };
  return (
    <div className="tour-scrim">
      {rect && <div className="tour-ring" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden="true" />}
      <div ref={box} className="tour-card" style={pos} role="dialog" aria-modal="true" aria-labelledby="tour-t" aria-describedby="tour-d">
        <div className="tour-step">{i + 1} of {STEPS.length}</div>
        <h2 id="tour-t">{s.title}</h2><p id="tour-d">{s.text}</p>
        <div className="tour-actions">
          <button type="button" className="btn ghost" onClick={onDone}>Skip</button>
          {i > 0 && <button type="button" className="btn" onClick={() => setI(i - 1)}>Back</button>}
          <button type="button" className="btn primary" data-autofocus onClick={() => (i === STEPS.length - 1 ? onDone() : setI(i + 1))}>{i === STEPS.length - 1 ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

// ---- desktop assembly ----------------------------------------------------------------------------
export function useChrome({ email, onSignedOut }: { email: string; onSignedOut: () => void }){
  const desk = useDesk();
  const toast = useToast();
  const confirm = useConfirm();
  const [theme, setTheme] = usePref<Theme>('theme', 'system');
  const [accent, setAccent] = usePref<Accent>('accent', 'ember');
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [tourDone, setTourDone] = usePref('tour.v1', false);
  const [tour, setTour] = useState(false);
  const active = useUserActive();
  const fs = useFullscreen();
  const pulse = useLoad('/pulse', { pollMs: 30e3, active });
  useEffect(() => { if (!tourDone){ const t = setTimeout(() => setTour(true), 900); return () => clearTimeout(t); } }, [tourDone]);
  useEffect(() => {
    const r = document.documentElement;
    if (theme === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme);
    r.setAttribute('data-accent', accent);
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f0e0e' : '#efece8');
  }, [theme, accent]);

  const signOut = useCallback(async (everywhere: boolean) => {
    if (everywhere && !(await confirm({ title: 'Sign out everywhere?', body: 'Every device signed in to the portal, including this one, will be signed out.', confirm: 'Sign out everywhere', danger: true }))) return;
    try { await post(everywhere ? '/logout-everywhere' : '/logout'); } catch { /* signed out anyway */ }
    onSignedOut();
  }, [confirm, onSignedOut]);

  const toggleTheme = useCallback(() => {
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    setTheme(dark ? 'light' : 'dark');
    toast.show(dark ? 'Light appearance' : 'Dark appearance', { ms: 1500 });
  }, [theme, setTheme, toast]);

  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); setPalette(p => !p); return; }
      if (e.altKey && !e.ctrlKey && !e.metaKey){
        const m = /^Digit(\d)$/.exec(e.code);
        if (m){ e.preventDefault(); const n = m[1] === '0' ? 9 : Number(m[1]) - 1; if (APPS[n]) desk.open(APPS[n].id); return; }
        if (e.code === 'KeyW' && desk.focused){ e.preventDefault(); desk.close(desk.focused); return; }
        if (e.code === 'KeyM' && desk.focused){ e.preventDefault(); desk.minimize(desk.focused); return; }
        if (e.code === 'KeyT'){ e.preventDefault(); toggleTheme(); return; }
        if (e.code === 'Comma'){ e.preventDefault(); desk.open('settings'); return; }
        if (e.code === 'Backquote'){ e.preventDefault(); desk.cycle(e.shiftKey ? -1 : 1); return; }
      }
      if (e.key === '?' && !typing(e.target) && !e.ctrlKey && !e.metaKey){ e.preventDefault(); setSheet(true); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [desk, toggleTheme]);

  const commands: Cmd[] = useMemo(() => [
    { id: 'c-new-product', title: 'New product', kind: 'Command', icon: 'plus', meta: 'create artzz artifacts', run: () => desk.open('products', 'new') },
    { id: 'c-new-coupon', title: 'New coupon', kind: 'Command', icon: 'plus', meta: 'create discount code', run: () => desk.open('coupons', 'new') },
    { id: 'c-new-tip', title: 'New tip', kind: 'Command', icon: 'plus', meta: 'write article', run: () => desk.open('tips', 'new') },
    { id: 'c-inbox', title: 'Go to inbox', kind: 'Command', icon: 'inbox', meta: 'messages unread', run: () => desk.open('messages', 'inbox') },
    { id: 'c-export', title: 'Export orders (CSV)', kind: 'Command', icon: 'downloads', meta: 'download spreadsheet', run: () => desk.open('orders', 'export') },
    { id: 'c-theme', title: 'Switch dark / light', kind: 'Command', icon: 'moon', meta: 'appearance theme', run: toggleTheme },
    { id: 'c-accent', title: `Use ${accent === 'ember' ? 'Crimson' : 'Ember'} accent`, kind: 'Command', icon: 'studio', meta: 'colour theme', run: () => setAccent(accent === 'ember' ? 'crimson' : 'ember') },
    { id: 'c-shortcuts', title: 'Keyboard shortcuts', kind: 'Command', icon: 'keyboard', run: () => setSheet(true) },
    { id: 'c-tour', title: 'Take the tour', kind: 'Command', icon: 'info', run: () => setTour(true) },
    { id: 'c-backup', title: 'Back up now', kind: 'Command', icon: 'archive', meta: 'database export', run: () => desk.open('settings', 'backups') },
    { id: 'c-site', title: 'View the live site', kind: 'Command', icon: 'external', run: () => window.open('/', '_blank', 'noopener') },
    ...(fs.available ? [{ id: 'c-fullscreen', title: fs.active ? 'Exit full screen' : 'Enter full screen', kind: 'Command', icon: fs.active ? 'unmaximize' : 'maximize', meta: 'fullscreen hide browser bars', run: () => void fs.toggle() }] : []),
    { id: 'c-signout', title: 'Sign out', kind: 'Command', icon: 'logout', run: () => signOut(false) }
  ], [desk, toggleTheme, accent, setAccent, signOut, fs]);

  const overlays = <>
    {palette && <Palette onClose={() => setPalette(false)} commands={commands} />}
    {sheet && <Shortcuts onClose={() => setSheet(false)} />}
    {tour && <Tour onDone={() => { setTour(false); setTourDone(true); }} />}
    {fs.guideEl}
  </>;
  const menubar = <MenuBar theme={theme} setTheme={setTheme} accent={accent} setAccent={setAccent} pulse={pulse.data} onPalette={() => setPalette(true)}
    onShortcuts={() => setSheet(true)} onTour={() => setTour(true)} onSignOut={signOut} email={email} fs={fs} />;
  return { menubar, overlays, pulse: pulse.data };
}
