// Dialogs (lightbox, checkout) render into one body-level layer: the store itself sits inside a
// page section that forms its own stacking context, so a dialog there could never cover the
// fixed nav bar or the chat button. Same stylesheet, own shadow root.
import storeCss from './store.css?inline';

let overlayTarget: HTMLElement | null = null;
export function overlayLayer(): HTMLElement {
  if (overlayTarget && overlayTarget.isConnected) return overlayTarget;
  const host = document.createElement('div');
  host.className = 'ka-store-overlays';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = storeCss;
  overlayTarget = document.createElement('div');
  shadow.append(style, overlayTarget);
  return overlayTarget;
}
