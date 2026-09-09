# Archived generator files

Moved here during the 2026-09-09 folder reorganization. Nothing in this folder is loaded or run
by the live site, the build, or any test — confirmed by project-wide reference search before
moving. Kept intact (not deleted) in case anything is still needed for reference.

## One-time patch, already applied to index.html
- `subdivide_shards.py` — a v20-era script that recomputed the shard atlas/manifest for extra
  fragment density. Its own docstring states it does **not** regenerate index.html wholesale
  (index.html has been hand-edited too extensively for that) — it only produces new data files.
- `patch_index_html.py` — patched `index.html`'s embedded `MANIFEST`/`ATLAS_SRC` in place with
  `subdivide_shards.py`'s output. Per its own docstring, this already ran; index.html's current
  embedded shard data is the result. Nothing re-invokes this script.
- `ka-shards-manifest2.subdivided.json`, `ka-shards-atlas2-subdivided.png` — the data files those
  two scripts produced/consumed. Archived alongside the scripts that used them.

## Orphaned reference snapshots (zero references anywhere)
- `liquid-nav.js`, `opening-fracture.js`, `skill-callouts.js`, `polished-ui.css`,
  `refinement.css` — standalone copies of logic that also exists inline in both
  `generator/build_cinematic.py` (as Python string literals) and in `index.html` itself.
  Grepped for references in every file in the project (each other, build_cinematic.py,
  index.html, ka-cinematic-demo.html): none found. Fully superseded duplicates.
