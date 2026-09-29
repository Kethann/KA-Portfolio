// Full screen for the portal. Android, iPad and desktop browsers use the Fullscreen API (the browser's
// own bars disappear until Esc or the button again). iPhone Safari doesn't allow it for web pages, so
// there the button explains Add to Home Screen, which opens the portal as a full-screen app; opened
// that way it already has the whole screen and the button hides.
import { useCallback, useEffect, useState } from 'react';
import { Modal } from '../ui';

type Doc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type Root = HTMLElement & { webkitRequestFullscreen?: (o?: FullscreenOptions) => void };
const doc = () => document as Doc;
const root = () => document.documentElement as Root;

export const fullscreenSupported = () => !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled) && !!(root().requestFullscreen || root().webkitRequestFullscreen);
const isActive = () => !!(doc().fullscreenElement || doc().webkitFullscreenElement);
const isInstalled = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;

export function useFullscreen(){
  const [active, setActive] = useState(isActive);
  const [guide, setGuide] = useState(false);
  useEffect(() => {
    const on = () => setActive(isActive());
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => { document.removeEventListener('fullscreenchange', on); document.removeEventListener('webkitfullscreenchange', on); };
  }, []);
  const toggle = useCallback(async () => {
    if (isActive()){ (doc().exitFullscreen || doc().webkitExitFullscreen)?.call(document); return; }
    if (!fullscreenSupported()){ setGuide(true); return; }
    try { await (root().requestFullscreen || root().webkitRequestFullscreen)!.call(root(), { navigationUI: 'hide' }); }
    catch { setGuide(true); }
  }, []);
  const available = fullscreenSupported() || !isInstalled();   // hidden only when it could never do anything more
  const guideEl = guide ? (
    <Modal title="Full screen on iPhone" onClose={() => setGuide(false)} footer={<button type="button" className="btn primary" onClick={() => setGuide(false)}>Got it</button>}>
      <p className="muted" style={{ marginTop: 0 }}>iPhone browsers don’t let websites go full screen. Add the portal to your Home Screen instead: it opens like an app, without the browser bars.</p>
      <ol className="guide-steps"><li>Tap <b>Share</b> (the square with the arrow)</li><li>Choose <b>Add to Home Screen</b></li><li>Open <b>KA Portal</b> from your Home Screen</li></ol>
    </Modal>
  ) : null;
  return { active, toggle, available, guideEl };
}
