"""
Patches ../index.html in place with the output of subdivide_shards.py:
  - const MANIFEST = {...};   (line with the full shards array)
  - const ATLAS_SRC = "data:image/png;base64,...";
  - const ATLAS_W = W, ATLAS_H = H;

Nothing else in index.html is touched -- no regeneration, no template re-run. Run
subdivide_shards.py first; this script fails loudly if its output files are missing.
"""
import base64, json
from pathlib import Path

HERE = Path(__file__).parent
INDEX_PATH = HERE.parent / "index.html"
MANIFEST_PATH = HERE / "ka-shards-manifest2.subdivided.json"
ATLAS_PATH = HERE / "ka-shards-atlas2-subdivided.png"

if not MANIFEST_PATH.exists() or not ATLAS_PATH.exists():
    raise SystemExit("Run subdivide_shards.py first -- its output files are missing.")

manifest = json.loads(MANIFEST_PATH.read_text())
atlas_bytes = ATLAS_PATH.read_bytes()
atlas_b64 = base64.b64encode(atlas_bytes).decode()

from PIL import Image
atlas_w, atlas_h = Image.open(ATLAS_PATH).size

# read with newline='' so each line's original terminator (this file is CRLF) is preserved
# exactly, and only the three target lines are ever touched.
with open(INDEX_PATH, "r", encoding="utf-8", newline="") as f:
    lines = f.readlines()

def replace_line(lines, needle, new_content_no_eol):
    for i, line in enumerate(lines):
        if line.startswith(needle):
            eol = "\r\n" if line.endswith("\r\n") else "\n"
            lines[i] = new_content_no_eol + eol
            return i
    raise SystemExit(f"Could not find a line starting with: {needle!r}")

manifest_json = json.dumps(manifest, separators=(",", ":"))
i_manifest = replace_line(lines, "const MANIFEST = ", f"const MANIFEST = {manifest_json};")
i_atlas_src = replace_line(lines, "const ATLAS_SRC = ", f'const ATLAS_SRC = "data:image/png;base64,{atlas_b64}";')
i_atlas_wh = replace_line(lines, "const ATLAS_W = ", f"const ATLAS_W = {atlas_w}, ATLAS_H = {atlas_h};")

with open(INDEX_PATH, "w", encoding="utf-8", newline="") as f:
    f.writelines(lines)

print(f"Patched index.html lines: MANIFEST={i_manifest+1}, ATLAS_SRC={i_atlas_src+1}, ATLAS_W/H={i_atlas_wh+1}")
print(f"New atlas: {atlas_w}x{atlas_h}, {len(manifest['shards'])} shards, {len(atlas_bytes)/1e6:.2f}MB PNG -> {len(atlas_b64)/1e6:.2f}MB base64")
