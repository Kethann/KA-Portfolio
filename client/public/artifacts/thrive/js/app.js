/* =====================================================================
 * Thrive — Fitness & Health Tracker
 * Single-page app, no dependencies. All data stays in this browser
 * (localStorage). Export/import from Settings for backups.
 * ===================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  const round = (n, d = 0) => { const f = Math.pow(10, d); return Math.round((Number(n) || 0) * f) / f; };
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const sum = (arr, fn = (x) => x) => arr.reduce((t, x) => t + (Number(fn(x)) || 0), 0);
  const avg = (arr) => (arr.length ? sum(arr) / arr.length : 0);
  const fmt = (n, d = 0) => round(n, d).toLocaleString(undefined, { maximumFractionDigits: d });
  const pct = (a, b) => (b > 0 ? clamp((a / b) * 100, 0, 100) : 0);
  const pad = (n) => String(n).padStart(2, '0');
  const plural = (n, w) => `${fmt(n)} ${w}${Math.round(n) === 1 ? '' : 's'}`;
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const shortNum = (v) => (Math.abs(v) >= 1000 ? round(v / 1000, 1) + 'k' : String(round(v, 1)));

  // Dates use local "YYYY-MM-DD" keys.
  const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
  const todayKey = () => dkey(new Date());
  const isKey = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k);
  const fmtDay = (k, o = { weekday: 'short', day: 'numeric', month: 'short' }) => parseKey(k).toLocaleDateString(undefined, o);
  const relDay = (k) => { const t = todayKey(); if (k === t) return 'Today'; if (k === addDays(t, -1)) return 'Yesterday'; if (k === addDays(t, 1)) return 'Tomorrow'; return fmtDay(k); };
  const rangeKeys = (end, n) => { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(end, -i)); return out; };
  const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const toMin = (hm) => { const [h, m] = String(hm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const fromMin = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
  const fmtDur = (h) => { if (h == null) return '—'; const m = Math.round(h * 60); return `${Math.floor(m / 60)}h ${pad(m % 60)}m`; };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ------------------------------------------------------------------
  // Icons (inline SVG, stroke-based)
  // ------------------------------------------------------------------
  // Duotone icons: elements with class "d" are a soft tinted fill under the stroke.
  const ICONS = {
    home: '<path class="d" d="M5 10 12 4.2 19 10v11H5z"/><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-5.5a2 2 0 0 1 4 0V21"/>',
    food: '<path class="d" d="M14.5 13V9c0-3.5 1.5-6 3.5-6v10z"/><path d="M6 3v6a3 3 0 0 0 6 0V3"/><path d="M9 3v18"/><path d="M18 21V3c-2 0-3.5 2.5-3.5 6v4H18"/>',
    water: '<path class="d" d="M12 2.7c3.5 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.8 6-11z"/><path d="M12 2.7c3.5 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.8 6-11z"/><path d="M9 14.5a3 3 0 0 0 3 3"/>',
    activity: '<path class="d" d="M3 12h4l3-8 4 16 3-8h4v9H3z"/><path d="M3 12h4l3-8 4 16 3-8h4"/>',
    moon: '<path class="d" d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M17 3.5v3M15.5 5h3"/>',
    scale: '<rect class="d" x="3" y="3" width="18" height="18" rx="5"/><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M7.5 10.5a5 5 0 0 1 9 0"/><path d="M12 10.5l2-2.5"/>',
    chart: '<path class="d" d="M4 20V14l4-3 4 3 4-6 4 2v10z"/><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/><circle cx="19" cy="7" r="1.2"/>',
    bell: '<path class="d" d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    settings: '<circle class="d" cx="12" cy="12" r="8"/><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    trash: '<path class="d" d="M6 7h12l-1 14H7z"/><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 15h10l1-15"/><path d="M10 11v6M14 11v6"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 18l6-6-6-6"/>',
    flame: '<path class="d" d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.7 1.2 2.8 2.5 3-.5-3 0-5.5 0-8z"/><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.7 1.2 2.8 2.5 3-.5-3 0-5.5 0-8z"/><path d="M10 16.5a2 2 0 0 0 4 0c0-1.3-1-2-1.5-2.8"/>',
    edit: '<path class="d" d="M4 20h4L19 9l-4-4L4 16z"/><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    star: '<path class="d" d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    copy: '<rect class="d" x="9" y="9" width="12" height="12" rx="2.5"/><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
    upload: '<path d="M12 21V9M7 14l5-5 5 5"/><path d="M4 3h16"/>',
    dumbbell: '<rect class="d" x="5" y="6.5" width="3" height="11" rx="1"/><rect class="d" x="16" y="6.5" width="3" height="11" rx="1"/><rect x="5" y="6.5" width="3" height="11" rx="1"/><rect x="16" y="6.5" width="3" height="11" rx="1"/><path d="M2.5 9.5v5M21.5 9.5v5M8 12h8"/>',
    clock: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sparkle: '<path class="d" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16v4M17 18h4"/>',
    search: '<circle class="d" cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    check: '<path d="M5 12l5 5L20 7"/>',
    smile: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>',
    target: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    trophy: '<path class="d" d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M8 21h8M12 15v6M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>',
    calendar: '<path class="d" d="M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v2H3z"/><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
    zap: '<path class="d" d="M13 2 4 14h7l-1 8 9-12h-7z"/><path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    sun: '<circle class="d" cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    timer: '<circle class="d" cx="12" cy="13" r="8"/><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6M19 6l1.5-1.5"/>',
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    gauge: '<path class="d" d="M4.5 18a9 9 0 1 1 15 0z"/><path d="M4.5 18a9 9 0 1 1 15 0"/><path d="M12 13l4-5"/><circle cx="12" cy="13.5" r="1.3"/>',
    list: '<rect class="d" x="3" y="4" width="18" height="16" rx="4"/><path d="M10 8h8M10 12h8M10 16h8"/><path d="M5.5 8l1 1 1.8-2M5.5 12l1 1 1.8-2M5.5 16l1 1 1.8-2"/>',
    stop: '<rect class="d" x="6" y="6" width="12" height="12" rx="2.5"/><rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" data-i="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  // ------------------------------------------------------------------
  // Live animated emoji (Google Noto Animated Emoji, Apache 2.0 / CC BY 4.0)
  // Still art by default; animates when "anim" is set, or on hover / tap.
  // Falls back to static Noto art, then to the system emoji if offline.
  // ------------------------------------------------------------------
  const EMO_ANIM = new Set(('1f373 1f957 1f35d 1f34e 1f629 1f62b 1f615 1f610 1f642 1f60a 1f604 1f929 1f44b 1f634 1f525 1f3c6 1f389 1f4a7 1f4aa 2728 2705 1f331 1f45f 2696 1f966 1f64f 1f514 1f37d 1f680 1faab 1f50b 1f305 1f304 1f30c 1f60c 1f973 1f4af 1f947 1f9e0 1f31e 1f60e 2b50 1f31f 1f44f 1f64c 1f971 1f3af 1f4c8 1f914 1f9c3 1f37c 1f4ac 1f483 23f0 231b 23f3 1f4da 2764 1f9e1 1f49a 1f343 1f33f 1f31b 1f31c 1f31a 1f31d 1f30a 1f375 2615 1f951 1f955 1f9b5 26bd 1f3c0 1fa7a 1f4ab 1f4a5 1f308 1f3c1 1f60b 1f62a 1f970 1f60d 1f924 1f9d0 1f4c9 1f6a8 1f381 1f4f8 1f6b2 26a1 1f32c 1f30b 1f9cb').split(' '));
  const emoCp = (ch) => Array.from(String(ch)).map((c) => c.codePointAt(0).toString(16)).filter((x) => x !== 'fe0f').join('_');
  const isEmoji = (ch) => /\p{Extended_Pictographic}/u.test(String(ch || ''));
  const NOTO = 'https://fonts.gstatic.com/s/e/notoemoji/latest/';
  // anim: true  -> "idle" emoji: plays once when shown, then once more every 7–16 s (random) while on screen.
  // otherwise   -> still; plays once on hover / tap. Never loops continuously.
  function emo(ch, { size = 28, anim = false, cls = '', label = '' } = {}) {
    if (!isEmoji(ch)) return `<span class="emo emo-txt ${cls}" style="font-size:${round(size * 0.8)}px">${esc(ch)}</span>`;
    const cp = emoCp(ch), live = EMO_ANIM.has(cp);
    const still = live ? `${NOTO}${cp}/emoji.svg` : `https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.047/svg/emoji_u${cp}.svg`;
    return `<img class="emo ${cls}" src="${still}"${live ? ` data-cp="${cp}"${anim ? ' data-idle="1"' : ''}` : ''} alt="${esc(ch)}"${label ? ` aria-label="${esc(label)}" role="img"` : ' aria-hidden="true"'} width="${size}" height="${size}" draggable="false" decoding="async" onerror="thriveEmoFail(this)">`;
  }
  // Offline / blocked: fall back to the system emoji glyph.
  window.thriveEmoFail = (img) => {
    const s = document.createElement('span');
    s.className = img.className + ' emo-txt';
    s.style.fontSize = Math.round(img.width * 0.8) + 'px';
    s.textContent = img.alt;
    img.replaceWith(s);
  };

  // ---- Lottie player: exact, single plays (loaded lazily on first use) ----
  const LOTTIE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie_light.min.js';
  let lottieP = null;
  const loadLottie = () => (window.lottie ? Promise.resolve(window.lottie) : lottieP || (lottieP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = LOTTIE_SRC; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => (window.lottie ? res(window.lottie) : rej(new Error('lottie missing')));
    s.onerror = () => { lottieP = null; s.remove(); rej(new Error('lottie failed')); };
    document.head.appendChild(s);
  })));
  const lottieData = new Map(); // cp -> Promise<json>
  const getLottieData = (cp) => {
    if (!lottieData.has(cp)) lottieData.set(cp, fetch(`${NOTO}${cp}/lottie.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))).catch((e) => { lottieData.delete(cp); throw e; }));
    return lottieData.get(cp);
  };

  // Plays an emoji exactly once (≈1–2 s), then returns to the still image.
  function playEmo(img) {
    if (!img || !img.isConnected || img.dataset.busy || !img.dataset.cp || reduceMotion() || document.hidden) return;
    img.dataset.busy = '1';
    const done = () => { delete img.dataset.busy; };
    Promise.all([loadLottie(), getLottieData(img.dataset.cp)]).then(([L, data]) => {
      if (!img.isConnected) return done();
      const box = document.createElement('span');
      box.className = img.className + ' emo-lot';
      box.style.width = img.width + 'px'; box.style.height = img.height + 'px';
      box.setAttribute('aria-hidden', 'true');
      let anim;
      try {
        anim = L.loadAnimation({ container: box, renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(data)), rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false } });
      } catch (e) { return done(); }
      const finish = () => { try { anim.destroy(); } catch (e) { /* already gone */ } if (box.isConnected) box.replaceWith(img); done(); };
      let started = false;
      const start = () => { if (started) return; started = true; if (!img.isConnected) return finish(); img.replaceWith(box); anim.play(); };
      anim.addEventListener('DOMLoaded', start);
      anim.addEventListener('complete', finish);
      if (anim.isLoaded) start(); // data was ready synchronously: DOMLoaded may already have fired
      setTimeout(() => { if (box.isConnected || img.dataset.busy) finish(); }, 6000); // safety net
    }).catch(() => {
      // No Lottie (offline/blocked): show the animated image for about one cycle instead.
      const still = img.src;
      img.src = `${NOTO}${img.dataset.cp}/512.webp`;
      setTimeout(() => { img.src = still; done(); }, 1600);
    });
  }

  // Idle emoji: play once shortly after appearing, then again at random intervals while visible.
  function scheduleIdleEmoji(root = document) {
    if (reduceMotion()) return;
    $$('img.emo[data-idle]:not([data-sched])', root).forEach((img, i) => {
      img.dataset.sched = '1';
      const loop = () => {
        if (!img.isConnected && !img.dataset.busy) return; // re-rendered away: stop
        const r = img.getBoundingClientRect();
        const onScreen = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
        if (onScreen && !document.hidden) playEmo(img);
        setTimeout(loop, 7000 + Math.random() * 9000);
      };
      setTimeout(loop, 250 + i * 180 + Math.random() * 500);
    });
  }

  // ------------------------------------------------------------------
  // Reference data
  // ------------------------------------------------------------------
  const NUTR = [
    { k: 'kcal', label: 'Calories', unit: 'kcal', d: 0 },
    { k: 'p', label: 'Protein', unit: 'g', d: 1 },
    { k: 'c', label: 'Carbohydrates', unit: 'g', d: 1 },
    { k: 'f', label: 'Fat', unit: 'g', d: 1 },
    { k: 'fi', label: 'Fiber', unit: 'g', d: 1 },
    { k: 'su', label: 'Sugars', unit: 'g', d: 1 },
    { k: 'na', label: 'Sodium', unit: 'mg', d: 0 },
    { k: 'kp', label: 'Potassium', unit: 'mg', d: 0 },
    { k: 'ca', label: 'Calcium', unit: 'mg', d: 0 },
    { k: 'fe', label: 'Iron', unit: 'mg', d: 1 },
    { k: 'vc', label: 'Vitamin C', unit: 'mg', d: 0 },
  ];
  const NKEYS = NUTR.map((n) => n.k);
  const NMAP = Object.fromEntries(NUTR.map((n) => [n.k, n]));
  const DB_FIELDS = ['kcal', 'p', 'c', 'f', 'fi', 'su', 'na', 'ca', 'fe', 'kp', 'vc'];
  const LIMIT_KEYS = ['su', 'na']; // nutrients where lower is better

  const BASE_FOODS = (window.THRIVE_FOODS || []).map((r) => ({
    id: 'db:' + slug(r[0]),
    name: r[0], cat: r[1], unit: r[2], sg: r[3],
    n: Object.fromEntries(DB_FIELDS.map((f, j) => [f, Number(r[4 + j]) || 0])),
  }));
  const CATEGORIES = Array.from(new Set(BASE_FOODS.map((f) => f.cat)));

  const MEALS = [
    { id: 'breakfast', label: 'Breakfast', emoji: '🍳', share: 0.25 },
    { id: 'lunch', label: 'Lunch', emoji: '🥗', share: 0.35 },
    { id: 'dinner', label: 'Dinner', emoji: '🍝', share: 0.3 },
    { id: 'snack', label: 'Snacks', emoji: '🍎', share: 0.1 },
  ];
  const mealLabel = (id) => (MEALS.find((m) => m.id === id) || MEALS[3]).label;

  // [name, MET]
  const ACTIVITIES = [
    ['Walking', 3.5], ['Brisk walking', 4.3], ['Running (8 km/h)', 8.3], ['Running (10 km/h)', 9.8], ['Running (12 km/h)', 11.5],
    ['Cycling (leisure)', 4], ['Cycling (moderate)', 7.5], ['Cycling (vigorous)', 10], ['Swimming', 6], ['Strength training', 5],
    ['HIIT', 8], ['Yoga', 2.5], ['Pilates', 3], ['Dancing', 5], ['Hiking', 6], ['Jump rope', 11], ['Elliptical', 5],
    ['Rowing machine', 7], ['Stair climbing', 8], ['Football / soccer', 7], ['Basketball', 6.5], ['Badminton', 5.5],
    ['Tennis', 7.3], ['Cricket', 4.8], ['Martial arts', 10], ['Stretching', 2.3], ['Household chores', 3.3], ['Other', 4],
  ];
  const INTENSITY = { light: { label: 'Light', m: 0.8 }, moderate: { label: 'Moderate', m: 1 }, vigorous: { label: 'Vigorous', m: 1.2 } };
  const LIFTS = ['Bench press', 'Squat', 'Deadlift', 'Overhead press', 'Barbell row', 'Pull-up', 'Lat pulldown', 'Dumbbell curl',
    'Tricep extension', 'Leg press', 'Lunges', 'Romanian deadlift', 'Incline bench press', 'Shoulder lateral raise', 'Hip thrust', 'Plank (sec)', 'Push-up'];

  const MOODS = ['😫', '😕', '😐', '😊', '🤩'];
  const MOOD_LABELS = ['Awful', 'Low', 'Okay', 'Good', 'Amazing'];
  const ACTIVITY_LEVELS = {
    sedentary: { label: 'Sedentary (desk job, little exercise)', f: 1.2 },
    light: { label: 'Lightly active (1–3 workouts/week)', f: 1.375 },
    moderate: { label: 'Moderately active (3–5 workouts/week)', f: 1.55 },
    active: { label: 'Very active (6–7 workouts/week)', f: 1.725 },
    athlete: { label: 'Athlete (2x/day or physical job)', f: 1.9 },
  };
  const GOALS = {
    lose: { label: 'Lose weight (~0.5 kg/week)', adj: -500, pk: 1.8 },
    lose_slow: { label: 'Lose slowly (~0.25 kg/week)', adj: -250, pk: 1.6 },
    maintain: { label: 'Maintain weight', adj: 0, pk: 1.4 },
    gain_slow: { label: 'Lean gain (~0.25 kg/week)', adj: 250, pk: 1.8 },
    gain: { label: 'Gain weight (~0.4 kg/week)', adj: 400, pk: 1.8 },
  };

  // ------------------------------------------------------------------
  // State & persistence
  // ------------------------------------------------------------------
  const STORE_KEY = 'thrive.v1';
  const FIRED_KEY = 'thrive.fired';
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  const emptyDay = () => ({ foods: [], water: [], workouts: [], strength: [], sleep: null, weight: null, body: null, steps: 0, mood: null, energy: null, notes: '', habits: {}, mindful: 0 });

  const defaultHabits = () => [
    { id: uid(), emoji: '💊', name: 'Vitamins' },
    { id: uid(), emoji: '🥦', name: 'Veggies at every meal' },
    { id: uid(), emoji: '🌞', name: 'Morning sunlight' },
    { id: uid(), emoji: '😴', name: 'In bed by 11 pm' },
  ];
  const FAST_PRESETS = [13, 16, 18, 20];

  function defaultReminders() {
    return [
      { id: uid(), label: 'Drink water', type: 'water', mode: 'interval', every: 90, start: '08:00', end: '21:00', days: ALL_DAYS.slice(), enabled: true },
      { id: uid(), label: 'Log your breakfast', type: 'meal', meal: 'breakfast', mode: 'time', time: '09:30', days: ALL_DAYS.slice(), enabled: true },
      { id: uid(), label: 'Log your lunch', type: 'meal', meal: 'lunch', mode: 'time', time: '14:00', days: ALL_DAYS.slice(), enabled: true },
      { id: uid(), label: 'Log your dinner', type: 'meal', meal: 'dinner', mode: 'time', time: '21:00', days: ALL_DAYS.slice(), enabled: true },
      { id: uid(), label: 'Time to move', type: 'workout', mode: 'time', time: '18:00', days: [1, 2, 3, 4, 5], enabled: true },
      { id: uid(), label: 'Weekly weigh-in', type: 'weight', mode: 'time', time: '07:30', days: [1], enabled: true },
      { id: uid(), label: 'Wind down for bed', type: 'sleep', mode: 'time', time: '22:30', days: ALL_DAYS.slice(), enabled: true },
    ];
  }

  const defaultState = () => ({
    version: 1,
    profile: null,
    goalsOverride: {},
    settings: { theme: 'system', eatBackExercise: false, sound: true, haptics: true, fastTarget: 16 },
    days: {},
    customFoods: [],
    recentFoods: [],
    favorites: [],
    reminders: defaultReminders(),
    habits: defaultHabits(),
    fasting: { active: null, history: [] },
  });

  function normalize(d) {
    const base = defaultState();
    if (!d || typeof d !== 'object' || Array.isArray(d)) return base;
    const s = Object.assign(base, d);
    s.settings = Object.assign(defaultState().settings, d.settings && typeof d.settings === 'object' ? d.settings : {});
    s.goalsOverride = d.goalsOverride && typeof d.goalsOverride === 'object' ? d.goalsOverride : {};
    s.days = d.days && typeof d.days === 'object' && !Array.isArray(d.days) ? d.days : {};
    for (const k of Object.keys(s.days)) {
      const day = s.days[k];
      if (!isKey(k) || !day || typeof day !== 'object') { delete s.days[k]; continue; }
      const nd = Object.assign(emptyDay(), day);
      for (const a of ['foods', 'water', 'workouts', 'strength']) if (!Array.isArray(nd[a])) nd[a] = [];
      nd.steps = num(nd.steps);
      nd.mindful = Math.max(0, num(nd.mindful));
      if (!nd.habits || typeof nd.habits !== 'object' || Array.isArray(nd.habits)) nd.habits = {};
      s.days[k] = nd;
    }
    for (const a of ['customFoods', 'recentFoods', 'favorites']) if (!Array.isArray(s[a])) s[a] = [];
    if (!Array.isArray(s.habits)) s.habits = defaultHabits();
    s.habits = s.habits.filter((h) => h && typeof h === 'object' && h.name).map((h) => ({ id: String(h.id || uid()), emoji: String(h.emoji || '✅').slice(0, 8), name: String(h.name).slice(0, 40) }));
    const fa = d.fasting && typeof d.fasting === 'object' ? d.fasting : {};
    s.fasting = {
      active: fa.active && num(fa.active.start) > 0 ? Object.assign({ start: num(fa.active.start), target: clamp(num(fa.active.target, 16), 1, 72), notified: !!fa.active.notified }, fa.active.sample ? { sample: true } : {}) : null,
      history: Array.isArray(fa.history) ? fa.history.filter((x) => x && num(x.end) > num(x.start)).slice(-200) : [],
    };
    s.settings.fastTarget = clamp(num(s.settings.fastTarget, 16), 1, 72);
    if (!Array.isArray(s.reminders)) s.reminders = defaultReminders();
    s.reminders = s.reminders.filter((r) => r && typeof r === 'object').map((r) => Object.assign({ id: uid(), days: ALL_DAYS.slice(), enabled: true, mode: 'time', time: '09:00', type: 'custom', label: 'Reminder' }, r));
    if (s.profile && typeof s.profile !== 'object') s.profile = null;
    return s;
  }

  let S = defaultState();
  let goalsCache = null;
  // Per-day memo caches. Cleared whenever data changes (save/load), so heavy pages
  // like Insights and the heatmap don't recompute the same day dozens of times.
  const memo = { totals: new Map(), score: new Map(), weightKeys: null };
  function invalidate() {
    goalsCache = null;
    memo.totals.clear(); memo.score.clear(); memo.weightKeys = null;
  }

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { console.warn('Could not read saved data', e); }
    S = normalize(data);
    invalidate();
  }

  function save() {
    invalidate();
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(S));
    } catch (e) {
      console.error(e);
      toast('Could not save — browser storage is full or blocked. Export a backup from Settings.', { type: 'error', timeout: 8000 });
    }
  }

  const getDay = (k) => S.days[k] || emptyDay();
  const editDay = (k) => {
    const d = S.days[k] || (S.days[k] = emptyDay());
    delete d.sample; // once you log on a sample day it's yours: "Remove sample data" keeps it
    return d;
  };
  const habitsDone = (d) => (d && d.habits ? S.habits.filter((h) => d.habits[h.id]).length : 0);
  const dayHasData = (d) => !!(d && (d.foods.length || d.water.length || d.workouts.length || d.strength.length || d.sleep || d.weight || d.steps || d.mood || d.mindful || habitsDone(d)));

  // ------------------------------------------------------------------
  // Foods
  // ------------------------------------------------------------------
  const allFoods = () => BASE_FOODS.concat(S.customFoods);
  const findFood = (id) => allFoods().find((f) => f.id === id) || null;
  const findFoodByName = (name) => BASE_FOODS.find((f) => f.name === name) || null;
  function scaleFood(food, grams) {
    const out = {};
    for (const k of NKEYS) out[k] = ((food.n[k] || 0) * grams) / 100;
    return out;
  }
  function pushRecent(id) {
    S.recentFoods = [id].concat(S.recentFoods.filter((x) => x !== id)).slice(0, 25);
  }

  // ------------------------------------------------------------------
  // Profile, targets & daily totals
  // ------------------------------------------------------------------
  function currentWeight(upto = todayKey()) {
    const keys = memo.weightKeys || (memo.weightKeys = Object.keys(S.days).filter((k) => num(S.days[k].weight) > 0).sort());
    // Binary search for the last weigh-in on or before `upto`.
    let lo = 0, hi = keys.length - 1, found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (keys[mid] <= upto) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    if (found >= 0) return num(S.days[keys[found]].weight);
    return S.profile ? num(S.profile.weight, 70) : 70;
  }

  function computeGoals() {
    const p = S.profile || { sex: 'female', age: 30, height: 165, weight: 65, activity: 'light', goal: 'maintain' };
    const w = currentWeight();
    const male = p.sex === 'male';
    const bmr = 10 * w + 6.25 * num(p.height, 165) - 5 * num(p.age, 30) + (male ? 5 : -161);
    const tdee = bmr * (ACTIVITY_LEVELS[p.activity] || ACTIVITY_LEVELS.light).f;
    const goal = GOALS[p.goal] || GOALS.maintain;
    const kcal = Math.max(male ? 1500 : 1200, Math.round((tdee + goal.adj) / 10) * 10);
    const protein = Math.round(Math.min(w * goal.pk, (kcal * 0.35) / 4));
    const fat = Math.round((kcal * 0.28) / 9);
    const carbs = Math.max(50, Math.round((kcal - protein * 4 - fat * 9) / 4));
    const activeBonus = ['active', 'athlete'].includes(p.activity) ? 500 : 0;
    const auto = {
      kcal, p: protein, c: carbs, f: fat,
      fi: Math.round((kcal / 1000) * 14),
      su: Math.round((kcal * 0.1) / 4),
      na: 2300,
      kp: male ? 3400 : 2600,
      ca: num(p.age) > 50 && !male ? 1200 : 1000,
      fe: male || num(p.age) > 50 ? 8 : 18,
      vc: male ? 90 : 75,
      water: Math.round((w * 35 + activeBonus) / 50) * 50,
      sleep: num(p.age) < 18 ? 9 : 8,
      steps: 8000,
      activeMin: 30,
      bmr: Math.round(bmr), tdee: Math.round(tdee),
    };
    const g = Object.assign({}, auto);
    for (const [k, v] of Object.entries(S.goalsOverride || {})) if (num(v) > 0) g[k] = num(v);
    g.auto = auto;
    return g;
  }
  const goals = () => goalsCache || (goalsCache = computeGoals());

  const stepsKcal = (steps, w) => Math.round(num(steps) * 0.04 * (w / 70));

  function dayTotals(k) {
    const hit = memo.totals.get(k);
    if (hit) return Object.assign({}, hit);
    const t = computeTotals(k);
    memo.totals.set(k, t);
    return Object.assign({}, t);
  }

  function computeTotals(k) {
    const d = getDay(k);
    const t = {};
    for (const n of NKEYS) t[n] = sum(d.foods, (e) => e[n]);
    const w = currentWeight(k);
    t.water = sum(d.water, (x) => x.ml);
    t.workoutKcal = sum(d.workouts, (x) => x.kcal);
    t.stepKcal = stepsKcal(d.steps, w);
    t.burned = t.workoutKcal + t.stepKcal;
    t.activeMin = sum(d.workouts, (x) => x.minutes);
    t.steps = num(d.steps);
    t.sleep = d.sleep ? num(d.sleep.hours) : null;
    t.sleepQ = d.sleep ? num(d.sleep.quality) || null : null;
    t.weight = num(d.weight) > 0 ? num(d.weight) : null;
    t.mood = d.mood || null;
    t.energy = d.energy || null;
    t.foodCount = d.foods.length;
    t.mindful = num(d.mindful);
    t.habits = habitsDone(d);
    t.hasData = dayHasData(d);
    return t;
  }

  function healthScore(k) {
    if (memo.score.has(k)) return memo.score.get(k);
    const v = computeScore(k);
    memo.score.set(k, v);
    return v;
  }

  function computeScore(k) {
    const t = dayTotals(k), g = goals();
    const parts = [];
    const add = (label, w, v, has) => parts.push({ label, w, v: has ? clamp(v, 0, 1) : 0, has });
    let cal = 0;
    if (t.kcal > 0) { const dev = Math.abs(t.kcal - g.kcal) / g.kcal; cal = dev <= 0.1 ? 1 : Math.max(0, 1 - (dev - 0.1) / 0.4); }
    add('Calories', 25, cal, t.kcal > 0);
    add('Protein', 15, t.p / g.p, t.p > 0);
    add('Hydration', 15, t.water / g.water, t.water > 0);
    add('Sleep', 20, t.sleep != null ? t.sleep / g.sleep : 0, t.sleep != null);
    add('Movement', 15, Math.max(t.activeMin / g.activeMin, t.steps / g.steps), t.activeMin > 0 || t.steps > 0);
    add('Fiber', 5, t.fi / g.fi, t.fi > 0);
    add('Sodium', 5, t.na <= g.na ? 1 : Math.max(0, 1 - (t.na - g.na) / g.na), t.kcal > 0);
    if (!parts.some((p) => p.has)) return null;
    return { score: Math.round(sum(parts, (p) => p.w * p.v)), parts };
  }

  // ------------------------------------------------------------------
  // UI primitives
  // ------------------------------------------------------------------
  let ANIM = false; // true while rendering a freshly-entered page -> rings/numbers animate in
  function ring(p, color, size = 120, stroke = 12, inner = '') {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = clamp(p, 0, 1), off = c * (1 - v), h = size / 2;
    return `<div class="ring-wrap" style="width:${size}px;height:${size}px">
      <svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${stroke}" style="stroke:color-mix(in srgb, ${color} 15%, transparent)"/>
        ${v > 0 ? `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c} ${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${h} ${h})" class="${ANIM ? 'ring-anim' : ''}" style="stroke:${color};--c0:${c}"/>` : ''}
      </svg><div class="ring-center">${inner}</div></div>`;
  }

  let chartSeq = 0, glassSeq = 0;
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Animated number (counts up when the page is entered).
  const cnt = (v, d = 0) => (ANIM ? `<span data-count="${v}" data-d="${d}">${fmt(0, d)}</span>` : fmt(v, d));

  // Concentric "activity rings".
  function multiRing(items, size = 216, stroke = 16, gap = 5, inner = '', anim = ANIM) {
    const h = size / 2;
    let s = '';
    items.forEach((it, i) => {
      const r = h - stroke / 2 - i * (stroke + gap);
      if (r <= stroke / 2) return;
      const c = 2 * Math.PI * r, v = clamp(it.p, 0, 1), off = c * (1 - v);
      s += `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${stroke}" style="stroke:color-mix(in srgb, ${it.color} 17%, transparent)"/>`;
      if (v > 0) s += `<circle class="${it.done ? 'ring-done' : ''} ${anim ? 'ring-anim' : ''}" cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c} ${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${h} ${h})" style="stroke:${it.color};color:${it.color};--c0:${c};animation-delay:${i * 0.12}s"/>`;
    });
    return `<div class="ring-wrap" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${s}</svg>${inner ? `<div class="ring-center">${inner}</div>` : ''}</div>`;
  }

  function runAnimations(root) {
    const els = $$('[data-count]', root);
    if (!els.length) return;
    const t0 = performance.now(), dur = 1000;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      els.forEach((el) => { el.textContent = fmt(num(el.dataset.count) * e, num(el.dataset.d)); });
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Water glass with animated waves.
  function glassSvg(p, w = 130) {
    const id = 'gl' + (++glassSeq);
    const level = 150 - 138 * clamp(p, 0, 1);
    const wave = 'M0 6 Q15 0 30 6 T60 6 T90 6 T120 6 T150 6 T180 6 T210 6 T240 6 V180 H0 Z';
    return `<svg class="glass" style="width:${w}px" viewBox="0 0 120 160" aria-hidden="true">
      <defs><clipPath id="${id}c"><path d="M14 12 H106 L96 150 H24 Z"/></clipPath>
        <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:#7dd3fc"/><stop offset="1" style="stop-color:#0369a1"/></linearGradient></defs>
      <path class="w-bg" d="M14 12 H106 L96 150 H24 Z"/>
      <g clip-path="url(#${id}c)">
        <g class="w-level ${ANIM ? 'level-anim' : ''}" style="transform:translateY(${level}px)">
          <path class="wave w2" d="${wave}" style="fill:url(#${id}g)"/><path class="wave w1" d="${wave}" style="fill:url(#${id}g)"/>
        </g>
        ${p > 0.06 ? '<circle class="bub b1" cx="42" cy="146" r="2.6"/><circle class="bub b2" cx="70" cy="148" r="2"/><circle class="bub b3" cx="84" cy="144" r="1.6"/>' : ''}
      </g>
      <path class="w-outline" d="M14 12 H106 L96 150 H24 Z"/>
      <text x="60" y="90" text-anchor="middle" class="w-pct">${round(clamp(p, 0, 9.99) * 100)}%</text>
    </svg>`;
  }

  // Light haptic tap on phones that support it (Android Chrome). Silently ignored elsewhere.
  function buzz(pattern = 8) {
    if (!S.settings.haptics || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; // browsers block it before the first tap
    try { navigator.vibrate(pattern); } catch (e) { /* not allowed */ }
  }

  // 240° speedometer-style gauge (used for Readiness).
  function gauge(p, color, size = 168) {
    const sw = 14, r = (size - sw) / 2, h = size / 2, sweep = 240, c = 2 * Math.PI * r, len = (c * sweep) / 360;
    const v = clamp(p, 0, 1), rot = 90 + (360 - sweep) / 2;
    const arc = (stroke, dash, anim) => `<circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${dash} ${c}" stroke-dashoffset="0" transform="rotate(${rot} ${h} ${h})" class="${anim ? 'ring-anim' : ''}" style="stroke:${stroke};--c0:${dash}"/>`;
    return `<svg width="${size}" height="${round(size * 0.78)}" viewBox="0 0 ${size} ${round(size * 0.78)}" aria-hidden="true">
      ${arc('var(--bg-2)', len, false)}
      ${v > 0 ? arc(color, len * v, ANIM) : ''}
    </svg>`;
  }

  function celebrate() {
    buzz([18, 40, 18]);
    if (reduceMotion() || !document.body.animate) return;
    const colors = ['#d4ff3f', '#ff7a3d', '#45c4ff', '#9d94ff', '#ff6b9a', '#ffc53d'];
    const box = document.createElement('div');
    box.className = 'confetti';
    document.body.appendChild(box);
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = 0; i < 120; i++) {
      const el = document.createElement('i');
      el.style.background = colors[i % colors.length];
      if (i % 3 === 0) el.style.borderRadius = '50%';
      box.appendChild(el);
      const dx = (Math.random() - 0.5) * W * 0.95, up = -H * (0.3 + Math.random() * 0.45), rot = (Math.random() - 0.5) * 1440;
      el.animate([
        { transform: 'translate(0,0) rotate(0deg) scale(.6)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${up}px) rotate(${rot / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${H * 0.35}px) rotate(${rot}deg) scale(.9)`, opacity: 0 },
      ], { duration: 1800 + Math.random() * 1300, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'forwards' });
    }
    setTimeout(() => box.remove(), 3400);
  }

  function mbar(label, val, goal, color, unit = 'g', limit = false, d = 0) {
    const over = val > goal;
    const c = limit && over ? 'var(--bad)' : color;
    return `<div class="mbar"><div class="mbar-top"><span>${esc(label)}</span><span><b>${fmt(val, d)}</b> / ${fmt(goal, d)} ${unit}${limit ? ' max' : ''}</span></div>
      <div class="track"><div class="fill" style="width:${pct(val, goal)}%;background:${c}"></div></div></div>`;
  }

  const scoreColor = (s) => (s >= 80 ? 'var(--good)' : s >= 55 ? 'var(--carbs)' : 'var(--bad)');
  const starsText = (q) => (q ? '★'.repeat(q) + '<span class="faint">' + '★'.repeat(5 - q) + '</span>' : '—');

  // ---------------- Charts (SVG) ----------------
  function niceStep(range, count = 4) {
    const raw = (range || 1) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }
  const chartLabel = (k, n) => (n <= 8 ? fmtDay(k, { weekday: 'short' }) : fmtDay(k, { day: 'numeric', month: 'short' }));
  const emptyChart = (msg = 'Not enough data yet — keep logging and this chart will fill in.') => `<div class="empty">${esc(msg)}</div>`;

  function barChart({ values, labels, tips, target = null, color = 'var(--primary)', colorFn = null, h = 200, unit = '', d = 0 }) {
    if (!values.some((v) => v)) return emptyChart();
    const W = 640, H = h, L = 42, R = 8, T = 10, B = 24;
    const n = values.length;
    const vmax = Math.max(target || 0, ...values.map((v) => v || 0));
    const step = niceStep(vmax * 1.05);
    const max = Math.max(step, Math.ceil((vmax * 1.05) / step) * step);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const cw = (W - L - R) / n, bw = Math.max(2, Math.min(34, cw * 0.66));
    let s = '';
    for (let i = 0; i * step <= max + 1e-9; i++) {
      const v = i * step;
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid-l"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${shortNum(v)}</text>`;
    }
    const every = Math.ceil(n / 8);
    const gid = 'cg' + (++chartSeq), grads = {};
    let defs = '';
    const fillFor = (c) => {
      if (!grads[c]) {
        grads[c] = gid + '_' + Object.keys(grads).length;
        defs += `<linearGradient id="${grads[c]}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${c}"/><stop offset="1" style="stop-color:${c};stop-opacity:.4"/></linearGradient>`;
      }
      return `url(#${grads[c]})`;
    };
    values.forEach((v, i) => {
      const val = v || 0, x = L + i * cw + (cw - bw) / 2, yy = y(val), hh = Math.max(0, H - B - yy);
      const c = colorFn ? colorFn(v, i) : color;
      if (val > 0) s += `<rect class="bar" x="${x}" y="${yy}" width="${bw}" height="${hh}" rx="${Math.min(6, bw / 2)}" style="fill:${fillFor(c)};animation-delay:${Math.min(i * 14, 420)}ms"/>`;
      const tip = `${(tips || labels)[i]}\n${v == null || v === 0 ? 'No data' : fmt(v, d) + ' ' + unit}`;
      s += `<rect class="hit" x="${L + i * cw}" y="${T}" width="${cw}" height="${H - T - B}" data-tip="${esc(tip)}"/>`;
      if (i % every === 0) s += `<text x="${L + i * cw + cw / 2}" y="${H - 6}" class="ax" text-anchor="middle">${esc(labels[i])}</text>`;
    });
    if (target) s += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" class="target"><title>Goal ${fmt(target, d)} ${unit}</title></line>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><defs>${defs}</defs>${s}</svg>`;
  }

  function lineChart({ series, labels, tips, target = null, h = 200, unit = '', d = 1, minZero = false }) {
    const all = series.flatMap((s) => s.values).filter((v) => v != null);
    if (all.length < 2) return emptyChart();
    if (target != null) all.push(target);
    let lo = Math.min(...all), hi = Math.max(...all);
    if (minZero) lo = 0;
    if (hi === lo) { hi += 1; lo = minZero ? 0 : lo - 1; }
    const padV = (hi - lo) * 0.08;
    const step = niceStep(hi - lo + padV * 2);
    lo = minZero ? 0 : Math.floor((lo - padV) / step) * step;
    hi = Math.ceil((hi + padV) / step) * step;
    const W = 640, H = h, L = 42, R = 10, T = 10, B = 24, n = labels.length;
    const x = (i) => (n === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let s = '';
    for (let i = 0; lo + i * step <= hi + 1e-9; i++) {
      const v = lo + i * step;
      s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid-l"/><text x="${L - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${shortNum(round(v, 2))}</text>`;
    }
    if (target != null) s += `<line x1="${L}" x2="${W - R}" y1="${y(target)}" y2="${y(target)}" class="target"/>`;
    let defs = '';
    for (const se of series) {
      const segs = [];
      let cur = [];
      se.values.forEach((v, i) => {
        if (v == null) { if (!se.connect && cur.length) { segs.push(cur); cur = []; } return; }
        cur.push([round(x(i), 1), round(y(v), 1)]);
      });
      if (cur.length) segs.push(cur);
      if (se.area) {
        const id = 'lg' + (++chartSeq);
        defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${se.color};stop-opacity:.38"/><stop offset="1" style="stop-color:${se.color};stop-opacity:0"/></linearGradient>`;
        segs.filter((g) => g.length > 1).forEach((g) => { s += `<path class="area" d="M${g[0][0]},${H - B} ${g.map((q) => `L${q[0]},${q[1]}`).join(' ')} L${g[g.length - 1][0]},${H - B} Z" style="fill:url(#${id})"/>`; });
      }
      const path = segs.map((g) => g.map((q, j) => `${j ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ')).join(' ');
      s += `<path ${se.dashed ? '' : 'class="line" pathLength="1"'} d="${path}" fill="none" style="stroke:${se.color}" stroke-width="${se.width || 2.5}" stroke-linejoin="round" stroke-linecap="round" ${se.dashed ? 'stroke-dasharray="6 5"' : ''}/>`;
      if (se.dots !== false && n <= 45) se.values.forEach((v, i) => { if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="3.2" stroke-width="2" style="fill:var(--card-solid);stroke:${se.color}"/>`; });
    }
    const every = Math.ceil(n / 8);
    const cw = n > 1 ? (W - L - R) / (n - 1) : W - L - R;
    labels.forEach((lb, i) => {
      const parts = series.map((se) => `${se.label || ''}: ${se.values[i] == null ? '—' : fmt(se.values[i], d) + ' ' + unit}`).join('\n');
      s += `<rect class="hit" x="${x(i) - cw / 2}" y="${T}" width="${cw}" height="${H - T - B}" data-tip="${esc((tips || labels)[i] + '\n' + parts)}"/>`;
      if (i % every === 0) s += `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${esc(lb)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><defs>${defs}</defs>${s}</svg>`;
  }

  function donut(segs, size = 140, stroke = 18, inner = '') {
    const total = sum(segs, (s) => s.v);
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    let off = 0, s = '';
    if (total > 0) {
      for (const g of segs) {
        const len = (g.v / total) * c;
        s += `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${g.color}" stroke-width="${stroke}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(g.label)}: ${round((g.v / total) * 100)}%</title></circle>`;
        off += len;
      }
    }
    return `<div class="ring-wrap" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" class="ring-track" stroke-width="${stroke}"/>${s}</svg><div class="ring-center">${inner}</div></div>`;
  }

  function nutrientBars(values, g) {
    return NUTR.filter((n) => n.k !== 'kcal').map((n) => {
      const v = values[n.k] || 0, goal = g[n.k];
      const limit = LIMIT_KEYS.includes(n.k);
      const ratio = goal ? v / goal : 0;
      const color = limit ? (ratio > 1 ? 'var(--bad)' : 'var(--good)') : ratio >= 0.9 ? 'var(--good)' : ratio >= 0.6 ? 'var(--carbs)' : 'var(--bad)';
      const scaleMax = Math.max(goal * 1.25, v);
      return `<div class="hbar" data-tip="${esc(`${n.label}: ${fmt(v, n.d)} ${n.unit}\n${limit ? 'Limit' : 'Target'}: ${fmt(goal, n.d)} ${n.unit} (${round(ratio * 100)}%)`)}">
        <span>${esc(n.label)}</span>
        <div class="track"><div class="fill" style="width:${(v / scaleMax) * 100}%;background:${color}"></div><div class="mark" style="left:${(goal / scaleMax) * 100}%"></div></div>
        <span class="v">${fmt(v, n.d)} / ${fmt(goal, n.d)} ${n.unit}</span></div>`;
    }).join('');
  }

  // ---------------- Toasts ----------------
  function toast(msg, opts = {}) {
    if (typeof opts === 'string') opts = { type: opts };
    const box = $('#toasts');
    if (!box) return;
    while (box.children.length >= 4) box.firstChild.remove();
    const el = document.createElement('div');
    el.className = 'toast ' + (opts.type || '');
    if (opts.emoji) el.classList.add('has-emo');
    el.innerHTML = `${opts.emoji ? emo(opts.emoji, { size: 40, anim: true, cls: 'toast-emo' }) : ''}${opts.title ? `<div class="toast-title">${esc(opts.title)}</div>` : ''}<div class="toast-msg">${esc(msg)}</div><div class="toast-actions"></div><button class="toast-close" aria-label="Dismiss">×</button>`;
    const dismiss = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 260); };
    const acts = el.querySelector('.toast-actions');
    (opts.actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn sm';
      b.textContent = a.label;
      b.addEventListener('click', () => { dismiss(); a.fn(); });
      acts.appendChild(b);
    });
    el.querySelector('.toast-close').addEventListener('click', dismiss);
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(dismiss, opts.timeout || 3500);
  }

  // ---------------- Modal ----------------
  let modalDismissable = true;
  let modalOnClose = null;
  function openModal({ title, body, wide = false, dismissable = true, onMount = null, onClose = null }) {
    const root = $('#modal-root');
    const prevClose = modalOnClose;
    modalOnClose = null;
    if (prevClose) prevClose();
    modalDismissable = dismissable;
    modalOnClose = onClose;
    root.innerHTML = `<div class="modal-backdrop" data-backdrop>
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head"><h2 id="modal-title">${esc(title)}</h2>${dismissable ? `<button class="icon-btn plain" data-action="close-modal" aria-label="Close">${icon('x')}</button>` : ''}</div>
        <div class="modal-body">${body}</div>
      </div></div>`;
    const m = root.querySelector('.modal');
    if (onMount) onMount(m);
    const first = m.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea');
    if (first && !m.querySelector('[autofocus]')) setTimeout(() => first.focus(), 30);
  }
  function closeModal() {
    const root = $('#modal-root');
    if (!root.firstChild) return;
    root.innerHTML = '';
    const fn = modalOnClose; modalOnClose = null;
    if (fn) fn();
  }
  const setModalTitle = (t) => { const h = $('#modal-title'); if (h) h.textContent = t; };
  const modalOpen = () => !!$('#modal-root').firstChild;

  function download(name, text, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ------------------------------------------------------------------
  // Routing & date navigation
  // ------------------------------------------------------------------
  let curDate = todayKey();
  let followToday = true;
  let insRange = 30;

  const ROUTES = [
    { id: 'today', label: 'Today', icon: 'home', color: 'var(--primary)', dated: true, render: pageToday, bind: bindToday },
    { id: 'nutrition', label: 'Nutrition', icon: 'food', color: 'var(--cal)', dated: true, render: pageNutrition },
    { id: 'water', label: 'Hydration', icon: 'water', color: 'var(--water)', dated: true, render: pageWater },
    { id: 'activity', label: 'Activity', icon: 'activity', color: 'var(--move)', dated: true, render: pageActivity, bind: bindActivity },
    { id: 'sleep', label: 'Sleep', icon: 'moon', color: 'var(--sleep)', dated: true, render: pageSleep },
    { id: 'body', label: 'Body', icon: 'scale', color: 'var(--body)', dated: true, render: pageBody },
    { id: 'insights', label: 'Insights', icon: 'chart', color: 'var(--primary-2)', dated: false, render: pageInsights },
    { id: 'reminders', label: 'Reminders', icon: 'bell', color: 'var(--mood)', dated: false, render: pageReminders },
    { id: 'settings', label: 'Settings', icon: 'settings', color: 'var(--muted)', dated: false, render: pageSettings },
  ];
  const currentRoute = () => {
    const id = (location.hash.replace(/^#\/?/, '') || 'today').split(/[/?]/)[0];
    return ROUTES.find((r) => r.id === id) || ROUTES[0];
  };

  function setDate(k) {
    const t = todayKey();
    if (!isKey(k)) return;
    if (k > t) k = t;
    slideDir = k > curDate ? 'from-right' : k < curDate ? 'from-left' : '';
    curDate = k;
    followToday = k === t;
    forceAnim = true;
    render();
  }

  function renderNav() {
    $('#nav').innerHTML = ROUTES.map((r) => `<a href="#/${r.id}" data-route="${r.id}" style="--c:${r.color}">${icon(r.icon)}<span>${r.label}</span></a>`).join('');
    $('[data-action="date-prev"]').innerHTML = icon('left');
    $('[data-action="date-next"]').innerHTML = icon('right');
    $('#search-btn').innerHTML = `${icon('search')}<span>Search or run a command</span><kbd>Ctrl K</kbd>`;
    const items = [
      ['add-food', '', 'food', 'Log food', 'var(--cal)'],
      ['water', 'data-ml="250"', 'water', '+250 ml water', 'var(--water)'],
      ['goto', 'data-route="activity" data-focus="#wo-type"', 'activity', 'Workout', 'var(--move)'],
      ['goto', 'data-route="sleep" data-focus="input[name=bed]"', 'moon', 'Sleep', 'var(--sleep)'],
      ['goto', 'data-route="body" data-focus="input[name=weight]"', 'scale', 'Weight', 'var(--body)'],
      ['fast-toggle', '', 'timer', 'Start / end fast', 'var(--body)'],
      ['breathe', '', 'wind', 'Breathe', 'var(--primary-2)'],
      ['cmdk', '', 'search', 'Search & commands', 'var(--primary-fill)'],
    ];
    const scrim = document.createElement('div');
    scrim.className = 'fab-scrim'; scrim.id = 'fab-scrim'; scrim.dataset.action = 'fab-toggle';
    const fab = document.createElement('div');
    fab.className = 'fab-wrap'; fab.id = 'fab';
    fab.innerHTML = `<div class="fab-menu">${items.map(([a, attr, ic, lb, c]) => `<button class="fab-item" data-action="${a}" ${attr} style="--c:${c}"><span>${lb}</span><i>${icon(ic)}</i></button>`).join('')}</div>
      <button class="fab" data-action="fab-toggle" aria-label="Quick log" aria-expanded="false">${icon('plus')}</button>`;
    document.body.appendChild(scrim);
    document.body.appendChild(fab);
  }

  function toggleFab(force) {
    const w = $('#fab');
    if (!w) return;
    const open = force == null ? !w.classList.contains('open') : !!force;
    w.classList.toggle('open', open);
    $('#fab-scrim').classList.toggle('show', open);
    const b = $('.fab', w);
    if (b) b.setAttribute('aria-expanded', String(open));
  }

  function gotoFocus(route, sel) {
    pendingFocus = sel || null;
    if (currentRoute().id === route) render(); else location.hash = '#/' + route;
  }

  function updateChrome(r) {
    $$('#nav a').forEach((a) => {
      const on = a.dataset.route === r.id;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      // On phones the bottom bar scrolls sideways: keep the current tab visible.
      if (on && window.innerWidth <= 860) {
        const nav = $('#nav');
        nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
    });
    $('#page-title').textContent = r.label;
    document.title = `${r.label} · Thrive`;
    const t = todayKey();
    $('#datenav').classList.toggle('hidden', !r.dated);
    $('#date-text').textContent = relDay(curDate);
    const di = $('#date-input');
    di.value = curDate; di.max = t;
    $('[data-action="date-next"]').disabled = curDate >= t;
    $('#date-today-btn').style.display = curDate === t ? 'none' : '';
    const n = Object.keys(S.days).length;
    $('#sidebar-foot').innerHTML = S.profile ? `Signed in locally as <b>${esc(S.profile.name || 'you')}</b><br>${plural(n, 'day')} tracked · data stays on this device<br>Press <kbd>?</kbd> for shortcuts` : '';
  }

  let lastRoute = null, forceAnim = false, pendingFocus = null, slideDir = '';
  function render() {
    const r = currentRoute();
    const routeChanged = r.id !== lastRoute;
    ANIM = !reduceMotion() && (routeChanged || forceAnim);
    const dir = routeChanged ? '' : slideDir;
    forceAnim = false; slideDir = '';
    lastRoute = r.id;
    updateChrome(r);
    const view = $('#view');
    view.dataset.page = r.id;
    view.style.setProperty('--c', r.color);
    try {
      view.innerHTML = r.render();
      if (r.bind) r.bind();
    } catch (err) {
      console.error(err);
      view.innerHTML = `<div class="card error"><b>Something went wrong showing this page.</b><br>${esc(err && err.message)}<br><br>Your data is safe. Try reloading, or export a backup from Settings.</div>`;
    }
    view.classList.remove('enter', 'from-left', 'from-right');
    if (ANIM) { void view.offsetWidth; view.classList.add('enter'); if (dir) view.classList.add(dir); runAnimations(view); }
    updateLive();
    ANIM = false;
    if (pendingFocus) {
      const el = $(pendingFocus, view);
      pendingFocus = null;
      if (el) {
        if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
        setTimeout(() => { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }, 350);
      }
    }
  }

  // ------------------------------------------------------------------
  // Page: Today
  // ------------------------------------------------------------------
  function ringsFor(k) {
    const t = dayTotals(k), g = goals();
    const eatP = t.kcal / g.kcal, moveP = Math.max(t.activeMin / g.activeMin, t.steps / g.steps), sleepP = t.sleep != null ? t.sleep / g.sleep : 0;
    return [
      { id: 'eat', label: 'Eat', color: eatP > 1.1 ? 'var(--bad)' : 'var(--cal)', p: Math.min(eatP, 1), pct: eatP, done: eatP >= 0.9 && eatP <= 1.1, route: 'nutrition', val: `${fmt(t.kcal)} / ${fmt(g.kcal)} kcal` },
      { id: 'drink', label: 'Drink', color: 'var(--water)', p: t.water / g.water, pct: t.water / g.water, done: t.water >= g.water, route: 'water', val: `${fmt(t.water / 1000, 2)} / ${fmt(g.water / 1000, 1)} L` },
      { id: 'move', label: 'Move', color: 'var(--move)', p: moveP, pct: moveP, done: moveP >= 1, route: 'activity', val: `${fmt(t.activeMin)} min · ${fmt(t.steps)} steps` },
      { id: 'sleep', label: 'Sleep', color: 'var(--sleep)', p: sleepP, pct: sleepP, done: t.sleep != null && t.sleep >= g.sleep - 0.25, route: 'sleep', val: t.sleep != null ? `${fmtDur(t.sleep)} / ${g.sleep}h` : 'Not logged yet' },
    ];
  }

  function ringHint(r, t, g) {
    switch (r.id) {
      case 'eat': return t.kcal < g.kcal ? `${fmt(g.kcal - t.kcal)} kcal left to eat.` : `${fmt(t.kcal - g.kcal)} kcal over — keep the rest of today light.`;
      case 'drink': return `${fmt(g.water - t.water)} ml more water closes Drink.`;
      case 'move': return `${fmt(Math.max(0, g.activeMin - t.activeMin))} active minutes closes Move.`;
      default: return t.sleep == null ? "Log last night's sleep to close Sleep." : 'An earlier night will close Sleep.';
    }
  }

  function weekStrip(k) {
    const t = todayKey();
    let end = addDays(k, 3);
    if (end > t) end = t;
    return `<nav class="weekstrip" aria-label="Recent days">${rangeKeys(end, 7).map((x) => {
      const hs = healthScore(x);
      return `<button class="wday ${x === k ? 'active' : ''} ${x === t ? 'is-today' : ''}" data-action="goto-date" data-k="${x}" data-tip="${esc(fmtDay(x) + (hs ? `\nScore ${hs.score}` : '\nNo data yet'))}" aria-label="${esc(fmtDay(x))}">
        <span class="wd-name">${esc(fmtDay(x, { weekday: 'short' }))}</span>${multiRing(ringsFor(x), 44, 4, 1.6, '', false)}<span class="wd-num">${parseKey(x).getDate()}</span></button>`;
    }).join('')}</nav>`;
  }

  // Suggest foods that fit what's left of today's budget.
  function suggestFoods(k) {
    const t = dayTotals(k), g = goals();
    const remK = g.kcal - t.kcal, remP = g.p - t.p, remFi = g.fi - t.fi;
    const pool = BASE_FOODS.filter((f) => !['Fats & oils', 'Fast food', 'Drinks'].includes(f.cat) && !['Sugar', 'Honey'].includes(f.name))
      .map((f) => ({ food: f, s: scaleFood(f, f.sg) })).filter((x) => x.s.su < 20);
    const ratio = (a, b) => a / Math.max(b, 1);
    let title, list, why, color;
    if (remK < 100) {
      title = remK < -100 ? 'Over budget — stay light' : 'Nearly at budget';
      list = pool.filter((x) => x.s.kcal <= 70 && x.s.fi >= 0.8).sort((a, b) => a.s.kcal - b.s.kcal);
      why = (x) => `${fmt(x.s.kcal)} kcal`; color = 'var(--move)';
    } else if (remP > 15) {
      title = `${fmt(remP)} g protein to go`;
      list = pool.filter((x) => x.s.kcal <= remK + 50 && x.s.p >= 5).sort((a, b) => ratio(b.s.p, b.s.kcal) - ratio(a.s.p, a.s.kcal));
      why = (x) => `+${fmt(x.s.p)} g protein`; color = 'var(--protein)';
    } else if (remFi > 5) {
      title = `${fmt(remFi)} g fiber to go`;
      list = pool.filter((x) => x.s.kcal <= remK + 50 && x.s.fi >= 2).sort((a, b) => ratio(b.s.fi, b.s.kcal) - ratio(a.s.fi, a.s.kcal));
      why = (x) => `+${fmt(x.s.fi, 1)} g fiber`; color = 'var(--fiber)';
    } else {
      title = `${fmt(remK)} kcal left`;
      list = pool.filter((x) => x.s.kcal <= remK && x.s.kcal >= 80).sort((a, b) => ratio(b.s.p + b.s.fi * 2, b.s.kcal) - ratio(a.s.p + a.s.fi * 2, a.s.kcal));
      why = (x) => `${fmt(x.s.kcal)} kcal`; color = 'var(--cal)';
    }
    const top = list.slice(0, 12), seed = parseKey(k).getDate(), items = [];
    for (let j = 0; j < top.length && items.length < 4; j++) items.push(top[(seed + j) % top.length]);
    return { title, items: items.map((x) => Object.assign({}, x, { why: why(x), color })) };
  }

  function logFoodQuick(food, qty, meal) {
    const before = snap(curDate);
    const grams = qty * food.sg, n = scaleFood(food, grams);
    const entry = { id: uid(), foodId: food.id, name: food.name, meal, grams: round(grams, 1), qty, mode: 'serving', qtyLabel: `${qty} × ${food.unit} (${fmt(grams)} g)`, time: nowHM() };
    for (const key of NKEYS) entry[key] = round(n[key], 2);
    editDay(curDate).foods.push(entry);
    pushRecent(food.id);
    save(); render(); buzz();
    toast(`Added ${food.name} to ${mealLabel(meal).toLowerCase()} · ${fmt(entry.kcal)} kcal`, { type: 'success', emoji: (MEALS.find((m) => m.id === meal) || MEALS[3]).emoji, actions: [{ label: 'Undo', fn: () => { const d = editDay(curDate); d.foods = d.foods.filter((x) => x.id !== entry.id); save(); render(); } }] });
    celebrateDiff(curDate, before);
  }

  // Snapshot of goal states, used to celebrate the moment a goal is reached.
  function snap(k) {
    const t = dayTotals(k), g = goals();
    return { rings: ringsFor(k).map((r) => r.done), p: t.p >= g.p };
  }
  function celebrateDiff(k, before) {
    const after = snap(k), msgs = [];
    const names = [null, 'Hydration goal reached', 'Move goal reached', 'Sleep goal reached'];
    after.rings.forEach((v, i) => { if (v && !before.rings[i] && names[i]) msgs.push(names[i]); });
    if (after.p && !before.p) msgs.push('Protein goal hit');
    if (after.rings.every(Boolean) && !before.rings.every(Boolean)) {
      celebrate();
      toast('All four rings are closed. That is a perfect day!', { title: 'Legendary', emoji: '🏆', type: 'success', timeout: 6000 });
    } else if (msgs.length) {
      celebrate();
      toast(msgs.join(' · '), { title: 'Goal unlocked', emoji: '🎉', type: 'success', timeout: 5000 });
    }
  }

  function timelineHtml(d) {
    const ev = [];
    d.foods.forEach((f) => ev.push({ t: f.time, c: 'var(--cal)', ic: 'food', title: f.name, sub: `${mealLabel(f.meal)} · ${fmt(f.kcal)} kcal` }));
    d.water.forEach((w) => ev.push({ t: w.time, c: 'var(--water)', ic: 'water', title: `${fmt(w.ml)} ml water`, sub: 'Hydration' }));
    d.workouts.forEach((w) => ev.push({ t: w.time || '', c: 'var(--move)', ic: 'activity', title: w.type, sub: `${fmt(w.minutes)} min · ${fmt(w.kcal)} kcal` }));
    if (d.sleep) ev.push({ t: d.sleep.wake, c: 'var(--sleep)', ic: 'moon', title: `Woke up after ${fmtDur(d.sleep.hours)}`, sub: `In bed at ${d.sleep.bed}` });
    if (!ev.length) return `<div class="empty">Everything you log today shows up here in order.</div>`;
    ev.sort((a, b) => String(b.t).localeCompare(String(a.t)));
    return `<ol class="timeline">${ev.slice(0, 8).map((e) => `<li style="--c:${e.c}"><span class="tl-time">${esc(e.t || '—')}</span><span class="tl-dot">${icon(e.ic)}</span><div style="min-width:0"><div class="entry-name">${esc(e.title)}</div><div class="entry-sub">${esc(e.sub)}</div></div></li>`).join('')}</ol>${ev.length > 8 ? `<div class="tiny muted mt">+${ev.length - 8} earlier entries</div>` : ''}`;
  }

  function pageToday() {
    const k = curDate, d = getDay(k), t = dayTotals(k), g = goals(), hs = healthScore(k);
    const isToday = k === todayKey();
    const h = new Date().getHours();
    const greet = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const first = S.profile && S.profile.name ? ', ' + esc(String(S.profile.name).split(' ')[0]) : '';
    const budget = g.kcal + (S.settings.eatBackExercise ? t.burned : 0);
    const remaining = budget - t.kcal;
    const over = remaining < 0;
    const rings = ringsFor(k);
    const closed = rings.filter((r) => r.done).length;
    const next = rings.find((r) => !r.done);
    const motto = !t.hasData
      ? (isToday ? 'A fresh start. Log a glass of water or your breakfast to get the rings moving.' : 'Nothing was logged on this day. You can still add entries.')
      : closed === 4 ? 'All four rings closed. A perfect day!' : `${closed} of 4 rings closed. ${next ? ringHint(next, t, g) : ''}`;
    const sg = suggestFoods(k);
    const sl = d.sleep;
    const upcoming = isToday ? upcomingReminders(4) : [];

    const mealRows = MEALS.map((m) => {
      const items = d.foods.filter((f) => f.meal === m.id);
      return `<div class="entry"><span class="meal-emoji">${emo(m.emoji, { size: 28 })}</span><div class="entry-main"><div class="entry-name">${m.label}</div><div class="entry-sub">${items.length ? esc(items.slice(0, 3).map((i) => i.name).join(', ')) + (items.length > 3 ? ` +${items.length - 3} more` : '') : 'Nothing logged'}</div></div>
        <span class="entry-val">${fmt(sum(items, (i) => i.kcal))} kcal</span><button class="icon-btn plain" data-action="add-food" data-meal="${m.id}" aria-label="Add to ${m.label}">${icon('plus')}</button></div>`;
    }).join('');

    const sleepHtml = sl
      ? `<div class="cal-row" style="margin:0">${ring(sl.hours / g.sleep, 'var(--sleep)', 104, 10, `<b>${cnt(sl.hours, 1)}h</b><span>slept</span>`)}
          <div class="cal-stats"><div><span>Bedtime</span><b>${esc(sl.bed)}</b></div><div><span>Woke up</span><b>${esc(sl.wake)}</b></div><div><span>Quality</span><b class="star-text">${starsText(sl.quality)}</b></div></div></div>
         <div class="tiny muted mt">${sl.hours >= g.sleep ? `You hit your sleep goal ${emo('🎉', { size: 16, anim: true })}` : `${fmtDur(g.sleep - sl.hours)} short of your ${g.sleep}h goal`}</div>`
      : `<div class="empty">No sleep logged for last night.<br><button class="btn sm mt" data-action="goto" data-route="sleep" data-focus="input[name=bed]">${icon('moon')} Log sleep</button></div>`;

    return `
    <section class="hero ink">
      <div class="hero-main">
        <div class="eyebrow">${esc(fmtDay(k, { weekday: 'long', day: 'numeric', month: 'long' }))}${isToday ? ' · Today' : ''}</div>
        <h2>${isToday ? `${greet}${first} ${emo(h < 5 ? '🌛' : h < 12 ? '👋' : h < 17 ? '😎' : '🌝', { size: 40, anim: true, cls: 'emo-hero' })}` : 'Day in review'}</h2>
        <p class="hero-sub">${esc(motto)}</p>
        <div class="quick">
          <button class="qbtn eat" data-action="add-food">${icon('food')}<span>Log food</span></button>
          <button class="qbtn drink" data-action="water" data-ml="250">${icon('water')}<span>+250 ml</span></button>
          <button class="qbtn move" data-action="goto" data-route="activity" data-focus="#wo-type">${icon('activity')}<span>Workout</span></button>
          <button class="qbtn sleep" data-action="goto" data-route="sleep" data-focus="input[name=bed]">${icon('moon')}<span>Sleep</span></button>
        </div>
      </div>
      <div class="hero-rings">
        ${multiRing(rings, 232, 14, 4, `<b class="score-num" style="color:${hs ? scoreColor(hs.score) : 'var(--faint)'}">${hs ? cnt(hs.score) : '—'}</b><span>Score</span>`)}
        <div class="rings-legend">${rings.map((r) => `<a class="rl-item" href="#/${r.route}" style="--c:${r.color}"><i></i><div><div class="rl-label">${r.label}${r.done ? icon('check') : ''}</div><div class="rl-val">${esc(r.val)}</div></div><b>${cnt(round(r.pct * 100))}%</b></a>`).join('')}</div>
      </div>
    </section>
    ${weekStrip(k)}
    ${Object.values(S.days).filter(dayHasData).length < 3 && !hasSample() ? `<div class="banner mt-lg">${icon('sparkle')}<span><b>New here?</b> Load 90 days of realistic sample data to see every chart, insight and score. You can remove it in one tap.</span><span class="spacer"></span><button class="btn sm" data-action="demo">Try sample data</button></div>` : ''}

    <div class="grid">
      ${readinessCard(k)}

      <section class="card" style="--c:var(--cal)">
        <div class="card-head"><h3>${icon('flame')} Calories</h3><a href="#/nutrition" class="small">Details →</a></div>
        <div class="cal-row">
          ${ring(t.kcal / budget, over ? 'var(--bad)' : 'var(--cal)', 124, 12, `<b>${cnt(Math.abs(remaining))}</b><span>${over ? 'over' : 'left'}</span>`)}
          <div class="cal-stats">
            <div><span>Goal</span><b>${fmt(g.kcal)}</b></div>
            <div><span>Food</span><b>${fmt(t.kcal)}</b></div>
            <div><span>Exercise${S.settings.eatBackExercise ? '' : ' (info)'}</span><b>${fmt(t.burned)}</b></div>
            <div><span>Net</span><b>${fmt(t.kcal - t.burned)}</b></div>
          </div>
        </div>
        ${mbar('Protein', t.p, g.p, 'var(--protein)')}
        ${mbar('Carbs', t.c, g.c, 'var(--carbs)')}
        ${mbar('Fat', t.f, g.f, 'var(--fat)')}
        ${mbar('Fiber', t.fi, g.fi, 'var(--fiber)')}
      </section>

      <section class="card" style="--c:var(--protein)">
        <div class="card-head"><h3>${icon('zap')} Smart picks</h3><span class="sub">${esc(sg.title)}</span></div>
        ${sg.items.length ? `<div class="sugg">${sg.items.map((it) => `<div class="sugg-item"><div class="sugg-main"><div class="entry-name">${esc(it.food.name)}</div><div class="entry-sub">${esc(it.food.unit)} · ${fmt(it.s.kcal)} kcal · P ${fmt(it.s.p, 1)} g</div></div><span class="pill" style="--c:${it.color}">${esc(it.why)}</span><button class="icon-btn add" style="--c:${it.color}" data-action="sugg-add" data-id="${esc(it.food.id)}" aria-label="Add ${esc(it.food.name)}" data-tip="Add 1 serving to ${esc(mealLabel(guessMeal()).toLowerCase())}">${icon('plus')}</button></div>`).join('')}</div>
          <div class="tiny muted mt">Picked to fit what's left of your day. Tap + to log one serving.</div>` : '<div class="empty">You are right on target. Nothing to add.</div>'}
      </section>

      <section class="card" style="--c:var(--water)">
        <div class="card-head"><h3>${icon('water')} Hydration</h3><a href="#/water" class="small">Details →</a></div>
        <div class="glass-wrap">
          ${glassSvg(t.water / g.water, 96)}
          <div style="flex:1;min-width:150px">
            <div class="big">${cnt(t.water)} <small>/ ${fmt(g.water)} ml</small></div>
            <div class="water-btns mt">${[150, 250, 500, 750].map((ml) => `<button class="btn ghost sm" data-action="water" data-ml="${ml}">+${ml} ml</button>`).join('')}</div>
          </div>
        </div>
        <div class="small muted mt">${esc(waterPaceText(k, t.water, g.water))}</div>
      </section>

      ${habitsCard(k)}

      ${isToday ? fastingCard() : ''}

      <section class="card" style="--c:var(--move)">
        <div class="card-head"><h3>${icon('activity')} Activity</h3><a href="#/activity" class="small">Details →</a></div>
        <div class="stat-row">
          <div class="stat"><div class="s-label">Steps</div><div class="s-value">${cnt(t.steps)}</div></div>
          <div class="stat"><div class="s-label">Active min</div><div class="s-value">${cnt(t.activeMin)}</div></div>
          <div class="stat"><div class="s-label">Burned</div><div class="s-value">${cnt(t.burned)}</div></div>
        </div>
        <div class="mt">${mbar('Steps', t.steps, g.steps, 'var(--move)', '')}${mbar('Active minutes', t.activeMin, g.activeMin, 'var(--move)', 'min')}</div>
        <form class="row mt" data-form="steps"><input name="steps" type="number" min="0" max="100000" inputmode="numeric" placeholder="Update steps" style="flex:1"><button class="btn sm ghost">Save</button></form>
      </section>

      <section class="card" style="--c:var(--sleep)">
        <div class="card-head"><h3>${icon('moon')} Last night</h3><a href="#/sleep" class="small">${sl ? 'Edit →' : 'Log →'}</a></div>
        ${sleepHtml}
      </section>

      <section class="card" style="--c:var(--mood)">
        <div class="card-head"><h3>${icon('smile')} Daily check-in</h3></div>
        <div class="small muted">How are you feeling?</div>
        <div class="moods" style="margin-top:8px">${MOODS.map((e, i) => `<button data-action="set-mood" data-v="${i + 1}" class="${d.mood === i + 1 ? 'active' : ''}" aria-label="${MOOD_LABELS[i]}" data-tip="${MOOD_LABELS[i]}">${emo(e, { size: 34, anim: d.mood === i + 1 })}</button>`).join('')}</div>
        <div class="small muted mt">Energy level</div>
        <div class="levels" style="margin-top:8px">${[1, 2, 3, 4, 5].map((v) => `<button data-action="set-energy" data-v="${v}" class="${d.energy === v ? 'active' : ''}" aria-label="Energy ${v} of 5">${v}</button>`).join('')}</div>
        <div class="row between mt" style="--c:var(--primary-2)"><span class="small"><b>${fmt(t.mindful)}</b> <span class="muted">mindful min${isToday ? ' today' : ''}</span></span><button class="btn sm ghost" data-action="breathe">${icon('wind')} Breathe</button></div>
        <label class="field mt">Notes<textarea data-change="notes" placeholder="How do you feel? Anything unusual today?">${esc(d.notes)}</textarea></label>
      </section>

      <section class="card" style="--c:var(--primary)">
        <div class="card-head"><h3>${icon('clock')} Timeline</h3><span class="sub">${esc(relDay(k))}</span></div>
        ${timelineHtml(d)}
      </section>

      <section class="card" style="--c:var(--cal)">
        <div class="card-head"><h3>${icon('food')} Meals</h3><button class="btn sm ghost" data-action="add-food">${icon('plus')} Add</button></div>
        <div class="entries">${mealRows}</div>
      </section>

      <section class="card" style="--c:var(--primary-2)">
        <div class="card-head"><h3>${icon('sparkle')} Coach tips</h3><a href="#/insights" class="small">All insights →</a></div>
        <ul class="insights">${todayInsights(k).map((i) => `<li class="${i.type}${i.e ? ' has-e' : ''}">${i.e ? emo(i.e, { size: 24, anim: i.e === '🔥' }) : ''}<span>${esc(i.text)}</span></li>`).join('')}</ul>
      </section>

      ${isToday ? `<section class="card" style="--c:var(--mood)">
        <div class="card-head"><h3>${icon('bell')} Coming up</h3><a href="#/reminders" class="small">Manage →</a></div>
        ${upcoming.length ? `<div class="entries">${upcoming.map((u) => `<div class="entry"><span class="pill" style="--c:var(--mood)">${u.time}</span>${emo(REM_EMO[u.r.type] || REM_EMO.custom, { size: 22 })}<div class="entry-main"><div class="entry-name">${esc(u.r.label)}</div></div></div>`).join('')}</div>` : '<div class="empty">No more reminders today.</div>'}
      </section>` : ''}
    </div>`;
  }

  function bindToday() { /* all interactions use delegated handlers */ }

  function waterPaceText(k, have, goal) {
    if (have >= goal) return 'Goal reached — great job staying hydrated!';
    if (k !== todayKey()) return `${fmt(goal - have)} ml short of your goal on this day.`;
    const n = new Date(), hrs = n.getHours() + n.getMinutes() / 60;
    const expected = goal * clamp((hrs - 7) / 15, 0, 1);
    const diff = have - expected;
    if (expected <= 0) return `Start your day with a glass of water. Goal: ${fmt(goal)} ml.`;
    return diff >= 0 ? `On pace — ${fmt(diff)} ml ahead of schedule. ${fmt(goal - have)} ml to go.` : `${fmt(-diff)} ml behind pace. Try a glass now — ${fmt(goal - have)} ml to go.`;
  }

  function todayInsights(k) {
    const t = dayTotals(k), g = goals(), out = [];
    const isToday = k === todayKey();
    const hr = new Date().getHours();
    const lateEnough = !isToday || hr >= 14;
    if (!t.hasData) {
      out.push({ e: '✨', type: 'info', text: 'Start by logging breakfast or a glass of water — every entry makes your insights smarter.' });
    }
    if (t.kcal > 0) {
      const left = g.p - t.p;
      if (left > 5) out.push({ e: '💪', type: lateEnough ? 'warn' : 'info', text: `${fmt(left)} g protein to go. Easy wins: Greek yogurt (17 g/cup), eggs (6 g each), chicken breast (37 g/portion), paneer or tofu.` });
      else out.push({ e: '💪', type: 'good', text: 'Protein target reached — great for recovery and keeping you full.' });
      if (t.kcal > g.kcal * 1.1) out.push({ e: '👟', type: 'warn', text: `You're ${fmt(t.kcal - g.kcal)} kcal over your goal. A 30-minute brisk walk burns roughly ${fmt(4.3 * currentWeight() * 0.5)} kcal.` });
      if (t.na > g.na) out.push({ e: '🧂', type: 'warn', text: `Sodium is at ${fmt(t.na)} mg (limit ${fmt(g.na)} mg). Drink extra water and go easy on salty snacks.` });
      if (lateEnough && t.fi < g.fi * 0.5) out.push({ e: '🥦', type: 'info', text: `Fiber is low (${fmt(t.fi, 1)} g of ${g.fi} g). Add lentils, oats, fruit, chia seeds or vegetables.` });
      if (t.su > g.su) out.push({ e: '🍬', type: 'warn', text: `Sugar is ${fmt(t.su)} g, above the suggested ${g.su} g.` });
    }
    if (t.water < g.water && lateEnough) out.push({ e: '💧', type: 'info', text: `Hydration: ${fmt(g.water - t.water)} ml left to reach your goal.` });
    if (t.sleep != null && t.sleep < g.sleep - 1) out.push({ e: '🥱', type: 'warn', text: `You slept ${fmtDur(t.sleep)}. Short sleep raises hunger hormones — plan protein-rich meals and aim for an earlier night.` });
    if (t.sleep != null && t.sleep >= g.sleep) out.push({ e: '😎', type: 'good', text: 'Well rested! A great day for a harder workout.' });
    if (lateEnough && t.activeMin === 0 && t.steps < g.steps / 2) out.push({ e: '👟', type: 'info', text: 'No workout yet — even a 10-minute walk after a meal helps blood sugar and mood.' });
    const streak = loggingStreak();
    if (streak >= 3) out.push({ e: '🔥', type: 'good', text: `${streak}-day logging streak. Consistency is the #1 predictor of results.` });
    return out.slice(0, 5);
  }

  function loggingStreak() {
    let k = todayKey(), n = 0;
    if (!dayHasData(S.days[k])) k = addDays(k, -1);
    while (dayHasData(S.days[k])) { n++; k = addDays(k, -1); }
    return n;
  }

  // ------------------------------------------------------------------
  // Readiness (recovery score, inspired by Whoop / Oura)
  // ------------------------------------------------------------------
  function readiness(k) {
    const d = getDay(k), g = goals();
    if (!d.sleep) return null;
    const hrs = num(d.sleep.hours), q = num(d.sleep.quality);
    const prev = rangeKeys(addDays(k, -1), 7).map((x) => getDay(x).sleep).filter(Boolean);
    const debt = sum(prev, (s) => Math.max(0, g.sleep - num(s.hours)));
    const beds = prev.map((s) => bedMin(s.bed));
    const dev = beds.length >= 2 ? Math.abs(bedMin(d.sleep.bed) - avg(beds)) : null;
    const y = dayTotals(addDays(k, -1));
    const load = g.activeMin ? y.activeMin / g.activeMin : 0;
    const parts = [
      { label: 'Sleep', w: 35, v: clamp(hrs / g.sleep, 0, 1), text: fmtDur(hrs) },
      { label: 'Quality', w: 15, v: q ? (q - 1) / 4 : 0.5, text: q ? `${q}/5` : '—' },
      { label: 'Sleep debt (7d)', w: 15, v: clamp(1 - debt / 7, 0, 1), text: prev.length ? fmtDur(debt) : 'n/a' },
      { label: 'Bedtime rhythm', w: 15, v: dev == null ? 0.7 : clamp(1 - (dev - 30) / 120, 0, 1), text: dev == null ? 'n/a' : `±${Math.round(dev)} min` },
      { label: 'Yesterday’s load', w: 20, v: load <= 1.5 ? 1 : clamp(1 - (load - 1.5) * 0.35, 0.3, 1), text: `${fmt(y.activeMin)} min` },
    ];
    let score = sum(parts, (p) => p.w * p.v);
    if (d.energy) score += (d.energy - 3) * 2.5;
    score = Math.round(clamp(score, 0, 100));
    const zone = score >= 75
      ? { label: 'Primed', emoji: '🚀', color: 'var(--move)', advice: 'You are well recovered. A good day for intervals, a long run or heavy lifts.' }
      : score >= 50
        ? { label: 'Steady', emoji: '🙂', color: 'var(--mood)', advice: 'Train at a moderate effort today: tempo work, technique or a steady ride.' }
        : { label: 'Recover', emoji: '🔋', color: 'var(--bad)', advice: 'Go easy today. Walk, stretch or do yoga, drink plenty of water and get to bed early.' };
    return { score, zone, parts };
  }

  function readinessCard(k) {
    const r = readiness(k);
    const head = `<div class="card-head"><h3>${icon('gauge')} Readiness</h3><span class="sub">Sleep, rhythm & recent load</span></div>`;
    if (!r) {
      return `<section class="card" style="--c:var(--move)">${head}<div class="empty">Log ${k === todayKey() ? "last night's" : "this night's"} sleep to see how ready your body is to train.<br><button class="btn sm mt" data-action="goto" data-route="sleep" data-focus="input[name=bed]">${icon('moon')} Log sleep</button></div></section>`;
    }
    return `<section class="card" style="--c:${r.zone.color}">${head}
      <div class="ready">
        <div class="ready-gauge">${gauge(r.score / 100, r.zone.color)}<div class="g-val"><b>${cnt(r.score)}</b><span>of 100</span></div></div>
        <div class="ready-main"><span class="zone" style="--c:${r.zone.color}">${emo(r.zone.emoji, { size: 20, anim: true })}${esc(r.zone.label)}</span><p class="ready-advice">${esc(r.zone.advice)}</p></div>
      </div>
      <div class="ready-parts">${r.parts.map((p) => `<div><div class="rp-top"><span>${esc(p.label)}</span><span>${esc(p.text)}</span></div><div class="track"><div class="fill" style="width:${round(p.v * 100)}%;background:${r.zone.color}"></div></div></div>`).join('')}</div>
    </section>`;
  }

  // ------------------------------------------------------------------
  // Habits (inspired by Streaks)
  // ------------------------------------------------------------------
  function habitStreak(id, k) {
    const on = (x) => !!(getDay(x).habits || {})[id];
    let x = k, n = 0;
    if (!on(x)) x = addDays(x, -1);
    while (on(x)) { n++; x = addDays(x, -1); }
    return n;
  }

  function habitsCard(k) {
    const d = getDay(k), done = habitsDone(d), total = S.habits.length;
    const tiles = S.habits.map((h) => {
      const on = !!d.habits[h.id], st = habitStreak(h.id, k);
      return `<button class="habit ${on ? 'done' : ''}" data-action="toggle-habit" data-id="${esc(h.id)}" aria-pressed="${on}"><span class="h-emoji">${emo(h.emoji, { size: 30, anim: on })}</span><span>${esc(h.name)}</span><span class="h-streak">${st ? `${emo('🔥', { size: 15, anim: on && st >= 3 })} ${st}-day streak` : 'Tap when done'}</span><span class="h-check">${icon('check')}</span></button>`;
    }).join('');
    return `<section class="card" style="--c:var(--move)">
      <div class="card-head"><h3>${icon('list')} Habits</h3><div class="row" style="gap:4px"><span class="sub">${done} of ${total} done</span><button class="icon-btn plain" data-action="manage-habits" aria-label="Edit habits" data-tip="Add or remove habits">${icon('edit')}</button></div></div>
      ${total ? `<div class="habits">${tiles}</div>` : `<div class="empty">Build small daily habits and keep the streak alive.<br><button class="btn sm mt" data-action="manage-habits">${icon('plus')} Add a habit</button></div>`}
    </section>`;
  }

  const HABIT_IDEAS = ['👟 Walk after dinner', '📚 Read 10 pages', '☕ No coffee after 2 pm', '🙏 Gratitude note', '🧠 Learn something new', '🦷 Floss'];
  const HABIT_EMOJI = ['💊', '🥦', '🌞', '😴', '👟', '📚', '☕', '🙏', '🧠', '💧', '🍎', '🥑', '🥕', '🍵', '🧘', '🦷', '🚲', '⚽', '🏀', '💃', '🌿', '❤️', '🎯', '📸', '🌊', '⏰', '🚀', '✨'];
  function openHabits() {
    openModal({ title: 'Your habits', body: '<div id="hb"></div>' });
    habitsModalRender();
  }
  function habitsModalRender() {
    const box = $('#hb');
    if (!box) return;
    const ideas = HABIT_IDEAS.filter((s) => !S.habits.some((h) => s.endsWith(' ' + h.name)));
    box.innerHTML = `${S.habits.length ? `<div class="entries">${S.habits.map((h) => `<div class="entry"><span class="meal-emoji">${emo(h.emoji, { size: 28 })}</span><div class="entry-main"><div class="entry-name">${esc(h.name)}</div><div class="entry-sub">${plural(habitStreak(h.id, todayKey()), 'day')} streak</div></div><button class="icon-btn plain del" data-action="del-habit" data-id="${esc(h.id)}" aria-label="Delete ${esc(h.name)}">${icon('trash')}</button></div>`).join('')}</div>` : '<div class="empty">No habits yet. Add one below.</div>'}
      ${ideas.length ? `<div class="small muted mt">Quick add</div><div class="chips" style="margin-top:6px">${ideas.map((s) => { const i = s.indexOf(' '); return `<button class="chip chip-emo" data-action="habit-idea" data-v="${esc(s)}">${emo(s.slice(0, i), { size: 18 })}${esc(s.slice(i + 1))}</button>`; }).join('')}</div>` : ''}
      <form data-form="habit" class="mt-lg">
        <label class="field">New habit<input name="name" id="hb-name" required maxlength="40" placeholder="e.g. Read 10 pages"></label>
        <div class="field mt"><span>Pick an icon</span><div class="emo-pick">${HABIT_EMOJI.map((e, i) => `<label><input type="radio" name="emoji" value="${esc(e)}" ${i === 0 ? 'checked' : ''}><span>${emo(e, { size: 28 })}</span></label>`).join('')}</div></div>
        <div class="form-actions"><button class="btn">${icon('plus')} Add habit</button></div></form>`;
  }
  function addHabit(emoji, name) {
    name = String(name || '').trim().slice(0, 40);
    if (!name) return toast('Give the habit a name.', 'error');
    if (S.habits.length >= 12) return toast('You can track up to 12 habits.', 'error');
    if (S.habits.some((h) => h.name.toLowerCase() === name.toLowerCase())) return toast('You already track that habit.', 'error');
    S.habits.push({ id: uid(), emoji: String(emoji || '✅').trim().slice(0, 8) || '✅', name });
    save(); habitsModalRender(); render();
    const inp = $('#hb-name');
    if (inp) inp.focus();
  }

  // ------------------------------------------------------------------
  // Fasting timer (inspired by Zero)
  // ------------------------------------------------------------------
  const HOUR = 3600000;
  const fastStage = (h) => (h < 4 ? 'Digesting' : h < 12 ? 'Blood sugar settling' : h < 18 ? 'Fat-burning zone' : h < 24 ? 'Early ketosis' : 'Extended fast');
  const fmtClock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
  function fmtWhen(ts) {
    const d = new Date(ts), k = dkey(d), t = todayKey();
    const day = k === t ? '' : k === addDays(t, 1) ? ' tomorrow' : k === addDays(t, -1) ? ' yesterday' : ' ' + fmtDay(k, { weekday: 'short', day: 'numeric', month: 'short' });
    return `${pad(d.getHours())}:${pad(d.getMinutes())}${day}`;
  }
  function fastLeft(a, el) {
    const goal = a.target * HOUR;
    return el < goal ? `${fmtDur((goal - el) / HOUR)} to go · ends ${fmtWhen(a.start + goal)}` : `Goal reached ${fmtDur((el - goal) / HOUR)} ago. End whenever you're ready.`;
  }

  function fastingCard() {
    const F = S.fasting, a = F.active;
    const durs = F.history.map((f) => (f.end - f.start) / HOUR);
    const hist = durs.length ? `<div class="tiny muted mt">Last fast ${fmtDur(durs[durs.length - 1])} · longest ${fmtDur(Math.max(...durs))} · ${plural(durs.length, 'fast')} logged</div>` : '<div class="tiny muted mt">The timer keeps running even if you close Thrive.</div>';
    if (!a) {
      return `<section class="card" style="--c:var(--body)">
        <div class="card-head"><h3>${icon('timer')} Fasting</h3><span class="sub">Intermittent fasting timer</span></div>
        <div class="small muted">Fasting : eating window (hours)</div>
        <div class="chips" style="margin-top:8px">${FAST_PRESETS.map((p) => `<button class="chip ${S.settings.fastTarget === p ? 'active' : ''}" data-action="fast-preset" data-v="${p}">${p}:${24 - p}</button>`).join('')}</div>
        <button class="btn block mt" data-action="fast-start">${icon('timer')} Start ${S.settings.fastTarget}-hour fast</button>
        ${hist}
      </section>`;
    }
    const size = 128, sw = 12, r = (size - sw) / 2, c = 2 * Math.PI * r, h = size / 2;
    const el = Date.now() - a.start, p = clamp(el / (a.target * HOUR), 0, 1);
    return `<section class="card" style="--c:var(--body)">
      <div class="card-head"><h3>${icon('timer')} Fasting</h3><span class="sub">Started ${esc(fmtWhen(a.start))} · ${a.target}h goal</span></div>
      <div class="fast">
        <div class="ring-wrap" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
          <circle cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${sw}" style="stroke:color-mix(in srgb, var(--body) 15%, transparent)"/>
          <circle class="fast-arc" data-c="${c}" cx="${h}" cy="${h}" r="${r}" fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c} ${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 ${h} ${h})" style="stroke:var(--body)"/>
        </svg><div class="ring-center"><b data-live="fast-pct">${round(p * 100)}%</b><span>of goal</span></div></div>
        <div class="fast-main">
          <div class="tiny muted">Elapsed</div>
          <div class="fast-time" data-live="fast-time">${fmtClock(el)}</div>
          <div class="small muted mt" data-live="fast-left">${esc(fastLeft(a, el))}</div>
          <span class="fast-stage" data-live="fast-stage">${esc(fastStage(el / HOUR))}</span>
        </div>
      </div>
      <div class="row mt"><button class="btn dark" data-action="fast-end">${icon('stop')} End fast</button><button class="btn ghost sm" data-action="fast-edit">${icon('edit')} Edit start</button></div>
      ${hist}
    </section>`;
  }

  function startFast() {
    if (S.fasting.active) return;
    S.fasting.active = { start: Date.now(), target: S.settings.fastTarget, notified: false };
    save(); render(); buzz();
    toast(`Ends at ${fmtWhen(S.fasting.active.start + S.fasting.active.target * HOUR)}. You'll get a nudge when you reach it.`, {
      title: `${S.fasting.active.target}-hour fast started`, emoji: '⏰', type: 'success',
      actions: [{ label: 'Undo', fn: () => { S.fasting.active = null; save(); render(); } }],
    });
  }

  function endFast() {
    const a = S.fasting.active;
    if (!a) return;
    const end = Date.now(), el = end - a.start;
    S.fasting.active = null;
    if (el < 60000) { save(); render(); return toast('Fast cancelled.'); }
    const rec = { id: uid(), start: a.start, end, target: a.target };
    S.fasting.history.push(rec);
    if (S.fasting.history.length > 200) S.fasting.history.shift();
    save(); render(); buzz();
    const hit = el >= a.target * HOUR;
    toast(hit ? `You fasted ${fmtDur(el / HOUR)} and beat your ${a.target}h goal.` : `You fasted ${fmtDur(el / HOUR)} of your ${a.target}h goal.`, {
      title: hit ? 'Fast complete' : 'Fast ended', emoji: hit ? '🏁' : '⌛', type: 'success',
      actions: [{ label: 'Undo', fn: () => { S.fasting.history = S.fasting.history.filter((x) => x.id !== rec.id); S.fasting.active = a; save(); render(); } }],
    });
    if (hit) celebrate();
  }

  const dtLocal = (ts) => { const d = new Date(ts); return `${dkey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  function openFastEdit() {
    const a = S.fasting.active;
    if (!a) return;
    const targets = Array.from(new Set([12, 13, 14, 16, 18, 20, 24, 36, a.target])).sort((x, y) => x - y);
    openModal({
      title: 'Edit fast', body: `<form data-form="fast-edit"><div class="form-grid">
        <label class="field full">Started at<input name="start" type="datetime-local" value="${dtLocal(a.start)}" max="${dtLocal(Date.now())}" required></label>
        <label class="field full">Goal<select name="target">${targets.map((x) => `<option value="${x}" ${x === a.target ? 'selected' : ''}>${x} hours</option>`).join('')}</select></label>
      </div><div class="form-actions"><button type="button" class="btn ghost danger" data-action="fast-cancel">Discard fast</button><span class="spacer"></span><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn">${icon('check')} Save</button></div></form>`,
    });
  }

  // Updates ticking UI (fasting clock) in place, without re-rendering the page.
  function updateLive() {
    const a = S.fasting.active;
    if (!a) return;
    const el = Date.now() - a.start, goal = a.target * HOUR, p = clamp(el / goal, 0, 1);
    const set = (key, v) => { const n = document.querySelector(`[data-live="${key}"]`); if (n && n.textContent !== v) n.textContent = v; };
    set('fast-time', fmtClock(el));
    set('fast-pct', round(p * 100) + '%');
    set('fast-left', fastLeft(a, el));
    set('fast-stage', fastStage(el / HOUR));
    const arc = document.querySelector('.fast-arc');
    if (arc) arc.setAttribute('stroke-dashoffset', String(num(arc.dataset.c) * (1 - p)));
    if (el >= goal && !a.notified) {
      a.notified = true;
      save();
      systemNotify('Fasting goal reached 🏁', `You've fasted ${a.target} hours. End your fast in Thrive whenever you're ready.`, './index.html#/today');
      toast(`You've fasted ${a.target} hours. End it whenever you're ready.`, { title: 'Fasting goal reached', emoji: '🏁', type: 'success', timeout: 9000, actions: [{ label: 'End fast', fn: () => endFast() }] });
      chime(); celebrate();
    }
  }

  // ------------------------------------------------------------------
  // Guided breathing (inspired by Calm / Apple Mindfulness)
  // ------------------------------------------------------------------
  const BREATH = {
    box: { label: 'Box · 4-4-4-4', steps: [['Breathe in', 4, 1], ['Hold', 4, 1], ['Breathe out', 4, 0.45], ['Hold', 4, 0.45]] },
    relax: { label: 'Relax · 4-7-8', steps: [['Breathe in', 4, 1], ['Hold', 7, 1], ['Breathe out', 8, 0.45]] },
    calm: { label: 'Calm · 5-5', steps: [['Breathe in', 5, 1], ['Breathe out', 5, 0.45]] },
  };
  let BR = null;
  function openBreathe() {
    const pattern = BR ? BR.pattern : 'box', mins = BR ? BR.mins : 1;
    stopBreath();
    BR = { pattern, mins, running: false, timer: null, tick: null };
    openModal({ title: 'Breathe', body: '<div id="br"></div>', onClose: stopBreath });
    breathRender();
  }
  function breathRender(done) {
    const box = $('#br');
    if (!box || !BR) return;
    box.innerHTML = `<div class="breath">
      <div class="chips" style="justify-content:center">${Object.entries(BREATH).map(([id, b]) => `<button class="chip ${BR.pattern === id ? 'active' : ''}" data-action="br-pattern" data-v="${id}">${esc(b.label)}</button>`).join('')}</div>
      <div class="breath-stage"><div class="breath-ring"></div><div class="breath-circle" id="br-circle"></div><div class="breath-label"><span id="br-count">${done ? '✓' : ''}</span></div></div>
      <h3 id="br-phase" style="font-size:22px">${done ? 'Session complete' : 'Find a comfortable position'}</h3>
      <div class="breath-left" id="br-left">${done ? `${plural(done, 'mindful minute')} logged` : `${BR.mins}-minute session`}</div>
      <div class="chips" style="justify-content:center">${[1, 3, 5].map((m) => `<button class="chip ${BR.mins === m ? 'active' : ''}" data-action="br-mins" data-v="${m}">${m} min</button>`).join('')}</div>
      <button class="btn" data-action="br-start" style="min-width:160px">${icon('wind')} ${done ? 'Go again' : 'Start'}</button>
    </div>`;
  }
  function startBreath() {
    if (!BR) return;
    BR.running = true; BR.i = 0; BR.t0 = Date.now(); BR.end = BR.t0 + BR.mins * 60000;
    $$('#br .chips').forEach((c) => { c.style.display = 'none'; });
    const btn = $('#br [data-action="br-start"]');
    if (btn) { btn.dataset.action = 'br-stop'; btn.className = 'btn ghost'; btn.innerHTML = `${icon('stop')} Stop`; }
    breathStep();
    BR.tick = setInterval(breathTick, 200);
  }
  function breathStep() {
    const circle = $('#br-circle');
    if (!BR || !BR.running || !circle) return stopBreath();
    const steps = BREATH[BR.pattern].steps;
    if (Date.now() >= BR.end - 500 && BR.i % steps.length === 0 && BR.i > 0) return finishBreath();
    const [label, secs, scale] = steps[BR.i % steps.length];
    circle.style.transitionDuration = secs + 's';
    circle.style.transform = `scale(${scale})`;
    $('#br-phase').textContent = label;
    BR.phaseEnd = Date.now() + secs * 1000;
    BR.i++;
    if (label !== 'Hold') buzz(12);
    BR.timer = setTimeout(breathStep, secs * 1000);
    breathTick();
  }
  function breathTick() {
    if (!BR || !BR.running) return;
    const c = $('#br-count'), l = $('#br-left');
    if (!c || !l) return stopBreath();
    c.textContent = String(Math.max(1, Math.ceil((BR.phaseEnd - Date.now()) / 1000)));
    const left = Math.max(0, BR.end - Date.now());
    l.textContent = left > 0 ? `${Math.floor(left / 60000)}:${pad(Math.floor((left % 60000) / 1000))} left` : 'Finishing this breath…';
  }
  function logMindful(mins) {
    if (!(mins > 0)) return;
    const d = editDay(todayKey());
    d.mindful = round(num(d.mindful) + mins, 1);
    save(); render();
  }
  function finishBreath() {
    const mins = BR.mins;
    stopBreath();
    logMindful(mins);
    breathRender(mins);
    chime();
    toast(`${plural(mins, 'mindful minute')} added to today.`, { title: 'Nice work', emoji: '😌', type: 'success' });
  }
  function stopBreath() {
    if (!BR) return;
    clearTimeout(BR.timer); clearInterval(BR.tick);
    BR.running = false;
  }

  // ------------------------------------------------------------------
  // Page: Nutrition
  // ------------------------------------------------------------------
  function pageNutrition() {
    const k = curDate, d = getDay(k), t = dayTotals(k), g = goals();
    const pk = t.p * 4, ck = t.c * 4, fk = t.f * 9, tot = pk + ck + fk;
    const yest = getDay(addDays(k, -1));

    const meals = MEALS.map((m) => {
      const items = d.foods.filter((f) => f.meal === m.id);
      const kc = sum(items, (i) => i.kcal);
      const hasYest = yest.foods.some((f) => f.meal === m.id);
      return `<section class="card">
        <div class="card-head">
          <div class="meal-head"><span class="meal-emoji">${emo(m.emoji, { size: 28 })}</span><div><h3>${m.label}</h3><div class="sub">${fmt(kc)} kcal · P ${fmt(sum(items, (i) => i.p))} · C ${fmt(sum(items, (i) => i.c))} · F ${fmt(sum(items, (i) => i.f))}</div></div></div>
          <div class="row">
            ${hasYest ? `<button class="icon-btn" data-action="copy-meal" data-meal="${m.id}" data-tip="Copy yesterday's ${m.label.toLowerCase()}" aria-label="Copy yesterday's ${m.label}">${icon('copy')}</button>` : ''}
            <button class="btn sm" data-action="add-food" data-meal="${m.id}">${icon('plus')} Add</button>
          </div>
        </div>
        ${items.length ? `<div class="entries">${items.map(entryRow).join('')}</div>` : `<div class="empty">Nothing logged yet.</div>`}
      </section>`;
    }).join('');

    return `
    <div class="grid two">
      <section class="card">
        <div class="card-head"><h3>${icon('flame')} Daily summary</h3><span class="sub">${t.foodCount} items logged</span></div>
        <div class="cal-row">
          ${ring(t.kcal / g.kcal, t.kcal > g.kcal ? 'var(--bad)' : 'var(--cal)', 124, 12, `<b>${fmt(t.kcal)}</b><span>of ${fmt(g.kcal)} kcal</span>`)}
          <div style="flex:1;min-width:180px">
            ${mbar('Protein', t.p, g.p, 'var(--protein)')}
            ${mbar('Carbs', t.c, g.c, 'var(--carbs)')}
            ${mbar('Fat', t.f, g.f, 'var(--fat)')}
          </div>
        </div>
        <div class="donut-wrap">
          ${donut([{ v: pk, color: 'var(--protein)', label: 'Protein' }, { v: ck, color: 'var(--carbs)', label: 'Carbs' }, { v: fk, color: 'var(--fat)', label: 'Fat' }], 110, 16, `<b style="font-size:15px">Macros</b><span>% kcal</span>`)}
          <div class="legend" style="flex-direction:column;gap:6px">
            <span><i style="background:var(--protein)"></i>Protein ${tot ? round((pk / tot) * 100) : 0}%</span>
            <span><i style="background:var(--carbs)"></i>Carbs ${tot ? round((ck / tot) * 100) : 0}%</span>
            <span><i style="background:var(--fat)"></i>Fat ${tot ? round((fk / tot) * 100) : 0}%</span>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('target')} Nutrients vs targets</h3><span class="sub">Marker = target</span></div>
        ${nutrientBars(t, g)}
      </section>
    </div>
    <div class="grid two">${meals}</div>
    <section class="card mt-lg">
      <div class="card-head"><h3>${icon('star')} My foods</h3><button class="btn sm ghost" data-action="new-custom-food">${icon('plus')} Create food</button></div>
      ${S.customFoods.length ? `<div class="entries">${S.customFoods.map((f) => `<div class="entry"><div class="entry-main"><div class="entry-name">${esc(f.name)}</div><div class="entry-sub">${esc(f.unit)} (${fmt(f.sg)} g) · ${fmt((f.n.kcal * f.sg) / 100)} kcal · P ${fmt((f.n.p * f.sg) / 100, 1)} · C ${fmt((f.n.c * f.sg) / 100, 1)} · F ${fmt((f.n.f * f.sg) / 100, 1)}</div></div><button class="icon-btn plain del" data-action="del-custom-food" data-id="${esc(f.id)}" aria-label="Delete ${esc(f.name)}">${icon('trash')}</button></div>`).join('')}</div>` : '<div class="empty">Create your own foods or recipes — e.g. your usual breakfast bowl — and log them in one tap.</div>'}
    </section>`;
  }

  function entryRow(e) {
    const sub = e.quick ? 'Quick add' : esc(e.qtyLabel || `${fmt(e.grams)} g`);
    return `<div class="entry">
      <div class="entry-main"><div class="entry-name">${esc(e.name)}</div><div class="entry-sub">${sub} · P ${fmt(e.p, 1)} · C ${fmt(e.c, 1)} · F ${fmt(e.f, 1)}</div></div>
      <span class="entry-val">${fmt(e.kcal)} kcal</span>
      ${e.foodId ? `<button class="icon-btn plain" data-action="edit-food-entry" data-id="${esc(e.id)}" aria-label="Edit">${icon('edit')}</button>` : ''}
      <button class="icon-btn plain del" data-action="del-food-entry" data-id="${esc(e.id)}" aria-label="Delete">${icon('trash')}</button>
    </div>`;
  }

  // ---------------- Food modal ----------------
  let FM = null;
  function guessMeal() { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snack' : 'dinner'; }

  function openFoodModal(meal) {
    FM = { meal: meal || guessMeal(), q: '', filter: 'all' };
    openModal({ title: 'Add food', body: '<div id="fm"></div>', wide: true });
    fmSearch();
  }

  function fmSearch() {
    if (!FM) return;
    FM.food = null; FM.editId = null;
    setModalTitle(`Add to ${mealLabel(FM.meal)} · ${relDay(curDate)}`);
    const filters = [['all', 'All'], ['recent', 'Recent'], ['fav', '★ Favorites'], ['mine', 'My foods']].concat(CATEGORIES.map((c) => [c, c]));
    $('#fm').innerHTML = `
      <div class="fm-search">${icon('search')}<input id="fm-q" type="search" placeholder="Search ${BASE_FOODS.length}+ foods — e.g. paneer, oats, banana" value="${esc(FM.q)}" autocomplete="off" autofocus></div>
      <div class="chips mt">${filters.map(([id, lb]) => `<button class="chip ${FM.filter === id ? 'active' : ''}" data-action="fm-filter" data-f="${esc(id)}">${esc(lb)}</button>`).join('')}</div>
      <div id="fm-results" class="fm-results">${fmResultsHtml()}</div>
      <div class="fm-foot">
        <button class="btn ghost sm" data-action="fm-quick">${icon('flame')} Quick add calories</button>
        <button class="btn ghost sm" data-action="new-custom-food">${icon('plus')} Create custom food</button>
      </div>`;
    const inp = $('#fm-q');
    inp.addEventListener('input', () => { FM.q = inp.value; $('#fm-results').innerHTML = fmResultsHtml(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const firstItem = $('#fm-results .fm-item'); if (firstItem) firstItem.click(); } });
    setTimeout(() => inp.focus(), 30);
  }

  function fmResults() {
    let list;
    const f = FM.filter;
    if (f === 'recent') list = S.recentFoods.map(findFood).filter(Boolean);
    else if (f === 'fav') list = allFoods().filter((x) => S.favorites.includes(x.id));
    else if (f === 'mine') list = S.customFoods.slice();
    else if (f === 'all') list = S.customFoods.concat(BASE_FOODS);
    else list = BASE_FOODS.filter((x) => x.cat === f);
    const q = FM.q.trim().toLowerCase();
    if (q) {
      const terms = q.split(/\s+/);
      list = list.filter((x) => terms.every((t) => (x.name + ' ' + x.cat).toLowerCase().includes(t)));
      list.sort((a, b) => (b.name.toLowerCase().startsWith(q) ? 1 : 0) - (a.name.toLowerCase().startsWith(q) ? 1 : 0));
    }
    return list.slice(0, 100);
  }

  function fmResultsHtml() {
    const list = fmResults();
    if (!list.length) {
      const msg = FM.filter === 'recent' ? 'Foods you log will show up here.' : FM.filter === 'fav' ? 'Tap the ★ on any food to favorite it.' : 'No matches. Try another word, or create a custom food.';
      return `<div class="empty" style="border:0">${esc(msg)}</div>`;
    }
    return list.map((f) => {
      const s = scaleFood(f, f.sg);
      const fav = S.favorites.includes(f.id);
      return `<div class="fm-item" role="button" tabindex="0" data-action="fm-pick" data-id="${esc(f.id)}">
        <div><div class="name">${esc(f.name)}</div><div class="sub">${esc(f.unit)} (${fmt(f.sg)} g) · P ${fmt(s.p, 1)} · C ${fmt(s.c, 1)} · F ${fmt(s.f, 1)} · ${esc(f.cat)}</div></div>
        <span class="kcal">${fmt(s.kcal)} kcal</span>
        <button class="icon-btn plain ${fav ? 'on' : ''}" data-action="fav" data-id="${esc(f.id)}" aria-label="${fav ? 'Remove from' : 'Add to'} favorites">${icon('star')}</button>
      </div>`;
    }).join('');
  }

  function fmDetail(food, entry) {
    FM.food = food;
    FM.editId = entry ? entry.id : null;
    FM.mode = entry ? entry.mode || 'g' : 'serving';
    FM.qty = entry ? num(entry.qty, entry.grams) : 1;
    if (entry) FM.meal = entry.meal;
    setModalTitle(entry ? 'Edit entry' : 'Add food');
    $('#fm').innerHTML = `
      ${entry ? '' : `<button class="btn ghost sm" data-action="fm-back">${icon('back')} Back to search</button>`}
      <h3 class="mt" style="font-size:20px">${esc(food.name)}</h3>
      <div class="muted small">${esc(food.cat)}</div>
      <form data-form="fm-save" class="mt">
        <div class="form-grid">
          <label class="field">Amount<input id="fm-qty" name="qty" type="number" min="0" step="any" inputmode="decimal" value="${round(FM.qty, 2)}" required></label>
          <label class="field">Unit<select id="fm-mode" name="mode">
            <option value="serving" ${FM.mode === 'serving' ? 'selected' : ''}>${esc(food.unit)} (${fmt(food.sg)} g)</option>
            <option value="g" ${FM.mode === 'g' ? 'selected' : ''}>grams</option></select></label>
          <label class="field">Meal<select name="meal" id="fm-meal">${MEALS.map((m) => `<option value="${m.id}" ${FM.meal === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
        </div>
        <div id="fm-facts"></div>
        <div class="form-actions"><button type="submit" class="btn">${icon('check')} ${entry ? 'Save changes' : `Add to ${mealLabel(FM.meal)}`}</button></div>
      </form>`;
    const qty = $('#fm-qty'), mode = $('#fm-mode'), meal = $('#fm-meal');
    const upd = () => { FM.qty = num(qty.value); $('#fm-facts').innerHTML = factsPanel(food, fmGrams()); };
    qty.addEventListener('input', upd);
    mode.addEventListener('change', () => {
      const grams = fmGrams();
      FM.mode = mode.value;
      FM.qty = FM.mode === 'g' ? round(grams, 1) : round(grams / food.sg, 2);
      qty.value = FM.qty;
      upd();
    });
    meal.addEventListener('change', () => { FM.meal = meal.value; });
    upd();
    setTimeout(() => { qty.focus(); qty.select(); }, 30);
  }

  const fmGrams = () => (FM.mode === 'g' ? num(FM.qty) : num(FM.qty) * FM.food.sg);

  function factsPanel(food, grams) {
    const n = scaleFood(food, grams), g = goals();
    const row = (k, cls = '') => { const m = NMAP[k]; const dv = g[k] ? round((n[k] / g[k]) * 100) : null; return `<div class="fr ${cls}"><span>${m.label}</span><span>${fmt(n[k], m.d)} ${m.unit}${dv != null ? `<span class="pct">${dv}%</span>` : ''}</span></div>`; };
    return `<div class="facts"><h4>Nutrition facts</h4><div class="tiny muted">For ${fmt(grams, 1)} g · % of your daily targets</div>
      <div class="fr main"><span>Calories</span><span>${fmt(n.kcal)}</span></div>
      ${row('p')}${row('c')}${row('fi', 'ind')}${row('su', 'ind')}${row('f')}${row('na')}${row('kp')}${row('ca')}${row('fe')}${row('vc')}</div>`;
  }

  function fmSave() {
    const food = FM.food, grams = fmGrams();
    if (!(grams > 0) || grams > 10000) return toast('Enter an amount greater than zero.', 'error');
    const n = scaleFood(food, grams);
    const qtyLabel = FM.mode === 'g' ? `${fmt(grams, 1)} g` : `${round(FM.qty, 2)} × ${food.unit} (${fmt(grams)} g)`;
    const entry = { id: FM.editId || uid(), foodId: food.id, name: food.name, meal: FM.meal, grams: round(grams, 1), qty: round(FM.qty, 2), mode: FM.mode, qtyLabel, time: nowHM() };
    for (const k of NKEYS) entry[k] = round(n[k], 2);
    const before = snap(curDate);
    const day = editDay(curDate);
    if (FM.editId) {
      const i = day.foods.findIndex((f) => f.id === FM.editId);
      if (i >= 0) { entry.time = day.foods[i].time; day.foods[i] = entry; } else day.foods.push(entry);
    } else day.foods.push(entry);
    pushRecent(food.id);
    save();
    const edited = !!FM.editId;
    closeModal();
    render();
    buzz();
    toast(`${edited ? 'Updated' : 'Added'} ${food.name} · ${fmt(entry.kcal)} kcal`, { type: 'success', emoji: (MEALS.find((m) => m.id === entry.meal) || MEALS[3]).emoji });
    celebrateDiff(curDate, before);
  }

  function openQuickAdd() {
    const meal = FM ? FM.meal : guessMeal();
    openModal({
      title: 'Quick add', body: `<form data-form="quick-add"><div class="form-grid">
        <label class="field full">Name<input name="name" placeholder="e.g. Restaurant lunch" maxlength="80"></label>
        <label class="field">Calories (kcal)<input name="kcal" type="number" min="1" max="10000" step="any" required></label>
        <label class="field">Protein (g)<input name="p" type="number" min="0" step="any"></label>
        <label class="field">Carbs (g)<input name="c" type="number" min="0" step="any"></label>
        <label class="field">Fat (g)<input name="f" type="number" min="0" step="any"></label>
        <label class="field">Meal<select name="meal">${MEALS.map((m) => `<option value="${m.id}" ${meal === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
      </div><div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn">Add</button></div></form>`,
    });
  }

  function openCustomFood() {
    openModal({
      title: 'Create custom food', wide: true, body: `<form data-form="custom-food">
        <p class="muted small">Enter values for <b>one serving</b> as printed on the label. Thrive converts them so you can log any amount.</p>
        <div class="form-grid">
          <label class="field full">Food name<input name="name" required maxlength="80" placeholder="e.g. Mom's veg pulao"></label>
          <label class="field">Serving name<input name="unit" value="1 serving" maxlength="40"></label>
          <label class="field">Serving size (g)<input name="sg" type="number" min="1" max="5000" step="any" value="100" required></label>
          ${NUTR.map((n) => `<label class="field">${n.label} (${n.unit})<input name="${n.k}" type="number" min="0" step="any" ${n.k === 'kcal' ? 'required' : ''}></label>`).join('')}
        </div>
        <div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn">${icon('check')} Save food</button></div></form>`,
    });
  }

  // ------------------------------------------------------------------
  // Page: Hydration
  // ------------------------------------------------------------------
  function pageWater() {
    const k = curDate, d = getDay(k), t = dayTotals(k), g = goals();
    const p = clamp(t.water / g.water, 0, 1);
    const keys = rangeKeys(k, 14);
    const vals = keys.map((x) => dayTotals(x).water);
    const met = vals.filter((v) => v >= g.water).length;
    return `
    <div class="grid two">
      <section class="card">
        <div class="card-head"><h3>${icon('water')} ${esc(relDay(k))}</h3><span class="sub">Goal ${fmt(g.water)} ml</span></div>
        <div class="glass-wrap">
          ${glassSvg(t.water / g.water, 150)}
          <div style="flex:1;min-width:200px">
            <div class="big">${cnt(t.water)} <small>ml</small></div>
            <div class="muted">${round(p * 100)}% of goal · ${fmt(Math.max(0, g.water - t.water))} ml to go</div>
            <div class="small mt">${esc(waterPaceText(k, t.water, g.water))}</div>
            <div class="water-btns mt">${[150, 250, 330, 500, 750, 1000].map((ml) => `<button class="btn ghost" data-action="water" data-ml="${ml}">+${ml} ml</button>`).join('')}</div>
            <form class="row mt" data-form="water-custom"><input name="ml" type="number" min="1" max="5000" placeholder="Custom ml" style="flex:1" required><button class="btn water">Add</button></form>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('clock')} Log</h3><span class="sub">${plural(d.water.length, 'drink')}</span></div>
        ${d.water.length ? `<div class="entries">${d.water.slice().sort((a, b) => String(b.time).localeCompare(String(a.time))).map((w) => `<div class="entry"><span class="entry-val">${esc(w.time)}</span><div class="entry-main">${fmt(w.ml)} ml</div><button class="icon-btn plain del" data-action="del-water" data-id="${esc(w.id)}" aria-label="Delete">${icon('trash')}</button></div>`).join('')}</div>` : '<div class="empty">No water logged yet.</div>'}
      </section>
    </div>
    <section class="card mt-lg">
      <div class="card-head"><h3>${icon('chart')} Last 14 days</h3><span class="sub">Goal met ${met} of 14 days</span></div>
      ${barChart({ values: vals, labels: keys.map((x) => chartLabel(x, 14)), tips: keys.map((x) => fmtDay(x)), target: g.water, unit: 'ml', colorFn: (v) => (v >= g.water ? 'var(--water)' : 'color-mix(in srgb, var(--water) 45%, transparent)') })}
      <div class="legend"><span><i style="background:var(--water)"></i>Goal met</span><span><i style="background:color-mix(in srgb, var(--water) 45%, transparent)"></i>Below goal</span><span>— — Goal</span></div>
    </section>
    <section class="card mt-lg">
      <h3>Why ${fmt(g.water / 1000, 1)} L?</h3>
      <p class="muted small mt">Your goal is about 35 ml per kg of body weight${['active', 'athlete'].includes(S.profile && S.profile.activity) ? ', plus 500 ml for your high activity level' : ''}. Add ~500 ml for every hour of intense exercise or hot weather. You can set your own goal in Settings.</p>
    </section>`;
  }

  function addWater(ml, k = curDate) {
    ml = Math.round(num(ml));
    if (!(ml > 0 && ml <= 5000)) return toast('Enter an amount between 1 and 5000 ml.', 'error');
    const before = snap(k);
    const entry = { id: uid(), ml, time: nowHM() };
    editDay(k).water.push(entry);
    save();
    render();
    buzz();
    const t = dayTotals(k), g = goals();
    toast(`+${ml} ml · ${fmt(t.water)} / ${fmt(g.water)} ml`, {
      type: 'success', emoji: '💧',
      actions: [{ label: 'Undo', fn: () => { const d = editDay(k); d.water = d.water.filter((w) => w.id !== entry.id); save(); render(); } }],
    });
    celebrateDiff(k, before);
  }

  // ------------------------------------------------------------------
  // Page: Activity
  // ------------------------------------------------------------------
  function workoutKcal(met, intensity, minutes, w) {
    return Math.round(met * (INTENSITY[intensity] || INTENSITY.moderate).m * w * (minutes / 60));
  }

  function personalRecords() {
    const best = {};
    for (const [k, d] of Object.entries(S.days)) {
      for (const s of d.strength || []) {
        const name = String(s.name || '').trim();
        if (!name) continue;
        const w = num(s.weight), r = num(s.reps);
        const e1rm = w > 0 ? w * (1 + r / 30) : 0;
        const key = name.toLowerCase();
        if (!best[key] || e1rm > best[key].e1rm || (e1rm === best[key].e1rm && r > best[key].reps)) best[key] = { name, weight: w, reps: r, e1rm, date: k };
      }
    }
    return Object.values(best).sort((a, b) => b.e1rm - a.e1rm);
  }

  // Distinct recent workouts (type + duration + intensity), newest first — for one-tap repeat.
  function recentWorkouts(limit = 4) {
    const out = [], seen = new Set();
    const keys = Object.keys(S.days).filter((k) => S.days[k].workouts.length).sort().reverse().slice(0, 60);
    for (const k of keys) {
      for (const w of S.days[k].workouts.slice().reverse()) {
        const sig = `${w.type}|${w.minutes}|${w.intensity}`;
        if (seen.has(sig) || !ACTIVITIES.some((a) => a[0] === w.type)) continue;
        seen.add(sig);
        out.push({ type: w.type, minutes: num(w.minutes), intensity: INTENSITY[w.intensity] ? w.intensity : 'moderate', met: num(w.met, (ACTIVITIES.find((a) => a[0] === w.type) || [0, 4])[1]) });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  function pageActivity() {
    const k = curDate, d = getDay(k), t = dayTotals(k), g = goals(), w = currentWeight(k);
    const keys = rangeKeys(k, 7);
    const mins = keys.map((x) => dayTotals(x).activeMin);
    const weekMin = sum(mins);
    const prs = personalRecords().slice(0, 8);
    const vol = sum(d.strength, (s) => num(s.sets) * num(s.reps) * num(s.weight));
    const recent = recentWorkouts();
    return `
    <div class="kpis">
      <div class="kpi"><div class="k-label">Steps</div><div class="k-value">${fmt(t.steps)}</div><div class="k-sub">${round(pct(t.steps, g.steps))}% of ${fmt(g.steps)}</div></div>
      <div class="kpi"><div class="k-label">Active minutes</div><div class="k-value">${fmt(t.activeMin)}<small>min</small></div><div class="k-sub">Goal ${g.activeMin} min</div></div>
      <div class="kpi"><div class="k-label">Burned</div><div class="k-value">${fmt(t.burned)}<small>kcal</small></div><div class="k-sub">${fmt(t.workoutKcal)} workouts · ${fmt(t.stepKcal)} steps</div></div>
      <div class="kpi"><div class="k-label">This week</div><div class="k-value">${fmt(weekMin)}<small>min</small></div><div class="k-sub">${weekMin >= 150 ? 'WHO target met ✓' : `${fmt(150 - weekMin)} min to WHO 150`}</div></div>
    </div>
    <div class="grid two mt-lg">
      <section class="card">
        <div class="card-head"><h3>${icon('activity')} Log a workout</h3></div>
        ${recent.length ? `<div class="small muted">Repeat a recent workout in one tap</div><div class="chips" style="margin:8px 0 16px">${recent.map((w, i) => `<button class="chip" data-action="repeat-workout" data-i="${i}">${icon('plus')} ${esc(w.type)} · ${fmt(w.minutes)} min</button>`).join('')}</div>` : ''}
        <form data-form="workout"><div class="form-grid">
          <label class="field full">Activity<select name="type" id="wo-type">${ACTIVITIES.map(([n, m]) => `<option value="${esc(n)}" data-met="${m}">${esc(n)}</option>`).join('')}</select></label>
          <label class="field">Duration (min)<input name="minutes" id="wo-min" type="number" min="1" max="600" value="30" required></label>
          <label class="field">Intensity<select name="intensity" id="wo-int">${Object.entries(INTENSITY).map(([id, v]) => `<option value="${id}" ${id === 'moderate' ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
          <label class="field">Calories (optional)<input name="kcal" id="wo-kcal" type="number" min="0" max="5000" placeholder="auto"></label>
          <label class="field full">Notes<input name="notes" maxlength="120" placeholder="e.g. 5 km in 28 min"></label>
        </div>
        <div class="row between mt"><span class="small muted" id="wo-est"></span><button class="btn">${icon('plus')} Add workout</button></div></form>
        <hr style="border:0;border-top:1px solid var(--border);margin:16px 0">
        <form data-form="steps" class="row"><label class="field" style="flex:1">Steps today<input name="steps" type="number" min="0" max="100000" value="${t.steps || ''}" placeholder="e.g. 8500"></label><button class="btn ghost" style="align-self:flex-end">Save steps</button></form>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('clock')} Workouts · ${esc(relDay(k))}</h3><span class="sub">${fmt(t.workoutKcal)} kcal</span></div>
        ${d.workouts.length ? `<div class="entries">${d.workouts.map((x) => `<div class="entry"><div class="entry-main"><div class="entry-name">${esc(x.type)}</div><div class="entry-sub">${fmt(x.minutes)} min · ${esc((INTENSITY[x.intensity] || INTENSITY.moderate).label)}${x.notes ? ' · ' + esc(x.notes) : ''}</div></div><span class="entry-val">${fmt(x.kcal)} kcal</span><button class="icon-btn plain del" data-action="del-workout" data-id="${esc(x.id)}" aria-label="Delete">${icon('trash')}</button></div>`).join('')}</div>` : '<div class="empty">No workouts logged.</div>'}
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('dumbbell')} Strength log</h3><span class="sub">${vol ? `Volume ${fmt(vol)} kg` : ''}</span></div>
        <form data-form="strength"><div class="form-grid">
          <label class="field full">Exercise<input name="name" list="lifts" required maxlength="60" placeholder="e.g. Bench press"><datalist id="lifts">${LIFTS.map((l) => `<option value="${esc(l)}">`).join('')}</datalist></label>
          <label class="field">Sets<input name="sets" type="number" min="1" max="50" value="3" required></label>
          <label class="field">Reps<input name="reps" type="number" min="1" max="500" value="10" required></label>
          <label class="field">Weight (kg)<input name="weight" type="number" min="0" max="1000" step="0.5" value="0"></label>
        </div><div class="form-actions"><button class="btn">${icon('plus')} Add set</button></div></form>
        ${d.strength.length ? `<div class="entries mt">${d.strength.map((s) => `<div class="entry"><div class="entry-main"><div class="entry-name">${esc(s.name)}</div><div class="entry-sub">${fmt(s.sets)} × ${fmt(s.reps)} ${num(s.weight) ? `@ ${fmt(s.weight, 1)} kg` : '(bodyweight)'}</div></div><button class="icon-btn plain del" data-action="del-strength" data-id="${esc(s.id)}" aria-label="Delete">${icon('trash')}</button></div>`).join('')}</div>` : ''}
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('star')} Personal records</h3><span class="sub">Estimated 1-rep max (Epley)</span></div>
        ${prs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Exercise</th><th>Best set</th><th class="right">Est. 1RM</th><th>Date</th></tr></thead><tbody>${prs.map((p) => `<tr><td>${esc(p.name)}</td><td>${p.weight ? `${fmt(p.weight, 1)} kg × ${fmt(p.reps)}` : `${fmt(p.reps)} reps`}</td><td class="right"><b>${p.weight ? fmt(p.e1rm, 1) + ' kg' : '—'}</b></td><td class="muted">${esc(fmtDay(p.date, { day: 'numeric', month: 'short' }))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Log strength sets to track your PRs.</div>'}
      </section>
    </div>
    <section class="card mt-lg">
      <div class="card-head"><h3>${icon('chart')} Active minutes · last 7 days</h3><span class="sub">Goal ${g.activeMin} min/day</span></div>
      ${barChart({ values: mins, labels: keys.map((x) => chartLabel(x, 7)), tips: keys.map((x) => fmtDay(x)), target: g.activeMin, unit: 'min', color: 'var(--move)' })}
    </section>
    <p class="tiny faint mt">Calorie estimates use MET values × body weight (${fmt(w, 1)} kg) × duration. Wearables may differ — enter their number in "Calories" to override.</p>`;
  }

  function bindActivity() {
    const type = $('#wo-type'), min = $('#wo-min'), int = $('#wo-int'), kc = $('#wo-kcal'), est = $('#wo-est');
    if (!type) return;
    const upd = () => {
      const met = num(type.selectedOptions[0] && type.selectedOptions[0].dataset.met, 4);
      const v = workoutKcal(met, int.value, num(min.value), currentWeight(curDate));
      kc.placeholder = `auto ≈ ${v}`;
      est.textContent = num(kc.value) > 0 ? `Using your value: ${fmt(num(kc.value))} kcal` : `Estimated burn ≈ ${fmt(v)} kcal`;
    };
    [type, min, int, kc].forEach((el) => el.addEventListener('input', upd));
    upd();
  }

  // ------------------------------------------------------------------
  // Page: Sleep
  // ------------------------------------------------------------------
  const sleepHours = (bed, wake) => { let m = toMin(wake) - toMin(bed); if (m <= 0) m += 1440; return m / 60; };
  // Bedtimes after midnight count as "late" (e.g. 00:30 -> 24:30) so averages work.
  const bedMin = (hm) => { const m = toMin(hm); return m < 12 * 60 ? m + 1440 : m; };
  const stdev = (a) => { if (a.length < 2) return 0; const m = avg(a); return Math.sqrt(avg(a.map((x) => (x - m) * (x - m)))); };

  function sleepTimeline(keys) {
    const g = goals();
    const spans = keys.map((k) => ({ k, s: getDay(k).sleep })).filter((r) => r.s).map((r) => { const b = bedMin(r.s.bed); return Object.assign(r, { b, e: b + num(r.s.hours) * 60 }); });
    if (!spans.length) return emptyChart('Log a few nights to see your sleep schedule.');
    const lo = Math.floor(Math.min(...spans.map((x) => x.b)) / 60) * 60 - 60, hi = Math.ceil(Math.max(...spans.map((x) => x.e)) / 60) * 60 + 60;
    const W = 640, L = 70, R = 12, T = 6, rh = 24, H = T + spans.length * rh + 24;
    const x = (m) => L + ((m - lo) / (hi - lo)) * (W - L - R);
    const step = (hi - lo) / 60 > 10 ? 120 : 60;
    let s = '';
    for (let m = lo; m <= hi; m += step) s += `<line x1="${x(m)}" x2="${x(m)}" y1="${T}" y2="${H - 20}" class="grid-l"/><text x="${x(m)}" y="${H - 5}" class="ax" text-anchor="middle">${fromMin(m)}</text>`;
    if (lo < 1440 && hi > 1440) s += `<line x1="${x(1440)}" x2="${x(1440)}" y1="${T}" y2="${H - 20}" class="target"/>`;
    spans.forEach((r, i) => {
      const y = T + i * rh, hrs = num(r.s.hours);
      const c = hrs >= g.sleep - 0.25 ? 'var(--sleep)' : hrs >= g.sleep - 1 ? 'color-mix(in srgb, var(--sleep) 55%, var(--carbs))' : 'var(--bad)';
      s += `<text x="${L - 10}" y="${y + 16}" class="ax" text-anchor="end">${esc(fmtDay(r.k, { weekday: 'short', day: 'numeric' }))}</text>
        <rect class="bar" x="${x(r.b)}" y="${y + 4}" width="${Math.max(3, x(r.e) - x(r.b))}" height="${rh - 8}" rx="8" style="fill:${c};transform-origin:left;animation-delay:${i * 30}ms" data-tip="${esc(`${fmtDay(r.k)}\n${r.s.bed} → ${r.s.wake} · ${fmtDur(hrs)}\nQuality ${r.s.quality || '—'}/5`)}"/>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
  }

  function pageSleep() {
    const k = curDate, d = getDay(k), g = goals();
    const sl = d.sleep || {};
    const keys = rangeKeys(k, 14);
    const nights = keys.map((x) => getDay(x).sleep);
    const logged = nights.filter(Boolean);
    const last7 = rangeKeys(k, 7).map((x) => getDay(x).sleep).filter(Boolean);
    const avg7 = last7.length ? avg(last7.map((s) => num(s.hours))) : null;
    const debt = last7.length ? sum(last7, (s) => Math.max(0, g.sleep - num(s.hours))) : null;
    const beds = logged.map((s) => bedMin(s.bed)), wakes = logged.map((s) => toMin(s.wake));
    const consistency = logged.length >= 3 ? Math.round(stdev(beds)) : null;
    const avgQ = logged.length ? avg(logged.map((s) => num(s.quality)).filter(Boolean)) : 0;
    const sleepTips = [];
    if (avg7 != null && avg7 < g.sleep - 0.5) sleepTips.push({ type: 'warn', text: `You're averaging ${fmtDur(avg7)} — about ${fmtDur(g.sleep - avg7)} under your goal. Try moving bedtime 15 minutes earlier each week.` });
    if (consistency != null && consistency > 60) sleepTips.push({ type: 'warn', text: `Your bedtime varies by ±${consistency} min. A consistent schedule (even on weekends) improves sleep quality more than extra hours.` });
    if (consistency != null && consistency <= 30) sleepTips.push({ type: 'good', text: `Very consistent bedtime (±${consistency} min). Your body clock thanks you.` });
    if (avg7 != null && avg7 >= g.sleep) sleepTips.push({ type: 'good', text: 'You are meeting your sleep goal on average this week. Keep it up!' });
    sleepTips.push({ type: 'info', text: 'Wind-down basics: dim lights and screens 60 min before bed, keep the room cool (18–20 °C), and avoid caffeine after 2 pm.' });

    return `
    <div class="kpis">
      <div class="kpi"><div class="k-label">7-day average</div><div class="k-value">${avg7 != null ? fmtDur(avg7) : '—'}</div><div class="k-sub">Goal ${g.sleep}h</div></div>
      <div class="kpi"><div class="k-label">Sleep debt (7d)</div><div class="k-value ${debt > 3 ? 'bad' : ''}">${debt != null ? fmtDur(debt) : '—'}</div><div class="k-sub">Hours below goal</div></div>
      <div class="kpi"><div class="k-label">Avg bedtime</div><div class="k-value">${beds.length ? fromMin(avg(beds)) : '—'}</div><div class="k-sub">Wake ${wakes.length ? fromMin(avg(wakes)) : '—'}</div></div>
      <div class="kpi"><div class="k-label">Consistency</div><div class="k-value">${consistency != null ? '±' + consistency + '<small>min</small>' : '—'}</div><div class="k-sub">Bedtime variation</div></div>
      <div class="kpi"><div class="k-label">Avg quality</div><div class="k-value">${avgQ ? fmt(avgQ, 1) + '<small>/5</small>' : '—'}</div><div class="k-sub">Last 14 nights</div></div>
    </div>
    <div class="grid two mt-lg">
      <section class="card">
        <div class="card-head"><h3>${icon('moon')} Night ending ${esc(relDay(k).toLowerCase() === 'today' ? 'this morning' : fmtDay(k))}</h3>${d.sleep ? `<button class="btn sm danger ghost" data-action="del-sleep">${icon('trash')} Remove</button>` : ''}</div>
        <form data-form="sleep"><div class="form-grid">
          <label class="field">Went to bed<input name="bed" type="time" value="${esc(sl.bed || '23:00')}" required></label>
          <label class="field">Woke up<input name="wake" type="time" value="${esc(sl.wake || '07:00')}" required></label>
          <label class="field">Times woke up<input name="awake" type="number" min="0" max="20" value="${sl.awake != null ? esc(sl.awake) : ''}" placeholder="0"></label>
          <div class="field full"><span>Quality</span><div class="stars">${[5, 4, 3, 2, 1].map((v) => `<input type="radio" name="quality" id="q${v}" value="${v}" ${num(sl.quality, 3) === v ? 'checked' : ''}><label for="q${v}" title="${v} of 5">★</label>`).join('')}</div></div>
          <label class="field full">Notes<input name="notes" maxlength="140" value="${esc(sl.notes || '')}" placeholder="e.g. late coffee, vivid dreams"></label>
        </div>
        <div class="row between mt"><span class="small muted" id="sl-dur">${d.sleep ? `Logged: ${fmtDur(sl.hours)}` : ''}</span><button class="btn">${icon('check')} Save sleep</button></div></form>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('sparkle')} Sleep coach</h3></div>
        <ul class="insights">${sleepTips.map((i) => `<li class="${i.type}">${esc(i.text)}</li>`).join('')}</ul>
      </section>
    </div>
    <section class="card mt-lg">
      <div class="card-head"><h3>${icon('clock')} Sleep schedule</h3><span class="sub">Bed → wake for each night · dashed line = midnight</span></div>
      ${sleepTimeline(keys)}
    </section>
    <section class="card mt-lg">
      <div class="card-head"><h3>${icon('chart')} Last 14 nights</h3><span class="sub">${logged.length} logged</span></div>
      ${barChart({ values: nights.map((s) => (s ? num(s.hours) : null)), labels: keys.map((x) => chartLabel(x, 14)), tips: keys.map((x) => fmtDay(x)), target: g.sleep, unit: 'h', d: 1, colorFn: (v) => (v >= g.sleep ? 'var(--sleep)' : v >= g.sleep - 1 ? 'color-mix(in srgb, var(--sleep) 65%, transparent)' : 'var(--bad)') })}
      <div class="legend"><span><i style="background:var(--sleep)"></i>Goal met</span><span><i style="background:color-mix(in srgb, var(--sleep) 65%, transparent)"></i>Within 1h</span><span><i style="background:var(--bad)"></i>Short</span></div>
    </section>`;
  }

  // ------------------------------------------------------------------
  // Page: Body
  // ------------------------------------------------------------------
  function linReg(points) { // [{x,y}] -> slope per x
    if (points.length < 2) return null;
    const mx = avg(points.map((p) => p.x)), my = avg(points.map((p) => p.y));
    let nume = 0, den = 0;
    for (const p of points) { nume += (p.x - mx) * (p.y - my); den += (p.x - mx) * (p.x - mx); }
    return den ? nume / den : null;
  }

  function weightSeries(keys) {
    const vals = keys.map((k) => (num(getDay(k).weight) > 0 ? num(getDay(k).weight) : null));
    const ma = keys.map((k, i) => {
      const win = vals.slice(Math.max(0, i - 6), i + 1).filter((v) => v != null);
      return vals[i] != null && win.length ? round(avg(win), 2) : null;
    });
    return { vals, ma };
  }

  function pageBody() {
    const k = curDate, d = getDay(k), p = S.profile || {}, g = goals();
    const w = currentWeight(k);
    const hM = num(p.height, 170) / 100;
    const bmi = w / (hM * hM);
    const bmiCat = bmi < 18.5 ? ['Underweight', 'warn'] : bmi < 25 ? ['Healthy range', 'good'] : bmi < 30 ? ['Overweight', 'warn'] : ['Obese range', 'bad'];
    const start = num(p.startWeight, num(p.weight, w)), target = num(p.targetWeight);
    const progress = target && start !== target ? clamp((start - w) / (start - target), 0, 1) : null;
    const keys = rangeKeys(k, 90);
    const { vals, ma } = weightSeries(keys);
    const pts = keys.map((x, i) => ({ x: i, y: vals[i] })).filter((q) => q.y != null && q.x >= 62);
    const slope = linReg(pts); // kg/day over last 28 days
    const perWeek = slope != null ? slope * 7 : null;
    let projection = '';
    if (perWeek != null && target && Math.abs(perWeek) > 0.02 && Math.sign(target - w) === Math.sign(perWeek) && Math.abs(target - w) > 0.2) {
      const weeks = (target - w) / perWeek;
      const date = addDays(todayKey(), Math.round(weeks * 7));
      projection = `At this pace you'll reach ${fmt(target, 1)} kg around <b>${esc(fmtDay(date, { day: 'numeric', month: 'short', year: 'numeric' }))}</b>.`;
    }
    const history = Object.keys(S.days).filter((x) => num(S.days[x].weight) > 0).sort().reverse().slice(0, 12);
    const hasLog = Object.keys(S.days).some((x) => num(S.days[x].weight) > 0);
    const shown = hasLog ? keys.findIndex((_, i) => vals[i] != null) : -1;
    const cut = shown > 0 ? Math.max(0, shown - 2) : 0;
    const ks = keys.slice(cut);
    const body = d.body || {};
    return `
    <div class="kpis">
      <div class="kpi"><div class="k-label">Current weight</div><div class="k-value">${fmt(w, 1)}<small>kg</small></div><div class="k-sub">${start ? `${w - start >= 0 ? '+' : ''}${fmt(w - start, 1)} kg since start` : ''}</div></div>
      <div class="kpi"><div class="k-label">BMI</div><div class="k-value">${fmt(bmi, 1)}</div><div class="k-sub ${bmiCat[1]}">${bmiCat[0]}</div></div>
      <div class="kpi"><div class="k-label">Weekly trend</div><div class="k-value">${perWeek != null ? (perWeek >= 0 ? '+' : '') + fmt(perWeek, 2) + '<small>kg/wk</small>' : '—'}</div><div class="k-sub">Last 4 weeks</div></div>
      <div class="kpi"><div class="k-label">Goal</div><div class="k-value">${target ? fmt(target, 1) + '<small>kg</small>' : '—'}</div><div class="k-sub">${progress != null ? round(progress * 100) + '% of the way' : 'Set in Settings'}</div></div>
      <div class="kpi"><div class="k-label">Energy needs</div><div class="k-value">${fmt(g.auto.tdee)}<small>kcal</small></div><div class="k-sub">BMR ${fmt(g.auto.bmr)} kcal</div></div>
    </div>
    <div class="grid two mt-lg">
      <section class="card">
        <div class="card-head"><h3>${icon('scale')} Log measurements · ${esc(relDay(k))}</h3>${d.weight ? `<button class="btn sm danger ghost" data-action="del-weight">${icon('trash')} Remove</button>` : ''}</div>
        <form data-form="weight"><div class="form-grid">
          <label class="field">Weight (kg)<input name="weight" type="number" min="20" max="400" step="0.1" value="${d.weight ? esc(d.weight) : ''}" placeholder="${fmt(w, 1)}" required></label>
          <label class="field">Body fat % (optional)<input name="bf" type="number" min="2" max="70" step="0.1" value="${body.bf ? esc(body.bf) : ''}"></label>
          <label class="field">Waist cm (optional)<input name="waist" type="number" min="30" max="250" step="0.5" value="${body.waist ? esc(body.waist) : ''}"></label>
        </div><div class="form-actions"><button class="btn">${icon('check')} Save</button></div></form>
        ${progress != null ? `<div class="mt-lg"><div class="mbar-top"><span>Progress to goal</span><span><b>${round(progress * 100)}%</b></span></div><div class="track"><div class="fill" style="width:${progress * 100}%;background:var(--body)"></div></div><div class="small muted mt">${fmt(start, 1)} kg → ${fmt(target, 1)} kg · ${fmt(Math.abs(target - w), 1)} kg to go. ${projection}</div></div>` : ''}
        <p class="tiny faint mt">Tip: weigh yourself at the same time (morning, after the bathroom) and watch the 7-day average — daily numbers swing ±1 kg from water and salt.</p>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('clock')} History</h3></div>
        ${history.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th class="right">Weight</th><th class="right">Body fat</th><th class="right">Waist</th></tr></thead><tbody>${history.map((x) => { const dd = S.days[x], b = dd.body || {}; return `<tr><td>${esc(fmtDay(x))}</td><td class="right"><b>${fmt(dd.weight, 1)} kg</b></td><td class="right">${b.bf ? fmt(b.bf, 1) + '%' : '—'}</td><td class="right">${b.waist ? fmt(b.waist, 1) + ' cm' : '—'}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No measurements yet.</div>'}
      </section>
    </div>
    <section class="card mt-lg">
      <div class="card-head"><h3>${icon('chart')} Weight trend</h3><span class="sub">Daily weigh-ins & 7-day average</span></div>
      ${lineChart({ series: [{ values: vals.slice(cut), color: 'color-mix(in srgb, var(--primary) 45%, transparent)', label: 'Weight', connect: true, width: 1.5 }, { values: ma.slice(cut), color: 'var(--primary)', label: '7-day avg', connect: true, dots: false, width: 3 }], labels: ks.map((x) => chartLabel(x, ks.length)), tips: ks.map((x) => fmtDay(x)), target: target || null, unit: 'kg' })}
      <div class="legend"><span><i style="background:color-mix(in srgb, var(--primary) 45%, transparent)"></i>Daily</span><span><i style="background:var(--primary)"></i>7-day average</span>${target ? '<span>— — Goal</span>' : ''}</div>
    </section>`;
  }

  // ------------------------------------------------------------------
  // Page: Insights (analytics)
  // ------------------------------------------------------------------
  function pearson(xs, ys) {
    const n = xs.length;
    if (n < 6) return null;
    const mx = avg(xs), my = avg(ys);
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < n; i++) { a += (xs[i] - mx) * (ys[i] - my); b += (xs[i] - mx) ** 2; c += (ys[i] - my) ** 2; }
    return b && c ? a / Math.sqrt(b * c) : null;
  }

  function correlations(keys) {
    const pairs = (fx, fy) => { const xs = [], ys = []; for (const k of keys) { const x = fx(k), y = fy(k); if (x != null && y != null) { xs.push(x); ys.push(y); } } return { r: pearson(xs, ys), n: xs.length }; };
    const T = {};
    const tt = (k) => T[k] || (T[k] = dayTotals(k));
    const defs = [
      { a: 'more sleep', b: 'calories eaten that day', fx: (k) => tt(k).sleep, fy: (k) => (tt(k).kcal > 0 ? tt(k).kcal : null), pos: 'higher', neg: 'lower' },
      { a: 'more sleep', b: 'better mood', fx: (k) => tt(k).sleep, fy: (k) => tt(k).mood, pos: 'better', neg: 'worse', yname: 'mood' },
      { a: 'more sleep', b: 'energy', fx: (k) => tt(k).sleep, fy: (k) => tt(k).energy, pos: 'higher', neg: 'lower', yname: 'energy' },
      { a: 'drinking more water', b: 'energy', fx: (k) => (tt(k).water > 0 ? tt(k).water : null), fy: (k) => tt(k).energy, pos: 'higher', neg: 'lower', yname: 'energy' },
      { a: 'more active minutes', b: 'sleep quality that night', fx: (k) => tt(k).activeMin, fy: (k) => tt(addDays(k, 1)).sleepQ, pos: 'better', neg: 'worse', yname: 'sleep quality' },
      { a: 'more active minutes', b: 'mood', fx: (k) => (tt(k).hasData ? tt(k).activeMin : null), fy: (k) => tt(k).mood, pos: 'better', neg: 'worse', yname: 'mood' },
      { a: 'higher protein', b: 'calories', fx: (k) => (tt(k).kcal > 0 ? (tt(k).p * 4) / tt(k).kcal : null), fy: (k) => (tt(k).kcal > 0 ? tt(k).kcal : null), pos: 'higher', neg: 'lower', yname: 'total calories' },
    ];
    return defs.map((dd) => {
      const { r, n } = pairs(dd.fx, dd.fy);
      return { ...dd, r, n };
    }).filter((x) => x.r != null && Math.abs(x.r) >= 0.25).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  }

  function rangeInsights(keys, rows) {
    const g = goals(), out = [];
    const food = rows.filter((r) => r.kcal > 0);
    const n = keys.length;
    const loggedDays = rows.filter((r) => r.hasData).length;
    out.push({ type: loggedDays / n >= 0.8 ? 'good' : 'info', text: `You logged on ${loggedDays} of ${n} days (${round((loggedDays / n) * 100)}%).${loggedDays / n < 0.8 ? ' Logging most days gives far more accurate insights.' : ''}` });
    if (food.length >= 3) {
      const ak = avg(food.map((r) => r.kcal));
      if (ak > g.kcal * 1.1) out.push({ type: 'warn', text: `Average intake ${fmt(ak)} kcal is ${round((ak / g.kcal - 1) * 100)}% above your goal of ${fmt(g.kcal)}.` });
      else if (ak < g.kcal * 0.8) out.push({ type: 'warn', text: `Average intake ${fmt(ak)} kcal is well below your goal — under-eating can stall progress and sap energy (or some meals aren't being logged).` });
      else out.push({ type: 'good', text: `Average intake ${fmt(ak)} kcal — right around your ${fmt(g.kcal)} kcal goal.` });
      const pHit = food.filter((r) => r.p >= g.p * 0.9).length;
      out.push({ type: pHit / food.length >= 0.7 ? 'good' : 'warn', text: `Protein target hit on ${pHit} of ${food.length} logged days (avg ${fmt(avg(food.map((r) => r.p)))} g vs ${g.p} g).` });
      const lows = ['fi', 'ca', 'fe', 'kp', 'vc'].filter((key) => avg(food.map((r) => r[key])) < g[key] * 0.7);
      if (lows.length) out.push({ type: 'warn', text: `Consistently low: ${lows.map((x) => NMAP[x].label.toLowerCase()).join(', ')}. ${lows.includes('fi') || lows.includes('kp') ? 'More legumes, fruit and vegetables would help. ' : ''}${lows.includes('ca') ? 'Dairy, tofu, paneer and leafy greens add calcium. ' : ''}${lows.includes('fe') ? 'Lentils, spinach and red meat add iron (pair with vitamin C). ' : ''}`.trim() });
      const na = avg(food.map((r) => r.na));
      if (na > g.na) out.push({ type: 'warn', text: `Average sodium ${fmt(na)} mg exceeds the ${fmt(g.na)} mg limit.` });
      const we = food.filter((r) => [0, 6].includes(parseKey(r.k).getDay())), wd = food.filter((r) => ![0, 6].includes(parseKey(r.k).getDay()));
      if (we.length >= 2 && wd.length >= 3) {
        const diff = avg(we.map((r) => r.kcal)) - avg(wd.map((r) => r.kcal));
        if (diff > g.kcal * 0.12) out.push({ type: 'info', text: `You eat ~${fmt(diff)} kcal more on weekends. That's ~${fmt(diff * 2)} kcal/week — plan weekend meals ahead.` });
      }
    }
    const water = rows.filter((r) => r.water > 0);
    if (water.length >= 3) {
      const met = water.filter((r) => r.water >= g.water).length;
      out.push({ type: met / water.length >= 0.7 ? 'good' : 'info', text: `Hydration goal met on ${met} of ${water.length} days (avg ${fmt(avg(water.map((r) => r.water)))} ml).` });
    }
    const sl = rows.filter((r) => r.sleep != null);
    if (sl.length >= 3) {
      const as = avg(sl.map((r) => r.sleep));
      out.push({ type: as >= g.sleep - 0.25 ? 'good' : 'warn', text: `Average sleep ${fmtDur(as)} (goal ${g.sleep}h).` });
      const we = sl.filter((r) => [0, 6].includes(parseKey(r.k).getDay())), wd = sl.filter((r) => ![0, 6].includes(parseKey(r.k).getDay()));
      if (we.length >= 2 && wd.length >= 3) {
        const diff = avg(we.map((r) => r.sleep)) - avg(wd.map((r) => r.sleep));
        if (diff > 1) out.push({ type: 'warn', text: `You sleep ${fmtDur(diff)} longer on weekends — a sign of weekday sleep debt ("social jet lag").` });
      }
    }
    const weeks = n / 7;
    const workouts = sum(rows, (r) => getDay(r.k).workouts.length);
    const minsPerWeek = sum(rows, (r) => r.activeMin) / weeks;
    if (n >= 7) out.push({ type: minsPerWeek >= 150 ? 'good' : 'info', text: `${fmt(workouts / weeks, 1)} workouts and ${fmt(minsPerWeek)} active minutes per week${minsPerWeek >= 150 ? ' — meeting the WHO guideline of 150 min.' : '. The WHO recommends at least 150 minutes of moderate activity weekly.'}` });
    const ws = rows.filter((r) => r.weight != null);
    if (ws.length >= 2) {
      const ch = ws[ws.length - 1].weight - ws[0].weight;
      const goal = S.profile && S.profile.goal;
      const wantDown = goal && goal.startsWith('lose'), wantUp = goal && goal.startsWith('gain');
      const good = (wantDown && ch < 0) || (wantUp && ch > 0) || (!wantDown && !wantUp && Math.abs(ch) < 1);
      out.push({ type: good ? 'good' : 'info', text: `Weight changed ${ch >= 0 ? '+' : ''}${fmt(ch, 1)} kg over this period${good ? ' — in line with your goal.' : '.'}` });
    }
    for (const c of correlations(keys).slice(0, 3)) {
      const strength = Math.abs(c.r) >= 0.6 ? 'Strong' : Math.abs(c.r) >= 0.4 ? 'Moderate' : 'Mild';
      out.push({ type: 'info', text: `${strength} pattern: days with ${c.a} tend to have ${c.r > 0 ? c.pos : c.neg} ${c.yname || c.b} (r = ${fmt(c.r, 2)}, ${c.n} days).` });
    }
    return out;
  }

  function heatmap(weeks = 18) {
    const t = todayKey();
    const mondayOffset = (parseKey(t).getDay() + 6) % 7;
    const start = addDays(t, -mondayOffset - (weeks - 1) * 7);
    let cells = '';
    for (let i = 0; i < weeks * 7; i++) {
      const k = addDays(start, i);
      if (k > t) { cells += '<span class="hm-cell empty"></span>'; continue; }
      const hs = healthScore(k);
      const lvl = !hs ? 0 : hs.score >= 80 ? 4 : hs.score >= 60 ? 3 : hs.score >= 40 ? 2 : 1;
      cells += `<button class="hm-cell l${lvl}" data-action="goto-date" data-k="${k}" data-tip="${esc(fmtDay(k) + '\n' + (hs ? 'Score ' + hs.score : 'No data'))}" aria-label="${esc(fmtDay(k))}"></button>`;
    }
    return `<div class="hm-wrap"><div class="hm-days"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div><div class="heatmap">${cells}</div></div>
      <div class="legend">Less <span class="hm-cell l0"></span><span class="hm-cell l1"></span><span class="hm-cell l2"></span><span class="hm-cell l3"></span><span class="hm-cell l4"></span> More <span class="spacer"></span><span>Tap a day to open it</span></div>`;
  }

  // This week (last 7 days) vs the 7 days before.
  function weeklyReport() {
    const g = goals(), t = todayKey();
    const stats = (end) => {
      const ks = rangeKeys(end, 7), rows = ks.map((k) => dayTotals(k));
      const sc = ks.map((k) => healthScore(k)).filter(Boolean).map((x) => x.score);
      const food = rows.filter((r) => r.kcal > 0), sl = rows.filter((r) => r.sleep != null), wa = rows.filter((r) => r.water > 0);
      return {
        score: sc.length ? avg(sc) : null,
        kcal: food.length ? avg(food.map((r) => r.kcal)) : null,
        kcalDev: food.length ? avg(food.map((r) => Math.abs(r.kcal - g.kcal))) : null,
        p: food.length ? avg(food.map((r) => r.p)) : null,
        water: wa.length ? avg(wa.map((r) => r.water)) : null,
        sleep: sl.length ? avg(sl.map((r) => r.sleep)) : null,
        active: rows.some((r) => r.hasData) ? sum(rows, (r) => r.activeMin) : null,
        steps: rows.some((r) => r.steps) ? avg(rows.map((r) => r.steps)) : null,
        habits: S.habits.length && rows.some((r) => r.hasData) ? (sum(rows, (r) => r.habits) / (S.habits.length * 7)) * 100 : null,
        mindful: rows.some((r) => r.hasData) ? sum(rows, (r) => r.mindful) : null,
      };
    };
    const a = stats(t), b = stats(addDays(t, -7));
    // [label, key, formatter, unit, compare key, higher is better, min meaningful change]
    const items = [
      ['Health score', 'score', (v) => fmt(v), '', 'score', true, 1],
      ['Calories / day', 'kcal', (v) => fmt(v), 'kcal', 'kcalDev', false, 25],
      ['Protein / day', 'p', (v) => fmt(v), 'g', 'p', true, 2],
      ['Water / day', 'water', (v) => fmt(v / 1000, 1), 'L', 'water', true, 100],
      ['Sleep / night', 'sleep', (v) => fmtDur(v), '', 'sleep', true, 0.1],
      ['Active minutes', 'active', (v) => fmt(v), 'min', 'active', true, 5],
      ['Steps / day', 'steps', (v) => fmt(v), '', 'steps', true, 200],
      ['Habits done', 'habits', (v) => fmt(v), '%', 'habits', true, 2],
      ['Mindful minutes', 'mindful', (v) => fmt(v), 'min', 'mindful', true, 1],
    ];
    const cells = items.map(([label, key, f, unit, ck, higher, eps]) => {
      const v = a[key];
      let delta = '<span class="delta">No data last week</span>';
      if (v == null) delta = '<span class="delta">No data yet</span>';
      else if (b[ck] != null && a[ck] != null) {
        const diff = a[ck] - b[ck];
        if (Math.abs(diff) < eps) delta = '<span class="delta">≈ Same as last week</span>';
        else {
          const better = higher ? diff > 0 : diff < 0;
          const text = ck === 'kcalDev' ? (better ? `${fmt(Math.abs(diff))} kcal closer to goal` : `${fmt(Math.abs(diff))} kcal further from goal`)
            : `${diff > 0 ? '▲' : '▼'} ${key === 'sleep' ? fmtDur(Math.abs(diff)) : key === 'water' ? fmt(Math.abs(diff) / 1000, 1) + ' L' : fmt(Math.abs(diff)) + (unit ? ' ' + unit : '')}`;
          delta = `<span class="delta ${better ? 'up' : 'down'}">${esc(text)}</span>`;
        }
      }
      return `<div class="wk-item"><div class="wk-label">${esc(label)}</div><div class="wk-val">${v == null ? '—' : esc(f(v))}${v != null && unit ? `<small>${esc(unit)}</small>` : ''}</div>${delta}</div>`;
    }).join('');
    return `<section class="card mt-lg"><div class="card-head"><h3>${icon('calendar')} This week vs last week</h3><span class="sub">${esc(fmtDay(addDays(t, -6), { day: 'numeric', month: 'short' }))} – ${esc(fmtDay(t, { day: 'numeric', month: 'short' }))} compared with the 7 days before</span></div><div class="wk-grid">${cells}</div></section>`;
  }

  function achievements() {
    const g = goals();
    const rows = Object.keys(S.days).sort().map((k) => ({ k, t: dayTotals(k), d: S.days[k] }));
    let best = 0, run = 0, prev = null;
    for (const r of rows) {
      if (!r.t.hasData) continue;
      run = prev && addDays(prev, 1) === r.k ? run + 1 : 1;
      prev = r.k;
      best = Math.max(best, run);
    }
    const countIf = (fn) => rows.filter(fn).length;
    const A = (ic, name, desc, prog) => ({ icon: ic, name, desc, prog: clamp(prog, 0, 1), got: prog >= 1 });
    return [
      A('🌱', 'First step', 'Log anything for the first time', rows.some((r) => r.t.hasData) ? 1 : 0),
      A('🔥', 'On fire', 'Log 7 days in a row', best / 7),
      A('🥇', 'Habit formed', 'Log 30 days in a row', best / 30),
      A('💧', 'Hydration hero', 'Hit your water goal on 10 days', countIf((r) => r.t.water >= g.water) / 10),
      A('💪', 'Protein pro', 'Hit your protein goal on 10 days', countIf((r) => r.t.p >= g.p) / 10),
      A('🥦', 'Fiber fan', 'Hit your fiber goal on 5 days', countIf((r) => r.t.fi >= g.fi) / 5),
      A('😴', 'Well rested', 'Meet your sleep goal on 7 nights', countIf((r) => r.t.sleep != null && r.t.sleep >= g.sleep - 0.25) / 7),
      A('⚡', 'Mover', 'Log 20 workouts', sum(rows, (r) => r.d.workouts.length) / 20),
      A('👟', '10K club', 'Walk 10,000 steps in one day', Math.max(0, ...rows.map((r) => r.t.steps)) / 10000),
      A('🏋️', 'Iron will', 'Log 50 strength sets', sum(rows, (r) => r.d.strength.length) / 50),
      A('⚖️', 'Steady scale', 'Weigh in on 8 different days', countIf((r) => r.t.weight != null) / 8),
      A('🏆', 'Perfect day', 'Close all four rings in one day', rows.some((r) => ringsFor(r.k).every((x) => x.done)) ? 1 : 0),
      A('✅', 'Habit hero', 'Complete every habit on 7 days', S.habits.length ? countIf((r) => r.t.habits >= S.habits.length) / 7 : 0),
      A('😌', 'Zen', 'Log 30 mindful minutes', sum(rows, (r) => r.t.mindful) / 30),
      A('⌛', 'Fast finisher', 'Complete 5 fasts that reach their goal', S.fasting.history.filter((f) => f.end - f.start >= f.target * HOUR).length / 5),
    ];
  }

  function pageInsights() {
    const end = todayKey(), n = insRange, g = goals();
    const keys = rangeKeys(end, n);
    const rows = keys.map((k) => Object.assign({ k }, dayTotals(k), { score: (healthScore(k) || {}).score }));
    const labels = keys.map((k) => chartLabel(k, n)), tips = keys.map((k) => fmtDay(k));
    const food = rows.filter((r) => r.kcal > 0), sl = rows.filter((r) => r.sleep != null), wa = rows.filter((r) => r.water > 0);
    const scores = rows.filter((r) => r.score != null);
    const ws = rows.filter((r) => r.weight != null);
    const avgN = Object.fromEntries(NKEYS.map((x) => [x, food.length ? avg(food.map((r) => r[x])) : 0]));
    const pk = avgN.p * 4, ck = avgN.c * 4, fk = avgN.f * 9, tot = pk + ck + fk;

    // Weekday averages
    const wdK = [1, 2, 3, 4, 5, 6, 0];
    const wdCal = wdK.map((dow) => { const r = food.filter((x) => parseKey(x.k).getDay() === dow); return r.length ? avg(r.map((x) => x.kcal)) : null; });
    const wdSleep = wdK.map((dow) => { const r = sl.filter((x) => parseKey(x.k).getDay() === dow); return r.length ? avg(r.map((x) => x.sleep)) : null; });

    // Top foods by calories
    const foodAgg = {};
    for (const k of keys) for (const e of getDay(k).foods) {
      const key = e.name;
      foodAgg[key] = foodAgg[key] || { name: e.name, kcal: 0, count: 0, p: 0 };
      foodAgg[key].kcal += num(e.kcal); foodAgg[key].count++; foodAgg[key].p += num(e.p);
    }
    const topFoods = Object.values(foodAgg).sort((a, b) => b.kcal - a.kcal).slice(0, 8);
    const totalKcal = sum(food, (r) => r.kcal);
    const ins = rangeInsights(keys, rows);
    const ach = achievements();

    return `
    <div class="row between">
      <div class="seg" role="tablist">${[7, 30, 90].map((v) => `<button class="${v === n ? 'active' : ''}" data-action="ins-range" data-v="${v}">${v} days</button>`).join('')}</div>
      <span class="small muted">${esc(fmtDay(keys[0]))} – ${esc(fmtDay(end))}</span>
    </div>
    <div class="kpis mt">
      <div class="kpi"><div class="k-label">Avg score</div><div class="k-value" style="color:${scores.length ? scoreColor(avg(scores.map((r) => r.score))) : 'inherit'}">${scores.length ? fmt(avg(scores.map((r) => r.score))) : '—'}</div><div class="k-sub">${scores.length} scored days</div></div>
      <div class="kpi"><div class="k-label">Avg calories</div><div class="k-value">${food.length ? fmt(avgN.kcal) : '—'}</div><div class="k-sub">Goal ${fmt(g.kcal)}</div></div>
      <div class="kpi"><div class="k-label">Avg protein</div><div class="k-value">${food.length ? fmt(avgN.p) + '<small>g</small>' : '—'}</div><div class="k-sub">Goal ${g.p} g</div></div>
      <div class="kpi"><div class="k-label">Avg water</div><div class="k-value">${wa.length ? fmt(avg(wa.map((r) => r.water)) / 1000, 1) + '<small>L</small>' : '—'}</div><div class="k-sub">Goal ${fmt(g.water / 1000, 1)} L</div></div>
      <div class="kpi"><div class="k-label">Avg sleep</div><div class="k-value">${sl.length ? fmtDur(avg(sl.map((r) => r.sleep))) : '—'}</div><div class="k-sub">Goal ${g.sleep}h</div></div>
      <div class="kpi"><div class="k-label">Active min</div><div class="k-value">${fmt(sum(rows, (r) => r.activeMin))}</div><div class="k-sub">${fmt(sum(rows, (r) => r.burned))} kcal burned</div></div>
      <div class="kpi"><div class="k-label">Weight change</div><div class="k-value">${ws.length >= 2 ? ((ws[ws.length - 1].weight - ws[0].weight >= 0 ? '+' : '') + fmt(ws[ws.length - 1].weight - ws[0].weight, 1)) + '<small>kg</small>' : '—'}</div><div class="k-sub">${ws.length} weigh-ins</div></div>
      <div class="kpi"><div class="k-label">Streak</div><div class="k-value">${loggingStreak()}<small>days</small></div><div class="k-sub">Consecutive days logged</div></div>
    </div>

    ${weeklyReport()}

    <div class="grid two mt-lg">
      <section class="card"><div class="card-head"><h3>${icon('calendar')} Consistency calendar</h3><span class="sub">Daily health score · last 18 weeks</span></div>${heatmap(18)}</section>
      <section class="card"><div class="card-head"><h3>${icon('trophy')} Achievements</h3><span class="sub">${ach.filter((x) => x.got).length} of ${ach.length} unlocked</span></div>
        <div class="badges">${ach.map((x) => `<div class="badge ${x.got ? 'got' : ''}" data-tip="${esc(x.desc + (x.got ? '\nUnlocked!' : `\n${round(x.prog * 100)}% there`))}"><span class="b-ic">${emo(x.icon, { size: 42 })}</span><span class="b-name">${esc(x.name)}</span>${x.got ? '' : `<span class="b-prog"><i style="width:${x.prog * 100}%"></i></span>`}</div>`).join('')}</div></section>
    </div>

    <section class="card mt-lg">
      <div class="card-head"><h3>${icon('sparkle')} Key insights</h3><span class="sub">Generated from your data</span></div>
      <ul class="insights">${ins.map((i) => `<li class="${i.type}">${esc(i.text)}</li>`).join('')}</ul>
    </section>

    <div class="grid two mt-lg">
      <section class="card"><div class="card-head"><h3>${icon('flame')} Calories in vs. goal</h3></div>
        ${barChart({ values: rows.map((r) => r.kcal || null), labels, tips, target: g.kcal, unit: 'kcal', colorFn: (v) => (v > g.kcal * 1.1 ? 'var(--bad)' : v < g.kcal * 0.8 ? 'var(--carbs)' : 'var(--cal)') })}
        <div class="legend"><span><i style="background:var(--cal)"></i>On target (±10–20%)</span><span><i style="background:var(--bad)"></i>Over</span><span><i style="background:var(--carbs)"></i>Under</span></div></section>
      <section class="card"><div class="card-head"><h3>${icon('activity')} Energy balance</h3><span class="sub">Food − (BMR×activity + exercise)</span></div>
        ${barChart({ values: rows.map((r) => (r.kcal > 0 ? Math.abs(r.kcal - g.auto.tdee - r.workoutKcal) : null)), labels, tips: rows.map((r, i) => tips[i] + (r.kcal > 0 ? (r.kcal - g.auto.tdee - r.workoutKcal >= 0 ? ' · surplus' : ' · deficit') : '')), unit: 'kcal', colorFn: (v, i) => (rows[i].kcal - g.auto.tdee - rows[i].workoutKcal >= 0 ? 'var(--carbs)' : 'var(--move)') })}
        <div class="legend"><span><i style="background:var(--move)"></i>Deficit</span><span><i style="background:var(--carbs)"></i>Surplus</span></div></section>

      <section class="card"><div class="card-head"><h3>${icon('food')} Average macro split</h3></div>
        ${food.length ? `<div class="donut-wrap">${donut([{ v: pk, color: 'var(--protein)', label: 'Protein' }, { v: ck, color: 'var(--carbs)', label: 'Carbs' }, { v: fk, color: 'var(--fat)', label: 'Fat' }], 150, 22, `<b>${fmt(avgN.kcal)}</b><span>avg kcal</span>`)}
          <div style="flex:1;min-width:180px">${mbar(`Protein · ${tot ? round((pk / tot) * 100) : 0}%`, avgN.p, g.p, 'var(--protein)')}${mbar(`Carbs · ${tot ? round((ck / tot) * 100) : 0}%`, avgN.c, g.c, 'var(--carbs)')}${mbar(`Fat · ${tot ? round((fk / tot) * 100) : 0}%`, avgN.f, g.f, 'var(--fat)')}</div></div>` : emptyChart()}</section>
      <section class="card"><div class="card-head"><h3>${icon('target')} Nutrient averages vs targets</h3><span class="sub">${food.length} logged days</span></div>
        ${food.length ? nutrientBars(avgN, g) : emptyChart()}</section>

      <section class="card"><div class="card-head"><h3>${icon('food')} Protein</h3></div>
        ${barChart({ values: rows.map((r) => r.p || null), labels, tips, target: g.p, unit: 'g', colorFn: (v) => (v >= g.p * 0.9 ? 'var(--protein)' : 'color-mix(in srgb, var(--protein) 45%, transparent)') })}</section>
      <section class="card"><div class="card-head"><h3>${icon('water')} Hydration</h3></div>
        ${barChart({ values: rows.map((r) => r.water || null), labels, tips, target: g.water, unit: 'ml', colorFn: (v) => (v >= g.water ? 'var(--water)' : 'color-mix(in srgb, var(--water) 45%, transparent)') })}</section>

      <section class="card"><div class="card-head"><h3>${icon('moon')} Sleep duration & quality</h3></div>
        ${lineChart({ series: [{ values: rows.map((r) => r.sleep), color: 'var(--sleep)', label: 'Hours', area: true }], labels, tips, target: g.sleep, unit: 'h', d: 1 })}
        ${sl.some((r) => r.sleepQ) ? `<div class="small muted mt">Avg quality ${fmt(avg(sl.filter((r) => r.sleepQ).map((r) => r.sleepQ)), 1)}/5</div>` : ''}</section>
      <section class="card"><div class="card-head"><h3>${icon('scale')} Weight</h3></div>
        ${(() => { const s = weightSeries(keys); return lineChart({ series: [{ values: s.vals, color: 'color-mix(in srgb, var(--primary) 45%, transparent)', label: 'Weight', connect: true, width: 1.5 }, { values: s.ma, color: 'var(--primary)', label: '7-day avg', connect: true, dots: false, width: 3 }], labels, tips, target: num(S.profile && S.profile.targetWeight) || null, unit: 'kg' }); })()}</section>

      <section class="card"><div class="card-head"><h3>${icon('activity')} Active minutes</h3></div>
        ${barChart({ values: rows.map((r) => r.activeMin || null), labels, tips, target: g.activeMin, unit: 'min', color: 'var(--move)' })}</section>
      <section class="card"><div class="card-head"><h3>${icon('activity')} Steps</h3></div>
        ${barChart({ values: rows.map((r) => r.steps || null), labels, tips, target: g.steps, unit: 'steps', color: 'color-mix(in srgb, var(--move) 75%, var(--water))' })}</section>

      <section class="card"><div class="card-head"><h3>${icon('smile')} Mood & energy</h3></div>
        ${lineChart({ series: [{ values: rows.map((r) => r.mood), color: 'var(--mood)', label: 'Mood' }, { values: rows.map((r) => r.energy), color: 'var(--fat)', label: 'Energy', dashed: true }], labels, tips, unit: '/5', d: 0, minZero: true })}
        <div class="legend"><span><i style="background:var(--mood)"></i>Mood</span><span><i style="background:var(--fat)"></i>Energy</span></div></section>
      <section class="card"><div class="card-head"><h3>${icon('sparkle')} Health score</h3></div>
        ${lineChart({ series: [{ values: rows.map((r) => (r.score != null ? r.score : null)), color: 'var(--good)', label: 'Score', area: true }], labels, tips, unit: '', d: 0, minZero: true })}</section>

      <section class="card"><div class="card-head"><h3>${icon('clock')} By weekday</h3><span class="sub">Average calories</span></div>
        ${barChart({ values: wdCal, labels: wdK.map((x) => DOW[x]), target: g.kcal, unit: 'kcal', color: 'var(--cal)', h: 170 })}</section>
      <section class="card"><div class="card-head"><h3>${icon('moon')} By weekday</h3><span class="sub">Average sleep</span></div>
        ${barChart({ values: wdSleep, labels: wdK.map((x) => DOW[x]), target: g.sleep, unit: 'h', d: 1, color: 'var(--sleep)', h: 170 })}</section>

      <section class="card span-all"><div class="card-head"><h3>${icon('star')} Top foods by calories</h3><span class="sub">What fuels you most</span></div>
        ${topFoods.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Food</th><th class="right">Times</th><th class="right">Calories</th><th class="right">Share</th><th class="right">Protein</th></tr></thead><tbody>${topFoods.map((f) => `<tr><td>${esc(f.name)}</td><td class="right">${f.count}</td><td class="right"><b>${fmt(f.kcal)}</b></td><td class="right">${totalKcal ? round((f.kcal / totalKcal) * 100) : 0}%</td><td class="right">${fmt(f.p)} g</td></tr>`).join('')}</tbody></table></div>` : emptyChart()}</section>
    </div>`;
  }

  // ------------------------------------------------------------------
  // Page: Reminders
  // ------------------------------------------------------------------
  const REM_TYPES = { water: 'Water', meal: 'Meal', workout: 'Workout', sleep: 'Sleep', weight: 'Weigh-in', medication: 'Medication', custom: 'Custom' };
  const REM_EMO = { water: '💧', meal: '🍽️', workout: '👟', sleep: '😴', weight: '⚖️', medication: '💊', custom: '🔔' };
  const notifSupported = () => 'Notification' in window;

  function describeReminder(r) {
    const days = (r.days || []).length === 7 ? 'Every day' : (r.days || []).length === 0 ? 'No days selected' : (r.days || []).slice().sort().map((x) => DOW[x]).join(', ');
    return r.mode === 'interval' ? `Every ${r.every} min, ${r.start}–${r.end} · ${days}` : `${r.time} · ${days}`;
  }

  function pageReminders() {
    const perm = notifSupported() ? Notification.permission : 'unsupported';
    const banner = perm === 'granted'
      ? `<div class="banner">${icon('check')}<span>Desktop notifications are <b>on</b>. Reminders also appear inside Thrive.</span><span class="spacer"></span><button class="btn sm ghost" data-action="test-notif">Send test</button></div>`
      : perm === 'denied'
        ? `<div class="banner warn">${icon('bell')}<span>Notifications are blocked in your browser settings. Reminders will still pop up inside Thrive while it's open.</span></div>`
        : perm === 'unsupported'
          ? `<div class="banner warn">${icon('bell')}<span>This browser doesn't support notifications. Reminders will pop up inside Thrive.</span></div>`
          : `<div class="banner">${icon('bell')}<span>Turn on notifications to get reminders even when Thrive is in a background tab.</span><span class="spacer"></span><button class="btn sm" data-action="enable-notif">Enable notifications</button></div>`;
    return `${banner}
    <div class="row between mt-lg"><p class="muted small" style="margin:0">Smart reminders skip themselves when you're already on track — e.g. no water nudges once you've hit your goal, no meal nudge if that meal is logged.</p><button class="btn" data-action="new-reminder">${icon('plus')} New reminder</button></div>
    <section class="card mt">
      ${S.reminders.length ? `<div class="entries">${S.reminders.map((r) => `<div class="entry">
        <label class="switch" title="${r.enabled ? 'On' : 'Off'}"><input type="checkbox" data-change="toggle-reminder" data-id="${esc(r.id)}" ${r.enabled ? 'checked' : ''} aria-label="Enable ${esc(r.label)}"><span></span></label>
        <span class="meal-emoji">${emo(REM_EMO[r.type] || REM_EMO.custom, { size: 28 })}</span><div class="entry-main"><div class="entry-name">${esc(r.label)}</div><div class="entry-sub">${esc(REM_TYPES[r.type] || REM_TYPES.custom)} · ${esc(describeReminder(r))}</div></div>
        <button class="icon-btn plain" data-action="edit-reminder" data-id="${esc(r.id)}" aria-label="Edit">${icon('edit')}</button>
        <button class="icon-btn plain del" data-action="del-reminder" data-id="${esc(r.id)}" aria-label="Delete">${icon('trash')}</button></div>`).join('')}</div>` : '<div class="empty">No reminders yet.</div>'}
    </section>
    <p class="tiny faint mt">Reminders run while Thrive is open (any tab, even in the background). For best results, install Thrive as an app (browser menu → "Install app") and keep it running.</p>`;
  }

  function openReminderForm(r) {
    const isNew = !r;
    r = r || { label: '', type: 'custom', mode: 'time', time: '09:00', every: 60, start: '08:00', end: '21:00', days: ALL_DAYS.slice(), enabled: true, meal: 'breakfast' };
    openModal({
      title: isNew ? 'New reminder' : 'Edit reminder',
      body: `<form data-form="reminder" data-id="${esc(r.id || '')}"><div class="form-grid">
        <label class="field full">Label<input name="label" required maxlength="60" value="${esc(r.label)}" placeholder="e.g. Take vitamin D"></label>
        <label class="field">Type<select name="type" id="rm-type">${Object.entries(REM_TYPES).map(([id, lb]) => `<option value="${id}" ${r.type === id ? 'selected' : ''}>${lb}</option>`).join('')}</select></label>
        <label class="field" id="rm-meal-wrap">Meal<select name="meal">${MEALS.map((m) => `<option value="${m.id}" ${r.meal === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
        <label class="field">Repeat<select name="mode" id="rm-mode"><option value="time" ${r.mode === 'time' ? 'selected' : ''}>At a set time</option><option value="interval" ${r.mode === 'interval' ? 'selected' : ''}>Every few minutes</option></select></label>
        <label class="field rm-time">Time<input name="time" type="time" value="${esc(r.time || '09:00')}"></label>
        <label class="field rm-int">Every<select name="every">${[15, 30, 45, 60, 90, 120, 180, 240].map((v) => `<option value="${v}" ${num(r.every) === v ? 'selected' : ''}>${v} min</option>`).join('')}</select></label>
        <label class="field rm-int">From<input name="start" type="time" value="${esc(r.start || '08:00')}"></label>
        <label class="field rm-int">Until<input name="end" type="time" value="${esc(r.end || '21:00')}"></label>
        <div class="field full"><span>Days</span><div class="daychips">${[1, 2, 3, 4, 5, 6, 0].map((dd) => `<label><input type="checkbox" name="days" value="${dd}" ${(r.days || []).includes(dd) ? 'checked' : ''}><span>${DOW[dd]}</span></label>`).join('')}</div></div>
      </div><div class="form-actions"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn">${icon('check')} Save</button></div></form>`,
      onMount: (m) => {
        const mode = $('#rm-mode', m), type = $('#rm-type', m);
        const upd = () => {
          $$('.rm-time', m).forEach((el) => { el.style.display = mode.value === 'time' ? '' : 'none'; });
          $$('.rm-int', m).forEach((el) => { el.style.display = mode.value === 'interval' ? '' : 'none'; });
          $('#rm-meal-wrap', m).style.display = type.value === 'meal' ? '' : 'none';
        };
        mode.addEventListener('change', upd); type.addEventListener('change', upd); upd();
      },
    });
  }

  // ---------------- Reminder engine ----------------
  let fired = {};
  try { fired = JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') || {}; } catch (e) { fired = {}; }
  const snoozes = [];
  let swReg = null;

  function reminderDue(r, now) {
    if (!r.enabled || !(r.days || []).includes(now.getDay())) return false;
    const m = now.getHours() * 60 + now.getMinutes();
    if (r.mode === 'interval') {
      const s = toMin(r.start), e = toMin(r.end), every = Math.max(5, num(r.every, 60));
      return m >= s && m <= e && (m - s) % every === 0;
    }
    return toMin(r.time) === m;
  }

  function shouldSkip(r) {
    const k = todayKey(), d = getDay(k), t = dayTotals(k), g = goals();
    if (r.type === 'water') return t.water >= g.water;
    if (r.type === 'meal' && r.meal) return d.foods.some((f) => f.meal === r.meal);
    if (r.type === 'weight') return num(d.weight) > 0;
    if (r.type === 'workout') return t.activeMin >= g.activeMin;
    return false;
  }

  function reminderBody(r) {
    const k = todayKey(), t = dayTotals(k), g = goals();
    switch (r.type) {
      case 'water': return `You've had ${fmt(t.water)} of ${fmt(g.water)} ml today. Time for a glass!`;
      case 'meal': return `Log your ${mealLabel(r.meal).toLowerCase()} to keep your nutrition on track. ${fmt(Math.max(0, g.kcal - t.kcal))} kcal left today.`;
      case 'workout': return t.activeMin ? `${t.activeMin} active min so far — ${g.activeMin - t.activeMin} more to hit your goal.` : 'A short walk or workout now keeps your streak going.';
      case 'sleep': return `Start winding down to get your ${g.sleep}h. Dim the lights and put screens away.`;
      case 'weight': return 'Weigh in before breakfast for the most consistent readings.';
      default: return 'Reminder from Thrive.';
    }
  }

  function chime() {
    if (!S.settings.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = chime.ctx || (chime.ctx = new AC());
      if (ctx.state === 'suspended') ctx.resume();
      [660, 880].forEach((f, i) => {
        const o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t0 = ctx.currentTime + i * 0.18;
        gn.gain.setValueAtTime(0.0001, t0);
        gn.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        o.connect(gn).connect(ctx.destination);
        o.start(t0); o.stop(t0 + 0.4);
      });
    } catch (e) { /* audio is optional */ }
  }

  function systemNotify(title, body, url) {
    if (!notifSupported() || Notification.permission !== 'granted') return;
    const opts = { body, icon: 'icon.svg', badge: 'icon.svg', tag: 'thrive-' + slug(title), data: { url } };
    try {
      if (swReg && swReg.showNotification) swReg.showNotification(title, opts);
      else { const n = new Notification(title, opts); n.onclick = () => { window.focus(); if (url) location.hash = url.split('#')[1] || ''; n.close(); }; }
    } catch (e) { console.warn('Notification failed', e); }
  }

  function fireReminder(r) {
    const body = reminderBody(r);
    const route = { water: 'water', meal: 'nutrition', workout: 'activity', sleep: 'sleep', weight: 'body' }[r.type] || 'today';
    systemNotify(r.label, body, `./index.html#/${route}`);
    const actions = [];
    if (r.type === 'water') actions.push({ label: '+250 ml', fn: () => addWater(250, todayKey()) });
    if (r.type === 'meal') actions.push({ label: 'Log now', fn: () => { location.hash = '#/nutrition'; setDate(todayKey()); openFoodModal(r.meal); } });
    if (r.type === 'weight') actions.push({ label: 'Weigh in', fn: () => { location.hash = '#/body'; setDate(todayKey()); } });
    if (r.type === 'workout') actions.push({ label: 'Log workout', fn: () => { location.hash = '#/activity'; setDate(todayKey()); } });
    actions.push({ label: 'Snooze 10 min', fn: () => snoozes.push({ at: Date.now() + 10 * 60000, id: r.id }) });
    toast(body, { title: r.label, type: 'reminder', timeout: 15000, actions });
    chime();
  }

  // Checks every minute since the last check (up to 10), so a reminder is never missed when the
  // browser slows timers down in a background tab or the check lands just after its minute.
  let lastReminderCheck = Date.now() - 60000;
  function checkReminders() {
    const nowMs = Date.now();
    const from = Math.max(lastReminderCheck, nowMs - 10 * 60000);
    lastReminderCheck = nowMs;
    const minutes = [];
    for (let t = Math.floor(from / 60000) * 60000 + 60000; t <= nowMs; t += 60000) minutes.push(new Date(t));
    if (!minutes.length || minutes[minutes.length - 1].getMinutes() !== new Date(nowMs).getMinutes()) minutes.push(new Date(nowMs));
    for (const r of S.reminders) {
      const due = minutes.filter((m) => reminderDue(r, m)).pop();
      if (!due) continue;
      const stamp = `${dkey(due)} ${due.getHours() * 60 + due.getMinutes()}`;
      if (fired[r.id] === stamp) continue;
      fired[r.id] = stamp;
      if (!shouldSkip(r)) fireReminder(r);
    }
    for (let i = snoozes.length - 1; i >= 0; i--) {
      if (Date.now() >= snoozes[i].at) {
        const r = S.reminders.find((x) => x.id === snoozes[i].id);
        snoozes.splice(i, 1);
        if (r) fireReminder(r);
      }
    }
    try { localStorage.setItem(FIRED_KEY, JSON.stringify(fired)); } catch (e) { /* ignore */ }
  }

  function upcomingReminders(limit) {
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes(), dow = now.getDay(), out = [];
    for (const r of S.reminders) {
      if (!r.enabled || !(r.days || []).includes(dow) || shouldSkip(r)) continue;
      let next = null;
      if (r.mode === 'interval') {
        const s = toMin(r.start), e = toMin(r.end), every = Math.max(5, num(r.every, 60));
        const cand = m < s ? s : s + Math.ceil((m + 1 - s) / every) * every;
        if (cand <= e) next = cand;
      } else if (toMin(r.time) > m) next = toMin(r.time);
      if (next != null) out.push({ r, at: next, time: fromMin(next) });
    }
    return out.sort((a, b) => a.at - b.at).slice(0, limit);
  }

  // ------------------------------------------------------------------
  // Page: Settings
  // ------------------------------------------------------------------
  function profileFormHtml(p, submitLabel, onboarding = false) {
    p = p || {};
    return `<form data-form="profile"><div class="form-grid">
      <label class="field full">Your name (optional)<input name="name" maxlength="40" value="${esc(p.name || '')}" placeholder="e.g. Alex" autocomplete="given-name"></label>
      <label class="field">Sex (for BMR)<select name="sex"><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option></select></label>
      <label class="field">Age<input name="age" type="number" min="13" max="100" value="${esc(p.age || '')}" required></label>
      <label class="field">Height (cm)<input name="height" type="number" min="100" max="250" step="0.5" value="${esc(p.height || '')}" required></label>
      <label class="field">Weight (kg)<input name="weight" type="number" min="25" max="400" step="0.1" value="${esc(p.weight || '')}" required></label>
      <label class="field">Goal weight (kg)<input name="targetWeight" type="number" min="25" max="400" step="0.1" value="${esc(p.targetWeight || '')}"></label>
      <label class="field full">Activity level<select name="activity">${Object.entries(ACTIVITY_LEVELS).map(([id, v]) => `<option value="${id}" ${(p.activity || 'light') === id ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      <label class="field full">Goal<select name="goal">${Object.entries(GOALS).map(([id, v]) => `<option value="${id}" ${(p.goal || 'maintain') === id ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    </div><div class="form-actions">${onboarding ? `<button type="button" class="btn ghost" data-action="onboard-sample">${icon('sparkle')} Explore with sample data</button><button type="button" class="btn ghost" data-action="skip-onboarding">Skip</button>` : ''}<button class="btn">${icon('check')} ${submitLabel}</button></div></form>`;
  }

  function pageSettings() {
    const g = goals(), a = g.auto, o = S.goalsOverride || {};
    const gf = (key, label, unit, step = 1) => `<label class="field">${label} (${unit})<input name="${key}" type="number" min="0" step="${step}" value="${o[key] ? esc(o[key]) : ''}" placeholder="Auto: ${fmt(a[key], step < 1 ? 1 : 0)}"></label>`;
    const usage = (() => { try { return round((localStorage.getItem(STORE_KEY) || '').length / 1024, 1); } catch (e) { return 0; } })();
    return `
    <div class="grid two">
      <section class="card">
        <div class="card-head"><h3>${icon('smile')} Profile</h3></div>
        ${S.profile && S.profile.skipped ? `<div class="banner" style="margin-bottom:14px">${icon('sparkle')}<span>You're using standard targets. Enter your details for targets that fit you.</span></div>` : ''}
        ${profileFormHtml(S.profile && S.profile.skipped ? null : S.profile, 'Save profile')}
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('target')} Daily goals</h3><span class="sub">Leave blank to use smart defaults</span></div>
        <p class="small muted">Calculated from your profile with the Mifflin-St Jeor equation: BMR ${fmt(a.bmr)} kcal × activity = ${fmt(a.tdee)} kcal maintenance.</p>
        <form data-form="goals"><div class="form-grid">
          ${gf('kcal', 'Calories', 'kcal')}${gf('p', 'Protein', 'g')}${gf('c', 'Carbs', 'g')}${gf('f', 'Fat', 'g')}${gf('fi', 'Fiber', 'g')}
          ${gf('water', 'Water', 'ml')}${gf('sleep', 'Sleep', 'h', 0.5)}${gf('steps', 'Steps', 'steps')}${gf('activeMin', 'Active', 'min')}
          ${gf('na', 'Sodium limit', 'mg')}${gf('su', 'Sugar limit', 'g')}
        </div><div class="form-actions"><button type="button" class="btn ghost" data-action="reset-goals">Reset to auto</button><button class="btn">${icon('check')} Save goals</button></div></form>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('settings')} Preferences</h3></div>
        <div class="stack">
          <label class="row between"><span><b>Theme</b><br><span class="small muted">Follow your device or pick one</span></span>
            <select data-change="theme" style="width:auto">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${S.settings.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <div class="row between"><span><b>Add exercise calories to budget</b><br><span class="small muted">Off by default — your activity level already counts daily movement.</span></span>
            <label class="switch"><input type="checkbox" data-change="eatback" ${S.settings.eatBackExercise ? 'checked' : ''} aria-label="Add exercise calories"><span></span></label></div>
          <div class="row between"><span><b>Reminder sound</b><br><span class="small muted">Soft chime when a reminder fires</span></span>
            <label class="switch"><input type="checkbox" data-change="sound" ${S.settings.sound ? 'checked' : ''} aria-label="Reminder sound"><span></span></label></div>
          <div class="row between"><span><b>Haptic feedback</b><br><span class="small muted">A light vibration when you log something (supported phones)</span></span>
            <label class="switch"><input type="checkbox" data-change="haptics" ${S.settings.haptics ? 'checked' : ''} aria-label="Haptic feedback"><span></span></label></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h3>${icon('download')} Your data</h3><span class="sub">${usage} KB stored on this device</span></div>
        <p class="small muted">Everything stays private in this browser. Export regularly to keep a backup or move to another device.</p>
        <div class="row">
          <button class="btn ghost" data-action="export-json">${icon('download')} Backup (JSON)</button>
          <button class="btn ghost" data-action="export-csv">${icon('download')} Export CSV</button>
          <label class="btn ghost">${icon('upload')} Restore backup<input type="file" accept="application/json,.json" data-change="import" hidden></label>
        </div>
        <div class="row mt-lg">
          ${hasSample() ? `<button class="btn ghost" data-action="remove-sample">${icon('x')} Remove sample data</button>` : `<button class="btn ghost" data-action="demo">${icon('sparkle')} Load 90 days of sample data</button>`}
          <button class="btn danger ghost" data-action="reset-all">${icon('trash')} Erase everything</button>
        </div>
      </section>
    </div>
    <p class="tiny faint mt">Thrive provides general wellness information, not medical advice. Food values are approximate averages. Consult a professional for medical or dietary conditions.</p>`;
  }

  function applyTheme() {
    const t = S.settings.theme;
    const dark = t === 'dark' || (t === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0e0e0c' : '#f3f2ec');
    const tb = $('#theme-btn');
    if (tb) { tb.innerHTML = icon(dark ? 'sun' : 'moon'); tb.setAttribute('data-tip', dark ? 'Light mode' : 'Dark mode'); }
  }

  function exportCSV() {
    const keys = Object.keys(S.days).sort();
    const head = ['date', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'vitamin_c_mg', 'water_ml', 'steps', 'active_min', 'burned_kcal', 'sleep_h', 'sleep_quality', 'weight_kg', 'mood', 'energy', 'mindful_min', 'habits_done', 'health_score'];
    const lines = [head.join(',')];
    for (const k of keys) {
      const t = dayTotals(k), hs = healthScore(k);
      lines.push([k, round(t.kcal), round(t.p, 1), round(t.c, 1), round(t.f, 1), round(t.fi, 1), round(t.su, 1), round(t.na), round(t.kp), round(t.ca), round(t.fe, 1), round(t.vc), t.water, t.steps, t.activeMin, t.burned,
        t.sleep != null ? round(t.sleep, 2) : '', t.sleepQ || '', t.weight || '', t.mood || '', t.energy || '', t.mindful || '', t.habits, hs ? hs.score : ''].join(','));
    }
    download(`thrive-export-${todayKey()}.csv`, lines.join('\n'), 'text/csv');
  }

  const hasSample = () => Object.values(S.days).some((d) => d.sample) || S.fasting.history.some((f) => f.sample) || S.customFoods.some((f) => f.sample) || S.reminders.some((r) => r.sample) || !!(S.fasting.active && S.fasting.active.sample);

  // Removes only sample entries; anything the user logged themselves stays.
  function removeSample() {
    let n = 0;
    for (const k of Object.keys(S.days)) if (S.days[k].sample) { delete S.days[k]; n++; }
    S.fasting.history = S.fasting.history.filter((f) => !f.sample);
    if (S.fasting.active && S.fasting.active.sample) S.fasting.active = null;
    const sampleFoods = new Set(S.customFoods.filter((f) => f.sample).map((f) => f.id));
    S.customFoods = S.customFoods.filter((f) => !f.sample);
    S.favorites = S.favorites.filter((id) => !sampleFoods.has(id));
    S.recentFoods = S.recentFoods.filter((id) => !sampleFoods.has(id));
    S.reminders = S.reminders.filter((r) => !r.sample);
    save(); render();
    toast(`Removed sample data (${plural(n, 'day')}). Your own entries are untouched.`, 'success');
  }

  // 90 days of realistic data that fills every feature, with a gentle improvement
  // trend so Insights, the weekly report and correlations have something to show.
  function loadDemo() {
    const DAYS = 90;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const MENU = {
      breakfast: [['Oats (dry)', 'Banana', 'Milk (whole)'], ['Egg (whole, boiled)', 'Whole wheat bread', 'Coffee (black)'], ['Idli', 'Sambar', 'Chai (milk & sugar)'], ['Poha', 'Chai (milk & sugar)'], ['Greek yogurt (plain, nonfat)', 'Blueberries', 'Almonds'], ['Dosa (plain)', 'Sambar']],
      lunch: [['White rice (cooked)', 'Dal (tadka)', 'Mixed salad greens'], ['Roti / chapati', 'Chicken curry', 'Curd / dahi (whole milk)'], ['Brown rice (cooked)', 'Rajma masala'], ['Chicken breast (cooked)', 'Quinoa (cooked)', 'Broccoli'], ['Roti / chapati', 'Palak paneer', 'Cucumber']],
      dinner: [['Roti / chapati', 'Vegetable curry (sabzi)', 'Dal (tadka)'], ['Salmon (cooked)', 'Sweet potato (baked)', 'Green beans'], ['Chicken biryani', 'Curd / dahi (whole milk)'], ['Khichdi', 'Curd / dahi (whole milk)'], ['Pasta (cooked)', 'Chicken breast (cooked)', 'Tomato'], ['Tofu (firm)', 'White rice (cooked)', 'Broccoli']],
      snack: [['Apple', 'Peanut butter'], ['Whey protein powder', 'Banana'], ['Almonds'], ['Dark chocolate (70-85%)'], ['Samosa', 'Chai (milk & sugar)'], ['Orange'], ['Protein bar']],
    };
    const g = goals();
    let w = currentWeight() + 4.5;
    let bf = 27 + rnd(-2, 2), waist = 92 + rnd(-3, 3);
    let added = 0;

    // Two homemade recipes in "My foods" (so custom foods, favorites and recents all have data).
    const recipe = (name, unit, sg, per) => {
      let f = S.customFoods.find((x) => x.name === name);
      if (!f) {
        const nn = {};
        for (const k of NKEYS) nn[k] = round(((per[k] || 0) * 100) / sg, 3);
        f = { id: 'c:' + uid(), name, cat: 'My foods', unit, sg, n: nn, custom: true, sample: true };
        S.customFoods.push(f);
      }
      return f;
    };
    const smoothie = recipe('Protein smoothie (homemade)', '1 glass', 350, { kcal: 320, p: 30, c: 34, f: 7, fi: 5, su: 22, na: 160, kp: 780, ca: 420, fe: 1.6, vc: 12 });
    const pulao = recipe("Mom's veg pulao", '1 plate', 300, { kcal: 420, p: 10, c: 68, f: 12, fi: 6, su: 4, na: 520, kp: 380, ca: 60, fe: 2.4, vc: 14 });
    const logEntry = (d, f, meal, qty, time) => {
      const grams = qty * f.sg, nn = scaleFood(f, grams);
      const e = { id: uid(), foodId: f.id, name: f.name, meal, grams: round(grams, 1), qty, mode: 'serving', qtyLabel: `${qty} × ${f.unit} (${fmt(grams)} g)`, time };
      for (const key of NKEYS) e[key] = round(nn[key], 2);
      d.foods.push(e);
    };
    const QUICK = [['Restaurant dinner', 'dinner', 850, 32, 90, 38], ['Office party snacks', 'snack', 420, 8, 48, 22], ['Street food chaat', 'snack', 360, 9, 52, 13], ['Wedding buffet', 'dinner', 1100, 38, 120, 52]];
    const WORKOUT_NOTES = ['5 km in 28 min', 'Felt strong today', 'Easy recovery pace', 'New route by the lake', 'With a friend', ''];
    const SLEEP_NOTES = ['Late coffee', 'Vivid dreams', 'Woke up refreshed', 'Neighbours were loud', 'Read before bed', ''];
    for (let i = DAYS; i >= 1; i--) {
      const k = addDays(todayKey(), -i);
      if (dayHasData(S.days[k])) continue;
      const d = emptyDay();
      d.sample = true;
      const prog = (DAYS - i) / DAYS; // 0 → 1 over the period: habits get better
      const weekend = [0, 6].includes(parseKey(k).getDay());
      const dayTarget = g.kcal * rnd(0.85, 1.12) * (weekend ? 1.12 : 1);
      for (const m of MEALS) {
        if (m.id === 'snack' && Math.random() < 0.35) continue;
        const foods = pick(MENU[m.id]).map(findFoodByName).filter(Boolean);
        const per = foods.map((f) => (f.n.kcal * f.sg) / 100);
        const totalPer = sum(per) || 1;
        const factor = (dayTarget * m.share) / totalPer;
        foods.forEach((f) => {
          const qty = Math.max(0.5, Math.round(factor * 2) / 2);
          const grams = qty * f.sg;
          const n = scaleFood(f, grams);
          const e = { id: uid(), foodId: f.id, name: f.name, meal: m.id, grams: round(grams, 1), qty, mode: 'serving', qtyLabel: `${qty} × ${f.unit} (${fmt(grams)} g)`, time: fromMin(toMin({ breakfast: '08:30', lunch: '13:30', dinner: '20:00', snack: '17:00' }[m.id]) + Math.round(rnd(-30, 30))) };
          for (const key of NKEYS) e[key] = round(n[key], 2);
          d.foods.push(e);
        });
      }
      if (Math.random() < 0.25) logEntry(d, smoothie, 'snack', 1, fromMin(16 * 60 + Math.round(rnd(0, 90))));
      if (Math.random() < 0.12) logEntry(d, pulao, 'lunch', 1, fromMin(13 * 60 + Math.round(rnd(0, 60))));
      if (Math.random() < 0.08) {
        const [name, meal, kcal, p, c, f] = pick(QUICK), e = { id: uid(), quick: true, name, meal, grams: 0, time: meal === 'dinner' ? '20:45' : '17:30' };
        for (const key of NKEYS) e[key] = 0;
        Object.assign(e, { kcal, p, c, f });
        d.foods.push(e);
      }
      const glasses = Math.round(rnd(5, 11) + prog * 3);
      for (let j = 0; j < glasses; j++) d.water.push({ id: uid(), ml: 250, time: fromMin(7 * 60 + j * 70 + Math.round(rnd(0, 40))) });
      const hours = clamp(rnd(5.6, 8.2) + prog * 0.5 + (weekend ? 0.7 : 0), 4, 10);
      const bed = fromMin(22 * 60 + Math.round(rnd(0, 120)) + (weekend ? 45 : 0));
      const wake = fromMin(toMin(bed) + Math.round(hours * 60));
      d.sleep = { bed, wake, hours: round(sleepHours(bed, wake), 2), quality: clamp(Math.round(hours - 3.5 + rnd(-1, 1)), 1, 5), awake: Math.round(rnd(0, 2.4)), notes: Math.random() < 0.15 ? pick(SLEEP_NOTES) : '' };
      d.steps = Math.round(rnd(3500, 11000) + prog * 2000);
      if (Math.random() < 0.5 + prog * 0.2) {
        const [type, met] = pick(ACTIVITIES.slice(0, 15));
        const minutes = Math.round(rnd(25, 60) / 5) * 5;
        const intensity = pick(['light', 'moderate', 'moderate', 'vigorous']);
        d.workouts.push({ id: uid(), type, minutes, intensity, met, kcal: workoutKcal(met, intensity, minutes, w), notes: Math.random() < 0.3 ? pick(WORKOUT_NOTES) : '', time: fromMin(18 * 60 + Math.round(rnd(-60, 60))) });
        if (type === 'Strength training' || Math.random() < 0.15) {
          const prs = [['Bench press', 40], ['Squat', 60], ['Deadlift', 80], ['Overhead press', 25]];
          prs.forEach(([name, base]) => d.strength.push({ id: uid(), name, sets: 3, reps: pick([5, 8, 8, 10]), weight: round(base + (DAYS - i) * 0.22 + rnd(-2, 2), 1) }));
          d.strength.push({ id: uid(), name: 'Pull-up', sets: 3, reps: Math.round(4 + prog * 5 + rnd(0, 2)), weight: 0 });
        }
      }
      w = w - 0.05 + rnd(-0.25, 0.25);
      if (Math.random() < 0.7) {
        d.weight = round(w, 1);
        bf = bf - 0.025 + rnd(-0.15, 0.15); waist = waist - 0.04 + rnd(-0.2, 0.2);
        if (Math.random() < 0.35) d.body = { bf: round(bf, 1), waist: round(waist, 1) };
      }
      d.mood = clamp(Math.round(hours - 4 + rnd(-1, 1.2)), 1, 5);
      d.energy = clamp(Math.round(hours - 4.2 + rnd(-1, 1.4)), 1, 5);
      if (Math.random() < 0.12) d.notes = pick(['Slept badly, late coffee.', 'Great workout today!', 'Busy day at work, ate out.', 'Felt really energetic.', 'Headache in the evening.']);
      S.habits.forEach((h) => { if (Math.random() < 0.45 + prog * 0.4) d.habits[h.id] = true; });
      if (Math.random() < 0.25 + prog * 0.35) d.mindful = pick([1, 3, 5]);
      if (Math.random() < 0.3) {
        const end = parseKey(k).getTime() + (12 + rnd(0, 2)) * HOUR, target = pick([13, 16, 16, 18]);
        S.fasting.history.push({ id: uid(), start: end - (target + rnd(-2.5, 1.5)) * HOUR, end, target, sample: true });
      }
      S.days[k] = d;
      added++;
    }
    // Today: only things that could already have happened by now, so nothing is "in the future".
    const tk = todayKey(), nowM = toMin(nowHM());
    const at = (hm) => (toMin(hm) <= nowM ? hm : null);
    if (!dayHasData(S.days[tk])) {
      const d = emptyDay();
      d.sample = true;
      const wake = fromMin(Math.min(nowM, 6 * 60 + 40 + Math.round(rnd(0, 30))));
      const bed = fromMin(toMin(wake) - Math.round(rnd(7.1, 8.1) * 60));
      d.sleep = { bed, wake, hours: round(sleepHours(bed, wake), 2), quality: 4, awake: 1, notes: 'Woke up refreshed' };
      if (at('08:15')) ['Oats (dry)', 'Banana', 'Milk (whole)'].map(findFoodByName).filter(Boolean).forEach((f) => logEntry(d, f, 'breakfast', 1, '08:15'));
      if (at('13:20')) ['Roti / chapati', 'Dal (tadka)', 'Mixed salad greens'].map(findFoodByName).filter(Boolean).forEach((f) => logEntry(d, f, 'lunch', f.name.startsWith('Roti') ? 2 : 1, '13:20'));
      if (at('16:30')) logEntry(d, smoothie, 'snack', 1, '16:30');
      ['07:10', '09:45', '11:30', '14:10', '16:00', '18:20'].filter(at).forEach((t, j) => d.water.push({ id: uid(), ml: j === 1 ? 500 : 250, time: t }));
      d.steps = Math.round(clamp((nowM - 7 * 60) / (14 * 60), 0.05, 1) * 7200);
      if (at('07:30')) d.workouts.push({ id: uid(), type: 'Brisk walking', minutes: 20, intensity: 'moderate', met: 4.3, kcal: workoutKcal(4.3, 'moderate', 20, w), notes: 'Morning walk', time: '07:30' });
      d.mood = 4; d.energy = 4; d.mindful = at('07:00') ? 3 : 0;
      S.habits.slice(0, 2).forEach((h) => { d.habits[h.id] = true; });
      d.notes = 'Feeling good. Trying to hit protein today.';
      S.days[tk] = d;
      added++;
    }
    // A fast that is running right now (≈90 min from its goal), so the live timer is visible.
    if (!S.fasting.active) S.fasting.active = { start: Date.now() - 14.5 * HOUR, target: 16, notified: false, sample: true };
    // Favorites + recents, and one extra reminder type, so those lists aren't empty.
    for (const id of [smoothie.id, 'db:greek-yogurt-plain-nonfat', 'db:banana', 'db:dal-tadka']) if (findFood(id) && !S.favorites.includes(id)) S.favorites.push(id);
    [pulao.id, smoothie.id].forEach(pushRecent);
    if (!S.reminders.some((r) => r.type === 'medication')) S.reminders.push({ id: uid(), label: 'Take vitamin D', type: 'medication', mode: 'time', time: '09:00', days: ALL_DAYS.slice(), enabled: true, sample: true });
    S.fasting.history.sort((a, b) => a.end - b.end);
    if (S.fasting.history.length > 200) S.fasting.history = S.fasting.history.slice(-200);
    save();
    curDate = todayKey(); followToday = true; forceAnim = true;
    render();
    if (added) celebrate();
    toast(added ? `${added} days of sample data added. Open Insights to see the analysis. Remove it anytime in Settings.` : 'Every recent day already has your data, so nothing was added.', {
      title: added ? 'Sample data loaded' : '', emoji: added ? '✨' : '', type: 'success', timeout: 7000,
      actions: added ? [{ label: 'Open Insights', fn: () => { location.hash = '#/insights'; } }, { label: 'Undo', fn: () => removeSample() }] : [],
    });
  }

  // ------------------------------------------------------------------
  // Command palette & shortcuts
  // ------------------------------------------------------------------
  let CK = null;
  function commands() {
    return [
      { label: 'Log food', hint: 'F', icon: 'food', run: () => openFoodModal() },
      { label: 'Add 250 ml water', hint: 'W', icon: 'water', run: () => addWater(250) },
      { label: 'Add 500 ml water', icon: 'water', run: () => addWater(500) },
      { label: 'Quick add calories', icon: 'flame', run: () => { FM = null; openQuickAdd(); } },
      { label: 'Create custom food', icon: 'plus', run: () => openCustomFood() },
      { label: 'Log workout', icon: 'activity', run: () => gotoFocus('activity', '#wo-type') },
      { label: 'Log sleep', icon: 'moon', run: () => gotoFocus('sleep', 'input[name=bed]') },
      { label: 'Log weight', icon: 'scale', run: () => gotoFocus('body', 'input[name=weight]') },
      { label: S.fasting.active ? 'End fast' : `Start ${S.settings.fastTarget}-hour fast`, icon: 'timer', run: () => (S.fasting.active ? endFast() : startFast()) },
      { label: 'Guided breathing', hint: 'B', icon: 'wind', run: () => openBreathe() },
      { label: 'Edit habits', icon: 'list', run: () => openHabits() },
      { label: 'New reminder', icon: 'bell', run: () => { location.hash = '#/reminders'; openReminderForm(null); } },
      ...ROUTES.map((r, i) => ({ label: `Go to ${r.label}`, hint: String(i + 1), icon: r.icon, run: () => { location.hash = '#/' + r.id; } })),
      { label: 'Jump to today', hint: 'T', icon: 'calendar', run: () => setDate(todayKey()) },
      { label: 'Toggle light / dark theme', icon: 'sun', run: () => toggleTheme() },
      { label: 'Keyboard shortcuts', hint: '?', icon: 'command', run: () => openShortcuts() },
      { label: 'Export backup (JSON)', icon: 'download', run: () => actions['export-json']() },
    ];
  }

  function openCmdk() {
    CK = { q: '', i: 0, items: [] };
    openModal({
      title: 'Search & commands', wide: true,
      body: `<div class="fm-search">${icon('search')}<input id="ck-q" type="search" placeholder="Type a command or a food, e.g. water, oats, sleep" autocomplete="off"></div>
        <div id="ck-list" class="ck-list" role="listbox"></div>
        <div class="tiny muted mt"><kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to run · <kbd>Esc</kbd> to close</div>`,
    });
    const inp = $('#ck-q');
    inp.addEventListener('input', () => { CK.q = inp.value; CK.i = 0; ckRender(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); CK.i = Math.min(CK.items.length - 1, CK.i + 1); ckRender(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); CK.i = Math.max(0, CK.i - 1); ckRender(); }
      else if (e.key === 'Enter') { e.preventDefault(); ckRun(CK.i); }
    });
    ckRender();
  }

  function ckRender() {
    const q = CK.q.trim().toLowerCase(), terms = q.split(/\s+/).filter(Boolean);
    const match = (txt) => terms.every((t) => txt.toLowerCase().includes(t));
    let items = commands().filter((c) => !terms.length || match(c.label));
    if (q.length >= 2) {
      items = items.concat(allFoods().filter((f) => match(f.name)).slice(0, 6).map((f) => ({
        label: `Log ${f.name}`, sub: `${f.unit} · ${fmt((f.n.kcal * f.sg) / 100)} kcal`, icon: 'food',
        run: () => { FM = { meal: guessMeal(), q: '', filter: 'all' }; openModal({ title: 'Add food', body: '<div id="fm"></div>', wide: true }); fmDetail(f); },
      })));
    }
    CK.items = items.slice(0, 14);
    CK.i = clamp(CK.i, 0, Math.max(0, CK.items.length - 1));
    const list = $('#ck-list');
    if (!list) return;
    list.innerHTML = CK.items.length
      ? CK.items.map((c, i) => `<div class="ck-item ${i === CK.i ? 'active' : ''}" data-action="ck-run" data-i="${i}" role="option" aria-selected="${i === CK.i}">${icon(c.icon)}<span class="ck-label">${esc(c.label)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span>${c.hint ? `<kbd>${esc(c.hint)}</kbd>` : ''}</div>`).join('')
      : '<div class="empty" style="border:0">No matches</div>';
    const act = $('.ck-item.active', list);
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }

  function ckRun(i) {
    const c = CK && CK.items[i];
    if (!c) return;
    closeModal();
    c.run();
  }

  function openShortcuts() {
    const rows = [['Ctrl / ⌘ + K', 'Search foods & run commands'], ['/', 'Open command palette'], ['F', 'Log food'], ['W', 'Add 250 ml water'], ['B', 'Guided breathing'], ['← / →  (or swipe on phones)', 'Previous / next day'], ['T', 'Jump to today'], ['1 – 9', 'Switch pages'], ['?', 'Show this help'], ['Esc', 'Close dialogs and menus']];
    openModal({ title: 'Keyboard shortcuts', body: `<table class="table"><tbody>${rows.map(([k, v]) => `<tr><td style="width:40%"><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` });
  }

  function toggleTheme() {
    S.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    save();
    applyTheme();
    if (currentRoute().id === 'settings') render();
  }

  // ------------------------------------------------------------------
  // Onboarding
  // ------------------------------------------------------------------
  function openOnboarding() {
    openModal({
      title: 'Welcome to Thrive 👋',
      dismissable: false,
      body: `<p class="muted">Answer a few quick questions and Thrive sets personal targets for calories, protein, water, sleep and activity. It takes about 20 seconds, and you can change everything later in Settings.</p>${profileFormHtml(null, "Let's go", true)}`,
    });
  }

  // ------------------------------------------------------------------
  // Event handling
  // ------------------------------------------------------------------
  const removeById = (arr, id) => arr.filter((x) => x.id !== id);
  // Delete instantly, offer Undo (faster than an "Are you sure?" dialog).
  function removeWithUndo(list, id, name) {
    const k = curDate, d = editDay(k), idx = d[list].findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [item] = d[list].splice(idx, 1);
    save(); render();
    toast(`Removed ${name(item)}`, { actions: [{ label: 'Undo', fn: () => { const x = editDay(k); x[list].splice(Math.min(idx, x[list].length), 0, item); save(); render(); } }] });
  }

  const actions = {
    'close-modal': () => closeModal(),
    'skip-onboarding': (el, e, quiet) => {
      S.profile = { name: '', sex: 'female', age: 30, height: 165, weight: 65, startWeight: 65, targetWeight: null, activity: 'light', goal: 'maintain', skipped: true };
      save(); closeModal(); render();
      if (!quiet) toast('Using standard targets for now. Personalise them anytime in Settings → Profile.', { title: 'Welcome to Thrive!', emoji: '👋', type: 'success', timeout: 7000, actions: [{ label: 'Personalise', fn: () => { location.hash = '#/settings'; } }] });
    },
    'goto-date': (el) => { if (!currentRoute().dated) location.hash = '#/today'; setDate(el.dataset.k); },
    'sugg-add': (el) => { const f = findFood(el.dataset.id); if (f) logFoodQuick(f, 1, guessMeal()); },
    goto: (el) => gotoFocus(el.dataset.route, el.dataset.focus),
    cmdk: () => openCmdk(),
    'ck-run': (el) => ckRun(num(el.dataset.i)),
    'toggle-theme': () => toggleTheme(),
    'fab-toggle': () => toggleFab(),
    'date-prev': () => setDate(addDays(curDate, -1)),
    'date-next': () => setDate(addDays(curDate, 1)),
    'date-today': () => setDate(todayKey()),
    'add-food': (el) => openFoodModal(el.dataset.meal),
    'fm-filter': (el) => { FM.filter = el.dataset.f; fmSearch(); },
    'fm-pick': (el) => { const f = findFood(el.dataset.id); if (f) fmDetail(f); },
    'fm-back': () => fmSearch(),
    'fm-quick': () => openQuickAdd(),
    fav: (el) => {
      const id = el.dataset.id;
      S.favorites = S.favorites.includes(id) ? S.favorites.filter((x) => x !== id) : S.favorites.concat(id);
      save();
      if ($('#fm-results')) $('#fm-results').innerHTML = fmResultsHtml();
    },
    'new-custom-food': () => openCustomFood(),
    'del-custom-food': (el) => {
      const i = S.customFoods.findIndex((x) => x.id === el.dataset.id);
      if (i < 0) return;
      const f = S.customFoods[i], favs = S.favorites.slice(), recents = S.recentFoods.slice();
      S.customFoods = removeById(S.customFoods, f.id);
      S.favorites = S.favorites.filter((x) => x !== f.id);
      S.recentFoods = S.recentFoods.filter((x) => x !== f.id);
      save(); render();
      toast(`Deleted "${f.name}" from My foods. Past log entries are kept.`, { actions: [{ label: 'Undo', fn: () => { S.customFoods.splice(Math.min(i, S.customFoods.length), 0, f); S.favorites = favs; S.recentFoods = recents; save(); render(); } }] });
    },
    'edit-food-entry': (el) => {
      const e = getDay(curDate).foods.find((x) => x.id === el.dataset.id);
      if (!e) return;
      const f = findFood(e.foodId);
      if (!f) return toast('This food was deleted from My foods, so it can only be removed.', 'error');
      FM = { meal: e.meal, q: '', filter: 'all' };
      openModal({ title: 'Edit entry', body: '<div id="fm"></div>', wide: true });
      fmDetail(f, e);
    },
    'del-food-entry': (el) => {
      const d = editDay(curDate);
      const idx = d.foods.findIndex((x) => x.id === el.dataset.id);
      if (idx < 0) return;
      const [removed] = d.foods.splice(idx, 1);
      save(); render();
      toast(`Removed ${removed.name}`, { actions: [{ label: 'Undo', fn: () => { editDay(curDate).foods.splice(idx, 0, removed); save(); render(); } }] });
    },
    'copy-meal': (el) => {
      const meal = el.dataset.meal;
      const src = getDay(addDays(curDate, -1)).foods.filter((f) => f.meal === meal);
      if (!src.length) return;
      const d = editDay(curDate);
      src.forEach((f) => d.foods.push(Object.assign({}, f, { id: uid(), time: nowHM() })));
      save(); render();
      toast(`Copied ${plural(src.length, 'item')} from yesterday's ${mealLabel(meal).toLowerCase()}`, 'success');
    },
    water: (el) => addWater(el.dataset.ml),
    'del-water': (el) => removeWithUndo('water', el.dataset.id, (w) => `${fmt(w.ml)} ml water`),
    'del-workout': (el) => removeWithUndo('workouts', el.dataset.id, (w) => w.type),
    'del-strength': (el) => removeWithUndo('strength', el.dataset.id, (s) => s.name),
    'repeat-workout': (el) => {
      const src = recentWorkouts()[num(el.dataset.i)];
      if (!src) return;
      const before = snap(curDate);
      const kcal = workoutKcal(src.met, src.intensity, src.minutes, currentWeight(curDate));
      const entry = { id: uid(), type: src.type, minutes: src.minutes, intensity: src.intensity, met: src.met, kcal, notes: '', time: nowHM() };
      editDay(curDate).workouts.push(entry);
      save(); render(); buzz();
      toast(`Logged ${entry.type} · ${entry.minutes} min · ${fmt(entry.kcal)} kcal`, { emoji: '💪', type: 'success', actions: [{ label: 'Undo', fn: () => { const d = editDay(curDate); d.workouts = removeById(d.workouts, entry.id); save(); render(); } }] });
      celebrateDiff(curDate, before);
    },
    'del-sleep': () => {
      const d = editDay(curDate), old = d.sleep, k = curDate;
      if (!old) return;
      d.sleep = null; save(); render();
      toast('Sleep entry removed', { actions: [{ label: 'Undo', fn: () => { editDay(k).sleep = old; save(); render(); } }] });
    },
    'del-weight': () => {
      const d = editDay(curDate), k = curDate, w = d.weight, b = d.body;
      d.weight = null; d.body = null; save(); render();
      toast('Measurements removed', { actions: [{ label: 'Undo', fn: () => { const x = editDay(k); x.weight = w; x.body = b; save(); render(); } }] });
    },
    'set-mood': (el) => { const d = editDay(curDate), v = num(el.dataset.v); d.mood = d.mood === v ? null : v; save(); render(); buzz(); },
    'set-energy': (el) => { const d = editDay(curDate), v = num(el.dataset.v); d.energy = d.energy === v ? null : v; save(); render(); buzz(); },
    'toggle-habit': (el) => {
      const id = el.dataset.id, d = editDay(curDate), total = S.habits.length;
      const wasAll = total > 0 && habitsDone(d) === total;
      if (d.habits[id]) delete d.habits[id]; else { d.habits[id] = true; buzz(); }
      save(); render();
      const btn = $$('.habit').find((b) => b.dataset.id === id);
      if (btn && d.habits[id]) btn.classList.add('just');
      if (!wasAll && total > 0 && habitsDone(d) === total) { celebrate(); toast('Every habit done. This is how streaks are built.', { title: 'All habits complete', emoji: '🥳', type: 'success' }); }
    },
    'manage-habits': () => openHabits(),
    'habit-idea': (el) => { const v = String(el.dataset.v || ''), i = v.indexOf(' '); addHabit(v.slice(0, i), v.slice(i + 1)); },
    'del-habit': (el) => {
      const i = S.habits.findIndex((h) => h.id === el.dataset.id);
      if (i < 0) return;
      const [h] = S.habits.splice(i, 1);
      save(); habitsModalRender(); render();
      toast(`Removed "${h.name}"`, { actions: [{ label: 'Undo', fn: () => { S.habits.splice(Math.min(i, S.habits.length), 0, h); save(); habitsModalRender(); render(); } }] });
    },
    'fast-preset': (el) => { S.settings.fastTarget = clamp(num(el.dataset.v, 16), 1, 72); save(); render(); },
    'fast-start': () => startFast(),
    'fast-end': () => endFast(),
    'fast-toggle': () => (S.fasting.active ? endFast() : startFast()),
    'fast-edit': () => openFastEdit(),
    'fast-cancel': () => {
      const a = S.fasting.active;
      if (!a) return closeModal();
      S.fasting.active = null; save(); closeModal(); render();
      toast('Fast discarded', { actions: [{ label: 'Undo', fn: () => { S.fasting.active = a; save(); render(); } }] });
    },
    breathe: () => openBreathe(),
    'br-pattern': (el) => { if (BR && BREATH[el.dataset.v]) { BR.pattern = el.dataset.v; breathRender(); } },
    'br-mins': (el) => { if (BR) { BR.mins = num(el.dataset.v, 1); breathRender(); } },
    'br-start': () => startBreath(),
    'br-stop': () => {
      if (!BR) return;
      const mins = Math.floor((Date.now() - BR.t0) / 30000) / 2; // whole half-minutes
      stopBreath();
      if (mins >= 1) { logMindful(mins); breathRender(mins); toast(`${fmt(mins, 1)} mindful minutes added to today.`, 'success'); }
      else breathRender();
    },
    'ins-range': (el) => { insRange = num(el.dataset.v, 30); render(); },
    'new-reminder': () => openReminderForm(null),
    'edit-reminder': (el) => { const r = S.reminders.find((x) => x.id === el.dataset.id); if (r) openReminderForm(r); },
    'del-reminder': (el) => {
      const i = S.reminders.findIndex((x) => x.id === el.dataset.id);
      if (i < 0) return;
      const [r] = S.reminders.splice(i, 1);
      save(); render();
      toast(`Deleted reminder "${r.label}"`, { actions: [{ label: 'Undo', fn: () => { S.reminders.splice(Math.min(i, S.reminders.length), 0, r); save(); render(); } }] });
    },
    'enable-notif': async () => {
      if (!notifSupported()) return;
      try { await Notification.requestPermission(); } catch (e) { /* older Safari uses callbacks */ }
      render();
      if (Notification.permission === 'granted') { systemNotify('Notifications enabled', "You'll get Thrive reminders here.", './index.html#/reminders'); chime(); }
    },
    'test-notif': () => { systemNotify('Test reminder 💧', 'This is how Thrive reminders look.', './index.html#/reminders'); toast('This is how reminders look inside Thrive.', { title: 'Test reminder 💧', type: 'reminder' }); chime(); },
    'reset-goals': () => { S.goalsOverride = {}; save(); render(); toast('Goals reset to smart defaults.', 'success'); },
    'export-json': () => download(`thrive-backup-${todayKey()}.json`, JSON.stringify(S, null, 2)),
    'export-csv': () => exportCSV(),
    demo: () => loadDemo(),
    'remove-sample': () => removeSample(),
    'onboard-sample': () => { actions['skip-onboarding'](null, null, true); if (currentRoute().id !== 'today') location.hash = '#/today'; loadDemo(); },
    'reset-all': () => {
      if (!confirm('Erase ALL Thrive data on this device? This cannot be undone.\n\nTip: export a backup first.')) return;
      if (!confirm('Are you absolutely sure?')) return;
      try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(FIRED_KEY); } catch (e) { /* ignore */ }
      load(); curDate = todayKey(); render(); openOnboarding();
    },
  };

  const forms = {
    'fm-save': () => fmSave(),
    'quick-add': (f, fd) => {
      const kcal = num(fd.get('kcal'));
      if (!(kcal > 0)) return toast('Enter calories.', 'error');
      const e = { id: uid(), quick: true, name: String(fd.get('name') || '').trim() || 'Quick add', meal: fd.get('meal') || 'snack', grams: 0, time: nowHM() };
      for (const k of NKEYS) e[k] = 0;
      e.kcal = round(kcal); e.p = round(num(fd.get('p')), 1); e.c = round(num(fd.get('c')), 1); e.f = round(num(fd.get('f')), 1);
      editDay(curDate).foods.push(e);
      save(); closeModal(); render();
      toast(`Added ${e.name} · ${fmt(e.kcal)} kcal`, 'success');
    },
    'custom-food': (f, fd) => {
      const name = String(fd.get('name') || '').trim();
      const sg = num(fd.get('sg'));
      if (!name || !(sg > 0)) return toast('Enter a name and serving size.', 'error');
      const n = {};
      for (const k of NKEYS) n[k] = round((Math.max(0, num(fd.get(k))) * 100) / sg, 3);
      const food = { id: 'c:' + uid(), name, cat: 'My foods', unit: String(fd.get('unit') || '1 serving').trim() || '1 serving', sg, n, custom: true };
      S.customFoods.push(food);
      save();
      const meal = FM ? FM.meal : guessMeal();
      FM = { meal, q: '', filter: 'mine' };
      openModal({ title: 'Add food', body: '<div id="fm"></div>', wide: true });
      fmDetail(food);
      render();
      toast(`Saved "${name}" to My foods`, 'success');
    },
    steps: (f, fd) => {
      const v = Math.round(num(fd.get('steps'), -1));
      if (v < 0 || v > 100000) return toast('Enter a step count between 0 and 100,000.', 'error');
      const before = snap(curDate);
      editDay(curDate).steps = v; save(); render();
      celebrateDiff(curDate, before);
      toast(`Steps updated: ${fmt(v)}`, 'success');
    },
    workout: (f, fd) => {
      const type = String(fd.get('type'));
      const act = ACTIVITIES.find((a) => a[0] === type) || ACTIVITIES[ACTIVITIES.length - 1];
      const minutes = Math.round(num(fd.get('minutes')));
      if (!(minutes > 0 && minutes <= 600)) return toast('Enter a duration between 1 and 600 minutes.', 'error');
      const intensity = INTENSITY[fd.get('intensity')] ? fd.get('intensity') : 'moderate';
      const manual = num(fd.get('kcal'));
      const kcal = manual > 0 ? Math.round(manual) : workoutKcal(act[1], intensity, minutes, currentWeight(curDate));
      const before = snap(curDate);
      editDay(curDate).workouts.push({ id: uid(), type: act[0], minutes, intensity, met: act[1], kcal, notes: String(fd.get('notes') || '').trim().slice(0, 120), time: nowHM() });
      save(); render();
      toast(`Logged ${act[0]} · ${minutes} min · ${fmt(kcal)} kcal`, { emoji: '💪', type: 'success' });
      celebrateDiff(curDate, before);
    },
    strength: (f, fd) => {
      const name = String(fd.get('name') || '').trim().slice(0, 60);
      const sets = Math.round(num(fd.get('sets'))), reps = Math.round(num(fd.get('reps'))), weight = Math.max(0, num(fd.get('weight')));
      if (!name || !(sets > 0) || !(reps > 0)) return toast('Enter exercise, sets and reps.', 'error');
      const before = personalRecords().find((p) => p.name.toLowerCase() === name.toLowerCase());
      editDay(curDate).strength.push({ id: uid(), name, sets, reps, weight: round(weight, 1) });
      save(); render();
      const e1 = weight * (1 + reps / 30);
      const pr = before && weight > 0 && e1 > before.e1rm + 0.01;
      toast(pr ? `New PR on ${name}! Est. 1RM ${fmt(e1, 1)} kg` : `Logged ${name} ${sets}×${reps}`, { type: 'success', emoji: pr ? '🏆' : '💪' });
      if (before && weight > 0 && e1 > before.e1rm + 0.01) celebrate();
    },
    sleep: (f, fd) => {
      const bed = String(fd.get('bed') || ''), wake = String(fd.get('wake') || '');
      if (!/^\d{2}:\d{2}$/.test(bed) || !/^\d{2}:\d{2}$/.test(wake)) return toast('Enter both bed and wake times.', 'error');
      const hours = sleepHours(bed, wake);
      if (hours > 16) return toast(`That's ${fmtDur(hours)} — please check the times.`, 'error');
      const awake = fd.get('awake') === '' ? null : Math.round(num(fd.get('awake')));
      const before = snap(curDate);
      editDay(curDate).sleep = { bed, wake, hours: round(hours, 2), quality: clamp(Math.round(num(fd.get('quality'), 3)), 1, 5), awake, notes: String(fd.get('notes') || '').trim().slice(0, 140) };
      save(); render();
      toast(`Sleep saved · ${fmtDur(hours)}`, 'success');
      celebrateDiff(curDate, before);
    },
    weight: (f, fd) => {
      const w = num(fd.get('weight'));
      if (!(w >= 20 && w <= 400)) return toast('Enter a weight between 20 and 400 kg.', 'error');
      const d = editDay(curDate);
      d.weight = round(w, 1);
      const bf = num(fd.get('bf')), waist = num(fd.get('waist'));
      d.body = bf > 0 || waist > 0 ? { bf: bf > 0 ? round(bf, 1) : null, waist: waist > 0 ? round(waist, 1) : null } : null;
      save(); render();
      toast(`Saved ${fmt(w, 1)} kg`, 'success');
    },
    profile: (f, fd) => {
      const p = {
        name: String(fd.get('name') || '').trim().slice(0, 40),
        sex: fd.get('sex') === 'male' ? 'male' : 'female',
        age: Math.round(num(fd.get('age'))),
        height: num(fd.get('height')),
        weight: num(fd.get('weight')),
        targetWeight: num(fd.get('targetWeight')) || null,
        activity: ACTIVITY_LEVELS[fd.get('activity')] ? fd.get('activity') : 'light',
        goal: GOALS[fd.get('goal')] ? fd.get('goal') : 'maintain',
      };
      if (!(p.age >= 13 && p.age <= 100)) return toast('Age must be between 13 and 100.', 'error');
      if (!(p.height >= 100 && p.height <= 250)) return toast('Height must be between 100 and 250 cm.', 'error');
      if (!(p.weight >= 25 && p.weight <= 400)) return toast('Weight must be between 25 and 400 kg.', 'error');
      const firstTime = !S.profile || !!S.profile.skipped;
      p.startWeight = firstTime ? p.weight : num(S.profile.startWeight, p.weight);
      S.profile = p;
      if (firstTime) {
        const d = editDay(todayKey());
        if (!d.weight) d.weight = round(p.weight, 1);
      }
      save();
      if (firstTime) {
        closeModal();
        const g = goals();
        toast(`Your daily targets: ${fmt(g.kcal)} kcal · ${g.p} g protein · ${fmt(g.water / 1000, 1)} L water · ${g.sleep}h sleep.`, { title: p.name ? `Welcome, ${p.name}!` : 'Welcome to Thrive!', emoji: '👋', type: 'success', timeout: 9000 });
      } else toast('Profile saved — targets updated.', 'success');
      render();
    },
    goals: (f, fd) => {
      const o = {};
      for (const k of ['kcal', 'p', 'c', 'f', 'fi', 'water', 'sleep', 'steps', 'activeMin', 'na', 'su']) { const v = num(fd.get(k)); if (v > 0) o[k] = v; }
      if (o.sleep && (o.sleep < 4 || o.sleep > 12)) return toast('Sleep goal should be between 4 and 12 hours.', 'error');
      S.goalsOverride = o; save(); render();
      toast('Goals saved.', 'success');
    },
    'water-custom': (f, fd) => addWater(fd.get('ml')),
    habit: (f, fd) => addHabit(fd.get('emoji'), fd.get('name')),
    'fast-edit': (f, fd) => {
      const a = S.fasting.active;
      if (!a) return closeModal();
      const start = new Date(String(fd.get('start') || '')).getTime(), now = Date.now();
      const target = clamp(num(fd.get('target'), a.target), 1, 72);
      if (!Number.isFinite(start)) return toast('Pick a valid start time.', 'error');
      if (start > now + 60000) return toast("The start time can't be in the future.", 'error');
      if (now - start > 72 * HOUR) return toast('Fasts longer than 72 hours are not supported.', 'error');
      a.start = Math.min(start, now); a.target = target; a.notified = now - a.start >= target * HOUR;
      save(); closeModal(); render();
      toast('Fast updated.', 'success');
    },
    reminder: (f, fd) => {
      const label = String(fd.get('label') || '').trim().slice(0, 60);
      if (!label) return toast('Give the reminder a label.', 'error');
      const days = fd.getAll('days').map(Number).filter((x) => x >= 0 && x <= 6);
      if (!days.length) return toast('Pick at least one day.', 'error');
      const mode = fd.get('mode') === 'interval' ? 'interval' : 'time';
      const r = { label, type: REM_TYPES[fd.get('type')] ? fd.get('type') : 'custom', meal: fd.get('meal') || 'breakfast', mode, time: fd.get('time') || '09:00', every: num(fd.get('every'), 60), start: fd.get('start') || '08:00', end: fd.get('end') || '21:00', days };
      if (mode === 'interval' && toMin(r.end) <= toMin(r.start)) return toast('"Until" must be later than "From".', 'error');
      const id = f.dataset.id;
      if (id) { const ex = S.reminders.find((x) => x.id === id); if (ex) Object.assign(ex, r); }
      else S.reminders.push(Object.assign({ id: uid(), enabled: true }, r));
      save(); closeModal(); render();
      toast('Reminder saved.', 'success');
    },
  };

  const changes = {
    notes: (el) => { const d = editDay(curDate); d.notes = el.value.slice(0, 1000); save(); },
    theme: (el) => { S.settings.theme = el.value; save(); applyTheme(); },
    eatback: (el) => { S.settings.eatBackExercise = el.checked; save(); },
    sound: (el) => { S.settings.sound = el.checked; save(); if (el.checked) chime(); },
    haptics: (el) => { S.settings.haptics = el.checked; save(); buzz(20); },
    'toggle-reminder': (el) => { const r = S.reminders.find((x) => x.id === el.dataset.id); if (r) { r.enabled = el.checked; save(); } },
    import: (el) => {
      const file = el.files && el.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let data;
        try { data = JSON.parse(reader.result); } catch (e) { return toast('That file is not valid JSON.', 'error'); }
        if (!data || typeof data !== 'object' || typeof data.days !== 'object') return toast("That doesn't look like a Thrive backup.", 'error');
        if (!confirm(`Restore this backup (${Object.keys(data.days).length} days)? It will replace the data currently on this device.`)) return;
        S = normalize(data); goalsCache = null; save(); applyTheme(); render();
        toast('Backup restored.', 'success');
        if (!S.profile) openOnboarding();
      };
      reader.onerror = () => toast('Could not read the file.', 'error');
      reader.readAsText(file);
      el.value = '';
    },
  };

  function bindGlobal() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (el && !el.disabled) {
        const fn = actions[el.dataset.action];
        if (fn) { e.preventDefault(); if (el.dataset.action !== 'fab-toggle') toggleFab(false); fn(el, e); }
        return;
      }
      if (e.target.matches && e.target.matches('[data-backdrop]') && modalDismissable) closeModal();
    });
    document.addEventListener('submit', (e) => {
      const f = e.target.closest('form[data-form]');
      if (!f) return;
      e.preventDefault();
      const fn = forms[f.dataset.form];
      if (fn) fn(f, new FormData(f));
    });
    document.addEventListener('change', (e) => {
      const el = e.target.closest('[data-change]');
      if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e);
    });
    document.addEventListener('keydown', (e) => {
      const key = e.key || '';
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!modalOpen() || modalDismissable) { toggleFab(false); openCmdk(); }
        return;
      }
      if (key === 'Escape') { toggleFab(false); if (modalOpen() && modalDismissable) closeModal(); return; }
      if ((key === 'Enter' || key === ' ') && e.target.matches && e.target.matches('[role="button"][data-action]')) { e.preventDefault(); e.target.click(); return; }
      const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
      if (typing || modalOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
      const r = currentRoute();
      if (key === 'ArrowLeft' && r.dated) setDate(addDays(curDate, -1));
      else if (key === 'ArrowRight' && r.dated && curDate < todayKey()) setDate(addDays(curDate, 1));
      else if (key === 'f') openFoodModal();
      else if (key === 'w') addWater(250);
      else if (key === 'b') openBreathe();
      else if (key === 't') setDate(todayKey());
      else if (key === '/') { e.preventDefault(); openCmdk(); }
      else if (key === '?') openShortcuts();
      else if (/^[1-9]$/.test(key) && ROUTES[+key - 1]) location.hash = '#/' + ROUTES[+key - 1].id;
    });
    $('#date-input').addEventListener('change', (e) => { if (e.target.value) setDate(e.target.value); });
    window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

    // Tooltips for charts and anything with data-tip
    const tip = $('#tip');
    let tipTimer = null;
    const placeTip = (cx, cy) => {
      const x = clamp(cx + 14, 8, window.innerWidth - tip.offsetWidth - 8);
      const y = cy + 16 + tip.offsetHeight > window.innerHeight ? cy - tip.offsetHeight - 10 : cy + 16;
      tip.style.left = x + 'px'; tip.style.top = Math.max(8, y) + 'px';
    };
    document.addEventListener('pointerover', (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      clearTimeout(tipTimer);
      if (!el) { tip.classList.remove('show'); return; }
      tip.textContent = el.getAttribute('data-tip');
      tip.classList.add('show');
      placeTip(e.clientX, e.clientY);
      // Touch has no "hover out": show briefly above the finger, then hide.
      if (e.pointerType === 'touch') { placeTip(e.clientX, e.clientY - 60); tipTimer = setTimeout(() => tip.classList.remove('show'), 2200); }
    });
    document.addEventListener('pointermove', (e) => {
      if (!tip.classList.contains('show') || e.pointerType === 'touch') return;
      placeTip(e.clientX, e.clientY);
    });
    window.addEventListener('scroll', () => tip.classList.remove('show'), { passive: true });

    // Emoji play once when you hover (desktop) or tap (touch) the thing they belong to.
    let emoHost = null;
    document.addEventListener('pointerover', (e) => {
      const host = e.target.closest && e.target.closest('button, a, label, .badge, .entry, .insights li, .sugg-item, .toast');
      if (host === emoHost) return;
      emoHost = host;
      if (host) $$('img.emo[data-cp]', host).slice(0, 3).forEach(playEmo);
    });
    // Keep newly shown emoji (page renders, toasts, modals) on their idle schedule.
    let idleQueued = false;
    new MutationObserver(() => {
      if (idleQueued) return;
      idleQueued = true;
      requestAnimationFrame(() => { idleQueued = false; scheduleIdleEmoji(); });
    }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerout', (e) => { if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest('[data-tip]'))) tip.classList.remove('show'); });

    // Sync between tabs
    window.addEventListener('storage', (e) => {
      if (e.key !== STORE_KEY) return;
      load(); applyTheme();
      if (!modalOpen()) render();
    });
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const fn = () => { if (S.settings.theme === 'system') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn);
    }
    // Roll over to the new day at midnight if the user was looking at "today".
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); updateLive(); } });

    // Swipe left / right on phones to move between days.
    const view = $('#view');
    let sw = null;
    view.addEventListener('touchstart', (e) => {
      const tch = e.touches[0];
      const blocked = e.touches.length > 1 || (e.target.closest && e.target.closest('input, textarea, select, .chart, .hm-wrap, .table-wrap, .chips, .weekstrip'));
      sw = blocked ? null : { x: tch.clientX, y: tch.clientY, t: Date.now() };
    }, { passive: true });
    view.addEventListener('touchend', (e) => {
      if (!sw) return;
      const tch = e.changedTouches[0], dx = tch.clientX - sw.x, dy = tch.clientY - sw.y, dt = Date.now() - sw.t;
      sw = null;
      if (!currentRoute().dated || modalOpen() || dt > 600 || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      if (dx > 0) { setDate(addDays(curDate, -1)); buzz(); }
      else if (curDate < todayKey()) { setDate(addDays(curDate, 1)); buzz(); }
    }, { passive: true });
  }

  let lastTickDay = todayKey();
  function tick() {
    const t = todayKey();
    if (t !== lastTickDay) {
      lastTickDay = t;
      invalidate();
      if (followToday) { curDate = t; if (!modalOpen()) render(); }
    }
    checkReminders();
    updateLive(); // the fasting-goal nudge also fires from a background tab
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  function boot() {
    load();
    applyTheme();
    renderNav();
    bindGlobal();
    render();
    if (!S.profile) openOnboarding();
    setInterval(tick, 15000);
    setInterval(() => { if (!document.hidden) updateLive(); }, 1000);
    setTimeout(checkReminders, 2000);
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch((e) => console.warn('Service worker not registered', e));
    }
  }

  // Exposed for debugging / tests only.
  window.Thrive = { get state() { return S; }, render, goals: () => goals(), dayTotals, healthScore };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
