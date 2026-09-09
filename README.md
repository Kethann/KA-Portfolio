> Current app: the KA crystal homepage is preserved, with React 3D folders embedded in Portfolio and Gallery. See [PORTFOLIO.md](PORTFOLIO.md) for the integration, creator dashboard, persistence, and run instructions. The animation notes below describe the original scene.

# KA Crystal Reconstruction

The current portfolio is `index.html`. Its opening splits the oversized KA source
sprite into 20 independently animated polygon sections before the first render;
the other 178 source fragments remain intact. Sections use the original atlas
texture and close back into the original plane before the polished reveal.
All sections now enter from randomized off-screen distances and angles. The live
portfolio also includes softer glow, drag-and-hold glass navigation, gallery swipe
controls, and zoom-aware canvas resolution capped to a device-sized pixel budget.
The navigation deforms during dragging and ripples on release. After reconstruction,
eight glass skill bubbles reveal curved SVG callouts with short labels; compact
layouts place the labels above and below the ring. Chat and gallery surfaces share
the same restrained glass palette.

`generator/build_cinematic.py` produces the older standalone demo, **not the full
current portfolio**. Do not copy its output over `index.html`: that would replace
newer navigation, gallery, accessibility, and responsive changes.

Opening geometry and animation checks (using the sibling portfolio's installed
Three.js and Acorn dependencies): `node generator/scripts/verify_opening.cjs`.
Navigation/gallery interaction checks: `node generator/scripts/verify_ui.cjs`.
These are local geometry and event checks, not browser screenshots or FPS benchmarks.

Standalone real-time WebGL/Three.js hero animation — 169 real crystal shard
fragments (cut from an actual shattered 3D render) streaming in from the
edges of the screen, colliding and locking together to reconstruct the
"KA" crystal logo, then sealing into the final polished mark.

## Run it locally

`index.html` is fully self-contained (all JS/CSS inlined, Three.js loaded
from a CDN) — you just need any local static file server, since opening it
directly via `file://` can be blocked by the browser for some asset loads.

**Option A — VS Code Live Server (easiest)**
1. Open this folder in VS Code (`code .`).
2. Install the "Live Server" extension (by Ritwick Dey) if you don't have it.
3. Right-click `index.html` → "Open with Live Server".
4. It opens at `http://127.0.0.1:5500` (or similar) in your browser.

**Option B — command line**
```
npx serve .
```
or
```
python -m http.server 8080
```
then open the printed localhost URL in your browser.

## Folder contents

- `index.html` — the current build (GOD MODE v8): shards enter from the
  screen's own edges, the core forms at true center first as nearby
  fragments collide and spark into place, the shape completes outward,
  then a sealed "fused shut" flash reveals the final polished crystal mark.
- `generator/` — the Python pipeline that BUILDS `index.html` from the raw
  shard data, kept here so future tweaks can be made and rebuilt:
  - `build_cinematic.py` — the older standalone demo generator; running it
    regenerates `ka-cinematic-demo.html`. Do not copy it over `index.html`.
    Requires `numpy`, `scipy`, and
    `Pillow` (`pip install numpy scipy pillow`).
  - `ka-shards-manifest2.json` — the 169 real shards' positions/sizes.
  - `ka-shards-atlas2-final.png` — the texture atlas (real photographed
    shard crops).
  - `logo-clean/cutout_intact_final.png` — the clean, intact "KA" render
    used for the final polished reveal.

To rebuild after editing `build_cinematic.py`:
```
cd generator
python build_cinematic.py
```
This writes the standalone `ka-cinematic-demo.html` next to it. Keep that output
separate from `../index.html` so the live KA page and its gallery integration remain intact.
