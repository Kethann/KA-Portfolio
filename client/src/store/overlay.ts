// Dialogs (lightbox, checkout) render into one body-level layer: the store itself sits inside a
// page section that forms its own stacking context, so a dialog there could never cover the
// fixed nav bar or the chat button. Same stylesheet, own shadow root.
import storeCss from './store.css?inline';
import checkoutCss from './checkout/checkout.css?inline';

let overlayTarget: HTMLElement | null = null;
export function overlayLayer(): HTMLElement {
  if (overlayTarget && overlayTarget.isConnected) return overlayTarget;
  const host = document.createElement('div');
  host.className = 'ka-store-overlays';
  host.setAttribute('data-ka-shadow', '');
  registerAnimatedProps(host);
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${storeCss}\n${checkoutCss}`;
  overlayTarget = document.createElement('div');
  shadow.append(style, overlayTarget);
  return overlayTarget;
}

// @property rules inside a shadow root are ignored, so the card's animated custom properties (the busy sweep, the foil
// sheen) are registered once for the whole page here. Browsers that can't register them get gradient fallbacks
// instead (checkout.css :host(.no-houdini)), so no animation is ever missing.
let registered = false;
function registerAnimatedProps(host: HTMLElement){
  const css = (window as unknown as { CSS?: { registerProperty?: (o: { name: string; syntax: string; inherits: boolean; initialValue: string }) => void } }).CSS;
  if (!css || typeof css.registerProperty !== 'function'){ host.classList.add('no-houdini'); return; }
  if (registered) return; registered = true;
  // the same definitions as the @property rules in checkout.css
  for (const p of [{ name: '--kco-sweep', syntax: '<angle>', inherits: false, initialValue: '0deg' }, { name: '--gx', syntax: '<percentage>', inherits: true, initialValue: '50%' }]){
    try { css.registerProperty(p); } catch { /* already registered */ }
  }
}
