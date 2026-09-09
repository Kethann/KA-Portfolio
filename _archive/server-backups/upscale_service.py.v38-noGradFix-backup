"""
Real deep-learning image super-resolution service (GOD MODE v37).

Replaces the earlier client-side WebGL/UpscalerJS pipeline (see index.html history) with genuine
server-side inference using a real pretrained CNN from the Hugging Face Hub -- EDSR (Enhanced
Deep Residual Networks for Single Image Super-Resolution, Lim et al. 2017), loaded via the
`super-image` package's `eugenesiow/edsr-base` weights.

Why this model: evaluated against Real-ESRGAN, GFPGAN, and SwinIR per the brief.
- Real-ESRGAN / SwinIR: excellent quality, but their reference PyTorch implementations pull in
  heavier dependency chains (basicsr/mmcv, custom CUDA-oriented ops) that are unreliable to build
  cleanly on CPU-only Windows without a working compiler toolchain, and their full checkpoints
  (60-70MB+) are noticeably slower per-image on CPU than what this feature needs to stay
  responsive as a live web request.
- GFPGAN: face-specific restoration, not general-purpose -- wrong tool for arbitrary
  photos/animals/landscapes, which is the actual ask here.
- EDSR (via `super-image`, an HF-Hub-native, pip-installable, actively maintained wrapper):
  a genuine trained super-resolution CNN (not interpolation), ~6MB weights, permissive license,
  and empirically verified during development to measurably increase image sharpness
  (Laplacian-variance) beyond plain bicubic resize on the same blurred input -- see the
  validation note in index.html's upscaler JS comment for the actual measured numbers. The full
  (non "-base") EDSR checkpoint was also evaluated and rejected: ~30x larger and impractically
  slow on CPU here (no result within 180s on a 200x200 input), not viable for a synchronous web
  request.

  CPU inference speed, corrected after real (not just tiny-synthetic-image) benchmarking on this
  host: roughly 3-10s for inputs up to ~512px on the longest side, growing sharply past that
  (~20-30s at 700-800px, and a real out-of-memory failure at 1024px -- a single conv layer near
  the network's tail needs to allocate a contiguous ~2.7GB buffer at that resolution, which this
  host cannot satisfy). MAX_INPUT_DIMENSION below is set from these actual measurements, not the
  "well under a second" estimate an earlier version of this comment claimed based only on a
  200x200 synthetic test image -- that number never held for realistic photo sizes.

Runs as its own small FastAPI process (bound to 127.0.0.1 only -- never exposed directly to the
internet); server/index.js proxies /api/enhance to it. Kept as a separate Python process rather
than merged into the Node server because the ML runtime (PyTorch + model) has nothing to do with
the rest of the site's stack and isolating it means the Node process's memory/uptime is never at
risk from ML inference issues.
"""
import os

# KMP_DUPLICATE_LIB_OK=TRUE avoids a class of crash where torch (via Intel MKL) and opencv-python
# each load their own OpenMP runtime into the same process; harmless to set unconditionally, kept
# as a defensive measure. It was NOT, however, the actual cause of the crash found and fixed
# during this round -- see the torch.no_grad() note below for that.
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
from super_image import EdsrModel, ImageLoader

cv2.setNumThreads(0)  # avoid a second competing thread pool alongside torch's own

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("upscale_service")

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
# longest side, px, before feeding the model. Empirically measured on this host (see module
# docstring): 512px is ~7s, comfortably inside patience for a web request with a progress
# indicator; every larger step measured was both much slower (19-29s at 700-800px) and, at
# 1024px, a real allocation failure. Chosen over the original 1024px suggestion because that
# value provably doesn't run on this hardware -- shipping a cap the model can't actually satisfy
# would just trade the earlier silent hang for a guaranteed 500 on every larger photo.
MAX_INPUT_DIMENSION = 512
SCALE = 4
MODEL_NAME = "eugenesiow/edsr-base"

app = FastAPI(title="KA Crystal -- Image Enhancement Service")

_model = None
_model_error = None  # the specific exception from a failed load attempt, kept for diagnostics


@app.on_event("startup")
async def load_model_at_startup():
    # Loaded eagerly at process boot, not lazily on the first request -- a slow/failing Hugging
    # Face Hub fetch (network hiccup, stale/corrupted local cache, disk issue) now happens once,
    # visibly, in the startup log, rather than silently stalling whichever unlucky visitor's
    # request happens to be first. If this raises, uvicorn reports a failed startup and the
    # process exits -- server/enhance.js sees that exit and logs + retries, instead of the
    # service limping along in a state where every /enhance call would fail anyway.
    global _model, _model_error
    log.info("Loading super-resolution model %s (scale=%s)...", MODEL_NAME, SCALE)
    t0 = time.time()
    try:
        _model = EdsrModel.from_pretrained(MODEL_NAME, scale=SCALE)
        log.info("Model loaded successfully in %.2fs.", time.time() - t0)
    except Exception as exc:
        _model_error = f"{type(exc).__name__}: {exc}"
        log.exception("Model failed to load -- see traceback above. Root cause: %s", _model_error)
        raise


@app.get("/health")
def health():
    return {
        "ok": _model is not None,
        "model": MODEL_NAME,
        "scale": SCALE,
        "loaded": _model is not None,
        "error": _model_error,
    }


@app.post("/enhance")
async def enhance(request: Request):
    if _model is None:
        # Should be unreachable in practice -- a failed startup load means uvicorn never finishes
        # starting, so enhance.js won't mark this service ready and the Node proxy short-circuits
        # before ever reaching here. Kept as an explicit, specific error rather than an assert,
        # in case this endpoint is ever hit directly during a race right at process boot.
        raise HTTPException(status_code=503, detail=f"The enhancement model isn't loaded ({_model_error or 'still starting'}).")

    # raw binary body (matches the site's existing raw-upload pattern, e.g. /api/creator/upload)
    # rather than multipart -- the Node proxy in front of this can then pipe the request straight
    # through with zero re-encoding.
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

    t0 = time.time()
    inputs = None
    try:
        inputs = ImageLoader.load_image(img)
        # The actual root cause of a real, reproduced crash found during this round: inference
        # run without torch.no_grad() builds and RETAINS the full autograd computation graph
        # (every intermediate activation, kept alive for a backward pass that inference never
        # performs) instead of freeing each layer's output as soon as the next layer consumes it.
        # That unbounded memory growth was what actually took the process down with a native
        # access violation on larger inputs -- confirmed by reproducing the same inputs with
        # no_grad() added: the crash became a clean, catchable RuntimeError("not enough memory...")
        # well before it could ever again bring down the whole process.
        with torch.no_grad():
            preds = _model(inputs)
    except Exception as exc:
        log.exception("Inference failed on a %sx%s input (resized=%s): %s", original_w, original_h, resized, exc)
        raise HTTPException(status_code=500, detail=f"Enhancement failed during processing: {type(exc).__name__}. Try a smaller image.")
    finally:
        # Free the input tensor promptly rather than waiting on Python's GC -- cheap insurance
        # against the same class of cross-request memory buildup this round's bug came from.
        del inputs
    elapsed = time.time() - t0
    log.info("Enhanced %sx%s -> input longest side %spx in %.2fs.", original_w, original_h, longest, elapsed)

    # Built directly from the model's output tensor (not via ImageLoader.save_image, whose
    # internal cv2.cvtColor(BGR2RGB) step mislabels an already-RGB array and swaps color
    # channels on save -- verified during development). This keeps colors correct.
    arr = preds.data.cpu().numpy()[0].transpose(1, 2, 0) * 255.0
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    out_img = Image.fromarray(arr, "RGB")

    buf = io.BytesIO()
    out_img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Enhance-Model": "edsr-base-4x",
            "X-Enhance-Seconds": f"{elapsed:.2f}",
            "X-Enhance-Input-Resized": "1" if resized else "0",
            "X-Enhance-Input-Width": str(original_w),
            "X-Enhance-Input-Height": str(original_h),
            "X-Enhance-Output-Width": str(out_img.width),
            "X-Enhance-Output-Height": str(out_img.height),
            "Access-Control-Expose-Headers": "X-Enhance-Model, X-Enhance-Seconds, X-Enhance-Input-Resized, X-Enhance-Input-Width, X-Enhance-Input-Height, X-Enhance-Output-Width, X-Enhance-Output-Height",
        },
    )


@app.exception_handler(Exception)
async def unhandled_error(request, exc):
    # The one thing the earlier build got wrong: this handler returned a generic message without
    # ever logging what actually happened, so a real failure (OOM, a corrupted cache file, a
    # dependency mismatch) looked identical to a routine 500 from the outside. Now always logged
    # with a full traceback first.
    log.exception("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "The enhancement service hit an unexpected error -- see server logs for the specific cause."})
