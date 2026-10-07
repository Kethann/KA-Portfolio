// Rotate the screen from the portal: Auto → Landscape → Portrait. It uses the browser's orientation lock, which
// phones and tablets only allow in full screen, so full screen is turned on first. Browsers that can't lock the
// screen (iPhone and iPad Safari) say so, and the device's own rotation keeps working as usual.
import { useCallback, useEffect, useState } from 'react';

export type RotateMode = 'auto' | 'landscape' | 'portrait';
type Orient = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void };
const orientation = () => (screen as Screen & { orientation?: Orient }).orientation;
const isFull = () => !!(document.fullscreenElement || (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement);

export function useRotation(enterFullscreen: () => Promise<void>, notify: (text: string, ok: boolean) => void){
  const [mode, setMode] = useState<RotateMode>('auto');
  // leaving full screen releases the lock: the button goes back to Auto so it never claims a lock that is gone
  useEffect(() => {
    const on = () => { if (!isFull()) setMode('auto'); };
    document.addEventListener('fullscreenchange', on); document.addEventListener('webkitfullscreenchange', on);
    return () => { document.removeEventListener('fullscreenchange', on); document.removeEventListener('webkitfullscreenchange', on); };
  }, []);
  const next = useCallback(async () => {
    const o = orientation();
    const target: RotateMode = mode === 'auto' ? 'landscape' : mode === 'landscape' ? 'portrait' : 'auto';
    if (target === 'auto'){ try { o?.unlock?.(); } catch { /* nothing locked */ } setMode('auto'); notify('Rotation follows your device again', true); return; }
    if (!o || typeof o.lock !== 'function'){ notify('This browser can’t rotate the screen for you. Turn your device: the portal adjusts by itself.', false); return; }
    try {
      if (!isFull()) await enterFullscreen();
      await o.lock(target);
      setMode(target); notify(target === 'landscape' ? 'Locked to landscape' : 'Locked to portrait', true);
    } catch {
      notify('This device didn’t allow locking the rotation. Turn your device: the portal adjusts by itself.', false);
    }
  }, [mode, enterFullscreen, notify]);
  return { mode, next };
}
