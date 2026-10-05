# KA Feature Guide

Written for: the project owner, to understand every feature of the site, store and portal.

Project: KA / Kethan Artzz portfolio, store and owner portal (folder `KA-Crystal-Reconstruction`).

## How to read this guide

- Every statement comes from the project's own code. A file and function name follows each claim, for example `server/store/orders.js` → `quote()`.
- Where something could not be confirmed in the code, the text says **NOT FOUND IN CODE**.
- Every feature has the same headings: What it is; Where it runs; Files; Tools and libraries; Browser features used; Server APIs called; Key functions; How it works step by step; Data saved; Controlled from the portal?; Speed and smoothness; Screen sizes and accessibility; Security; Limits and edge cases; Not found / unclear.
- Library versions are the installed versions in `package-lock.json`.
- Line numbers are approximate (they say where to start looking) and can move when files change. Names of files and functions are the reliable reference.

## Terms used in this guide (each is explained once, here)

| Term | Meaning |
|---|---|
| Cloudflare Pages | The service that serves the site's static files at https://kethan.pages.dev |
| Worker | Server code that runs on Cloudflare. Here it is `kethan-artzz` (`server/platform/cloudflare.js`) |
| D1 | Cloudflare's SQLite database (`ka-db`) |
| R2 | Cloudflare's file storage (`ka-files`) |
| Turnstile | Cloudflare's bot check. The page gets a token, the server checks it with Cloudflare |
| HMAC-SHA256 | A signature made from a secret key and a message. Only a holder of the key can make a matching one |
| CSRF token | A secret value sent in the `X-CSRF-Token` header so another website cannot trigger portal changes |
| scrypt | A deliberately slow way to store passwords |
| TOTP | The 6-digit code that changes every 30 seconds in an authenticator app |
| SSE | Server-sent events: the server sends a stream of small text pieces over one HTTP answer |
| ETag | A fingerprint of an answer. The browser sends it back and the server may answer 304 (no body) when nothing changed |
| FTS5 | SQLite's full-text search |
| Shadow DOM / shadow root | A part of the page with its own isolated styles |
| Minor units | The smallest money unit (paise for INR, cents for USD). All prices are whole numbers of minor units |
| Basis points (bp) | One hundredth of a percent. 1800 bp = 18% |
| Lazy loading | Loading a file only when it is first needed |
| Site document | The one saved JSON document (settings key `site`) that holds the homepage's editable content |
| Bundle | A built JavaScript file produced by Vite |

## Table of contents

Step 1. All 29 features:

1. [Crystal shards "KA" intro animation (hero)](#1-crystal-shards-ka-intro-animation-hero)
2. [Background animation(s)](#2-background-animations)
3. [Text animations and reveal effects on the homepage](#3-text-animations-and-reveal-effects-on-the-homepage)
4. [Skills section (board, logo chips, floating logo field)](#4-skills-section-board-logo-chips-floating-logo-field)
5. [Image hover effects (portfolio, work stacks, coverflow, lightbox)](#5-image-hover-effects-portfolio-work-stacks-coverflow-lightbox)
6. [Page navigation (sections, swipe, deep links)](#6-page-navigation-sections-swipe-deep-links)
7. [Screen compatibility / responsive design (phone, tablet, desktop, reduced motion)](#7-screen-compatibility--responsive-design-phone-tablet-desktop-reduced-motion)
8. [Typography studio (drawing/typing canvas)](#8-typography-studio-drawingtyping-canvas)
9. [Panda mascot](#9-panda-mascot)
10. [Store and product browsing](#10-store-and-product-browsing)
11. [Checkout and Razorpay payment](#11-checkout-and-razorpay-payment)
12. [License card / pass card (3D flip card, signature, QR seal)](#12-license-card--pass-card-3d-flip-card-signature-qr-seal)
13. [Delivery, download links, ratings, refunds](#13-delivery-download-links-ratings-refunds)
14. [License check page (/license/<code>)](#14-license-check-page-licensecode)
15. [Contact form and Messages inbox](#15-contact-form-and-messages-inbox)
16. [Email sending](#16-email-sending)
17. [AI assistant (KA Assistant)](#17-ai-assistant-ka-assistant)
18. [Visitor analytics](#18-visitor-analytics)
19. [Live updates](#19-live-updates)
20. [Performance](#20-performance)
21. [Admin login, sessions, 2FA and team roles](#21-admin-login-sessions-2fa-and-team-roles)
22. [Portal desktop (windows, dock, menu bar, search)](#22-portal-desktop-windows-dock-menu-bar-search)
23. [Portal controls for the public site (fonts, colours, text, layout, animation, images, license card)](#23-portal-controls-for-the-public-site-fonts-colours-text-layout-animation-images-license-card)
24. [Every other portal app](#24-every-other-portal-app)
25. [File uploads and storage](#25-file-uploads-and-storage)
26. [Security](#26-security)
27. [Scheduled jobs and backups](#27-scheduled-jobs-and-backups)
28. [Legal pages, coupons, notify-me and email templates](#28-legal-pages-coupons-notify-me-and-email-templates)
29. [Deployment and hosting](#29-deployment-and-hosting)

Then: [Step 3. Specific questions](#step-3-answers-to-the-specific-questions), [Step 4. Summary tables A to D](#step-4-summary-tables), [Verification](#verification).


# Step 2. Feature sections


## 1. Crystal shards "KA" intro animation (hero)

**What it is:** A full-screen 3D opening. Many crystal pieces fly in from beyond the screen edges and join into the KA logo. A bright wave then replaces the pieces with the finished logo picture. Eight tool icons then appear around the logo.

**Where it runs:** Frontend only (browser). There is no server call. The 3D scene is built by the inline `<script>` that starts at `index.html` line 2309 (an immediately-invoked function). The two picture files are static files served by Cloudflare Pages.

**Files:**
| File | Role |
|---|---|
| `index.html` (inline script, lines 2309–5859) | The whole hero: scene, shaders, shard build, timeline, frame loop, icon ring, particles |
| `index.html` line 2313 `MANIFEST` | Data for each shard piece: `id`, `atlas` rectangle, `target`, `centroid`, `size`, `isCore`, `landedWorld` (179 entries; `logoSize` 1120×1575.7) |
| `images/crystal-atlas.webp` | One sheet (2600×1248, lossless WebP) holding the picture of every shard (`ATLAS_SRC`) |
| `images/crystal-cutout.webp` | The finished logo picture with transparent background (1410×1887, lossless WebP) (`CUTOUT_SRC`) |
| `public/three-r128.min.js` → served as `dist/assets/three-r128.min.js` | Three.js r128, loaded by `<script src="./dist/assets/three-r128.min.js">` (line 1927) |
| `vite.config.mjs` → plugin `local-crystal-runtime` | Copies `public/three-r128.min.js` into the build |
| `generator/build_cinematic.py` | Offline Python script (see "How the pictures were produced") |
| `generator/ka-shards-manifest2.json`, `ka-shards-atlas2-final.png`, `logo-clean/cutout_intact_final.png` | Inputs of that script |

**Tools and libraries:**
| Name | Version | What it does here |
|---|---|---|
| Three.js (classic build) | r128 (file `public/three-r128.min.js`; version taken from the file name; `package-lock.json` does **not** contain it) | Draws everything with WebGL: `THREE.WebGLRenderer`, `PerspectiveCamera`, `Mesh`, `ShaderMaterial`, `Sprite`, `Points`, `InstancedMesh`, `TextureLoader`, `CanvasTexture`, `Raycaster` |
| Python libraries `numpy`, `scipy.ndimage`, `PIL` | NOT FOUND IN CODE (no requirements file); imported in `generator/build_cinematic.py` | Used only offline to compute where pieces land |

**Browser features used:** WebGL (`new THREE.WebGLRenderer({antialias:true, alpha:true})`); Canvas 2D to draw textures (`makeSoftDotTexture`, `makeRadialShadowTexture`, `makeIconTexture`, `drawIconGlyph`, `buildLogoAlphaMap`); `requestAnimationFrame` (`scheduleHero()` → `frame()`); `IntersectionObserver` on `.hero-spacer` (sets `heroVisible`); `matchMedia('(prefers-reduced-motion: reduce)')`; `document.visibilitychange`, `pagehide`, `pageshow` (`syncHero()`); `window.visualViewport` `resize` (`onResize`); pointer events `pointermove`, `pointerdown`, `pointercancel`, `pointerout`, `click` (`queueSurfacePointer`, `updateLogoHoverCue`); `CustomEvent('ka-sequence-complete')`; inline SVG created with `document.createElementNS` for the skill labels (`buildSkillCallouts`); `<link rel="preload">` for the scripts and pictures (lines 79–81).

**Server APIs called:** none (NOT FOUND IN CODE).

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `fractureOpeningCore()` | `index.html` | Cuts the largest shard into 20 pieces (a 4×5 grid of cells clipped by half-plane tests; `fracturePolygon`) when it is at least 4× the area of the second-largest. Here: area 760,785 vs 27,118 (ratio 28.05), so the runtime shard count is 179 − 1 + 20 = **198** (computed from the manifest) |
| `buildShards()` | `index.html` | Makes one mesh per piece; sets UVs to the piece's rectangle of the atlas; sets a random start point at the screen edge; sets landing point, delay, duration, curve |
| `screenEdgeSpawnPoint()` | `index.html` | Random start position outside the visible frame, 1.5–3.1× the frame boundary distance |
| `init()` | `index.html` | Runs once both textures are loaded (`onAssetLoad` counts 2): builds shards, glow, comet trails, dust, logo, join seams, icons, skill callouts, ambient shards |
| `frame(ts)` | `index.html` | The loop. Phases `shattered → assembling → held → disassembling` |
| `updateShardsIdle()`, `updateShardsAssembling()` | `index.html` | Per-piece motion before and during assembly |
| `updateLogoReveal()` | `index.html` | Drives the reveal wave and the light "charge" |
| `easeSlowSnap()` / `smootherStep()` | `index.html` | Easing (`easeSlowSnap` returns `smootherStep(t)`) |
| `updateCamera()`, `computeResponsiveFovBase()` | `index.html` | Camera move, parallax, field of view per screen shape |
| `settleStatic()` | `index.html` | Reduced-motion result: logo shown at once, shards hidden |
| `buildIcons()`, `layoutIcons()`, `updateIcons()`, `setBubbles()` | `index.html` | The 8 icon bubbles around the logo; tuck/expand on click |
| `buildSkillCallouts()`, `updateSkillCallouts()`, `skillLabelLayout()` | `index.html` | SVG lines and labels from each icon |
| `buildSurfaceParticles()`, `emitSurfaceParticles()`, `updateSurfaceParticles()` | `index.html` | Sparks that follow the pointer over the finished logo |
| `buildDust()`, `updateDust()`, `buildCometTrails()`, `buildAmbientShards()` | `index.html` | Extra glow dust, trails and drifting extra crystals |

**How the shards are drawn (geometry, textures, shaders):**
- Each shard is a flat rectangle (`THREE.PlaneGeometry(1,1)`), or for the 20 split pieces a `THREE.ShapeGeometry` from `fracturePolygon` (`fractureGeometry()`).
- UVs are rewritten so the rectangle shows only that shard's area of `crystal-atlas.webp`: `u0 = atlas.x / 2600`, `v1 = 1 − atlas.y / 1248`, etc. (`buildShards()`).
- Material: `THREE.ShaderMaterial` with `shardVertex` / `shardFragment`. The fragment shader multiplies the picture colour by `uTint`, adds `uGlow × facet × 0.22`, and discards pixels with alpha < 0.01.
- Tint starts at `RAW_TINT` (0.58, 0.30, 0.27) and moves to `RESOLVED_TINT` (1,1,1) as the piece lands (`lerp3`).
- Size on screen: `w = atlas.w × SCALE_X`, `h = atlas.h × SCALE_Y`; the manifest picture and the cutout picture are fitted into one box `LOGO_BOX_W × LOGO_BOX_H` = 232 × 302 world units (`fitContain()`).
- A glow halo per piece comes from one instanced draw (`buildShardGlow()`, `setShardGlowHalo()`); glow strength comes from `TIER_PRESETS` and `TIER_WEIGHTS` (`pickGlowTier()`).

**How it works, step by step (timing, easing, frame loop):**
1. Phase `shattered`: pieces hover at their screen-edge start points, drifting with sine motion (`updateShardsIdle`: amplitude 13, or 8 when `gentle`). A hold of `ASSEMBLE_DELAY` = 180 ms (0 under reduced motion) runs first (`heroHold`); after a replay `heroHold = 650`.
2. About 15–30 % of the small pieces start hidden (`isInitiallyMissing`: probability 0.15 for large pieces, 0.65 for small ones; the 20 split pieces are never hidden).
3. `updateEnergizePulse()` flares the logo outline for `ENERGIZE_DUR` = 560 ms before pieces move.
4. Phase `assembling` (when `ts − phaseStart ≥ heroHold`): each piece starts at `repairDelay = ASSEMBLE_DELAY + random × ASSEMBLE_SPAN × 0.64` (`ASSEMBLE_SPAN` = 3600 ms) and lasts `repairDur = 1500 + min(1500, gap × 0.45) + random × 360` ms.
5. Position follows a quadratic Bézier curve from the start point through a sideways arc mid-point to `landedPos`, with progress `posE = easeSlowSnap(lt)`.
6. Rotation eases from a random start angle (±0.24 rad) to 0 (`smootherStep`). Near the end (`lt > 0.9`) a small scale pop is applied.
7. `REVEAL_START = ASSEMBLY_FULL_T − REVEAL_LEAD` (`REVEAL_LEAD = −650`, so reveal starts 650 ms after the last piece's end time). The reveal lasts `REVEAL_DUR` = 1200 ms.
8. During the reveal, `wipeYGlobal` goes from −0.2 to 1.2. The `pulseFragment` shader hides pixels outside a growing radius from the logo centre (`revealMask = 1 − smoothstep(rr − uWipeBand, rr + uWipeBand, r)`, `WIPE_BAND` = 0.11, with noise at the edge). Each shard fades (`localFade`) and sinks 46 units behind the logo as the wave passes its `landedR`.
9. `chargeEnv` raises key/rim light intensity up to 2.1× around the reveal (no camera zoom).
10. The camera moves from `CAM_Z_FAR` 980 to `CAM_Z_NEAR` 660 (`updateCamera`, `easeInOutCubic`) while the field of view is compensated so the logo size stays steady.
11. The 8 icons fly in after `ICONS_START_GAP` 500 ms, staggered 90 ms (`ICON_STAGGER`), each `ICON_DUR` 820 ms; the bubbles tuck behind the logo once (`BUBBLE_STAGGER_MS` 48, `BUBBLE_RETRACT_DUR` 640).
12. When all done (`REVEAL_START + REVEAL_DUR + 500 + 90×7 + 820 + PULSE_DELAY 550 + PULSE_DUR 1400 + 200` ms) the phase becomes `held` and `ka-sequence-complete` is fired once. The code also sets class `on` on an element with id `replay` (`replayBtn?.classList.add('on')`, `index.html` line ~4349), but **no element with `id="replay"` exists in the page markup** (the lookup at line 4073 returns nothing and the code uses `?.`), so no replay button is shown. A comment at line ~8352 says the same.
13. Replay (code path only, `replayBtn` click handler at line ~4075): phase `disassembling` for `DISASSEMBLE_DUR` 1500 ms, then `shattered` again. With no button in the markup, a visitor cannot start it.

**How `crystal-atlas.webp` and `crystal-cutout.webp` are used:** the atlas is the texture of every shard (`atlasTex`); the cutout is the texture of the finished logo (`cutoutTex` on `logoMesh`, `logoHighlight`) and is also drawn into a 256-px-wide alpha map (`buildLogoAlphaMap`) so pointer hit tests ignore transparent pixels (`sampleCutoutAlpha`, `raycastLogo`). Both load with `THREE.TextureLoader`; `init()` waits for both.

**How the pictures were produced:** `generator/build_cinematic.py` reads `ka-shards-manifest2.json`, `ka-shards-atlas2-final.png` and `logo-clean/cutout_intact_final.png`; computes for each shard a "landed" position inside the true logo outline using the cutout's alpha channel (binary erosion + distance transform from `scipy.ndimage`); applies a fixed scale so the assembled outline matches the finished picture; and writes `ka-cinematic-demo.html` (line 2749). How the original shard photographs were cut, and how the `.png` sheets became the two `.webp` files, is **NOT FOUND IN CODE**. The script's atlas height (1066) differs from `ATLAS_H` in `index.html` (1248): **UNCLEAR** which sheet version each used.

**Data saved:** none. Nothing is stored in the database, R2 or browser storage for this feature.

**Controlled from the portal?** NOT FOUND IN CODE (no portal setting changes the hero). There is no replay button in the page (see step 12).

**Speed and smoothness:**
- Both pictures and the Three.js file are preloaded in `<head>` (`rel="preload"`, `fetchpriority="high"` for the two images).
- Pixel ratio is capped by a pixel budget: `renderPixelRatio()` = `min(devicePixelRatio, 2, sqrt(budget / pixels))` with budget 2,400,000 on mobile, 9,500,000 on desktops with ≥ 8 cores, 6,000,000 otherwise.
- The loop pauses when the tab is hidden or when the hero is off-screen in phase `held` (`syncHero()`, `heroVisible`); time is shifted so the timeline resumes correctly (`phaseStart += …`).
- `perfScale` = 0.55 for mobile devices with ≤ 2 GB memory or ≤ 4 cores, which scales dust (320 desktop / 130 mobile), surface particles (112 / 64) and other ambient counts.
- Delta-time smoothing for the camera (`dtClamped`), position updates in one pass, instanced glow (one draw call), reused temporary objects.

**Screen sizes and accessibility:**
| Condition | Behaviour | Where |
|---|---|---|
| `isMobile` = `(max-width: 760px)` or `/Mobi|Android/i` in the user agent | smaller pixel budget, camera parallax strength 14 instead of 34, fewer particles | `isMobile`, `updateCamera` |
| Field of view | `computeResponsiveFovBase()` widens the view for narrow screens so the icon ring fits; on wide, tall screens (width > 1024 and height > 540) the logo is up to 1.5× larger | same |
| Skill labels | below 640 px width, labels stack in rows above/below (`skillLabelLayout` `compact`) | `skillLabelLayout()` |
| Reduced motion | `settleStatic()`: logo shown immediately, shards hidden, camera at near position, no loop; also reacts if the setting changes while open | `init()` listener |
| Touch | pointer events used; sparks need a pointer move over the logo; no hover needed | `queueSurfacePointer` |
| WebGL missing for the hero | NOT FOUND IN CODE: the hero creates its renderer without a try/catch (only the nebula background has a fallback) |

**Security:** none relevant (no input, no network).

**Limits and edge cases:** Manifest has 179 shards but comments in the code say 169 (outdated). `assertSharedCoreOrigin()` throws if any shard has a different origin or if the count changes; `checkCompleteShapeCount()` verifies all shards. `enforceShardVisibility()` keeps the full logo hidden until the reveal window (`setResolvedMarkVisibility()` is the single gate). The icon toggle works only in phase `held` after the automatic tuck.

**Not found / unclear:** the production steps for the `.webp` files; the Python dependencies; why comments mention 169 shards; whether `generator/ka-cinematic-demo.html` still matches the live hero.

---

## 2. Background animation(s)

**What it is:** Four layers sit behind or over the page: (a) a WebGL space backdrop of stars, a nebula, galaxies and crystal glints; (b) a pointer-following paint trail; (c) ember glows; (d) a painted-plaster background that is **built but switched off**.

**Where it runs:** Frontend only.

**Files:**
| File | Role |
|---|---|
| `index.html` lines 1928–2308 (inline script) | Background (a): `#nebula-bg` WebGL scene |
| `index.html` lines 161–202 (CSS) | `#stage` (z-index 2), `#nebula-bg` (deepest layer), `#boot-veil`; the stylesheet also holds rules for `#replay`, which has no matching element |
| `index.html` lines 9221–9462 (inline script) | Paint trail (b) on `<canvas id="brush-trail">` and embers (c) in `#ember-layer` |
| `index.html` lines 1319–1333 (inline script) | Poster background loader: the activating line is commented out |
| `client/src/poster-background.ts` | Painted-plaster background (d), exports `startPosterBackground()` |
| `client/src/assets/images/poster/*.webp` | Five textures used by (d): `blue-plaster`, `paint`, `red-plaster`, `brush`, `ink` |
| `tests/poster.test.mjs` | Still tests (d) |

**Tools and libraries:** Three.js r128 (script tag) for (a); `three` 0.185.1 (bundled by Vite) for (d).

**Browser features used:** WebGL (`THREE.WebGLRenderer`, `ShaderMaterial`, `Points`, `Sprite`); Canvas 2D (`makeGalaxyTexture`, `makeShardTexture`, trail drawing `smoothTrailPath` with `quadraticCurveTo`); `requestAnimationFrame` (`frame` in (a), `updateCursor`, `updateEmbers`); `visibilitychange`, `pagehide`, `pageshow`; `webglcontextlost` / `webglcontextrestored`; `matchMedia('(prefers-reduced-motion: reduce)')`, `matchMedia('(any-pointer: fine)')`, `(hover: hover) and (pointer: fine)`, `(pointer: coarse)`; pointer, touch events; `CSS transform: translate3d` for embers.

**Server APIs called:** none.

**Key functions:**
| Function | File | What it does |
|---|---|---|
| anonymous IIFE (nebula) → `frame()`, `resize()`, `syncBackground()` | `index.html` | Render loop for (a). Runs at most every 1000/30 ms (about 30 frames per second) |
| `makeGalaxyTexture()`, `makeShardTexture()` | `index.html` | Draw one soft-gradient sprite and one diamond-glint sprite on small canvases |
| `updateCursor()`, `smoothTrailPath()`, `resizeTrail()`, `startCursorLoop()`, `stopCursorLoop()` | `index.html` | Paint trail |
| `resetEmber()`, `updateEmbers()`, `startEmberLoop()`, `stopEmberLoop()` | `index.html` | Ember glows |
| `startPosterBackground()`, `transitionState()`, `renderBudget()` | `client/src/poster-background.ts` | (d): cross-fades artworks every 26 s with a shader; also sends `ka-ambient-light` |

**How it works:**
1. (a) The script finds `#nebula-bg`, checks `typeof THREE !== 'undefined'`, and creates a renderer in a `try`; if it fails the CSS background of `#nebula-bg` stays (`if (!renderer) return;`).
2. It builds: stars (`THREE.Points`, 2600 desktop, `1100 × perfScale` mobile; custom shader with twinkle), a nebula plane 2600×1300 at z = −600 (fragment shader with simplex noise `snoise`, 4-octave `fbm`, domain warping, violet/blue colours, dithering to avoid banding), galaxy sprites (6 desktop, `3 × perfScale` mobile; additive), and 16 desktop (`8 × perfScale` mobile) drifting diamond "shards".
3. Pointer move and scroll set `parallaxTarget`; each frame `parallaxCurrent` approaches it with `1 − exp(−dt/360)`; near layer moves up to 26 units, far layer 8.
4. Each frame stars rotate slightly, `uTime` advances, shards move (`vx`, `vy`, wrap-around, twinkle), then `renderer.render`.
5. (b) `trackTrailPointer` stores the pointer; every ≥ 10 ms `updateCursor` pushes a point (max 70 points desktop, 40 touch; lifetime 850 ms desktop, 620 ms touch) and strokes one smoothed path with a gradient; it skips when reduced motion is on.
6. (c) 12 ember `<div class="ember">` elements (only if `(any-pointer: fine)`; else 0) move upward 6–16 px/s with sway and a glow opacity; positions applied with `translate3d`.
7. (d) is **off**: `index.html` line 1331 `// window.addEventListener('ka-sequence-complete',revealPoster,{once:true});`. `revealPoster()` would `import('./dist/assets/poster.js')` and call `startPosterBackground()`. The code comment in `index.html` says it "was reading as a broken/muddy texture", so it was disabled and the body uses a plain gradient. Because `ka-ambient-light` events come only from (d), the logo's environment-reflection shader branch (`uEnvReady`, `ka-ambient-light` listener at line 2527) never receives data now.

**Data saved:** none.

**Controlled from the portal?** NOT FOUND IN CODE for (a), (b), (c). Visibility of text over the background is not a setting.

**Speed and smoothness:** (a) is capped at about 30 fps, pixel ratio ≤ 1 on mobile and ≤ 1.5 on desktop, with a pixel budget (`resize()`: 900,000 mobile / 2,200,000 desktop); `powerPreference: 'low-power'`; stops when the tab is hidden; stops completely and shows the CSS fallback if WebGL fails; recovers after context loss. (b) uses a smaller canvas pixel ratio (`min(dpr, 1.25, sqrt(1,200,000/pixels))`). (c) limited to 12 elements, moved with `transform`. (d) (if enabled) renders at a 1.5–4 million pixel budget (`renderBudget`), drops to ~20 fps if slow (`lowPower`).

**Screen sizes and accessibility:** (a) uses `isMobile = (max-width: 1024px), (pointer: coarse)`: fewer stars/galaxies/shards, galaxy opacity × 0.65. With `prefers-reduced-motion: reduce` (a) renders one still frame and never starts the loop; (b) and (c) stop. Embers and trail are decorative and `aria-hidden` (trail: `brush-cursor.hidden = true`).

**Security:** none relevant.

**Limits and edge cases:** `perfScale` 0.55 for low-memory mobile devices; trail pauses on `blur`; embers reset to opacity 0 when stopped.

**Not found / unclear:** the CSS of `#nebula-bg` fallback not quoted here (lines 170–198 define it).

## 3. Text animations and reveal effects on the homepage

**What it is:** Several effects that show text gradually as the visitor scrolls or hovers: headings that "write" letter by letter, small texts that come out of a blur, a fade-in for blocks, number count-up, a hover reveal of footer link names, a letter reveal in the chat, and an optional per-element entrance animation set in the portal.

**Where it runs:** Frontend only (browser). The entrance animation settings come from the server inside the portfolio document (`GET /api/portfolio`).

**Files:**
| File | Role |
|---|---|
| `index.html` lines 10036–10383 (script "KaInk") | Scroll-driven heading write, small-text emerge, contact label/field ghost-in, hero fade, section glow parallax |
| `index.html` lines 10384–10394 (style) | Styles for `.ink-w`, `.ink-l`, `.ew`, `[data-ghost]` (referenced by KaInk) |
| `index.html` lines 6389–6410 (`scrollRevealObserver`, `revealOnScroll()`) + CSS lines 405–408 | Fade/blur reveal with class `reveal-fade` / `is-visible` |
| `index.html` lines 7106–7132 (`playAboutIntro`) and CSS `posterWallFlash`, `aboutFadeUp` | About page poster-wall flash on entry |
| `index.html` lines 8230–8287 (`renderAboutStats`) | Number count-up |
| `index.html` lines 9737–9796 (`wireFooterLinkGhost`) | Footer social names surface letter by letter |
| `index.html` lines 9824–9883 (`window.kaGhost`) | Letter-by-letter text for the chat hint and chat answers |
| `index.html` lines 8131–8199 (`playElementAnimation`, `applyElementAnimations`) | Per-element entrance animation chosen in the portal |
| `index.html` CSS `@keyframes` | `sectionOut`, `sectionIn`, `fadeOutOnly`, `fadeInOnly`, `contactGlowDrift`, `portfolioGlowDrift`, `aboutGlowDrift`, `ccDraw`, `kenburns`, `posterWallFlash`, `aboutFadeUp`, `vcPulse`, `blinkCursor`, `typingDot`, `liquid-release`, `glIn`, `sectionOutLeft/Right`, `sectionInLeft/Right` |

**Tools and libraries:** none (plain JavaScript and CSS). No animation library is used on the homepage.

**Browser features used:** `IntersectionObserver` (`io` in KaInk with `rootMargin: "0px 0px -6% 0px"`, `threshold: 0.01`; `scrollRevealObserver` with `threshold: 0.12`); `requestAnimationFrame` (`tick()`); `scroll` listener with `{passive:true}`; `MutationObserver` (re-build when the text changes); Web Animations API `Element.animate()` (`playElementAnimation`); CSS `clip-path`, `filter: blur()`, `transform: translate3d`, `text-shadow`; `matchMedia('(prefers-reduced-motion: reduce)')`, `matchMedia('(hover: none)')`; `pointerenter`/`pointerleave`/`focus`/`blur` for footer names; `sessionStorage` (`kaChatNudge`).

**Server APIs called:**
| Method | Path | Server file → function | What it returns |
|---|---|---|---|
| GET | `/api/portfolio` | `server/handlers/public.js` → `portfolio()` | The portfolio document, including `elementStyles` with `animation` per element and `stats` |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `build(it)`, `render(it)`, `tick(now)` | `index.html` (KaInk) | Splits text into letter/word spans, computes progress from scroll position, applies styles each frame |
| `makeItem()`, `wrapUnits()`, `twoLines()` | `index.html` | Prepare each element; `#contact-intro` is split into two lines |
| `replayWord(w)` | `index.html` | Re-draws one heading word (480 ms) when the pointer enters it (`mouseenter`) |
| `revealOnScroll(el)` | `index.html` | Adds `reveal-fade`; toggles `is-visible` with the observer |
| `renderAboutStats()` | `index.html` | Builds number tiles and counts up |
| `wireFooterLinkGhost(a)` | `index.html` | Per-letter blur-in for a footer link label |
| `window.kaGhost(el, text, {spread})` | `index.html` | Appends letters as `<span class="gl">` with random `--d` delay |
| `playElementAnimation()`, `applyElementAnimations()` | `index.html` | Plays a preset with `Element.animate` |

**How it works, step by step:**
1. **Heading write (KaInk, kind `ink`).** Selectors: `.gallery-head h2, #contact-title, #about-headline`. `build()` replaces the text with `.ink-w` word spans containing `.ink-l` letters (each with a random rotation up to ±4°).
2. `tick()` computes `tp` from the element top against the viewport (`CFG.startAt` 0.94 to `CFG.doneAt` 0.58 of viewport height). The reveal rate is `1/writeMs + vel × speedGain` (`writeMs` 1150 ms, `speedGain` 0.0007), so faster scrolling writes faster. A heading also finishes by itself after `dwellMs` 420 ms in view.
3. `render()` styles each letter: `opacity`, `clip-path: inset(...)` (a pen wipe from the left), `transform: translate3d(...) rotate(...)`, and a glow `text-shadow`. Finished letters get empty inline styles.
4. A heading that leaves the screen is reset (`reset(it)`) so it writes again. `mouseenter` on a word replays it (`replayWord`).
5. **Small texts (kind `emerge`).** Selectors: `.gallery-head p, .fav-filter, #contact-intro, .about-caption, .about-bio-text`. Each letter gets a random moment inside the progress range (`it.ts[i]`); letters unblur with `color: rgba(ink, ew²)` and a blur `text-shadow` up to `CFG.blurPx` 7 px. Elements with child markup fade as a whole (`mode "whole"`: opacity, `filter: blur(10px)`, `translate3d(0,12px,0)`). These blur back out when leaving the top of the screen (`CFG.exitAt` 0.04, `exitSpan` 0.12).
6. **Contact form.** `.contact-form label` text ghosts in per letter (kind `ghost`), and inputs, textarea and the submit button (`.contact-form input:not(.hp-field)`, `textarea`, `.contact-submit`) get `data-ghost` with CSS variable `--gp` from 0 to 1 (kind `box`). A sheen position `--sheen` on `#contact-card` follows scroll (`updateGlows()`).
7. **Hero fade.** The first IIFE sets CSS variable `--hero-fade` = `(1 − p)^1.35` where `p = scrollY / (innerHeight × 0.62)` and toggles class `hero-gone` at `p ≥ 0.999`.
8. **Section glows.** `updateGlows()` sets `--gy` (±70 px, `−top × 0.06`) on `#section-portfolio` and `#section-about`; the About glow blobs also move by `scrollY × 0.06` / `−0.04` (`updateParallax`).
9. **Fade-in blocks.** `revealOnScroll()` sets `.reveal-fade` (`opacity:0; filter:blur(10px)`) and the observer toggles `.is-visible` in both directions. Used for `#about-skills-block`, `#about-work-block` and others.
10. **About poster wall.** `playAboutIntro()` toggles `pw-play`/`pw-done` on `#poster-wall-intro` (five thumbnails, 620 ms), skipped under reduced motion.
11. **Count-up numbers.** `renderAboutStats()` builds tiles from `stats.items`; a tile with label "Projects" (case-insensitive) uses the real number of portfolio images (`projectCount`) and no suffix. Numbers are formatted with `toLocaleString("en-IN")`. The count starts when the tiles enter the screen, runs 900 ms with `1 − (1−p)³` easing, never goes back while visible, and restarts after the tiles fully leave. Reduced motion shows the final numbers at once.
12. **Footer names.** On `pointerenter` (mouse/pen only) the label letters appear in random order (`SPAN = 0.55`, 560 ms in, 340 ms out) with a brand-colour glow; keyboard `focus` does the same. On touch (`hover: none`) or reduced motion the names show as plain text.
13. **Chat letters.** `kaGhost()` adds each character as `<span class="gl" style="--d: Nms">` (random delay up to `spread`, default 380); used for the "Wanna chat?" hint (`spread` 420), the welcome bubble (`spread` 700) and streamed answers. On touch screens the hint shows once per session about 12 s after load (`sessionStorage.kaChatNudge`) for 4.8 s.
14. **Portal-set entrance animation.** `applyElementAnimations(styles)` reads `styles[id].animation = {preset, duration, delay, easing, trigger}` for ids in `PREVIEW_DRAGGABLE_IDS`. Presets: `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `scale-in`, `pop`. Easings: `linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `bounce` (`cubic-bezier(.34,1.56,.64,1)`). Trigger `load` plays at once; trigger `scroll` plays once when 12 % visible (`threshold: 0.12`). An unchanged config is not replayed (`state.key` JSON compare).

**About page story: bio, journey and promo cuts (added later; all editable in the portal).** All three come from one saved object, `about` in the site document (defaults in `shared/about-default.js`, an identical copy in `index.html` for the first paint). `window.kaRenderAbout(about)` in `index.html` applies it (called from `applySiteAppearance()`), so portal edits and the live preview update the page.
- **Bio:** `#about-bio-text`. The default no longer names films; it mentions movie campaign design, UI/UX, full-stack and application development (React, Node.js, cloud, APIs, databases, AI), and robotics (ROS, Arduino Nano, sensors, vision models, model training, Power BI).
- **Journey (points on a line):** `#about-journey`, drawn by `renderJourney()`. A "SINCE" badge counts up to the chosen year (from 21 years earlier, 1.1 s, `countYear()`). When 30% visible the line draws in 0.9 s, the points pop 0.1 s apart with a ring ping, and each title and line of text appears letter by letter with `window.kaGhost` (`showSteps()`). Reduced motion shows everything at once. A live edit shows the new points at once.
- **Promo cuts (YouTube):** `#about-reel-block`. `renderReel()` builds one card per video and a panel beside the stack (count such as "03 / 03", "Now playing" label, the video title, side text, dots to choose a cut, a "Watch the full video" button that opens the video at the clip's start time, and a channel button). The front card plays a **random clip** (`clipMin` to `clipMax` seconds, default 5–8; `clipFor()`), muted, never the whole video; then the stack moves and a different random video plays (`advance()`, sometimes skipping one). If a video's length is not set, the page reads it from the player (`getDuration()`) and then picks the random part. It uses the YouTube IFrame API (`https://www.youtube.com/iframe_api`, host `youtube-nocookie.com`), loaded only when the block is 35% visible, and pauses when the block or tab is hidden. The video is cropped hard (`.reel-player iframe` scale 1.55) so YouTube's title, time and controls are outside the frame. With reduced motion or data saver the stack stays still; cards and buttons still link to YouTube.
- **About numbers:** `renderAboutStats()` now also starts counting as soon as the numbers are on screen (an `IntersectionObserver` and an initial check), not only after a scroll.
- **Portal:** Content → Site text → **About story** edits the bio, the journey (year and points, add, reorder, remove) and the promo cuts (heading, intro, side text, button labels, channel link, clip range, videos by link or ID with optional length, on/off switches). The server checks it in `validateAbout()` (`server/admin/site-document.js`): YouTube links or IDs only, up to 8 points and 12 videos, a youtube.com channel link, at least one video when the section is on.

**Data saved:** Portfolio document in table `settings` (key `site`): `elementStyles[id].animation`, `stats`. Browser: `sessionStorage` key `kaChatNudge`.

**Controlled from the portal?** Yes, partly: **Studio** → "Elements" section sets font, colour and entrance animation per element; **Content** → "Site text" sets the About numbers (`stats`). Changes reach the live page when published (`PUT /api/admin/site` → `bumpLiveVersion()` → page polls `GET /api/live` → `loadPortfolioFromAPI()` → `applyElementStyles` / `applyElementAnimations` / `renderAboutStats`). The ink/emerge/ghost effects themselves have no portal switch (NOT FOUND IN CODE).

**Speed and smoothness:** one shared `requestAnimationFrame` loop that stops when nothing is moving (`kick()` / `moving`); `dt` capped at 64 ms; letters already finished carry no inline styles; per-letter work is skipped when the value did not change (`it.shown[i]`); for long texts (> 260 letters) a lighter single `text-shadow` is used; scroll listeners are passive; glows and counters are throttled with `requestAnimationFrame` flags.

**Screen sizes and accessibility:** Reduced motion: KaInk's text effects do not run at all (second IIFE returns at the top; only the hero fade runs); `.reveal-fade` becomes visible without transition (CSS lines 407–408); count-up and footer ghosting are skipped; element animations are skipped (`reducedMotion || !el.animate`). Touch devices: footer names stay visible. Real heading text stays readable by screen readers: the heading gets `aria-label` and the letter spans `aria-hidden`.

**Security:** Texts are inserted with `textContent`, not `innerHTML`, in KaInk and `kaGhost`. Portal-set animation values are validated on the server (`server/admin/site-document.js`: `ANIM_PRESETS`, `ANIM_EASINGS`, `ANIM_TRIGGERS`).

**Limits and edge cases:** If KaInk throws, it removes class `ink-on` and restores all styles (`catch` block). A `MutationObserver` rebuilds an element when its text is replaced (e.g. portal edits). `wordSpan` is marked unused in the code comment.

**Not found / unclear:** none beyond the portal-switch note above.

---

## 4. Skills section (board, logo chips, floating logo field)

**What it is:** A resume-style section on the About page. It shows categories of skills as logo chips, a detailed list for one category, and a field of blurred logos floating beside it.

**Where it runs:** Both. Data and validation: backend. Drawing: browser.

**Files:**
| File | Role |
|---|---|
| `index.html` lines 1477–1640 (CSS) and 7158–7490 (script "Part C") | Layout, board, chips, floating field, spotlight |
| `index.html` `DEFAULT_SKILLS` (line ~7164) | First-paint copy of the default skills (generated from the server defaults) |
| `shared/skill-logos.js` (+ `.d.ts`) | 102 logos and `skillLogoFor()` name matching |
| `client/src/skill-logos-entry.ts` | Lazy entry that exports the logo table → `dist/assets/skill-logos.js` |
| `server/admin/site-document.js` | `SKILLS_DEFAULT`, `SKILL_ICONS`, `SKILL_LIMITS`, `validateSkills()` |
| `server/handlers/public.js` → `loadSiteDocument()` | Adds default skills if the saved document has none |
| `client/portal/src/apps/Content.tsx` | Skills editor (`AboutSkills`, `LogoTile`, `SuggestedSkills`, logo picker) |
| `client/public/_headers` | `/assets/skill-logos.js` is `no-cache` |

**Tools and libraries:** brand icon paths come from the `simple-icons` package (CC0 data), copied into `shared/skill-logos.js` at generation time; the package is **not** a dependency of this project (NOT FOUND in `package.json`). Version of the icon data: NOT FOUND IN CODE.

**Browser features used:** Web Animations API (`el.animate()` in `spawnTile`), `IntersectionObserver` (field visibility `fieldVisible`; board entrance `boardIo`; logo bundle `logoIo` with `rootMargin: "500px"`), dynamic `import("./dist/assets/skill-logos.js")`, `document.createElementNS` (SVG logos), `visibilitychange`, `resize` (250 ms debounce `fieldResize`), pointer and focus events for the spotlight, `matchMedia` reduced motion, CSS `position: sticky`.

**Server APIs called:**
| Method | Path | Server file → function | What it returns |
|---|---|---|---|
| GET | `/api/portfolio` | `server/handlers/public.js` → `portfolio()` | Document with `skills` |
| GET | `/api/admin/site/skills-defaults` | `server/admin/content.js` (inline) | The shipped default board (portal button "Use the suggested set") |
| PUT | `/api/admin/site` | `server/admin/content.js` → `saveSite()` | Saves and validates the document |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `renderSkills(data)` | `index.html` | Applies title, intro, count line, board, filter, field |
| `renderSkillFilter()`, `setSkillFilter()` | `index.html` | Radio-group of category chips (arrow keys, Home/End) |
| `renderSkillBoard(animate)` | `index.html` | Overview: one row per category with logo chips; one category: detailed list with notes and level meter; phones show 4 categories plus a "Show all" button |
| `skillLogo(x)`, `paintLogo()` | `index.html` | Picks upload → library logo → letters |
| `loadSkillLogos()` | `index.html` | Loads the logo bundle once |
| `spawnTile()`, `pickSpot()`, `freeBounds()`, `nextSkill()`, `staticField()`, `startSkillField()`, `stopSkillField()` | `index.html` | The free floating logo field |
| `showSpot()`, `hideSpot()` | `index.html` | Spotlight of the hovered/focused/tapped skill |
| `skillLogoFor(item)` | `shared/skill-logos.js` | Chosen slug → name alias → none |
| `validateSkills(input)` | `server/admin/site-document.js` | Up to 14 categories and 24 skills each; checks colour, level 0–5, `logo`, `logoUrl` |

**How it works, step by step:**
1. The page loads default skills (`DEFAULT_SKILLS`) and renders them (`renderSkills(window.__kaLastPortfolioData && window.__kaLastPortfolioData.skills)`).
2. When `/api/portfolio` answers, `window.kaRenderSkills` is called with `skills` (from `applyPortfolioData`).
3. When the block is within 500 px of the viewport, `loadSkillLogos()` imports the logo bundle; then `renderSkills` runs again so logos replace letters.
4. `skillLogo(x)` chooses: owner-uploaded `logoUrl` (must match `^(https:\/\/|\/)…`), else `skillLogoFor(x)`, else letters (`skillCode(x)`).
5. Logo kinds (from `shared/skill-logos.js`): `b` brand mark (24×24 path in brand colour; dark colours lifted to `#E8E6E3`), `t` Adobe-style dark tile with outline and letters, `g` line glyph tinted by the skill colour, `f` filled glyph with gradient (Adobe Firefly stand-in). `skillLogoFor` matches `item.logo` (or `none` = letters), else the lower-cased, letters-and-digits-only name via `SKILL_LOGO_ALIASES`.
6. The board: filter "All" shows `.skill-card` rows (label column 112 px + chips); a single category shows rows with logo, name, note and a 5-bar level meter (`SKILL_LEVELS`: Learning … Expert).
7. The field (changed later, now a free field): `#skills-free` covers the whole skills block (`position:absolute; inset:0`, behind the board, no clipping or mask). `spawnTile()` places each logo at a random spot in the part of the block that is on screen (`freeBounds()`), choosing the emptiest of 8 random candidates (`pickSpot()`) so logos spread out. Each logo has a random size, depth (nearer ones are larger and sharper), drift direction and distance (kept inside the block), life of 5.2–11.5 s, and a random 0.15–2.2 s pause before the next one appears somewhere else. Skills come from a shuffled bag (`nextSkill()`), so there is no fixed order. Counts: 18 logos on desktop, 11 up to 900 px, 7 up to 600 px (never more than twice the number of skills in the chosen category, minimum 4), plus 6, 4 or 3 large blurred "far" logos. Start times are random over the first 6.5 s.
8. Far logos use the same function (`spawnTile(true)`): size 120–190 px, constant heavy blur, opacity about 0.3–0.46, life 14–24 s, inserted behind the others.
9. The sticky stage `.skills-field` (right column) holds the spotlight on screens wider than 900 px. On phones and tablets (up to 900 px) it is hidden and the spotlight becomes a card below the menu bar (`.skill-spot.is-sheet`, moved to `<body>`, closes after 6 s or on tap). On those screens the floating logos use no animated blur (`lite` mode in `spawnTile()`), the field restarts on rotation (`resize` and `orientationchange`) and the first logos appear within 3.4 s.
10. Spotlight: hovering (mouse), focusing or tapping a chip shows its logo large (112 px; 76 px ≤ 900) in the stage with name, level and note; `.is-spot` on `#skills-free` dims the floating logos.
11. Reduced motion: `staticField()` places up to 12 logos at still random spots (the farther ones softly blurred).

**Default skills:** `SKILLS_DEFAULT` (and its copy `DEFAULT_SKILLS` in `index.html`) has 12 categories: Design, Motion design, Video, AI & generative, Arts, Languages, Frontend, Backend, Database, APIs, **Robotics** (ROS, Sensor integrations, Arduino Nano, Vision-based navigation models) and **Data & ML** (Power BI, Model training). The last two were added after the first version of this guide; they use the logos `ros`, `sensor`, `arduino`, `vision`, `powerbi` and `neural` in `shared/skill-logos.js`. The defaults show only until the owner saves a Skills board in the portal; a saved board is not changed by new defaults.

**Data saved:** table `settings` key `site` → `skills` = `{enabled, title, intro, categories:[{name, icon, items:[{name, code, color, level, note, logo, logoUrl}]}]}`. Uploaded logo images go to R2 bucket `media` (`images/…`).

**Controlled from the portal?** Yes: **Content → Site text → Skills** (add/remove/reorder categories and skills; choose icon, colour, level, note; pick a library logo or "Letters only"; upload a logo; "Use the suggested set"). Publishing saves with `PUT /api/admin/site`; open pages reload content after `GET /api/live` changes.

**Speed and smoothness:** logo bundle loaded lazily; field starts/stops with an observer and on tab visibility; only `transform`, `filter` and `opacity` animate; `will-change: transform, filter, opacity`; board cards fade in once via `boardIo`; `contain: layout paint` on the field.

**Screen sizes and accessibility:** breakpoints at 600 px (one-column board, horizontal chip scroller, 4 categories + "Show all", field 180 px) and 900 px (single column, field above, smaller blur and spotlight). Reduced motion: still field and no card entrance. Chips are buttons with `role="radio"` and `aria-checked`; skill rows are focusable (`tabIndex = 0`) with `aria-label` containing level and note; the field is `aria-hidden`.

**Security:** The server refuses unknown logo slugs and non-own image URLs (`validateSkills`: `Pick a logo from the list…`, `isImageUrl`). Homepage inserts text with `textContent`.

**Limits and edge cases:** 14 categories, 24 skills per category, level 0–5, note ≤ 140 characters, code ≤ 3 characters, colour `#RRGGBB`. A bad value is rejected with an error instead of being dropped.

**Not found / unclear:** the main simple-icons data version (the logos added later came from `simple-icons` 13.21.0 for ROS and Arduino and 9.21.0 for Power BI, which later versions no longer ship); the shipped logo for "Adobe Firefly" is a stand-in drawing, as written in the generator header comment of `shared/skill-logos.js`.

---

## 5. Image hover effects (portfolio, work stacks, coverflow, lightbox)

**What it is:** Pointer and touch effects on pictures: stack cards that lean toward the cursor, a 3D coverflow carousel with drag and magnetic pull, a full-screen viewer with download and share, a classic coverflow with Ken Burns zoom, and a lightbox.

**Where it runs:** Frontend (React in a shadow root for Work stacks; plain JavaScript in `index.html` for coverflow and lightbox).

**Files:**
| File | Role |
|---|---|
| `client/src/WorkStacks.tsx` | `StackGrid` (stacks + magnetic tilt + entrance), `Coverflow` (spring carousel), `Viewer`, `DownloadButton`/`DownloadFill`, `ShareButton`, `WorkStacks` (root) |
| `client/src/workstacks.css` | Styles; media queries `(hover:hover)`, `(pointer:coarse)`, `(min-width:1900px)`, `(min-width:2500px)`, `(max-width:640px)`, `(max-width:760px)`, `(max-height:500px)`, reduced motion |
| `client/src/gallery-entry.tsx` → `mountStacks()` | Mounts `WorkStacks` into a shadow root |
| `client/src/types.ts` → `imageUrl()`, `Project` | Image sizes and URLs |
| `index.html` lines 5961–6155 | `buildPicture()`, `sampleDominantColor()`, `openLightbox()`, `renderLightbox()` |
| `index.html` lines 6156–6376 | `mountCoverflow()` (classic coverflow) |
| `index.html` CSS lines 893–1003, 1054–1075 | Coverflow, filmstrip, `kenburns`, lightbox |
| `images/*.webp`, `images/*.avif` | Poster exports in several widths (`-480`, `-800`, `-1600`, `-2400`, `-3840`, `-full`; per-poster list in `widths`) |

**Tools and libraries:** React 18.3.1 / react-dom 18.3.1 (Work stacks). No other library.

**Browser features used:** pointer events (`pointermove`, `pointerleave`, `pointerdown`, `pointerup`, `pointercancel`, `lostpointercapture`, `setPointerCapture`), `wheel` (horizontal trackpad scrub), `keydown`, `touchstart`/`touchmove`/`touchend` (lightbox swipe down), `requestAnimationFrame`, Web Animations API (stack entrance), CSS 3D (`perspective: 1600px`, `translate3d`, `rotateY`), CSS `@keyframes kenburns`, View Transitions API (`document.startViewTransition`, `view-transition-name: active-poster`), `IntersectionObserver`, `ResizeObserver`, `matchMedia('(hover: hover) and (pointer: fine)')`, `(pointer: coarse)`, `(prefers-reduced-motion: reduce)`, `localStorage` (`ka-pinned-posters`), canvas `getImageData` (dominant colour), `<picture>` with AVIF/WebP sources, `navigator.share` and `navigator.clipboard.writeText` (`WorkStacks.tsx` lines ~374–398: native share sheet when available, otherwise copy the link).

**Server APIs called:** `GET /api/portfolio` (`server/handlers/public.js` → `portfolio()`) supplies `images` (slug, title, category, `widths`, `full`, optional `src`, `downloadable`) and `folders`.

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `StackGrid` effect "Magnetic pull" | `WorkStacks.tsx` | Per frame eases each `.stack` toward cursor: `--mx`, `--my` (≤ 0.12 × distance), `--rx` (≤ 11°), `--ry` (≤ 13°), `--ms` (scale up to 1.05), `--fan` |
| `StackGrid` effect "entrance" | `WorkStacks.tsx` | Once per panel per page load: stacks scatter to place (desktop: 1000 ms, stagger 110 ms, `cubic-bezier(.34,1.32,.64,1)`, random start and ±20° rotation); on coarse pointers a 520 ms rise-and-fade with 60 ms stagger |
| `Coverflow` → `layout()` | `WorkStacks.tsx` | Per card: x offset, depth (`z`), `rotateY` up to 46°, scale `1 − min(ad,VISIBLE) × 0.075`, opacity, z-index |
| `Coverflow` → `magnet()` | same | Hover pull (≤ 0.22 × distance, scale up to 1.07) and soft shadow |
| `Coverflow` → `frame()` | same | Spring `k=150`, damping `2·√k·0.85`, sub-stepped to 1/120 s |
| `down()`, `move()`, `up()` | same | Drag to scrub with momentum (flick up to ±3 cards) |
| `mountCoverflow()` → `render()` | `index.html` | Classic coverflow card transforms: `translate3d(offset×0.58×cardWidth, 0, −150×|offset|px) rotateY(clamp(offset×16, −38, 38)°) scale(1 − min(0.4, |offset|×0.16))` |
| `armIdleKenBurns()` | `index.html` | After 8 s idle, adds `kb-active` so the picture slowly zooms (`kenburns` 14 s alternate, scale 1→1.08) |
| `openLightbox()`, `renderLightbox()`, `closeLightbox()` | `index.html` | Full-screen viewer with pin, download, keyboard and swipe-down close |
| `buildPicture()` | `index.html` | `<picture>` with AVIF source, WebP source, WebP fallback `img` |

**How it works, step by step (Work stacks):**
1. `WorkStacks` groups `images` by folder (`folders`), picks each stack's cover (`settings.stacks.covers[name]` or first image).
2. `StackGrid` renders a button per stack with up to three layers (`front`, `l1`, `l2`); `StackImg` fades each image in (placeholder if it fails).
3. On a mouse (`(hover: hover) and (pointer: fine)`) and without reduced motion, the pointer moves set `px`, `py`; `tick()` computes proximity (`prox`) to each stack and eases the CSS variables above (`k = 0.17` inside, `0.12` outside) until still.
4. Clicking a stack opens `Coverflow`: cards are positioned by `layout()`; the centred card is tapped to open `Viewer`; arrows keys, wheel, drag and buttons move the carousel; Escape goes back one level.
5. Short stacks repeat virtually when looping is on so no seam shows (`slots`).
6. Image URLs: `sized(p, min)` picks the smallest width ≥ needed; `q(base, cap)` multiplies by `devicePixelRatio` (cap 2×); AVIF is used when a 1-pixel probe decodes (`avif`).

**How it works (classic coverflow and lightbox):** `mountCoverflow(container, posters, opts)` builds cards, a filmstrip (56×72 px thumbnails, `-480.webp`) and prev/next buttons; `render()` positions cards; `sampleDominantColor()` draws the 480-px image to a 24×24 canvas and sets `--cf-glow` for a blurred backdrop; pointer move over the viewport moves the backdrop up to 12×18 px and the track 6×4 px (`parallaxRAF`); horizontal drag > 36 px changes card. `openLightbox()` uses the View Transitions API when available (picture "flies" from the card), otherwise opens directly; the image is `p.widths …avif` srcset plus `-full.webp`.

**Data saved:** Pins in `localStorage` key `ka-pinned-posters` (`setPinned()`). Portfolio images and folder order in table `settings` key `site`.

**Controlled from the portal?** Yes: **Content → Portfolio** (images, folders, stack covers, loop on/off through `site.stacks = {loop, covers}`; validated by `server/admin/site-document.js`). Download availability per image: `downloadable` flag.

**Speed and smoothness:** only cards within `VISIBLE` range are shown/measured; hidden cards `visibility: hidden` and `inert`; `img` `src` is set only near the viewport; images use `decoding="async"` and `loading="lazy"` (first three cards eager); `transform`-only animation; loops stop when idle (`busy` flags); AVIF is about a third smaller than WebP according to the code comment.

**Screen sizes and accessibility:** Coverflow card width `--card-w: clamp(180px, 27vw, 340px)`; at ≤ 600 px larger touch targets; at ≤ 540 px height in landscape the lightbox padding shrinks (line 1092). Hover effects apply only to a fine pointer; touch uses drag and tap. Reduced motion: no tilt, no Ken Burns, no spring (`pos = target`). Cards have `role="group"`, `aria-roledescription="slide"`, labels with position; the stage is a `role="region"` carousel with keyboard arrows; the lightbox traps Tab (`trapLightboxTab`) and returns focus on close.

**Security:** image paths come from the validated portfolio document; text is inserted with `textContent` / `escapeHtml()`.

**Limits and edge cases:** `VISIBLE = 3` in `WorkStacks.tsx` (line ~486): cards more than 3 steps from the centre are hidden; pins stored only in the browser; if the canvas is tainted, the glow falls back to `rgba(255,148,56,0.25)`.

**Old 3D folder scene (removed):** an earlier 3D opening-folder gallery (`Gallery.tsx`, `FolderScene.tsx`, Three.js and GSAP) was deleted from the project. The Work panel is `mountStacks()` with `WorkStacks` (no Three.js, no GSAP).

**Not found / unclear:** the contents of `Viewer` and `DownloadFill` were not read in full (named only); `ShareButton` uses `navigator.share` and `navigator.clipboard.writeText` (lines ~374–398).

---

## 6. Page navigation (sections, swipe, deep links)

**What it is:** The site has four pages (Contact, About, Store, Tips) inside one HTML file. A bar switches between them; links can open a page or item directly; on touch screens an edge swipe moves to the next page.

**Where it runs:** Frontend only.

**Files:**
| File | Role |
|---|---|
| `index.html` lines 6573–7104 | Nav items, pill motion and drag, `switchSection()`, menu, deep links |
| `index.html` lines 10488–10616 | Swipe script |
| `index.html` CSS lines 392–399, 10483–10487 | Section fade keyframes and swipe-direction keyframes |

**Tools and libraries:** none.

**Browser features used:** pointer events with `setPointerCapture` (pill drag); `touchstart` / `touchmove` / `touchend` / `touchcancel` with `capture: true` (swipe); `history.pushState`; `URLSearchParams`; `navigator.vibrate` (8 ms; only after a user gesture, guarded by `navigator.userActivation`); `document.fonts.ready` (label measuring); `CustomEvent` (`ka-open-product`, `ka-open-tip`); CSS custom properties `--swipe-x`, `--swipe-o`; attribute `data-nav-dir`.

**Server APIs called:** none for navigation itself. `window.kaTrackView("/?page=" + page)` sends a visit event (feature 18).

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `renderNavItems()`, `measureNavLabels()` | `index.html` | Builds the buttons from `NAV_ITEMS` (contact, about, store, tips); measures each label width |
| `movePill()` | `index.html` | Moves the highlight pill with the same duration (`NAV_MS` 300) and curve as the CSS |
| `switchSection(name, focusTarget)` | `index.html` | Hides current sections after a fade (300 ms; 150 reduced), shows the new ones, scrolls, loads Store/Tips bundles, mounts the gallery |
| `navPage(name)`, `pageSections(page)` | `index.html` | Maps `portfolio` to page `about` (About ends with the Portfolio section) |
| `window.kaOpenLink(href)` | `index.html` | Opens `/?product=`, `/?tip=`, `/?page=` links without reload; `pushState` |
| swipe: `ownsSwipe()`, `follow()`, `release()`, `busy()` | `index.html` | Edge swipe logic |

**How it works, step by step:**
1. Nav click → `switchSection(name)`. `data-nav-dir` is set to `next` or `prev` from the nav order so CSS can slide in the right direction. The `aria-current` item changes, `movePill()` runs, and the visit is tracked.
2. Current sections get `fading-out` for 300 ms; then `hidden` is toggled, the incoming ones get `fading-in`; About plays `playAboutIntro()` (or the work strip is built when entering through the portfolio link); Store/Tips call `loadStorePage()`; Contact restarts the card transition.
3. Keyboard: arrows, Home, End on the nav move between pages (roving focus). The pill can also be dragged (`pointerdown` … `processNavDragStep`, Escape cancels).
4. Deep links on load: `?product=<slug>` → Store, `?tip=<slug>` → Tips, `?page=store|tips|contact` → that page.
5. Swipe: `touchstart` starts only when the finger begins within `zone()` of an edge (`max(28, min(120, innerWidth × 0.2))` px), the target is not an input, the nav, a horizontally scrollable element that can still scroll that way, or `[data-no-page-swipe]`, no modal/chat is open (`busy()`), and a neighbouring page exists.
6. `touchmove`: the gesture is cancelled if mostly vertical (`|dy| > |dx| × 0.8`) or moving outward; otherwise page content follows the finger at 0.32× (0.1× at the ends), with an edge hint ring showing progress.
7. `touchend`: commit when travel ≥ `need()` (`max(70, min(150, innerWidth × 0.24))` px) or a flick (velocity > 0.45 px/ms and travel > 40 px); the target nav button is clicked; otherwise content springs back (360 ms). At the first/last page the hint reads "First page"/"Last page" and nothing switches.

**Data saved:** none (URL query only).

**Controlled from the portal?** NOT FOUND IN CODE for navigation order (the list `NAV_ITEMS` is fixed in `index.html`). Page titles/intro text are editable in the portal (feature 23).

**Speed and smoothness:** passive listeners; swipe styles use `transform` and `opacity` only; `moversOf()` excludes `position: fixed` elements; `measureNavLabels()` re-runs on fonts ready, load and resize; `will-change`/transition timing shared with CSS.

**Screen sizes and accessibility:** swipe applies to touch only; hint and movement are skipped under reduced motion (`movers = []`); nav buttons have `aria-label` and `aria-current="page"`; the menu has `role="menu"` with arrow-key navigation; focus moves to the section heading when requested (`focusSectionHeading`).

**Security:** `kaOpenLink` accepts only same-origin links to `/` or `/index.html`.

**Limits and edge cases:** a second switch during a transition queues a scroll (`pendingScroll`); `Image Upscaler` and `Typography` are menu items, not pages.

**Not found / unclear:** none.

---

## 7. Screen compatibility / responsive design (phone, tablet, desktop, reduced motion)

**What it is:** The site and portal adapt to screen size, input type (touch or mouse), height and user preferences using CSS media queries, container queries and JavaScript checks.

**Where it runs:** Frontend only.

**Files:** `index.html` (CSS and scripts), `client/src/*.css`, `client/src/store/store.css`, `client/src/store/checkout/checkout.css`, `client/src/studio/studio.css`, `client/portal/src/{tokens,portal,apps}.css`, `client/portal/index.html`.

**Tools and libraries:** none.

**Browser features used:** CSS `@media`, `@container`, `clamp()`, `env(safe-area-inset-*)`, `100svh`, viewport meta (`width=device-width, initial-scale=1`), `window.visualViewport`, `matchMedia`, `navigator.deviceMemory`, `navigator.hardwareConcurrency`, `devicePixelRatio`.

**Server APIs called:** `GET /api/public-config` supplies the visitor's country → suggested currency (not layout).

**Key functions:** `kaZoomed()`, `kaLayoutW()`, `kaLayoutH()` (`index.html` lines 26–28: use layout size instead of zoomed visual viewport so pinch-zoom does not shrink the WebGL canvas); `computeResponsiveFovBase()` (hero); `renderPixelRatio()` (hero); `perfScale` (hero and nebula).

**Breakpoints in `index.html` (from the stylesheet; line = where the query starts):**
| Query | What changes |
|---|---|
| `(pointer:coarse)` (166) | Body and inputs `touch-action`/text-size rules for touch |
| `(max-width:640px)` (240, 532, 715, 826) | Visitor counter, base font sizes/headings/paragraph width, contact form, upscaler card |
| `(max-width:760px)` (488) | Section edge overlays (`#section-portfolio::after` etc.) |
| `(min-width:1500px)` (541) | `:root` size variables |
| `(max-width:520px)` (777, 9705) | About stats, footer |
| `(max-width:600px)` (1077, 1213, 1282, 1592, 1634, 8650, 8685, 9140, 9525–9546) | Nav bar and menu touch sizes, coverflow, shop shell, skills board (one column, chip scroller), headline sizes, chat launcher and a near-full-screen chat sheet, panda mascot, chat panel, folder grid, skill labels |
| `(max-width:900px)` (1582, 1586) | Skills layout becomes one column; field above the board |
| `(max-width:420px)` (1248, 9957) | Notify row, headline |
| `(max-width:700px)` (9926) | Portfolio shelf header |
| `(pointer:coarse), (max-width:760px)` (9556) | Bigger inputs and chips, spacing |
| `(max-width:760px), (max-height:500px) and (pointer:coarse)` (9563) | Chat panel layout |
| `(min-width:601px) and (max-width:1366px) and (min-height:521px) and (pointer:coarse)` (+ portrait / landscape variants) (9578–9587) | Tablet chat panel |
| `(max-height:560px)`, `(max-height:500px)`, `(max-height:540px) and (orientation:landscape)` | Short screens: chat head/messages, coverflow, lightbox |
| `(min-width:1900px)`, `(min-width:2500px)`, `(min-width:3400px)` (1219–1224, 1279–1281, 9952–9954, 10030–10032) | Larger `:root` sizes, wider shop, folder shelf, About, coverflow for large monitors/TVs |
| `(hover:hover) and (pointer:fine)` (1176, 9621) | Hover effects for nav and chat launcher |
| `(hover:none)` (9700, 10020) | Footer names visible; contact button sheen off |
| `(prefers-reduced-motion: reduce)` (about 25 queries in `index.html`) | Removes or shortens animations and transitions |
| `(prefers-reduced-transparency: reduce)` (3) | Removes frosted-glass transparency |

**Other stylesheets (breakpoints found):** `client/src/workstacks.css` (640, 760, 1900, 2500 px; height 500; hover; coarse); `client/src/gallery.css` (600, 760, 850, 1600; height 550 + width 601); `client/src/style.css` (640); `client/src/store/store.css` (420, 520, 600, 1900, 2500, 3400 px; hover/fine; coarse; `forced-colors: active`); `client/src/store/checkout/checkout.css` (359, 767, 768, 1024, 1900, 2500 px; heights 520 landscape and 760); `client/src/studio/studio.css` (700, 1900, 2500; coarse); portal `tokens.css` (1900, 2500, 3400 px; `prefers-color-scheme: light`; `prefers-contrast: more`; coarse; reduced motion), `portal.css` (container 520/700/780; light scheme; reduced transparency), `apps.css` (container 520, 560, 640, 700, 760, 820; `print`).

**How it works:** CSS rules above apply by media query. JavaScript sets quality by device: hero `isMobile` (`max-width:760px` or mobile user agent), nebula `isMobile` (`max-width:1024px` or coarse pointer), `perfScale` 0.55 on low-memory/low-core mobiles, pixel-ratio budgets; the Work stacks use `useMedia()` for hover/coarse/reduced; the portal uses container queries on `.win-body` (`container-type: inline-size`), so apps adapt to **window** width, not only screen width.

**Data saved:** none. (Layout position overrides per device are saved by the portal: see feature 23, `layoutOverrides` for `mobile`, `tablet`, `desktop`.)

**Controlled from the portal?** Partly: **Studio → Arrange** saves element positions separately for desktop, tablet and phone; `currentLayoutBreakpoint()` and `applyLayoutOverrides()` in `index.html` apply them.

**Speed and smoothness:** quality tiers (pixel budgets, counts) rather than layout changes; `matchMedia` change listeners are used for reduced motion in each animation script.

**Screen sizes and accessibility:** touch targets: nav and chat controls have 44 px minimums (e.g. `.cf-controls button{width:44px;height:44px}`, `#lb-close{min-width:44px;min-height:44px}`); safe-area insets are used (`env(safe-area-inset-bottom)`, etc.); reduced motion and reduced transparency respected; contrast and forced-colours handled in portal tokens and store CSS as listed.

**Security:** none.

**Limits and edge cases:** the viewport meta comment in `index.html` warns that a missing viewport tag would make mobile queries never apply; pinch-zoom is handled by `kaLayoutW()`/`kaLayoutH()`.

**Not found / unclear:** a complete line-by-line list of declarations inside every query was not extracted; the tables above list each query and the first selectors it affects.

## 8. Typography studio (drawing/typing canvas)

**What it is:** A full-screen drawing and lettering canvas opened from the site menu ("Typography"). The visitor draws with a mouse, finger or pen, or places text. The studio can replay the drawing and export an image or a video. Nothing is uploaded.

**Where it runs:** Frontend only. It is a separate lazy bundle (`dist/assets/studio.js`).

**Files:**
| File | Role |
|---|---|
| `client/src/studio/studio-entry.ts` | `openStudio()`, class `Studio`: toolbar, input, text editor, replay, export, fullscreen (779 lines) |
| `client/src/studio/engine.ts` | Stroke/text data model, ten brushes, symmetry, blend modes, filters, background drawing, `renderScene()`, `replayTimeline()` (423 lines) |
| `client/src/studio/studio.css` | Styles (shadow root); media queries 700 px, 1900 px, 2500 px, `(pointer:coarse)`, reduced motion |
| `index.html` → `openTypographyStudio()` (line 7042) | Imports `./dist/assets/studio.js` and calls `openStudio({returnFocus})` |
| `vite.config.mjs` | Entry `studio` → fixed file name `assets/studio.js` |
| `tests/studio-engine.test.mjs` | Tests the engine (5 tests) |

**Tools and libraries:** none beyond TypeScript/Vite (no `three`, no `gsap`). Google Fonts stylesheet for ten text fonts is added at runtime (`FONT_CSS` → `<link id="ka-studio-fonts">` to `https://fonts.googleapis.com/css2?...`).

**Browser features used:** Canvas 2D (`getContext('2d')`, `DOMMatrix`, `globalCompositeOperation`, `ctx.filter`), `HTMLCanvasElement.toBlob`, `MediaRecorder` + `canvas.captureStream(30)` (video export), `URL.createObjectURL` (download), pointer events with `setPointerCapture` and `getCoalescedEvents()`, `requestAnimationFrame`, `visibilitychange`, `fullscreenchange` / `requestFullscreen` (and `webkitRequestFullscreen`), Shadow DOM (`attachShadow`), `navigator.deviceMemory`, `devicePixelRatio`, `<textarea>` for text entry, an ARIA live region.

**Server APIs called:** none.

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `openStudio(options)` | `studio-entry.ts` | Creates one `Studio` (ignored if already open) |
| `Studio.resize()` | `studio-entry.ts` | Sets three canvas layers (`bg`, `ink`, `live`), pixel ratio ≤ 2 with a pixel budget (2.5 M pixels if `deviceMemory ≤ 4`, else 5 M) |
| `Studio.bindInput()`, pointer handlers | `studio-entry.ts` | Starts a stroke on pointer down, adds points (coalesced), ends on up |
| `newStroke()`, `pushPoint()` | `engine.ts` | A stroke is `{kind, id, seed, s: Settings, pts: Float32Array (x, y, t, pressure), n, start, end}` |
| `drawItem()`, `drawStroke()`, `drawText()` | `engine.ts` | One renderer per brush; text with a chosen font |
| `renderScene()` | `engine.ts` | Draws every item at a scale; used for the live view, replay and every export |
| `replayTimeline()`, `retimed()` | `engine.ts` | Re-times items so the drawing replays in order |
| `Studio.startReplay()`, `endReplay()` | `studio-entry.ts` | Replay |
| `Studio.exportImage(format, size, transparent)` | `studio-entry.ts` | PNG or JPEG (quality 0.95) |
| `Studio.exportVideo()` | `studio-entry.ts` | Replay recorded to MP4/WebM |
| `Studio.spaceSnapshot()` | `studio-entry.ts` | Copies the pixels of the site's `#nebula-bg canvas` so exports can include the space background |

**How it works, step by step:**
1. The menu item calls `openTypographyStudio()`, which imports the bundle (error toast "The Typography studio couldn't load…" if it fails).
2. `new Studio()` adds CSS that hides the page except `#nebula-bg` (`html.ka-studio-open body > *:not(#nebula-bg)…{visibility:hidden}`), creates a shadow-root dialog (`role="dialog"`, `aria-modal`), builds the toolbar and canvases, and announces the shortcuts.
3. Drawing: pointer down → `newStroke()` with the current settings; each move adds points (x, y, time since stroke start, pressure); the live layer shows the stroke; on release the stroke is stored in `session.items` and baked onto the ink layer (`bake()`); an undo entry is added (`session.undo`; `redo` stack).
4. Tools: `brush`, `eraser`, `text` (`session.tool`). Text: a `<textarea>` appears; `commitText()` on blur stores a `TextItem` with font and size (`fontPx` default 56).
5. Brushes (`BRUSHES`): Round pen, Marker, Calligraphy, Pencil / chalk, Spray, Neon glow, Ribbon, Particle trail, Dotted, Dashed. Settings: colour, second colour + gradient, opacity, size (default 8), smoothing, pressure, symmetry (`none`, `mirror-x`, `mirror-y`, `quad`, `radial` with 2–24 segments), blend (Normal, Add, Screen, Multiply, Overlay, Difference, Dodge), glow, blur, lifetime (fading trail), flow, wobble.
6. Backgrounds (`Background`): live space (`space`), solid, gradient. Filters (`FILTERS`): None, Mono, Sepia, Vivid, Dream, Invert (CSS filter strings).
7. Wobble and particles are deterministic from the stroke's `seed` (`rng()` xorshift; `noise1`), so replay and export match the screen.
8. Replay: `replayTimeline()` and `retimed()` build offsets; frames draw only points with `start + t ≤ clip`.
9. Image export: size options from `exportSize(kind)`: native (`devicePixelRatio` up to 2×), `2x`, or `4k` (3840 px long edge, 2560 on low-memory devices), capped by a pixel budget (9 M or 16.6 M). Transparent PNG omits the background. The result is downloaded as `ka-typography-<timestamp>.png|jpg`.
10. Video export: type chosen from `video/mp4;codecs=avc1.42E01E`, `video/mp4`, `video/webm;codecs=vp9`, `vp8`, `video/webm` (first supported); 30 fps, 8 Mbit/s, up to 1920×1080 (even sizes); a progress bar is shown; if unsupported a toast explains.
11. Close restores the page and returns focus to the menu button.

**Data saved:** only in memory for the open session (`session` object: items, undo, redo, settings). Not saved anywhere after the page closes (the file header says the drawing stays in memory while the page is open).

**Controlled from the portal?** NOT FOUND IN CODE.

**Speed and smoothness:** the loop runs only while something moves (`kick()`, `stopLoop()` when the tab is hidden); permanent strokes are baked once onto the ink layer, only live/fading items are redrawn each frame (`baked`, `animated` sets); a stroke point cap `MAX_POINTS` = 250,000; coalesced pointer events for smooth lines; Float32Array storage that doubles when full.

**Screen sizes and accessibility:** letterboxed "world" size keeps the drawing when the window resizes (`scale`, `offX`, `offY`); toolbar can be hidden (`hide-tools` / `show-tools`); fullscreen toggle; touch and pen supported; ARIA live region (`announce`), toast messages, keyboard shortcuts (press `?` for help; Escape handling at line 609); reduced-motion rules and `(pointer:coarse)` rules in `studio.css`.

**Security:** all work stays in the browser; the only network request is the Google Fonts stylesheet; file download uses a Blob URL revoked after 4 s.

**Limits and edge cases:** `MAX_POINTS` 250,000 points; video export needs `MediaRecorder` and `captureStream`; JPEG always has a background; if the nebula canvas cannot be read, a drawn fallback background is used (`drawSpaceFallback`) and a toast says so.

**Not found / unclear:** the exact list of keyboard shortcuts was not extracted (the help dialog template `TEMPLATE` was not read line by line).

---

## 9. Panda mascot

**What it is:** A small 3D panda that lives on the chat button. It plays idle activities, looks toward the pointer, climbs down a thread to sit above the open chat panel, and returns.

**Where it runs:** Frontend only. Loaded as a lazy module (`dist/assets/panda.js`).

**Files:**
| File | Role |
|---|---|
| `index.html` lines 9143–9175 (`<script type="module">`) | Creates `#panda-mascot` and the welcome bubble; loads the bundle after the intro |
| `client/src/panda.ts` | `mountPanda(host, launcher, options)`: renderer, camera, lights, loop, travel, thread drawing, disposal |
| `client/src/panda-character.ts` | `createPanda(compact)` builds the panda from code; `loadPanda()` (GLTF path, not used) |
| `client/src/panda-activity.ts` | `createActivityClock()` chooses the activity |
| `client/src/panda-travel.ts` | Travel stages and the thread spring |
| `index.html` CSS (lines 8636–8752, 9124–9142) | Launcher, mascot and bubble styles |
| `tests/panda.test.mjs` | 10 tests |

**Tools and libraries:** `three` 0.185.1 (bundled by Vite; about 600 KB according to the loader comment).

**Browser features used:** WebGL (`THREE.WebGLRenderer`, alpha, `powerPreference: 'low-power'`, ACES tone mapping), `requestAnimationFrame`, `requestIdleCallback` (fallback `setTimeout`), `IntersectionObserver`, `ResizeObserver`, `matchMedia` (reduced motion, `(pointer: coarse)`), `pointermove`, `focus`, `blur`, `click` on the launcher, `visibilitychange`, `pagehide`, `pageshow`, `webglcontextlost` / `webglcontextrestored`, `crypto.getRandomValues` (random seed), inline SVG for the thread, `sessionStorage` (`pandaWelcomeShown`), `AbortController` for listeners, custom event `ka-chat-state`.

**Server APIs called:** none.

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `startPanda()`, `schedulePanda()`, `queuePanda()` | `index.html` | Dynamic `import('./dist/assets/panda.js')`, started on idle |
| `mountPanda()` | `panda.ts` | Builds everything; returns `dispose()` |
| `movePanda(dt)` | `panda.ts` | Positions the panda by travel stage and draws the thread |
| `draw(dt)`, `tick()`, `schedule()` | `panda.ts` | Frame loop |
| `createPanda(compact)` | `panda-character.ts` | Original geometry: spheres (20×16 segments compact, 32×24 full), jointed parts, fur silhouette; "No downloaded artwork" per code comment |
| `createActivityClock(seed, available)` | `panda-activity.ts` | Random bag of activities, one every 60 s |
| `advanceTravel()`, `travelPose()` | `panda-travel.ts` | Stage timing and position |
| `stepThreadSpring()` | `panda-travel.ts` | Damped spring (`d=5.5`, `w=16`) for the thread |

**How it works, step by step:**
1. `index.html` adds `#panda-mascot` and a bubble "Hi, I'm Panda. Ask me about the work." to `#assistant-launcher`.
2. The bundle is queued when `ka-sequence-complete` fires (hero finished) via `requestIdleCallback` (timeout 1800 ms); a fallback timer starts it after 12 s if the hero never completes.
3. `mountPanda()` creates the renderer, camera (FOV 32 at (0.2, 1.4, 5.2)), hemisphere light plus key and fill directional lights, and a soft contact shadow disc. The character is `createPanda(lowPower)` where `lowPower = (pointer: coarse) || hardwareConcurrency ≤ 4`. No `modelUrl` is passed from `index.html`, so the GLTF path (`loadPanda`, `three/addons/loaders/GLTFLoader.js`) is not used.
4. Activities (`activities`): relaxing, sleeping, calling, eating, playing, stretching, watching. `createActivityClock` picks one from a shuffled bag every 60 seconds, easing in and out over 2.4 s.
5. Pointer over the launcher sets a look target (`target`), eased with `1 − exp(−dt × 4)`.
6. Travel stages (`TravelStage`): `idle`, `down` (2.2 s), `perched`, `release` (0.34 s), `fall` (0.8 s), `return` (2.1 s). When the chat opens (`ka-chat-state` event) the panda slides down a thread to a perch above the panel (or beside it on tablets, or hides on phones where the sheet fills the screen); when the chat closes it releases the thread, falls and returns up a web with a "Hi, I'm back!" bubble.
7. Pointer moving near the thread plucks it (spring `tension`).
8. Reduced motion: `advanceTravel` jumps straight to `perched` or `idle`; no activities, a single still render.

**Data saved:** `sessionStorage.pandaWelcomeShown` (welcome bubble shown once per visit).

**Controlled from the portal?** NOT FOUND IN CODE (the launcher position can be dragged in the Studio preview via `assistant-launcher` in `DRAGGABLE_IDS`; see feature 23).

**Speed and smoothness:** loaded after the hero; renderer pixel ratio ≤ 1.5 (low power) or 2 and limited by `sqrt(100000 / area)`; loop only runs when visible (IntersectionObserver), not hidden, not context-lost; `dt` capped at 0.1 s; resources disposed on `pagehide` and re-queued on `pageshow` from the back-forward cache.

**Screen sizes and accessibility:** `compact` mode on coarse pointers; `(max-width:600px)` rule for `#panda-mascot` and `.panda-bubble` (index.html line 9140); the canvas is `aria-hidden`; the greeting bubble has `role="status"`.

**Security:** none relevant.

**Limits and edge cases:** if mounting throws, `mascot.classList.remove('is-ready')` and the plain chat icon remains.

**Not found / unclear:** details of each activity's pose animation inside `createPanda().update()` were not read line by line.

## 10. Store and product browsing

**What it is:** The shop inside the Store page. It lists published items in two tabs (Artzz and Artifacts), with filters, sorting, a currency switch (INR or USD), a product viewer with reviews, and a "Buy" button.

**Where it runs:** Both. The list and prices are built by the server; filtering, sorting and display run in the browser (React inside a shadow root).

**Files:**
| File | Role |
|---|---|
| `client/src/store/store-entry.tsx` | `mountStore()`, `mountTips()`; shadow root; lazy `Checkout` |
| `client/src/store/Store.tsx` | Tabs, currency switch, `Panel` (filters, sort, groups), `ArtTile`, `ArtifactCard`, `Ribbon`, `PriceTag`, `Lightbox` with reviews |
| `client/src/store/api.ts` | `getJson`, `postJson`, `publicConfig`, currency helpers, `formatPrice` |
| `client/src/store/hooks.ts` | `useFocusTrap`, `useSwipe`, `useMedia` |
| `client/src/store/overlay.ts` | `overlayLayer()`: body-level layer for dialogs |
| `client/src/store/store.css` | Styles |
| `server/handlers/store-public.js` | `catalog()`, `product()`, `reviews()`, `productDto()` |
| `server/store/pricing.js` | `priceFor()`, `percentOff()`, `formatMoney()`: the only place prices are worked out |
| `server/admin/catalog.js` | Portal side: products, categories, licenses, media, files |
| `migrations/0001_init.sql`, `0002_ratings_and_location.sql` | Tables `products`, `product_media`, `product_files`, `categories`, `licenses`, `product_ratings` |

**Tools and libraries:** React 18.3.1 and react-dom 18.3.1 (`createPortal` for the lightbox).

**Browser features used:** Shadow DOM (`attachShadow` in `shadowHost()`), `fetch`, `AbortController`, `sessionStorage` (`ka-store-tab`), `localStorage` (`ka-currency`), `Intl.NumberFormat` (`formatPrice`), `Intl.DateTimeFormat`, custom events `ka-content-changed` and `ka-open-product`, keyboard events on tabs/chips, touch swipe in the lightbox (`useSwipe`), `matchMedia`.

**Server APIs called:**
| Method | Path | Server file → function | What it returns |
|---|---|---|---|
| GET | `/api/public-config` | `server/handlers/public.js` → `publicConfig()` | `suggestedCurrency`, `store.enabled`, `store.international`, keys |
| GET | `/api/store/catalog` | `server/handlers/store-public.js` → `catalog()` | `{products[], categories[]}` (published only, max 500) |
| GET | `/api/store/products/:slug` | `store-public.js` → `product()` | One product |
| GET | `/api/store/products/:slug/reviews` | `store-public.js` → `reviews()` | Up to 20 visible reviews |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `productDto(p, now, show)` | `store-public.js` | Public shape: prices per currency, license, media, `downloads` and `rating` (hidden when the owner turns them off) |
| `priceFor(product, currency, now)` | `pricing.js` | `{amount, compareAt, onSale, saleEndsAt, free, available}`; sale applies only inside its start/end window and when below the regular price |
| `percentOff(p)` | `pricing.js` | Whole percent, rounded down |
| `Panel` | `Store.tsx` | Filters: price (`all`, `free`, `paid`, `sale`), category chips with counts, sort (`featured`, `price-asc`, `price-desc`, `popular`, `rating`); "All" in owner order is grouped by category |
| `isFree()`, `priceMatches()`, `sortPrice()` | `Store.tsx` | Free items sort first; items that cannot be bought sort last |
| `setCurrency()`, `getCurrency()` | `api.ts` | Currency from `localStorage` key `ka-currency`, else the country suggestion |

**How it works, step by step:**
1. Opening the Store page: `loadStorePage('store')` imports `dist/assets/store.js` and calls `mountStore(root, {initialProduct})` (`index.html` ~line 7018–7030).
2. `Store` loads the catalog (`GET /api/store/catalog`), shows skeleton tiles first, then the two tab panels (`role="tabpanel"`). The active tab is remembered in `sessionStorage` (`ka-store-tab`).
3. Currency: `publicConfig()` returns `suggestedCurrency` (`currencyFor(country)`: INR for country `IN`, else USD). A remembered choice wins. If the owner paused international sales (`store.international === false`), everyone is forced to INR and the switch becomes a single "₹ INR" label.
4. Server prices: `productDto()` calls `priceFor()` for `INR` and `USD`; the browser formats with `Intl.NumberFormat` (`en-IN` for INR, `en-US` for USD).
5. Artzz shows `ArtTile` cards (picture, title, rating, price, small buy button, a "Free" or "−N%" ribbon). Artifacts shows `ArtifactCard` (screenshot count, version, summary, tech tags, license, sale end date, "Live demo"/"Preview" link, buy button).
6. The viewer (`Lightbox`) steps through the items on screen in screen order, shows media, description (`descriptionHtml` from safe Markdown rendering), reviews (`GET …/reviews`) and the buy button.
7. Opening a link `/?product=<slug>` sets `wanted`, switches to the right tab and opens that item once the catalog is in. A change published in the portal fires `ka-content-changed` and the catalog is re-read quietly.
8. "Buy" calls `onBuy(product, currency, opener)`, which opens the checkout dialog (feature 11). "Bought something before? Email me my download links" opens the resend dialog.

**Data saved:** Tables `products`, `product_media`, `product_files`, `categories`, `licenses`, `product_ratings` (D1); pictures in R2 `media/images/…`; browser: `localStorage ka-currency`, `sessionStorage ka-store-tab`.

**Controlled from the portal?** Yes: **Products** app (create/edit items, prices, sale windows, media, file, status, sort order, license), **Settings → Categories**, **Settings → Store & tax** (`showRatings`, `showDownloads`, `international`, `enabled`). Changes reach the page by `bumpLiveVersion()` and the `ka-content-changed` event.

**Speed and smoothness:** the Store/Checkout bundle loads only when the page is opened; `Checkout` is a lazy chunk (`lazy(() => import('./Checkout'))`); images use `loading="lazy"`, `decoding="async"`, `width`/`height` attributes and a fade-in (`Img`); the server answers with `Cache-Control: no-cache` plus an ETag so unchanged catalogs return 304 (`router.js` → `withEtag`).

**Screen sizes and accessibility:** `store.css` has queries at 420, 520, 600 px, 1900, 2500, 3400 px, `(hover:hover) and (pointer:fine)`, `(pointer:coarse)`, reduced motion and `forced-colors: active`. Tabs are `role="tablist"` with arrow/Home/End keys; filter chips are `role="radiogroup"`; counts are read by screen readers; the lightbox traps focus and returns it to the opener.

**Security:** only `status = 'published'` rows are selected; slugs must match `^[a-z0-9-]{1,80}$`; descriptions are rendered by a safe Markdown subset (`server/core/markdown.js`: HTML-escaped first); reviews never include buyer emails.

**Limits and edge cases:** the catalog returns at most 500 products; a product that cannot be bought in a currency (`available: false`) shows no price and no buy button; free items show "Download".

**Not found / unclear:** none.

---

## 11. Checkout and Razorpay payment

**What it is:** The purchase dialog. The buyer enters email, a license name and optional coupon codes, then pays in Razorpay's own window. The server confirms the payment with two independent proofs and then delivers the file.

**Where it runs:** Both. The browser shows the form and opens Razorpay's window. All money rules run on the server.

**Files:**
| File | Role |
|---|---|
| `client/src/store/Checkout.tsx` | `Checkout`, `Buy` (form, Turnstile, order, Razorpay options, polling), `Resend` |
| `client/src/store/checkout/machine.ts` | Phase state machine (`reduce`, `initialState`) |
| `client/src/store/checkout/PassCard.tsx` | The 3D card (feature 12) |
| `client/src/store/checkout/DemoPay.tsx`, `cards.ts` | Local demo payment window and test cards |
| `client/src/store/checkout/checkout.css`, `confetti.ts` | Styles; success effect |
| `server/handlers/checkout.js` | HTTP handlers |
| `server/store/orders.js` | `quote()`, `createOrder()`, `verifyCheckout()`, `handleWebhook()`, `tryFinalize()`, `deliver()`, `statusFor()`, `cancelCheckout()`, `expireOrders()`, `refundOrder()`, `demoPay()`, `computeTax()`, `methodSummary()` |
| `server/store/razorpay.js` | Razorpay REST calls and signature checks |
| `server/store/coupons.js` | `evaluateCoupons()`, `normalizeCodes()` |
| `server/store/pricing.js` | Prices |
| `server/core/guard.js` | `rateLimit()`, `verifyTurnstile()` |
| `server/core/crypto.js` | `sha256hex()`, `safeEqual()`, `randomToken()` |
| `index.html` lines 1758–1830 | `window.kaTurnstile()` (loads Turnstile), `window.kaPublicConfig()`, `window.kaToast()` |
| `migrations/0001_init.sql` | `orders`, `order_items`, `order_events`, `coupons`, `coupon_redemptions`, `webhook_events`, `invoice_counter` |

**Tools and libraries:** Razorpay Checkout script `https://checkout.razorpay.com/v1/checkout.js` (loaded by `loadRazorpay()` when needed; version not fixed in code: URL path `v1`). Cloudflare Turnstile script `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`. **No Razorpay SDK on the server**: the server uses `fetch` (`server/store/razorpay.js` → `call()`). Node `crypto` (`createHmac`) for signatures.

**Browser features used:** `fetch`, dynamic `<script>` injection, `localStorage` keys `ka-buyer-email` and `ka-license-name`, `navigator.onLine` with `online`/`offline` events, `useReducer`, Razorpay's modal (`new window.Razorpay(options)`).

**Server APIs called:**
| Method | Path | Server file → function | What it returns |
|---|---|---|---|
| POST | `/api/checkout/quote` | `checkout.js` → `quote()` | Price breakdown; a rejected coupon returns `{ok:false, error, code}` |
| POST | `/api/checkout/order` | `checkout.js` → `createOrder()` | `{orderId, clientSecret, free, razorpay{keyId, orderId, amount, currency, name, description, email}}`; free items also `downloadUrl`, `emailed`, `license` |
| POST | `/api/checkout/verify` | `checkout.js` → `verify()` | Order status after the signature check |
| POST | `/api/checkout/status` | `checkout.js` → `status()` | `{orderId, status, total, currency, downloadUrl, license}` |
| POST | `/api/checkout/cancel` | `checkout.js` → `cancel()` | Cancels an unpaid order |
| POST | `/api/checkout/demo-pay` | `checkout.js` → `demoPay()` | Demo only |
| POST | `/api/webhooks/razorpay` | `checkout.js` → `razorpayWebhook()` | `{ok, result}` or `{duplicate:true}` |
| POST | `/api/downloads/resend` | `checkout.js` → `resend()` | `{ok, message}` |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `submit()` | `Checkout.tsx` | Validates email (regex) and name (≥ 2 characters), gets a Turnstile token, posts the order, opens Razorpay |
| `loadRazorpay()` | `Checkout.tsx` | Loads the Razorpay script once |
| `waitForDelivery()` | `Checkout.tsx` | After the signature check, polls `/api/checkout/status` up to 20 times (1.5 s apart) until status is `paid` or `delivered` |
| `reduce()` | `machine.ts` | Phases `loading, idle, validating, creating, paying, confirming, success, failed, cancelled` |
| `quote()` | `orders.js` | Server price: `priceFor()`, `evaluateCoupons()`, `computeTax()`, `MIN_CHARGE` 100 |
| `createOrder()` | `orders.js` | Writes order, item, coupon holds and an event in one `db.batch()`; creates the Razorpay order |
| `verifyPaymentSignature()` | `razorpay.js` | `HMAC-SHA256(orderId + "|" + paymentId, RAZORPAY_KEY_SECRET)` compared with `safeEqual` |
| `verifyWebhookSignature()` | `razorpay.js` | `HMAC-SHA256(raw body, RAZORPAY_WEBHOOK_SECRET)` |
| `handleWebhook()` | `orders.js` | Handles `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`; idempotent through `webhook_events` |
| `tryFinalize()` | `orders.js` | Moves to PAID only with both proofs; then `deliver()` |

**How it works, step by step (Buy → Delivered):**
1. Press Buy → `Checkout` opens `Buy`. `requestQuote([])` → `POST /api/checkout/quote` → `orders.quote()` returns prices; `QUOTED` is dispatched.
2. The buyer types email and "Name on the license". Focusing or typing in the name field flips the card to its back (`setFlipped(true)`); leaving the field flips it forward (feature 12). A coupon code, if used, triggers another quote with a Turnstile token.
3. Press Pay → `submit()`: if the name has fewer than 2 characters it shows "Enter the name for your license." and stops; otherwise it asks `ts.token()` (Turnstile), then `POST /api/checkout/order`.
4. `checkout.js` → `createOrder()`: `rateLimit('order:<ip>', 10, 10 min)`, `rateLimit('order-email:<email>', 10, 1 h)`, `cleanHolder()` (`holder_required` if empty), `verifyTurnstile()`, then `orders.createOrder()`.
5. `orders.createOrder()`: store enabled? → `quote()` → license row → `db.batch([insert orders (status created, license_code, license_holder, client_secret_hash), insert order_items, per coupon: insert coupon_redemptions + update coupons used_count, insert order_events])`. If a coupon ran out, the batch fails and the buyer sees "That code has just been used up."
6. Free item: status `paid`; `deliver()` runs; response includes `downloadUrl` and `license`.
7. Paid item: `razorpay.createOrder({amount, currency, receipt: public_id, notes})` → `POST /v1/orders` with `payment_capture: 1`; the returned amount and currency must equal the order's (else `markMismatch`, HTTP 502); `razorpay_order_id` is saved; the response carries `clientSecret` (random; only its SHA-256 is stored) and Razorpay options.
8. `loadRazorpay()` then `new window.Razorpay({key, order_id, amount, currency, name, description, prefill:{email}, notes:{order}, theme:{color:'#c9864f'}, retry:{enabled:true, max_count:3}, handler, modal:{escape:true, confirm_close:true, ondismiss}})` and `rzp.open()`.
9. Success callback `handler(resp)` → `POST /api/checkout/verify {orderId, clientSecret, razorpay_*}` → `orders.verifyCheckout()`: `orderByClient()` (public id regex `^KA-[A-Z2-9]{8}$` and hash of client secret), `verifyPaymentSignature()`; if wrong, event `signature_rejected` and HTTP 400; if right, `signature_verified_at` and `razorpay_payment_id` are set, then `tryFinalize()`.
10. In parallel Razorpay calls `POST /api/webhooks/razorpay`: `razorpayWebhook()` reads the raw body (≤ 1 MB), `handleWebhook()` verifies the signature, ignores processed duplicates, checks `payment.amount === order.total` and currency, then sets `captured_at`.
11. `tryFinalize()`: if the browser never reported, it calls `razorpay.fetchPayment()` (`GET /v1/payments/:id`) and, if `status === 'captured'` and order id, amount and currency match, sets `api_verified_at`. The order becomes `paid` in a guarded batch only when `captured_at` and (`signature_verified_at` or `api_verified_at`) exist. The same batch confirms coupon redemptions and takes the next gapless invoice number (`invoice_counter`). The database check `paid_needs_two_proofs` enforces the rule again.
12. `deliver()` (feature 13) sends emails; the order becomes `delivered`.
13. The browser polls status and shows the success screen with `downloadUrl` and `license`.

**The two-proof rule:** proof 1 = Razorpay's signed checkout response (browser path) **or** a server-to-server fetch of the payment (API path); proof 2 = the signed webhook "captured" event. Both must exist. A forged browser message alone, or a webhook alone, never marks an order paid.

**How signatures are verified:** both use HMAC-SHA256 hex digests built with Node `crypto.createHmac` and compared with the constant-time `safeEqual()`.

**Data saved:** D1 tables `orders` (statuses `created, paid, delivered, failed, cancelled, expired, mismatch, refunded`), `order_items`, `order_events`, `coupons`, `coupon_redemptions`, `webhook_events`, `invoice_counter`; browser `localStorage` keys `ka-buyer-email`, `ka-license-name` (only if "remember" is ticked).

**Controlled from the portal?** Yes: **Products** (prices, sale, license, `max_downloads`, `link_ttl_hours`, refund-after-download), **Coupons**, **Settings → Store & tax** (`enabled`, `international`, `allowCouponStacking`, tax, `orderExpiryMinutes`, seller details), **License card / Studio → Checkout pass** (card design), **Orders** (refund, resend).

**Speed and smoothness:** Razorpay and Turnstile scripts load on demand; `inFlight` ref blocks double clicks; the state machine ignores events that do not belong to the current phase; status polling stops after 20 tries; the payment window is Razorpay's own.

**Screen sizes and accessibility:** `checkout.css` queries at 359, 767, 768, 1024, 1900, 2500 px, heights 520 (landscape) and 760, and reduced motion. The dialog is `role="dialog"` `aria-modal`, traps focus (`useFocusTrap`), step list `aria-label="Checkout progress"`, errors `role="alert"`, status `aria-live="polite"`, offline banner.

**Security:** all prices from the server; card data never touches this site (Razorpay's window); Turnstile on order creation, on coupon quotes, on downloads and resend; rate limits (quote 40/10 min/IP, coupon 12/10 min, order 10/10 min and 10/h per email, verify 30/10 min, status 150/10 min, cancel 30/10 min, resend 5/h plus 3/h per email); order lookups need public id **and** client secret (404 otherwise); webhook signature over raw bytes; an order is locked to one currency; DB constraints (`total_math`, `discount_cap`, `paid_needs_two_proofs`); `webhook_events` idempotency; demo mode impossible in production (`demoPaymentsEnabled()`).

**Limits and edge cases:** minimum charge 100 minor units; maximum 3 coupon codes (`MAX_CODES`); USD blocked with code `international_off` when paused; `store.enabled === false` → 503; unfinished orders expire after `store.orderExpiryMinutes` (default 45) via the daily job; a payment that arrives after expiry or cancellation still finalizes (`late`); a captured but undelivered order is retried by `expireOrders()`.

**Not found / unclear:** the Razorpay Checkout script version (served by Razorpay at `/v1/`).

---

## 12. License card / pass card (3D flip card, signature, QR seal)

**What it is:** The ticket-like card above the checkout form. Its front shows the artwork, title, price, email and order. Its back shows the license, holder name, signature and a scannable seal. The owner designs it in the portal.

**Where it runs:** Both. Frontend draws and flips the card. The server issues the license code and the public check page.

**Files:**
| File | Role |
|---|---|
| `client/src/store/checkout/PassCard.tsx` | `PassCard`, `Seal`, `useTilt`, `useCountUp`, `CountingPrice`, `PassSettings`, `PASS_DEFAULTS`, `SIGNATURE_DEFAULT_FONT`, `SIGNATURE_INK` |
| `client/src/store/checkout/checkout.css` | 3D CSS (`.kco-card-wrap`, `.kco-tilt`, `.kco-card`, `.kco-face`, `.kco-back`), foil, seal layout |
| `shared/seal.js` | `qrMatrix()`, `sealSvg()`, `normalizeLicenseCode()`, `CODE_ALPHABET` |
| `server/store/license.js` | `newLicenseCode()`, `ensureLicenseCode()`, `licenseFor()`, `maskEmail()`, `cleanHolder()`, `licenseUrl()` |
| `server/admin/site-document.js` | Validation of `passCard` (fonts, sizes, tones, labels) |
| `client/portal/src/apps/Studio.tsx`, `License.tsx` | Owner editor and live preview (`PassPreview`) |
| `index.html` lines 8105–8128 and ~8329 | `applyCustomFonts()` and `window.kaPassCard` + event `ka-pass-card` |
| `migrations/0004_license_seals.sql` | Columns `orders.license_code`, `orders.license_holder`, unique index |

**Tools and libraries:** React; no 3D library: the flip and tilt use **CSS 3D transforms** (not Three.js). The QR generator is hand-written in `shared/seal.js` (algorithm after Project Nayuki's reference, per its header comment).

**Browser features used:** CSS 3D (`perspective: 1100px`, `transform-style: preserve-3d`, `backface-visibility: hidden`, `rotateY(180deg)` flip with `transition: transform .75s cubic-bezier(.34,1.35,.5,1)`), pointer events (`useTilt`: `pointermove`/`pointerleave`), `DeviceOrientationEvent` (tilt from the phone's motion sensor only where no permission prompt is needed), `requestAnimationFrame`, SVG via `dangerouslySetInnerHTML` (from `sealSvg()`), CSS custom properties (`--rx`, `--ry`, `--gx`, `--gy`), `FontFace` API in the portal preview, `@font-face` in a document `<style id="ka-custom-fonts">` on the public page.

**Server APIs called:**
| Method | Path | Server file → function | What it returns |
|---|---|---|---|
| POST | `/api/checkout/order`, `/api/checkout/status`, `/api/checkout/verify` | `checkout.js` | `license {code, url}` once paid (via `licenseFor()`) |
| GET | `/license/:code` | `server/handlers/license.js` → `licensePage()` | The public check page (feature 14) |
| GET | `/api/portfolio` | `public.js` → `portfolio()` | `passCard` design |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `PassCard()` | `PassCard.tsx` | Renders front and back; `flipped` adds class `is-flipped` |
| `useTilt()` | `PassCard.tsx` | Eases `--rx` (±9°) and `--ry` (±11°) toward the pointer (factor 0.12 per frame) and moves the foil highlight (`--gx`, `--gy`) |
| `Seal({license})` | `PassCard.tsx` | Draws the real seal after payment; before payment a dashed placeholder "Seal issued at purchase" |
| `qrMatrix(text)` | `seal.js` | QR symbol: byte mode, error correction level M, versions 1–15 (up to 15 chosen by length), Reed–Solomon, mask selection by penalty score |
| `sealSvg({url, code, issuer, id, title})` | `seal.js` | SVG 240×240: circle with two rings, code text on a circular path (`textPath`), light plate with rounded QR modules and rounded finder "eyes" |
| `newLicenseCode()` | `license.js` | `KA-` + 10 Crockford base32 characters in two groups of 5 (50 random bits) |
| `licenseFor(orderId, siteUrl)` | `license.js` | `null` unless the order is `paid` or `delivered` |

**How it works, step by step.** The 3D flip is built like this: a wrapper `.kco-card-wrap` sets `perspective`. `.kco-tilt` rotates by `--rx`/`--ry` (pointer tilt) and floats. `.kco-card` is the flip element (`preserve-3d`); `.is-flipped` applies `rotateY(180deg)`. Two faces (`.kco-front`, `.kco-back`) are absolutely positioned with `backface-visibility: hidden`; the back is pre-rotated by 180°. Under reduced motion the flip has no transition and the faces swap by opacity (`checkout.css` lines 204–209).

**How the typed name appears live:** `Checkout.tsx` keeps `holder` state and passes it as the `holder` prop; the back face renders `holder.trim().slice(0, 80) || shown || 'you'` under the label (`pass.licensedLabel`). `onChange` of the name field sets `flipped` to `true`; `onFocus` sets it true; `onBlur` sets it false. Pressing Pay with an empty name sets `holderError` and flips the card back.

**How signature fonts load:** the signature is drawn with `fontFamily: pass.signatureFont ? fam(signatureFont, 'cursive') : SIGNATURE_DEFAULT_FONT` (`'Segoe Script', 'Bradley Hand', 'Brush Script MT', 'Lucida Handwriting', cursive`). Uploaded fonts are stored in `details.customFonts` as `{family, url}`. On the public page `applyCustomFonts()` writes `@font-face` rules into `<style id="ka-custom-fonts">`; in the portal `useCustomFontFaces()` (`Studio.tsx`) registers each with `new FontFace(family, url(...))`, `face.load()` and `document.fonts.add()`. Fonts are document-wide, so they work inside the shadow roots.

**How the QR seal is generated:** `sealSvg()` calls `qrMatrix(url)` where `url = <site>/license/<code>` (from `licenseUrl()`); the version is the smallest of 1–15 that fits; a seal on screen is drawn from the same function the server uses for the download page and license page. The code and the text "VERIFIED LICENSE • KETHAN ARTZZ" run around the ring. I did not run a decoder in this task; an earlier session decoded the output with `jsqr` (NOT FOUND IN CODE: that check is not in the repo).

**When the real seal appears:** `Seal` receives `license` only when `s.success.license` is set, which comes from `statusFor()` or from the free-order response after the order is `paid`/`delivered`. A refunded order returns `license: null`.

**Moving silver edge shine (added later).** `useTilt()` in `PassCard.tsx` also runs a small loop that sets `--ba` (angle) and `--bi` (strength) on `.kco-tilt`. While the pointer is over the card, `--ba` follows the pointer's direction from the card centre; when it leaves, the shine drifts slowly round the edge. In `checkout.css`: `.kco-face::after` (the existing white edge highlight) is a conic gradient whose start follows `--ba`, and `.kco-face::before` adds a 1.2 px ring that goes transparent, then white, then transparent again (silver, no colour, no glow outside the card). Skipped under reduced motion (CSS defaults apply). The license side takes its look from the product: `.kco-back-art` is the product's own artwork, blurred and darkened, behind the license text.

**Data saved:** `orders.license_code` (unique), `orders.license_holder` (≤ 80 characters; markup characters stripped by `cleanHolder()`); card design in `settings` key `site` → `passCard`.

**Controlled from the portal?** Yes. **License card** app (a window that renders `Studio` with `only="pass"`) and the Studio "Checkout pass" tab edit: label next to the logo, logo upload and size, tag text and on/off, title and price fonts, text and price position (`top/center/bottom`, `right/left/below`), stamp text, holographic foil, picture dimming (0–90), signature text (≤ 40), signature font, size 16–60, slant −12…12°, ink (`gold`, `white`, `ink`, `accent`), seal on/off, heading ≤ 24, "Licensed to" label ≤ 24, signature label ≤ 32, extra line ≤ 100, delivery line on/off. A preview with Before payment/Paid and Front/Back switches uses a sample code `KA-SAMP1-E0000`. "Add your own signature font" jumps to the font uploader; a new font is chosen automatically. Publish → `PUT /api/admin/site` → `validateSiteDocument()` → live version bump → public page `window.kaPassCard` update (`ka-pass-card` event) → the next checkout shows it.

**Speed and smoothness:** the card is a normal DOM element (no canvas), GPU-composited with `transform`; tilt uses one `requestAnimationFrame` loop that stops when the target is reached; price count-up (`CountingPrice`, 520 ms, `1 − (1−k)³`) writes text directly without re-rendering React.

**Screen sizes and accessibility:** card width `min(100%, 360px)`, 400 px at ≥ 1024 px, 520 px at ≥ 1900, 680 px at ≥ 2500; `min(78vw, 320px)` on narrow screens; landscape height ≤ 520 uses `min(46vw, 300px)`. The card is a `role="button"` with `aria-pressed`, flips with Enter or Space, the hidden face is `aria-hidden`. Touch skips pointer tilt.

**Security:** codes are random (not derived from a secret); `licenseFor()` returns null unless paid; the public page treats unknown and unpaid codes identically; holder text is escaped in HTML and stripped of `<>` and control characters.

**Limits and edge cases:** QR versions 1–15 only (`Text too long for the seal` otherwise); holder required (2–80 characters) for new orders; older orders without a code get one the first time it is needed (`ensureLicenseCode()`); orders with no holder show a masked email on the check page.

**Not found / unclear:** whether the earlier decode test is repeated anywhere in the repo.

---

## 13. Delivery, download links, ratings, refunds

**What it is:** After payment the buyer gets an email with a download link, a license file and a receipt. A download page counts downloads. Buyers can rate. The owner can refund.

**Where it runs:** Backend (server-rendered pages), plus the portal Orders window.

**Files:**
| File | Role |
|---|---|
| `server/store/delivery.js` | `issueToken()`, `sendDeliveryEmails()`, `sendReceipt()`, `licenseFile()`, `downloadPage()`, `redeem()`, `rate()`, `resendLinks()`, `ratingForm()` |
| `server/store/orders.js` | `deliver()`, `refundOrder()`, `statusFor()`, `issueScreenLink()` |
| `server/handlers/checkout.js` | `downloadGet()`, `downloadPost()`, `ratePost()`, `resend()` |
| `server/core/storage.js`, `server/platform/cloudflare.js` → `storageRequest()` | Signed file URLs and streaming from R2 |
| `server/admin/sales.js` | `refund()`, `resendOrder()`, `resendReceipt()`, `invoice()`, `revokeLink()`, `downloads()` |
| `client/portal/src/apps/Orders.tsx`, `Downloads.tsx` | Owner UI |

**Tools and libraries:** none beyond Node `crypto`; files stored in Cloudflare R2.

**Browser features used:** none required: the download page is plain HTML with a `<form method="post">`; Turnstile script is added when keys exist.

**Server APIs called:**
| Method | Path | Server file → function | What it returns |
|---|---|---|---|
| GET | `/api/download/:token` | `checkout.js` → `downloadGet()` → `downloadPage()` | HTML confirm page with seal and rating form |
| POST | `/api/download/:token` | `downloadPost()` → `redeem()` | `303` redirect to a 60-second signed storage URL |
| POST | `/api/download/:token/rate` | `ratePost()` → `rate()` | `303` back to the page |
| POST | `/api/downloads/resend` | `resend()` → `resendLinks()` | `{ok:true, message}` |
| POST | `/api/admin/orders/:id/refund` | `sales.js` → `refund()` | `{ok, refundId, amount}` |
| POST | `/api/admin/orders/:id/resend`, `/receipt` | `resendOrder()`, `resendReceipt()` | Re-sends emails |
| GET | `/api/admin/orders/:id/invoice` | `invoice()` | Printable HTML invoice (button "Print / Save as PDF") |
| POST | `/api/admin/links/:id/revoke` | `revokeLink()` | Revokes one link |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `issueToken()` | `delivery.js` | 256-bit random token (`randomToken(32)`); stores `sha256hex(token)`, expiry (`link_ttl_hours`), `max_downloads`, channel; returns `<site>/api/download/<token>` |
| `sendDeliveryEmails()` | `delivery.js` | One `order_delivery` email per item with `LICENSE.txt` attached, then the `order_receipt` for paid orders |
| `redeem()` | `delivery.js` | One atomic `update download_tokens set download_count = download_count + 1 where … revoked_at is null and expires_at > now() and download_count < max_downloads and order status in ('paid','delivered')` |
| `refundOrder()` | `orders.js` | Refund rules and Razorpay refund |
| `expireOrders()` | `orders.js` | Daily: expire unfinished orders, retry captured-but-undelivered ones |

**How it works, step by step:**
1. `deliver(orderId)` claims the order (`delivery_claimed_at`, only if status `paid`, not delivered, not claimed in the last 600 s) and calls `sendDeliveryEmails()`; only if every email is accepted does status become `delivered`; otherwise it stays `paid` and event `delivery_email_failed` is recorded; `expireOrders()` retries later.
2. The delivery email has the link (valid `link_ttl_hours`, up to `max_downloads`) and `LICENSE.txt`; `licenseFile()` writes license name, product, "Licensed to" (holder and email), order, date, `License code:` and `Verify this license:` URL, then the license text converted from Markdown to text.
3. The buyer opens the link: `downloadPage()` → `lookup(token)`; token format must match `^[A-Za-z0-9_-]{43}$`. It shows the product, downloads left, the expiry and the seal (`ensureLicenseCode()`).
4. Pressing Download posts the form with Turnstile; `redeem()` counts one download, logs `download_events` (IP, country, user agent), and redirects to `storage.signedUrl('deliverables', path, 60, filename)`.
5. The Worker `storageRequest()` verifies the signature and expiry, streams the file with `Content-Disposition: attachment` and `Cache-Control: private, no-store`, supports `Range` requests (resume), and answers 403 when expired.
6. Rating: the form posts `rating` 1–5, optional `review` (≤ 600) and `name` (≤ 40) to `rate()`; one row per (order, product) with `on conflict … do update`; a used-up or expired link can still rate, a revoked one cannot.
7. Resend: `resendLinks(email)` creates fresh tokens for every paid order of that email (max 20) and emails them (`resend_link`); the HTTP answer is identical whether or not orders exist.
8. Refund: `refundOrder()` allows only `paid`/`delivered`, not free, no existing `refund_id`; if the buyer already downloaded, it requires `confirmAfterDownload: true` (or blocks when the product has `refund_after_download` off); amount 1…total; calls `razorpay.refundPayment()` (`POST /v1/payments/:id/refund`, `speed: 'normal'`); revokes tokens; the `refund.processed` webhook sets status `refunded`.

**Data saved:** `download_tokens`, `download_events`, `product_ratings`, `orders` (refund columns), `order_events`, `email_log`; files in R2 `deliverables/files/<random>/<name>`.

**Controlled from the portal?** Yes: **Products** (link lifetime 1–168 h, max downloads 1–100, refund-after-download, deliverable file with optional `LICENSE.txt` packed in the browser by `zip.ts`), **Orders** (refund, resend, receipt, invoice, revoke), **Downloads**, **Settings → Store & tax** (tax and seller details used on receipts/invoices), **Content → Emails** (templates).

**Speed and smoothness:** files stream from R2 through the Worker with range support; the download page is small static HTML; signed URLs avoid a database lookup per byte; public media is cached for a year (`public, max-age=31536000, immutable`) and edge-cached with `caches.default`.

**Screen sizes and accessibility:** the download page is a single card layout (`min(460px, 100%)`), buttons 48 px high, focus outline, star rating as radio inputs with labels.

**Security:** only the SHA-256 of a token is stored; the link page is a confirmation step so email scanners cannot use downloads; Turnstile and rate limits (`dl-view` 60/10 min, `dl` 20/10 min, `rate` 20/h, `resend` 5/h); strict CSP on the page (`default-src 'none'`, scripts only for Turnstile); `Referrer-Policy: no-referrer`; `X-Robots-Tag: noindex`; files only through short-lived signed URLs; refunds revoke links immediately.

**Limits and edge cases:** default 5 downloads and 48 hours (table defaults); a revoked, expired or used-up link shows a matching error page with a hint to use "Email me my download links"; failed email keeps the order `paid`.

**Not found / unclear:** the invoice page is HTML to print, not a generated PDF file (no PDF library found).

---

## 14. License check page (/license/<code>)

**What it is:** A public page that tells anyone who scans a seal or types a code whether the license is valid, what it covers and who holds it.

**Where it runs:** Backend (server-rendered HTML with no JavaScript).

**Files:** `server/handlers/license.js` (`licenseIndex()`, `licensePage()`, `registerLicense()`, `signature()`, `page()`, `lookupForm()`), `server/store/license.js`, `shared/seal.js` (`normalizeLicenseCode`, `sealSvg`), `pages/_routes.json`, `pages/_worker.js`, `wrangler.jsonc` (`run_worker_first` includes `/license` and `/license/*`).

**Tools and libraries:** none.

**Browser features used:** none required (plain HTML and CSS; one `<form method="get">`).

**Server APIs called:**
| Method | Path | Server file → function | What it returns |
|---|---|---|---|
| GET | `/license` | `licenseIndex()` | Lookup form; with `?code=` a normalised redirect (303) to `/license/<CODE>` or 400 for a bad code |
| GET | `/license/:code` | `licensePage()` | The check page (301 to the canonical upper-case code if needed; 404 look-alike page for unknown/unpaid) |

**Key functions:** `normalizeLicenseCode()` (accepts any case, spaces or dashes; `O` → `0`, `I`/`L` → `1`; must be 10 valid characters), `licenseFor()`, `maskEmail()`, `sealSvg()`, `signature()` (reads the signature design from `settings.site.passCard` and fonts from `customFonts`).

**How it works, step by step:**
1. The request is routed `Pages (_worker.js regex) → service binding → Worker`.
2. `rateLimit('license:<ip>', 60, 10 min)`.
3. The code is normalised; a wrong-looking code gets a 400 or 404 page.
4. The server looks up the order by `license_code` (unique index). The page shows: item title and picture, license name and summary, holder (`license_holder`, else the masked email `n•••@example.com`), issue date (Asia/Kolkata), signature (text, font, ink from the portal), and the seal drawn by `sealSvg()`.
5. Status: **Valid** (paid or delivered), **Revoked** (refunded), or **Under review** (mismatch states). Unknown and unpaid codes produce the same "not found" page.

**Data saved:** reads `orders`, `order_items`, `products`, `licenses`, `settings`; writes nothing.

**Controlled from the portal?** Yes, indirectly: the signature on this page comes from the License card settings; license names and text from **Licenses & Legal**; refunding in **Orders** turns the page to Revoked.

**Speed and smoothness:** no scripts, no external requests except an optional uploaded font file (`@font-face` with the stored font URL); `Cache-Control: no-store`.

**Screen sizes and accessibility:** `@media (max-width:640px)` stacks the card and moves the seal first (`order:-1`, width `min(240px, 72vw)`); focus outlines; the seal SVG has `role="img"` and an `aria-label` with the code; `meta viewport` with `viewport-fit=cover`.

**Security:** strict CSP (`default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; font-src 'self' https:; …`), `noindex,nofollow`, `Referrer-Policy: no-referrer`, HTML escaping (`esc()`), rate limit 60 per 10 minutes per IP, identical answers for unknown and unpaid codes, the full email is never shown.

**Limits and edge cases:** codes are 50 random bits; the page works for a refunded order (shows Revoked) and for older orders (a code is created when first needed).

**Not found / unclear:** exact copy of each status sentence was not quoted; see `licensePage()`.

## 15. Contact form and Messages inbox

**What it is:** The form in the Contact section of the homepage, and the **Messages** app in the portal where the owner reads, labels, replies to and filters what arrives. Messages from the AI assistant hand-off also land in the same inbox.

**Where it runs:** Both. The browser validates and sends. The server checks, stores and emails. The portal reads and replies.

**Files:**
| File | Role |
|---|---|
| `index.html` (contact section, script "CONTACT FORM", lines ~7898–8045) | Field rules, Turnstile loading, submit, result card |
| `index.html` (`KaRocket`, lines ~7513–7897) | Paper-rocket send animation and card flip |
| `server/handlers/public.js` | `contact()`, `autoReplyFor()`, `withinHours()`, `notify()` |
| `server/core/guard.js` | `rateLimit()`, `verifyTurnstile()` |
| `server/core/blocklist.js` | `isBlocked()` (spam filter) |
| `server/admin/messages.js` | Portal side: `listMessages`, `getMessage`, `updateMessage`, `bulkMessages`, `reply`, canned replies, blocklist |
| `client/portal/src/apps/Messages.tsx` | The Messages app screen |
| `migrations/*.sql` | Tables `messages`, `message_replies`, `canned_replies`, `blocklist`, virtual table `messages_fts` |

**Tools and libraries:** No extra library on the page (plain JavaScript). The portal screen uses React 18.3.1.

**Browser features used:** `fetch` (send), `AbortController` (timeout), `FormData` (read fields), `addEventListener` for `input`, `blur`, `focusin`, `pointerdown`, `submit`; `aria-invalid` and `aria-live` status text; the Turnstile script (loaded on first use through `window.kaTurnstile`).

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| POST | `/api/contact` | `server/handlers/public.js` → `contact()` | `{ok:true}` with status 201 (202 when the hidden trap field is filled) |
| GET | `/api/admin/messages` | `server/admin/messages.js` → `listMessages()` | `{messages, hasMore, counts, labels}` |
| GET | `/api/admin/messages/:id` | `getMessage()` | `{message, replies, history, orders}` |
| PATCH | `/api/admin/messages/:id` | `updateMessage()` | `{ok:true}` |
| POST | `/api/admin/messages/bulk` | `bulkMessages()` | `{ok:true}` |
| POST | `/api/admin/messages/:id/reply` | `reply()` | `{ok:true}` or 502 when the email fails |
| GET/POST/PUT/DELETE | `/api/admin/canned`, `/api/admin/canned/:id` | `listCanned`, `saveCanned`, `deleteCanned` | `{canned:[…]}` |
| GET/POST/DELETE | `/api/admin/blocklist`, `/api/admin/blocklist/:id` (`registerMessages()`) | `listBlocklist`, `addBlock`, `removeBlock` | `{blocklist:[…]}` |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `validateContactField(key)` | `index.html` | Checks one field against `CONTACT_RULES` and shows or clears its error text |
| `allContactFieldsValid()` / `updateContactSubmitState()` | `index.html` | The Send button stays disabled until every field is valid |
| `ensureContactTurnstile()` | `index.html` | Loads the Cloudflare bot check the first time the form gets focus or a pointer press |
| `resetContactForm()` | `index.html` | Clears the form and its errors |
| `contact(ctx)` | `public.js` | Whole server flow (see steps) |
| `autoReplyFor(settings, now)` | `public.js` | Picks the away message (outside business hours), else the normal auto-reply, else nothing |
| `withinHours(hours, now)` | `public.js` | Checks day and time in the `Asia/Kolkata` time zone |
| `isBlocked({email, ip, text})` | `blocklist.js` | True when the email, its domain, the IP or a keyword is on the blocklist |
| `reply(ctx)` | `messages.js` | Sends the owner's reply with template `reply`, stores it, marks the message done |

**How it works, step by step:**
1. The visitor types. The name field removes every character that is not a letter or space as they type (`CONTACT_RULES.name`). Rules: name at least 3 letters, email in `x@y.z` form, subject at least 2 characters, message at least 5 characters.
2. Errors only show after a field has been left once (`touched`), then update on every keystroke. The Send button is disabled until all four fields are valid.
3. On submit the page builds a JSON body: `name`, `email`, `subject`, `message`, `website` (hidden trap field), `turnstileToken`.
4. `fetch` posts it to `/api/contact`. It is aborted after `KaRocket.config().timeoutMs`. The server answer alone decides success or error. The rocket animation never does.
5. Server `contact()`: rate limit 5 sends per IP per 15 minutes (`rateLimit('contact:'+ip, 5, 900)`) → read JSON, max 32 KB → if `website` is filled, answer `{ok:true}` with 202 and store nothing → validate name (max 100), email, subject (max 180), message (max 8000) → `verifyTurnstile()`.
6. It reads the `messages` setting. If `spamFilter` is not `false` and `isBlocked()` is true, the row is saved with status `spam`. Otherwise status `new`.
7. The row is inserted into `messages` with `source = 'contact'`, the IP and `meta.country`.
8. Only when not spam: an email goes to `settings.notifyEmail` or `OWNER_EMAIL` (template `contact_notify`, `replyTo` = the visitor). Then, if `autoReplyFor()` returns text, the visitor gets `contact_autoreply`.
9. The page turns the card to a success or error face. "Send another message" or "Try again" turns it back.
10. In the portal, `getMessage()` changes status `new` to `read` when opened and returns earlier messages and paid orders from the same email.
11. Replying calls `reply()`: it sends the email, saves a `message_replies` row with `sent` or `failed`, and sets `replied_at` and status `done` (unless `markDone` is `false`). The action is written to the audit log.

**Data saved:** Tables `messages` (status, labels, ip, meta), `message_replies`, `canned_replies`, `blocklist`, `email_log`. Search uses the full-text table `messages_fts`.

**Controlled from the portal?** Yes. Messages app: statuses (`new`, `read`, `done`, `spam`), labels (max 10 per message, 40 characters each), filters (status, label, source `contact`/`assistant`/`system`, search), bulk actions (up to 500 ids: delete or set status), canned replies, blocklist (email, domain, IP, keyword). Settings (`messages` setting): `notifyEmail`, `spamFilter`, `businessHours`, `autoReply`.

**Speed and smoothness:** The bot-check script loads only when the form is used. The textarea grows with its content (`scrollHeight`). Inbox lists return at most 200 rows (default 50).

**Screen sizes and accessibility:** Fields have visible error text tied to each field with `aria-invalid`; a failed submit moves focus to the first invalid field; after the result card, focus goes back to the name field or the Send button.

**Security:** Honeypot, rate limit, Turnstile, length limits, spam filter, `str()` and `vEmail()` validation, email text is HTML-escaped by `fill()`/`textToHtml()` in `email.js`, portal routes need an admin session.

**Limits and edge cases:** Spam rows are saved but do not email anyone. A failed email never fails the form (see feature 16). A reply to a message with no email address is refused (400).

**Not found / unclear:** none.

---

## 16. Email sending

**What it is:** The one place every email in the project is built and sent: order downloads, receipts, contact notices, replies, alerts, reports, launch notices.

**Where it runs:** Server only.

**Files:**
| File | Role |
|---|---|
| `server/core/email.js` | `sendEmail()`, `getTransport()`, `gmailTransport()`, `brevoTransport()`, `outboxTransport()`, `loadTemplate()`, `fill()`, `textToHtml()`, `escapeHtml()`, `layout()`, `DEFAULT_TEMPLATES` |
| `server/core/smtp.js` | `smtpSend()` (a small SMTP client), `buildMime()`, `openTls()` |
| `server/admin/content.js` | Template editor routes, test send, launch emails |

**Tools and libraries:** None. SMTP is written by hand in `smtp.js`. In a Cloudflare Worker it opens the connection with `connect()` from `cloudflare:sockets`; in Node it uses `node:tls`. Brevo is called with `fetch`. **MCP is not used**: a search for "mcp" in the source returns only `generator/ka-cinematic-demo.html` (a generated file), nothing in `server/`, `client/`, `shared/` or `pages/`.

**Browser features used:** None (server only).

**Server APIs called:** External: Gmail SMTP `smtp.gmail.com:465` (default in `smtpSend`, secure TLS from the start); Brevo `POST https://api.brevo.com/v3/smtp/email`. No other host is configured.

**How the transport is chosen (`getTransport()` in `email.js`):**
| Order | Condition | Transport |
|---|---|---|
| 1 | `setEmailTransport()` was called (tests) | That one |
| 2 | `GMAIL_USER` and `GMAIL_APP_PASSWORD` set | `gmailTransport` (`kind: 'gmail'`) |
| 3 | `BREVO_API_KEY` set | `brevoTransport` (`kind: 'brevo'`) |
| 4 | none | `outboxTransport` writes a `.json` file per message into `.data/outbox` (`kind: 'outbox'`) |

**Key functions:**
| Function | What it does |
|---|---|
| `sendEmail({to, template, vars, replyTo, attachments, subjectOverride, bodyOverride})` | Loads the template, fills it, wraps it in HTML, sends it, writes `email_log`, returns `{ok, id}` or `{ok:false, error}`. It never throws for provider failures. |
| `loadTemplate(key)` | Uses the `email_templates` row if the owner edited it, else `DEFAULT_TEMPLATES[key]` |
| `fill(template, vars)` | Replaces `{{name}}` placeholders; missing values become empty text |
| `textToHtml(body)` | Escapes text, turns blank lines into paragraphs and `https://` links into links |
| `buildMime()` | Builds the message: headers, plain text and HTML parts in base64, attachments, dot-stuffing; non-ASCII headers use `=?UTF-8?B?…?=` |
| `smtpSend()` | Steps `220`, `EHLO`, `AUTH LOGIN`, `MAIL FROM`, `RCPT TO`, `DATA`, `QUIT`; 20 second time limit; throws "Mail server refused (code)" on a wrong code |

**How it works, step by step:**
1. A caller runs `sendEmail()` with a template key.
2. The sender is `MAIL_FROM` (default `no-reply@localhost`) with the display name `MAIL_FROM_NAME` or `SITE_NAME` (default "Kethan Artzz"). With Gmail the sender address is replaced by `GMAIL_USER`.
3. `{{signature}}` defaults to `MAIL_SIGNATURE` or "— <site name>".
4. The subject is filled, line breaks removed, cut to 200 characters.
5. `getTransport().send()` runs. On success a row goes into `email_log` (to, subject, template, status `sent`, provider id). On error the row has status `failed` and the first 300 characters of the error.
6. The function returns. **There is no retry and no queue.** Callers that need the result check `res.ok` (for example `reply()` saves the reply as `failed` and tells the owner).

**Every email, its template and its sender function:**
| # | Email | Template | Sent by (file → function) | To |
|---|---|---|---|---|
| 1 | New contact message | `contact_notify` | `server/handlers/public.js` → `contact()` | Owner |
| 2 | Contact auto-reply / away message | `contact_autoreply` | `public.js` → `contact()` | Visitor |
| 3 | Notify-me confirmation | `notify_confirm` | `public.js` → `notify()` | Visitor |
| 4 | Download link and `LICENSE.txt` attachment | `order_delivery` | `server/store/delivery.js` → `sendDeliveryEmails()` | Buyer |
| 5 | Receipt / invoice | `order_receipt` | `delivery.js` → `sendReceipt()` (called from `sendDeliveryEmails()`, paid orders only) | Buyer |
| 6 | Fresh download links | `resend_link` | `delivery.js` → `resendLinks()` and `server/admin/sales.js` (line ~159, owner resend) | Buyer |
| 7 | Payment mismatch alert | `alert` | `server/store/orders.js` → `markMismatch()` | Owner |
| 8 | Reply to a message | `reply` | `server/admin/messages.js` → `reply()` | Sender of the message |
| 9 | Sales report | `report` | `server/admin/sales.js` (line ~349) | Chosen address |
| 10 | Template test | the chosen template | `server/admin/content.js` (line ~154) | Signed-in admin |
| 11 | Launch notice to a notify list | `launch` | `content.js` (line ~230) | Each signup |
| 12 | Test email | `alert` | `server/admin/system.js` (line ~63) | Signed-in admin |
| 13 | Storage warning | `alert` | `server/admin/usage.js` (line ~63) | Owner |
| 14 | Assistant message hand-off | `contact_notify` | `server/assistant/engine.js` (line ~130) | Owner |
| 15 | Assistant daily cap reached | `alert` | `engine.js` (line ~221) | Owner |

Note: the line numbers above come from a text search and may shift if the files change.

**Data saved:** `email_log` (never the body), `email_templates` (owner edits), `.data/outbox/*.json` in development only.

**Controlled from the portal?** Yes: the Email templates screen (subject and body per key, test send) in `server/admin/content.js`, and the email settings and test button in `server/admin/system.js`. The secrets (`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `BREVO_API_KEY`, `MAIL_FROM`) are environment values, not portal fields.

**Speed and smoothness:** One send opens one TLS connection and closes it. A provider failure is caught, so it cannot break checkout.

**Screen sizes and accessibility:** The HTML layout is one 560 px wide card with inline styles and a plain-text copy in the same message.

**Security:** Placeholder values are never put in as HTML (`fill()` fills plain text, then `textToHtml()` escapes it). Header values lose line breaks (`clean()`) so no header can be injected. The Gmail app password has spaces removed. Message bodies are not logged.

**Limits and edge cases:** Gmail's free limit is about 500 emails a day (comment at the top of `email.js`). If neither Gmail nor Brevo is configured on Cloudflare or in production, `getTransport()` calls `localDataDir()` (`server/core/env.js`), which throws "Email (GMAIL_USER and GMAIL_APP_PASSWORD) is not configured on this deployment…". `sendEmail()` catches it, logs `failed` in `email_log` and returns `{ok:false}`. The outbox folder is used only in local development.

**Not found / unclear:** none.

## 17. AI assistant (KA Assistant)

**What it is:** The chat bubble on the site and the **KA Assistant** app in the portal. Visitors ask about the work, the store and licenses. Buyers can ask about an order. The owner controls what it knows, its rules and its daily spending cap.

**Where it runs:** Both. The chat box runs in the browser. The pipeline runs on the server and calls an outside AI service (Google Gemini by default, or Anthropic).

**Files:**
| File | Role |
|---|---|
| `index.html` (script "AI ASSISTANT WIDGET", lines ~8800–9120) | Chat panel, history, streaming reader, `linkify()` |
| `server/handlers/assistant.js` | `assistant()`: the public route; streams the answer |
| `server/assistant/engine.js` | `runTurn()`: the whole pipeline; `clampHistory()`, `containsCardNumber()`, `redactCards()`, `redactOutput()`, `verifiedOrder()`, `buildSystem()`, `ensureConversation()`, `finish()`, `notifyCutoff()`, `PROHIBITIONS` |
| `server/assistant/providers.js` | `stream()`, `providerInfo()`, `geminiChain()`, `costMicros()`, `send()`, `sse()` |
| `server/assistant/knowledge.js` | `chunk()`, `reindex()`, `seedIfEmpty()`, `retrieve()` |
| `server/assistant/learning.js` | `learningQuestionKey()`, `maybeLearnFromRatedAnswer()`, `findLearnedAnswer()` |
| `server/assistant/quota.js` | `recordModel()`, `quotaReport()`, `nextReset()`, `dailyLimitFrom()` |
| `server/admin/assistant.js` | Portal routes and the daily log cleanup job |
| `client/portal/src/apps/Assistant.tsx` | Portal screen with tabs: overview, knowledge, repeats, logs, playground, settings |
| `server/knowledge.json` | Old starter facts used once by `seedIfEmpty()` |
| `migrations/0001_init.sql`, `0004_assistant_learning.sql` | Tables `kb_sources`, `kb_chunks`, `assistant_conversations`, `assistant_messages`, `assistant_usage`, `assistant_model_usage`, `assistant_learnings`; full-text tables `kb_chunks_fts`, `assistant_messages_fts` |

**Tools and libraries:** No AI library. Both providers are called with plain `fetch` and server-sent events (comment at the top of `providers.js`). React 18.3.1 for the portal screen.

**Browser features used:** `fetch` with `res.body.getReader()` and `TextDecoder` (reads the stream), `localStorage` (`ka_vid` visitor id, `ka-chat-history`, `ka-visitor-name`), `sessionStorage` (`ka_conv` conversation id), `navigator.language`, `matchMedia("(max-width: 1024px)")`, `CustomEvent("ka-chat-state")`, keyboard events (Enter sends, Shift+Enter new line, Escape closes), `aria-expanded`, `aria-busy`, `window.kaGhost` (letter-by-letter reveal) and `window.kaOpenLink` (opens site links in place).

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| POST | `/api/assistant` | `server/handlers/assistant.js` → `assistant()` | Stream of `data: {"text":…}`, then `data: {"conversation","message"}`, then `data: [DONE]`; or JSON `{error}` with 400/503 |
| GET | `/api/admin/assistant` | `server/admin/assistant.js` → `overview()` | Provider, settings, today's usage, 30 days, totals, ratings, quota |
| GET/POST/PUT/DELETE | `/api/admin/assistant/kb`, `/kb/:id` | `listKb`, `saveKb`, `deleteKb` | Knowledge sources |
| GET | `/api/admin/assistant/conversations`, `/conversations/:id` | `conversations()`, `conversation()` | Logs |
| GET | `/api/admin/assistant/repeated` | `repeatedQuestions()` | Questions asked in 2 or more conversations |
| DELETE | `/api/admin/assistant/conversations/:id` | `deleteConversation()` | `{ok:true}` |
| POST | `/api/admin/assistant/messages/:id/rate` | `rate()` | `{ok, learned}` |
| POST | `/api/admin/assistant/playground` | `playground()` | A real answer, or the prompt only when `preview: true` |
| External | `https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse` | `providers.js` → `PROVIDERS.gemini` | Streamed text and token counts |
| External | `https://api.anthropic.com/v1/messages` | `PROVIDERS.anthropic` | Streamed text and token counts |

**Key functions:**
| Function | What it does |
|---|---|
| `clampHistory(messages)` | Keeps only `user` and `assistant` text messages of 1–4000 characters, the last 12, starting with a user message |
| `containsCardNumber(text)` | Finds 13–19 digit groups and applies the Luhn check |
| `redactCards(t)` | Replaces real card numbers with `[card number removed]` |
| `redactOutput(text, allowed)` | Removes secrets (`sk-…`, `AIza…`, `rzp_live_/rzp_test_…`, JWT-like tokens) and any email address except `OWNER_EMAIL` and `MAIL_FROM` |
| `verifiedOrder(db, history)` | Looks up an order only when the chat contains both an order id (`KA-` plus 6–12 letters/digits) and the matching email |
| `retrieve(question, {includeProducts})` | Full-text search of the owner's knowledge plus live site data; context capped at 14000 characters |
| `findLearnedAnswer(db, question)` | Returns a saved answer for the same normalised question |
| `maybeLearnFromRatedAnswer(db, messageId)` | Saves a thumbs-up answer after the same question appeared in 2 separate conversations (see below) |
| `stream({system, messages, maxTokens})` | Picks the provider; yields text, then token usage |
| `costMicros(usage, info)` | Estimated cost in millionths of a dollar |
| `recordModel(model, {ok,status,body})` | Counts requests per Gemini model per day; learns the daily limit from the provider's refusal |
| `linkify(el, text)` (page) | Turns `/?product=…`, `/?tip=…`, `/?page=…`, web links and `**bold**` into DOM nodes (no `innerHTML`) |

**How it works, step by step (one visitor question):**
1. The visitor opens the bubble. The first time, the box asks "what should I call you?" and stores the name in `localStorage` (`ka-visitor-name`). The greeting text (`GREETINGS`, chosen by `pickGreeting()` from the browser language) and the quick-reply chips (`QUICK_REPLIES`) are written in `index.html`. A returning visitor with a saved name and history gets the history back. "New chat" clears the history and the conversation id but keeps the name.
2. On send, the page adds the message to its history (last 12), saves it in `localStorage` (`ka-chat-history`), shows a typing indicator and posts `{messages, locale, projectId, visitorId, conversationId}` to `/api/assistant`.
3. `assistant()`: rate limit 8 per IP per 10 minutes → read JSON (max 64 KB) → `clampHistory()` → the last message must be from the user → refuse with 503 when the assistant is switched off or the provider key is missing.
4. It opens an event stream and calls `runTurn()` with `audience: 'visitor'`.
5. `runTurn()` order: (a) assistant off → refusal; (b) `ensureConversation()` (continues a conversation only when the visitor id matches); (c) card number in the last message → fixed reply, nothing sent to the AI service, card digits removed from the saved text; (d) `redactCards()` on the history; (e) budget check: if today's estimated cost reached `dailyBudgetMicros` (default 500000 = US$0.50), send the owner an alert once (`notifyCutoff()`) and reply "I'm resting for today…"; (f) `seedIfEmpty()`; (g) `verifiedOrder()` adds an `<order>` block (status, dates, link expiry, downloads left) or a "cannot find it" block; (h) hand-off: if the visitor wrote an email address and words like hire, quote, project, message, contact me, a `messages` row with `source = 'assistant'` is stored once per conversation and `contact_notify` is emailed to the owner; (i) a learned answer, if one exists, is returned without calling the AI service (cost 0); (j) `retrieve()` builds the knowledge; (k) `buildSystem()` builds the prompt: persona, language, built-in rules, owner rules (max 20), `<knowledge>`.
6. `stream()` sends the prompt. For Gemini it tries a chain of models: `AI_MODEL`, then `AI_FALLBACK_MODELS`, then `gemini-3.5-flash-lite`, `gemini-flash-lite-latest`, `gemini-3.1-flash-lite`, `gemini-3.6-flash`, `gemini-flash-latest`. A model that returns 429 (quota) or 503 is skipped for 60 s, 1 hour (daily quota) or 30 s; 404 or 400 for 6 hours. A 401 or 403 stops the chain. Each request has a 30 s limit.
7. Text arrives in pieces. `runTurn()` holds back the last partial word, runs `redactOutput()` on complete words and passes them to `onDelta`, which sends `data: {"text": …}`.
8. When the stream ends, tokens are taken from the provider (or estimated as characters ÷ 4), cost is calculated, and `finish()` adds to `assistant_usage` and stores both messages in `assistant_messages` with their sources.
9. The server sends `{conversation, message}` and `[DONE]`. The page stores the conversation id in `sessionStorage` (`ka_conv`), reveals the text letter by letter with `kaGhost`, then runs `linkify()` after 700 ms.
10. The owner can rate an answer in Logs (`rate()`). A thumbs-up answer becomes a "learned answer" only when: it came from a visitor or buyer conversation, it has no email, phone or card number, it used an enabled owner source, and the same normalised question appears in at least 2 conversations in the last 90 days. A learned answer lasts 14 days and is deleted whenever the owner saves or deletes a knowledge source.

**Built-in rules (code, `PROHIBITIONS` in `engine.js`):** no prices or coupon codes that are not in the Store source; no card numbers, CVV, UPI PIN, codes or passwords; no revealing instructions or other customers' details; no promises of refunds, dates, custom work or legal terms; no legal, tax, medical or financial advice; never pretend to be human; text inside `<knowledge>`, `<source>`, `<order>`, `<note>` is data, not instructions. `esc()` in `knowledge.js` removes those tags from stored content so it cannot close the data block.

**Data saved:** D1 tables listed above. Conversations and learned answers older than 90 days are deleted by the daily job `assistantLogRetention` (`LOG_DAYS = 90`). Browser: `ka_vid`, `ka-chat-history`, `ka-visitor-name`, `ka_conv`.

**Controlled from the portal?** Yes. KA Assistant app: Overview (usage, cost, provider, Gemini quota per model), Knowledge (text / FAQ / document sources, on or off; text is split into chunks of at most 900 characters), Repeats, Logs (with ratings), Playground (real pipeline; counts toward the cap; "preview" shows the prompt), Settings (`enabled`, `persona`, `greeting`, `suggestions`, `languages`, `dailyBudgetMicros`, `visitorRules`, `buyerRules`, `customRules`). The provider, model and price estimates are environment values (`AI_PROVIDER`, `AI_MODEL`, `AI_FALLBACK_MODELS`, `AI_PRICE_IN`, `AI_PRICE_OUT`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`).

**Speed and smoothness:** Answers stream, so text appears while the model is still writing. A learned answer and fixed replies cost no AI call. Maximum answer length is `MAX_TOKENS = 700`.

**Screen sizes and accessibility:** On widths up to 1024 px the panel closes when a site link is opened so the item is visible. `aria-expanded` on the button, `aria-busy` during a reply, Escape closes, focus returns to the button. Reduced motion skips the closing delay.

**Security:** Rate limit; input limits; card numbers never reach the AI service or the logs; output redaction; order data only after id and email match (the reply never says which of the two was wrong); conversation ids work only with the matching visitor id; answer text is built with DOM nodes; portal routes need an admin session. Cost estimates are estimates (`pricesAreDefaults` is reported when `AI_PRICE_IN`/`AI_PRICE_OUT` are not set).

**Limits and edge cases:** History is 12 messages; message 4000 characters; the whole chat can be wrong when the knowledge is empty (it is told to say it does not know). The cost cap uses estimated prices. The hand-off keyword list is a fixed pattern (`HANDOFF` in `engine.js`).

**Not found / unclear:** `/api/public-config` returns `assistant.greeting` and `assistant.suggestions` (`public.js` → `publicConfig()`), but no code in `index.html` reads those two values (a search for `.greeting` and `.suggestions` finds nothing), so editing them in the portal does not change the chat box text. The portal's exact labels for each Settings field were not re-read line by line; the setting names above come from `server/core/settings.js`.

## 18. Visitor analytics

**What it is:** A page-visit log without cookies, and the **Visitors** app in the portal (overview, live now, visit log, CSV download). The page also asks once, after 60 seconds of use, for the browser's location permission.

**Where it runs:** Both. The page sends small messages. The server stores them. The portal reads them.

**Files:**
| File | Role |
|---|---|
| `index.html` (script "VISITOR COUNTER", lines ~8555–8625) | Beacon: ids, `kaTrackView()`, pings, leave, location prompt |
| `server/visitors/track.js` | `visit()`, `parseUA()`, `cleanReferrer()`, `BOT`, daily job `visitRetention` |
| `server/visitors/geo.js` | `locate()`, `isPublicIp()`, providers `ipstack` and `ipwhois`, cache, monthly quota |
| `server/admin/visitors.js` | `summary()`, `live()`, `log()`, `logCsv()` |
| `client/portal/src/apps/Visitors.tsx` | Tabs Overview, Live now, Visit log |
| `migrations/0001_init.sql`, `0002_ratings_and_location.sql` | Tables `visits`, `ip_geo_cache`, `geo_quota` and added columns |

**Tools and libraries:** `ua-parser-js` 1.0.41 (reads browser, OS and device from the User-Agent text). React 18.3.1 in the portal.

**Browser features used:** `localStorage` (`ka_vid`, `ka_location_asked`), `sessionStorage` (`ka_sid`, `ka_location_sent`), `crypto.getRandomValues` (random ids; falls back to `Math.random`), `navigator.sendBeacon` (leave message), `fetch` with `keepalive: true`, `visibilitychange`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `screen.width/height`, `navigator.language`, `document.referrer`, `navigator.permissions.query` and `navigator.geolocation.getCurrentPosition` (location).

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| POST | `/api/visit` | `track.js` → `visit()` | 204 (no body), 400 for a bad message |
| GET | `/api/admin/visitors?from=&to=` | `server/admin/visitors.js` → `summary()` | Totals, daily series, countries, cities, devices, browsers, OS, referrers, pages, hours |
| GET | `/api/admin/visitors/live` | `live()` | Sessions seen in the last 5 minutes (max 100) |
| GET | `/api/admin/visitors/log` | `log()` | Up to 1000 rows per request (default 300) |
| GET | `/api/admin/visitors.csv` | `logCsv()` | CSV file, up to 50000 rows |
| GET | `/api/admin/visitors/history?v=` | `history()` | One visitor's visits, score and mark |
| PUT | `/api/admin/visitors/mark` | `markVisitor()` | `{ok, mark}` |
| External | `https://ipwho.is/<ip>`, `http(s)://api.ipstack.com/<ip>` | `geo.js` → `locate()` | Country, region, city, time zone, postal code, latitude, longitude, ISP |

**Key functions:**
| Function | What it does |
|---|---|
| `window.kaTrackView(path)` | Sends one `view` for a new path (skips a repeat of the last path); includes referrer, new-visitor flag, screen size, language, time zone |
| `visit(ctx)` | Validates the message (`t` is `view`, `ping`, `leave` or `location`; ids match `[A-Za-z0-9_-]{8,40}`), rate limit 300 per IP per 10 minutes, then stores |
| `parseUA(ua)` | Device type, vendor, model, OS, browser and versions |
| `locate(ip, platformGeo)` | Uses the host's country data first (`auto`), else an outside lookup, cached 30 days, limited by a monthly quota, never longer than 1.5 s |
| `isPublicIp(ip)` | Skips private, local and link-local addresses |

**How it works, step by step:**
1. On load the page reads or creates `ka_vid` (a random 24-character id kept on the device) and `ka_sid` (a random id for this tab session). It does nothing when the address has `?preview=1` or when the page sits inside another page (the portal preview).
2. `kaTrackView()` sends `{t:"view", p, r, n, w, h, l, z, s, v}` to `/api/visit`. It runs on load and on every section change.
3. Every 30 seconds while the tab is visible it sends `{t:"ping", d}` where `d` is the visible time in milliseconds. When the tab is hidden or closed it sends `{t:"leave", d}` with `sendBeacon`.
4. Server, `view`: reads the User-Agent, calls `locate()`, parses the browser, and inserts a `visits` row with the raw IP, the cleaned referrer (the page's own origin is dropped), screen size, language, and `is_bot` (true when the User-Agent matches the `BOT` pattern or is empty).
5. Server, `ping` and `leave`: updates `last_seen_at` and `duration_ms` (the larger value wins) on the newest row of that session.
6. Location, after 60 seconds of visible use (checked every 5 seconds): if the browser already granted permission, the page sends the position once per visit. If the state is `prompt` and the page never asked on this device (`ka_location_asked`), it asks once and sets that flag. A refusal or ignoring the prompt is not asked again.
7. The page sends `{t:"location", lat, lon, accuracy}`. The server keeps it **only when `accuracy` is 1000 metres or better**. It stores latitude and longitude rounded to 3 decimals (about 100 m), the accuracy rounded to the nearest 100 m (at least 100), and `location_source = 'browser-consent'`. Anything worse is dropped and the IP-based place stays.
8. The portal summary excludes bots. Days and hours use the `Asia/Kolkata` offset (+330 minutes). "Live now" counts sessions with `last_seen_at` in the last 5 minutes.
9. The daily job `visitRetention` deletes visits older than `visitors.retentionDays` (default 365; 0 keeps forever), deletes location cache entries older than 30 days, and clears browser-consented coordinates older than 7 days.

**Visitor history and marks (added later).** In Visitors → Visit log, opening a row now shows **This visitor's history** (`VisitorHistory` in `Visitors.tsx`): every earlier visit by the same device (`ka_vid`, up to 300), visits and sessions, first seen, time spent, pages, places and IP addresses, and an **engagement score** from 0 to 100 (`history()` in `server/admin/visitors.js`: up to 40 for return visits, 30 for pages seen, 30 for minutes). The owner can **mark** the visitor (labels follow-up, interested, client, ignore, plus a note up to 300 characters; `markVisitor()`), see a star on marked rows, and filter the log to **★ Marked**. Marks are stored in the `settings` key `visitorMarks` (at most 500), so no database change was needed. Routes: `GET /api/admin/visitors/history?v=<visitor id>` and `PUT /api/admin/visitors/mark` (both admin only; marking is written to the audit log).

**Data saved:** `visits` (session, visitor, path, referrer, IP, country, region, city, time zone, language, device, OS, browser, screen, bot flag, User-Agent, postal, latitude, longitude, ISP, continent, accuracy, source, duration), `ip_geo_cache`, `geo_quota`. Browser: `ka_vid`, `ka_sid`, `ka_location_asked`, `ka_location_sent`.

**Controlled from the portal?** Read-only app (Overview, Live now, Visit log, filters for dates, country, search, bots; CSV). The retention setting is `visitors.retentionDays` in the settings store (default in `server/core/settings.js`). Provider choice is by environment values `GEO_PROVIDER`, `GEO_FALLBACK`, `IPSTACK_ACCESS_KEY`, `IPSTACK_HTTPS`, `IPSTACK_ALLOW_HTTP`.

**Speed and smoothness:** Messages are tiny and answered with 204. The location lookup is cached and capped at 1.5 s so it cannot hold up the page. `keepalive` and `sendBeacon` let the last message leave while the page closes.

**Screen sizes and accessibility:** Nothing visible on the public page. The portal tables use the same responsive portal styles.

**Security:** No cookies. IP and User-Agent are stored raw, which is personal data; the owner can shorten retention. Location needs the browser's permission. The server rounds coordinates and keeps them 7 days at most. Messages are limited to 4096 characters. The site's header `Permissions-Policy: geolocation=(self)` (in `client/public/_headers`) allows location only for the site itself.

**Limits and edge cases:** With the location request set to normal accuracy (`enableHighAccuracy: false`, `index.html` line ~8610), a browser may report accuracy worse than 1000 m, and then the server ignores that fix (`accuracy <= 1000` in `track.js`). The IP-based place is used instead. The ids from `rid()` are 12 random bytes written as 24 hex characters. Bot detection is by User-Agent text only.

**Not found / unclear:** The exact rendering of each chart in `Visitors.tsx` was not traced line by line.

---

## 19. Live updates

**What it is:** When the owner saves something in the portal, pages that are already open show the change without a reload. The portal also refreshes its own lists.

**Where it runs:** Both.

**Files:**
| File | Role |
|---|---|
| `index.html` (script "live updates", lines ~8376–8410) | Version check loop, `refresh()` |
| `server/handlers/public.js` | `liveVersion()`, `bumpLiveVersion()` |
| `server/core/router.js` | Runs `afterAdminWrite` after every successful portal write |
| `server/handler.js` | `router.setGuard('afterAdminWrite', pub.bumpLiveVersion)` and `GET /api/live` |
| `client/portal/src/api.ts` | Tells other tabs through `BroadcastChannel('ka-live')`, `onDataChanged()` |
| `client/portal/src/hooks.ts` | `useLoad()` with `pollMs` and quiet refresh |

**Tools and libraries:** None.

**Browser features used:** `fetch` (`cache: "no-store"`), `setInterval`, `visibilitychange`, `focus`, `online`, `BroadcastChannel`, `CustomEvent("ka-content-changed")`.

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| GET | `/api/live` | `public.js` → `liveVersion()` | `{v: <number>}` read from the `settings` row with key `live` |
| GET | `/api/portfolio` | `public.js` → `portfolio()` | The site document (re-read when the version moves) |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `liveVersion()` | `server/handlers/public.js` | Returns `{v: revision}` of the `live` settings row |
| `bumpLiveVersion()` | `server/handlers/public.js` | Adds 1 to that revision |
| `check()` / `refresh()` | `index.html` | Ask for the version; when it changed, re-apply the site document and fire `ka-content-changed` |
| `useLoad()`, `onDataChanged()` | `client/portal/src/hooks.ts`, `api.ts` | Portal refresh after saves and on a timer |

**How it works, step by step:**
1. After any portal request that is not GET or HEAD and succeeds (`r.access === 'admin'`), `router.dispatch()` calls `bumpLiveVersion()`. It adds 1 to `settings.revision` for key `live`. A failure here is ignored.
2. An open page calls `/api/live` once on load and then every 15 seconds while visible (`setInterval(check, 15000)`). It also checks when the tab becomes visible, when the window gets focus, when the network returns, and 150 ms after a `BroadcastChannel('ka-live')` message from a portal open in the same browser.
3. If `v` differs from the last value, `refresh()` runs `loadPortfolioFromAPI()` (re-applies fonts, banner, pass design, text, layout, images) and sends the `ka-content-changed` event.
4. The Store and Tips listen for `ka-content-changed` and re-read their lists quietly.
5. In the portal, `useLoad()` refreshes a screen when `pollMs` is set (for example Visitors: 60 s, Live now: 10 s), when the window returns to the front, and 250 ms after any save in the portal (`onDataChanged`).

**Data saved:** One row in `settings` (key `live`, column `revision`).

**Controlled from the portal?** Automatic. No setting.

**Speed and smoothness:** The answer is a few bytes. The page does nothing while hidden. The comment in `public.js` says "every few seconds"; the code in `index.html` uses 15 seconds.

**Screen sizes and accessibility:** Not applicable.

**Security:** The route is public and returns only a number.

**Limits and edge cases:** Changes made without the portal (direct database edits) do not move the version. A page learns of a change within 15 seconds (or at once when the portal is open in the same browser).

**Not found / unclear:** none.

---

## 20. Performance

**What it is:** The choices that keep the page fast. This section lists them in one place. Each item names the file where it is done.

**Where it runs:** Both.

**Files:** `index.html`, `client/public/_headers`, `vite.config.mjs`, `server/core/router.js` (`withEtag`), `server/handlers/public.js` (`PUBLIC_CACHE`), `client/src/store/Store.tsx`, `generator/build_cinematic.py`.

**Tools and libraries:** Vite 6.4.3 (build, code splitting), TypeScript 5.7.2 (`tsc --noEmit` in the build).

**Browser features used:** `<link rel="preload">` (3: Three.js script, crystal atlas, crystal cutout), `<link rel="preconnect">` (2: Google Fonts), `fetchpriority="high"` on the two hero images, `IntersectionObserver` (13 uses in `index.html`), `requestIdleCallback`, `ResizeObserver`, `will-change` (16 uses), `navigator.deviceMemory`, `navigator.hardwareConcurrency`, `devicePixelRatio`, `document.fonts`.

**Server APIs called:** none of its own.

**Key functions:**
| Technique | Where | What it does |
|---|---|---|
| Lazy bundles | `vite.config.mjs` (`input` list), loaders in `index.html` | `gallery`, `poster`, `panda`, `studio`, `store`, `skill-logos` and the portal are separate files loaded only when needed. Their names are fixed, so `_headers` marks them `no-cache` |
| Lazy checkout | `Store.tsx` | `lazy(() => import('./Checkout'))` |
| Long cache for build files | `_headers` | `/assets/*` is `public, max-age=31536000, immutable` (file names carry a hash) |
| Always-fresh homepage | `_headers` | `/` and `/index.html` are `no-cache`, so a deploy shows at once; unchanged files answer 304 |
| Image cache | `_headers` | `/images/*`: 1 day plus `stale-while-revalidate=604800` |
| ETag for API reads | `router.js` → `withEtag()` | A public JSON answer that did not change returns 304 with no body |
| Image formats | `images/` folder, `<picture>` in `index.html` | Each work image exists as AVIF and WebP in several widths (480, 1080, 1600, 2400 for the sample seen) |
| Low-power scaling | `index.html` (`perfScale`) | On mobile with `deviceMemory <= 2` or `hardwareConcurrency <= 4`, star, galaxy and shard counts are multiplied by 0.55 |
| Frame cap | nebula script | About 30 frames per second; CSS fallback when WebGL is missing |
| Pixel budget | hero script (`index.html` lines ~2377–2379) and paint trail (~7624–7652) | Hero: at most 2,400,000 pixels on mobile, 9,500,000 with 8 or more cores, else 6,000,000; pixel ratio never above 2. Paint trail: 1,000,000 pixels when `deviceMemory <= 2`, else 2,500,000 |
| Reduced motion | hero script `settleStatic()` and CSS | Skips the animation and shows the final state |
| Deferred bot check | contact form | Turnstile loads on first focus, not on page load |
| Bundled build check | `package.json` `build` script | `verify_scripts.cjs`, `tsc --noEmit`, `vite build`, then tests |

**How it works, step by step:** (1) The browser loads `index.html` with preloads for the hero. (2) The hero starts as soon as Three.js and the two images are ready. (3) Other sections load their bundle when the visitor reaches them. (4) Repeat visits reuse cached build files and re-check only the homepage and `/api` reads with ETags.

**Data saved:** none.

**Controlled from the portal?** No.

**Speed and smoothness:** see items above. No service worker is used (`serviceWorker` is not in `index.html`). `content-visibility`, `modulepreload`, `dns-prefetch` and the Network Information API are not used.

**Screen sizes and accessibility:** `prefers-reduced-motion` handling is in feature 7.

**Security:** not applicable.

**Limits and edge cases:** Compression (gzip or Brotli) is done by Cloudflare's network; no code in the project sets it, so it is NOT FOUND IN CODE.

**Not found / unclear:** Measured load times (no performance tests or numbers exist in the repository).

## 21. Admin login, sessions, 2FA and team roles

**What it is:** The sign-in to the portal at `/portal/`, the optional authenticator-app code, the list of signed-in devices, and the team list where the owner adds people.

**Where it runs:** Both. The sign-in screens run in the browser (React). Every check runs on the server.

**Files:**
| File | Role |
|---|---|
| `server/admin/auth.js` | `setupStatus`, `setup`, `login`, `session`, `account`, `logout`, `logoutEverywhere`, `listSessions`, `revokeSession`, `changePassword`, `twoFactorStart`, `twoFactorEnable`, `twoFactorDisable`, `requireAdmin`, `findSession`, `startSession`, `passwordPolicy`, `audit` |
| `server/admin/team.js` | `listTeam`, `addPerson`, `updatePerson`, `resetPersonPassword`, `signOutPerson`, `setPersonAccess`, `deletePerson`, `ownerOnly`, `assertNotLastOwner` |
| `server/core/crypto.js` | `hashPassword`, `verifyPassword` (scrypt), `randomToken`, `sha256hex`, `safeEqual`, `encrypt`/`decrypt` (AES-256-GCM), `newTotpSecret`, `totpCode`, `verifyTotp`, `base32Encode`/`base32Decode` |
| `server/core/router.js` | Access levels `public`, `admin`, `cron`, `webhook`; `dispatch()` |
| `server/core/http.js` | `parseCookies`, `serializeCookie`, `assertSameOrigin` |
| `client/portal/src/main.tsx` | `App`: picks setup, sign-in, forced password change or desktop |
| `client/portal/src/shell/Auth.tsx` | `AuthScreen`, `ChoosePassword` |
| `client/portal/src/api.ts` | `api()`: sends the CSRF header, announces a signed-out state |
| `client/portal/src/apps/Settings.tsx` | Account and security, team, sessions screens |
| `migrations/*.sql` | Tables `admin_users`, `admin_sessions`, `audit_log` |

**Tools and libraries:** No login library. Uses `node:crypto` (works on Cloudflare Workers with the `nodejs_compat` flag, comment at the top of `crypto.js`). `ua-parser-js` 1.0.41 names devices in the session list. React 18.3.1.

**Browser features used:** `fetch` with `credentials: 'same-origin'`, HttpOnly cookie (JavaScript cannot read it), `autocomplete` attributes (`username`, `current-password`, `new-password`, `one-time-code`), `aria-live="assertive"` for errors, `window.dispatchEvent` for the signed-out event.

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| GET | `/api/admin/setup-status` | `auth.js` → `setupStatus()` | `{needsSetup, signedIn, setupConfigured}` (always 200) |
| POST | `/api/admin/setup` | `setup()` | `{ok, csrf, email}` 201 plus cookie |
| POST | `/api/admin/login` | `login()` | `{ok, csrf, email, role, name, mustChangePassword}` plus cookie; 401 `totp_required` when a code is needed |
| GET | `/api/admin/session` | `session()` | New CSRF token and user details |
| GET | `/api/admin/account` | `account()` | Account details (does not change the CSRF token) |
| POST | `/api/admin/logout` | `logout()` | `{ok:true}`, clears the cookie |
| POST | `/api/admin/logout-everywhere` | `logoutEverywhere()` | `{ok:true}` |
| GET | `/api/admin/sessions` | `listSessions()` | Up to 50 active sessions with device and browser names |
| DELETE | `/api/admin/sessions/:id` | `revokeSession()` | `{ok:true}` |
| POST | `/api/admin/password` | `changePassword()` | `{ok:true}` |
| POST | `/api/admin/2fa/start` | `twoFactorStart()` | `{secret, otpauth}` |
| POST | `/api/admin/2fa/enable` | `twoFactorEnable()` | `{ok:true}` |
| POST | `/api/admin/2fa/disable` | `twoFactorDisable()` | `{ok:true}` |
| GET/POST/PUT/DELETE | `/api/admin/team`, `/team/:id`, `/team/:id/password`, `/team/:id/sign-out`, `/team/:id/access` | `team.js` functions | `{people:[…]}` |

**Key functions:**
| Function | What it does |
|---|---|
| `requireAdmin(ctx)` | The guard on every `admin` route: cookie → session lookup → CSRF check on writes → forced-password-change check → idle refresh |
| `findSession(ctx)` | Finds a session whose token hash matches, is not revoked, has not expired, was seen within the idle limit, and whose user is not disabled |
| `startSession(ctx, userId)` | Makes a 32-byte token and a 24-byte CSRF token, stores only their SHA-256, sets the cookie |
| `passwordPolicy(pw)` | At least 12 characters, at most 200; refuses one repeated character and a few common starts |
| `verifyTotp(secret, code)` | Accepts the current 30-second code and one step before or after; returns the step so it cannot be reused |
| `audit(ctx, action, target, data)` | Writes a row to `audit_log` with IP and actor |

**How it works, step by step:**
1. The portal page loads. `App` calls `GET /api/admin/setup-status`. It shows setup (no users yet), sign-in, or the desktop (a valid session cookie exists).
2. **First-time setup:** `setup()` needs the code in `ADMIN_SETUP_TOKEN` (in development the default is `local-setup`; in production a missing token refuses setup). Limit: 5 tries per IP per 15 minutes. The owner row is inserted with one statement that only works while the table is empty, so two requests cannot both create an owner.
3. **Sign-in:** `login()` limits 10 tries per IP per 15 minutes. An unknown email still runs a password check against a fake hash, so the time taken does not reveal whether the email exists. A wrong password counts as a failed attempt: from the 5th failure the account locks for `min(1440, 15 × 2^(attempts−5))` minutes (15, 30, 60 … up to 24 hours).
4. If 2FA is on and no code was sent, the server answers 401 `totp_required` and the screen asks for the 6-digit code. A code is accepted once: its step must be higher than `totp_last_step`.
5. A disabled person gets 403 after the password and code checks pass. On success the failure count is reset, the sign-in is audited, and `startSession()` sets the cookie `ka_admin`.
6. **Cookie:** HttpOnly, Secure (https or production), SameSite Strict, path `/api/admin`, lifetime 12 hours. The database stores only the SHA-256 of the token.
7. **Every portal call:** `requireAdmin()` → session lookup (12 hours absolute, 2 hours idle) → for writes the `X-CSRF-Token` header must hash to the stored `csrf_hash` → a person with a temporary password may only reach session, account, password and logout until they choose their own.
8. `GET /api/admin/session` creates a new CSRF token each time; the portal keeps it in memory only (`setCsrf()`).
9. A 401 `signed_out` anywhere makes the portal show the sign-in box over the desktop, keeping open windows and unsaved edits.
10. **2FA:** `twoFactorStart()` creates a 20-byte secret (base32), stores it encrypted with `ADMIN_ENCRYPTION_KEY` and returns an `otpauth://` link for an authenticator app. `twoFactorEnable()` turns it on after one correct code. `twoFactorDisable()` needs the password and a code. In production, a missing `ADMIN_ENCRYPTION_KEY` gives 503 for these steps.
11. **Password change:** `changePassword()` checks the current password, applies the policy, and signs out all other sessions.
12. **Team (owner only):** add a person with a temporary password (they must change it at first sign-in), change role, reset password (signs them out), sign them out, switch access off or on, delete. Nobody can change their own role, switch themselves off, delete themselves, or remove the last active owner.

**Roles:** Only two exist: `owner` and `admin` (`ROLES` in `team.js`). The only code that checks the role is `ownerOnly()` in `team.js`: team management is owner-only. A search of `server/` finds no other role check, so an `admin` can use every other portal app. A limited "Worker" role is **NOT FOUND IN CODE**.

**Data saved:** `admin_users` (email, name, role, scrypt password hash, `totp_secret` encrypted, `totp_enabled`, `totp_last_step`, `failed_attempts`, `locked_until`, `must_change_password`, `disabled_at`), `admin_sessions` (token hash, CSRF hash, expiry, last seen, IP, User-Agent, `revoked_at`), `audit_log`.

**Controlled from the portal?** Yes: Settings → Account and security (password, 2FA, sessions) and the team list (owner).

**Speed and smoothness:** Password hashing takes noticeable time on purpose (scrypt, N = 32768, r = 8, p = 1, 64-byte key). Session `last_seen_at` is written at most once a minute.

**Screen sizes and accessibility:** The sign-in card is one column. Errors use `role="alert"` and `aria-live`. The password field has a show/hide button with `aria-pressed`. The 2FA field uses `autocomplete="one-time-code"` and numeric input mode.

**Security:** scrypt with a per-password salt; constant-time comparisons (`safeEqual`, `timingSafeEqual`); no token stored in clear; CSRF header on every write; `assertSameOrigin(request, [])` on every admin route; lockout and rate limits; generic "Email or password is wrong." message; audit log; the portal files are sent with `X-Robots-Tag: noindex, nofollow, noarchive`, `X-Frame-Options: DENY`, `Cache-Control: no-store` (`client/public/_headers`).

**Limits and edge cases:** The idle limit is 2 hours and the absolute limit 12 hours. Resetting 2FA for another person is not offered in `team.js`; NOT FOUND IN CODE. If `ADMIN_SETUP_TOKEN` is missing in production, setup cannot be completed (`setupConfigured` is false).

**Not found / unclear:** none beyond the two NOT FOUND items above.

## 22. Portal desktop (windows, dock, menu bar, search)

**What it is:** The owner portal at `/portal/`. It looks like a desktop: a menu bar on top, a dock of apps at the bottom, and each app opens in its own window.

**Where it runs:** Browser (React). Data comes from the `/api/admin` routes.

**Files:**
| File | Role |
|---|---|
| `client/portal/index.html`, `client/portal/src/main.tsx` | Page and `App`/`Desktop` (boot, sign-in, desktop) |
| `client/portal/src/shell/desk.tsx` | `DeskProvider`, `useDesk()`: window list, focus, minimise, zoom, tile, cycle, saved size, URL hash |
| `client/portal/src/shell/Window.tsx` | `Window`: drag, resize, snap, window buttons, error box (`Boundary`), `WinTools` |
| `client/portal/src/shell/Chrome.tsx` | `MenuBar`, `Menu`, `Dock`, `HomeScreen`, `Palette`, `Shortcuts`, `Tour`, `useChrome()`, `useUserActive()` |
| `client/portal/src/shell/fullscreen.tsx` | `useFullscreen()` |
| `client/portal/src/shell/UsageAlert.tsx` | Storage warning popup |
| `client/portal/src/apps/registry.ts` | `APPS` list (16 apps, each loaded on first open) |
| `client/portal/src/hooks.ts` | `useLoad()`, `useDraft()`, `usePref()`, `useMedia()` |
| `client/portal/src/ui.tsx` | Shared parts: `Modal`, `ToastProvider`, `ConfirmProvider`, `Spinner`, `SkeletonRows` |
| `client/portal/src/tokens.css`, `portal.css`, `apps.css` | Styles |
| `server/admin/system.js` | `pulse()`, `search()` |

**Tools and libraries:** React 18.3.1, react-dom 18.3.1, `@phosphor-icons/react` 2.1.10 (dock icons), Vite 6.4.3.

**Browser features used:** Pointer events with pointer capture (drag and resize), `transform: translate3d`, `localStorage` (`ka.portal.geom`, `ka.portal.theme`, `ka.portal.accent`, `ka.portal.tour.v1`, `ka.portal.usageSnooze`), `history.replaceState` and `hashchange` (links like `/portal/#messages/<id>`), `matchMedia`, Fullscreen API (and the `webkit` version), `navigator.standalone`, `keydown` shortcuts, `BroadcastChannel` (via `api.ts`), `meta[name="theme-color"]`.

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| GET | `/api/admin/pulse` | `system.js` → `pulse()` | `{newMessages, liveVisitors, orders24h, needsAttention, serverTime}` (polled every 30 s) |
| GET | `/api/admin/search?q=` | `system.js` → `search()` | Up to 5 orders, 5 products, messages, 3 tips, 3 coupons (query at least 2 characters) |
| GET | `/api/admin/usage` | `server/admin/usage.js` → `usage()` | Storage and database fullness for `UsageAlert` |

**The 16 apps (dock order, from `registry.ts`):** Overview, Products, Orders, Reports, Coupons, Downloads, Visitors, Messages, KA Assistant, Social, Tips, Studio, Content, License card, Licenses & Legal, Settings. Each app is described in feature 24.

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `DeskProvider` / `useDesk()` | `client/portal/src/shell/desk.tsx` | Window list and actions: `open`, `close`, `focus`, `minimize`, `toggleMax`, `setRoute`, `setGeom`, `tile`, `cycle` |
| `Window` | `client/portal/src/shell/Window.tsx` | Drag, resize, snap, window buttons, error box |
| `useChrome()` | `client/portal/src/shell/Chrome.tsx` | Theme, accent, shortcuts, commands, tour, full screen, sign-out |
| `Palette` | `client/portal/src/shell/Chrome.tsx` | Search and command box |
| `UsageAlert` | `client/portal/src/shell/UsageAlert.tsx` | Storage warning |
| `pulse()`, `search()` | `server/admin/system.js` | Counts for the menu bar; search across orders, products, messages, tips, coupons |

**How it works, step by step:**
1. `App` decides the screen (feature 21). When signed in it renders `Desktop`.
2. `DeskProvider` reads the URL hash. With no hash it opens Overview. `#messages/<id>` opens Messages at that item. The hash follows the front window, and the page title becomes "<App> · KA Portal".
3. Opening an app creates a window (`open()`): size from the app's default or from the last saved size, cascaded from the centre. Opening an open app brings it to the front.
4. Dragging the title bar moves the window directly with `transform`, without re-rendering React on each move; the result is saved when you let go. Dropping at the top edge maximises; at the left or right edge tiles to half the screen (`tile()`). Double-clicking the title bar zooms. Eight edge handles resize (minimum 360 × 260).
5. A window with unsaved edits (`useWinDirty`) asks "Close … ? Discard and close" before closing.
6. If one app throws an error, `Boundary` shows a message with "Try again" and the other windows stay. If a lazy file fails to load after an update, it says "The portal was updated" with a Reload button.
7. Window positions and sizes are saved 400 ms after a change (`ka.portal.geom`) and kept on screen when the browser is resized.
8. Compact layout (`max-width: 760px`, or `max-height: 520px` with a touch screen): windows are full screen, a "Back to apps" button replaces the traffic lights, and a home screen of app tiles shows when nothing is open.
9. Menu bar: logo menu (help, shortcuts, tour, theme), a live-visitors pill (opens Visitors → Live), a Messages button with the new-message count, full-screen button, search button, account menu. Dock badges come from `pulse`.
10. Search and commands: `Ctrl/Cmd + K` opens `Palette`. Typing 2 or more characters calls `/api/admin/search`; commands such as "New product", "New coupon", "Back up now", "View the live site", "Sign out" are built in `useChrome()`.
11. `pulse` polls every 30 s only while the owner was active in the last 10 minutes (`useUserActive`) and the window is the front one.
12. 2.5 seconds after load `UsageAlert` asks `/api/admin/usage`. If storage or the database is above 80% (warning) or 95% (critical) it shows a popup, once a day per level ("Remind me tomorrow").
13. A first-run tour of 5 steps shows once (`ka.portal.tour.v1`).

**Keyboard shortcuts (from `Shortcuts` and `useChrome()`):** `Ctrl/Cmd+K` search; `Alt+1…9, 0` open dock apps 1–10; `Alt+W` close; `Alt+M` minimise; `` Alt+` `` switch windows (Shift reverses); `Alt+T` dark/light; `Alt+,` Settings; `?` list of shortcuts; `Esc` closes dialogs and menus.

**Data saved:** Browser only (`localStorage` keys above). Nothing is saved on the server for the desktop layout.

**Controlled from the portal?** The look of the portal itself: theme (system, light, dark) and accent (`ember` or `crimson`) from the menu bar.

**Speed and smoothness:** Each app is a separate lazy file, so the desktop starts without loading all 16. Windows move with `translate3d`. Background refresh pauses when the tab is hidden.

**Screen sizes and accessibility:** Menu bar is `nav` with a label; menus use `role="menu"` with arrow keys, Home, End and Escape; the dock is `role="toolbar"` with arrow keys; windows have `aria-label`; minimised windows are `inert`; "Skip to the front window" link; the palette is a `combobox` with `aria-activedescendant`; the tour and dialogs use `aria-modal`.

**Security:** Portal files are sent with `X-Frame-Options: DENY`, `X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: no-store` (`client/public/_headers`). Every call needs the session (feature 21).

**Limits and edge cases:** Window layout is per browser, not per account. Search returns at most 5 rows per kind.

**Not found / unclear:** The exact list of menu items under the KA menu was not read item by item.

---

## 23. Portal controls for the public site (fonts, colours, text, layout, animation, images, license card)

**What it is:** The **Studio**, **Content** and **License card** apps. They edit one saved document (the "site document") that the homepage reads. The owner changes fonts, colours, texts, banner, links, element positions, entrance animations, images, the About numbers, the Skills board and the checkout pass design, with a live preview of the real homepage.

**Where it runs:** Both. The portal edits a draft. The server validates and saves it. The homepage applies it.

**Files:**
| File | Role |
|---|---|
| `client/portal/src/apps/siteDoc.ts` | One shared draft for Studio and Content: `loadSite()`, `updateSite()`, `saveSite()`, `discardSite()`, `keepMineOverTheirs()`, `useSite()`, `withDefaults()` |
| `client/portal/src/apps/Studio.tsx` | Sections: Colour (`identity`), Type, Banner & nav (`notice`), Links (`social`), Elements, Arrange, Checkout pass (`pass`); `Preview` iframe |
| `client/portal/src/apps/License.tsx` | The same Studio with only the Checkout pass section (`only="pass"`) |
| `client/portal/src/apps/Content.tsx` | Tabs: Portfolio, Site text, Upscaler & list, Emails |
| `server/admin/site-document.js` | `validateSiteDocument()`, `validateSkills()`, lists `FONT_CHOICES`, `ANIM_PRESETS`, `DRAGGABLE_IDS`, defaults |
| `server/admin/content.js` | `getSite()`, `saveSite()` |
| `server/handlers/public.js` | `portfolio()`, `loadSiteDocument()` (what visitors get) |
| `index.html` | `loadPortfolioFromAPI()`, `applyPortfolioData()`, `applySiteAppearance()`, `applyCustomFonts()`, `applyElementStyles()`, `applyElementAnimations()`, `applyAccentColor()`, `applyFavicon()`, `applyLayoutOverrides()`, preview message handler (~line 8534) |
| `client/src/store/checkout/PassCard.tsx` | Draws the license card from `passCard` (see feature 12) |
| `server/portfolio-seed.json` | First version of the document |
| `shared/about-default.js` | Default About story (bio, journey, promo cuts), used by the server and the portal |

**Tools and libraries:** React 18.3.1; Web Animations API in the page; no extra library.

**Browser features used:** `<iframe src="/?preview=1">` with `postMessage` (same origin only, checked by `e.origin` and `e.source`), `CSS custom properties` (`--font-heading`, `--font-body`, `--text-scale`, `--glass-blur`, `--amber`, `--accent-glass`), `<style id="ka-custom-fonts">` with `@font-face`, CSS `translate` and `scale` properties for layout offsets, `IntersectionObserver` and `element.animate()` for entrance animations, `sessionStorage` (`ka_notice_dismissed`), `matchMedia`.

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| GET | `/api/portfolio` | `public.js` → `portfolio()` | The site document (public, `Cache-Control: no-cache` + ETag) |
| GET | `/api/admin/site` | `content.js` → `getSite()` | The document with `revision` |
| PUT | `/api/admin/site` | `saveSite()` | The saved document, new `revision`; 409 `stale` if the revision is old |
| GET | `/api/admin/site/skills-defaults` | inline in `registerContent()` | `SKILLS_DEFAULT` |
| POST | `/api/admin/uploads` | `catalog.js` → `signUpload()` | Signed upload address (feature 25) |

**What each control changes (all names from `validateSiteDocument()`):**
| Control | Document field | Allowed values | Applied by (page) |
|---|---|---|---|
| Heading font, body font | `details.headingFont`, `details.bodyFont` | One of `Fraunces, Manrope, Sora, Poppins, Playfair Display, Space Grotesk, system-ui` or an uploaded font | `--font-heading`, `--font-body` |
| Custom fonts (max 20) | `details.customFonts[{family,url}]` | Name letters/digits/space/`-`/`_`, unique, uploaded file | `applyCustomFonts()` writes `@font-face` with `font-display: swap` |
| Text size | `details.textScale` | 0.85 to 1.2 | `--text-scale` |
| Glass blur | `details.glassBlur` | 0 to 40 | `--glass-blur` (scaled ×0.9, and ×0.667 on screens up to 760 px) |
| Accent colour | `details.accentColor` | `#RRGGBB` (default `#FF9438`) | `applyAccentColor()` sets `--amber` and `--accent-glass` |
| Favicon | `details.faviconUrl` | Uploaded image | `applyFavicon()` |
| Site text | `details.creatorName, tagline, portfolioTitle, portfolioIntro, contactTitle, contactIntro, openLabel, closeLabel, projectLabel, contactButton` | Each required, with maximum lengths (80, 160, 100, 500, 100, 1000, 60, 60, 60, 60) | `applyPortfolioData()` (page title, About heading, copyright line, gallery heading, contact heading and text, Send button label) |
| Per-element font and colour | `elementStyles[id].font`, `.color` | `id` in `DRAGGABLE_IDS`; colour `#RRGGBB` | `applyElementStyles()` |
| Per-element entrance animation | `elementStyles[id].animation` | `preset` (`fade, slide-up, slide-down, slide-left, slide-right, scale-in, pop`), `duration` 100–3000 ms, `delay` 0–3000 ms, `easing` (`linear, ease, ease-in, ease-out, ease-in-out, bounce`), `trigger` (`load` or `scroll`) | `applyElementAnimations()`: `load` plays at once; `scroll` plays once when 12% visible |
| Element positions | `layoutOverrides.mobile/tablet/desktop[id] = {x,y,scale}` | `x`,`y` within ±300 (text blocks) or ±2000; scale 0.5 to 2.5 | `applyLayoutOverrides()` with CSS `translate` and `scale` per breakpoint (mobile up to 760, tablet up to 1024) |
| Banner | `notice.enabled`, `.text` (max 220), `.tone` (`info` or `warning`) | Text required when on | `applySiteAppearance()` with `textContent` (plain text only); one dismissal per distinct message |
| Navigation | `visibility.navGallery`, `.navAbout`, `.autoFullscreen` | true/false | Filters `NAV_ITEMS` and calls `renderNavItems()` |
| Social links (max 8) | `socialLinks[{label,url,icon}]` | Icons `behance, instagram, x, linkedin, youtube, website, email`; links `https://`, `http://` or `mailto:` | `renderSocialLinks()` |
| Logo | `branding.enabled`, `.logoUrl` | Upload required to turn on | Page logo |
| Folders (max 30), images (max 300) | `folders[]`, `images[]` | Unique folder names; image: unique slug, title, existing folder, description (4000), link, up to 20 technologies, `downloadable`, `hidden` (kept in the portal, left out of `/api/portfolio` by `visibleSite()`) | `applyPortfolioData()`, `buildFolders()` |
| Folder covers and loop | `stacks.loop`, `stacks.covers` | A cover slug must belong to that folder | Work stacks (feature 5) |
| About numbers (max 6) | `stats.enabled`, `stats.items[{label,value,suffix}]` | Label 40, whole number 0 to 1,000,000,000, suffix 4 | `renderAboutStats()` |
| Skills board | `skills` | Up to 14 categories and 24 items | `window.kaRenderSkills()` (feature 4) |
| About story | `about.bio` (1600), `about.journey{enabled,since 1990–2100,steps[{title 40,text 90}] max 8}`, `about.reel{enabled,title,intro,panelLabel,panelText,buttonLabel,channelLabel,channelUrl,clipMin,clipMax (2–30 s),videos[{id,len,title}] max 12}` | YouTube link or 11-character ID per video; channel link must be youtube.com | `window.kaRenderAbout()` (feature 3) |
| License card | `passCard` | `label` (24), `logoUrl`, `logoSize` 16–44, `showTag`, `tagText`, `titleFont`, `priceFont`, `textPosition` (`bottom, center, top`), `pricePosition` (`right, left, below`), `stampText` (12), `foil`, `dim` 0–90, `signatureText` (40), `signatureFont`, `signatureSize` 16–60, `signatureTone` (`gold, white, ink, accent`), `signatureAngle` −12 to 12, `showSeal`, `backEyebrow`, `licensedLabel`, `signLabel`, `backNote` (100), `showTerms` | `window.kaPassCard` and the `ka-pass-card` event; drawn by `PassCard.tsx` |

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `loadSite()`, `updateSite()`, `saveSite()`, `discardSite()`, `keepMineOverTheirs()` | `client/portal/src/apps/siteDoc.ts` | The shared draft and its save |
| `validateSiteDocument(input, current, seed)` | `server/admin/site-document.js` | Checks every field and returns the clean document |
| `saveSite(ctx)` | `server/admin/content.js` | Revision check, validate, store, audit |
| `applyPortfolioData(data)`, `applySiteAppearance(data)` | `index.html` | Apply the document to the page |
| `applyElementAnimations(styles)`, `applyLayoutOverrides(data)` | `index.html` | Entrance animations and per-breakpoint positions |

**How it works, step by step:**
1. Opening Studio, Content or License card calls `loadSite()`, which does `GET /api/admin/site` and fills the shared draft. All three windows edit the same draft, and one Save commits everything.
2. The Studio preview is the real homepage in an iframe (`/?preview=1`). The iframe says `ka-preview-ready`; the portal then sends `{type:'ka-preview-data', data: draft}` 120 ms after each change. In "Arrange" mode (`ka-preview-edit-mode`) the owner drags or resizes elements in the preview; the page answers `ka-preview-moved` with the new `x`, `y`, `scale` for the current breakpoint. `ka-preview-selected` selects an element in the panel.
3. Pages in preview mode do not count as visits (feature 18).
4. Save: `saveSite()` does `PUT /api/admin/site` with the whole document and its `revision` (the body limit is 512 KB). The server checks the revision, runs `validateSiteDocument()` (a bad value is refused with a message, never silently dropped), stores it with `setSetting('site', next, current.revision)`, and writes an audit row `site_saved`. A second save while one is running waits for the first.
5. If the revision is old (another tab or person saved), the server answers 409 `stale`. The portal can reload the newest version or use `keepMineOverTheirs()` to replace theirs deliberately.
6. After the save, `afterAdminWrite` raises the live version (feature 19). Open pages call `/api/portfolio` and run `applyPortfolioData()` → `applySiteAppearance()`.
7. First paint on the homepage uses built-in fallbacks (`POSTERS`, `CATEGORIES`, `DEFAULT_SKILLS`) until `/api/portfolio` answers.

**Data saved:** `settings` row key `site` (JSON document plus revision). Uploaded fonts and images go to storage (feature 25).

**Controlled from the portal?** This feature is the portal control.

**Speed and smoothness:** The preview is debounced (120 ms). The page re-applies only what changed: the accent colour and each element animation use a "same as last time" check, so typing elsewhere does not replay animations. Drag in the preview moves the element directly and commits on release.

**Screen sizes and accessibility:** Layout offsets are stored per breakpoint (mobile, tablet, desktop), and `applyLayoutOverrides()` runs again on resize. Colour and text-size controls have limits so the page stays readable. The preview iframe has a title.

**Security:** Same-origin `postMessage` only (origin and source checks in the portal; the page ignores preview messages unless it is embedded). Banner text is set with `textContent`. Font and image URLs must be files uploaded to the site's own media storage (`isOwnMediaUrl`). The route needs an admin session and the CSRF header.

**Limits and edge cases:** `DRAGGABLE_IDS` allows only `assistant-launcher`, `site-notice`, `portfolio-title`, `portfolio-intro`, `contact-title`, `contact-intro`. Heading fonts outside the allowed list fall back to Fraunces and body fonts to Manrope. The hero's 3D shard colours do not follow the accent colour (comment above `applyAccentColor()` in `index.html`). Individual text for most other homepage sections (for example the Skills section title) is edited in the Skills board, not in Site text.

**Not found / unclear:** The exact on-screen labels of every Studio control were not read line by line; the field names above come from the server validator.

---

## 24. Every other portal app

**What it is:** The portal apps not described in features 15, 17, 18 and 23: Overview, Products, Orders, Reports, Coupons, Downloads, Tips, Social, Licenses & Legal and Settings. Messages (feature 15), KA Assistant (17), Visitors (18), Studio, Content and License card (23) are described in their own features.

**Where it runs:** Each app screen runs in the browser (React, lazy loaded). Each calls routes in `server/admin/*.js`.

**Files:**
| App | Screen file | Server file |
|---|---|---|
| Overview | `client/portal/src/apps/Overview.tsx` | `server/admin/sales.js` → `overview()` |
| Products | `client/portal/src/apps/Products.tsx` | `server/admin/catalog.js` |
| Orders | `client/portal/src/apps/Orders.tsx` | `sales.js` (`listOrders`, `getOrder`, `refund`, …), `server/store/orders.js` → `refundOrder()` |
| Reports | `client/portal/src/apps/Reports.tsx` | `sales.js` → `reportData()`, `reports()`, `reportsCsv()` |
| Coupons | `client/portal/src/apps/Coupons.tsx` | `sales.js` (`couponInput`, `saveCoupon`, …), `server/store/coupons.js` |
| Downloads | `client/portal/src/apps/Downloads.tsx` | `sales.js` → `downloads()`, `revokeLink()` |
| Tips | `client/portal/src/apps/Tips.tsx` | `server/admin/content.js` (`listTips`, `saveTip`, `deleteTip`, `previewMarkdown`) |
| Social | `client/portal/src/apps/Social.tsx` | `server/admin/social.js`, `server/store/social.js`, `shared/social.js` |
| Licenses & Legal | `client/portal/src/apps/Legal.tsx` | `catalog.js` (licenses), `content.js` (`listLegal`, `saveLegal`) |
| Settings | `client/portal/src/apps/Settings.tsx` | `content.js` (`getSettings`, `saveSettings`), `system.js`, `auth.js`, `team.js`, `catalog.js` (categories) |

**Tools and libraries:** React 18.3.1. Social uses no network library; it posts to the owner's own webhook with `fetch`.

**Browser features used:** `fetch`, `AbortController`, `Blob` and `URL.createObjectURL` for CSV and invoice downloads (`downloadFile()` in `api.ts`), `XMLHttpRequest` for upload progress (`sendBlob()`), `window.print` through the invoice page ("Save as PDF").

**Server APIs called:** Every `/api/admin/…` route in the table of feature D (Table D at the end) except those named in the other features.

**Key functions by app:**
| App | What it does | Rules from the code |
|---|---|---|
| Overview | `overview()`: revenue per currency (never summed across currencies), counts of paid, free, failed, mismatch and started orders, conversion (paid ÷ started, one decimal), top 8 products, daily series, visitor sessions, live visitors, last 15 activity lines. Polls every 30 s | Default range is the last 30 days in `Asia/Kolkata` (`range()`); a range over about 800 days is refused |
| Products | List, create, edit, duplicate, delete or archive, restore, reorder, history and restore of a published version, media (add, update, delete), the downloadable file (`setFile`, `fileLink`), ratings moderation, categories, licenses | `updateProduct()` checks: title required; the sale must end after it starts; a sale price must be at least 100 (₹1 or $1) and below the normal price; a published item for sale needs both INR and USD prices at least 100 (or be free); the category must be of the same kind; an Artzz item needs one image before publishing; a sellable item needs a current file; `max_downloads` 1–100; `link_ttl_hours` 1–168; a stale `updatedAt` gives 409. `deleteProduct()` archives instead of deleting when the item was ever sold |
| Orders | List with filters, one order with items, events, downloads and links, resend links (`resendOrder`), resend receipt, refund, printable invoice, revoke a link, CSV | `refund()` calls `refundOrder()`; `confirmAfterDownload` is required to refund after a download; `resendOrder()` works only for `paid` or `delivered` orders and moves `paid` to `delivered` after a successful email |
| Reports | Revenue by day, week or month, by product, currency, country, coupon, refunds, downloads; CSV | CSV cells starting with `= + - @` are prefixed with `'` (`csvCell()`) so a spreadsheet never runs them as formulas |
| Coupons | Create, edit, pause, delete, usage list | Code 3–32 of `A–Z 0–9 _ -`; `kind` percent (basis points 1–10000) or fixed (INR and/or USD); currencies; `appliesTo` `all/products/category/artzz/artifacts`; start and end; total uses; uses per email; first order only; minimum order; maximum discount; `stackable`; `paused`. A used code can only be paused, not deleted |
| Downloads | Last up to 500 download events and links (state `active`, `expired`, `used up`, `revoked`) | |
| Tips | Articles in Markdown with cover, category, tags, `draft` or `published` | Title max 160; body max 100000; cover must be an uploaded image; a stale `updatedAt` gives 409 |
| Social | Posts for `instagram`, `x`, `facebook`, `linkedin`, `threads`, `pinterest` with per-network limits, hashtag sets, media, schedule, send through a webhook, "mark as posted" by hand | Limits in `shared/social.js` (`PLATFORMS`): Instagram 2200 characters, 30 tags, 10 images, needs an image; X 280; Facebook 63206; LinkedIn 3000; Threads 500; Pinterest 500, 20 tags, 1 image, needs an image. The webhook address must be `https://` with a real host name (no IP, no `.local`); plain `http` only for `localhost` in development; it is stored encrypted with `ADMIN_ENCRYPTION_KEY` |
| Licenses & Legal | Edit license texts used on products; edit the four public policies | Policy pages: `terms`, `privacy`, `refunds`, `delivery`; publishing an empty page is refused |
| Settings | Tabs: Account and security, Team, Store and tax, Messages, Reports, Categories, System status, Backups, Activity log, Appearance | `saveSettings()` accepts only keys `store`, `upscaler`, `messages`, `assistant`, `reports`, `visitors`; numbers are limited (`taxRateBp` 0–5000, `orderExpiryMinutes` 10–120, `dailyBudgetMicros` 0–50,000,000, `retentionDays` 0–3650); a stale revision gives 409 |

**How it works, step by step (example: Social, send a post):**
1. The owner writes a post. `savePost()` validates it (`validatePost()`).
2. "Send" calls `sendPost(id)`. It needs a connected webhook, otherwise answers 400 `not_connected`. Any `checkPost()` error stops it.
3. It claims the post with one statement that changes the status to `sending` only from `draft`, `scheduled` or `failed`. A second click gets 409 `locked`.
4. It posts `{event:'post.send', id, title, platforms, text per network, caption, hashtags, media[{url,alt}], scheduledAt, site, sentAt}` to the webhook with a 12 second limit and `redirect: 'error'`. The tool behind the webhook (the owner's own automation tool) does the real posting; no social network password is stored here.
5. Status becomes `posted` (webhook answered 2xx) or `failed`, with a note per network.
6. Scheduled posts: every 15 minutes (Cloudflare) or every minute (Node host) `runDue()` sends up to 10 due posts; posts stuck in `sending` for 15 minutes are marked failed. With no webhook connected, due posts wait for the owner.

**Data saved:** Tables `products`, `product_media`, `product_files`, `product_revisions`, `categories`, `licenses`, `orders`, `order_items`, `order_events`, `coupons`, `coupon_redemptions`, `download_tokens`, `download_events`, `tips`, `legal_pages`, `social_posts`, `social_hashtag_sets`, `settings`, `audit_log`, `backups`.

**Controlled from the portal?** These are the portal.

**Speed and smoothness:** Each app is a lazy file. Lists poll only while their window is in front. Reports and overview run their queries in parallel (`Promise.all`).

**Screen sizes and accessibility:** Windows become full screen on narrow screens (feature 22). Tables support arrow keys and Enter.

**Security:** Every route needs an admin session and, for writes, the CSRF header. All money is integer minor units. Every write is recorded in `audit_log` (examples: `product_saved`, `order_refund_requested`, `coupon_saved`, `social_post_sent`, `settings_saved`).

**Limits and edge cases:** Money in INR and USD is shown separately. Dates are grouped in India time. A refund is requested through `refundOrder()`; the final state is set by the payment provider's webhook (feature 11).

**Not found / unclear:** Exact screen layouts and button labels of each app were not read line by line.

---

## 25. File uploads and storage

**What it is:** How images, fonts, product files and backups are stored, and how the portal uploads files without sending them through the API.

**Where it runs:** Both. The portal uploads straight to storage with a short-lived signed address. The Worker stores the file in Cloudflare R2.

**Files:**
| File | Role |
|---|---|
| `server/admin/catalog.js` | `signUpload()`, `isOwnMediaUrl()`, size constants `MAX_FILE`, `SINGLE_UPLOAD`, `PART_SIZE` |
| `server/core/storage.js` | `BUCKETS`, `getStorage()`, `r2Storage()`, `localStorage()` |
| `server/platform/cloudflare.js` | `storageRequest()`: `/__storage/…` (read) and `/__storage-upload/…` (write) |
| `client/portal/src/api.ts` | `upload()`, `sendBlob()`, `uploadInParts()` |
| `scripts/upload-files-to-r2.mjs` | Script to upload files to R2 by hand |

**Tools and libraries:** Cloudflare R2 (binding `FILES`, bucket `ka-files`, `wrangler.jsonc`). No upload library.

**Browser features used:** `XMLHttpRequest` with `upload.onprogress`, `File.slice()`, `fetch`, `AbortController`-free retry loop.

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| POST | `/api/admin/uploads` | `catalog.js` → `signUpload()` | `{bucket, path, uploadUrl, method, contentType, publicUrl, chunked, partSize}` |
| PUT | `/__storage-upload/<bucket>/<path>?exp&sig` | `cloudflare.js` → `storageRequest()` | `{ok:true}` |
| POST/PUT/POST/DELETE | same path with `mpu=start`, `uploadId`+`part`, `mpu=complete`, `uploadId` | `storageRequest()` | `{uploadId}`, `{part, etag}`, `{ok:true}` |
| GET | `/__storage/<bucket>/<path>` | `storageRequest()` | The file (public bucket) or the file with a valid signed link (private buckets) |

**Buckets (`BUCKETS` in `storage.js`):** `media` (public), `deliverables` (private), `backups` (private).

**Key functions:**
| Function | File | What it does |
|---|---|---|
| `upload(file, kind, onProgress)` | `client/portal/src/api.ts` | Asks for a signed address, then uploads in one request or in parts |
| `signUpload(ctx)` | `server/admin/catalog.js` | Checks type and size, picks the bucket and a random path, signs the address |
| `storageRequest()` | `server/platform/cloudflare.js` | Verifies the signature and reads or writes R2, including multipart uploads |
| `isOwnMediaUrl(u)` | `server/admin/catalog.js` | True only for the site's own media addresses |

**How it works, step by step:**
1. The portal calls `upload(file, kind, onProgress)` with `kind` `image`, `font` or `deliverable`.
2. `signUpload()` checks the type. Images: PNG, JPEG, WebP, AVIF, GIF. Fonts: WOFF2, WOFF, TTF, OTF, at most 50 MB. `deliverable` (product file) has no type check. The file gets a random name (`images/<random>.<ext>`, `fonts/<random>.<ext>`, `files/<random>/<name>`), so a name cannot be guessed.
3. The upload address is signed. It is valid for 10 minutes (24 hours for a file larger than 90 MB).
4. Up to 90 MB: one `PUT` request. Larger: chunked. The browser starts a multipart upload, sends parts of 50 MB, 3 at a time, retries each part up to 3 times (waits 1.5 s × attempt), then completes it. If anything fails the browser cancels the upload so half a file is not left behind.
5. The Worker checks the signature (`storage.verify('upload', …)`), then writes to R2. A single request is limited to 95 MB (`MAX_UPLOAD`, Worker limit on the free plan). Part numbers must be 1–10000.
6. Public files are served with `Cache-Control: public, max-age=31536000, immutable` and cached at the edge. Private files need a signed, short-lived link, are sent with `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` and `Content-Disposition: attachment`. Range requests work, so big downloads can resume.
7. `isOwnMediaUrl(u)` accepts only `/images/<name>.(webp|avif|png|jpg|jpeg)` or an address inside the public media bucket, with no `..`. The site document, tips and passes use it to refuse outside image links.
8. When a product is deleted, its files are removed from `deliverables` (`deleteProduct()`).
9. Local development and Docker use `localStorage(dataDir)` (a folder under `KA_DATA_DIR`) instead of R2 (`kind: 'local'`).

**Data saved:** Files in R2 buckets; rows in `product_files` (path, current flag), `backups`.

**Controlled from the portal?** Yes: every image, font and product file is uploaded there. Storage fullness shows in Settings → System status and in the warning popup (feature 22).

**Speed and smoothness:** The file does not pass through the API. Parts upload in parallel. Public files are cached for a year at the edge.

**Screen sizes and accessibility:** Upload progress is shown by the portal screens.

**Security:** Signed, expiring addresses; type checks for images and fonts; path check `^[A-Za-z0-9._/-]{1,300}$` without `..`; only the three known buckets; private files never public; random names.

**Limits and edge cases:** `MAX_FILE` is 5 TiB (R2's own limit). Free R2 storage is 10 GB (`LIMITS.files` in `server/admin/usage.js`).

**Not found / unclear:** Virus scanning of uploads is NOT FOUND IN CODE.

---

## 26. Security

**What it is:** The checks that protect visitors, buyers, the owner's portal and the money flow. This section collects them in one place. Each one is explained in its own feature; the table below says where.

**Where it runs:** Mostly the server. Some checks are in the browser (response headers, `postMessage` origin checks).

**Files:** `server/core/router.js`, `server/core/http.js`, `server/core/guard.js`, `server/core/atomic.js`, `server/core/crypto.js`, `server/core/blocklist.js`, `server/core/env-validate.js`, `server/core/validate.js`, `server/core/markdown.js`, `server/admin/auth.js`, `server/store/razorpay.js`, `server/store/orders.js`, `server/store/delivery.js`, `client/public/_headers`, `pages/_worker.js`.

**Tools and libraries:** `node:crypto` (HMAC-SHA256, SHA-256, scrypt, AES-256-GCM, `timingSafeEqual`), Cloudflare Turnstile (outside service), Cloudflare WAF and network (not configured in the repository; NOT FOUND IN CODE).

**Browser features used:** `Secure`, `HttpOnly`, `SameSite=Strict` cookie flags, `sec-fetch-site` and `Origin` headers (read by the server), `postMessage` origin checks, response headers (see below).

**Server APIs called:** Applies to every route in Table D.

**Key functions (protections):**
| Protection | Where in code | What it does |
|---|---|---|
| Access levels | `router.js` → `dispatch()` | `public` (browser writes must be same-origin), `admin` (session + same-origin + CSRF on writes), `cron` (header `Authorization: Bearer $CRON_SECRET`, compared with `safeEqual`), `webhook` (no origin check; the handler checks the provider's signature) |
| Same-origin check | `http.js` → `assertSameOrigin()` | Refuses a request when `Sec-Fetch-Site` is not `same-origin` or `none`, or when `Origin` is not this site |
| Rate limits | `guard.js` → `rateLimit()`, `atomic.js` → `rateLimitHit()` | One database row per key and window; examples: contact 5 per 15 min, notify 5 per hour, assistant 8 per 10 min, visit 300 per 10 min, admin login 10 per 15 min, admin setup 5 per 15 min, download page 60 per 10 min, rating 20 per hour |
| Bot check | `guard.js` → `verifyTurnstile()` | Server-side check of the Turnstile token with Cloudflare; in production it fails closed if the secret is missing |
| Honeypot | `public.js` → `contact()`, `notify()` | A hidden field `website`; if filled, the answer is a fake success and nothing is stored |
| Passwords | `crypto.js` → `hashPassword()` | scrypt (N 32768, r 8, p 1) with a random salt |
| Sessions and CSRF | `auth.js` | Feature 21 |
| 2FA | `auth.js`, `crypto.js` → `verifyTotp()` | Feature 21 |
| Secrets at rest | `crypto.js` → `encrypt()` | AES-256-GCM with `ADMIN_ENCRYPTION_KEY` for the 2FA seed and the social webhook address |
| Startup check | `env-validate.js` → `validateEnv()` | In production, startup is blocked if `DOWNLOAD_TOKEN_SECRET` or `ADMIN_ENCRYPTION_KEY` is missing or still the development default |
| Payment proof | `orders.js`, `razorpay.js` | HMAC-SHA256 signature plus an API check; see feature 11 |
| Signed links | `delivery.js`, `storage.js` | Download tokens and storage links expire (60 seconds for the storage link) |
| Input checks | `validate.js` (`str`, `int`, `bool`, `uuid`, `email`, `slug`, `url`) | Maximum lengths, types and formats before anything is stored; request body size limits in `readJson(request, maxBytes)` |
| Output escaping | `email.js` → `escapeHtml()`, `markdown.js`, `delivery.js` → `page()`, `license.js` | Text is HTML-escaped before it is shown; Markdown is escaped first |
| Spam filter | `blocklist.js` → `isBlocked()` | Feature 15 |
| Assistant safety | `engine.js` | Feature 17 |
| Content Security Policy | `delivery.js` (download page), `license.js`, `sales.js` (invoice) | These server-written pages send `Content-Security-Policy` with `default-src 'none'` and only what each page needs |
| Response headers | `client/public/_headers` | For all pages: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy` (camera, microphone, USB and interest-cohort off; geolocation self; payment only for self and Razorpay), `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Portal: `X-Frame-Options: DENY`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Cache-Control: no-store` |
| Log hygiene | `router.js` → `redact()` | Errors are logged by route and type only: no bodies, tokens, emails or payment data |
| CSV safety | `sales.js` → `csvCell()` | Leading `= + - @` is neutralised |
| Audit log | `auth.js` → `audit()` | Who did what, with IP, in `audit_log` |

**How it works, step by step (one request):** see "Request flow" in Step 3 (question 8) of this guide.

**Data saved:** `rate_limits`, `audit_log`, `webhook_events` (processed payment events), `email_log`.

**Controlled from the portal?** The audit log is shown in Settings → Activity log. The blocklist and spam filter are in Messages and Settings → Messages. System status lists which secrets are set (names only, never values; `status()` in `system.js`).

**Speed and smoothness:** Rate limits and checks are single database statements.

**Screen sizes and accessibility:** Not applicable.

**Security:** (this feature).

**Limits and edge cases:** The page `index.html` itself has no `Content-Security-Policy` header: no code in `_headers` or `pages/_worker.js` sets one for it (NOT FOUND IN CODE). Free-tier Worker limits apply (feature 25). The IP in rate limits comes from `cf-connecting-ip` on Cloudflare.

**Not found / unclear:** Cloudflare dashboard settings (WAF rules, bot fight mode, DNS) are outside the repository.

---

## 27. Scheduled jobs and backups

**What it is:** Work that runs by itself on a timer: daily housekeeping, the weekly backup, scheduled social posts, and report emails.

**Where it runs:** Server. On Cloudflare these are Cron Triggers. In Docker or local Node they are timers.

**Files:**
| File | Role |
|---|---|
| `wrangler.jsonc` | `triggers.crons`: `0 1 * * *`, `0 2 * * 1`, `*/15 * * * *` |
| `server/platform/cloudflare.js` | `scheduled(event, env, ctx)` picks the job by the cron text |
| `server/platform/node-dev.js` | A timer every 60 seconds runs the same jobs for Docker or local use |
| `server/handlers/cron.js` | `daily()`, `weekly()`, `social()` |
| `server/jobs/hooks.js` | `onDaily()`, `onWeekly()`, `jobHooks` |
| `server/jobs/backup.js` | `runBackup()`, `KEEP = 8` |
| `server/admin/system.js` | Backups list, backup now, delete, signed download link |

**Tools and libraries:** `node:zlib` `gzipSync` for the backup file.

**Browser features used:** none (Settings → Backups uses `fetch` and a download link).

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| GET | `/api/cron/daily` | `cron.js` → `daily()` | `{ok, results}` (needs the cron bearer secret) |
| GET | `/api/cron/weekly` | `weekly()` | `{ok, results}` |
| GET | `/api/cron/social` | `social()` | `{ok, results:{sent,failed,unstuck,waiting}}` |
| GET/POST/DELETE | `/api/admin/backups`, `/backups/:id`, `/backups/:id/link` | `system.js` | Backup list, run now, delete, 60-second download link |

**The jobs:**
| When | Name | File → what it does |
|---|---|---|
| Daily 01:00 UTC | heartbeat | `cron.js` → `daily()`: runs `select 1`, stores `lastHeartbeat` in the `system` setting |
| Daily | `expireOrders` | `server/handlers/checkout.js` → `orders.expireOrders()`: orders in `created` or `failed` status past `expires_at` with no capture become `expired` and their coupon reservations are released; orders that were captured but never finished get another delivery attempt (`tryFinalize`); returns `{expired, retried}` |
| Daily | `dailyReport` | `sales.js` → `sendScheduledReport('Daily')`: emails the report when `reports.daily` is on |
| Daily | `usageAlert` | `usage.js`: emails the owner once per month per level when storage or the database passes 80% (and again at 95%) |
| Daily | `visitRetention` | `track.js`: deletes old visits and location cache; clears browser-consented coordinates older than 7 days |
| Daily | `assistantLogRetention` | `server/admin/assistant.js`: deletes assistant conversations older than 90 days and expired learned answers |
| Monday 02:00 UTC | backup | `cron.js` → `weekly()`: `runBackup()`, stores `lastBackup` |
| Monday | `weeklyReport` | `sales.js` → `sendScheduledReport('Weekly')`: when `reports.weekly` is on (default on) |
| Every 15 minutes (Node host: every minute) | social | `server/handlers/cron.js` → `social()` → `server/store/social.js` → `runDue()` |

**Key functions:** `daily()`, `weekly()`, `social()` (`server/handlers/cron.js`); `runBackup()` (`server/jobs/backup.js`); `onDaily()`, `onWeekly()` (`server/jobs/hooks.js`); `scheduled()` (`server/platform/cloudflare.js`); `runDue()` (`server/store/social.js`); `sendScheduledReport()` (`server/admin/sales.js`); `expireOrders()` (`server/store/orders.js`).

**How it works, step by step (backup):**
1. `runBackup()` lists the real tables from `sqlite_master`, skipping SQLite and Cloudflare internals, the search tables (`%_fts%`) and these: `admin_sessions`, `rate_limits`, `d1_migrations`, `_cf_KV`, `invoice_counter_placeholder`.
2. It reads each table in pages of 5000 rows. For `admin_users` the password hash and 2FA secret are replaced with `[omitted]`.
3. It writes one gzip JSON file `db/<timestamp>.json.gz` to the private `backups` bucket and adds a row to `backups` (`ok` or `failed` with the error).
4. It keeps the newest 8 (`KEEP`) and deletes older files and rows.
5. In the portal the owner can run a backup, download one (60-second signed link, audited) or delete one.

**Data saved:** `backups` table, files in the `backups` bucket, `settings` key `system` (`lastHeartbeat`, `lastBackup`), `settings` key `usage`.

**Controlled from the portal?** Partly. Settings → Backups (run, download, delete); Settings → Reports (daily and weekly on/off, recipient). Cron times are in `wrangler.jsonc`.

**Speed and smoothness:** Each job is written to be safe to run twice (comment at the top of `cron.js`). A failed hook does not stop the others (`try/catch` per hook).

**Screen sizes and accessibility:** Not applicable.

**Security:** The cron routes need `Authorization: Bearer $CRON_SECRET`; Cloudflare's own scheduler calls `scheduled()` directly and does not use HTTP. Backups exclude sessions and password hashes.

**Limits and edge cases:** Backups are kept in the same R2 storage as the files, counting toward the 10 GB free limit; the portal says to download copies and keep them elsewhere (comment in `backup.js`). The weekly backup runs only on Mondays.

**Not found / unclear:** A restore function is NOT FOUND IN CODE (only export and download exist).

---

## 28. Legal pages, coupons, notify-me and email templates

**What it is:** Four small features owned by the owner: public policy pages, discount codes, the "notify me" list for the Image Upscaler, and editable email wording.

**Where it runs:** Server (pages and rules); the portal edits them; the homepage form sends the notify-me address.

**Files:**
| File | Role |
|---|---|
| `server/handlers/legal.js` | `legalIndex()`, `legalPage()`: public `/legal` and `/legal/<slug>` |
| `server/content/legal-drafts.js` | `LEGAL_DRAFTS`, `LEGAL_TITLES`, `hasBlanks()` |
| `server/admin/content.js` | `listLegal`, `saveLegal`, `listTemplates`, `saveTemplate`, `resetTemplate`, `testTemplate`, `listNotify`, `deleteSignup`, `launch` |
| `server/store/coupons.js` | `normalizeCodes()`, `evaluateCoupons()`, `MAX_CODES = 3` |
| `server/admin/sales.js` | Coupon admin routes |
| `server/handlers/public.js` | `notify()`, `TOPICS` |
| `server/core/markdown.js` | `renderMarkdown()` |
| `index.html` (Upscaler section, lines ~1836–1930; the form posts to `/api/notify` at line ~1909) | Notify-me form and "coming soon" copy |

**Tools and libraries:** None extra.

**Browser features used:** `fetch`, Turnstile (`window.kaTurnstile`), `kaPublicConfig()` for the upscaler texts.

**Server APIs called:**
| Method | Path | Server file → function | Returns |
|---|---|---|---|
| GET | `/legal`, `/legal/:slug` | `legal.js` | Server-written HTML pages |
| POST | `/api/notify` | `public.js` → `notify()` | `{ok:true}` 201 (the same answer whether or not the address was new) |
| POST | `/api/checkout/quote` | `checkout.js` → `quote()` | Price with coupon result (feature 11) |
| GET/PUT | `/api/admin/legal`, `/legal/:slug` | `listLegal()`, `saveLegal()` | Pages |
| GET/PUT/DELETE/POST | `/api/admin/email-templates`, `/:key`, `/:key/test` | `content.js` | Templates |
| GET/DELETE/POST | `/api/admin/notify`, `/notify/:id`, `/notify/:topic/launch` | `listNotify`, `deleteSignup`, `launch` | Signups and the launch send |
| GET/POST/PUT/DELETE | `/api/admin/coupons`, `/:id`, `/:id/pause`, `/:id/uses` | `sales.js` | Coupons |

**Key functions and rules:**
| Function | What it does |
|---|---|
| `legalPage(ctx)` | Slugs `terms`, `privacy`, `refunds`, `delivery`. Shows only published text; an unpublished page says it is being updated; Markdown is escaped first |
| `LEGAL_DRAFTS` / `hasBlanks()` | Starter text with placeholders like `[NAME]`; `hasBlanks` flags text that still has them (the portal shows a warning) |
| `evaluateCoupons(coupons, ctx)` | Pure function. Rejects with a clear message when: the item is free; more than one code and stacking is off or a code is not stackable; the code is paused, not started, expired, wrong currency, not for this item (`all`, `products`, `category`, `artzz`, `artifacts`), under the minimum order, fully used, or over its per-email limit or first-order limit. Percent discounts are rounded down (`Math.floor(remaining × percent_bp ÷ 10000)`); the discount is capped by `max_discount_*` and by what remains |
| `normalizeCodes(codes)` | At most 3 codes, trimmed, upper case, `[A-Z0-9_-]{3,32}`, no duplicates |
| `notify(ctx)` | Rate limit 5 per IP per hour; honeypot; only topic `upscaler`; Turnstile; if `upscaler.notifyEnabled` is false answers 409 "This list is closed."; inserts into `notify_signups` with `on conflict do nothing`; sends `notify_confirm` only for a new address |
| `launch(ctx)` | Emails up to 200 people not yet notified: it first marks each row `notified_at`, sends `launch`, and undoes the mark for a failed send; returns `{sent, failed, remaining}` |
| `loadTemplate(key)` / `saveTemplate` / `resetTemplate` | A saved template (table `email_templates`) overrides `DEFAULT_TEMPLATES`; reset deletes the saved row |

**How it works, step by step (coupon at checkout):**
1. The buyer types a code in checkout. The page calls `/api/checkout/quote` with the codes.
2. The server loads the codes and calls `evaluateCoupons()` with the product, currency, subtotal, email, current time and earlier use counts.
3. If every rule passes, the quote shows each discount. Creating the order reserves each use: a `coupon_redemptions` row (`reserved`) and `used_count + 1`, in the same all-or-nothing batch as the order. If the code ran out between quote and order, the whole batch fails.
4. A confirmed payment turns reservations into `confirmed`; an expired, cancelled, failed or mismatched order releases them (`releaseCoupons()` in `orders.js`).

**Data saved:** `legal_pages`, `coupons`, `coupon_redemptions`, `notify_signups`, `email_templates`.

**Controlled from the portal?** Yes: Licenses & Legal (policies), Coupons, Content → Upscaler & list (notify list, launch email, upscaler texts) and Content → Emails (templates with test send); Settings → Store & tax (`allowCouponStacking`).

**Speed and smoothness:** Legal pages are plain server-written HTML with no site script, so they load without the homepage's JavaScript.

**Screen sizes and accessibility:** Legal pages use `max-width: 760px`, `viewport-fit=cover` with safe-area padding, a skip-friendly structure and visible focus outlines.

**Security:** Escaped output; rate limit, honeypot and Turnstile on notify-me; a same answer for known and unknown addresses so the form cannot reveal who signed up; template test emails go only to the signed-in admin.

**Limits and edge cases:** Notify launch sends at most 200 emails per press (press again for the rest). A used coupon cannot be deleted. A legal page that is published but empty is refused.

**Not found / unclear:** none.

---

## 29. Deployment and hosting

**What it is:** How the site is built and where each part runs.

**Where it runs:** Cloudflare: a Pages project `kethan` (the public address https://kethan.pages.dev), a Worker `kethan-artzz` (the API), a D1 database `ka-db`, an R2 bucket `ka-files`. Docker or Node is the self-hosting alternative.

**Files:**
| File | Role |
|---|---|
| `package.json` | Scripts `build`, `build:cf`, `cf:deploy`, `cf:migrate`, `cf:deploy-pages`, `docker:build`, `docker:up`, `start`, `test` |
| `vite.config.mjs` | Build: entries `portal`, `gallery`, `poster`, `panda`, `studio`, `store`, `skill-logos`; copies `index.html` to `dist/index.html` and `images/` to `dist/images`; emits `three-r128.min.js` |
| `scripts/stage-pages.mjs` | Builds the folder `out/`: `dist/` plus `pages/_worker.js` and `pages/_routes.json` |
| `scripts/deploy-pages.mjs` | Publishes to the Pages project `kethan` with `wrangler pages deploy` |
| `pages/_worker.js` | Router for the Pages project: sends `/api/`, `/legal`, `/license`, `/__storage/` and `/__storage-upload/` to the Worker through the service binding `SITE`; everything else is a static file |
| `pages/wrangler.jsonc`, `pages/_routes.json` | Pages settings (output `./out`, service binding `SITE` → `kethan-artzz`) |
| `wrangler.jsonc` | Worker settings: entry `server/platform/cloudflare.js`, `nodejs_compat`, D1 `DB`, R2 `FILES`, cron triggers, `vars` (`KA_ENV`, `SITE_NAME`, `PUBLIC_SITE_URL`) |
| `server/platform/cloudflare.js` | Worker entry: `fetch()`, `scheduled()`, `storageRequest()`, `init()` |
| `server/platform/node-dev.js` | Node server for local use and Docker |
| `Dockerfile`, `docker-compose.yml` | Two-step image on `node:22-bookworm-slim`; port 8787; volume `ka-data` at `/data`; health check on `/api/health` |
| `migrations/0001…0005` | Database tables (apply with `npm run cf:migrate` = `wrangler d1 migrations apply ka-db --remote`) |
| `docs/operations/CLOUDFLARE.md`, `docs/operations/DOCKER.md` | Setup steps |

**Tools and libraries:** Vite 6.4.3, TypeScript 5.7.2, Wrangler 4.144.0, `better-sqlite3` 11.10.0 (Node host and tests only), Node 22 or newer (`engines`).

**Browser features used:** none.

**Server APIs called:** `GET /api/health` returns `{ok:true}` (Docker health check).

**Key functions:** `default.fetch()` (`pages/_worker.js`); `default.fetch()`, `scheduled()`, `init()`, `storageRequest()` (`server/platform/cloudflare.js`); `handle()` (`server/handler.js`); `validateEnv()` (`server/core/env-validate.js`).

**How it works, step by step:**
1. `npm run build` runs `generator/scripts/verify_scripts.cjs`, `tsc --noEmit`, `vite build`, the two tests `tests/gallery-build.test.mjs` and `tests/delivery.test.mjs`, `generator/scripts/verify_startup.cjs`, then `scripts/stage-pages.mjs`, which builds `out/` (`package.json` script `build`). Cloudflare's Git build uses build command `npm run build` and output folder `out`.
2. A request to https://kethan.pages.dev reaches the Pages project. `pages/_worker.js` serves static files from the build, or forwards the API paths to the Worker with `env.SITE.fetch(request)` unchanged, so the visitor's IP, location, cookies and same-origin checks behave as on one site.
3. The Worker (`cloudflare.js`) sets the environment, connects D1 (`DB`) and R2 (`FILES`), then runs `handle()` (feature "Request flow").
4. `npm run cf:deploy` builds, applies database migrations to the remote D1, deploys the Worker and publishes Pages.
5. Secrets (keys, passwords) are set in the Cloudflare dashboard or with `wrangler secret put`; they are not in `wrangler.jsonc`.
6. Docker: `docker compose up --build` builds the same bundles and runs `node server/platform/node-dev.js` with a SQLite file and local file storage in `/data`.

**Data saved:** D1 database `ka-db`, R2 bucket `ka-files`.

**Controlled from the portal?** No. Settings → System status shows which services and secrets are configured (names only).

**Speed and smoothness:** Static files are served by Cloudflare's network without running code; only the listed dynamic paths run the Worker (`run_worker_first` in `wrangler.jsonc`).

**Screen sizes and accessibility:** Not applicable.

**Security:** Secrets are not in the repository config; `validateEnv()` blocks a production start with default secrets; the `.data` and `.env` files are local only (see `.gitignore`; not read here).

**Limits and edge cases:** Free-plan limits: R2 10 GB, D1 500 MB (`usage.js`), 95 MB per upload request (`cloudflare.js`). The `index.html` fallback file names in `vite.config.mjs` say "Vercel" in comments; the active host is Cloudflare. The old Worker address `kethan-artzz.<account>.workers.dev` is the backend only.

**Not found / unclear:** The Cloudflare Pages project settings (build command, output folder, connected Git repository) live in the Cloudflare dashboard and are NOT FOUND IN CODE; the values above come from `package.json`, `scripts/stage-pages.mjs` and the project's earlier setup, not from a file that configures the dashboard.

---


# Step 3. Answers to the specific questions

Each answer is short and points to the feature that holds the full detail. Everything below comes from code that was read; "NOT FOUND IN CODE" marks anything that could not be confirmed.

## Q1. Crystal intro: how is it made, and where does the shard data come from?
- It is WebGL drawing with Three.js. The page loads the classic script `public/three-r128.min.js` (copied to `assets/three-r128.min.js` by `vite.config.mjs`). `package.json` also lists `three` 0.185.1, but the hero does not use it (feature 1).
- The pieces come from a picture atlas (`/images/crystal-atlas.webp`, 2600 × 1248) and a cut-out of the logo (`/images/crystal-cutout.webp`, 1410 × 1887). A table named `MANIFEST` in `index.html` lists 179 shards with their atlas rectangle and position. The function `fractureOpeningCore()` adds more pieces at run time, giving 198 shards (feature 1).
- The generator is `generator/build_cinematic.py` (Python, numpy and scipy). It cuts the shards, uses a distance transform to keep pieces inside the logo ("landedWorld" clamp), and writes `generator/ka-cinematic-demo.html` and the manifest JSON (feature 1).
- Each shard is a `ShaderMaterial`. The shards move through the phases `shattered`, `assembling`, `held`, `disassembling`. A radial wipe shader (`pulseFragment`) reveals the logo. Timing constants are in feature 1 (`ASSEMBLE_DELAY`, `ASSEMBLE_SPAN`, `REVEAL_DUR`, `REVEAL_LEAD`, `ENERGIZE_DUR`).
- With reduced motion the hero jumps to its final picture (`settleStatic()`).
- Note: some comments in `index.html` say 169 shards; the manifest has 179. The comments are out of date.

## Q2. What are the background animations?
Four things (feature 2): the nebula (WebGL: stars, simplex-noise nebula, galaxies, drifting shards, about 30 frames per second, with a CSS fallback); a paint trail on a canvas that follows the pointer; 12 floating embers made of DOM elements moved with `translate3d`; and a poster background module (`client/src/poster-background.ts`) that is switched off (its call is commented out near line 1331 of `index.html`).

## Q3. How are text animations and the skills section animated?
- Scroll-driven letter writing, emerge effects, ghost labels, count-up numbers and the footer name effect are in feature 3 (`KaInk`, `revealOnScroll`, `kaGhost`, `renderAboutStats`). They use `IntersectionObserver`, `requestAnimationFrame`, CSS `clip-path`, `filter: blur()` and `Element.animate()`.
- The skills board uses CSS and the Web Animations API (`spawnTile`), `IntersectionObserver`, `position: sticky`, and lazy loading of real logos from `assets/skill-logos.js` (feature 4). The data comes from `skills` in the site document (up to 14 categories, 24 items each; feature 23).

## Q4. What happens when I hover over an image?
Feature 5: portfolio folders and work stacks tilt toward the pointer ("magnetic" stack, spring coverflow with `VISIBLE = 3`), the classic coverflow has a slow zoom (`kenburns`), and the lightbox uses the View Transitions API (`view-transition-name: active-poster`). Hover effects run only when `(hover: hover) and (pointer: fine)`.

## Q5. How does the typography studio work?
Feature 8: a Canvas 2D engine (`client/src/studio/engine.ts`) draws text and strokes; a shadow-root entry (`studio-entry.ts`) holds the controls. It exports PNG with `toBlob` and video with `MediaRecorder` and `canvas.captureStream(30)`.

## Q6. How is the license card built, and how does the name flip work?
Feature 12: CSS 3D (`perspective: 1100px`, `preserve-3d`, `rotateY(180deg)`), no 3D library. Focusing the "Name on the license" field adds `is-flipped`; leaving it flips back. The signature font and text come from `passCard` in the site document (`signatureFont`, `signatureText`, `signatureTone`, `signatureAngle`, `signatureSize`). The seal is a QR code written by `shared/seal.js` (byte mode, error correction M, versions 1 to 15). The code is `KA-` plus 10 Crockford base32 characters (50 random bits, `newLicenseCode()`); `/license/<code>` shows the public check (feature 14).

## Q7. Payment: what are "two proofs" and how is the HMAC checked?
Feature 11. An order becomes `paid` only when the server has (a) a payment proof from the browser path (HMAC-SHA256 of `order_id|payment_id` with `RAZORPAY_KEY_SECRET`, checked by `verifyPaymentSignature()`) or from a direct server-to-server fetch of the payment (`fetchPayment()`, which must say `captured` with matching order, amount and currency), **and** (b) the signed Razorpay webhook (`verifyWebhookSignature()`: HMAC-SHA256 of the raw body with `RAZORPAY_WEBHOOK_SECRET`). Comparisons use the constant-time `safeEqual()`. Processed webhook events are stored in `webhook_events`, so a repeat does nothing. Any mismatch in amount or currency sets the order to `mismatch` and emails the owner (`markMismatch()`).

## Q8. Email: which method is used, is MCP used, and what happens on failure?
Feature 16. The live method is Gmail SMTP (`smtp.gmail.com`, port 465, TLS, login with `GMAIL_USER` and a Google App Password) written by hand in `server/core/smtp.js`. If those are not set, Brevo's HTTPS API is used (`BREVO_API_KEY`). If neither is set in development, messages are written as files to `.data/outbox`; on Cloudflare or in production a missing configuration makes `sendEmail()` log a `failed` row. **MCP is not used anywhere** in `server/`, `client/`, `shared/` or `pages/`. Every send is recorded in `email_log`; the body is never stored. There is no queue and no automatic retry: `sendEmail()` returns `{ok:false}`, and callers either ignore it (so checkout is never broken) or show an error (replies, test emails, resend). The 15 emails and their senders are in the table in feature 16.

## Q9. AI assistant: what is the pipeline?
Feature 17. Order inside `runTurn()`: switched-off check → conversation id → card-number guard → daily budget check → knowledge seed → order lookup (needs order id and matching email) → hand-off to the owner's inbox → learned answer → `retrieve()` (full-text search plus live store data) → prompt (`buildSystem()`) → provider stream with a Gemini model chain or Anthropic → word-by-word output redaction → usage, cost and logs (`finish()`).

## Q10. How does admin login work?
Feature 21: setup code (`ADMIN_SETUP_TOKEN`) for the first owner; scrypt passwords; lockout after 5 failures; optional 6-digit authenticator code (TOTP, one use per code); HttpOnly, Secure, SameSite=Strict cookie `ka_admin`; only the token's SHA-256 stored; 12-hour limit and 2-hour idle limit; CSRF header on every write; roles `owner` and `admin` (only team management is owner-only).

## Q11. Full request flow, function by function
Example: a buyer presses Pay on https://kethan.pages.dev (`POST /api/checkout/order`). The same steps apply to any `/api` call.
1. Browser: `submit()` in `client/src/store/checkout/Checkout.tsx` calls `fetch('/api/checkout/order', …)` (through `postJson()` in `client/src/store/api.ts`).
2. Cloudflare Pages: `default.fetch()` in `pages/_worker.js` sees the path starts with `/api/` and calls `env.SITE.fetch(request)` (service binding to the Worker `kethan-artzz`).
3. Worker: `default.fetch()` in `server/platform/cloudflare.js` → `init(env)` (sets the environment, `setDatabase(d1Driver(env.DB))`, `setStorage(r2Storage(env.FILES, …))`) → `handle(request, platform)` in `server/handler.js`.
4. `handle()` → `router.dispatch()` in `server/core/router.js`: finds the route (`/api/checkout/order`, method POST, access `public`), builds `ctx` with `platform.clientIp()` and `platform.geo()`.
5. Access check: for `public` writes `assertSameOrigin()` in `server/core/http.js` (admin routes would run `requireAdmin()` here; cron routes `assertCron()`; the webhook route skips the origin check).
6. Handler: `createOrder()` in `server/handlers/checkout.js` → `rateLimit()` (`guard.js` → `rateLimitHit()` in `atomic.js`) → `cleanHolder()` → `verifyTurnstile()` (`guard.js`) → `orders.createOrder()` in `server/store/orders.js`.
7. `orders.createOrder()` → `quote()` (`priceFor()` in `pricing.js`, `evaluateCoupons()` in `coupons.js`, `computeTax()`) → `getDb()` → `db.batch([...])` (order, items, coupon holds, event, all or nothing) → `razorpay.createOrder()` in `server/store/razorpay.js` (calls Razorpay's REST API).
8. Response: `json()` in `http.js` builds the JSON with security headers (`X-Content-Type-Options: nosniff`).
9. Back in `dispatch()`: for admin writes `afterAdminWrite` → `bumpLiveVersion()` (not for this public route); for public GET answers marked `no-cache`, `withEtag()` adds an ETag and may return 304.
10. If any step throws, `errorResponse()` builds the error and `logError()` writes a redacted line (`redact()`).
11. The Pages Function returns the Worker's response to the browser. Razorpay's own window then takes over; later `verifyCheckout()` and `handleWebhook()` finish the order (feature 11).

## Q12. How do live updates work?
Feature 19: `/api/live` returns one number that moves after every successful portal write; open pages check it every 15 seconds (and on focus, on return to the tab, when the network returns, and when a portal tab in the same browser says so) and re-apply the site document.

## Q13. What can I control from the portal (fonts, colours, text, layout, animation, images)?
Feature 23 has the full table: fonts, custom fonts, text size, glass blur, accent colour, favicon, site text, per-element font, colour and entrance animation, drag-and-drop positions per breakpoint, banner, navigation visibility, social links, logo, folders and images, covers, About numbers, Skills board, and the license card design. Product, coupon, policy and email wording are in features 24 and 28. The shapes of the saved data are in `server/admin/site-document.js`.

## Q14. What does visitor analytics collect?
Feature 18: visit id (`ka_vid`), session id (`ka_sid`), page path, referrer (own site removed), screen size, language, time zone, time on page, raw IP, country, region, city, postal code, latitude and longitude (from Cloudflare or a lookup service), ISP, browser, OS, device, and whether it looks like a bot. A visitor's own location (only after they allow it, only if accurate to 1000 m or better) is rounded to about 100 m and deleted after 7 days. Old visits are deleted after `visitors.retentionDays` (default 365 days).

## Q15. What are the screen-size breakpoints?
Feature 7 lists them from the real style rules in `index.html` (`media_index`): widths 420, 520, 600, 640, 700, 760, 900, 1366, 1500, 1900, 2500 and 3400 px; height conditions 500, 520, 540 and 560 px; `(hover: hover) and (pointer: fine)`, `(hover: none)`, `(pointer: coarse)`, `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast`, `forced-colors`, and orientation for tablets. The portal uses `max-width: 760px` and `max-height: 520px` with a touch screen for its compact layout (feature 22). The store uses 359, 420, 520, 600, 767, 768 and 1024 px steps plus the 1900, 2500 and 3400 px large-screen steps (features 10 and 11).

---

# Step 4. Summary tables

## Table A. Feature → frontend tools → backend functions → APIs → database tables

| # | Feature | Frontend tools | Backend functions (file) | APIs | Tables |
|---|---|---|---|---|---|
| 1 | Crystal shards KA intro | Three.js r128 (classic script), WebGL, Canvas 2D | none (`generator/build_cinematic.py` runs at build time only) | none | none |
| 2 | Background animations | WebGL (Three.js r128), Canvas 2D, DOM | none | none | none |
| 3 | Text animations | `IntersectionObserver`, Web Animations API, CSS | none | `GET /api/portfolio` (texts, `elementStyles`) | `settings` |
| 4 | Skills section | Web Animations API, dynamic import of `skill-logos.js` | `validateSkills()` (`site-document.js`) | `GET /api/portfolio` | `settings` |
| 5 | Image hover effects | React 18.3.1, pointer events, View Transitions, `<picture>` | `portfolio()`, `loadSiteDocument()` (`public.js`) | `GET /api/portfolio` | `settings` |
| 6 | Page navigation | History API, touch and pointer events | none | none | none |
| 7 | Screen compatibility | CSS media and container queries, `matchMedia` | none | none | none |
| 8 | Typography studio | Canvas 2D, `MediaRecorder`, Shadow DOM | none | none | none |
| 9 | Panda mascot | Three.js 0.185.1 (module), WebGL | none | none | none |
| 10 | Store browsing | React 18.3.1, Shadow DOM, `Intl` | `catalog()`, `product()`, `reviews()`, `productDto()` (`store-public.js`), `priceFor()` (`pricing.js`), `publicConfig()` | `GET /api/store/catalog`, `/api/store/products/:slug`, `/api/store/products/:slug/reviews`, `/api/public-config` | `products`, `product_media`, `categories`, `licenses`, `product_ratings` |
| 11 | Checkout and Razorpay | React, Razorpay Checkout script, Turnstile | `quote()`, `createOrder()`, `verifyCheckout()`, `handleWebhook()`, `tryFinalize()` (`orders.js`); `verifyPaymentSignature()`, `verifyWebhookSignature()` (`razorpay.js`); `evaluateCoupons()` | `POST /api/checkout/quote|order|verify|status|cancel|demo-pay`, `POST /api/webhooks/razorpay` | `orders`, `order_items`, `order_events`, `coupons`, `coupon_redemptions`, `webhook_events`, `invoice_counter` |
| 12 | License / pass card | React, CSS 3D, `shared/seal.js` | `newLicenseCode()`, `ensureLicenseCode()`, `licenseFor()`, `cleanHolder()` (`license.js`) | checkout APIs, `GET /api/portfolio` | `orders` (`license_code`, `license_holder`), `settings` |
| 13 | Delivery, downloads, ratings, refunds | Plain HTML download page | `sendDeliveryEmails()`, `issueToken()`, `redeem()`, `rate()`, `downloadPage()`, `resendLinks()` (`delivery.js`); `refundOrder()` | `GET/POST /api/download/:token`, `POST /api/download/:token/rate`, `POST /api/downloads/resend` | `download_tokens`, `download_events`, `product_ratings`, `orders` |
| 14 | License check page | Plain HTML | `licensePage()`, `licenseIndex()` (`license.js` handler) | `GET /license`, `/license/:code` | `orders` |
| 15 | Contact and Messages | JavaScript form, Turnstile, React portal | `contact()`, `autoReplyFor()`, `isBlocked()`; `listMessages()`, `getMessage()`, `reply()`, `bulkMessages()` | `POST /api/contact`, `/api/admin/messages…`, `/api/admin/canned…`, `/api/admin/blocklist…` | `messages`, `message_replies`, `canned_replies`, `blocklist`, `email_log` |
| 16 | Email sending | none | `sendEmail()`, `getTransport()`, `smtpSend()`, `buildMime()`, `loadTemplate()` | Gmail SMTP, Brevo API (outside) | `email_log`, `email_templates` |
| 17 | AI assistant | Plain JavaScript widget, SSE reader | `runTurn()`, `retrieve()`, `stream()`, `findLearnedAnswer()` | `POST /api/assistant`, `/api/admin/assistant…`, Gemini and Anthropic APIs | `assistant_*`, `kb_sources`, `kb_chunks`, `messages` |
| 18 | Visitor analytics | `sendBeacon`, `fetch`, Geolocation API | `visit()`, `locate()`, `parseUA()`; `summary()`, `live()`, `log()` | `POST /api/visit`, `/api/admin/visitors…` | `visits`, `ip_geo_cache`, `geo_quota` |
| 19 | Live updates | `fetch`, `BroadcastChannel` | `liveVersion()`, `bumpLiveVersion()` | `GET /api/live`, `GET /api/portfolio` | `settings` (key `live`) |
| 20 | Performance | preload, lazy bundles, `IntersectionObserver` | `withEtag()` | all public GETs | none |
| 21 | Admin login, 2FA, team | React | `login()`, `requireAdmin()`, `startSession()`, `verifyTotp()`, `hashPassword()`; team functions | `/api/admin/setup`, `login`, `session`, `2fa/*`, `team/*`… | `admin_users`, `admin_sessions`, `audit_log` |
| 22 | Portal desktop | React, `@phosphor-icons/react` 2.1.10, pointer events | `pulse()`, `search()`, `usage()` | `GET /api/admin/pulse`, `/search`, `/usage` | many (read-only counts) |
| 23 | Portal controls | React, `postMessage` iframe | `validateSiteDocument()`, `saveSite()` | `GET/PUT /api/admin/site`, `GET /api/portfolio` | `settings` (key `site`) |
| 24 | Other portal apps | React | `sales.js`, `catalog.js`, `content.js`, `social.js`, `system.js` functions | see Table D | see feature 24 |
| 25 | Uploads and storage | `XMLHttpRequest`, `File.slice()` | `signUpload()`, `storageRequest()`, `r2Storage()` | `POST /api/admin/uploads`, `/__storage/*`, `/__storage-upload/*` | `product_files`, `backups` |
| 26 | Security | headers, cookies | `dispatch()`, `assertSameOrigin()`, `rateLimit()`, `verifyTurnstile()`, `encrypt()` | all | `rate_limits`, `audit_log` |
| 27 | Scheduled jobs and backups | none | `daily()`, `weekly()`, `social()`, `runBackup()` | `GET /api/cron/*`, `/api/admin/backups…` | `backups`, `settings` |
| 28 | Legal, coupons, notify-me, templates | plain HTML, JavaScript form | `legalPage()`, `evaluateCoupons()`, `notify()`, `launch()`, template functions | `/legal…`, `POST /api/notify`, admin routes | `legal_pages`, `coupons`, `notify_signups`, `email_templates` |
| 29 | Deployment and hosting | Vite 6.4.3 build | `default.fetch()` (`cloudflare.js`), `scheduled()` | `GET /api/health` | D1 `ka-db`, R2 `ka-files` |

## Table B. Every library in `package.json` → features that use it

Versions are the installed versions in `package-lock.json`.

| Library | Version | Section in `package.json` | Used by | How it was found |
|---|---|---|---|---|
| `react` | 18.3.1 | dependencies | Features 5 (WorkStacks), 10, 11, 12, 13 (checkout part), 15–17, 21–25 (portal and store) | imports in `client/src` and `client/portal/src` |
| `react-dom` | 18.3.1 | dependencies | Same as `react` (`createRoot`, `createPortal`) | same |
| `three` | 0.185.1 | dependencies | Feature 9 (panda, `panda.ts`, `panda-character.ts`); `poster-background.ts` (feature 2, disabled); The crystal hero and nebula use the separate classic script `public/three-r128.min.js`, not this package | `import * as THREE from 'three'` |
| `gsap` | removed | (was in dependencies) | It was used only by the old 3D folder scene, which has been deleted, so the package was uninstalled. The word "gsap" in `shared/skill-logos.js` is a logo name, not the library | imports |
| `@phosphor-icons/react` | 2.1.10 | dependencies | Feature 22 (`client/portal/src/shell/Chrome.tsx`, dock icons) | import |
| `ua-parser-js` | 1.0.41 | dependencies | Feature 18 (`track.js` → `parseUA()`), feature 21 (`auth.js` → `listSessions()`) | import |
| `dotenv` | 16.6.1 | dependencies | Feature 29: local Node host and scripts (`server/platform/node-dev.js`, `scripts/*.mjs`); not used on Cloudflare | import |
| `typescript` | 5.7.2 | devDependencies | Feature 29: `tsc --noEmit` in `npm run build` | `package.json` script |
| `@types/react`, `@types/react-dom`, `@types/three` | 18.3.18, 18.3.5, 0.185.4 | devDependencies | Feature 29: type checking only | type packages |
| `vite` | 6.4.3 | devDependencies | Feature 29: builds all browser bundles (`vite.config.mjs`) | config |
| `postcss` | 8.5.28 | devDependencies | Feature 29: CSS processing used by Vite and by build tests (`tests/gallery-build.test.mjs`) | tests and Vite |
| `better-sqlite3` | 11.10.0 | devDependencies | Feature 29 and local tests: the SQLite driver for the Node host (`server/dev/sqlite.js`); the Worker uses D1 instead | import |
| `wrangler` | 4.144.0 | devDependencies | Features 27 and 29: deploy, D1 migrations, local Worker (`package.json` scripts) | scripts |
| `qs` | forced to ^6.16.0 by `overrides` | overrides | A nested dependency fixed to a patched version | `package.json` |

Outside `package.json` (loaded from the internet by the page): Razorpay Checkout (`https://checkout.razorpay.com/v1/checkout.js`, features 11), Cloudflare Turnstile (`https://challenges.cloudflare.com/turnstile/v0/api.js`, features 11, 13, 15, 28), Google Fonts (preconnect in `index.html`, feature 20), the YouTube IFrame API (`https://www.youtube.com/iframe_api`, feature 3, About page "In Motion"), Gemini and Anthropic REST APIs (feature 17), Brevo API (feature 16), `ipwho.is` and `ipstack` (feature 18).

## Table C. Every browser API → features that use it

| Browser API | Features |
|---|---|
| WebGL (through Three.js) | 1, 2, 9 |
| Canvas 2D | 1, 2, 5 (dominant colour), 8 |
| `requestAnimationFrame` | 1, 2, 3, 5, 8, 9, 12 |
| `IntersectionObserver` | 1, 3, 4, 5, 9, 20, 23 |
| `ResizeObserver` | 5, 9, 20 |
| `MutationObserver` | 3 |
| Web Animations API (`element.animate()`) | 3, 4, 5, 23 |
| CSS 3D transforms, `clip-path`, `filter`, custom properties | 3, 5, 7, 12, 23 |
| View Transitions API | 5 |
| Pointer events and pointer capture | 1, 2, 5, 6, 8, 12, 22 |
| Touch events | 2, 5, 6 |
| `wheel` | 5 |
| `DeviceOrientationEvent` | 12 |
| `navigator.vibrate` | 6 |
| History API (`pushState`, `replaceState`) and `URLSearchParams` | 6, 22 |
| `matchMedia` and CSS `@media`/`@container` | 1, 2, 3, 4, 5, 7, 9, 10, 17, 22, 23 |
| `visualViewport` | 1, 7 |
| `visibilitychange`, `pagehide`, `pageshow` | 1, 2, 4, 8, 9, 18, 19 |
| `fetch` | 10, 11, 15, 16 (server), 17, 18, 19, 21–25 |
| `AbortController` | 10, 15, 22 |
| Server-sent events through `fetch` + `ReadableStream` reader + `TextDecoder` | 17 |
| `navigator.sendBeacon` | 18 |
| `XMLHttpRequest` (upload progress) | 24, 25 |
| `BroadcastChannel` | 19, 22 |
| `postMessage` | 23 |
| `localStorage` | 5, 10, 11, 17, 18, 22 |
| `sessionStorage` | 3, 9, 10, 17, 18, 23 |
| Geolocation API and Permissions API | 18 |
| Fullscreen API | 8, 22 |
| `MediaRecorder`, `canvas.captureStream`, `canvas.toBlob`, `URL.createObjectURL` | 8, 24 |
| Shadow DOM (`attachShadow`) | 8, 10 |
| `FontFace` and `@font-face` | 12, 23 |
| `Intl.NumberFormat`, `Intl.DateTimeFormat` | 10, 18 |
| `navigator.share`, `navigator.clipboard` | 5 |
| `navigator.onLine`, `online`/`offline` events | 11, 19 |
| `crypto.getRandomValues` | 9, 18 |
| `navigator.deviceMemory`, `navigator.hardwareConcurrency`, `devicePixelRatio` | 1, 2, 7, 8, 9, 20 |
| `requestIdleCallback` | 9, 20 |
| `<link rel="preload">`, `preconnect`, `fetchpriority` | 1, 20 |
| Cookies (`HttpOnly`, `Secure`, `SameSite=Strict`) | 21 |
| `autocomplete`, ARIA live regions, `aria-*` | 4, 10, 15, 17, 21, 22 |

## Table D. Every API endpoint → feature

There are 170 routes registered with `route(...)` (read from the running router) plus the two storage paths handled directly by the Worker. "Feature" is the number of the feature section that explains it.

| # | Method | Path | Server file → function | Access | Feature |
|---|---|---|---|---|---|
| 1 | GET | `/api/store/catalog` | `server/handlers/store-public.js:116` → `catalog()` | Public (same-origin for writes) | 10 |
| 2 | GET | `/api/store/products/:slug` | `server/handlers/store-public.js:117` → `product()` | Public (same-origin for writes) | 10 |
| 3 | GET | `/api/store/products/:slug/reviews` | `server/handlers/store-public.js:118` → `reviews()` | Public (same-origin for writes) | 10 |
| 4 | GET | `/api/tips` | `server/handlers/store-public.js:119` → `tips()` | Public (same-origin for writes) | 10 |
| 5 | GET | `/api/tips/:slug` | `server/handlers/store-public.js:120` → `tip()` | Public (same-origin for writes) | 10 |
| 6 | POST | `/api/checkout/quote` | `server/handlers/checkout.js:140` → `quote()` | Public (same-origin for writes) | 11 |
| 7 | POST | `/api/checkout/order` | `server/handlers/checkout.js:141` → `createOrder()` | Public (same-origin for writes) | 11 |
| 8 | POST | `/api/checkout/verify` | `server/handlers/checkout.js:142` → `verify()` | Public (same-origin for writes) | 11 |
| 9 | POST | `/api/checkout/status` | `server/handlers/checkout.js:143` → `status()` | Public (same-origin for writes) | 11 |
| 10 | POST | `/api/checkout/cancel` | `server/handlers/checkout.js:144` → `cancel()` | Public (same-origin for writes) | 11 |
| 11 | POST | `/api/checkout/demo-pay` | `server/handlers/checkout.js:145` → `demoPay()` | Public (same-origin for writes) | 11 |
| 12 | POST | `/api/webhooks/razorpay` | `server/handlers/checkout.js:146` → `razorpayWebhook()` | Provider signature | 11 |
| 13 | GET | `/api/download/:token` | `server/handlers/checkout.js:147` → `downloadGet()` | Public (same-origin for writes) | 13 |
| 14 | POST | `/api/download/:token` | `server/handlers/checkout.js:148` → `downloadPost()` | Public (same-origin for writes) | 13 |
| 15 | POST | `/api/download/:token/rate` | `server/handlers/checkout.js:149` → `ratePost()` | Public (same-origin for writes) | 13 |
| 16 | POST | `/api/downloads/resend` | `server/handlers/checkout.js:150` → `resend()` | Public (same-origin for writes) | 13 |
| 17 | GET | `/legal` | `server/handlers/legal.js:48` → `legalIndex()` | Public (same-origin for writes) | 28 |
| 18 | GET | `/legal/:slug` | `server/handlers/legal.js:49` → `legalPage()` | Public (same-origin for writes) | 28 |
| 19 | GET | `/license` | `server/handlers/license.js:113` → `licenseIndex()` | Public (same-origin for writes) | 14 |
| 20 | GET | `/license/:code` | `server/handlers/license.js:114` → `licensePage()` | Public (same-origin for writes) | 14 |
| 21 | GET | `/api/admin/setup-status` | `server/admin/auth.js:235` → `setupStatus()` | Public (same-origin for writes) | 21 |
| 22 | POST | `/api/admin/setup` | `server/admin/auth.js:236` → `setup()` | Public (same-origin for writes) | 21 |
| 23 | POST | `/api/admin/login` | `server/admin/auth.js:237` → `login()` | Public (same-origin for writes) | 21 |
| 24 | GET | `/api/admin/session` | `server/admin/auth.js:238` → `session()` | Portal session (+ CSRF on writes) | 21 |
| 25 | GET | `/api/admin/account` | `server/admin/auth.js:239` → `account()` | Portal session (+ CSRF on writes) | 21 |
| 26 | POST | `/api/admin/logout` | `server/admin/auth.js:240` → `logout()` | Portal session (+ CSRF on writes) | 21 |
| 27 | POST | `/api/admin/logout-everywhere` | `server/admin/auth.js:241` → `logoutEverywhere()` | Portal session (+ CSRF on writes) | 24 |
| 28 | GET | `/api/admin/sessions` | `server/admin/auth.js:242` → `listSessions()` | Portal session (+ CSRF on writes) | 24 |
| 29 | DELETE | `/api/admin/sessions/:id` | `server/admin/auth.js:243` → `revokeSession()` | Portal session (+ CSRF on writes) | 24 |
| 30 | POST | `/api/admin/password` | `server/admin/auth.js:244` → `changePassword()` | Portal session (+ CSRF on writes) | 21 |
| 31 | POST | `/api/admin/2fa/start` | `server/admin/auth.js:245` → `twoFactorStart()` | Portal session (+ CSRF on writes) | 21 |
| 32 | POST | `/api/admin/2fa/enable` | `server/admin/auth.js:246` → `twoFactorEnable()` | Portal session (+ CSRF on writes) | 21 |
| 33 | POST | `/api/admin/2fa/disable` | `server/admin/auth.js:247` → `twoFactorDisable()` | Portal session (+ CSRF on writes) | 21 |
| 34 | GET | `/api/admin/team` | `server/admin/team.js:126` → `listTeam()` | Portal session (+ CSRF on writes) | 21 |
| 35 | POST | `/api/admin/team` | `server/admin/team.js:127` → `addPerson()` | Portal session (+ CSRF on writes) | 21 |
| 36 | PUT | `/api/admin/team/:id` | `server/admin/team.js:128` → `updatePerson()` | Portal session (+ CSRF on writes) | 21 |
| 37 | POST | `/api/admin/team/:id/password` | `server/admin/team.js:129` → `resetPersonPassword()` | Portal session (+ CSRF on writes) | 21 |
| 38 | POST | `/api/admin/team/:id/sign-out` | `server/admin/team.js:130` → `signOutPerson()` | Portal session (+ CSRF on writes) | 21 |
| 39 | POST | `/api/admin/team/:id/access` | `server/admin/team.js:131` → `setPersonAccess()` | Portal session (+ CSRF on writes) | 21 |
| 40 | DELETE | `/api/admin/team/:id` | `server/admin/team.js:132` → `deletePerson()` | Portal session (+ CSRF on writes) | 21 |
| 41 | GET | `/api/admin/products/:id/ratings` | `server/admin/catalog.js:441` → `productRatings()` | Portal session (+ CSRF on writes) | 24 |
| 42 | PATCH | `/api/admin/ratings/:id` | `server/admin/catalog.js:442` → `updateRating()` | Portal session (+ CSRF on writes) | 24 |
| 43 | DELETE | `/api/admin/ratings/:id` | `server/admin/catalog.js:443` → `deleteRating()` | Portal session (+ CSRF on writes) | 24 |
| 44 | POST | `/api/admin/uploads` | `server/admin/catalog.js:444` → `signUpload()` | Portal session (+ CSRF on writes) | 25 |
| 45 | GET | `/api/admin/products` | `server/admin/catalog.js:445` → `listProducts()` | Portal session (+ CSRF on writes) | 24 |
| 46 | POST | `/api/admin/products` | `server/admin/catalog.js:446` → `createProduct()` | Portal session (+ CSRF on writes) | 24 |
| 47 | POST | `/api/admin/products/reorder` | `server/admin/catalog.js:447` → `reorderProducts()` | Portal session (+ CSRF on writes) | 24 |
| 48 | GET | `/api/admin/products/:id` | `server/admin/catalog.js:448` → `getProduct()` | Portal session (+ CSRF on writes) | 24 |
| 49 | PUT | `/api/admin/products/:id` | `server/admin/catalog.js:449` → `updateProduct()` | Portal session (+ CSRF on writes) | 24 |
| 50 | GET | `/api/admin/products/:id/history` | `server/admin/catalog.js:450` → `productHistory()` | Portal session (+ CSRF on writes) | 24 |
| 51 | POST | `/api/admin/products/:id/history/:revisionId/restore` | `server/admin/catalog.js:451` → `restoreProductRevision()` | Portal session (+ CSRF on writes) | 24 |
| 52 | DELETE | `/api/admin/products/:id` | `server/admin/catalog.js:452` → `deleteProduct()` | Portal session (+ CSRF on writes) | 24 |
| 53 | POST | `/api/admin/products/:id/duplicate` | `server/admin/catalog.js:453` → `duplicateProduct()` | Portal session (+ CSRF on writes) | 24 |
| 54 | POST | `/api/admin/products/:id/restore` | `server/admin/catalog.js:454` → `restoreProduct()` | Portal session (+ CSRF on writes) | 24 |
| 55 | POST | `/api/admin/products/:id/media` | `server/admin/catalog.js:455` → `addMedia()` | Portal session (+ CSRF on writes) | 24 |
| 56 | PATCH | `/api/admin/products/:id/media` | `server/admin/catalog.js:456` → `updateMedia()` | Portal session (+ CSRF on writes) | 24 |
| 57 | DELETE | `/api/admin/products/:id/media/:mediaId` | `server/admin/catalog.js:457` → `deleteMedia()` | Portal session (+ CSRF on writes) | 24 |
| 58 | PUT | `/api/admin/products/:id/file` | `server/admin/catalog.js:458` → `setFile()` | Portal session (+ CSRF on writes) | 24 |
| 59 | GET | `/api/admin/products/:id/file` | `server/admin/catalog.js:459` → `fileLink()` | Portal session (+ CSRF on writes) | 24 |
| 60 | GET | `/api/admin/categories` | `server/admin/catalog.js:460` → `listCategories()` | Portal session (+ CSRF on writes) | 24 |
| 61 | POST | `/api/admin/categories/reorder` | `server/admin/catalog.js:461` → `reorderCategories()` | Portal session (+ CSRF on writes) | 24 |
| 62 | POST | `/api/admin/categories` | `server/admin/catalog.js:462` → `saveCategory()` | Portal session (+ CSRF on writes) | 24 |
| 63 | PUT | `/api/admin/categories/:id` | `server/admin/catalog.js:463` → `saveCategory()` | Portal session (+ CSRF on writes) | 24 |
| 64 | DELETE | `/api/admin/categories/:id` | `server/admin/catalog.js:464` → `deleteCategory()` | Portal session (+ CSRF on writes) | 24 |
| 65 | GET | `/api/admin/licenses` | `server/admin/catalog.js:465` → `listLicenses()` | Portal session (+ CSRF on writes) | 24 |
| 66 | POST | `/api/admin/licenses` | `server/admin/catalog.js:466` → `saveLicense()` | Portal session (+ CSRF on writes) | 24 |
| 67 | PUT | `/api/admin/licenses/:id` | `server/admin/catalog.js:467` → `saveLicense()` | Portal session (+ CSRF on writes) | 24 |
| 68 | DELETE | `/api/admin/licenses/:id` | `server/admin/catalog.js:468` → `deleteLicense()` | Portal session (+ CSRF on writes) | 24 |
| 69 | GET | `/api/admin/overview` | `server/admin/sales.js:357` → `overview()` | Portal session (+ CSRF on writes) | 24 |
| 70 | GET | `/api/admin/orders` | `server/admin/sales.js:358` → `listOrders()` | Portal session (+ CSRF on writes) | 24 |
| 71 | GET | `/api/admin/orders.csv` | `server/admin/sales.js:359` → `ordersCsv()` | Portal session (+ CSRF on writes) | 24 |
| 72 | GET | `/api/admin/orders/:id` | `server/admin/sales.js:360` → `getOrder()` | Portal session (+ CSRF on writes) | 24 |
| 73 | POST | `/api/admin/orders/:id/resend` | `server/admin/sales.js:361` → `resendOrder()` | Portal session (+ CSRF on writes) | 24 |
| 74 | POST | `/api/admin/orders/:id/receipt` | `server/admin/sales.js:362` → `resendReceipt()` | Portal session (+ CSRF on writes) | 24 |
| 75 | POST | `/api/admin/orders/:id/refund` | `server/admin/sales.js:363` → `refund()` | Portal session (+ CSRF on writes) | 24 |
| 76 | GET | `/api/admin/orders/:id/invoice` | `server/admin/sales.js:364` → `invoice()` | Portal session (+ CSRF on writes) | 24 |
| 77 | POST | `/api/admin/links/:id/revoke` | `server/admin/sales.js:365` → `revokeLink()` | Portal session (+ CSRF on writes) | 24 |
| 78 | GET | `/api/admin/coupons` | `server/admin/sales.js:366` → `listCoupons()` | Portal session (+ CSRF on writes) | 28 |
| 79 | POST | `/api/admin/coupons` | `server/admin/sales.js:367` → `saveCoupon()` | Portal session (+ CSRF on writes) | 28 |
| 80 | PUT | `/api/admin/coupons/:id` | `server/admin/sales.js:368` → `saveCoupon()` | Portal session (+ CSRF on writes) | 28 |
| 81 | POST | `/api/admin/coupons/:id/pause` | `server/admin/sales.js:369` → `pauseCoupon()` | Portal session (+ CSRF on writes) | 28 |
| 82 | DELETE | `/api/admin/coupons/:id` | `server/admin/sales.js:370` → `deleteCoupon()` | Portal session (+ CSRF on writes) | 28 |
| 83 | GET | `/api/admin/coupons/:id/uses` | `server/admin/sales.js:371` → `couponUsage()` | Portal session (+ CSRF on writes) | 28 |
| 84 | GET | `/api/admin/downloads` | `server/admin/sales.js:372` → `downloads()` | Portal session (+ CSRF on writes) | 24 |
| 85 | GET | `/api/admin/reports` | `server/admin/sales.js:373` → `reports()` | Portal session (+ CSRF on writes) | 24 |
| 86 | GET | `/api/admin/reports.csv` | `server/admin/sales.js:374` → `reportsCsv()` | Portal session (+ CSRF on writes) | 24 |
| 87 | GET | `/api/admin/site` | `server/admin/content.js:241` → `getSite()` | Portal session (+ CSRF on writes) | 23 |
| 88 | PUT | `/api/admin/site` | `server/admin/content.js:242` → `saveSite()` | Portal session (+ CSRF on writes) | 23 |
| 89 | GET | `/api/admin/site/skills-defaults` | `server/admin/content.js:244` → `inline()` | Portal session (+ CSRF on writes) | 23 |
| 90 | GET | `/api/admin/tips` | `server/admin/content.js:245` → `listTips()` | Portal session (+ CSRF on writes) | 24 |
| 91 | POST | `/api/admin/tips` | `server/admin/content.js:246` → `saveTip()` | Portal session (+ CSRF on writes) | 24 |
| 92 | PUT | `/api/admin/tips/:id` | `server/admin/content.js:247` → `saveTip()` | Portal session (+ CSRF on writes) | 24 |
| 93 | DELETE | `/api/admin/tips/:id` | `server/admin/content.js:248` → `deleteTip()` | Portal session (+ CSRF on writes) | 24 |
| 94 | POST | `/api/admin/markdown` | `server/admin/content.js:249` → `previewMarkdown()` | Portal session (+ CSRF on writes) | 24 |
| 95 | GET | `/api/admin/legal` | `server/admin/content.js:250` → `listLegal()` | Portal session (+ CSRF on writes) | 28 |
| 96 | PUT | `/api/admin/legal/:slug` | `server/admin/content.js:251` → `saveLegal()` | Portal session (+ CSRF on writes) | 28 |
| 97 | GET | `/api/admin/email-templates` | `server/admin/content.js:252` → `listTemplates()` | Portal session (+ CSRF on writes) | 28 |
| 98 | PUT | `/api/admin/email-templates/:key` | `server/admin/content.js:253` → `saveTemplate()` | Portal session (+ CSRF on writes) | 28 |
| 99 | DELETE | `/api/admin/email-templates/:key` | `server/admin/content.js:254` → `resetTemplate()` | Portal session (+ CSRF on writes) | 28 |
| 100 | POST | `/api/admin/email-templates/:key/test` | `server/admin/content.js:255` → `testTemplate()` | Portal session (+ CSRF on writes) | 28 |
| 101 | GET | `/api/admin/settings/:key` | `server/admin/content.js:256` → `getSettings()` | Portal session (+ CSRF on writes) | 24 |
| 102 | PUT | `/api/admin/settings/:key` | `server/admin/content.js:257` → `saveSettings()` | Portal session (+ CSRF on writes) | 24 |
| 103 | GET | `/api/admin/notify` | `server/admin/content.js:258` → `listNotify()` | Portal session (+ CSRF on writes) | 28 |
| 104 | DELETE | `/api/admin/notify/:id` | `server/admin/content.js:259` → `deleteSignup()` | Portal session (+ CSRF on writes) | 28 |
| 105 | POST | `/api/admin/notify/:topic/launch` | `server/admin/content.js:260` → `launch()` | Portal session (+ CSRF on writes) | 28 |
| 106 | GET | `/api/admin/messages` | `server/admin/messages.js:132` → `listMessages()` | Portal session (+ CSRF on writes) | 15 |
| 107 | POST | `/api/admin/messages/bulk` | `server/admin/messages.js:133` → `bulkMessages()` | Portal session (+ CSRF on writes) | 15 |
| 108 | GET | `/api/admin/messages/:id` | `server/admin/messages.js:134` → `getMessage()` | Portal session (+ CSRF on writes) | 15 |
| 109 | PATCH | `/api/admin/messages/:id` | `server/admin/messages.js:135` → `updateMessage()` | Portal session (+ CSRF on writes) | 15 |
| 110 | POST | `/api/admin/messages/:id/reply` | `server/admin/messages.js:136` → `reply()` | Portal session (+ CSRF on writes) | 15 |
| 111 | GET | `/api/admin/canned` | `server/admin/messages.js:137` → `listCanned()` | Portal session (+ CSRF on writes) | 15 |
| 112 | POST | `/api/admin/canned` | `server/admin/messages.js:138` → `saveCanned()` | Portal session (+ CSRF on writes) | 15 |
| 113 | PUT | `/api/admin/canned/:id` | `server/admin/messages.js:139` → `saveCanned()` | Portal session (+ CSRF on writes) | 15 |
| 114 | DELETE | `/api/admin/canned/:id` | `server/admin/messages.js:140` → `deleteCanned()` | Portal session (+ CSRF on writes) | 15 |
| 115 | GET | `/api/admin/blocklist` | `server/admin/messages.js:141` → `listBlocklist()` | Portal session (+ CSRF on writes) | 15 |
| 116 | POST | `/api/admin/blocklist` | `server/admin/messages.js:142` → `addBlock()` | Portal session (+ CSRF on writes) | 15 |
| 117 | DELETE | `/api/admin/blocklist/:id` | `server/admin/messages.js:143` → `removeBlock()` | Portal session (+ CSRF on writes) | 15 |
| 118 | GET | `/api/admin/pulse` | `server/admin/system.js:147` → `pulse()` | Portal session (+ CSRF on writes) | 22 |
| 119 | GET | `/api/admin/search` | `server/admin/system.js:148` → `search()` | Portal session (+ CSRF on writes) | 22 |
| 120 | GET | `/api/admin/system` | `server/admin/system.js:149` → `status()` | Portal session (+ CSRF on writes) | 24 |
| 121 | GET | `/api/admin/system/storage` | `server/admin/system.js:150` → `storageUsage()` | Portal session (+ CSRF on writes) | 24 |
| 122 | POST | `/api/admin/system/test-email` | `server/admin/system.js:151` → `testEmail()` | Portal session (+ CSRF on writes) | 24 |
| 123 | GET | `/api/admin/backups` | `server/admin/system.js:152` → `listBackups()` | Portal session (+ CSRF on writes) | 27 |
| 124 | POST | `/api/admin/backups` | `server/admin/system.js:153` → `backupNow()` | Portal session (+ CSRF on writes) | 27 |
| 125 | GET | `/api/admin/backups/:id/link` | `server/admin/system.js:154` → `backupLink()` | Portal session (+ CSRF on writes) | 27 |
| 126 | DELETE | `/api/admin/backups/:id` | `server/admin/system.js:155` → `deleteBackup()` | Portal session (+ CSRF on writes) | 27 |
| 127 | GET | `/api/admin/audit` | `server/admin/system.js:156` → `auditLog()` | Portal session (+ CSRF on writes) | 24 |
| 128 | POST | `/api/admin/visits/purge` | `server/admin/system.js:157` → `purgeVisits()` | Portal session (+ CSRF on writes) | 18 |
| 129 | GET | `/api/admin/visitors` | `server/admin/visitors.js:80` → `summary()` | Portal session (+ CSRF on writes) | 18 |
| 130 | GET | `/api/admin/visitors/live` | `server/admin/visitors.js:81` → `live()` | Portal session (+ CSRF on writes) | 18 |
| 131 | GET | `/api/admin/visitors/log` | `server/admin/visitors.js:82` → `log()` | Portal session (+ CSRF on writes) | 18 |
| 132 | GET | `/api/admin/visitors.csv` | `server/admin/visitors.js:83` → `logCsv()` | Portal session (+ CSRF on writes) | 18 |
| 132a | GET | `/api/admin/visitors/history` | `server/admin/visitors.js` → `history()` | Portal session (+ CSRF on writes) | 18 |
| 132b | PUT | `/api/admin/visitors/mark` | `server/admin/visitors.js` → `markVisitor()` | Portal session (+ CSRF on writes) | 18 |
| 133 | POST | `/api/visit` | `server/visitors/track.js:83` → `visit()` | Public (same-origin for writes) | 18 |
| 134 | GET | `/api/admin/assistant` | `server/admin/assistant.js:145` → `overview()` | Portal session (+ CSRF on writes) | 17 |
| 135 | GET | `/api/admin/assistant/kb` | `server/admin/assistant.js:146` → `listKb()` | Portal session (+ CSRF on writes) | 17 |
| 136 | POST | `/api/admin/assistant/kb` | `server/admin/assistant.js:147` → `saveKb()` | Portal session (+ CSRF on writes) | 17 |
| 137 | PUT | `/api/admin/assistant/kb/:id` | `server/admin/assistant.js:148` → `saveKb()` | Portal session (+ CSRF on writes) | 17 |
| 138 | DELETE | `/api/admin/assistant/kb/:id` | `server/admin/assistant.js:149` → `deleteKb()` | Portal session (+ CSRF on writes) | 17 |
| 139 | GET | `/api/admin/assistant/conversations` | `server/admin/assistant.js:150` → `conversations()` | Portal session (+ CSRF on writes) | 17 |
| 140 | GET | `/api/admin/assistant/repeated` | `server/admin/assistant.js:151` → `repeatedQuestions()` | Portal session (+ CSRF on writes) | 17 |
| 141 | GET | `/api/admin/assistant/conversations/:id` | `server/admin/assistant.js:152` → `conversation()` | Portal session (+ CSRF on writes) | 17 |
| 142 | DELETE | `/api/admin/assistant/conversations/:id` | `server/admin/assistant.js:153` → `deleteConversation()` | Portal session (+ CSRF on writes) | 17 |
| 143 | POST | `/api/admin/assistant/messages/:id/rate` | `server/admin/assistant.js:154` → `rate()` | Portal session (+ CSRF on writes) | 17 |
| 144 | POST | `/api/admin/assistant/playground` | `server/admin/assistant.js:155` → `playground()` | Portal session (+ CSRF on writes) | 17 |
| 145 | GET | `/api/admin/social` | `server/admin/social.js:10` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 146 | GET | `/api/admin/social/posts/:id` | `server/admin/social.js:16` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 147 | POST | `/api/admin/social/posts` | `server/admin/social.js:17` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 148 | PUT | `/api/admin/social/posts/:id` | `server/admin/social.js:22` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 149 | DELETE | `/api/admin/social/posts/:id` | `server/admin/social.js:28` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 150 | POST | `/api/admin/social/posts/:id/duplicate` | `server/admin/social.js:34` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 151 | POST | `/api/admin/social/posts/:id/send` | `server/admin/social.js:35` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 152 | POST | `/api/admin/social/posts/:id/mark` | `server/admin/social.js:41` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 153 | PUT | `/api/admin/social/settings` | `server/admin/social.js:45` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 154 | POST | `/api/admin/social/settings/test` | `server/admin/social.js:50` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 155 | POST | `/api/admin/social/hashtag-sets` | `server/admin/social.js:51` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 156 | PUT | `/api/admin/social/hashtag-sets/:id` | `server/admin/social.js:52` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 157 | DELETE | `/api/admin/social/hashtag-sets/:id` | `server/admin/social.js:53` → inline handler (`server/store/social.js`) | Portal session (+ CSRF on writes) | 24 |
| 158 | GET | `/api/admin/usage` | `server/admin/usage.js:71` → `usage()` | Portal session (+ CSRF on writes) | 22 |
| 159 | GET | `/api/public-config` | `server/handler.js:50` → `pub.publicConfig()` | Public (same-origin for writes) | 10, 17, 23 |
| 160 | GET | `/api/portfolio` | `server/handler.js:51` → `pub.portfolio()` | Public (same-origin for writes) | 23 |
| 161 | GET | `/api/live` | `server/handler.js:52` → `pub.liveVersion()` | Public (same-origin for writes) | 19 |
| 162 | POST | `/api/contact` | `server/handler.js:53` → `pub.contact()` | Public (same-origin for writes) | 15 |
| 163 | POST | `/api/notify` | `server/handler.js:54` → `pub.notify()` | Public (same-origin for writes) | 28 |
| 164 | POST | `/api/assistant` | `server/handler.js:55` → `assistant()` | Public (same-origin for writes) | 17 |
| 165 | GET | `/api/health` | `server/handler.js:56` → `inline()` | Public (same-origin for writes) | 29 |
| 166 | GET | `/api/cron/daily` | `server/handler.js:59` → `cron.daily()` | Cron bearer secret | 27 |
| 167 | GET | `/api/cron/weekly` | `server/handler.js:60` → `cron.weekly()` | Cron bearer secret | 27 |
| 168 | GET | `/api/cron/social` | `server/handler.js:61` → `cron.social()` | Cron bearer secret | 27 |
| 169 | GET | `/__storage/<bucket>/<path>` | `server/platform/cloudflare.js` → `storageRequest()` | Public bucket open; private needs signed link | 25 |
| 170 | PUT/POST/DELETE | `/__storage-upload/<bucket>/<path>` | `server/platform/cloudflare.js` → `storageRequest()` | Signed upload link | 25 |

---

# Verification

## How this guide was checked

1. Every feature section was written from code that was opened and read (list below).
2. After writing, a script checked the guide against the project: all **502** function names written like `name()` exist in the source, every `file → function` pair names a function that appears in that file (the two exceptions are routes written as inline handlers), and every file path written in full exists. Short relative names in a few tables were changed to full paths.
3. Table D was generated from the running router's route list (170 routes) so no endpoint could be skipped, plus the two storage paths that the Worker handles directly.
4. All 29 features were checked for the 15 required headings. Features that first lacked a heading (1, 12, 19, 20, 22, 23, 25, 26, 27, 29) were corrected.
5. Wrong statements found during checking were corrected in the text. They are listed below so nothing is hidden.

## Changes made to the project after this guide was first written

| Change | Effect on this guide |
|---|---|
| The old 3D folder scene and `gsap` were removed | Feature 5 and Table B updated |
| Robotics and Data & ML skills added to the default Skills board, with 6 new logos | Feature 4 updated |
| Visitor location request set to normal accuracy | Feature 18 and finding 2 below |
| About bio rewritten, journey line and promo-cut clips added, then made editable in the portal; About numbers start counting when visible | Features 3 and 23 |
| License card border glow that follows the pointer | Feature 12 |
| Skills logo field now covers the whole skills block with random positions; phone and tablet fixes | Feature 4 |
| Visitor history, engagement score and marks in Visitors; the promo-cut reel skips a video that will not play; logos stay off the heading | Features 4, 18 and 3 |
| Hide a gallery image from the site (portal eye button); tips can be hidden (set back to draft) | Features 5, 23, 24 |
| Panda greeting waits for the panda; font upload accepts any browser font type; inline signature font upload; stale font faces replaced | Features 9, 12, 25 |
| Bio rewritten without repeated wording | Feature 3 |

## Corrections made while verifying

| Where | What was wrong | Fixed to |
|---|---|---|
| Feature 1 | A "replay" button was described | No element with `id="replay"` exists in the markup (`index.html` line ~4073 looks it up and gets nothing); the code path exists but there is no button |
| Feature 5 | The 3D folder scene was not mentioned | It was unused code; it has since been removed from the project (see below) |
| Feature 5 | `VISIBLE` value was unconfirmed | `VISIBLE = 3` (`WorkStacks.tsx` line ~486) |
| Feature 15 | Messages screen path | `client/portal/src/apps/Messages.tsx` (not `client/src/portal`) |
| Feature 16 | Behaviour with no email configured | On Cloudflare or in production `localDataDir()` throws and `sendEmail()` logs `failed`; the outbox folder is local development only |
| Feature 17 | Greeting and suggestion chips came from settings | They are written in `index.html` (`GREETINGS`, `QUICK_REPLIES`); the portal settings `greeting` and `suggestions` are sent by `/api/public-config` but not read by the page |
| Table B | `gsap` and `three` usage | `gsap` was used only by the old 3D folder scene (now deleted and uninstalled); `three` 0.185.1 only by the panda and the disabled poster background (the hero and nebula use the separate r128 script) |

## Other findings (not changed, because this task allowed creating one file only)

| # | Finding | Where |
|---|---|---|
| 1 | Comments say the hero has 169 shards; the manifest has 179 | `index.html` hero script |
| 2 | The visitor-location request was changed to normal accuracy during this session (`enableHighAccuracy: false`). The server drops a location fix whose accuracy is worse than 1000 m, so some visitors' browser locations will not be stored (the IP-based place is still stored) | `index.html` line ~8610, `server/visitors/track.js` |
| 3 | The portal's Assistant greeting and suggestions settings have no effect on the chat box | feature 17 |
| 4 | The `liveVersion` comment says "every few seconds"; the page checks every 15 seconds | `server/handlers/public.js`, `index.html` |
| 5 | A "Worker" role (limited portal access) does not exist; only `owner` and `admin` | `server/admin/team.js` |
| 6 | No backup restore function exists (export and download only) | `server/jobs/backup.js` |
| 7 | `index.html` has no Content-Security-Policy header | `client/public/_headers` |
| 8 | `server/store/pricing.js` was missing from `PROJECT_NOTES.md` | notes file (not edited) |
| 9 | Some build comments say "Vercel"; the active host is Cloudflare | `vite.config.mjs` |

## Files read

| Area | Files |
|---|---|
| Homepage | `index.html` (hero script, nebula, text effects, skills, navigation and swipe, contact form and paper rocket, stats, fonts, public services, live updates, visitor beacon and location, assistant widget, panda module, trail and embers, preview messages) |
| Browser bundles | `client/src/WorkStacks.tsx`, `gallery-entry.tsx`, `panda*.ts`, `poster-background.ts`, `studio/engine.ts`, `studio/studio-entry.ts`, `store/Store.tsx`, `store/Checkout.tsx`, `store/api.ts`, `store/store-entry.tsx`, `store/checkout/PassCard.tsx`, `machine.ts`, `checkout.css`; `shared/seal.js`, `shared/social.js` |
| Portal | `client/portal/src/main.tsx`, `api.ts`, `hooks.ts`, `apps/registry.ts`, `apps/License.tsx`, `apps/siteDoc.ts`, parts of `apps/Studio.tsx`, `Content.tsx`, `Settings.tsx`, `Visitors.tsx`, `Assistant.tsx`, `shell/Auth.tsx`, `desk.tsx`, `Window.tsx`, `Chrome.tsx`, `fullscreen.tsx`, `UsageAlert.tsx` |
| Server core | `server/handler.js`, `core/router.js`, `http.js`, `guard.js`, `atomic.js`, `crypto.js`, `env.js`, `env-validate.js`, `storage.js`, `blocklist.js`, `email.js`, `smtp.js`, `settings.js`, `validate.js` (exports) |
| Server public handlers | `handlers/public.js`, `checkout.js`, `store-public.js`, `license.js`, `legal.js`, `assistant.js`, `cron.js` |
| Server store | `store/orders.js`, `delivery.js`, `razorpay.js`, `license.js`, `pricing.js`, `coupons.js`, `social.js` |
| Server admin | `admin/auth.js`, `team.js`, `messages.js`, `sales.js`, `catalog.js`, `content.js`, `site-document.js`, `system.js`, `usage.js`, `visitors.js`, `social.js`, `assistant.js` |
| Server other | `assistant/engine.js`, `providers.js`, `knowledge.js`, `learning.js`, `quota.js`; `visitors/track.js`, `geo.js`; `jobs/backup.js`, `hooks.js`; `content/legal-drafts.js`; `platform/cloudflare.js`, `node-dev.js` |
| Deploy and data | `package.json`, `package-lock.json` (versions), `vite.config.mjs`, `wrangler.jsonc`, `pages/_worker.js`, `pages/wrangler.jsonc`, `pages/_routes.json`, `client/public/_headers`, `Dockerfile`, `docker-compose.yml`, `scripts/stage-pages.mjs`, `scripts/deploy-pages.mjs`, `migrations/*.sql` (table names), `generator/build_cinematic.py` |

## Items that could not be confirmed

| Item | Why |
|---|---|
| Cloudflare Pages dashboard settings (build command, output folder, Git link), WAF, DNS | They live in the Cloudflare dashboard, not in the repository |
| Compression (gzip or Brotli) | Done by Cloudflare's network; no code sets it |
| Content-Security-Policy for `index.html` | No code sets one |
| Exact on-screen labels and layouts of every portal app control | Not read line by line; field names come from the server code |
| Which Razorpay Checkout script version is served | Served by Razorpay at path `/v1/` |
| Backup restore, virus scanning, a "Worker" role, 2FA reset for another person | Not present in code |
| Measured page speed | No measurements exist in the repository |
| The production steps for the hero's `.webp` pictures and the Python packages the generator needs | Not documented in the files read |

## Confidence per feature

High means the statements were checked against the code that does the work. Medium means the main flow is confirmed but some details were not read line by line (large inline scripts or many screens).

| # | Feature | Confidence | Reason |
|---|---|---|---|
| 1 | Crystal shards intro | Medium | Very large inline script, read in sections; constants confirmed; picture production steps not documented |
| 2 | Background animations | Medium | Same; CSS fallback not quoted |
| 3 | Text animations | Medium | Large scripts, main mechanisms confirmed |
| 4 | Skills section | Medium | Mechanisms confirmed; logo data source details partial |
| 5 | Image hover effects | Medium | `Viewer` and `DownloadFill` not read in full |
| 6 | Page navigation | High | Navigation and swipe code read with its constants |
| 7 | Screen compatibility | Medium | Every query listed, declarations inside each not extracted |
| 8 | Typography studio | Medium | Engine and entry read; shortcut list not extracted |
| 9 | Panda mascot | Medium | Pose animations not read line by line |
| 10 | Store browsing | High | |
| 11 | Checkout and Razorpay | High | |
| 12 | License card | High | |
| 13 | Delivery, downloads, ratings, refunds | High | |
| 14 | License check page | High | Status sentences not quoted |
| 15 | Contact and Messages | High | |
| 16 | Email sending | High | MCP absence confirmed by a search of the source |
| 17 | AI assistant | High | |
| 18 | Visitor analytics | High | Chart rendering not traced |
| 19 | Live updates | High | |
| 20 | Performance | Medium | Collected from several files; no measurements |
| 21 | Admin login, 2FA, team | High | |
| 22 | Portal desktop | High | KA menu item list not read |
| 23 | Portal controls | High | Validator read fully; control labels not |
| 24 | Other portal apps | Medium | Server rules read; screens not line by line |
| 25 | Uploads and storage | High | |
| 26 | Security | High | Dashboard-level settings are outside the code |
| 27 | Scheduled jobs and backups | High | |
| 28 | Legal, coupons, notify-me, templates | High | |
| 29 | Deployment and hosting | Medium | Dashboard settings are not in the repository |

## `git status` after this task

Only one file was created by this task: `FEATURE_GUIDE.md` (shown as untracked, `??`). The other changes in the working folder were already there or were made earlier in this session at the owner's request, and this task did not touch them: `PROJECT_NOTES.md` and `BEGINNER_NOTES.md` (earlier notes, untracked), the moved documents under `docs/`, edits to `README.md`, `Dockerfile`, `.env.example` and `wrangler.jsonc` (comment and path edits from another editor), `client/public/_headers` (an earlier cache-header fix), and the one-line location-accuracy change in `index.html` (made at the owner's request earlier in this session, listed in finding 2).

## Update: product viewer and delivery email

- **Product viewer (Artifacts):** on screens 900 px and wider the description sits beside the screenshots. Products with both laptop and phone screenshots get a Desktop view / Mobile view switch; the description stays the same in both.
- **Delivery email (Portal > Products > a for-sale item > Delivery email):** after payment the buyer is emailed the secure download link and license automatically. Per product you can set a subject, an extra message and up to 5 attached files (10 MB each, 15 MB total, uploaded privately). "Save and send me a test" mails you a sample. Empty fields send the standard professional text.
- **Routes:** `GET/PUT /api/admin/products/:id/delivery`, `POST /api/admin/products/:id/delivery/test`. **Setting:** `deliveryEmails`. The default `order_delivery` text was rewritten; an owner override in Content > Emails still wins.
