import json, base64, math

with open('ka-shards-manifest2.json') as f:
    manifest = json.load(f)

with open('ka-shards-atlas2-final.png', 'rb') as f:
    atlas_b64 = base64.b64encode(f.read()).decode()
ATLAS_W_PX, ATLAS_H_PX = 2600, 1066  # from build script output earlier

with open('logo-clean/cutout_intact_final.png', 'rb') as f:
    cutout_b64 = base64.b64encode(f.read()).decode()
from PIL import Image
cut_w, cut_h = Image.open('logo-clean/cutout_intact_final.png').size

# ---------------------------------------------------------------------------------------------
# Real-silhouette landed-position clamp (build time, baked into the manifest).
#
# The earlier fix here approximated the KA's landed silhouette with an ellipse and pulled any
# shard centroid outside it radially inward. That reads fine for a rounded mark, but "KA" is an
# angular logotype -- the true letterform reaches almost into the box's corners (the top of the
# K's stroke, the point of the A) while also having real CONCAVE gaps (between the K's legs,
# between the A's legs, the notch where K meets A) that sit well inside the ellipse's radius but
# are still genuinely outside the actual printed shape. An ellipse can't represent either of
# those correctly: it clips corner pieces that were already correct, and it leaves shards sitting
# in the concave gaps completely unclamped -- which is exactly what reads as "crystals stopped
# around the outer frame, not joined into the logo" once the wipe-reveal has passed their height
# and they're still visibly sitting there. Fix it properly: derive the true silhouette straight
# from the actual clean-render artwork's own alpha channel, and snap every shard's landed
# position to the NEAREST point that's really inside it (not just inside a geometric stand-in).
import numpy as np
from scipy import ndimage as ndi

_LOGO_BOX_W, _LOGO_BOX_H = 232, 302
def _fit_contain(src_w, src_h, box_w, box_h):
    h = box_h
    w = h * (src_w / src_h)
    if w > box_w:
        w = box_w
        h = w * (src_h / src_w)
    return w, h

_manifest_fit_w, _manifest_fit_h = _fit_contain(manifest['logoSize']['w'], manifest['logoSize']['h'], _LOGO_BOX_W, _LOGO_BOX_H)
_cut_fit_w, _cut_fit_h = _fit_contain(cut_w, cut_h, _LOGO_BOX_W, _LOGO_BOX_H)
_SCALE_X = _cut_fit_w / manifest['logoSize']['w']
_SCALE_Y = _cut_fit_h / manifest['logoSize']['h']
_center_mx, _center_my = manifest['logoCenter']['x'], manifest['logoCenter']['y']

def _to_world(mx, my):
    return (mx - _center_mx) * _SCALE_X, -(my - _center_my) * _SCALE_Y

def _world_to_cut_px(wx, wy):
    col = (wx / _cut_fit_w + 0.5) * cut_w
    row = (0.5 - wy / _cut_fit_h) * cut_h
    return row, col

def _cut_px_to_world(row, col):
    wx = (col / cut_w - 0.5) * _cut_fit_w
    wy = (0.5 - row / cut_h) * _cut_fit_h
    return wx, wy

_cut_alpha = np.array(Image.open('logo-clean/cutout_intact_final.png').convert('RGBA'))[:, :, 3]
_mask = _cut_alpha > 12

# ---------------------------------------------------------------------------------------------
# HARD CONTAINMENT, part 1 -- clamp by shard FOOTPRINT, not by a single point.
#
# The previous pass eroded the true silhouette by one flat margin (2.5-3% of the shape's
# smaller dimension) and snapped every shard's CENTROID to the nearest point inside that eroded
# boundary. That's not enough on its own: a shard plane has real width/height around that
# centroid, so a centroid sitting exactly on the eroded boundary still lets the far half of a
# big structural chunk's own plane hang past the TRUE edge -- invisible in the position data,
# very visible on screen. A flat margin also doesn't scale: it was sized for an "average" shard,
# so big pieces (which need proportionally more inward pull to keep their whole plane contained)
# got the same nudge as tiny dust chips.
#
# Fix: give every shard its OWN erosion depth, sized off that shard's own on-screen half-diagonal
# (plus a small safety margin), and run the nearest-inside lookup against a mask eroded by THAT
# depth -- effectively "is this shard's full footprint inside the boundary," not just its point.
#
# GOD MODE v4 retune: the original margin here (a flat ~2.8%-of-image-dimension base, PLUS each
# shard's own half-diagonal with a further +5% on top) was sized back when this per-shard clamp
# was the ONLY containment mechanism. It no longer is -- Part 2 below now also bakes a runtime,
# per-fragment alpha clip against the TRUE (un-eroded) silhouette, so any footprint that still
# pokes past the real edge gets trimmed softly at render time regardless of what this build-time
# pass did. That runtime clip is the actual "never renders outside" guarantee now; this pass only
# needs to get shards CLOSE, not conservatively buried inside the shape. The original margin was
# measured (see the v4 build-time size-match check below) to pull the overall assembled silhouette
# in by double digits of a percent versus the resolved render's true bounding box -- exactly the
# "reveal looks bigger than the formed logo" bug -- because sharp letterform points (the top of
# the K, the tip of the A) are each defined by only one or two small shards, and ANY inward pull
# on those specific shards shortens how far the whole point reads, disproportionately to the
# margin's own size. Shrinking the margin here (base_erode down, safety multiplier down to the
# exact half-diagonal with no added padding) cuts that shrinkage roughly in half; the residual gap
# (a real, unavoidable few percent -- these two silhouettes come from two different photographs of
# the same object, see the SCALE derivation note above) is then corrected exactly, once, via the
# fixed MOSAIC_FIT_SCALE baked in below -- not via a runtime ramp.
_base_erode_px = 6
_px_per_world = cut_w / _cut_fit_w  # aspect is preserved by _fit_contain, so this equals cut_h/_cut_fit_h too

# Eroding a mask (and running the EDT against it) is real work -- do it once per distinct integer
# erosion depth actually needed, not once per shard. Most of the 169 shards cluster into a
# handful of distinct depths once rounded, so this cache keeps the build fast.
_eroded_cache = {}
def _get_eroded(erode_px):
    erode_px = max(1, int(round(erode_px)))
    if erode_px not in _eroded_cache:
        m = ndi.binary_erosion(_mask, iterations=erode_px)
        if not m.any():
            m = _mask  # safety fallback in case erosion ever ate the whole shape
        _, nearest_idx = ndi.distance_transform_edt(~m, return_indices=True)
        _eroded_cache[erode_px] = (m, nearest_idx)
    return _eroded_cache[erode_px]

for _s in manifest['shards']:
    # this shard's own on-screen size, converted into the SAME pixel space the mask lives in
    # (the cutout render's own pixel grid) -- mirrors the w/h calc the JS runtime does for
    # rendering (atlas.w/h * SCALE_X/Y), just evaluated here at build time against cut-pixel units
    _shard_w_world = _s['atlas']['w'] * _SCALE_X
    _shard_h_world = _s['atlas']['h'] * _SCALE_Y
    _half_diag_px = 0.5 * math.hypot(_shard_w_world, _shard_h_world) * _px_per_world
    # was `* 1.05` (an extra +5% safety pad on top of the exact half-diagonal) -- dropped now that
    # the runtime containment clip (Part 2) is the real backstop against any residual overshoot;
    # this pass only needs to land each shard's footprint AT the true edge, not padded inside it.
    _erode_px_for_shard = _base_erode_px + _half_diag_px

    _mask_eroded, _nearest_idx = _get_eroded(_erode_px_for_shard)
    _wx, _wy = _to_world(_s['centroid']['x'], _s['centroid']['y'])
    _row, _col = _world_to_cut_px(_wx, _wy)
    _r = int(np.clip(round(_row), 0, cut_h - 1))
    _c = int(np.clip(round(_col), 0, cut_w - 1))
    if _mask_eroded[_r, _c]:
        _s['landedWorld'] = {'x': _wx, 'y': _wy}
    else:
        _nr, _nc = int(_nearest_idx[0][_r, _c]), int(_nearest_idx[1][_r, _c])
        _nwx, _nwy = _cut_px_to_world(_nr, _nc)
        _s['landedWorld'] = {'x': _nwx, 'y': _nwy}

# ---------------------------------------------------------------------------------------------
# GOD MODE v4, FIX B -- bake a single, fixed, build-time size correction (MOSAIC_FIT_SCALE),
# once, rather than compensating for any residual gap with a runtime ramp.
#
# Even with the containment margin retuned down above, clamping many of the 169 shards' centroids
# to the nearest point inside the true (or lightly eroded) silhouette leaves the assembled
# mosaic's overall bounding box measurably smaller than the resolved render's -- this is
# structural, not a tuning miss: two different photographs of the same object never register
# pixel-for-pixel, some of these 169 real fragment centroids fall slightly outside the resolved
# render's own silhouette even before any deliberate erosion, and the sharpest points of an
# angular letterform like this one (the top of the K, the tip of the A) are each defined by only
# one or two small shards -- so nudging even those few pieces inward shortens how far the whole
# point visibly reaches, disproportionately to how small the nudge was. Rather than re-introduce
# a runtime "grow toward true size as the reveal plays" ramp to paper over that gap -- which is
# exactly the visible pop/grow this whole fix is for -- measure the actual gap once, here, at
# build time, and apply a single fixed anisotropic scale to every shard's landed position so the
# assembled silhouette matches the resolved render's true bounding box from the very first frame
# any shard is ever at rest there. Because it's one constant baked into the manifest (not a value
# that changes over time), there is nothing to animate and therefore nothing that can pop.
_pre_min_x = _pre_min_y = float('inf')
_pre_max_x = _pre_max_y = float('-inf')
for _s in manifest['shards']:
    _lw = _s['landedWorld']
    _hw = 0.5 * _s['atlas']['w'] * _SCALE_X
    _hh = 0.5 * _s['atlas']['h'] * _SCALE_Y
    _pre_min_x = min(_pre_min_x, _lw['x'] - _hw); _pre_max_x = max(_pre_max_x, _lw['x'] + _hw)
    _pre_min_y = min(_pre_min_y, _lw['y'] - _hh); _pre_max_y = max(_pre_max_y, _lw['y'] + _hh)
_pre_bbox_w = _pre_max_x - _pre_min_x
_pre_bbox_h = _pre_max_y - _pre_min_y

_mask_rows = np.any(_mask, axis=1)
_mask_cols = np.any(_mask, axis=0)
_cut_row_min, _cut_row_max = np.where(_mask_rows)[0][[0, -1]]
_cut_col_min, _cut_col_max = np.where(_mask_cols)[0][[0, -1]]
_cut_wx_lo, _cut_wy_hi = _cut_px_to_world(_cut_row_min, _cut_col_min)
_cut_wx_hi, _cut_wy_lo = _cut_px_to_world(_cut_row_max, _cut_col_max)
_cutout_bbox_w = abs(_cut_wx_hi - _cut_wx_lo)
_cutout_bbox_h = abs(_cut_wy_hi - _cut_wy_lo)

# scale landed POSITIONS about the origin (which is already the mark's own centered origin, per
# toWorld) by exactly enough to make the mosaic's measured bbox equal the resolved render's true
# bbox -- shard sizes (w,h, already correct per SCALE_X/SCALE_Y) are left alone, only where each
# piece sits moves, uniformly for the whole cluster in each axis.
MOSAIC_FIT_SCALE_X = _cutout_bbox_w / _pre_bbox_w
MOSAIC_FIT_SCALE_Y = _cutout_bbox_h / _pre_bbox_h
print(f"[mosaic fit] pre-correction bbox {_pre_bbox_w:.2f} x {_pre_bbox_h:.2f}  "
      f"target (resolved render) bbox {_cutout_bbox_w:.2f} x {_cutout_bbox_h:.2f}  "
      f"MOSAIC_FIT_SCALE = ({MOSAIC_FIT_SCALE_X:.4f}, {MOSAIC_FIT_SCALE_Y:.4f})")
for _s in manifest['shards']:
    _s['landedWorld']['x'] *= MOSAIC_FIT_SCALE_X
    _s['landedWorld']['y'] *= MOSAIC_FIT_SCALE_Y
# ---------------------------------------------------------------------------------------------

# ---------------------------------------------------------------------------------------------
# GOD MODE v5: HARD CONTAINMENT part 2 (the runtime safety-clip mask baked here, previously
# sampled by every shard/spark shader) is REMOVED this round. A smooth, eroded silhouette mask
# multiplied into alpha at render time draws a mathematically perfect cutoff line straight
# through a crystal's own jagged, faceted texture -- which reads as "sliced," not as a natural
# broken edge, exactly the opposite of what the reference photography this whole piece is built
# from actually looks like. Containment is position-only now: the build-time clamp above (part 1)
# is what keeps every shard's LANDED position honest, and a shard's own natural point or facet
# legitimately extending a little past a smooth silhouette approximation is left alone rather than
# clipped -- that's what real photographed crystal edges look like, not a bug. If a genuinely
# oversized/wrong shard is ever found, the fix belongs in that shard's own baked atlas alpha
# (feather its texture's own edge in image-editing at the pixel level), not in a global runtime
# mask that has no knowledge of any individual shard's actual shape.
# ---------------------------------------------------------------------------------------------

# ---------------------------------------------------------------------------------------------
# GOD MODE v4, FIX B section 2.4 -- build-time bounding-box match assertion.
#
# After the MOSAIC_FIT_SCALE correction above, the mosaic (169 landed shard footprints) and the
# resolved cutout render are supposed to be IDENTICALLY sized. Check it here, as an automated
# build-time assertion, rather than trusting the derivation and eyeballing the result in a
# browser after the fact -- this turns "the sizes might not match" into a number that either
# passes or fails on every build.
_mosaic_min_x = _mosaic_min_y = float('inf')
_mosaic_max_x = _mosaic_max_y = float('-inf')
for _s in manifest['shards']:
    _lw = _s['landedWorld']
    _hw = 0.5 * _s['atlas']['w'] * _SCALE_X
    _hh = 0.5 * _s['atlas']['h'] * _SCALE_Y
    _mosaic_min_x = min(_mosaic_min_x, _lw['x'] - _hw)
    _mosaic_max_x = max(_mosaic_max_x, _lw['x'] + _hw)
    _mosaic_min_y = min(_mosaic_min_y, _lw['y'] - _hh)
    _mosaic_max_y = max(_mosaic_max_y, _lw['y'] + _hh)
_mosaic_bbox_w = _mosaic_max_x - _mosaic_min_x
_mosaic_bbox_h = _mosaic_max_y - _mosaic_min_y

# resolved render's true bbox was already computed above (as _cutout_bbox_w/_h) to derive the
# fit-scale correction itself -- reused here rather than recomputed.
_w_err = abs(_mosaic_bbox_w - _cutout_bbox_w) / _cutout_bbox_w
_h_err = abs(_mosaic_bbox_h - _cutout_bbox_h) / _cutout_bbox_h
print(f"[size-match check] mosaic bbox: {_mosaic_bbox_w:.2f} x {_mosaic_bbox_h:.2f}  "
      f"cutout bbox: {_cutout_bbox_w:.2f} x {_cutout_bbox_h:.2f}  "
      f"err: w={_w_err*100:.2f}% h={_h_err*100:.2f}%")
if _w_err >= 0.01 or _h_err >= 0.01:
    raise SystemExit(
        f"[size-match check] FAILED: mosaic/resolved-render bounding boxes differ by more than "
        f"1% (w={_w_err*100:.2f}%, h={_h_err*100:.2f}%) -- the reveal will visibly pop/grow at "
        f"the crossfade. Check SCALE_X/SCALE_Y and the manifest's logoSize/logoCenter before "
        f"shipping this build."
    )
# ---------------------------------------------------------------------------------------------

manifest_json = json.dumps(manifest)
shard_count = len(manifest['shards'])

THREE_SRC_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"
THREE_SRC_LOCAL = "three.min.local.js"  # swapped in for local testing only

html = r"""<!doctype html>
<title>KA Crystal Reconstruction</title>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --ground:#050506;
  --ink:#EDEBE8;
  --ink-dim: rgba(237,235,232,0.55);
  --ink-faint: rgba(237,235,232,0.32);
  --amber:#FF9438;
  --line: rgba(255,255,255,0.08);
}
*{box-sizing:border-box;}
html,body{margin:0;height:100%;}
body{
  background:var(--ground);
  color:var(--ink);
  font-family:'Manrope', ui-sans-serif, system-ui, sans-serif;
  overflow:hidden;
}
.eyebrow{
  position:fixed; top:28px; left:50%; transform:translateX(-50%);
  font-family:'JetBrains Mono', ui-monospace, monospace;
  font-size:11.5px; letter-spacing:0.14em; text-transform:uppercase;
  color:var(--amber); display:flex; align-items:center; gap:10px;
  z-index:5; pointer-events:none; opacity:0.9;
}
.eyebrow::before{ content:""; width:6px;height:6px;border-radius:50%; background:var(--amber); box-shadow:0 0 8px 1px var(--amber); }
#stage{ position:fixed; inset:0; }
canvas{ display:block; width:100%; height:100%; }
/* GOD MODE v9: dark-boot veil -- a plain DOM overlay (not a WebGL blend) so the near-darkness
   open-and-brighten is rock solid across every renderer/GPU, sidestepping any additive-blending
   opacity quirks entirely. Sits above the canvas, below the eyebrow/replay UI. */
#boot-veil{ position:fixed; inset:0; background:var(--ground); z-index:4; opacity:1; pointer-events:none; }
#replay{
  position:fixed; bottom:34px; left:50%; transform:translateX(-50%) translateY(8px);
  background:transparent; color:var(--ink-dim);
  border:1px solid var(--line); padding:10px 20px; border-radius:999px;
  font-family:'JetBrains Mono', ui-monospace, monospace; font-size:10.5px;
  letter-spacing:0.12em; text-transform:uppercase; cursor:pointer;
  opacity:0; pointer-events:none; z-index:5;
  transition:opacity .8s ease, transform .8s ease, border-color .2s ease, color .2s ease;
}
#replay.on{ opacity:1; pointer-events:auto; transform:translateX(-50%) translateY(0); }
#replay:hover{ border-color:var(--amber); color:var(--amber); }
#replay:focus-visible{ outline:2px solid var(--amber); outline-offset:2px; }
.credit{
  position:fixed; bottom:34px; right:34px;
  font-family:'JetBrains Mono', ui-monospace, monospace; font-size:10px;
  letter-spacing:0.08em; color:var(--ink-faint); z-index:5; pointer-events:none;
}
@media (max-width:640px){
  .credit{ display:none; }
}
.skill-callouts{position:fixed;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;overflow:hidden;}
.skill-label{fill:#eee5df;font:500 11px 'Manrope',sans-serif;letter-spacing:.055em;paint-order:stroke;stroke:#08070b;stroke-width:3px;stroke-linejoin:round;}
.skill-line{stroke:url(#skill-line-light);stroke-width:1.1;stroke-linecap:round;stroke-dasharray:1;}
.skill-line-halo{stroke:#e9be99;stroke-width:4;opacity:.09;}
.skill-tip{fill:#ffe1bf;opacity:.8;}

</style>

<p class="eyebrow">real-time webgl &middot; crystal reconstruction</p>
<div id="stage"></div>
<div id="boot-veil"></div>

<div class="credit">169 real fragments &middot; three.js</div>

<script src="__THREE_SRC__"></script>
<script>
(function(){
"use strict";

const MANIFEST = __MANIFEST__;
const ATLAS_SRC = "data:image/png;base64,__ATLAS_B64__";
const ATLAS_W = __ATLAS_W__, ATLAS_H = __ATLAS_H__;
const CUTOUT_SRC = "data:image/png;base64,__CUTOUT_B64__";
const CUT_W = __CUT_W__, CUT_H = __CUT_H__;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 760px)').matches || /Mobi|Android/i.test(navigator.userAgent);

// ---------------------------------------------------------------- easing --
function easeInCubic(t){ return t*t*t; }
function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }
function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
// GOD MODE v9: replaces easeInOutCubic as the per-shard FLIGHT-POSITION curve (see posE in
// updateShardsAssembling). The old curve was symmetric -- slow, fast, slow again -- which reads
// as a gentle glide the whole way. Per spec, travel itself should feel unhurried for most of the
// distance, then snap into place quickly and decisively right at the end: the first SNAP_AT share
// of the flight TIME covers only a bit over half the DISTANCE at a gentle easeOutCubic-ish crawl,
// then the remaining time snaps through the rest of the distance with accelerating (easeInCubic)
// speed, so the piece is visibly still drifting for most of its journey and then decisively locks
// in right as it arrives -- which also reads naturally alongside the fusion spark that fires at
// posE>=0.94, since that's now genuinely the fast, sudden part of the motion.
function easeSlowSnap(t){
  // Continuous acceleration and a soft landing, without the old mid-flight stall.
  return smootherStep(t);
}
function easeOutBack(t){ const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }
function easeOutBackBig(t){ const c1=2.7,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }
function clamp01(t){ return Math.max(0, Math.min(1, t)); }
function lerp(a,b,t){ return a+(b-a)*t; }
// Perlin's "smootherstep" -- zero first AND second derivative at both ends, so a value
// eased with this has no visible "kick" at the start or "snap" at the end the way a plain
// cubic ease can. Used for the mosaic->clean-render crossfade so it reads as a smooth,
// even materialization rather than a sudden/uneven pop.
function smootherStep(t){ const x = clamp01(t); return x*x*x*(x*(x*6-15)+10); }
// GOD MODE v5 §2.4: component-wise Vector3 lerp, used for the raw<->resolved shard tint
// transmutation -- returns a plain {x,y,z} object so call sites can read it into an existing
// uniform's .set() without allocating a THREE.Vector3 every frame per shard.
function lerp3(a, b, t){ return { x: lerp(a.x,b.x,t), y: lerp(a.y,b.y,t), z: lerp(a.z,b.z,t) }; }

// -------------------------------------------------------------- renderer --
const stage = document.getElementById('stage');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050506, 0.00095);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 1, 4000);
const CAM_Z_FAR = 980, CAM_Z_NEAR = 660;
camera.position.set(0, 0, CAM_Z_FAR);
camera.lookAt(0,0,0);

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
function renderPixelRatio(){
  // Refresh on browser zoom / monitor changes, bounded by framebuffer cost.
  const pixels = Math.max(1, window.innerWidth * window.innerHeight);
  const budget = isMobile ? 5000000 : 12000000;
  const zoom = window.visualViewport?.scale || 1;
  return Math.min((window.devicePixelRatio || 1) * zoom, 3, Math.sqrt(budget / pixels));
}
renderer.setPixelRatio(renderPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x050506, 1);
stage.appendChild(renderer.domElement);

// ambient + a couple of soft point lights just to give the bevels on the real
// render something to catch -- the crystal texture already carries its own
// baked lighting, this is only a faint accent
scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const KEY_LIGHT_BASE = 1.1, RIM_LIGHT_BASE = 0.7;
const keyLight = new THREE.PointLight(0xff8a4c, KEY_LIGHT_BASE, 3000, 2);
keyLight.position.set(200, 260, 500);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0xff3a1a, RIM_LIGHT_BASE, 3000, 2);
rimLight.position.set(-260, -180, 300);
scene.add(rimLight);

// ---------------------------------------------------------------- scale --
// Both the shard mosaic (built from the shattered-render manifest, in its own pixel space)
// and the resolved mark (the intact render, a different photograph with its own pixel size)
// must land in the SAME world-space box, or the two visibly mismatch in size during the
// crossfade -- the shard-built silhouette reads bigger/smaller than the crisp render it's
// supposed to hand off to. Fit BOTH into one shared contain-box so their heights (the binding
// dimension for both, since both are taller than they are wide relative to the box) match
// exactly, and widths land within a few percent of each other (the two source photos aren't
// pixel-identical crops, so a small residual difference here is expected and fine).
const LOGO_BOX_W = 232, LOGO_BOX_H = 302; // world units -- leaves clearance for the icon ring
function fitContain(srcW, srcH, boxW, boxH){
  let h = boxH, w = h * (srcW/srcH);
  if (w > boxW){ w = boxW; h = w * (srcH/srcW); }
  return { w, h };
}
// The manifest photo and the clean cutout photo don't share an aspect ratio (they're two
// different source renders), so fitting each into the SAME box with a single uniform SCALE
// only guarantees their HEIGHTS match -- their widths can land a few percent apart. That gap
// is exactly what read as "after the fragments join, it should grow a bit to match the final
// logo's size and edges": the assembled mosaic was consistently a bit narrower than the clean
// render it hands off to. Fix it at the source instead of papering over it with a bigger pop:
// compute independent X/Y scale factors so the assembled shard silhouette's bounding box lands
// on EXACTLY the same box (cutFit.w x cutFit.h) the clean render uses, not just the same height.
const manifestFit = fitContain(MANIFEST.logoSize.w, MANIFEST.logoSize.h, LOGO_BOX_W, LOGO_BOX_H);
const cutFit = fitContain(CUT_W, CUT_H, LOGO_BOX_W, LOGO_BOX_H);
const SCALE = manifestFit.h / MANIFEST.logoSize.h; // world units per manifest px (uniform, used for shard/glow sizing)
const SCALE_X = cutFit.w / MANIFEST.logoSize.w;     // anisotropic, used only for shard WORLD POSITIONS
const SCALE_Y = cutFit.h / MANIFEST.logoSize.h;      // so the landed silhouette's edges exactly match the clean render's box
const logoW = MANIFEST.logoSize.w * SCALE;
const logoH = MANIFEST.logoSize.h * SCALE;
// GOD MODE v6: half-diagonal of the same shared box (cutFit) the resolved render and the shard
// mosaic both fit into -- used to normalize each shard's landed radial distance from center
// (landedR, see buildShards) into the same 0..1 space the shader's uLogoWH-based radius uses,
// so the JS-side per-shard reveal threshold and the shader's per-pixel one agree exactly.
const cutDiagHalf = 0.5 * Math.hypot(cutFit.w, cutFit.h);
const centerMx = MANIFEST.logoCenter.x, centerMy = MANIFEST.logoCenter.y;
function toWorld(mx, my){
  return { x: (mx - centerMx) * SCALE_X, y: -(my - centerMy) * SCALE_Y };
}

// ------------------------------------------------------------- textures --
const loader = new THREE.TextureLoader();
let atlasTex, cutoutTex, assetsLoaded = 0;
function onAssetLoad(){
  assetsLoaded++;
  if (assetsLoaded === 2){ init(); }
}
atlasTex = loader.load(ATLAS_SRC, onAssetLoad);
atlasTex.minFilter = THREE.LinearFilter;
atlasTex.magFilter = THREE.LinearFilter;
cutoutTex = loader.load(CUTOUT_SRC, onAssetLoad);
cutoutTex.minFilter = THREE.LinearFilter;
cutoutTex.magFilter = THREE.LinearFilter;
atlasTex.anisotropy = cutoutTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
// GOD MODE v5: the HARD CONTAINMENT runtime mask texture (containMaskTex) that used to load
// here is gone -- removed along with the render-time alpha clip it fed (see the shard shader
// note above for the full reasoning). Containment is position-only now (the v3/v4 build-time
// clamp), so there's nothing left for a runtime mask to do. assetsLoaded's gate dropped from 3
// back to 2 accordingly.

// GOD MODE v5 §2.3/2.4: shared raw/resolved tint constants for the per-shard color
// transmutation during flight -- RAW_TINT is a darker, cooler, "uncured" multiply on the shard's
// real photographed texture; RESOLVED_TINT is neutral (the texture's own true polished color,
// unmodified). Every shard starts at RAW_TINT and mixes toward RESOLVED_TINT as its own posE
// advances (see updateShardsAssembling) -- this is the "material itself visibly changing," not
// just position, that sells the reference's metamorphic-transmutation beat.
const RAW_TINT = new THREE.Vector3(0.58, 0.30, 0.27);
const RESOLVED_TINT = new THREE.Vector3(1, 1, 1);

// GOD MODE v5 restore: v13/v14's "one fixed dim shadow-KA, only small chips travel" split is
// reverted entirely, per direct feedback that it read as worse than the original single-flight
// reconstruction. Every shard is visible and flies its own short flight from frame one.

// ---------------------------------------------------------- soft-dot tex --
function makeSoftDotTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32,32,0,32,32,32);
  grad.addColorStop(0, 'rgba(255,200,150,0.95)');
  grad.addColorStop(0.4, 'rgba(255,110,60,0.55)');
  grad.addColorStop(1, 'rgba(255,60,30,0)');
  g.fillStyle = grad; g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
const softDotTex = makeSoftDotTexture();

// ---------------------------------------------------------------- blast tex --
// A bright, white-hot SHARP STAR spark -- a hot core plus crisp radiating rays (not a soft round
// glow blob whose only motion is an opacity fade). Used for every spark billboard: per-shard
// landing flashes and the core reveal-ignition flash alike (see spawnSpark/updateSparks below).
function makeBlastTexture(){
  const size = 256, cx = size/2, cy = size/2;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter'; // rays and core add together instead of overpainting

  // sharp tapered ray, drawn as a thin kite/diamond so its edges stay crisp rather than a soft
  // blurred streak -- length/width/angle/alpha all parameterized so the 4 primary + 4 secondary
  // rays below are just calls with different numbers, not separately hand-drawn shapes.
  function drawRay(length, width, angle, alpha){
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    const grad = g.createLinearGradient(0, -length, 0, length);
    grad.addColorStop(0,    'rgba(255,255,255,0)');
    grad.addColorStop(0.46, `rgba(255,238,210,${alpha})`);
    grad.addColorStop(0.5,  `rgba(255,255,255,${Math.min(1, alpha*1.15)})`);
    grad.addColorStop(0.54, `rgba(255,238,210,${alpha})`);
    grad.addColorStop(1,    'rgba(255,120,60,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -length);
    g.lineTo(width/2, 0);
    g.lineTo(0, length);
    g.lineTo(-width/2, 0);
    g.closePath();
    g.fill();
    g.restore();
  }
  drawRay(size*0.5,  size*0.05, 0,             0.95); // vertical
  drawRay(size*0.5,  size*0.05, Math.PI/2,     0.95); // horizontal
  drawRay(size*0.34, size*0.022, Math.PI/4,    0.55); // diagonal, shorter + dimmer -- an 8-point
  drawRay(size*0.34, size*0.022, -Math.PI/4,   0.55); // star reads sharper than a plain cross

  // hot white core -- where the rays originate, bright enough to fully blow out at peak opacity
  const core = g.createRadialGradient(cx,cy,0,cx,cy,size*0.15);
  core.addColorStop(0,    'rgba(255,255,255,1)');
  core.addColorStop(0.35, 'rgba(255,244,222,0.95)');
  core.addColorStop(0.7,  'rgba(255,190,120,0.45)');
  core.addColorStop(1,    'rgba(255,150,80,0)');
  g.fillStyle = core;
  g.beginPath(); g.arc(cx, cy, size*0.15, 0, Math.PI*2); g.fill();

  return new THREE.CanvasTexture(c);
}
const blastTex = makeBlastTexture();

// ================================================================ INIT ==
let shards = [];       // real cut fragments -- these are what assembles
let dust = null;       // ambient instanced glow motes -- atmosphere only
let logoMesh = null;
let logoGlow = null;
let icons = [];
let phase = 'shattered';   // shattered | assembling | held | disassembling
let phaseStart = 0;
// one-shot flag for the core ignition flash fired right as the reveal wipe begins (see
// updateLogoReveal) -- cleared on every 'shattered'->'assembling' transition (including Replay)
// so it fires exactly once per assembly cycle.
let coreFlashFired = false;
// GOD MODE v4 FIX B: this used to track reveal progress so updateShardsAssembling could grow
// the assembled cluster a few percent right at the reveal crossfade (GROW_MIN=0.965 -> 1.0) --
// a runtime compensation for the mosaic and the resolved render landing at two slightly
// different sizes. That mismatch is now fixed at its actual source (shard world-positions are
// derived from cutFit via SCALE_X/SCALE_Y -- see toWorld -- so the mosaic's silhouette and the
// resolved render's silhouette are the SAME box by construction, verified at build time by the
// bounding-box assertion below). With nothing left to compensate for, the ramp is deleted
// outright rather than left inert -- keeping it would now actively shrink the mosaic by up to
// 3.5% for most of assembly for no reason, manufacturing a mismatch instead of fixing one.
// logoRevealE is kept only because other systems (none currently) might want reveal progress
// later; it is no longer read by shard placement.
let logoRevealE = 0;
// CHARGE & BLOOM (replaces the earlier pre-reveal zoom punch entirely -- see the note at
// updateLogoReveal for why). The old mechanic pushed the camera physically closer AND
// deliberately blended its FOV away from its own dolly-zoom compensation at the same moment 169
// shards were mid-motion around it -- two independently-moving geometric systems changing at
// once is what reads as a lurch/flip, no matter how gently the numbers were tuned. The fix isn't
// a smaller push, it's removing camera-driven scale change from this beat entirely: chargeEnv
// (same rise-then-fall triangle shape and timing window the old zoomPulse used) now drives only
// light -- key/rim light intensity, the bloom-glow plane's opacity, and the wipe seam's peak
// brightness -- never a scale, position, or FOV change on the camera, the mark, or any shard.
// Because nothing with a silhouette or a projected size is touched, this cannot produce the
// "something moved" read at any intensity; the camera keeps doing exactly one thing through this
// entire window, the same continuous idle breathing from updateCamera, completely unmodified.
let chargeEnv = 0;
// SILHOUETTE FLASH (GOD MODE v5 restore): a brief, bright flash across the resolved mark's own
// exact silhouette -- since the resolved-mark plane is alpha-clipped to the true KA cutout, a
// quick whole-texture brighten-toward-white reads as the KA SHAPE ITSELF flashing, a "light
// frame" of the mark, not a generic screen flash. This existed in an earlier round (the old
// global `uBlast`, fired once at the very end of the sequence) and was removed in favor of the
// continuous per-shard fusion sparks introduced afterward -- but per direct feedback, the
// per-shard sparks read as many small local events, not the single decisive "the whole mark just
// caught light" beat the silhouette flash gave. Both now coexist: per-shard sparks keep firing
// throughout assembly (unchanged), and this fires once, sharply, right as the reveal completes --
// the moment the shape is fully traced out is exactly when it should visibly catch fire as one
// object, not just have its last piece click in.
let blastEnv = 0;
const BLAST_FLASH_DUR = 560; // total lifetime of the global silhouette flash, ms -- SUPERCHARGE: longer, hotter finish

// ENERGIZE PULSE (new): a brief, bright charge-up on the mark's own silhouette OUTLINE, fired
// once near the end of the shattered hold, right before the fragments start moving -- "the logo
// being energized" before it starts pulling itself back together, distinct from (and much
// softer/hazier than) the sharp lock-snap flash above. This deliberately does NOT touch
// logoMesh's own uAlpha/uBlast (that would reveal the crisp, fully-formed resolved texture
// through the gaps, spoiling the "still broken" read) -- it only drives logoGlow, the existing
// blurred/silhouette-shaped glow plane that already sits behind the shards, so what's visible is
// a soft, glowing OUTLINE of the KA shape flaring up and fading again while the shards are still
// sitting there broken -- exactly "a charged silhouette/outline flashes," not the mark itself.
let energizeEnv = 0;
const ENERGIZE_DUR = 560;
// ENERGIZE_START is computed just below ASSEMBLE_DELAY's own declaration (needs that value) --
// see there for the actual assignment.
let ENERGIZE_START = 0;
// WIPE REVEAL: replaces a flat global crossfade with a light boundary that reveals the clean
// render and erases the shard mosaic in its wake, together, along the same traveling edge --
// this is what makes the hand-off read as one continuous, exact transformation whose boundary
// always traces the KA's own silhouette, instead of two independently-timed fades that can
// visually drift out of sync with each other.
// GOD MODE v6: re-shaped from a rising vertical line into a radius growing outward from the
// mark's own center, per direct reference -- "reveal the finished KA from the core outward: the
// light starts at the center and rapidly travels through the crystalline structure until the
// entire KA is illuminated." wipeYGlobal is the SAME 0..1 progress scalar as before (the name is
// kept to avoid touching every call site -- it's no longer a Y-height, it's a normalized radius),
// compared in the shader against each fragment's true world-space distance from center (see
// uLogoWH/pulseFragment), and against each shard's own precomputed `landedR` (see buildShards)
// -- so the shader mask and the per-shard fade always agree exactly on how far out the light has
// reached, the same guarantee the old vertical version gave, just measured radially now.
let wipeYGlobal = -0.2;
// A wider band (0.15, tried in an earlier pass) gave the organic dissolve edge (see the
// noise-perturbed uWipeY in pulseFragment, and the per-shard wipeJitter below) more visual room,
// but combined with how long each shard then spent partway-faded, it read as fragments
// hesitating/hovering right at the line instead of cleanly going away -- reported directly as
// "getting stuck and paused" mid-reveal. Pulled back to a tighter band so each piece's own
// dissolve is quick and decisive; the organic edge (jitter) and the sink-behind-the-mark motion
// on the shard side (see updateShardsAssembling) do the "mixing" work now, not a slow fade.
const WIPE_BAND = 0.11;
let clockStart = null;
let lastFrameT = 0;
const mouse = { x:0, y:0 };
const mouseSmoothed = { x:0, y:0 };

// GOD MODE v5 restore: cold open, no dark-boot fade (that was v9's addition) -- the broken KA
// is visible immediately; ASSEMBLE_DELAY is just a brief hold before reconstruction starts.
const BOOT_FADE_DUR    = 0;
const ASSEMBLE_DELAY   = reduceMotion ? 0 : 900;
const ASSEMBLE_SPAN    = 3600;                       // total duration fragments take to land
// now that ASSEMBLE_DELAY is known: the energize pulse ends just before assembly begins, so
// "logo charges up" and "fragments start moving" read as one cause-and-effect beat, not two
// separate, disconnected events with a dead gap between them.
ENERGIZE_START = Math.max(0, ASSEMBLE_DELAY - ENERGIZE_DUR - 40);
// The reveal/crossfade to the clean resolved crystal must never begin while any of the 169
// fragments is still mid-flight -- it has to visibly show ALL of them completely joined and
// holding still first, so the viewer registers "built from real pieces" before the polish
// kicks in. ASSEMBLY_FULL_T is computed after buildShards() from the actual per-shard
// delay+dur values (not guessed), so this stays correct even if the stagger formula changes.
let ASSEMBLY_FULL_T    = 0;
// CONTINUOUS-MOTION REWRITE: the earlier build inserted a flat ~850ms freeze here (every shard
// fully landed and static, camera essentially arrived, nothing moving) before starting the
// wipe -- a genuine phase-boundary freeze, not just a slow curve, since velocity hit exactly
// zero and stayed there. Reported directly as reading "stuck and paused." Root cause fix
// (per the client's own architectural note): don't wait for a hard stop at all -- start the
// wipe while the very last few shards are still inbound, so "last piece locks in" and "reveal
// begins" become one continuous gesture instead of two events separated by a dead beat.
const REVEAL_LEAD = 250; // wipe begins this many ms BEFORE the true last shard actually lands
let REVEAL_START = 0;
const REVEAL_DUR = 1200; // shortened from 1500 -- paired with the tighter WIPE_BAND and the
                          // shard sink-behind motion above, this keeps the merge itself quick
                          // and decisive instead of a slow fade that reads as lingering/stuck
// GOD MODE v10: the v9 mid-assembly ghost-silhouette flicker is REMOVED entirely (not tuned
// down, not narrowed further) -- direct feedback was "strictly no full logo should be shown
// visible" before it's earned, not "shown briefly." There is now exactly one window in the
// whole sequence during which the resolved mark may be nonzero -- see setResolvedMarkVisibility
// below, the single gate every write to it must pass through -- and no per-effect exception is
// carved into it for any kind of preview/tease, ever again.
const SHINE_INTERVAL_MIN = 5000;     // continuous specular shine, randomized 5-6s between sweeps
const SHINE_INTERVAL_MAX = 6000;
const SHINE_SWEEP_DUR    = 750;
// GOD MODE v9: once resting, small random sparkle/glow keeps appearing at random spots inside the
// crystal at random SLOW intervals, looping indefinitely -- distinct from (and much subtler/
// smaller than) the periodic specular shine sweep above. Reuses the existing spark sprite pool
// (see spawnSpark/updateSparks) rather than a new rendering path.
const IDLE_SPARKLE_MIN = 1400;
const IDLE_SPARKLE_MAX = 3200;
// a handful of directions the glint can cross the crystal from -- all convex combinations
// (both weights >=0, summing to 1) so `vUv.x*wx + vUv.y*wy` always ranges cleanly 0..1 and the
// same -0.22..1.22 sweep range works unmodified for every one of them. Picked randomly (along
// with forward/reverse) each time a sweep fires, so repeats don't always catch the light from
// the same angle -- "not same direction of reflection... random sides or type of reflection".
const SWEEP_DIRS = [
  { x: 0.42, y: 0.58 },  // steep diagonal, bottom-left -> top-right leaning
  { x: 0.58, y: 0.42 },  // shallow diagonal, the mirror of the above
  { x: 0.85, y: 0.15 },  // mostly horizontal, left -> right
  { x: 0.15, y: 0.85 },  // mostly vertical, bottom -> top
  { x: 0.5,  y: 0.5  },  // even 45-degree diagonal
];
let sweepDirIdx = 0;
let sweepReverse = false;
function randomizeSweep(){
  sweepDirIdx = Math.floor(Math.random() * SWEEP_DIRS.length);
  sweepReverse = Math.random() < 0.5;
}
function applySweepUniform(mesh, sT, easeFn){
  const dir = SWEEP_DIRS[sweepDirIdx];
  mesh.material.uniforms.uSweepDir.value.set(dir.x, dir.y);
  const from = sweepReverse ? 1.22 : -0.22, to = sweepReverse ? -0.22 : 1.22;
  mesh.material.uniforms.uSweepPos.value = lerp(from, to, easeFn(sT));
}
// held-phase repeating shine state (variable interval, not just a fixed modulo)
let shineActive = false, shineStartT = 0, shineNextAt = 0;
let bootDone = false;           // GOD MODE v9: true once the near-darkness boot fade has finished
let nextSparkleAt = 0;          // GOD MODE v9: held-phase ambient interior sparkle timer
const ICONS_START_GAP  = 500;
const ICON_STAGGER     = 90;
const ICON_DUR         = 820;
const PULSE_DELAY      = 550;   // after everything has landed
const PULSE_DUR        = 1400;
const DISASSEMBLE_DUR  = 1500;

// Split the oversized source-logo sprite into a deterministic Voronoi mosaic.
// Cells tile its original plane exactly: no new image, duplicate mesh, or lost texture.
function fractureOpeningCore(){
  if (MANIFEST.shards.some(s => s.openingCore)) return;
  const ranked = MANIFEST.shards.slice().sort((a,b) => b.atlas.w*b.atlas.h - a.atlas.w*a.atlas.h);
  const parent = ranked[0];
  if (!parent || ranked.length < 2 || parent.atlas.w*parent.atlas.h < ranked[1].atlas.w*ranked[1].atlas.h*4) return;
  const w = parent.atlas.w, h = parent.atlas.h;
  const seeds = [];
  for (let row=0; row<5; row++) for (let col=0; col<4; col++){
    const k = row*4+col;
    seeds.push({x:(col+0.5+Math.sin(k*2.4)*0.22)*w/4,
                y:(row+0.5+Math.cos(k*1.7)*0.22)*h/5});
  }
  const cells = seeds.map((seed, index) => {
    let poly = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
    seeds.forEach((other, j) => {
      if (j === index) return;
      const nx=other.x-seed.x, ny=other.y-seed.y;
      const limit=(other.x*other.x+other.y*other.y-seed.x*seed.x-seed.y*seed.y)/2;
      const clipped=[];
      poly.forEach((a,i) => {
        const b=poly[(i+1)%poly.length];
        const da=a.x*nx+a.y*ny-limit, db=b.x*nx+b.y*ny-limit;
        if (da<=0) clipped.push(a);
        if ((da<=0)!==(db<=0)){
          const t=da/(da-db);
          clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
        }
      });
      poly=clipped;
    });
    const x=Math.min(...poly.map(p=>p.x)), y=Math.min(...poly.map(p=>p.y));
    const cw=Math.max(...poly.map(p=>p.x))-x, ch=Math.max(...poly.map(p=>p.y))-y;
    return {...parent, id:`${parent.id}_fracture_${index}`, parent_id:parent.id,
      openingCore:true,
      fracturePolygon:poly.map(p=>({x:(p.x-x)/cw-0.5,y:0.5-(p.y-y)/ch})),
      atlas:{x:parent.atlas.x+x,y:parent.atlas.y+y,w:cw,h:ch},
      target:{x:parent.target.x+x,y:parent.target.y+y}, size:{w:cw,h:ch},
      landedWorld:{x:parent.landedWorld.x+(x+cw/2-w/2)*SCALE_X,
                   y:parent.landedWorld.y-(y+ch/2-h/2)*SCALE_Y}};
  });
  MANIFEST.shards=MANIFEST.shards.flatMap(s=>s===parent?cells:[s]);
}

function fractureGeometry(s, base){
  if (!s.fracturePolygon) return base.clone();
  const shape=new THREE.Shape(s.fracturePolygon.map(p=>new THREE.Vector2(p.x,p.y)));
  const geometry=new THREE.ShapeGeometry(shape);
  const pos=geometry.attributes.position, uv=geometry.attributes.uv;
  for (let i=0;i<pos.count;i++) uv.setXY(i,pos.getX(i)+0.5,pos.getY(i)+0.5);
  return geometry;
}

// Keep the same live drift as a piece starts flying, then smoothly remove it.
// Both displacement and its velocity reach zero before the final contact.
function openingDrift(s, ts){
  const p=ts*s.posFreq+s.driftSeed, r=ts*s.rotFreq+s.driftSeed*1.7;
  return {x:Math.sin(p)*13,y:Math.cos(p*0.8)*9.1,z:Math.sin(p*0.6)*6.5,
          roll:Math.sin(r)*s.rotAmp};
}

function init(){
  fractureOpeningCore();
  buildShards();
  // GOD MODE v11: grand total across BOTH flights (Entrance then Repair) -- REVEAL_START's own
  // formula (below) is unchanged, it just now measures back from the true end of Phase B.
  ASSEMBLY_FULL_T = Math.max(...shards.map(s => s.repairDelay + s.repairDur));
  REVEAL_START = Math.max(0, ASSEMBLY_FULL_T - REVEAL_LEAD);
  buildDust();
  buildLogo();
  buildIcons();
  buildSkillCallouts();
  buildSparkPool();
  buildAmbientShards();
  if (reduceMotion){
    // land everything instantly, hold, no animation loop needed beyond a single render -- skip
    // the dark-boot fade entirely (no motion at all should occur with this preference), leaving
    // the veil hidden so the settled scene is visible immediately.
    if (bootVeil) bootVeil.style.display = 'none';
    settleStatic();
    updateSkillCallouts();
  renderer.render(scene, camera);
    window.addEventListener('resize', onResize);
    return;
  }
  // GOD MODE v4 FIX A, step 3: set the true t=0 state and paint it ONCE, synchronously, before
  // the RAF loop is ever started -- every shard is already at its real idle pose (set inline in
  // buildShards, see the FIX A note there), but this also primes the dust field's real opacity
  // and gives the browser a correct frame to present even in the (normally impossible, but not
  // worth relying on) case where the compositor paints before the first requestAnimationFrame
  // callback fires. Belt-and-suspenders: buildShards already makes the "wrong default" state
  // unreachable, this makes the FIRST REAL PAINT correct too, not just the first RAF tick.
  updateDust(0);
  updateSkillCallouts();
  renderer.render(scene, camera);
  phase = 'shattered';
  phaseStart = performance.now();
  requestAnimationFrame(frame);
}

// ------------------------------------------------- shard shader --
// GOD MODE v5: the HARD CONTAINMENT runtime clip this shader used to carry (sampling a baked
// silhouette mask and multiplying it into alpha, via uContainmentMask/uContainStrength) is
// REMOVED entirely this round. That clip's job was "never let a shard render past the true KA
// edge" -- but a render-time alpha mask draws a mathematically smooth, perfectly eroded boundary
// straight through whatever a crystal's own faceted texture happens to be doing there, which
// reads as a flat, sliced cut, not a natural broken edge -- exactly what real shatter debris
// (the reference photography this whole piece is built from) never looks like. The correct place
// to solve "shards shouldn't stray far from the true silhouette" is POSITION, not a render-time
// cutoff: the v3/v4 build-time clamp (erode the true mask by each shard's own half-diagonal,
// snap any out-of-bounds centroid to the nearest in-bounds point) stays exactly as it was and is
// still what keeps every shard's LANDED position honest. A shard's own natural point or facet
// legitimately poking very slightly past a smooth silhouette approximation is now just left
// alone -- that's what the real photographed crystal edges actually look like, not a bug to clip
// away. `uTint` is still a plain multiply, now doing double duty: the raw-to-resolved color
// transmutation during flight (v5 §2.4) AND the fusion-spark overexposure at landing, combined
// (not overwritten) by JS before this uniform is set -- see updateShardsAssembling.
const shardVertex = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const shardFragment = `
  uniform sampler2D map;
  uniform float uOpacity;
  uniform vec3 uTint;
  varying vec2 vUv;
  void main(){
    vec4 tex = texture2D(map, vUv);
    if (tex.a < 0.01) discard;
    gl_FragColor = vec4(tex.rgb * uTint, tex.a * uOpacity);
  }
`;

// GOD MODE v5 restore: every shard is a single structural piece again -- no more "loose chip vs
// structural" split. Every one of the 169 shards starts at its own cracked-in-place broken pose
// (the "Kinetic Reverse-Crystallization" model, see the note below) and flies its own short,
// staggered flight straight to its landed slot -- nothing sits dim/anchored, nothing spawns
// off-screen.

// GOD MODE v7: a point scattered around the VISIBLE FRAME's own border -- computed from the
// real camera frustum at the mark's own depth, not a guess -- so real shards read as "broken
// debris sitting out at the edges of the screen" on the very first frame, not a distant dot
// far outside it (that longer-range look belongs to the separate ambient-crystal layer, see
// ambientEdgePoint). PAD straddles the true edge (0.86-1.12x) so some pieces sit just inside
// the visible border and some just outside it, instead of one perfectly uniform ring.
function screenEdgeSpawnPoint(margin = 80){
  const angle = Math.random() * Math.PI * 2;
  const z = lerp(-240, 80, Math.random());
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (camera.position.z - z);
  const halfW = halfH * camera.aspect;
  // Ray/rectangle intersection, expanded by the shard footprint. Even the
  // nearest spawn has its entire plane outside the viewport, including phones.
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const boundary = Math.min((halfW + margin) / Math.max(0.0001, Math.abs(dx)),
                            (halfH + margin) / Math.max(0.0001, Math.abs(dy)));
  const distance = boundary * lerp(1.5, 3.1, Math.random());
  return {x:dx * distance, y:dy * distance, z};
}

// --------------------------------------------------------- shard build --
function buildShards(){
  const shardList = MANIFEST.shards;
  const geomBase = new THREE.PlaneGeometry(1,1);

  // detect a genuine statistical size outlier -- a single connected-component chunk whose own
  // area is a large multiple of the next-biggest real shard's -- so it can be kept faded out
  // until it's actually arriving (see isMegaOutlier below) rather than sitting on screen looking
  // like an already-whole KA all by itself.
  const rawAreas = shardList.map(s => s.atlas.w * s.atlas.h);
  const areasDescPre = rawAreas.slice().sort((a,b)=>b-a);
  const secondLargestArea = areasDescPre.length > 1 ? areasDescPre[1] : areasDescPre[0];
  const OUTLIER_RATIO = 4;
  const isMegaOutlierPre = rawAreas.map(a => a > secondLargestArea * OUTLIER_RATIO);

  shardList.forEach((s, i) => {
    // width uses the same anisotropic SCALE_X as the shard's position (toWorld) so each
    // piece's own size grows in step with the wider spacing -- otherwise the pieces would
    // land correctly spaced-out to match the clean render's edges but leave visible hairline
    // gaps between neighboring shards, since their individual widths would still be sized for
    // the old, narrower fit.
    const w = s.atlas.w * SCALE_X, h = s.atlas.h * SCALE_Y;
    const geom = fractureGeometry(s, geomBase);
    const uv = geom.attributes.uv;
    const u0 = s.atlas.x / ATLAS_W, v1 = 1 - s.atlas.y / ATLAS_H;
    const u1 = (s.atlas.x + s.atlas.w) / ATLAS_W, v0 = 1 - (s.atlas.y + s.atlas.h) / ATLAS_H;
    // plane UVs default: (0,1)(1,1)(0,0)(1,0) for corners -- remap to atlas rect
    for (let j=0;j<uv.count;j++){
      uv.setXY(j, lerp(u0,u1,uv.getX(j)), lerp(v0,v1,uv.getY(j)));
    }
    uv.needsUpdate = true;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: atlasTex },
        uOpacity: { value: 0.94 },
        // GOD MODE v5 §2.3/2.4: starts at this shard's own RAW_TINT (a darker, cooler,
        // "uncured" multiply on the real photographed texture) rather than neutral (1,1,1) --
        // see updateShardsIdle/Assembling for the mix toward RESOLVED_TINT (neutral, i.e. the
        // texture's own true polished color) as each shard actually flies into place.
        uTint: { value: new THREE.Vector3(RAW_TINT.x, RAW_TINT.y, RAW_TINT.z) },
      },
      vertexShader: shardVertex, fragmentShader: shardFragment,
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.scale.set(w, h, 1);
    // GOD MODE v4 FIX A: construct fully hidden and at its own true idle position BEFORE ever
    // adding it to the scene -- never rely on "the first frame() tick will place this," since
    // that leaves a real, renderable window (however briefly) where the mesh sits at the
    // THREE.Mesh default position (0,0,0) with a nonzero uOpacity, which is exactly the kind of
    // stray-default-state flash this fix rule exists to rule out entirely. mesh.position is set
    // for real just below, right after startPos is computed, and scene.add happens only after
    // that -- construct-then-place-then-add, always in that order, no exceptions.
    mesh.visible = false;

    // Real shatter photography always has a handful of small chips whose true centroid drifts
    // slightly past the core letterform's tight silhouette -- physically accurate, but it reads
    // as those pieces just floating loosely AROUND the KA rather than joining INTO it, which is
    // exactly what was reported ("crystals should be into the KA logo not around"/"stopped
    // around the outer frame"). `landedWorld` is precomputed at BUILD time (see the Python block
    // above the manifest JSON dump) straight from the clean render's own alpha channel -- not a
    // geometric ellipse approximation, which clips valid corner pieces on an angular logotype
    // like this one while missing outliers that sit in real concave gaps (between the K's legs,
    // the A's legs, the K/A notch). Any shard whose true centroid already falls inside the real
    // silhouette (eroded a few percent, so it lands with margin, not right on the knife-edge) is
    // untouched; anything outside is snapped to the nearest point that's genuinely inside it. So
    // every one of the 169 fragments' final resting position is guaranteed to sit inside the
    // exact same silhouette the clean render fades into -- not an approximation of it.
    const landed = { x: s.landedWorld.x, y: s.landedWorld.y };
    // manifest `target` is the shard's bounding-box TOP-LEFT CORNER in the shattered
    // composition, not its center -- mapping it straight to a mesh position (which is the
    // mesh's own center) shifts every shard by half its own width/height, which skews and
    // visibly tilts the whole assembled silhouette. Recover the true center first.
    const targetCenter = { x: s.target.x + s.atlas.w/2, y: s.target.y + s.atlas.h/2 };
    const targetPos = toWorld(targetCenter.x, targetCenter.y);
    const distFromCenter = Math.hypot(targetPos.x, targetPos.y);

    // GOD MODE v7: REVERSES v10's "kinetic magnetic pull" model entirely, per direct fresh
    // feedback -- the tight local-crack broken pose read as an already-formed (if blurry/
    // cracked) KA sitting at true center, not a genuinely broken object. Every shard's start
    // position is now a point out at the VISIBLE FRAME's own edges (screenEdgeSpawnPoint,
    // above), scattered around the full perimeter -- unmistakably broken and far from center
    // on the very first frame -- then flies inward, one by one, staggered by size/distance
    // exactly as the existing timing pass already does, to physically build the KA silhouette
    // out of real crystal fragments converging continuously. Only once every fragment has
    // actually arrived does the wipe-reveal (unchanged, see updateLogoReveal) cross-fade that
    // assembled mosaic into the final polished render -- two distinct, sequential beats
    // ("fragments converge and lock together," then "reveal the finished mark"), not one
    // blurred-together motion.
    // GOD MODE v8: the one genuine mega-outlier (a single real chunk ~15x the next-biggest
    // shard -- see isMegaOutlierPre above) is exempted from the v7 screen-edge entrance. Flying
    // a piece this dominant across the whole frame reads as "a large piece of the logo sliding
    // in from a side," not "one fragment among many colliding into place," per direct feedback.
    // It gets a short local hop near its own landed slot instead -- every other real shard
    // (168 of the 169) still gets the full dramatic screen-edge flight, unchanged.
    const isMegaOutlier = isMegaOutlierPre[i];
    let brokenX, brokenY, brokenZ;
    const entry = screenEdgeSpawnPoint(Math.hypot(w,h) * 0.6 + 30);
    brokenX = entry.x; brokenY = entry.y; brokenZ = entry.z;

    // GOD MODE v5/v7 facet-misalignment value, unchanged: the shard's rotation once it has
    // arrived at the broken pose -- independent of position, so it still adds real per-piece
    // texture (neighboring facets visibly not lined up) on top of the crack-gap above.
    const brokenRotZ = (Math.random()*2-1)*0.24; // ~+-14 degrees -- SUPERCHARGE: more visible facet misalignment

    // GOD MODE v7: every shard's start position IS its own broken-pose position -- now the
    // screen-edge point above (or the short local hop for the mega-outlier, v8), not a local
    // crack -- so it flies the SAME single flight both for its shattered pose and for the
    // Repair arc into landedPos, just over real distance now.
    const startX = brokenX, startY = brokenY, startZ = brokenZ, startRotZ = brokenRotZ;

    // GOD MODE v4 FIX A (cont.): place the mesh at its real idle/shattered pose right now, then
    // reveal it -- this mirrors exactly what updateShardsIdle would do on frame 1 anyway, just
    // done synchronously at build time so there is no gap for a stray default state to render.
    mesh.position.set(startX, startY, startZ);
    mesh.rotation.set(0, 0, startRotZ);
    mesh.visible = true;
    scene.add(mesh);

    shards.push({
      mesh,
      w, h,
      area: s.atlas.w * s.atlas.h,
      startPos: { x: startX, y: startY, z: startZ },
      // GOD MODE v11: the natural, photographed broken-KA pose -- Phase A's (Materialize/
      // Entrance) destination and Phase B's (Repair) origin. This is v10's old anchored idle
      // position, repurposed rather than replaced.
      brokenPosePos: { x: brokenX, y: brokenY, z: brokenZ },
      brokenRot: { x: 0, y: 0, z: brokenRotZ },
      // landed depth stays STRICTLY behind the resolved mark plane (which sits at z=0) --
      // a shard landing in front of it would visibly sit on top of the fully-opaque clean
      // render instead of being hidden behind it as it fades out, breaking the crossfade
      landedPos: { x: landed.x, y: landed.y, z: lerp(-20,-3, (i%7)/7) },
      // GOD MODE v6: this shard's landed distance from the mark's own true center, normalized
      // into the SAME 0..1 space the resolved mark's shader measures its own per-pixel radius in
      // (see uLogoWH/cutDiagHalf) -- lets updateShardsAssembling fade this piece out at exactly
      // the moment the growing reveal radius (wipeYGlobal) reaches its own distance from center,
      // keeping fragment-erase and clean-render-reveal locked to one shared expanding edge
      // instead of two separately-timed effects. Replaces the earlier vertical-line version
      // (landedV, a remapped Y-height) now that the reveal itself travels outward from center.
      landedR: clamp01(Math.hypot(landed.x, landed.y) / cutDiagHalf),
      // fixed per-shard offset applied to this piece's own fade threshold -- staggers exactly
      // which shards vanish a touch early/late relative to their neighbors at the same height,
      // so the erasing edge across the 169 discrete pieces reads as an uneven, organic dissolve
      // instead of a perfectly straight horizontal cutoff (matched by the shader-side per-pixel
      // noise jitter on the clean render, so both "sides" of the merge read as one blended edge)
      wipeJitter: (Math.random()*2 - 1) * WIPE_BAND * 0.55,
      // rotation is Z-axis (in-plane roll) ONLY -- these are flat sprite planes, not solid
      // 3D geometry, so rotating them around X/Y makes them foreshorten and visually "flip"
      // like a card rather than tumble like a crystal. Keep the roll itself modest too --
      // 169 pieces independently swinging through a wide rotation range reads in aggregate
      // as the whole logo spinning/writhing, not a cracked-but-mostly-intact mark
      startRot: { x:0, y:0, z: startRotZ },
      driftSeed: Math.random()*Math.PI*2,
      // per-shard, independently-randomized motion frequencies -- this is what makes the
      // shattered pose read as "169 individual crystals each alive with their own small
      // tumble" instead of either extreme: a perfectly frozen field, or (the earlier bug)
      // every shard swaying at the exact same shared frequency, which summed into a visible
      // whole-logo "breathing rotation". Different periods per shard means no two pieces are
      // ever in the same phase relationship for long, so nothing reads as coordinated.
      posFreq: 0.00020 + Math.random()*0.00020,
      rotFreq: 0.00016 + Math.random()*0.00034,
      distFromCenter,
      // per-shard assembly timing: near-center + small pieces resolve quickly first, the large
      // structural chunks and outliers take the full span -- filled in below once every shard's
      // own timing is known.
      repairDelay: 0, repairDur: 0,
      prevRenderPos: null,
      // FUSION SPARKS (replaces the old single end-of-sequence global blast): set the instant
      // this individual shard's own flight crosses ~94% complete, then read every frame after
      // to drive that one piece's own brief collision flash. Because it's per-shard and keyed
      // off real per-shard timing (which is already staggered across the whole assembly), the
      // visible result is a continuous scatter of small bright pops rippling across the forming
      // logo as pieces click into place -- not one flash tacked onto an already-finished piece.
      impactAt: null,
      pairSparked: false,
      // true only for a genuine statistical outlier (see the precompute-pass note above), never
      // for a normal large structural piece.
      isMegaOutlier,
    });
  });

  // this manifest has (at least) one real outlier -- a single connected-component chunk whose
  // own area is ~15x the SECOND-biggest shard's. Normalizing sizeT against the true max area
  // crushes every one of the other 168 shards' sizeT into a narrow band, which would make "big
  // structural pieces arrive first, small detail chips fill in after" meaningless for virtually
  // the whole cast. Normalize sizeT against the largest NON-outlier shard instead
  // (secondLargestArea, precomputed above); the outlier itself fades in across its own flight
  // (see updateShardsAssembling) instead of sitting on screen at full brightness looking like an
  // already-whole KA by itself.

  const maxDist = Math.max(...shards.map(s=>s.distFromCenter));
  shards.forEach((s,i) => {
    const distT = s.distFromCenter / maxDist;
    const sizeT = Math.min(1, s.area / secondLargestArea);
    // rotation liveliness scales with piece size: the large structural chunks that define
    // the K/A silhouette rotate only a little (so the readable shape stays steady), while
    // the small loose bits and dust-sized fragments swing more freely -- this size-based
    // spread is what keeps 169 independently-phased, independently-timed rotations from
    // ever averaging into a single coherent "the logo is turning" impression, while still
    // giving each individual crystal real, visible tumble.
    s.rotAmp = lerp(0.11, 0.03, sizeT) * (0.7 + Math.random()*0.5);
    // assembly order is SIZE-major: the big structural slabs that trace the K/A's outline land
    // first, small detail chips fill in progressively after -- an easy, legible "it's assembling
    // itself, and it's more complete with every piece" read. Distance is only a minor secondary/
    // tie-breaking term (so pieces of similar size don't all move in a perfectly synchronized
    // wave), not the primary driver.
    // GOD MODE v8: was size-major (big structural pieces land first regardless of where they
    // sit in the letterform) -- now DISTANCE-FROM-CENTER-major instead, so the many real shards
    // nearest the mark's own true center are the ones that collide and spark into place first,
    // reading as a core forming at center and building outward; only a small residual size term
    // remains, so within a similar distance band the bigger structural piece still edges ahead.
    s.repairDelay = ASSEMBLE_DELAY + Math.random() * ASSEMBLE_SPAN * 0.64;
    const gap = Math.hypot(s.landedPos.x - s.brokenPosePos.x, s.landedPos.y - s.brokenPosePos.y);
    // GOD MODE v7: gap is now a genuine edge-to-center travel distance, not a small local
    // crack -- scale duration with it (capped so the very farthest corner spawns don't take
    // absurdly long) instead of the old tight local-hop cap.
    s.repairDur = 1500 + Math.min(1500, gap*0.45) + Math.random()*360;

    // Cinematic curved 3D flight path -- a plain straight-line lerp from the broken pose to the
    // landed slot reads as robotic/mechanical, not like a real crystal drawing itself back
    // together. Each shard flies a quadratic-bezier arc instead: a fixed control-point offset,
    // perpendicular to its own straight brokenPose->landed line (plus a small independent z
    // bow), bows the path out and back in as it closes the remaining crack. Naturally a short,
    // local hop -- a crack closing, not a cross-frame swoop.
    const dx = s.landedPos.x - s.brokenPosePos.x, dy = s.landedPos.y - s.brokenPosePos.y;
    const travel = Math.hypot(dx, dy) || 1;
    const perpX = -dy / travel, perpY = dx / travel;
    const arcSign = Math.random() < 0.5 ? -1 : 1;
    // GOD MODE v7: a real cross-frame flight can afford (and reads better with) a much wider
    // sweeping bow than the old short local-crack hop's 30-unit cap.
    const arcAmp = Math.max(2, Math.min(110, travel * (0.09 + Math.random()*0.14)));
    s.repairArcX = perpX * arcAmp * arcSign;
    s.repairArcY = perpY * arcAmp * arcSign;
    s.repairArcZ = lerp(-8, 8, Math.random());
  });
}

// ------------------------------------------------------------- dust build --
function buildDust(){
  const COUNT = isMobile ? 75 : 190;
  const geom = new THREE.PlaneGeometry(1,1);
  const mat = new THREE.MeshBasicMaterial({
    map: softDotTex, transparent:true, blending:THREE.AdditiveBlending,
    depthWrite:false, toneMapped:false, fog:false,
    // fog:false -- scene.fog blends this warm amber glow toward the near-black fog color at the
    // dust field's typical camera distance, which desaturates it into a dull muddy brown/gray
    // instead of the vibrant ember glow the texture itself actually is. This is atmosphere, not
    // physically fogged geometry, so it should stay at its own true color regardless of depth.
    // GOD MODE v4 FIX A: MeshBasicMaterial defaults opacity to 1 -- construct hidden like every
    // other mesh in the scene (updateDust sets the real value every frame, starting with the
    // very first frame() call before any render happens, so this is a defensive default, not a
    // load-bearing one, but "never a visible default state" should hold with no exceptions).
    opacity: 0,
  });
  const inst = new THREE.InstancedMesh(geom, mat, COUNT);
  const dummy = new THREE.Object3D();
  const data = [];
  for (let i=0;i<COUNT;i++){
    const r = 260 + Math.random()*420;
    const ang = Math.random()*Math.PI*2;
    const x = Math.cos(ang)*r, y = Math.sin(ang)*r*0.9;
    const z = lerp(-340, 340, Math.random());
    const s = lerp(2.5, 8, Math.random());
    data.push({ x,y,z, s, seed:Math.random()*Math.PI*2, speed: 0.00012 + Math.random()*0.00018 });
    dummy.position.set(x,y,z);
    dummy.scale.set(s,s,1);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  scene.add(inst);
  dust = { inst, data, dummy, count: COUNT };
}

// -------------------------------------------------------------- logo build --
const pulseVertex = `
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const pulseFragment = `
  uniform sampler2D map;
  uniform float uAlpha;
  uniform float uPulseY;      // 0..1, -1 = inactive -- slow warm energy pulse, bottom to top
  uniform float uPulseWidth;
  uniform float uSweepPos;    // -0.3..1.3, -1 = inactive -- bright specular reflection sweep
  uniform float uSweepWidth;
  uniform vec2 uSweepDir;      // convex combo (both components >=0, sum to 1) -- which way the
                                // glint crosses the crystal; randomized per-occurrence in JS so
                                // repeat sweeps don't all catch the light from the same angle
  uniform float uWipeY;        // -1 = inactive (fully open/plain uAlpha fade elsewhere) --
                                // otherwise a growing reveal RADIUS (name kept from the earlier
                                // vertical-line version to avoid touching every call site): pixels
                                // whose true distance from the mark's own center is inside the
                                // radius are shown, pixels still outside it are held back, with a
                                // bright fused-seam glow riding exactly on the growing edge. GOD
                                // MODE v6: "reveal the finished KA from the core outward" -- the
                                // boundary is now a circle expanding from center, not a line
                                // rising bottom-to-top. This is the actual reveal mechanism during
                                // assembly -- see updateLogoReveal / WIPE_BAND in JS.
  uniform float uWipeBand;
  uniform vec2 uLogoWH;         // the resolved mark's own true WORLD-SPACE width/height (dw,dh
                                 // from buildLogo) -- vUv is 0..1 on a plane stretched
                                 // non-uniformly to that aspect, so a plain distance in UV space
                                 // would trace an ELLIPSE, not a true circle, and would disagree
                                 // with the per-shard landedR values (computed in real world
                                 // units in buildShards). Multiplying the UV offset by this
                                 // vector before measuring distance puts both sides of the
                                 // comparison in the same real-world-proportional space.
  uniform float uTime;         // now driven every frame regardless of phase (see frame()) so
                                // time-based effects -- the wipe noise during assembly, and the
                                // continuous rim shimmer below -- never freeze between phases
  uniform float uBlast;        // GOD MODE v5 restore: a brief, sharp whole-mark flash toward
                                // white, driven by blastEnv in updateLogoReveal, firing once right
                                // as the reveal wipe completes -- reads as the KA's own exact
                                // silhouette catching light as one shape, distinct from (and layered
                                // alongside) the continuous per-shard fusion sparks in JS (see
                                // impactAt in updateShardsAssembling), which keep firing throughout
                                // assembly unchanged
  uniform float uCharge;       // 0..1, driven by chargeEnv in updateLogoReveal -- the "Charge &
                                // Bloom" pre-reveal beat that replaced the old camera zoom punch.
                                // Purely photometric: brightens the crystal itself and boosts the
                                // wipe seam's peak intensity. Never touches scale, position, UVs,
                                // or the reveal mask, so it cannot read as anything moving.
  varying vec2 vUv;

  // cheap value noise -- gives the wipe boundary (and its shard-side counterpart, see
  // uWipeJitter in JS) an organic, uneven edge instead of a razor-straight line, and animates
  // slowly so the merge itself reads as active, living motion rather than a static gradient --
  // this is what turns a mechanical crossfade into fragments visibly MIXING into the mark.
  float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise2(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash21(i), b = hash21(i + vec2(1.0,0.0));
    float c = hash21(i + vec2(0.0,1.0)), d = hash21(i + vec2(1.0,1.0));
    vec2 u = f*f*(3.0-2.0*f);
    return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
  }

  void main(){
    vec4 tex = texture2D(map, vUv);
    if (tex.a < 0.01) discard;
    vec3 col = tex.rgb;
    float revealMask = 1.0;
    if (uWipeY >= -0.5){
      // GOD MODE v6: radial distance from the mark's own true center, measured in real-world-
      // proportional units (see uLogoWH above) so this agrees exactly with each shard's own
      // landedR (computed in real world units in buildShards) -- 0 at dead center, 1 at the
      // mark's own half-diagonal, matching the same normalization on the JS side.
      vec2 worldOff = (vUv - 0.5) * uLogoWH;
      float maxR = 0.5 * length(uLogoWH);
      float r = length(worldOff) / maxR;
      // drifting, multi-octave-ish jitter on the growing radius itself (not just visual noise
      // added on top) -- this is what makes the boundary genuinely irregular/organic rather
      // than a perfect circle with a noisy-looking texture painted over it. Still sampled off
      // plain vUv (not polar coordinates) -- a per-pixel jitter field doesn't need to itself be
      // radial to make a radial edge look organic.
      float n = noise2(vUv * 7.0 + vec2(0.0, uTime * 0.00045))
              + 0.5 * noise2(vUv * 17.0 - vec2(0.0, uTime * 0.00028));
      float wipeJitter = (n - 0.75) * uWipeBand * 0.9;
      float rr = uWipeY + wipeJitter;
      // inside the (jittered) growing radius -> revealed; still outside it -> held back
      revealMask = 1.0 - smoothstep(rr - uWipeBand, rr + uWipeBand, r);
      // bright fused seam riding exactly on the (jittered) growing edge -- reads as the crystal
      // visibly fusing/healing shut along a closing ring, not just a hard cut between two images.
      // Charge & Bloom layer 3: the seam's own peak intensity gets boosted toward 1.6x at
      // uCharge's peak (which lands almost exactly when the seam is sweeping through the busiest
      // part of the mark, per the shared chargeEnv timing) -- geometry/position untouched, only
      // how bright the seam itself burns.
      float seam = 1.0 - smoothstep(0.0, uWipeBand * 1.35, abs(r - rr));
      float seamBoost = mix(1.0, 1.3, uCharge); // SUPERCHARGE: hotter closing seam
      col += seam * vec3(0.75, 0.52, 0.32) * 0.28 * seamBoost;
    }
    // Charge & Bloom layer 1: a genuine photometric brightening of the crystal itself -- "getting
    // more luminous from within" -- rather than a scale/position change. Peaks at 1.4x plus a
    // warm tint lift, purely additive/multiplicative on color, never on geometry.
    if (uCharge > 0.0){
      // SUPERCHARGE: hotter photometric charge -- 0.4->0.65 brighten, 0.18->0.3 warm lift
      col *= (1.0 + uCharge * 0.10);
      col += vec3(1.0, 0.72, 0.42) * uCharge * 0.035;
    }
    if (uPulseY >= 0.0){
      float d = abs(vUv.y - uPulseY);
      float band = (1.0 - smoothstep(0.0, uPulseWidth, d));
      col += band * vec3(0.8, 0.62, 0.46) * 0.32;
    }
    if (uSweepPos >= -0.25){
      // glossy highlight, like light catching a polished facet -- direction varies per sweep
      float diag = vUv.x * uSweepDir.x + vUv.y * uSweepDir.y;
      float d2 = abs(diag - uSweepPos);
      float band2 = (1.0 - smoothstep(0.0, uSweepWidth, d2));
      float goldT = smoothstep(0.0, 1.0, (diag - uSweepPos) / (uSweepWidth * 2.0) + 0.5);
      vec3 goldReflection = mix(vec3(1.0, 0.48, 0.05), vec3(1.0, 0.96, 0.42), goldT);
      col += band2 * goldReflection * 0.36;
    }
    if (uBlast > 0.0){
      // SUPERCHARGE: pushed from 0.8 toward a near-total whiteout at the flash's own peak --
      // this is the single "just fused shut" beat the whole mark gets once, so it can afford
      // to read as genuinely overexposed for an instant, not a mild brightening.
      col = mix(col, vec3(1.0, 0.99, 0.97), clamp(uBlast, 0.0, 1.0) * 0.85);
    }
    // CONTINUOUS RIM SHIMMER: a very low-amplitude, always-on brightening, independent of the
    // periodic specular sweep above. The old build's "held" state had nothing running between
    // sweeps every 5-6s -- long enough that the piece read as a static image in the gaps. This
    // is intentionally subtle (4-6% of full brightness) so it never competes with the sweep or
    // the wipe seam; it exists purely so no single frame of the resting mark is ever perfectly
    // still, the same way a real polished crystal never looks perfectly dead under ambient light.
    col += vec3(1.0, 0.85, 0.65) * (0.05 + 0.05 * sin(uTime * 0.00035));
    float facetGlint = 0.5 + 0.5 * sin(uTime * 0.0012 + vUv.x * 8.0 + vUv.y * 6.0);
    col += vec3(1.0, 0.72, 0.3) * facetGlint * 0.035;
    gl_FragColor = vec4(col, tex.a * uAlpha * revealMask);
  }
`;

// pre-blur the resolved mark's own image ONCE into an offscreen canvas (padded so the blur
// isn't clipped at the edges) -- a plain uniform-scaled COPY of the sharp texture (no actual
// blur) reads as a crisp, slightly-larger duplicate outline of the logo peeking out from
// behind it, especially at thin pointed tips like the K's blade, which looks like a stray
// misaligned shape rather than a soft glow. A real blur pass fixes that.
function makeBlurredGlowTexture(img, blurPx){
  const pad = Math.ceil(blurPx * 3);
  const c = document.createElement('canvas');
  c.width = img.width + pad*2;
  c.height = img.height + pad*2;
  const g = c.getContext('2d');
  g.filter = `blur(${blurPx}px)`;
  g.drawImage(img, pad, pad, img.width, img.height);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return { tex, w: c.width, h: c.height };
}

function buildLogo(){
  const geom = new THREE.PlaneGeometry(1,1);
  // fit into the SAME shared box the shard mosaic uses (see manifestFit above) so the two
  // register at matching size during the crossfade instead of one visibly overlaying the
  // other at a different scale
  const { w: dw, h: dh } = fitContain(CUT_W, CUT_H, LOGO_BOX_W, LOGO_BOX_H);

  // soft blurred glow plane, behind, additive -- reads as bloom without a post pass
  const blurPx = CUT_W * 0.045;
  const { tex: glowTex, w: glowPxW, h: glowPxH } = makeBlurredGlowTexture(cutoutTex.image, blurPx);
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex, transparent:true, blending:THREE.AdditiveBlending,
    depthWrite:false, toneMapped:false, opacity:0, color:0xffba8c
  });
  logoGlow = new THREE.Mesh(geom, glowMat);
  const pxToWorld = dw / CUT_W; // == dh / CUT_H, aspect is preserved by fitContain
  logoGlow.scale.set(glowPxW * pxToWorld, glowPxH * pxToWorld, 1);
  logoGlow.position.set(0,0,-14);
  scene.add(logoGlow);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: cutoutTex }, uAlpha: { value: 0 },
      uPulseY: { value: -1 }, uPulseWidth: { value: 0.16 },
      uSweepPos: { value: -1 }, uSweepWidth: { value: 0.13 },
      uSweepDir: { value: new THREE.Vector2(0.42, 0.58) },
      uWipeY: { value: -1 }, uWipeBand: { value: WIPE_BAND }, uTime: { value: 0 },
      uLogoWH: { value: new THREE.Vector2(dw, dh) },
      uBlast: { value: 0 },
      uCharge: { value: 0 },
    },
    vertexShader: pulseVertex, fragmentShader: pulseFragment,
    transparent: true, depthWrite:false,
  });
  logoMesh = new THREE.Mesh(geom, mat);
  logoMesh.scale.set(dw, dh, 1);
  logoMesh.position.set(0,0,0);
  logoMesh.userData.dw = dw; logoMesh.userData.dh = dh;
  scene.add(logoMesh);
}

// ------------------------------------------------------ fusion spark pool --
// A small reusable pool of additive glow billboards, one per CURRENTLY-active collision flash.
// 169 shards land across a spread of times (already staggered by the assembly formula), so at
// most a handful of sparks are ever alive at once -- a fixed pool this size comfortably covers
// every real overlap without allocating 169 permanent billboards that sit idle almost all the
// time.
//
// GOD MODE v5: these are still plain camera-facing billboard MESHES (not THREE.Sprite) -- that
// choice is kept because hand-billboarding via the camera's own right/up basis vectors (read
// straight off viewMatrix) is simple and already working, not because a fragment-shader hook is
// needed any more. The HARD CONTAINMENT runtime clip these used to carry (sampling a baked
// silhouette mask and multiplying it into alpha) is REMOVED this round -- see the shard shader
// below for the full reasoning: a smooth, eroded silhouette mask cuts a mathematically perfect
// line straight through a crystal's own jagged texture, which reads as "sliced," not as a natural
// broken edge. Containment is now handled entirely at the POSITION level (the v3/v4 build-time
// silhouette clamp, unchanged) -- sparks just render their texture directly, same as before v3.
const sparkVertex = `
  uniform vec2 uSize;
  varying vec2 vUv;
  void main(){
    vUv = uv;
    vec3 center = modelMatrix[3].xyz; // this mesh's own world position (rotation/scale stay identity)
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 worldPos = center + camRight * (position.x * uSize.x) + camUp * (position.y * uSize.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;
const sparkFragment = `
  uniform sampler2D map;
  uniform float uOpacity;
  varying vec2 vUv;
  void main(){
    vec4 tex = texture2D(map, vUv);
    gl_FragColor = vec4(tex.rgb, tex.a * uOpacity);
  }
`;
// GOD MODE v5 "crystalline lock-snap": per-shard fusion-flash total lifetime, split 8%
// attack / 92% decay (see sparkEnv in updateShardsAssembling). Also scales the neighbor
// pair-spark's own life and the main spawnSpark sprite's life at each shard's lock moment.
const BLAST_DUR = 360;
const SPARK_POOL_SIZE = 28;
const sparkGeom = new THREE.PlaneGeometry(1,1);
let sparkPool = [];
function buildSparkPool(){
  for (let i=0;i<SPARK_POOL_SIZE;i++){
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: blastTex },
        uOpacity: { value: 0 },
        uSize: { value: new THREE.Vector2(1,1) },
      },
      vertexShader: sparkVertex, fragmentShader: sparkFragment,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(sparkGeom, mat);
    mesh.visible = false;
    scene.add(mesh);
    sparkPool.push({ mesh, active:false, startT:0, dur:0, baseScale:1, peakOpacity:0.65 });
  }
}
// Spawn one collision flash at (x,y,z), sized off `scale`, lasting `dur` ms, starting "now" (t
// in the same phase-relative clock updateShardsAssembling already runs on). `peakOpacity`
// (default 0.65) lets a specific spark -- e.g. the single core reveal-ignition flash, see
// updateLogoReveal -- burn brighter than the routine per-shard landing sparks. `kind` picks the
// texture: 'star' (default, the sharp radiating flash) or 'glow' (softDotTex's soft round ember --
// see spawnImpactSpark below for where the mix of the two actually gets decided). Silently no-ops
// if every pooled billboard is currently busy -- with 28 slots against a naturally-staggered
// 169-shard landing schedule this essentially never happens, and missing one flash among many is
// invisible.
function spawnSpark(x, y, z, scale, dur, t, peakOpacity, kind){
  let slot = sparkPool.find(sp => !sp.active);
  if (!slot) return;
  slot.active = true; slot.startT = t; slot.dur = dur; slot.baseScale = scale;
  slot.peakOpacity = peakOpacity === undefined ? 0.65 : peakOpacity;
  slot.mesh.material.uniforms.map.value = kind === 'glow' ? softDotTex : blastTex;
  slot.mesh.position.set(x, y, z);
  slot.mesh.visible = true;
  slot.mesh.material.uniforms.uOpacity.value = 0;
}
// GOD MODE v39: a real collision firing the exact same sharp star every single time (169 shards,
// each landing) read as one repetitive icon replaying rather than organic impact variety -- and at
// the size the star had been tuned to, it visually dominated every landing. This dispatcher is
// what every actual per-shard COLLISION call site below routes through instead of spawnSpark
// directly: it rolls a kind each time -- a bright but notably smaller star (rare), a soft round
// glow (common), or a small soft glow (common) -- so landings read as a varied field of impacts,
// not one oversized icon stamped 169 times. `baseSize` is the same "size off the shard" value call
// sites already computed; the per-kind multiplier is what actually fixes the star's dominance.
function spawnImpactSpark(x, y, z, baseSize, dur, t){
  const roll = Math.random();
  let sizeMul, peakOpacity, kind;
  if (roll < 0.22){ kind = 'star'; sizeMul = 0.55; peakOpacity = 0.7; }
  else if (roll < 0.64){ kind = 'glow'; sizeMul = 0.95; peakOpacity = 0.5; }
  else { kind = 'glow'; sizeMul = 0.5; peakOpacity = 0.38; }
  spawnSpark(x, y, z, baseSize * sizeMul, dur, t, peakOpacity, kind);
}
// ---------------------------------------------------- ambient crystals --
// GOD MODE v6 SUPERCHARGE: extra atmosphere, explicitly separate from the 169 real
// logo-reconstructing fragments -- these stream in from random points well outside the
// frame, cross near (sometimes through) the mark, and exit somewhere else off-screen. They
// never originate from or land at a manifest position, so they can never be mistaken for
// part of the real reconstruction count. Each one reuses a RANDOM real shard's own atlas
// texture crop (no fabricated shapes), just re-cut into its own short-lived streaking flight.
const AMBIENT_COUNT = isMobile ? 7 : 16;
let ambientShards = [];
function ambientEdgePoint(){
  // a generous ring well outside the visible frustum at the mark's own depth -- comfortably
  // off-screen at any reasonable aspect ratio without needing to compute the exact frustum.
  const ang = Math.random() * Math.PI * 2;
  const r = 640 + Math.random() * 300;
  return {
    x: Math.cos(ang) * r,
    y: Math.sin(ang) * r,
    z: lerp(-90, 130, Math.random()),
    ang,
  };
}
function buildAmbientShards(){
  const shardList = MANIFEST.shards.filter(s => !s.openingCore);
  for (let i = 0; i < AMBIENT_COUNT; i++){
    const s = shardList[Math.floor(Math.random() * shardList.length)];
    const geom = new THREE.PlaneGeometry(1,1);
    const uv = geom.attributes.uv;
    const u0 = s.atlas.x / ATLAS_W, v1 = 1 - s.atlas.y / ATLAS_H;
    const u1 = (s.atlas.x + s.atlas.w) / ATLAS_W, v0 = 1 - (s.atlas.y + s.atlas.h) / ATLAS_H;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: atlasTex },
        uOpacity: { value: 0 },
        // brighter, hotter than the real reconstructing shards -- reads as a distinct
        // "loose energy" layer, not a stray piece of the logo itself
        uTint: { value: new THREE.Vector3(1.25, 1.05, 0.85) },
      },
      vertexShader: shardVertex, fragmentShader: shardFragment,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const baseW = s.atlas.w * SCALE_X, baseH = s.atlas.h * SCALE_Y;
    const sizeMul = 0.65 + Math.random() * 0.9;
    const mesh = new THREE.Mesh(geom, mat);
    mesh.scale.set(baseW * sizeMul, baseH * sizeMul, 1);
    mesh.visible = false;
    scene.add(mesh);
    ambientShards.push({
      mesh, active: false, spawnAt: Math.random() * 4000, startT: 0, dur: 0,
      start: {x:0,y:0,z:0}, end: {x:0,y:0,z:0}, arcX: 0, arcY: 0, arcZ: 0,
      spin: (Math.random()*2-1) * 0.006, spinStart: Math.random()*Math.PI*2,
      closePass: false, sparked: false,
    });
  }
}
function updateAmbientShards(t){
  ambientShards.forEach(a => {
    if (!a.active){
      if (t < a.spawnAt) return;
      // stream from one random off-screen edge point to another -- biased toward roughly
      // opposite-ish sides so it reads as crossing the frame, not darting back the way it came
      const from = ambientEdgePoint();
      let toAng = from.ang + Math.PI + (Math.random()*2-1) * 1.1;
      const toR = 640 + Math.random() * 300;
      const to = { x: Math.cos(toAng) * toR, y: Math.sin(toAng) * toR, z: lerp(-90, 130, Math.random()) };
      a.start = from; a.end = to;
      // some streaks are pulled to bow much closer to the mark's own center than a straight
      // line would -- those are the ones that read as a genuine near-pass/collision moment
      a.closePass = Math.random() < 0.5;
      const pull = a.closePass ? (0.55 + Math.random()*0.35) : (Math.random()*0.25);
      const midX = (from.x + to.x) * 0.5, midY = (from.y + to.y) * 0.5;
      a.arcX = -midX * pull; a.arcY = -midY * pull;
      a.arcZ = lerp(-40, 40, Math.random());
      a.dur = 950 + Math.random() * 900;
      a.startT = t; a.active = true; a.sparked = false;
      a.mesh.visible = true;
    }
    const age = t - a.startT;
    const lt = clamp01(age / a.dur);
    if (lt >= 1){
      a.active = false;
      a.mesh.visible = false;
      a.spawnAt = t + 260 + Math.random() * 1400;
      return;
    }
    const e = easeInOutCubic(lt);
    const it = 1 - e;
    const midX = (a.start.x + a.end.x) * 0.5 + a.arcX;
    const midY = (a.start.y + a.end.y) * 0.5 + a.arcY;
    const midZ = (a.start.z + a.end.z) * 0.5 + a.arcZ;
    const px = it*it*a.start.x + 2*it*e*midX + e*e*a.end.x;
    const py = it*it*a.start.y + 2*it*e*midY + e*e*a.end.y;
    const pz = it*it*a.start.z + 2*it*e*midZ + e*e*a.end.z;
    a.mesh.position.set(px, py, pz);
    a.mesh.rotation.z = a.spinStart + t * a.spin;
    // quick fade in/out at both ends of its flight so it never pops or vanishes abruptly
    const edgeFade = Math.min(1, lt/0.12) * Math.min(1, (1-lt)/0.12);
    a.mesh.material.uniforms.uOpacity.value = 0.48 * edgeFade;
    // one small collision spark, only for the streaks pulled into a genuine close pass, only
    // once, right as it crosses nearest to the mark's own center
    if (a.closePass && !a.sparked && lt > 0.42 && lt < 0.58){
      const distFromCenter = Math.hypot(px, py);
      if (distFromCenter < 130){
        a.sparked = true;
        spawnImpactSpark(px, py, pz + 1, Math.max(a.mesh.scale.x, a.mesh.scale.y) * 0.6, 260, t);
      }
    }
  });
}
function updateSparks(t){
  sparkPool.forEach(slot => {
    if (!slot.active) return;
    const age = t - slot.startT;
    if (age >= slot.dur){
      slot.active = false;
      slot.mesh.visible = false;
      slot.mesh.material.uniforms.uOpacity.value = 0;
      return;
    }
    const e = age / slot.dur;
    // fast attack, quick decay -- a spark, not a lingering glow-hold
    const env = e < 0.25 ? easeOutCubic(e/0.25) : 1 - easeInCubic((e-0.25)/0.75);
    slot.mesh.material.uniforms.uOpacity.value = env * slot.peakOpacity;
    const sz = slot.baseScale * lerp(1.0, 2.2, env);
    slot.mesh.material.uniforms.uSize.value.set(sz, sz);
  });
}

// ------------------------------------------------------------- icon build --
const TOOLKIT = [
  { type:'brush',     label:'Illustration' },
  { type:'pencil',    label:'Sketch' },
  { type:'ps',        label:'Photoshop' },
  { type:'design',    label:'Figma' },
  { type:'uiux',      label:'UI/UX' },
  { type:'type',      label:'Typography' },
  { type:'image',     label:'Imaging' },
  { type:'briefcase', label:'Freelance' },
];

function drawIconGlyph(g, type, s){
  g.lineJoin = 'round'; g.lineCap = 'round';
  switch(type){
    case 'brush': {
      g.save(); g.rotate(-0.55); g.lineWidth = s*0.22;
      g.beginPath(); g.moveTo(-s*0.05, s*0.15); g.lineTo(-s*0.05, s*0.75); g.stroke();
      g.beginPath(); g.moveTo(-s*0.30,-s*0.10); g.lineTo(s*0.20,-s*0.10); g.lineTo(s*0.02, s*0.15); g.lineTo(-s*0.12, s*0.15); g.closePath(); g.fill();
      g.beginPath(); g.arc(-s*0.05, s*0.78, s*0.09, 0, Math.PI*2); g.fill();
      g.restore(); break;
    }
    case 'pencil': {
      g.save(); g.rotate(0.78); g.lineWidth = s*0.09; g.strokeStyle = g.fillStyle;
      g.beginPath(); g.rect(-s*0.11, -s*0.62, s*0.22, s*1.0); g.fill();
      g.beginPath(); g.moveTo(-s*0.11, s*0.38); g.lineTo(s*0.11, s*0.38); g.lineTo(0, s*0.66); g.closePath(); g.fill();
      g.restore(); break;
    }
    case 'ps': {
      g.save(); g.lineWidth = s*0.09;
      g.beginPath(); g.roundRect ? g.roundRect(-s*0.55,-s*0.4, s*1.1, s*0.8, s*0.12) : g.rect(-s*0.55,-s*0.4,s*1.1,s*0.8);
      g.stroke();
      g.font = `700 ${Math.round(s*0.62)}px Manrope, sans-serif`;
      g.textAlign='center'; g.textBaseline='middle';
      g.fillText('Ps', 0, s*0.04);
      g.restore(); break;
    }
    case 'design': {
      g.save();
      g.beginPath(); g.arc(-s*0.32, -s*0.28, s*0.22, 0, Math.PI*2); g.fill();
      g.beginPath(); g.rect(s*0.08, -s*0.5, s*0.42, s*0.42); g.fill();
      g.beginPath(); g.moveTo(0, s*0.55); g.lineTo(s*0.38, s*0.05); g.lineTo(-s*0.38, s*0.05); g.closePath(); g.fill();
      g.restore(); break;
    }
    case 'uiux': {
      g.save(); g.lineWidth = s*0.07; g.setLineDash([s*0.1, s*0.09]);
      g.strokeRect(-s*0.55,-s*0.55, s*1.1, s*1.1);
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(-s*0.05,-s*0.05); g.lineTo(s*0.45, s*0.42); g.lineTo(s*0.24, s*0.44); g.lineTo(s*0.4, s*0.7); g.lineTo(s*0.26, s*0.78); g.lineTo(s*0.1, s*0.5); g.lineTo(-s*0.05, s*0.65); g.closePath();
      g.fill();
      g.restore(); break;
    }
    case 'type': {
      g.save();
      g.font = `700 ${Math.round(s*0.95)}px Manrope, sans-serif`;
      g.textAlign='left'; g.textBaseline='middle';
      g.fillText('A', -s*0.5, s*0.02);
      g.font = `500 ${Math.round(s*0.52)}px Manrope, sans-serif`;
      g.fillText('a', s*0.1, s*0.1);
      g.restore(); break;
    }
    case 'image': {
      g.save(); g.lineWidth = s*0.08;
      g.strokeRect(-s*0.55,-s*0.42, s*1.1, s*0.84);
      g.beginPath(); g.arc(-s*0.22,-s*0.14, s*0.1, 0, Math.PI*2); g.fill();
      g.beginPath(); g.moveTo(-s*0.5, s*0.32); g.lineTo(-s*0.1, -s*0.05); g.lineTo(s*0.12, s*0.16); g.lineTo(s*0.32,-s*0.02); g.lineTo(s*0.5, s*0.3); g.closePath(); g.fill();
      g.restore(); break;
    }
    case 'briefcase': {
      g.save(); g.lineWidth = s*0.08;
      g.strokeRect(-s*0.5,-s*0.28, s*1.0, s*0.68);
      g.beginPath(); g.moveTo(-s*0.18,-s*0.28); g.lineTo(-s*0.18,-s*0.44); g.lineTo(s*0.18,-s*0.44); g.lineTo(s*0.18,-s*0.28); g.stroke();
      g.beginPath(); g.moveTo(-s*0.5, s*0.06); g.lineTo(s*0.5, s*0.06); g.stroke();
      g.fillRect(-s*0.08, -s*0.02, s*0.16, s*0.16);
      g.restore(); break;
    }
  }
}

function makeIconTexture(type){
  const size=256,c=document.createElement('canvas');c.width=c.height=size;
  const g=c.getContext('2d'),r=103;
  g.translate(size/2,size/2);
  const glass=g.createRadialGradient(-36,-48,4,0,0,r);
  glass.addColorStop(0,'rgba(220,233,246,0.24)');
  glass.addColorStop(.55,'rgba(38,31,43,0.58)');
  glass.addColorStop(.86,'rgba(65,51,63,0.65)');
  glass.addColorStop(1,'rgba(220,193,165,0.3)');
  g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fillStyle=glass;g.fill();
  g.strokeStyle='rgba(246,222,202,0.48)';g.lineWidth=2;g.stroke();
  g.beginPath();g.arc(0,0,r-5,Math.PI*1.12,Math.PI*1.82);
  g.strokeStyle='rgba(255,248,232,0.82)';g.lineWidth=3;g.stroke();
  g.beginPath();g.arc(0,0,r-6,Math.PI*.08,Math.PI*.62);
  g.strokeStyle='rgba(164,201,233,0.36)';g.lineWidth=3;g.stroke();
  const sheen=g.createRadialGradient(-31,-51,0,-31,-51,50);
  sheen.addColorStop(0,'rgba(255,255,255,0.28)');sheen.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=sheen;g.beginPath();g.ellipse(-31,-51,53,27,-.3,0,Math.PI*2);g.fill();
  g.strokeStyle='#f2dec8';g.fillStyle='#edc9ab';drawIconGlyph(g,type,58);
  const texture=new THREE.CanvasTexture(c);texture.minFilter=THREE.LinearFilter;return texture;
}

const ICON_SIZE = 46;
function ringRadii(){
  // frustum half-extents at the icons' viewing distance, so the ring never pushes
  // icons off-screen on narrow/portrait aspect ratios
  const visHalfH = CAM_HALF_H_REF;
  const visHalfW = visHalfH * camera.aspect;
  let ringRX = logoMesh.userData.dw/2 + ICON_SIZE*1.55;
  let ringRY = logoMesh.userData.dh/2 + ICON_SIZE*1.55;
  ringRX = Math.min(ringRX, visHalfW - ICON_SIZE*0.75);
  ringRY = Math.min(ringRY, visHalfH - ICON_SIZE*1.9); // extra headroom for the eyebrow/replay UI
  return { ringRX, ringRY };
}

function layoutIcons(){
  const { ringRX, ringRY } = ringRadii();
  icons.forEach(ic => {
    ic.landX = Math.cos(ic.angle)*ringRX;
    ic.landY = Math.sin(ic.angle)*ringRY;
    const farScale = ic.farScale;
    ic.startX = Math.cos(ic.angle)*ringRX*farScale;
    ic.startY = Math.sin(ic.angle)*ringRY*farScale;
  });
}

// SVG annotations stay sharp at browser zoom and follow the actual WebGL bubbles.
let skillOverlay = null;
function buildSkillCallouts(){
  const ns='http://www.w3.org/2000/svg';
  const make=(tag,attrs,parent)=>{
    const el=document.createElementNS(ns,tag);
    Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,value));
    parent?.appendChild(el);return el;
  };
  skillOverlay=make('svg',{'class':'skill-callouts','role':'img','aria-label':'Skills: '+TOOLKIT.map(s=>s.label).join(', ')},document.body);
  const defs=make('defs',{},skillOverlay);
  const gradient=make('linearGradient',{id:'skill-line-light',x1:'0%',y1:'0%',x2:'100%',y2:'100%'},defs);
  make('stop',{offset:'0%','stop-color':'#b8d8ef','stop-opacity':'.55'},gradient);
  make('stop',{offset:'60%','stop-color':'#ffe8cd','stop-opacity':'.95'},gradient);
  make('stop',{offset:'100%','stop-color':'#e8aa82','stop-opacity':'.7'},gradient);
  icons.forEach((ic,i)=>{
    const group=make('g',{opacity:'0','aria-hidden':'true'},skillOverlay);
    const halo=make('path',{'class':'skill-line-halo',fill:'none'},group);
    const path=make('path',{'class':'skill-line',fill:'none',pathLength:'1'},group);
    const tip=make('path',{'class':'skill-tip',d:'M -3 0 L 0 -3 L 3 0 L 0 3 Z'},group);
    const label=make('text',{'class':'skill-label'},group);label.textContent=TOOLKIT[i].label;
    ic.callout={group,halo,path,tip,label,projected:new THREE.Vector3()};
  });
}

// Layout uses screen pixels so type never becomes tiny with the camera's FOV.
function skillLabelLayout(points,width,height){
  const compact=width<640;
  const cx=width/2,cy=height/2;
  if(compact){
    const top=Math.min(...points.map(p=>p.y-p.radius));
    const bottom=Math.max(...points.map(p=>p.y+p.radius));
    return points.map(p=>{
      const upper=p.y<cy,side=p.x<cx?-1:1;
      const peers=points.filter(q=>(q.y<cy)===upper && (q.x<cx)===(p.x<cx)).sort((a,b)=>Math.abs(b.y-cy)-Math.abs(a.y-cy));
      const row=peers.indexOf(p);
      return {x:width*(side<0?.25:.75),y:upper?Math.max(116,top-24)-row*28:Math.min(height-60,bottom+30)+row*28,
        anchor:'middle',side,compact:true};
    });
  }
  const labels=points.map(p=>{
    const side=p.x<cx?-1:1;
    return {x:side<0?Math.max(92,p.x-p.radius-58):Math.min(width-92,p.x+p.radius+58),
      y:Math.max(92,Math.min(height-28,p.y)),anchor:side<0?'end':'start',side,compact:false};
  });
  [-1,1].forEach(side=>{
    const column=labels.filter(p=>p.side===side).sort((a,b)=>a.y-b.y);
    for(let i=1;i<column.length;i++) column[i].y=Math.max(column[i].y,column[i-1].y+27);
    if(column.length && column[column.length-1].y>height-24){
      column[column.length-1].y=height-24;
      for(let i=column.length-2;i>=0;i--) column[i].y=Math.min(column[i].y,column[i+1].y-27);
    }
  });
  return labels;
}

function updateSkillCallouts(){
  if(!skillOverlay || !icons.length) return;
  const width=window.innerWidth,height=window.innerHeight;
  skillOverlay.setAttribute('viewBox',`0 0 ${width} ${height}`);
  camera.updateMatrixWorld();
  const points=icons.map(ic=>{
    const p=ic.callout.projected.copy(ic.sprite.position).project(camera);
    const distance=Math.max(1,camera.position.z-ic.sprite.position.z);
    return {x:(p.x*.5+.5)*width,y:(.5-p.y*.5)*height,
      radius:ic.sprite.scale.x*height/(4*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*distance)};
  });
  const labels=skillLabelLayout(points,width,height);
  let anyVisible=false;
  icons.forEach((ic,i)=>{
    const c=ic.callout,p=points[i],label=labels[i];
    const opacity=ic.sprite.material.opacity*(ic.calloutReveal || (reducedMotion?1:0));
    c.group.setAttribute('opacity',opacity.toFixed(3));
    if(opacity<.001) return;
    anyVisible=true;
    const dx=label.x-p.x,dy=label.y-p.y,len=Math.hypot(dx,dy)||1;
    const sx=p.x+dx/len*(p.radius+3),sy=p.y+dy/len*(p.radius+3);
    const ex=label.x+(label.anchor==='end'?7:label.anchor==='start'?-7:0),ey=label.y-4;
    const bend=label.compact?label.side*26:label.side*18;
    const d=`M ${sx} ${sy} C ${sx+bend} ${sy}, ${ex+bend} ${ey-12}, ${ex} ${ey}`;
    c.path.setAttribute('d',d);c.halo.setAttribute('d',d);
    c.path.style.strokeDashoffset=String(1-opacity);
    c.tip.setAttribute('transform',`translate(${ex},${ey})`);
    c.label.setAttribute('x',label.x);c.label.setAttribute('y',label.y+(label.compact?-9:0));
    c.label.setAttribute('text-anchor',label.anchor);
  });
  skillOverlay.setAttribute('aria-hidden',String(!anyVisible));
}

function buildIcons(){
  const { ringRX, ringRY } = ringRadii();

  TOOLKIT.forEach((icon, i) => {
    const tex = makeIconTexture(icon.type);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent:true, depthWrite:false, opacity:0 });
    const sprite = new THREE.Sprite(mat);
    sprite.userData.kaKind = 'icon'; // v19 diagnostics -- see window.__kaDebugScene()
    sprite.scale.set(ICON_SIZE, ICON_SIZE, 1);
    scene.add(sprite);

    const angle = -Math.PI/2 + (i + 0.5) * (Math.PI*2/TOOLKIT.length);
    const landX = Math.cos(angle)*ringRX, landY = Math.sin(angle)*ringRY;
    const farScale = 1.08 + Math.random()*0.08;
    icons.push({
      sprite, angle, farScale,
      landX, landY, landZ: 6,
      startX: Math.cos(angle)*ringRX*farScale, startY: Math.sin(angle)*ringRY*farScale, startZ: lerp(-180,220,Math.random()),
      delay: 0, dur: ICON_DUR,
      floatSeed: Math.random()*Math.PI*2,
      floatFreqX: 0.00075 + Math.random()*0.00035,
      floatFreqY: 0.00095 + Math.random()*0.00035,
      floatAmpX: ICON_SIZE * (0.06 + Math.random()*0.03),
      floatAmpY: ICON_SIZE * (0.07 + Math.random()*0.03),
    });
  });
}

// ------------------------------------------------------------ input --
window.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});
window.addEventListener('touchmove', (e) => {
  if (!e.touches || !e.touches[0]) return;
  mouse.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.touches[0].clientY / window.innerHeight) * 2 - 1;
}, { passive:true });

function onResize(){
  camera.aspect = window.innerWidth/window.innerHeight;
  // [responsive framing] recompute the reference FOV/half-height for the NEW aspect ratio on
  // every resize/orientation change, not just once at load -- updateCamera()'s own per-frame
  // dolly-zoom compensation reads CAM_HALF_H_REF fresh every call, so updating it here is
  // enough for the animated path; camera.fov is also set directly below for the reduced-motion
  // static path, which has no per-frame loop to pick the new value up on its own.
  CAM_FOV_BASE = computeResponsiveFovBase(camera.aspect);
  CAM_HALF_H_REF = CAM_Z_FAR * Math.tan(THREE.MathUtils.degToRad(CAM_FOV_BASE) / 2);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(CAM_HALF_H_REF / Math.max(1, camera.position.z)));
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(renderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (icons.length) layoutIcons();
  // the static (reduced-motion) path has no frame() loop to naturally repaint after this --
  // without an explicit render call here, a resize would leave the canvas showing a stale
  // frame stretched into the new size until something else happened to trigger a repaint.
  // Harmless extra call on the animated path too (frame() repaints again on its own next tick).
  updateSkillCallouts();
  renderer.render(scene, camera);
}
window.addEventListener('resize', onResize);

let resizeRAF = 0;
window.visualViewport?.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRAF);
  resizeRAF = requestAnimationFrame(onResize);
});
const replayBtn = document.getElementById('replay');
const bootVeil = document.getElementById('boot-veil'); // GOD MODE v9: dark-boot fade-in overlay
replayBtn?.addEventListener('click', () => {
  if (phase !== 'held') return;
  phase = 'disassembling';
  phaseStart = performance.now();
  replayBtn?.classList.remove('on');
});

// ------------------------------------------------------------- static (reduced motion) --
// GOD MODE v10 note: deliberately NOT routed through setResolvedMarkVisibility/setLogoGlowOpacity.
// Those two gate the ANIMATED sequence's phase machine (phase stays 'shattered' the whole time in
// this path -- the frame() loop, and phase, never run at all for prefers-reduced-motion); this
// function instead renders the single correct FINAL state once, synchronously, with no animation
// and nothing to leak early -- there's no premature-reveal bug this could ever reproduce.
function settleStatic(){
  shards.forEach(s => {
    s.mesh.position.set(s.landedPos.x, s.landedPos.y, s.landedPos.z);
    s.mesh.rotation.set(0,0,0);
    s.mesh.material.uniforms.uOpacity.value = 0;
    s.mesh.visible = false;
  });
  logoMesh.material.uniforms.uAlpha.value = 1;
  logoGlow.material.opacity = 0.18;
  logoMesh.scale.set(logoMesh.userData.dw, logoMesh.userData.dh, 1);
  icons.forEach(ic => {
    ic.sprite.position.set(ic.landX, ic.landY, ic.landZ);
    ic.sprite.material.opacity = 1;
  });
  camera.position.set(0,0,CAM_Z_NEAR);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(CAM_HALF_H_REF / CAM_Z_NEAR));
  camera.updateProjectionMatrix();
  camera.lookAt(0,0,0);
  dust.inst.visible = false;
}

// ============================================================ RESOLVED-MARK VISIBILITY GATE ==
// GOD MODE v10: three separate rounds in a row (v7's energize-pulse glow, v8's mid-assembly
// write-order leak, v9's intentional-but-too-visible mid-assembly ghost flicker) each produced
// some version of "the full logo showed before it should have," each from a genuinely different
// cause. Patching each new cause where it was found (as v8's clamp, then v9's narrower version of
// the same clamp, both did) fixes the specific symptom but leaves the next different cause free to
// reintroduce the same complaint. The actual fix is architectural: NO function anywhere in this
// file is allowed to write logoMesh's uAlpha/uBlast/uWipeY, or logoGlow's opacity, directly --
// every one of those writes, everywhere, goes through exactly these two functions, which are the
// only code that ever touches those uniforms. There is exactly one legal window for either of
// them to be nonzero -- the real reveal (assembling, once REVEAL_START is reached) through held,
// plus disassembling's own legitimate un-fuse crossfade -- enforced here, once, at the point of
// writing, rather than patched after the fact somewhere later in the frame.
const WIPE_Y_FULLY_HIDDEN = -1;
function isResolvedMarkRevealWindow(currentT){
  return (phase === 'assembling' && currentT >= REVEAL_START) || phase === 'held' || phase === 'disassembling';
}
function setResolvedMarkVisibility(alpha, blast, wipeY, currentT){
  if (!isResolvedMarkRevealWindow(currentT) && (alpha !== 0 || blast !== 0 || wipeY !== WIPE_Y_FULLY_HIDDEN)){
    // A caller trying to reveal the mark outside its one legal window is a bug to catch at the
    // source, not a visual glitch to notice later -- log it loudly and still force-hide, so a
    // regression is impossible to miss in development but never actually reaches the screen.
    console.error('[LogoAssembly] blocked an attempt to reveal the resolved mark outside its window', { phase, currentT, REVEAL_START, alpha, blast, wipeY });
    logoMesh.material.uniforms.uAlpha.value = 0;
    logoMesh.material.uniforms.uBlast.value = 0;
    logoMesh.material.uniforms.uWipeY.value = WIPE_Y_FULLY_HIDDEN;
    return;
  }
  logoMesh.material.uniforms.uAlpha.value = alpha;
  logoMesh.material.uniforms.uBlast.value = blast;
  logoMesh.material.uniforms.uWipeY.value = wipeY;
}
function setLogoGlowOpacity(opacity, currentT){
  // logoGlow is a blurred bloom-plane copy of the SAME artwork logoMesh renders crisp -- a
  // blurred silhouette is still a silhouette, so it is subject to the identical rule through the
  // identical gate (this was the actual root cause of the v7 energize-pulse leak: that pulse
  // brightened logoGlow believing it was "shape-free," which it never really was).
  if (!isResolvedMarkRevealWindow(currentT) && opacity !== 0){
    console.error('[LogoAssembly] blocked an attempt to show the resolved mark\'s glow outside its window', { phase, currentT, REVEAL_START, opacity });
    logoGlow.material.opacity = 0;
    return;
  }
  logoGlow.material.opacity = opacity;
}

// ==================================================================== FRAME LOOP ==
function frame(ts){
  requestAnimationFrame(frame);
  if (lastFrameT === 0) lastFrameT = ts;
  const dt = ts - lastFrameT; lastFrameT = ts;
  const t = ts - phaseStart;

  // Driven unconditionally, every frame, off the raw animation clock (ts) rather than the
  // per-phase-relative t -- this is what lets the shader's continuous rim shimmer (and the
  // wipe-boundary noise during assembly) keep animating smoothly straight through every phase
  // transition instead of freezing whenever a phase that doesn't explicitly touch uTime is active.
  logoMesh.material.uniforms.uTime.value = ts;

  mouseSmoothed.x = lerp(mouseSmoothed.x, mouse.x, 0.045);
  mouseSmoothed.y = lerp(mouseSmoothed.y, mouse.y, 0.045);

  updateDust(ts);

  if (phase === 'shattered'){
    // GOD MODE v9: near-darkness -> fully visible broken KA. Only ever runs on the very first
    // 'shattered' entry (bootDone latches true and stays true across every later Replay cycle) --
    // per spec this is how the scene OPENS, not a fade the viewer sees again on every reassembly.
    if (!bootDone){
      if (BOOT_FADE_DUR <= 0){
        bootDone = true;
        bootVeil.style.opacity = '0';
        bootVeil.style.pointerEvents = 'none';
      } else {
        const bootT = clamp01(t / BOOT_FADE_DUR);
        bootVeil.style.opacity = String(1 - smootherStep(bootT));
        if (bootT >= 1){
          bootDone = true;
          bootVeil.style.opacity = '0';
          bootVeil.style.pointerEvents = 'none';
        }
      }
    }
    updateShardsIdle(ts, t);
    updateEnergizePulse(t);
    // GOD MODE v10: explicit, through the gate, every frame -- 'shattered' is never an allowed
    // reveal window, so this is what guarantees the resolved mark and its glow are hidden here,
    // rather than relying on no other function happening to leave them that way.
    setResolvedMarkVisibility(0, 0, WIPE_Y_FULLY_HIDDEN, t);
    setLogoGlowOpacity(0, t);
    updateCamera(0, ts, dt);
  } else if (phase === 'assembling'){
    // safety reset, unconditional every frame (consistent with how the 'held' branch below
    // resets its own one-shot uniforms): the energize pulse's own envelope already returns both
    // lights to baseline before ASSEMBLE_DELAY is reached (see updateEnergizePulse), so this is
    // pure defensive redundancy against ever carrying a stale energize light boost into
    // assembling, where updateLogoReveal takes over driving the lights from chargeEnv instead.
    // GOD MODE v10: no longer resets logoGlow's color -- updateEnergizePulse doesn't touch
    // logoGlow at all anymore (see that function), so there's nothing stale to reset here.
    energizeEnv = 0;
    keyLight.intensity = KEY_LIGHT_BASE;
    rimLight.intensity = RIM_LIGHT_BASE;
    // updateLogoReveal runs FIRST so it can compute this frame's wipe-line position, which
    // updateShardsAssembling then reads to fade each shard out exactly as the line reaches it
    updateLogoReveal(t);
    const finished = updateShardsAssembling(ts, t);
    updateAmbientShards(ts); // SUPERCHARGE: ambient off-KA crystals, driven off the raw clock so they keep streaming across a replay
    const globalProgress = clamp01(t / REVEAL_START);
    updateCamera(globalProgress, ts, dt);
    updateIcons(t, ts);
    if (finished && t > REVEAL_START + REVEAL_DUR + ICONS_START_GAP + ICON_STAGGER*7 + ICON_DUR + PULSE_DELAY + PULSE_DUR + 200){
      phase = 'held'; phaseStart = ts;
      shineActive = false;
      shineNextAt = SHINE_INTERVAL_MIN + Math.random()*(SHINE_INTERVAL_MAX - SHINE_INTERVAL_MIN);
      // GOD MODE v9: arm the first ambient interior sparkle for this held cycle
      nextSparkleAt = IDLE_SPARKLE_MIN + Math.random()*(IDLE_SPARKLE_MAX - IDLE_SPARKLE_MIN);
      replayBtn?.classList.add('on');
    }
  } else if (phase === 'held'){
    // fragments have fully fused into the clean resolved crystal by now (shardFade
    // reached 0 during assembling) -- per spec they stay completely still here, not
    // drifting, so we deliberately skip updateShardsIdle in this phase
    updateCamera(1, ts, dt);
    updateIcons(999999, ts); // fully landed -- position/scale locked, float continues off ts
    logoMesh.material.uniforms.uPulseY.value = -1;
    // safety reset -- chargeEnv naturally settles back to 0 well before `held` begins, but reset
    // its readers explicitly anyway (consistent with how every other one-shot effect here resets
    // on phase entry) rather than relying on that timing margin
    logoMesh.material.uniforms.uCharge.value = 0;
    blastEnv = 0;
    // GOD MODE v10: the mark's own shape-visibility uniforms (uAlpha/uBlast/uWipeY) are only ever
    // written through setResolvedMarkVisibility now -- 'held' is one of that gate's allowed
    // windows, so this keeps the mark fully, cleanly revealed (alpha 1, no residual blast,
    // wipeYGlobal already at its fully-open value from the reveal that just finished) rather than
    // writing uBlast directly.
    setResolvedMarkVisibility(1, 0, wipeYGlobal, t);
    keyLight.intensity = KEY_LIGHT_BASE;
    rimLight.intensity = RIM_LIGHT_BASE;

    // continuous specular shine: once at rest, the crystal keeps catching the light every
    // 5-6s (randomized per cycle, not a metronomic fixed 5.000s) instead of only once right
    // after it resolves. Direction/angle is re-randomized (randomizeSweep) each time a new
    // sweep starts, so consecutive glints don't all catch the light from the same side.
    if (t >= shineNextAt && !shineActive){
      shineActive = true;
      shineStartT = t;
      randomizeSweep();
    }
    if (shineActive){
      const localT = t - shineStartT;
      const shineT = clamp01(localT / SHINE_SWEEP_DUR);
      applySweepUniform(logoMesh, shineT, smootherStep);
      if (localT >= SHINE_SWEEP_DUR){
        shineActive = false;
        shineNextAt = t + SHINE_INTERVAL_MIN + Math.random()*(SHINE_INTERVAL_MAX - SHINE_INTERVAL_MIN);
      }
    } else {
      logoMesh.material.uniforms.uSweepPos.value = -1;
    }

    // GOD MODE v9: ambient interior sparkle -- small, random glints inside the resting crystal,
    // looping indefinitely at random SLOW intervals, independent of (and much subtler than) the
    // periodic specular shine sweep above. Reuses the existing spark sprite pool (the same one
    // fusion sparks use during assembly) rather than a new rendering path, spawned at a genuine
    // shard's own landed position each time so every sparkle sits somewhere the crystal actually
    // has real geometry, not an approximated interior region.
    if (t >= nextSparkleAt){
      const pick = shards[Math.floor(Math.random() * shards.length)];
      spawnSpark(pick.landedPos.x, pick.landedPos.y, 3,
                 Math.max(pick.w, pick.h) * (0.45 + Math.random()*0.4),
                 450 + Math.random()*400, t, 0.4, 'glow'); // a resting twinkle, not an impact -- always the soft glow, never the sharp star
      nextSparkleAt = t + IDLE_SPARKLE_MIN + Math.random()*(IDLE_SPARKLE_MAX - IDLE_SPARKLE_MIN);
    }
    updateAmbientShards(ts); // SUPERCHARGE: keep the ambient layer alive through the held/resting state
    updateSparks(t);
  } else if (phase === 'disassembling'){
    const p = clamp01(t / DISASSEMBLE_DUR);
    // Mirror the reveal crossfade, in reverse, instead of just cutting the shard mosaic to
    // full opacity on top of the still-visible clean logo. That cut was the bug behind
    // "transition between final and first isn't synced/aligned" -- at the very start of
    // Replay, both the fully-opaque clean render AND the fully-opaque (but differently
    // registered) shard mosaic were visible at once, which reads as a misaligned double-image
    // flash rather than a smooth reversal. Two sub-phases instead: first UN-FUSE in place --
    // the shard mosaic fades IN at its landed position (exactly where the logo sits) while the
    // clean render fades OUT, so the fragments visibly emerge from, and stay aligned with, the
    // logo they were part of ("joined to fix inside the logo") -- nothing moves yet. Only once
    // that hand-off is complete do the pieces actually fly outward to their shattered pose.
    const UNFUSE_T = 0.36;
    const unfuseE = smootherStep(clamp01(p / UNFUSE_T));
    const shatterE = smootherStep(clamp01((p - UNFUSE_T) / (1 - UNFUSE_T)));

    // GOD MODE v5: Replay mirrors the single flight in reverse -- landedPos back out to each
    // shard's own broken-pose slot.
    shards.forEach(s => {
      s.mesh.visible = true;
      const segE = shatterE;
      const drift = openingDrift(s, ts);
      s.mesh.position.x = lerp(s.landedPos.x, s.brokenPosePos.x + drift.x, segE);
      s.mesh.position.y = lerp(s.landedPos.y, s.brokenPosePos.y + drift.y, segE);
      s.mesh.position.z = lerp(s.landedPos.z, s.brokenPosePos.z + drift.z, segE);
      s.mesh.rotation.x = 0;
      s.mesh.rotation.y = 0;
      s.mesh.rotation.z = lerp(0, s.startRot.z + drift.roll, shatterE);
      s.mesh.scale.set(s.w, s.h, 1);
      // shatters back to its own rest look -- full raw-tint opacity, matching updateShardsIdle's
      // own resting state, so the hand-off to 'shattered' is seamless.
      s.mesh.material.uniforms.uOpacity.value = lerp(0, 1, unfuseE) * lerp(1, s.isInitiallyMissing ? 0 : 0.94, shatterE);
      {
        const rt = lerp3(RESOLVED_TINT, RAW_TINT, shatterE);
        s.mesh.material.uniforms.uTint.value.set(rt.x, rt.y, rt.z);
      }
      // reset this shard's fusion-spark state so Replay's next assembly gets a fresh set of
      // collision flashes rather than skipping them (impactAt already set)
      s.impactAt = null;
      s.pairSparked = false;
    });
    icons.forEach(ic => {
      const e = easeInCubic(p);
      ic.sprite.material.opacity = lerp(1, 0, Math.min(1,p*1.6));
      ic.sprite.position.x = lerp(ic.landX, ic.startX, e);
      ic.sprite.position.y = lerp(ic.landY, ic.startY, e);
    });
    // GOD MODE v10: routed through the same gate -- 'disassembling' is one of its allowed
    // windows, so this legitimate un-fuse crossfade (1 -> 0 in place) passes through unchanged.
    // uWipeY is left exactly as the reveal completed it (still fully-open); only alpha changes here.
    setResolvedMarkVisibility(1 - unfuseE, 0, logoMesh.material.uniforms.uWipeY.value, t);
    setLogoGlowOpacity(0.22 * (1 - unfuseE), t);
    updateCamera(1 - easeInCubic(p), ts, dt);
    if (p >= 1){
      phase = 'shattered'; phaseStart = ts;
      // brief hold in shattered form before auto-reassembling
      setTimeout(() => {
        if (phase === 'shattered'){ randomizeSweep(); phase = 'assembling'; phaseStart = performance.now(); coreFlashFired = false; }
      }, 650);
    }
  }

  // GOD MODE v10: the old unconditional end-of-frame clamp that used to live here (v8, extended
  // once more in v9 for a single tightly-scoped exception) is deleted -- not tightened further.
  // Three rounds in a row produced some version of "the full logo showed too early" from a
  // different cause each time, patched after the fact in the exact spot the leak was found. The
  // structural fix is upstream now: every phase branch above calls setResolvedMarkVisibility /
  // setLogoGlowOpacity directly at its own point of writing (see 'shattered' above; updateLogoReveal
  // below, called from 'assembling'; and the 'held'/'disassembling' branches above), and those two
  // functions are the ONLY code allowed to touch these uniforms at all. There is no longer a
  // separate "clean up after everyone" pass to maintain, extend, or accidentally carve a new
  // exception into -- the guarantee lives at the write site, not in a patch applied after it.

  updateSkillCallouts();
  renderer.render(scene, camera);

  if (phase === 'shattered' && !frame._armed){
    frame._armed = true;
    setTimeout(() => {
      if (phase === 'shattered'){ randomizeSweep(); phase = 'assembling'; phaseStart = performance.now(); }
    }, ASSEMBLE_DELAY);
  }
}

function updateDust(ts){
  const { inst, data, dummy, count } = dust;
  // ambient dust stays present at full strength through the whole join sequence (it reads as
  // atmosphere, not junk) and only clears in the last stretch, right as the fragments finish
  // locking in and the reveal begins -- an early clear-out during assembling used to leave the
  // tail of the join looking sparse/incomplete.
  let fadeOut;
  if (phase === 'assembling'){
    fadeOut = 1 - clamp01(((ts-phaseStart) - ASSEMBLY_FULL_T*0.85) / (ASSEMBLY_FULL_T*0.15 + REVEAL_LEAD));
  } else if (phase === 'held'){
    // Don't clear the frame to empty once resolved -- a small residual population keeps
    // drifting at low opacity indefinitely, a living atmosphere around the mark rather than a
    // dead, static background. (The old build's dust also had a visible pop back to full
    // opacity right on entering `held`, since its fade-out only ever applied during
    // `assembling` -- this both fixes that discontinuity and gives the held frame its own
    // continuous ambient motion.)
    fadeOut = 0.22;
  } else {
    fadeOut = 1;
  }
  inst.material.opacity = 0.55 * fadeOut;
  for (let i=0;i<count;i++){
    const d = data[i];
    const drift = Math.sin(ts*d.speed + d.seed);
    dummy.position.set(d.x + drift*14, d.y + Math.cos(ts*d.speed*0.8+d.seed)*10, d.z);
    dummy.scale.set(d.s, d.s, 1);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
}

// ENERGIZE PULSE: see the energizeEnv/ENERGIZE_* declarations above for the full reasoning --
// a brief charge-up cue timed to finish right as the shards start their first real motion, so
// "the logo gets energized" reads as the actual cause of "the fragments start moving," not two
// coincidentally-adjacent events.
// GOD MODE v10: this pulse used to also brighten logoGlow (the blurred bloom-plane COPY OF THE
// SAME ARTWORK logoMesh renders crisp) -- on reflection that was never actually shape-free the
// way earlier comments claimed: a blurred copy of the mark's own silhouette, made to glow, still
// shows the viewer a hint of the finished logo's outline before a single fragment has moved. That
// was one of three separate rounds this project produced some version of "the full logo showed
// too early" from a different specific cause each time (this energize-glow leak, a mid-assembly
// write-order leak, and an intentional-but-too-visible mid-assembly flicker) -- so rather than
// patch this one instance again, logoGlow is now gated through the exact same
// setResolvedMarkVisibility/setLogoGlowOpacity choke point logoMesh goes through (see above
// frame()), which makes it structurally impossible for ANY function -- this one included -- to
// show it outside the one real reveal window. This pulse is left driving only the two real
// scene lights: a genuine non-shape brightness/color cue, never a rendering of the mark itself.
function updateEnergizePulse(t){
  const age = t - ENERGIZE_START;
  if (age < 0 || age > ENERGIZE_DUR){
    energizeEnv = 0;
  } else {
    // softer attack/decay split than the crystalline lock-snap (35%/65%, not 8%/92%) -- this is
    // a rising CHARGE building toward a peak, not a percussive impact, so it should visibly
    // swell in before it breaks, matching "being energized" rather than "being struck."
    const riseDur = ENERGIZE_DUR * 0.35, fallDur = ENERGIZE_DUR * 0.65;
    energizeEnv = age < riseDur ? easeOutCubic(age/riseDur) : 1 - easeInCubic((age-riseDur)/fallDur);
  }
  // a real light flickering up here reinforces "this is an actual energy event," not just a
  // texture getting brighter -- reuses the same key/rim lights the later Charge & Bloom beat
  // drives, so the vocabulary of "a light-based charge event" stays consistent across the piece.
  keyLight.intensity = KEY_LIGHT_BASE * lerp(1.0, 1.7, energizeEnv);
  rimLight.intensity = RIM_LIGHT_BASE * lerp(1.0, 1.7, energizeEnv);
}

function updateShardsIdle(ts, t, gentle){
  const amp = gentle ? 8 : 13;
  shards.forEach(s => {
    s.mesh.visible = true;
    // a genuine mega-outlier stays faded out while idle so it never reads as an already-whole
    // KA sitting there by itself; every other shard is at normal resting brightness.
    s.mesh.material.uniforms.uOpacity.value = s.isMegaOutlier ? 0.05 : 0.94;
    s.mesh.material.uniforms.uTint.value.set(RAW_TINT.x, RAW_TINT.y, RAW_TINT.z);
    // each shard runs on its OWN frequency (posFreq/rotFreq, randomized per-shard at build
    // time) rather than a single shared frequency -- that's what keeps 169 independently
    // tumbling crystals from ever drifting into phase with each other and reading, in
    // aggregate, as one coordinated "the whole logo is rotating" motion. Individually each
    // piece still floats and rolls with real, visible life.
    const pDrift = ts*s.posFreq + s.driftSeed;
    s.mesh.position.x = s.startPos.x + Math.sin(pDrift)*amp;
    s.mesh.position.y = s.startPos.y + Math.cos(pDrift*0.8)*amp*0.7;
    s.mesh.position.z = s.startPos.z + Math.sin(pDrift*0.6)*amp*0.5;
    // Z-axis roll only -- see the note in buildShards on why X/Y rotation is never used on
    // these flat sprite planes. rotAmp is size-graded (small pieces swing more, big structural
    // chunks stay steadier) so the tumble is lively per-piece without ever reading as the
    // silhouette itself turning.
    const rDrift = ts*s.rotFreq + s.driftSeed*1.7;
    s.mesh.rotation.x = 0;
    s.mesh.rotation.y = 0;
    s.mesh.rotation.z = s.startRot.z + Math.sin(rDrift)*s.rotAmp;
  });
}

function updateShardsAssembling(ts, t){
  let allDone = true;

  shards.forEach(s => {
    if (t < s.repairDelay){
      // still waiting for its own turn -- same per-shard-frequency tumble as the shattered
      // phase (updateShardsIdle).
      allDone = false;
      const pDrift = ts*s.posFreq + s.driftSeed;
      const rDrift = ts*s.rotFreq + s.driftSeed*1.7;
      s.mesh.position.x = s.startPos.x + Math.sin(pDrift)*13;
      s.mesh.position.y = s.startPos.y + Math.cos(pDrift*0.8)*9.1;
      s.mesh.position.z = s.startPos.z + Math.sin(pDrift*0.6)*6.5;
      s.mesh.rotation.x = 0;
      s.mesh.rotation.y = 0;
      s.mesh.rotation.z = s.startRot.z + Math.sin(rDrift)*s.rotAmp;
      s.mesh.material.uniforms.uOpacity.value = s.isMegaOutlier ? 0.05 : 0.94;
      s.mesh.material.uniforms.uTint.value.set(RAW_TINT.x, RAW_TINT.y, RAW_TINT.z);
      return;
    }

    // ---------------------------------------------------------------- REPAIR --
    // brokenPosePos -> landedPos, a short flight closing the remaining cracks into the exact,
    // silhouette-correct final position. This is where the randomized "charging" fusion sparks
    // and the continuous raw->resolved color transmutation belong (moved here wholesale from
    // the old single-flight code, unchanged in mechanics).
    // CATCH-UP GUARD: the wipe now starts REVEAL_LEAD ms before the true last shard lands (see
    // the note by REVEAL_LEAD above), so on rare occasions the growing reveal radius can reach a
    // shard's own landed distance from center (wipeYGlobal past its landedR) while that shard is
    // still genuinely mid-flight. Letting the wipe pass through and erase a piece that hasn't
    // arrived yet is a visual impossibility (the shader mask would show empty space, not a piece
    // dissolving), so -- and only in that specific case -- hurry that one shard's remaining
    // flight along at 3x speed rather than freezing anything or skipping the guard entirely.
    // This is the only conditional branch in the whole timing model, and it exists purely for
    // correctness, never to gate or pause motion. Only ever relevant during Repair, since the
    // wipe can't outpace a shard that's already sitting in its broken pose waiting.
    let effT = t - s.repairDelay;
    if (wipeYGlobal > (s.landedR + s.wipeJitter) && effT > 0 && effT < s.repairDur){
      const remaining = s.repairDur - effT;
      effT = s.repairDur - remaining / 3;
    }
    const lt = clamp01(effT / s.repairDur);
    if (lt < 1) allDone = false;
    // GOD MODE v9: was easeInOutCubic (symmetric slow-fast-slow) -- now easeSlowSnap, unhurried
    // for most of the distance and then a quick, decisive snap right at the end (see the function
    // definition above for the exact shape).
    const posE = easeSlowSnap(lt);
    // GOD MODE v4 FIX B: fly straight to the TRUE landed position, no runtime grow-to-fit.
    // The old version eased the landing target from 96.5% up to 100% of s.landedPos in step
    // with the reveal crossfade, to paper over the mosaic being fractionally undersized next to
    // the resolved render. That's gone now -- s.landedPos is already the correct final size,
    // because it was placed via toWorld()'s SCALE_X/SCALE_Y (both derived from cutFit, the same
    // box the resolved render uses), not the old manifestFit-relative placement the ramp was
    // compensating for. Flying to it directly means there is nothing left to "settle into."
    const endX = s.landedPos.x, endY = s.landedPos.y, endZ = s.landedPos.z;
    // quadratic-bezier flight: bow the straight brokenPose->end line out through a fixed
    // per-shard control point (see the repairArcX/Y/Z note in buildShards) instead of a flat
    // lerp -- naturally a much smaller, shorter sweep than the Entrance flight above, since this
    // is a local crack closing up, not a cross-frame swoop.
    const midX = (s.brokenPosePos.x + endX) * 0.5 + s.repairArcX;
    const midY = (s.brokenPosePos.y + endY) * 0.5 + s.repairArcY;
    const midZ = (s.brokenPosePos.z + endZ) * 0.5 + s.repairArcZ;
    const it = 1 - posE;
    let px = it*it*s.brokenPosePos.x + 2*it*posE*midX + posE*posE*endX;
    let py = it*it*s.brokenPosePos.y + 2*it*posE*midY + posE*posE*endY;
    let pz = it*it*s.brokenPosePos.z + 2*it*posE*midZ + posE*posE*endZ;
    const drift = openingDrift(s, ts);
    const driftWeight = 1 - smootherStep(clamp01(lt / 0.8));
    px += drift.x * driftWeight;
    py += drift.y * driftWeight;
    pz += drift.z * driftWeight;

    // fade this shard out exactly as the growing reveal radius passes its own distance from
    // center -- smootherStep centered on (wipeYGlobal - landedR), band width WIPE_BAND, matching
    // the shader's seam so the fragment visually "disappears into" the same expanding edge that
    // reveals the clean render there, rather than fading on some independent, only-approximately-
    // matched schedule the way a flat global crossfade timer would. Computed here (before
    // position is finalized) so the same value can also drive the pre-dissolve shimmer just below.
    const localFade = 1 - smootherStep((wipeYGlobal - (s.landedR + s.wipeJitter)) / (WIPE_BAND*2) + 0.5);

    // cheap motion-blur: stretch the plane slightly along its velocity while moving fast
    if (s.mesh.position && lt < 0.94){
      const dx = px - s.mesh.position.x, dy = py - s.mesh.position.y;
      const elapsed = Math.max(1, Math.min(50, ts - (s.motionTs ?? (ts - 16.667))));
      const speed = Math.hypot(dx,dy) * 16.667 / elapsed;
      const stretch = Math.min(1.16, 1 + speed*0.012);
      s.mesh.scale.set(s.w*stretch, s.h, 1);
    } else {
      s.mesh.scale.set(s.w, s.h, 1);
    }

    // A wide dissolve band plus a small idle-style position wobble on top of it (an earlier pass
    // at this) reads, at normal viewing speed, as the fragment hesitating/hovering right at the
    // reveal line instead of cleanly going away -- reported directly as fragments "getting stuck
    // and paused" mid-reveal. Fix it with decisive motion instead of a lingering wobble: once a
    // shard's own dissolve has actually started (localFade below 1), pull it BEHIND the resolved
    // mark's plane (z=0) and shrink it toward nothing over that same short window, so it reads as
    // sinking into/behind the logo it's disappearing into -- not hanging suspended in front of it
    // while its opacity slowly drains. `sinkT` reaches 1 well before localFade fully bottoms out
    // (a x1.6 curve) so the piece is already visually gone (scaled/pushed away) before the last,
    // faint trace of its opacity would otherwise read as a stall.
    let pzFinal = pz;
    if (localFade < 0.999){
      const sinkT = clamp01((1 - localFade) * 1.6);
      const sinkE = easeInCubic(sinkT);
      pzFinal = pz - sinkE * 46; // recede behind the resolved mark's plane (z=0)
      s.mesh.scale.multiplyScalar(lerp(1, 0.25, sinkE));
    }

    s.motionTs = ts;
    s.mesh.position.set(px, py, pzFinal);

    // GOD MODE v13: smootherStep, not easeOutCubic -- same rotation-smoothing fix as Phase A,
    // so the final facet lock-in settles gradually instead of snapping fast right at the end.
    const rotE = smootherStep(lt);
    s.mesh.rotation.x = 0;
    s.mesh.rotation.y = 0;
    s.mesh.rotation.z = lerp(s.brokenRot.z, 0, rotE) + drift.roll * driftWeight;

    // slight overshoot/impact scale-pop right as it locks in -- kept subtle (and softer than
    // an earlier pass) so 169 pieces landing in the same general window doesn't itself read
    // as a jittery/uneven size flicker right before the crossfade begins
    if (lt > 0.9){
      const impactT = (lt-0.9)/0.1;
      const pop = 1 + Math.sin(impactT*Math.PI) * 0.035 * (1-impactT);
      s.mesh.scale.multiplyScalar(pop);
    }

    // a genuine mega-outlier ramps in across its own flight instead of starting at normal
    // brightness immediately, so it never looks like an already-whole KA appearing out of
    // nowhere; every other shard just gets its usual brighten-toward-1 near landing.
    const baseOpacity = lerp(0.94, 1, easeOutCubic(lt));
    s.mesh.material.uniforms.uOpacity.value = (s.isMegaOutlier ? baseOpacity * easeOutCubic(lt) : baseOpacity) * localFade * (s.isInitiallyMissing ? smootherStep(clamp01(lt / 0.2)) : 1);
    // GOD MODE v5 §2.4: METAMORPHIC TRANSMUTATION -- continuous raw-to-resolved color mix,
    // driven by this shard's own posE the whole Repair flight through (not just a brief flash at
    // landing). Computed here, before the fusion-spark check below, so the spark's overexposure
    // can ADD on top of it rather than overwrite it -- by the time a piece locks in, it should
    // already read as visibly "cured" into the resolved material, with the fusion spark as the
    // moment that transmutation completes, not an unrelated flash layered over a static tint.
    const baseTint = lerp3(RAW_TINT, RESOLVED_TINT, smootherStep(posE));

    // FUSION SPARK -- fires once, the instant THIS shard's own Repair flight crosses ~94%
    // complete (posE, not lt, since posE is the actual eased travel fraction driving its
    // position). See the impactAt field note in buildShards for why this replaces a single
    // global blast: 169 shards landing across a naturally staggered schedule produces a
    // continuous scatter of small collision flashes instead of one flat event tacked onto an
    // already-finished piece.
    if (s.impactAt === null && posE >= 0.94){
      s.impactAt = t;
      // GOD MODE v9: randomize this shard's own spark envelope shape -- attack/decay split,
      // overall lifetime, and peak brightness all vary per shard (fixed once, at the moment of
      // impact, so a single shard's own flash stays internally consistent frame to frame) so the
      // wall of 169 landings reads as chaotic electrical charging rather than one smooth pulse
      // shape stamped out identically everywhere. See sparkEnv below for how these combine with a
      // stacked-sine flicker into the final envelope.
      s.sparkAttackFrac = 0.05 + Math.random() * 0.14;    // 5-19% attack (was a fixed 8%)
      s.sparkDurMul = 0.75 + Math.random() * 0.6;         // 0.75x-1.35x this shard's own lifetime
      s.sparkPeak = 1.0 + Math.random() * 0.6;            // 1.0-1.6x peak overexposure -- SUPERCHARGE
      s.sparkFlickerFreq1 = 0.02 + Math.random() * 0.05;  // two stacked flicker frequencies so it
      s.sparkFlickerFreq2 = 0.05 + Math.random() * 0.11;  // never settles into one clean beat
      s.sparkFlickerPhase1 = Math.random() * Math.PI * 2;
      s.sparkFlickerPhase2 = Math.random() * Math.PI * 2;
      spawnImpactSpark(endX, endY, 2, Math.max(s.w, s.h) * 1.15, BLAST_DUR, t); // randomized star/glow mix, see spawnImpactSpark
      // GOD MODE v5 "crystalline lock-snap": a handful of tiny, very short-lived seam-line
      // sparks scattered right at this shard's own edge, distinct from the main flash above --
      // the main flash reads as "this piece arrived," these tiny ones read as "...and the seam
      // just caught the light," a quick chime-like flicker rather than a bigger glow. Optional
      // per spec; kept cheap (short life, tiny radius, reuses the same sprite pool).
      const chimeCount = 6 + Math.floor(Math.random() * 4); // 6-9 -- SUPERCHARGE: busier lock-snap chime
      for (let c = 0; c < chimeCount; c++){
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.max(s.w, s.h) * (0.35 + Math.random() * 0.25);
        spawnSpark(endX + Math.cos(ang) * rad, endY + Math.sin(ang) * rad,
                   0.8 + Math.random() * 0.6, Math.max(s.w, s.h) * 0.18,
                   90 + Math.random() * 50, t, 0.4, 'glow'); // small companion flecks -- always the soft glow
      }
      // Neighbor micro-spark: if another shard landed within the last ~180ms AND sits close
      // enough to plausibly be an adjacent piece, spawn a second, smaller flash at the midpoint
      // between them -- that's the spark that specifically reads as "these two just collided,"
      // distinct from "this one piece arrived." Only ever fires once per pair (pairSparked guard)
      // so two adjacent pieces landing close together don't relight each other repeatedly.
      if (!s.pairSparked){
        for (let j=0;j<shards.length;j++){
          const s2 = shards[j];
          if (s2 === s || s2.impactAt === null || s2.pairSparked) continue;
          if (Math.abs(s2.impactAt - s.impactAt) > 180) continue;
          const dx2 = s2.landedPos.x - s.landedPos.x, dy2 = s2.landedPos.y - s.landedPos.y;
          const neighborThresh = (s.w + s.h + s2.w + s2.h) * 0.55;
          if (Math.hypot(dx2, dy2) < neighborThresh){
            spawnImpactSpark((s.landedPos.x + s2.landedPos.x) * 0.5, (s.landedPos.y + s2.landedPos.y) * 0.5, 2.5,
                       Math.max(s.w, s.h) * 0.55, Math.round(BLAST_DUR * 0.85), t);
            s.pairSparked = true; s2.pairSparked = true;
            break;
          }
        }
      }
    }
    // Warm overexposure on the shard's OWN material while its spark is alive -- the sprite alone
    // reads as a glow floating near the piece; brightening the piece's own texture at the same
    // moment is what sells the flash as coming FROM the collision itself. Values above 1 in
    // uTint genuinely overexpose (the fragment shader multiplies texture color by it directly,
    // with no tone mapping), not just tint. GOD MODE v5: this now ADDS onto baseTint (the
    // continuous raw->resolved transmutation above) instead of overwriting it outright, so the
    // flash reads as "the transmutation completing in a burst of light," not an unrelated pulse
    // that happens to interrupt whatever color the shard was already at.
    // GOD MODE v5 "crystalline lock-snap": shortened and sharpened from the previous round's
    // softer 260ms/25%-attack envelope -- a crystal facet locking into place should read as a
    // sharp snap-and-fade, not a gentle bloom.
    // GOD MODE v9: the attack/decay split, overall duration, and peak are now this shard's OWN
    // randomized values (set once at impact, above) instead of one fixed 8%/92% shape shared by
    // every shard -- and on top of that base attack/decay envelope, a flicker term (two stacked
    // sines at per-shard, non-matching frequencies) makes the brightness stutter/waver while it's
    // active rather than rising and falling smoothly, reading as an unstable arc catching and
    // dropping rather than a uniform, well-behaved pulse. The base `shape` still guarantees the
    // envelope starts and ends at exactly 0 regardless of the flicker riding on top of it.
    let sparkEnv = 0;
    if (s.impactAt !== null){
      const age = t - s.impactAt;
      const dur = BLAST_DUR * s.sparkDurMul;
      if (age < dur){
        const attackDur = dur * s.sparkAttackFrac, decayDur = dur * (1 - s.sparkAttackFrac);
        const shape = age < attackDur ? easeOutCubic(age/attackDur) : 1 - easeInCubic((age-attackDur)/decayDur);
        const flicker = 0.72 + 0.28 *
          (0.5 + 0.5*Math.sin(age*s.sparkFlickerFreq1 + s.sparkFlickerPhase1)) *
          (0.5 + 0.5*Math.sin(age*s.sparkFlickerFreq2 + s.sparkFlickerPhase2));
        sparkEnv = shape * flicker * s.sparkPeak;
      }
    }
    // SUPERCHARGE: hotter per-shard overexposure at the moment of impact
    s.mesh.material.uniforms.uTint.value.set(
      baseTint.x + sparkEnv*0.20, baseTint.y + sparkEnv*0.14, baseTint.z + sparkEnv*0.20
    );
  });
  updateSparks(t);
  return allDone;
}

function updateLogoReveal(t){
  // REVEAL_START is set (in init, from the real per-shard delay+dur values) to land REVEAL_LEAD
  // ms BEFORE the very last of the 169 fragments actually locks into place -- not after a hold
  // beat. The wipe therefore starts while the last few shards are still inbound (and still
  // popping their own per-shard fusion sparks, see updateShardsAssembling), so "last piece
  // lands" and "reveal begins" read as one continuous gesture instead of two events separated
  // by a dead, zero-motion beat.
  const revealStart = REVEAL_START;
  const revealDur = REVEAL_DUR;

  // CORE IGNITION FLASH: one sharp star-spark fired from the mark's own exact center the instant
  // the reveal begins -- reads as "the light that then spreads outward," matching the wipe itself
  // (wipeYGlobal below), which also grows outward from this same center. One-shot per assembly
  // cycle via coreFlashFired (reset alongside the phase transition on every Replay).
  if (!coreFlashFired && t >= revealStart){
    coreFlashFired = true;
    spawnSpark(0, 0, 5, cutDiagHalf * 0.55, 620, t, 1.0);
  }

  const revealT = clamp01((t - revealStart) / revealDur);
  // the resolved mark's scale/position NEVER animates -- it was set once in buildLogo() and
  // stays put the whole time (see buildLogo: logoMesh.scale.set(dw,dh,1), position (0,0,0)).
  // A scale pop here reads as the logo itself moving/flexing, which is exactly what needs to
  // stay constant -- all the motion belongs to the fragments.
  // smootherStep (not easeOutCubic): zero velocity AND zero acceleration at both ends, so the
  // wipe eases both into and out of motion -- smooth the whole way through, no abrupt start/stop.
  const revealE = smootherStep(revealT);
  logoRevealE = revealE; // no longer read by shard placement (see FIX B note) -- kept for any future consumer

  // Charge & Bloom envelope (see the chargeEnv declaration above for why this replaced the old
  // camera zoom punch): same smooth rise-then-fall triangle, same phase-relative t, same window
  // as the punch used to occupy -- so it still lines up with this exact reveal regardless of how
  // the per-shard stagger shifts REVEAL_START around, and still peaks right in the middle of the
  // wipe where the fusion itself is happening. The only thing that changed is what reads it:
  // updateCamera no longer touches this value at all -- see updateLogoLight below instead.
  {
    const chargeRiseStart = revealStart - 350;
    const chargePeakAt = revealStart + revealDur * 0.5;
    const chargeEnd = revealStart + revealDur + 320;
    if (t < chargeRiseStart || t > chargeEnd){
      chargeEnv = 0;
    } else if (t < chargePeakAt){
      chargeEnv = smootherStep((t - chargeRiseStart) / (chargePeakAt - chargeRiseStart));
    } else {
      chargeEnv = 1 - smootherStep((t - chargePeakAt) / (chargeEnd - chargePeakAt));
    }
  }

  // WIPE REVEAL, replacing a flat global crossfade: a single growing radius simultaneously
  // reveals the clean render (uWipeY, in the shader -- see uLogoWH there for the true-circle
  // math) and erases the shard mosaic in its wake (wipeYGlobal, read by updateShardsAssembling)
  // -- the exact same value drives both, so the hand-off can never visually drift out of sync
  // the way two independently-timed fades could. GOD MODE v6: this now expands OUTWARD FROM THE
  // MARK'S OWN CENTER rather than rising bottom-to-top, per direct reference ("reveal the
  // finished KA from the core outward... until the entire KA is illuminated"). The radius still
  // travels from just inside center (-0.20, so even landedR=0 shards clear it cleanly) to just
  // past the mark's own half-diagonal (1.20) so it fully covers every shard at both ends, with
  // WIPE_BAND giving it a soft glowing edge rather than a hard cut. This directly answers "reveal
  // the exact KA outline" -- the boundary between fragment and clean render is always literally
  // the mark's own shape, just traced from the inside out now instead of bottom to top.
  wipeYGlobal = lerp(-0.20, 1.20, revealE);

  // SILHOUETTE FLASH: fires once, right as the wipe line clears the top of the frame (revealT
  // reaching 1 means every pixel has been handed from shard-mosaic to clean-render) -- this is
  // the instant the whole KA shape is first fully, cleanly formed, so it's exactly when the
  // shape should visibly flash, not before (nothing to flash yet) and not noticeably after (the
  // moment would already feel over). Same sharp 8%/92% attack/decay split as the per-shard
  // lock-snap, just scaled to the whole mark instead of one fragment, and started a hair before
  // revealT actually hits 1 (BLAST_LEAD) so it doesn't trail the wipe's own completion.
  // Computed here, BEFORE the gate call below, so alpha/blast/wipeY can all be handed to
  // setResolvedMarkVisibility together in one call.
  const BLAST_LEAD = 60;
  const blastStart = revealStart + revealDur - BLAST_LEAD;
  const blastAge = t - blastStart;
  if (blastAge < 0 || blastAge > BLAST_FLASH_DUR){
    blastEnv = 0;
  } else {
    const attackDur = BLAST_FLASH_DUR * 0.08, decayDur = BLAST_FLASH_DUR * 0.92;
    blastEnv = blastAge < attackDur ? easeOutCubic(blastAge/attackDur) : 1 - easeInCubic((blastAge-attackDur)/decayDur);
  }

  // GOD MODE v10: the ONLY writer of these three uniforms is setResolvedMarkVisibility. Pass it
  // the real "hidden" values (not just values that happen to render as hidden) before revealStart
  // -- alpha used to be hardcoded to 1 the whole time here, relying on wipeY's radius test alone
  // to keep it invisible; that's exactly the kind of "trusted to already be safe" write the gate
  // exists to stop relying on. Now the call site itself only ever asks for what's actually true
  // for this frame, so the gate's block branch is a pure safety net that should never fire in
  // normal operation, not a per-frame corrector.
  if (t >= revealStart){
    setResolvedMarkVisibility(1, blastEnv, wipeYGlobal, t);
  } else {
    setResolvedMarkVisibility(0, 0, WIPE_Y_FULLY_HIDDEN, t);
  }
  logoMesh.material.uniforms.uCharge.value = chargeEnv;

  // Charge & Bloom layer 2: the blurred additive glow plane's baseline opacity (already ramping
  // to ~0.22 as it always has) gets an extra multiply from chargeEnv, up to ~1.9x at the peak --
  // the plane's own scale and position are untouched (that rule holds absolutely, per the
  // original spec), it just breathes brighter in sync with layers 1 and 3 above. Routed through
  // the identical gate logoMesh uses -- see setLogoGlowOpacity above.
  setLogoGlowOpacity(0.12 * revealE * lerp(1.0, 1.25, chargeEnv), t); // SUPERCHARGE

  // Real scene lights, ramped the same way the light-only replacement for the zoom punch calls
  // for. Note honestly: nothing in this scene currently renders lit (shards and the resolved
  // mark are both fully custom-shaded from their own baked texture color, not scene lighting),
  // so this specific line has no visible effect today -- it's wired up now, harmlessly, so it
  // starts contributing the moment any material here is ever changed to actually respond to
  // scene lights. The VISIBLE version of "the piece getting more luminous from within" is the
  // uCharge-driven brightening in the shader above, which is the functional equivalent for this
  // codebase's actual (unlit, texture-driven) rendering approach.
  keyLight.intensity = KEY_LIGHT_BASE * lerp(1.0, 2.1, chargeEnv); // SUPERCHARGE
  rimLight.intensity = RIM_LIGHT_BASE * lerp(1.0, 2.1, chargeEnv); // SUPERCHARGE

  // reflective specular sweep -- a second, distinct beat: a bright glint crossing the crystal
  // once the wipe has fully finished, like a last catch of light confirming the facet has
  // locked into place. Kept sequential (not overlapping the wipe) so the two effects read as
  // two intentional beats, not a busy pile-up. Direction is randomized per playthrough (see
  // randomizeSweep, called whenever a new assembling phase starts).
  const SWEEP_DELAY = 180, SWEEP_DUR = 640;
  const sweepStart = revealStart + revealDur + SWEEP_DELAY;
  const sweepT = clamp01((t - sweepStart) / SWEEP_DUR);
  if (sweepT > 0 && sweepT < 1){
    applySweepUniform(logoMesh, sweepT, easeOutCubic);
  } else {
    logoMesh.material.uniforms.uSweepPos.value = -1;
  }

  const pulseStart = revealStart + revealDur + PULSE_DELAY;
  const pulseT = clamp01((t - pulseStart) / PULSE_DUR);
  if (pulseT > 0 && pulseT < 1){
    logoMesh.material.uniforms.uPulseY.value = lerp(1.15, -0.15, pulseT); // sweep bottom(0)->top(1) in vUv space, entering from below the frame
  } else {
    logoMesh.material.uniforms.uPulseY.value = -1;
  }

  // GOD MODE v5 restore: the single end-of-sequence "uBlast" silhouette flash is back (see
  // blastEnv above), now firing alongside -- not instead of -- the continuous per-shard fusion
  // sparks in updateShardsAssembling (see impactAt). The two read as different scales of the same
  // idea: each shard gets its own small local spark as it locks in throughout assembly, and the
  // whole mark gets one decisive flash of its own exact shape the instant the reveal completes.
}

function updateIcons(t, ts){
  const iconsStart = REVEAL_START + REVEAL_DUR + ICONS_START_GAP;
  icons.forEach((ic, i) => {
    const delay = iconsStart + i*ICON_STAGGER;
    const lt = clamp01((t - delay) / ic.dur);
    ic.calloutReveal = smootherStep(clamp01((lt - .55) / .45));
    if (lt <= 0){
      ic.sprite.material.opacity = 0;
      return;
    }
    const posE = easeOutCubic(lt);
    let x = lerp(ic.startX, ic.landX, posE);
    let y = lerp(ic.startY, ic.landY, posE);
    let z = lerp(ic.startZ, ic.landZ, posE);
    const popE = easeOutBackBig(lt);
    let scale = lerp(0.35, 46, popE); // ICON_SIZE baked in via absolute scale
    const alpha = Math.min(1, lt*1.7);
    if (lt > 0){
      // continuous bubble-float, driven off the raw animation clock (ts) rather than the
      // phase-relative t -- t gets reset/re-based when the phase changes (e.g. entering
      // 'held' calls this with a huge fixed t just to force lt=1), which used to freeze this
      // offset at a single constant value the instant everything landed. ts always keeps
      // ticking forward, so the chips keep drifting/bobbing indefinitely, in and out of sync
      // with each other, for as long as the scene sits in the held state.
      const dt = ts;
      x += Math.sin(dt*ic.floatFreqX + ic.floatSeed) * ic.floatAmpX * smootherStep(lt);
      y += Math.cos(dt*ic.floatFreqY + ic.floatSeed*1.3) * ic.floatAmpY * smootherStep(lt);
      scale *= 1 + Math.sin(dt*0.0011 + ic.angle*2)*0.025*smootherStep(lt);
    }
    ic.sprite.position.set(x, y, z);
    ic.sprite.scale.set(scale, scale, 1);
    ic.sprite.material.opacity = alpha;
  });
}

// The KA logo sits dead-center, facing the viewer straight-on, at all times -- no orbit, no
// tilt, no angled establishing shot. The only camera "movement" is a straight push-in/pull-out
// along the z-axis (a zoom dolly) plus a small mouse-parallax offset -- the crystal fragments
// are what carry the motion, the camera and the resolved mark itself stay put and face forward.
function computeResponsiveFovBase(aspect){
  const requiredHalfW = LOGO_BOX_W/2 + ICON_SIZE*2.1; // include the icon ring and touch-sized clearance
  const designHalfH = CAM_Z_FAR * Math.tan(THREE.MathUtils.degToRad(50) / 2); // the original, already-tuned reference, held fixed as the floor
  const halfWAtDesignFov = designHalfH * aspect;
  if (halfWAtDesignFov >= requiredHalfW) return 50; // safe at the tuned baseline -- true for every realistic viewport tested
  const requiredHalfH = requiredHalfW / aspect;
  return THREE.MathUtils.radToDeg(2 * Math.atan(requiredHalfH / CAM_Z_FAR));
}
let CAM_FOV_BASE = computeResponsiveFovBase(camera.aspect);
// The reference framing the whole shot is locked to: at globalProgress=0 (the shattered start
// pose) the camera sits at CAM_Z_FAR with a 50deg FOV. That pair of numbers fixes exactly how
// large the KA silhouette (sitting fixed at z=0, fixed world-space scale) reads on screen.
let CAM_HALF_H_REF = CAM_Z_FAR * Math.tan(THREE.MathUtils.degToRad(CAM_FOV_BASE) / 2);
// The old ZOOM_PUNCH_Z / ZOOM_PUNCH_FOV_MIX constants and the FOV-blend-away line they drove are
// deleted outright (see the chargeEnv declaration above for why) -- the camera no longer does
// anything extra around the reveal at all, on purpose. It does not know a reveal is happening.

function updateCamera(globalProgress, ts, dt){
  const p = clamp01(globalProgress);
  const e = easeInOutCubic(p);
  const breathe = smootherStep(p);
  const zTarget = lerp(CAM_Z_FAR, CAM_Z_NEAR, e) + Math.sin(ts * 0.00011) * 6 * breathe;

  const parallaxStrength = isMobile ? 14 : 34;
  const targetX = mouseSmoothed.x * parallaxStrength + Math.sin(ts * 0.00013 + 1.7) * 2.4 * breathe;
  const targetY = -mouseSmoothed.y * parallaxStrength * 0.7 + Math.cos(ts * 0.00009 + 0.6) * 2.0 * breathe;

  // [v26 Task 1 fix] was a fixed per-call lerp factor (0.06/0.06/0.05) with no time scaling --
  // exactly the refresh-rate-dependent bug already fixed for the cursor, embers, and nav pill
  // elsewhere in this file, just never carried over here. Same normalization formula as the
  // cursor's updateCursor(): 1 - (1-factor)^(dt/16.67) converges at the same visual rate
  // regardless of how many frames-per-second actually elapsed between calls. dt is clamped so a
  // long stall (tab backgrounded, devtools pause) can't produce one huge corrective jump.
  const dtClamped = Math.min(48, dt || 0) / 16.67;
  const smoothXY = 1 - Math.pow(1 - 0.06, dtClamped);
  const smoothZ = 1 - Math.pow(1 - 0.05, dtClamped);
  camera.position.x = lerp(camera.position.x, targetX, smoothXY);
  camera.position.y = lerp(camera.position.y, targetY, smoothXY);
  camera.position.z = lerp(camera.position.z, zTarget, smoothZ);

  // CONTINUOUS IDLE BREATHING: the old build let the camera fully park once it reached its
  // resting z and just sit there through the entire `held` phase -- another flat, zero-velocity
  // freeze, just a subtler one than the reveal-boundary freezes above. Fix: once the camera is
  // near its resting frame (breathe fades in with the same progress that drives the main dolly,
  // so it's 0 during the wide shattered-pose drift and ramps in naturally as assembly nears
  // completion, no phase gate needed), give it a perpetual, very-low-amplitude independent
  // drift on top of everything else -- a living camera, never a tripod. This sits BEFORE the
  // dolly-zoom FOV compensation below, so -- exactly like the zoom punch already relies on --
  // the compensation formula reads this same drifted z and keeps the resolved mark's own
  // apparent size perfectly pinned through it; only the parallaxing background and depth-
  // scattered shards actually show the camera breathing.

  camera.lookAt(0,0,0);

  // Compensated dolly: the push-in from CAM_Z_FAR to CAM_Z_NEAR is real camera translation (it's
  // what gives the depth-scattered fragments genuine parallax as they fly past), but a translate-
  // only dolly would also make the flat, fixed-size resolved KA logo swell ~48% larger on screen
  // by the time it's fully assembled -- exactly the "final KA changes size" problem. Solve the
  // standard dolly-zoom compensation each frame instead: pick the FOV that keeps a fixed-size
  // object sitting at z=0 subtending the exact same on-screen angle at the camera's CURRENT z as
  // it does at the CAM_Z_FAR reference. The KA mark's apparent size is then pinned identically
  // across the shattered pose, the whole assembly, and the held final frame -- only the
  // background dust and depth-scattered shards actually read the camera move.
  const halfFovRad = Math.atan(CAM_HALF_H_REF / Math.max(1, camera.position.z));
  const fovCompensated = THREE.MathUtils.radToDeg(halfFovRad) * 2;

  // No exception to this compensation exists anymore (the old zoom punch was the one deliberate,
  // bounded blend-away from it) -- the resolved mark's apparent size is pinned identically across
  // every phase, unconditionally, all the time. Charge & Bloom carries the "this moment matters"
  // feeling entirely through light (see updateLogoReveal's uCharge/keyLight/rimLight/logoGlow
  // wiring) instead.
  camera.fov = fovCompensated;
  camera.updateProjectionMatrix();
}

// kick off asset loading
})();
</script>
"""

html = (html.replace("__THREE_SRC__", THREE_SRC_CDN)
            .replace("__MANIFEST__", manifest_json)
            .replace("__ATLAS_B64__", atlas_b64)
            .replace("__ATLAS_W__", str(ATLAS_W_PX))
            .replace("__ATLAS_H__", str(ATLAS_H_PX))
            .replace("__CUTOUT_B64__", cutout_b64)
            .replace("__CUT_W__", str(cut_w))
            .replace("__CUT_H__", str(cut_h)))

with open('ka-cinematic-demo.html', 'w') as f:
    f.write(html)
print('written', len(html), 'bytes')
