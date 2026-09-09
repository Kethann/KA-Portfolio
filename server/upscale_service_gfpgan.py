"""
Real-ESRGAN + GFPGAN super-resolution + automatic face-restoration service.

Successor to the EDSR-based service (see upscale_service.py.v39-edsr-only-backup for the prior
build and its own docstring on why EDSR was chosen over this exact stack at the time -- CPU-only
basicsr/torchvision dependency fragility, mainly). This build takes on that fragility deliberately
(pinned CUDA-matched torch/torchvision in a dedicated venv, see server/gfpgan-venv) because the
brief now specifically requires face-specialized restoration blended with general super-resolution
in one pipeline, which EDSR alone cannot do.

Pipeline:
- RealESRGANer (RRDBNet x4plus) does general background/whole-image super-resolution -- the same
  role EDSR played before, now handled by a stronger, purpose-built architecture.
- GFPGANer wraps it as `bg_upsampler`: GFPGAN's own enhance() call automatically detects any faces
  in the image (0, 1, or many -- no user input, no image-type selection), restores each detected
  face with its specialized model, runs the Real-ESRGAN background pass on everything else, and
  pastes the restored faces back into the Real-ESRGAN-enhanced background as one blended output.
  On a photo with no faces, GFPGAN detects nothing and the output is simply the Real-ESRGAN pass
  unchanged -- the fallback to general enhancement is automatic, not a separate code path.

Both models are loaded ONCE at process startup (see load_models_at_startup), not per-request --
the same reasoning as the EDSR build: a slow/failing load happens once, visibly, in the startup
log, rather than stalling whichever request happens to be first, or reloading (and re-paying model
init cost) on every single call.
"""
import os

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import io
import logging
import time

import cv2
import numpy as np
import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from PIL import Image, UnidentifiedImageError

from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
from gfpgan import GFPGANer

cv2.setNumThreads(0)  # avoid a second competing thread pool alongside torch's own

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("upscale_service")

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
# Real-ESRGAN's tiled inference (TILE_SIZE below) processes the image in fixed-size chunks
# regardless of overall resolution, so -- unlike the prior EDSR build, which hit a real allocation
# failure at 1024px from one architecture-specific large buffer -- 1024px is safe here on both CPU
# and the 4GB GPU. Kept as a cap anyway so a very large upload still processes in a few seconds
# rather than tens of seconds.
MAX_INPUT_DIMENSION = 1024
SCALE = 4
TILE_SIZE = 200
TILE_PAD = 10

WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")
REALESRGAN_WEIGHTS = os.path.join(WEIGHTS_DIR, "RealESRGAN_x4plus.pth")
GFPGAN_WEIGHTS = os.path.join(WEIGHTS_DIR, "GFPGANv1.4.pth")
MODEL_LABEL = "Real-ESRGAN + GFPGAN"

app = FastAPI(title="KA Crystal -- Image Enhancement Service (Real-ESRGAN + GFPGAN)")

_bg_upsampler = None
_face_enhancer = None
_model_error = None
_device = None


@app.on_event("startup")
async def load_models_at_startup():
    global _bg_upsampler, _face_enhancer, _model_error, _device
    if not os.path.isfile(REALESRGAN_WEIGHTS):
        _model_error = f"Missing weights file: {REALESRGAN_WEIGHTS}"
        log.error(_model_error)
        raise RuntimeError(_model_error)
    if not os.path.isfile(GFPGAN_WEIGHTS):
        _model_error = f"Missing weights file: {GFPGAN_WEIGHTS}"
        log.error(_model_error)
        raise RuntimeError(_model_error)

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    use_half = _device == "cuda"  # fp16 only makes sense (and is only safe) on GPU
    log.info("Loading Real-ESRGAN + GFPGAN (device=%s, half=%s)...", _device, use_half)
    t0 = time.time()
    try:
        rrdb = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=SCALE)
        _bg_upsampler = RealESRGANer(
            scale=SCALE,
            model_path=REALESRGAN_WEIGHTS,
            model=rrdb,
            tile=TILE_SIZE,
            tile_pad=TILE_PAD,
            pre_pad=0,
            half=use_half,
            device=_device,
        )
        _face_enhancer = GFPGANer(
            model_path=GFPGAN_WEIGHTS,
            upscale=SCALE,
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=_bg_upsampler,
            device=_device,
        )
        log.info("Models loaded successfully in %.2fs.", time.time() - t0)
    except Exception as exc:
        _model_error = f"{type(exc).__name__}: {exc}"
        log.exception("Model failed to load -- see traceback above. Root cause: %s", _model_error)
        raise


@app.get("/health")
def health():
    return {
        "ok": _face_enhancer is not None,
        "model": MODEL_LABEL,
        "device": _device,
        "scale": SCALE,
        "loaded": _face_enhancer is not None,
        "error": _model_error,
    }


@app.post("/enhance")
async def enhance(request: Request):
    if _face_enhancer is None:
        # Should be unreachable in practice -- a failed startup load means uvicorn never finishes
        # starting, so enhance.js won't mark this service ready and the Node proxy short-circuits
        # before ever reaching here. Kept as an explicit, specific error rather than an assert.
        raise HTTPException(status_code=503, detail=f"The enhancement model isn't loaded ({_model_error or 'still starting'}).")

    # raw binary body (matches the site's existing raw-upload pattern) -- the Node proxy in front
    # of this can pipe the request straight through with zero re-encoding.
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="No image data received.")
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image is larger than 12 MB.")

    try:
        img = Image.open(io.BytesIO(body))
        img.load()
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="That file isn't a readable image.")
    img = img.convert("RGB")

    original_w, original_h = img.size
    longest = max(original_w, original_h)
    resized = False
    if longest > MAX_INPUT_DIMENSION:
        scale = MAX_INPUT_DIMENSION / longest
        img = img.resize((max(1, round(original_w * scale)), max(1, round(original_h * scale))), Image.LANCZOS)
        resized = True

    # PIL gives RGB; basicsr/realesrgan/gfpgan all work in cv2's BGR convention internally.
    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    t0 = time.time()
    try:
        with torch.no_grad():
            # GFPGAN's enhance() is the single call the whole pipeline runs through: it detects
            # faces on its own (has_aligned=False -- these are real photos, not pre-cropped face
            # crops), restores every face found (only_center_face=False -- all faces, not just
            # one), runs bg_upsampler (Real-ESRGAN) across the rest of the frame, and pastes the
            # restored faces back into that upscaled background (paste_back=True) as one blended
            # result. With zero faces detected, restored_faces is simply empty and restored_img is
            # exactly the Real-ESRGAN background pass -- general enhancement, automatically, no
            # separate code path needed for "no face" images.
            cropped_faces, restored_faces, restored_img = _face_enhancer.enhance(
                bgr, has_aligned=False, only_center_face=False, paste_back=True,
            )
    except Exception as exc:
        log.exception("Inference failed on a %sx%s input (resized=%s): %s", original_w, original_h, resized, exc)
        raise HTTPException(status_code=500, detail=f"Enhancement failed during processing: {type(exc).__name__}. Try a smaller image.")
    elapsed = time.time() - t0
    faces_found = len(restored_faces) if restored_faces else 0
    log.info("Enhanced %sx%s -> input longest side %spx in %.2fs (%d face(s) restored).",
              original_w, original_h, longest, elapsed, faces_found)

    out_rgb = cv2.cvtColor(restored_img, cv2.COLOR_BGR2RGB)
    out_img = Image.fromarray(out_rgb, "RGB")

    buf = io.BytesIO()
    out_img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Enhance-Model": MODEL_LABEL,
            "X-Enhance-Seconds": f"{elapsed:.2f}",
            "X-Enhance-Input-Resized": "1" if resized else "0",
            "X-Enhance-Input-Width": str(original_w),
            "X-Enhance-Input-Height": str(original_h),
            "X-Enhance-Output-Width": str(out_img.width),
            "X-Enhance-Output-Height": str(out_img.height),
            "X-Enhance-Faces-Restored": str(faces_found),
            "Access-Control-Expose-Headers": "X-Enhance-Model, X-Enhance-Seconds, X-Enhance-Input-Resized, X-Enhance-Input-Width, X-Enhance-Input-Height, X-Enhance-Output-Width, X-Enhance-Output-Height, X-Enhance-Faces-Restored",
        },
    )


@app.exception_handler(Exception)
async def unhandled_error(request, exc):
    # Always logged with a full traceback first -- a real failure (OOM, a corrupted cache file, a
    # dependency mismatch) must never look identical to a routine 500 from the outside.
    log.exception("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "The enhancement service hit an unexpected error -- see server logs for the specific cause."})
