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
  ['.fx-theme, .fx-chip, .fx-look-b, .fx-tab, .fx-pal, .fx-sec-h', 'studio.theme'],
];
document.addEventListener('click', e => {
  const path = e.composedPath();
  for (const node of path){
    if (!(node instanceof Element)) continue;
    for (const [sel, ev] of CLICKS){
      if (!node.matches(sel)) continue;
      const id = typeof ev === 'function' ? ev(node) : ev;
      if (id) engine.play(id);
      return;
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

// ---------------------------------------------------------------- the intro bed (optional, after the first gesture, once per visit)
let bedPlayed = false;
window.addEventListener('pointerdown', () => {
  if (bedPlayed) return; bedPlayed = true;
  try { if (sessionStorage.getItem('ka-intro-bed')) return; sessionStorage.setItem('ka-intro-bed', '1'); } catch { /* ignore */ }
  setTimeout(() => engine.play('intro.bed'), 120);
}, { capture: true, passive: true });

// ---------------------------------------------------------------- the speaker toggle beside the nav
const css = `
.ka-sound-btn{ position:fixed; z-index:120; width:38px; height:38px; display:grid; place-items:center; padding:0; border-radius:50%; cursor:pointer;
  color:rgba(237,235,232,.82); background:rgba(22,18,26,.5); border:1px solid rgba(255,255,255,.16);
  -webkit-backdrop-filter:blur(14px) saturate(140%); backdrop-filter:blur(14px) saturate(140%);
  box-shadow:inset 0 1px 1px rgba(255,255,255,.22), 0 6px 18px rgba(0,0,0,.28); transition:opacity .3s ease, color .2s ease, background .2s ease; }
.ka-sound-btn:hover{ color:#fff; background:rgba(40,32,44,.62); }
.ka-sound-btn:focus-visible{ outline:2px solid #ffb27a; outline-offset:3px; }
.ka-sound-btn[aria-pressed="true"]{ color:#ffd9b8; }
.ka-sound-btn svg{ width:18px; height:18px; }
.ka-sound-btn .wave{ transition:opacity .2s ease; }
.ka-sound-btn[aria-pressed="false"] .wave{ opacity:0; }
.ka-sound-btn[aria-pressed="true"] .mute{ opacity:0; }
.ka-sound-vol{ position:fixed; z-index:121; display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; color:rgba(237,235,232,.8); font:500 11px/1 system-ui, sans-serif;
  background:rgba(22,18,26,.72); border:1px solid rgba(255,255,255,.16); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); box-shadow:0 8px 22px rgba(0,0,0,.3); }
.ka-sound-vol[hidden]{ display:none; }
.ka-sound-vol input{ width:110px; accent-color:#ff9438; }
html.ka-studio-open .ka-sound-btn, html.ka-studio-open .ka-sound-vol, html.ka-modal-open .ka-sound-vol{ opacity:0; pointer-events:none; }
@media (prefers-reduced-motion: reduce){ .ka-sound-btn{ transition:none; } }
`;
function speaker(){
  const nav = document.getElementById('site-nav'); if (!nav) return;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ka-sound-btn';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="wave" d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path class="wave" d="M18 6.6a7.6 7.6 0 0 1 0 10.8"/><path class="mute" d="m16 9.5 5 5m0-5-5 5"/></svg>';
  const vol = document.createElement('div'); vol.className = 'ka-sound-vol'; vol.hidden = true;
  vol.innerHTML = '<span>Volume</span><input type="range" min="0" max="1" step="0.05" aria-label="Sound volume">';
  const range = vol.querySelector('input')!;
  document.body.append(btn, vol);
  const sync = () => {
    const on = engine.enabled;
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on');
    btn.title = on ? 'Sound on (long-press or hover for volume)' : 'Sound off';
    range.value = String(engine.user.volume);
  };
  engine.onChange(sync); sync();
  // beside the nav when there is room, otherwise just under its right end; it follows the nav's visibility
  let raf = 0;
  const place = () => {
    raf = 0;
    const r = nav.getBoundingClientRect(), cs = getComputedStyle(nav);
    const hidden = r.width === 0 || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05 || nav.hidden;
    btn.style.opacity = hidden ? '0' : '1'; btn.style.pointerEvents = hidden ? 'none' : '';
    const size = 38, gap = 10;
    let x = r.right + gap, y = r.top + (r.height - size) / 2;
    if (x + size > innerWidth - 8){ x = Math.min(innerWidth - size - 8, r.right - size); y = r.bottom + 8; }
    btn.style.left = Math.round(x) + 'px'; btn.style.top = Math.round(y) + 'px';
    if (!vol.hidden){ const vb = vol.getBoundingClientRect(); vol.style.left = Math.round(Math.max(8, Math.min(innerWidth - vb.width - 8, x + size / 2 - vb.width / 2))) + 'px'; vol.style.top = Math.round(y + size + 8) + 'px'; }
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(place); };
  addEventListener('resize', queue); addEventListener('scroll', queue, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(queue).observe(nav);
  new MutationObserver(queue).observe(nav, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  setInterval(queue, 700);   // the nav also moves with its own animations (hide on scroll, intro)
  place();
  // tap: on / off. Hover (mouse) or long-press (touch): the volume slider
  let pressTimer = 0, longPressed = false, hideTimer = 0;
  const showVol = () => { clearTimeout(hideTimer); vol.hidden = false; place(); };
  const hideVolSoon = (ms = 1600) => { clearTimeout(hideTimer); hideTimer = window.setTimeout(() => { if (!vol.matches(':hover') && !vol.contains(document.activeElement)) vol.hidden = true; }, ms); };
  btn.addEventListener('pointerdown', e => { longPressed = false; if (e.pointerType !== 'mouse') pressTimer = window.setTimeout(() => { longPressed = true; showVol(); hideVolSoon(4000); }, 480); });
  btn.addEventListener('pointerup', () => clearTimeout(pressTimer));
  btn.addEventListener('pointerleave', () => { clearTimeout(pressTimer); hideVolSoon(); });
  btn.addEventListener('mouseenter', () => { if (engine.enabled) showVol(); });
  vol.addEventListener('mouseleave', () => hideVolSoon(500));
  btn.addEventListener('click', e => { if (longPressed){ e.preventDefault(); return; } engine.setEnabled(!engine.enabled); if (!engine.enabled) vol.hidden = true; });
  range.addEventListener('input', () => { engine.setVolume(Number(range.value)); });
  range.addEventListener('change', () => { engine.play('nav.select'); hideVolSoon(2500); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', speaker, { once: true }); else speaker();
