// /assets/sound.js: the page's sound layer. Creates the one engine (window.kaSound), applies the portal's settings,
// puts a small speaker toggle beside the glass nav, and listens for the site's moments without touching their code:
// clicks are matched by selector (also inside the store / studio / gallery shadow roots, via composedPath), the
// assistant and the contact form are watched for changes, and any bundle can call window.kaSound.play(id) or
// dispatch a 'ka-sfx' event. The v1 intro is never touched; the optional intro bed only plays after a gesture.
import { getSoundEngine } from './engine';

const engine = getSoundEngine();
const w = window as unknown as { __kaSoundCfg?: unknown };
if (w.__kaSoundCfg) engine.configure(w.__kaSoundCfg as never);

// ---------------------------------------------------------------- clicks → sounds
const CLICKS: [string, string | ((el: Element) => string | null)][] = [
  ['.nav-item', 'nav.select'],
  ['.expand-tool-item', 'nav.select'],
  ['#expand-trigger', el => el.getAttribute('aria-expanded') === 'true' ? 'nav.menu-close' : 'nav.menu-open'],   // read before the click flips it
  ['.kas-seg-btn', el => el.getAttribute('aria-selected') === 'true' ? null : 'store.tab'],
  ['.kas-chip, .kas-cur-btn', 'store.filter'],
  ['.kas-buy', 'store.buy'],
  ['.kas-art-open, .kas-card-shot, .kas-lb-nav', 'store.view'],
  ['.kat-card', 'tips.open'],
  ['.kat-back, .kas-lb-close', 'ui.close'],
  ['.vw-share, .vw-menu [role="menuitem"]', 'ui.share'],
  ['.vw-pin', 'gallery.pin'],
  ['.fx-theme, .fx-chip, .fx-look-b, .fx-tab, .fx-pal, .fx-sec-h', 'studio.theme'],
  ['.studio button, .studio [role="menuitemradio"]', 'studio.tool'],
  // every other control: a very quiet tick (the stack, coverflow and checkout buttons make their own sounds in code)
  ['.stack, .cf-stage button, .cf-close, .kco-card button, #sound-item, .expand-sound-vol', ''],
  ['button, a[href], [role="button"], summary, label.switch', 'ui.click'],
];
document.addEventListener('click', e => {
  const path = e.composedPath();
  for (const node of path){
    if (!(node instanceof Element)) continue;
    for (const [sel, ev] of CLICKS){
      if (!node.matches(sel)) continue;
      const id = typeof ev === 'function' ? ev(node) : ev;
      if (id) engine.play(id);
      return;   // the first, most specific match wins
    }
  }
}, { capture: true });
document.addEventListener('change', e => {
  const t = e.composedPath()[0];
  if (t instanceof Element && t.closest('.kas-sort')) engine.play('store.filter');
}, { capture: true });
// any bundle: window.dispatchEvent(new CustomEvent('ka-sfx', { detail: 'store.paid' }))
window.addEventListener('ka-sfx', e => { const id = (e as CustomEvent<string>).detail; if (typeof id === 'string') engine.play(id); });

// ---------------------------------------------------------------- watched moments
function watch(){
  // Panda: open / close, and messages (yours = sent, Panda's = reply); history restored on open stays silent
  const panel = document.getElementById('assistant-panel');
  if (panel){
    let open = panel.classList.contains('open'), openedAt = 0;
    new MutationObserver(() => {
      const now = panel.classList.contains('open');
      if (now !== open){ open = now; if (now){ openedAt = performance.now(); engine.play('panda.open'); } else engine.play('panda.close'); }
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
    const log = document.getElementById('assistant-messages');
    if (log) new MutationObserver(list => {
      if (performance.now() - openedAt < 400) return;
      let user = false, bot = false;
      for (const m of list) for (const n of Array.from(m.addedNodes)) if (n instanceof Element && n.classList.contains('assistant-msg')){ if (n.classList.contains('user')) user = true; else if (!n.classList.contains('typing')) bot = true; }
      if (user) engine.play('panda.send'); else if (bot) engine.play('panda.reply');
    }).observe(log, { childList: true });
    // a rare, very quiet chirp while the chat is open and nothing happens
    setInterval(() => { if (panel.classList.contains('open') && !document.hidden && Math.random() < 0.35) engine.play('panda.idle'); }, 50000);
  }
  // the contact form's result
  const status = document.getElementById('contact-status');
  if (status) new MutationObserver(() => {
    const s = status.getAttribute('data-state');
    if (s === 'ok') engine.play('contact.sent'); else if (s === 'error') engine.play('contact.error');
  }).observe(status, { attributes: true, attributeFilter: ['data-state'] });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true }); else watch();

// ---------------------------------------------------------------- the intro: air while the shards fly, glints as the particles gather,
// a settled tone when KA is assembled. Browsers allow sound only after the visitor's first tap or key press, so these play
// when the visitor interacts while the intro is still running (the intro itself is never changed or delayed).
let introDone = false, assembling = false;
window.addEventListener('ka-intro-phase', e => { if ((e as CustomEvent<string>).detail === 'assembling'){ assembling = true; engine.play('intro.gather'); } });
window.addEventListener('ka-sequence-complete', () => { if (!introDone){ introDone = true; engine.play('intro.assemble'); } });
engine.onChange(() => { if (engine.enabled && !introDone && assembling) engine.play('intro.gather'); });
window.addEventListener('pointerdown', () => { if (!introDone) setTimeout(() => { engine.play(assembling ? 'intro.gather' : 'intro.air'); }, 60); }, { capture: true, once: true, passive: true });
// windows and viewers: the studio, dialogs (upscaler, Demix Pro, full-screen guide), the store's checkout
new MutationObserver(list => {
  for (const m of list){
    const was = (m.oldValue || '').split(/\s+/), now = document.documentElement.classList;
    if (now.contains('ka-studio-open') !== was.includes('ka-studio-open')) engine.play(now.contains('ka-studio-open') ? 'studio.open' : 'ui.close');
    else if (now.contains('ka-modal-open') !== was.includes('ka-modal-open')) engine.play(now.contains('ka-modal-open') ? 'ui.open' : 'ui.close');
  }
}).observe(document.documentElement, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });

// ---------------------------------------------------------------- the intro bed (optional, after the first gesture, once per visit)
let bedPlayed = false;
window.addEventListener('pointerdown', () => {
  if (bedPlayed) return; bedPlayed = true;
  try { if (sessionStorage.getItem('ka-intro-bed')) return; sessionStorage.setItem('ka-intro-bed', '1'); } catch { /* ignore */ }
  setTimeout(() => engine.play('intro.bed'), 120);
}, { capture: true, passive: true });

// ---------------------------------------------------------------- Sound in the ☰ menu: the switch row and the volume slider
function menuControls(){
  const item = document.getElementById('sound-item'), range = document.getElementById('sound-volume') as HTMLInputElement | null, out = document.getElementById('sound-volume-out');
  if (!item || !range) return;
  const row = range.closest('.expand-sound-vol');
  const sync = () => {
    const on = engine.enabled;
    item.setAttribute('aria-checked', String(on));
    item.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    range.value = String(engine.user.volume);
    if (out) out.textContent = Math.round(engine.user.volume * 100) + '%';
    row?.classList.toggle('is-off', !on);
  };
  engine.onChange(sync); sync();
  // moving the slider while sound is off switches it on (that is clearly what was wanted)
  range.addEventListener('input', () => { engine.setVolume(Number(range.value)); if (!engine.enabled) engine.setEnabled(true); });
  range.addEventListener('change', () => engine.play('nav.select'));
  // the slider sits inside the menu: keep its own keys (left / right) and clicks from reaching the menu
  range.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', menuControls, { once: true }); else menuControls();
