import { useEffect, useRef, useState, useCallback } from 'react';

export function useMedia(query: string){
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query), on = () => setMatch(m.matches);
    on(); m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function useDebounced<T>(value: T, ms: number){
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

// Keeps keyboard focus inside `ref` while active and returns it to the opener afterwards.
// returnTo: the element that opened the dialog (clicks do not focus buttons in every browser,
// e.g. Safari on macOS), so focus goes back to it on close instead of wherever focus happened to be.
let openModals = 0;
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean, onEscape: () => void, returnTo?: HTMLElement | null){
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const opener = returnTo || ((root.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null) || (document.activeElement as HTMLElement | null);
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select,textarea,iframe,[tabindex]:not([tabindex="-1"])')).filter(el => el.offsetParent !== null || el === document.activeElement);
    const first = focusables()[0];
    (root.querySelector<HTMLElement>('[data-autofocus]') || first || root).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape'){ e.preventDefault(); escape.current(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const activeEl = (root.getRootNode() as ShadowRoot).activeElement || document.activeElement;
      if (e.shiftKey && activeEl === list[0]){ e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && activeEl === list[list.length - 1]){ e.preventDefault(); list[0].focus(); }
    };
    root.addEventListener('keydown', onKey);
    openModals++;
    document.documentElement.classList.add('ka-modal-open');
    return () => {
      root.removeEventListener('keydown', onKey);
      // the page stays locked while any dialog is still open (the lightbox under a closing checkout)
      openModals = Math.max(0, openModals - 1);
      if (!openModals) document.documentElement.classList.remove('ka-modal-open');
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, ref, returnTo]);
}

// Horizontal swipe on touch/pen: calls onSwipe(-1 | 1) past a small threshold.
export function useSwipe(onSwipe: (dir: -1 | 1) => void){
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const s = start.current; start.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) onSwipe(dx < 0 ? 1 : -1);
  }, [onSwipe]);
  return { onPointerDown, onPointerUp, onPointerCancel: () => { start.current = null; } };
}
