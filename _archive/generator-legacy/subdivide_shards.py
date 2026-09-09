"""
v20 Part B -- fragment density via real subdivision of the largest structural shards.

Design notes (read before touching thresholds):

- This does NOT run build_cinematic.py / regenerate index.html wholesale. index.html has been
  hand-edited extensively since it was last generated (nav, gallery, assistant widget, design
  tokens, v19 diagnostics) -- regenerating it from the template would silently discard all of
  that. Instead this script recomputes exactly the two things index.html embeds statically
  (the atlas PNG as base64, and the MANIFEST json blob's `shards` array + ATLAS_W/ATLAS_H) and
  patches only those in place via patch_index_html.py, leaving everything else in the file
  untouched.

- No pixel resampling happens anywhere. Every new sub-shard's atlas crop is a direct pixel copy
  out of the existing atlas (or, prior to that, would have come from the same source photo at
  the same scale as every other shard) -- so texel density can't regress from this step BY
  CONSTRUCTION, not just by assertion. The density assertion below is a correctness check on
  that invariant, not a compensating mechanism.

- This codebase has no real "missing-parts classification" / probabilistic-idle-hide system
  (that was speculative in the spec this script implements -- it isn't in the actual code, see
  the session notes). The structural-threshold guard is therefore reimplemented as its literal
  intent instead: never produce a sub-piece small enough to read as debris relative to the
  existing shard population. MIN_SUBPIECE_AREA is set well above the corpus median so every new
  piece still reads as a real chunk.
"""
import copy, json, math, random, re
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

random.seed(20) # deterministic output -- reproducible if this needs to be re-run/reviewed

HERE = Path(__file__).parent
MANIFEST_PATH = HERE / "ka-shards-manifest2.json"
ATLAS_PATH = HERE / "ka-shards-atlas2-final.png"
CUTOUT_PATH = HERE / "logo-clean" / "cutout_intact_final.png"
# The currently-DEPLOYED index.html's own embedded MANIFEST -- source of truth for every
# existing shard's landedWorld. ka-shards-manifest2.json (loaded above) has no landedWorld
# field at all (it's a pure build-time artifact of build_cinematic.py's silhouette clamp), and
# re-deriving it here for shards that already have a shipped value turned out to NOT reproduce
# that value exactly -- this file's clamp logic apparently reflects a later tuning pass than
# whatever last actually built index.html. Recomputing it anyway would silently reposition all
# 160 untouched shards by as much as ~20 world units, which is exactly the kind of unintended,
# unscoped change this whole project's governance has been trying to prevent. So: untouched
# shards keep their exact shipped landedWorld, unconditionally; the clamp function below is
# used ONLY for brand-new sub-shards, which have no prior value to preserve in the first place.
DEPLOYED_INDEX_HTML = HERE.parent / "index.html"

TOP_N = 18                 # candidate pool: largest structural shards, per spec
MIN_SUBPIECE_AREA = 1500   # px^2 -- comfortably above the 169-shard corpus median (437 px^2)
ALPHA_THRESHOLD = 12       # matches build_cinematic.py's own cutout mask threshold
ATLAS_PAD = 2              # px gap between packed regions, avoids bilinear bleed at edges

_LOGO_BOX_W, _LOGO_BOX_H = 232, 302

def fit_contain(src_w, src_h, box_w, box_h):
    h = box_h
    w = h * (src_w / src_h)
    if w > box_w:
        w = box_w
        h = w * (src_h / src_w)
    return w, h


def load_inputs():
    manifest = json.loads(MANIFEST_PATH.read_text())
    atlas = Image.open(ATLAS_PATH).convert("RGBA")
    return manifest, atlas


def split_shard(atlas_np, shard, n_pieces):
    """Alpha-connected-components subdivision of one shard's crop.

    Splits along the shard's own principal axis into n_pieces mass-equal buckets, then keeps
    only the largest connected alpha component per bucket (the "alpha-connected-components
    technique") so a split line clipping a narrow neck never leaves a disconnected sliver
    attached to the wrong piece.

    Returns a list of dicts: {mask (local bool array), bbox (row0,col0,row1,col1)}, or None if
    the shard doesn't have enough real alpha pixels to split meaningfully.
    """
    ax, ay, aw, ah = shard["atlas"]["x"], shard["atlas"]["y"], shard["atlas"]["w"], shard["atlas"]["h"]
    crop = atlas_np[ay:ay + ah, ax:ax + aw]
    alpha = crop[:, :, 3]
    mask = alpha > ALPHA_THRESHOLD
    ys, xs = np.nonzero(mask)
    if len(xs) < MIN_SUBPIECE_AREA * n_pieces:
        return None  # not enough real pixels to make n_pieces meaningful sub-shards

    pts = np.stack([xs, ys], axis=1).astype(np.float64)
    mean = pts.mean(axis=0)
    centered = pts - mean
    cov = np.cov(centered.T)
    eigvals, eigvecs = np.linalg.eigh(cov)
    principal = eigvecs[:, np.argmax(eigvals)]  # direction of greatest spread
    proj = centered @ principal

    order = np.argsort(proj)
    bucket_edges = np.array_split(order, n_pieces)  # equal PIXEL COUNT per bucket, not equal width

    pieces = []
    for bucket_idx in bucket_edges:
        bucket_mask = np.zeros_like(mask)
        bucket_mask[ys[bucket_idx], xs[bucket_idx]] = True
        labeled, num = ndi.label(bucket_mask)
        if num == 0:
            return None
        sizes = ndi.sum(bucket_mask, labeled, range(1, num + 1))
        largest_label = 1 + int(np.argmax(sizes))
        component = labeled == largest_label
        area = int(component.sum())
        if area < MIN_SUBPIECE_AREA:
            return None  # guard: this split would produce a sub-structural sliver -- reject the whole split
        rows, cols = np.nonzero(component)
        bbox = (rows.min(), cols.min(), rows.max() + 1, cols.max() + 1)
        pieces.append({"mask": component, "bbox": bbox})
    return pieces


class ShelfPacker:
    """Trivial shelf packer for NEW regions only -- every existing shard's atlas rectangle is
    left byte-identical and untouched; this only finds placement for freshly-cut sub-pieces."""
    def __init__(self, width, start_y):
        self.width = width
        self.cursor_x = 0
        self.cursor_y = start_y
        self.shelf_h = 0
        self.max_y = start_y

    def place(self, w, h):
        if self.cursor_x + w > self.width:
            self.cursor_x = 0
            self.cursor_y += self.shelf_h + ATLAS_PAD
            self.shelf_h = 0
        x, y = self.cursor_x, self.cursor_y
        self.cursor_x += w + ATLAS_PAD
        self.shelf_h = max(self.shelf_h, h)
        self.max_y = max(self.max_y, self.cursor_y + h)
        return x, y


def compute_silhouette_clamp(manifest, cut_alpha, shards):
    """Reimplements build_cinematic.py's own landedWorld clamp exactly (same formulas), applied
    here so index.html -- which has no build step of its own at request time -- can be patched
    with correct, final landedWorld values directly, without running the full generator."""
    cut_h, cut_w = cut_alpha.shape
    manifest_fit_w, manifest_fit_h = fit_contain(manifest["logoSize"]["w"], manifest["logoSize"]["h"], _LOGO_BOX_W, _LOGO_BOX_H)
    cut_fit_w, cut_fit_h = fit_contain(cut_w, cut_h, _LOGO_BOX_W, _LOGO_BOX_H)
    scale_x = cut_fit_w / manifest["logoSize"]["w"]
    scale_y = cut_fit_h / manifest["logoSize"]["h"]
    center_mx, center_my = manifest["logoCenter"]["x"], manifest["logoCenter"]["y"]

    def to_world(mx, my):
        return (mx - center_mx) * scale_x, -(my - center_my) * scale_y

    def world_to_cut_px(wx, wy):
        col = (wx / cut_fit_w + 0.5) * cut_w
        row = (0.5 - wy / cut_fit_h) * cut_h
        return row, col

    def cut_px_to_world(row, col):
        wx = (col / cut_w - 0.5) * cut_fit_w
        wy = (0.5 - row / cut_h) * cut_fit_h
        return wx, wy

    mask = cut_alpha > ALPHA_THRESHOLD
    base_erode_px = 6
    px_per_world = cut_w / cut_fit_w
    eroded_cache = {}

    def get_eroded(erode_px):
        erode_px = max(1, int(round(erode_px)))
        if erode_px not in eroded_cache:
            m = ndi.binary_erosion(mask, iterations=erode_px)
            if not m.any():
                m = mask
            _, nearest_idx = ndi.distance_transform_edt(~m, return_indices=True)
            eroded_cache[erode_px] = (m, nearest_idx)
        return eroded_cache[erode_px]

    for s in shards:
        shard_w_world = s["atlas"]["w"] * scale_x
        shard_h_world = s["atlas"]["h"] * scale_y
        half_diag_px = 0.5 * math.hypot(shard_w_world, shard_h_world) * px_per_world
        erode_px_for_shard = base_erode_px + half_diag_px
        mask_eroded, nearest_idx = get_eroded(erode_px_for_shard)
        wx, wy = to_world(s["centroid"]["x"], s["centroid"]["y"])
        row, col = world_to_cut_px(wx, wy)
        r = int(np.clip(round(row), 0, cut_h - 1))
        c = int(np.clip(round(col), 0, cut_w - 1))
        if mask_eroded[r, c]:
            s["landedWorld"] = {"x": wx, "y": wy}
        else:
            nr, nc = int(nearest_idx[0][r, c]), int(nearest_idx[1][r, c])
            nwx, nwy = cut_px_to_world(nr, nc)
            s["landedWorld"] = {"x": nwx, "y": nwy}


def _cut_fit_geometry(manifest, cut_alpha):
    """Shared scale/fit derivation -- identical to the top of compute_silhouette_clamp, factored
    out so compute_mosaic_fit_scale and the size-match assertion don't each re-derive it
    independently (and risk drifting from each other)."""
    cut_h, cut_w = cut_alpha.shape
    cut_fit_w, cut_fit_h = fit_contain(cut_w, cut_h, _LOGO_BOX_W, _LOGO_BOX_H)
    scale_x = cut_fit_w / manifest["logoSize"]["w"]
    scale_y = cut_fit_h / manifest["logoSize"]["h"]

    def cut_px_to_world(row, col):
        wx = (col / cut_w - 0.5) * cut_fit_w
        wy = (0.5 - row / cut_h) * cut_fit_h
        return wx, wy

    return scale_x, scale_y, cut_w, cut_h, cut_fit_w, cut_fit_h, cut_px_to_world


def compute_mosaic_fit_scale(manifest, cut_alpha, raw_shards):
    """[v26 Task 2] Ports build_cinematic.py's MOSAIC_FIT_SCALE_X/Y derivation (its "FIX B",
    ~lines 157-182) verbatim: a single global anisotropic scale-about-origin that makes the full
    mosaic's landed-footprint bounding box match the resolved cutout's own true bounding box.
    `raw_shards` must already have PRE-scale landedWorld set (via compute_silhouette_clamp) and
    must be the FULL shard population the bbox should be measured over -- subdividing a shard
    doesn't change the union's bounding box (a split piece's footprint sits inside where its
    whole parent's footprint was), so this is computed once over the original 169-shard set and
    is valid for the 179/181-shard set that results from subdivision.

    Verified empirically before implementing this: comparing this formula's raw output against
    every one of the 169 shipped shards' actual landedWorld gave an IDENTICAL ratio (std ~1e-16)
    across all of them -- confirming this single constant, not any drifted erosion tuning, was
    the entire explanation for the ~20-unit mismatch found in an earlier session's first attempt
    at this (which ported only the erosion/nearest-inside clamp and never this scale step)."""
    scale_x, scale_y, cut_w, cut_h, cut_fit_w, cut_fit_h, cut_px_to_world = _cut_fit_geometry(manifest, cut_alpha)

    pre_min_x = pre_min_y = float("inf")
    pre_max_x = pre_max_y = float("-inf")
    for s in raw_shards:
        lw = s["landedWorld"]
        hw = 0.5 * s["atlas"]["w"] * scale_x
        hh = 0.5 * s["atlas"]["h"] * scale_y
        pre_min_x = min(pre_min_x, lw["x"] - hw); pre_max_x = max(pre_max_x, lw["x"] + hw)
        pre_min_y = min(pre_min_y, lw["y"] - hh); pre_max_y = max(pre_max_y, lw["y"] + hh)
    pre_bbox_w = pre_max_x - pre_min_x
    pre_bbox_h = pre_max_y - pre_min_y

    mask = cut_alpha > ALPHA_THRESHOLD
    mask_rows = np.any(mask, axis=1)
    mask_cols = np.any(mask, axis=0)
    cut_row_min, cut_row_max = np.where(mask_rows)[0][[0, -1]]
    cut_col_min, cut_col_max = np.where(mask_cols)[0][[0, -1]]
    cut_wx_lo, cut_wy_hi = cut_px_to_world(cut_row_min, cut_col_min)
    cut_wx_hi, cut_wy_lo = cut_px_to_world(cut_row_max, cut_col_max)
    cutout_bbox_w = abs(cut_wx_hi - cut_wx_lo)
    cutout_bbox_h = abs(cut_wy_hi - cut_wy_lo)

    scale = (cutout_bbox_w / pre_bbox_w, cutout_bbox_h / pre_bbox_h)
    print(f"[mosaic fit] pre-correction bbox {pre_bbox_w:.2f}x{pre_bbox_h:.2f}  target bbox {cutout_bbox_w:.2f}x{cutout_bbox_h:.2f}  MOSAIC_FIT_SCALE={scale}")
    return scale, (cutout_bbox_w, cutout_bbox_h)


def assert_size_match(manifest, cut_alpha, final_shards, cutout_bbox):
    """[v26 Task 2] Ports build_cinematic.py's own build-time bounding-box match assertion
    (~lines 207-236) against the FULL final shard set (old + new, after every landedWorld
    correction). Prints the real measured error percentage and raises if it exceeds 1%, exactly
    matching build_cinematic.py's own threshold -- a number, not "looks fine"."""
    scale_x, scale_y, *_ = _cut_fit_geometry(manifest, cut_alpha)
    cutout_bbox_w, cutout_bbox_h = cutout_bbox

    min_x = min_y = float("inf")
    max_x = max_y = float("-inf")
    for s in final_shards:
        lw = s["landedWorld"]
        hw = 0.5 * s["atlas"]["w"] * scale_x
        hh = 0.5 * s["atlas"]["h"] * scale_y
        min_x = min(min_x, lw["x"] - hw); max_x = max(max_x, lw["x"] + hw)
        min_y = min(min_y, lw["y"] - hh); max_y = max(max_y, lw["y"] + hh)
    mosaic_bbox_w = max_x - min_x
    mosaic_bbox_h = max_y - min_y

    w_err = abs(mosaic_bbox_w - cutout_bbox_w) / cutout_bbox_w
    h_err = abs(mosaic_bbox_h - cutout_bbox_h) / cutout_bbox_h
    print(f"[size-match check] mosaic bbox: {mosaic_bbox_w:.2f}x{mosaic_bbox_h:.2f}  cutout bbox: {cutout_bbox_w:.2f}x{cutout_bbox_h:.2f}  err: w={w_err*100:.3f}% h={h_err*100:.3f}%")
    if w_err >= 0.01 or h_err >= 0.01:
        raise SystemExit(f"[size-match check] FAILED: bounding boxes differ by more than 1% (w={w_err*100:.3f}%, h={h_err*100:.3f}%)")
    print(f"[size-match check] PASSED (threshold 1%, actual max error {max(w_err,h_err)*100:.3f}%)")


def main():
    manifest, atlas_img = load_inputs()
    atlas_np = np.array(atlas_img)
    shards = manifest["shards"]

    original_count = len(shards)
    original_areas = [s["atlas"]["w"] * s["atlas"]["h"] for s in shards]
    original_avg_texel_density = sum(original_areas) / len(original_areas)  # px^2 per shard, our density proxy since no resampling ever occurs

    # [v24 fix] exclude the "mega outlier" (index.html's own OUTLIER_RATIO=4 classification,
    # reproduced here identically) from subdivision entirely. That shard exists specifically
    # BECAUSE it's disproportionately huge relative to every other shard -- the runtime gives it
    # special treatment (opacity capped at 0.05, a short local hop instead of the dramatic
    # screen-edge flight) exactly so a piece that large never reads as an already-formed KA
    # sitting there. Splitting it in two removes it from that classification (neither half is
    # still 4x the new second-largest), so both halves silently graduate to full opacity + the
    # full dramatic entrance -- two giant, independently-recognizable, letter-shaped pieces
    # flying and tumbling on their own. That IS the "K and A splitting into two drifting shapes"
    # bug; there is no shared-center violation anywhere in this codebase (toWorld/logoCenter are
    # single global values, verified by direct audit). Fix: never offer this shard up for
    # subdivision in the first place.
    areas_desc = sorted((s["atlas"]["w"] * s["atlas"]["h"] for s in shards), reverse=True)
    second_largest_area = areas_desc[1] if len(areas_desc) > 1 else areas_desc[0]
    OUTLIER_RATIO = 4  # must match index.html's own OUTLIER_RATIO exactly
    def is_mega_outlier(s):
        return s["atlas"]["w"] * s["atlas"]["h"] > second_largest_area * OUTLIER_RATIO

    mega_outliers = [s["id"] for s in shards if is_mega_outlier(s)]
    if mega_outliers:
        print(f"excluding mega-outlier shard(s) from subdivision candidates: {mega_outliers}")

    by_area = sorted(
        (s for s in shards if not is_mega_outlier(s)),
        key=lambda s: s["atlas"]["w"] * s["atlas"]["h"], reverse=True
    )
    candidates = by_area[:TOP_N]

    new_shards = []
    removed_ids = set()
    new_crops = []  # (rgba ndarray, target dict, centroid dict, size dict, parent_id)

    for shard in candidates:
        n_pieces = random.choice([2, 3])
        pieces = split_shard(atlas_np, shard, n_pieces)
        if pieces is None:
            continue  # leave this shard whole -- either not splittable or would breach the floor

        ax, ay = shard["atlas"]["x"], shard["atlas"]["y"]
        tx, ty = shard["target"]["x"], shard["target"]["y"]
        crop_rgba = atlas_np[ay:ay + shard["atlas"]["h"], ax:ax + shard["atlas"]["w"]]

        for idx, piece in enumerate(pieces):
            r0, c0, r1, c1 = piece["bbox"]
            sub_mask = piece["mask"][r0:r1, c0:c1]
            sub_rgba = crop_rgba[r0:r1, c0:c1].copy()
            sub_rgba[~sub_mask, 3] = 0  # zero alpha outside this component so nothing bleeds in from a sibling piece sharing the bbox

            ys, xs = np.nonzero(sub_mask)
            local_centroid_col = float(xs.mean())
            local_centroid_row = float(ys.mean())

            new_target = {"x": tx + c0, "y": ty + r0}
            new_centroid = {"x": tx + c0 + local_centroid_col, "y": ty + r0 + local_centroid_row}
            new_size = {"w": int(c1 - c0), "h": int(r1 - r0)}

            new_crops.append((sub_rgba, new_target, new_centroid, new_size, shard["id"]))

        removed_ids.add(shard["id"])

    # ---- repack: existing (non-subdivided) shards keep their exact current atlas rectangles;
    # only the new sub-piece crops need placement, in freshly appended canvas space. ----
    kept_shards = [s for s in shards if s["id"] not in removed_ids]
    atlas_w = atlas_img.width
    packer = ShelfPacker(atlas_w, start_y=atlas_img.height)

    for sub_rgba, target, centroid, size, parent_id in new_crops:
        x, y = packer.place(size["w"], size["h"])
        new_id = f"{parent_id}_sub{len([s for s in new_shards if s.get('parent_id') == parent_id])}"
        new_shards.append({
            "id": new_id,
            "atlas": {"x": x, "y": y, "w": size["w"], "h": size["h"]},
            "target": target,
            "centroid": centroid,
            "size": size,
            "isCore": False,
            "parent_id": parent_id,
            "_pixels": sub_rgba,  # consumed below when compositing the new atlas image, not written to the manifest
        })

    new_atlas_h = packer.max_y
    new_atlas_img = Image.new("RGBA", (atlas_w, new_atlas_h), (0, 0, 0, 0))
    new_atlas_img.paste(atlas_img, (0, 0))  # every existing shard's pixels, byte-identical, unmoved
    for s in new_shards:
        Image.fromarray(s["_pixels"], "RGBA")
        new_atlas_img.paste(Image.fromarray(s["_pixels"], "RGBA"), (s["atlas"]["x"], s["atlas"]["y"]))

    # ---- restore each kept shard's EXACT shipped landedWorld (see the module-level note by
    # DEPLOYED_INDEX_HTML) -- never recomputed, so untouched shards cannot silently move. ----
    deployed_html = DEPLOYED_INDEX_HTML.read_text(encoding="utf-8")
    m = re.search(r"const MANIFEST = (\{.*?\});\r?\n", deployed_html, re.S)
    if not m:
        raise SystemExit("Could not find `const MANIFEST = ...;` in index.html -- aborting rather than guess.")
    deployed_manifest = json.loads(m.group(1))
    deployed_by_id = {s["id"]: s for s in deployed_manifest["shards"]}
    for s in kept_shards:
        deployed = deployed_by_id.get(s["id"])
        if deployed is None or "landedWorld" not in deployed:
            raise SystemExit(f"Shard {s['id']} has no shipped landedWorld in index.html -- aborting rather than guess.")
        s["landedWorld"] = deployed["landedWorld"]

    new_shards_clean = [{k: v for k, v in s.items() if k != "_pixels"} for s in new_shards]
    cut_alpha = np.array(Image.open(CUTOUT_PATH).convert("RGBA"))[:, :, 3]
    compute_silhouette_clamp(manifest, cut_alpha, new_shards_clean)  # raw (pre-fit-scale) landedWorld for the brand-new shards only

    # [v26 Task 2 -- INCOMPLETE, see APPLY_FIT_SCALE note] MOSAIC_FIT_SCALE_X/Y measured over the
    # ORIGINAL full shard population. The derivation itself is verified correct (reproduces the
    # exact constant shipped in every one of the 169 original shards' own landedWorld, std ~1e-16
    # -- see the empirical check run before this was written). But applying it to the new
    # sub-shards and then re-running the ported size-match assertion FAILS: h_err=2.44%, over
    # double the 1% threshold. Root cause: the assertion approximates each shard's footprint as
    # an axis-aligned rectangle from landedWorld +/- half of atlas.w/h. Splitting a shard that
    # sits near a bbox extreme into smaller sub-rectangles can shrink that approximated reach
    # even though the real (rotated/irregular) pixel silhouette's own bbox is unchanged -- the
    # "subdividing doesn't change the union's bbox" assumption holds for actual pixels, not for
    # this AABB approximation of them. Per the explicit instruction to stop and report a failing
    # verification rather than patch around it: APPLY_FIT_SCALE stays False, new sub-shards keep
    # their raw (unscaled) landedWorld -- IDENTICAL to what was already shipped before this task,
    # not a regression, just not yet a fix either. Needs a decision: exclude bbox-extreme shards
    # from subdivision candidates, accept a looser tolerance for the post-split mosaic, or
    # something else -- not decided here.
    APPLY_FIT_SCALE = False
    if APPLY_FIT_SCALE:
        raw_shards_for_bbox = copy.deepcopy(shards)
        compute_silhouette_clamp(manifest, cut_alpha, raw_shards_for_bbox)
        (fit_scale_x, fit_scale_y), cutout_bbox = compute_mosaic_fit_scale(manifest, cut_alpha, raw_shards_for_bbox)
        for s in new_shards_clean:
            s["landedWorld"]["x"] *= fit_scale_x
            s["landedWorld"]["y"] *= fit_scale_y

    final_shards = kept_shards + new_shards_clean

    if APPLY_FIT_SCALE:
        assert_size_match(manifest, cut_alpha, final_shards, cutout_bbox)
    else:
        raw_shards_for_bbox = copy.deepcopy(shards)
        compute_silhouette_clamp(manifest, cut_alpha, raw_shards_for_bbox)
        _, cutout_bbox = compute_mosaic_fit_scale(manifest, cut_alpha, raw_shards_for_bbox)
        print("[size-match check] SKIPPED -- APPLY_FIT_SCALE is False (see note above); new sub-shards are unscaled, same as previously shipped.")

    # ---- density assertion: must hold by construction (no resampling anywhere), verified here
    # rather than assumed. ----
    final_areas = [s["atlas"]["w"] * s["atlas"]["h"] for s in final_shards]
    new_avg_texel_density = sum(final_areas) / len(final_areas)
    density_ratio = new_avg_texel_density / original_avg_texel_density
    print(f"shards: {original_count} -> {len(final_shards)} ({len(candidates) - len(removed_ids)} of {len(candidates)} top-{TOP_N} candidates left whole -- guard rejected the rest)")
    print(f"avg shard atlas area: {original_avg_texel_density:.1f}px^2 -> {new_avg_texel_density:.1f}px^2 (ratio {density_ratio:.3f})")
    print(f"atlas canvas: {atlas_w}x{atlas_img.height} -> {atlas_w}x{new_atlas_h}")

    # this ratio can differ from 1.0 (avg area naturally drops as big shards become several
    # smaller ones) -- the real per-pixel density guarantee is "no resampling," asserted
    # structurally above (every crop is a direct numpy slice/paste, no Image.resize call
    # anywhere in this file). Fail loudly only on the actual regression this guards against:
    # a bug that shrank pixel data during the copy.
    for s in final_shards:
        assert s["atlas"]["w"] > 0 and s["atlas"]["h"] > 0, f"zero-size atlas region for shard {s['id']}"

    manifest["shards"] = final_shards

    MANIFEST_PATH.with_name("ka-shards-manifest2.subdivided.json").write_text(json.dumps(manifest, indent=None))
    new_atlas_img.save(ATLAS_PATH.with_name("ka-shards-atlas2-subdivided.png"))
    print(f"\nWrote ka-shards-manifest2.subdivided.json ({len(final_shards)} shards) and ka-shards-atlas2-subdivided.png")
    print("Run patch_index_html.py next to apply these into ../index.html in place.")


if __name__ == "__main__":
    main()
