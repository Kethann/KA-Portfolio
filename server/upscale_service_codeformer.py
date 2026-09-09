"""
Real-ESRGAN + CodeFormer super-resolution + automatic face-restoration service.

Same role as upscale_service_gfpgan.py (see that file's docstring for the general pipeline shape
and the fp16 backstory) but swaps GFPGAN for CodeFormer as the face-restoration engine, per direct
request. CodeFormer has no official PyPI package -- this uses the community `codeformer-pip`
wheel, which vendors its own copies of basicsr/facelib under the `codeformer.` namespace (kept
separate from this venv's own top-level basicsr/facexlib, which the Real-ESRGAN background
upsampler below still uses directly -- no conflict, just two independent copies).

CRITICAL HARDWARE FACT (confirmed by direct testing, not assumed): this host's GPU is a GTX 1650
(Turing, no Tensor Cores). Real-ESRGAN's fp16 (half=True) path SILENTLY produces all-black,
corrupted output on this card -- not an exception, not a crash, just wrong zeros, caught by a
swallowed `except RuntimeError: print(...)` inside realesrgan's own tile_process(). This is not
speculation: CodeFormer's own official inference script (inference_codeformer.py, vendored inside
codeformer-pip) independently hard-codes the exact same finding --
`no_half_gpu_list = ["1650", "1660"]` -- so this build uses that identical upstream-sanctioned
GPU-name check rather than a blanket half=False, keeping the fp16 speed path available on any
GPU where it actually works correctly.

Both models are loaded ONCE at process startup, not per-request -- same reasoning as every prior
build here: a slow/failing load happens once, visibly, in the startup log.
"""
import os

os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

import asyncio
import io
import logging
import time
from concurrent.futures import ThreadPoolExecutor

import cv2
import numpy as np
import torch
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from PIL import Image, UnidentifiedImageError
from torchvision.transforms.functional import normalize

from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
from codeformer.basicsr.utils import img2tensor, tensor2img
from codeformer.basicsr.utils.registry import ARCH_REGISTRY
from codeformer.facelib.utils.face_restoration_helper import FaceRestoreHelper

cv2.setNumThreads(0)  # avoid a second competing thread pool alongside torch's own

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("upscale_service")

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_INPUT_DIMENSION = 1024  # longest side, px -- Real-ESRGAN's tiling makes this safe at any size
SCALE = 4
TILE_SIZE = 200
TILE_PAD = 10
INFERENCE_TIMEOUT_SECONDS = 60
FIDELITY_WEIGHT = 0.6  # balances sharpness (low w) vs. natural/identity-preserving (high w)

WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "weights")
REALESRGAN_WEIGHTS = os.path.join(WEIGHTS_DIR, "RealESRGAN_x4plus.pth")
CODEFORMER_WEIGHTS = os.path.join(WEIGHTS_DIR, "codeformer.pth")

# GPUs known (by the model authors themselves, not just this build) to silently corrupt fp16
# conv output rather than raising -- see module docstring. Substring-matched against the CUDA
# device name.
NO_HALF_GPU_SUBSTRINGS = ["1650", "1660"]

app = FastAPI(title="KA Crystal -- Image Enhancement Service (Real-ESRGAN + CodeFormer)")

# a single worker: inference is GPU-serialized anyway (one CUDA context, one 4GB card) --
# running requests "in parallel" here would just contend for the same GPU memory, so a size-1 pool
# simply gives every request its own thread (keeping the FastAPI event loop unblocked) without
# pretending to offer real concurrency the hardware can't back.
_executor = ThreadPoolExecutor(max_workers=1)

_bg_upsampler = None
_codeformer_net = None
_face_helper_factory = None  # FaceRestoreHelper is stateful per-image; build a fresh one per request
_model_error = None
_device = None
_model_label = "Real-ESRGAN"  # updated to include CodeFormer once a face is actually restored


def _pick_half(device_str: str) -> bool:
    if device_str != "cuda":
        return False
    name = torch.cuda.get_device_name(0)
    if any(sub in name for sub in NO_HALF_GPU_SUBSTRINGS):
        log.warning("GPU %s is on the known fp16-unsafe list %s -- forcing half=False.", name, NO_HALF_GPU_SUBSTRINGS)
        return False
    return True


@app.on_event("startup")
async def load_models_at_startup():
    global _bg_upsampler, _codeformer_net, _model_error, _device
    if not os.path.isfile(REALESRGAN_WEIGHTS):
        _model_error = f"Missing weights file: {REALESRGAN_WEIGHTS}"
        log.error(_model_error)
        raise RuntimeError(_model_error)
    if not os.path.isfile(CODEFORMER_WEIGHTS):
        _model_error = f"Missing weights file: {CODEFORMER_WEIGHTS}"
        log.error(_model_error)
        raise RuntimeError(_model_error)

    _device = "cuda" if torch.cuda.is_available() else "cpu"
    use_half = _pick_half(_device)
    vram_note = ""
    if _device == "cuda":
        free_b, total_b = torch.cuda.mem_get_info(0)
        vram_note = f", VRAM {free_b/1e9:.2f}GB free / {total_b/1e9:.2f}GB total"
    log.info("Loading Real-ESRGAN + CodeFormer (device=%s, half=%s%s)...", _device, use_half, vram_note)
    t0 = time.time()
    try:
        rrdb = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=SCALE)
        _bg_upsampler = RealESRGANer(
            scale=SCALE,
            model_path=REALESRGAN_WEIGHTS,
            model=rrdb,
            tile=TILE_SIZE,
            tile_pad=TILE_PAD,
            pre_pad=10,  # library default -- 0 produces visible border artifacts on tile edges
            half=use_half,
            device=_device,
        )

        net = ARCH_REGISTRY.get("CodeFormer")(
            dim_embd=512, codebook_size=1024, n_head=8, n_layers=9, connect_list=["32", "64", "128", "256"],
        ).to(_device)
        checkpoint = torch.load(CODEFORMER_WEIGHTS, map_location=_device)["params_ema"]
        net.load_state_dict(checkpoint)
        net.eval()
        _codeformer_net = net

        # FaceRestoreHelper's face-detector (~104MB) and face-parser (~81MB) weights download and
        # load lazily on first use, not at construction -- left alone, that ~10s one-time cost
        # would land inside the FIRST real request's inference timeout instead of the startup log,
        # exactly the "silent stall on whichever visitor is first" failure mode this whole
        # load-once-at-startup pattern exists to avoid. Building one here (and immediately
        # discarding it) forces that download/load to happen now, visibly, so every real request
        # after startup only ever pays actual inference time.
        _make_face_helper()

        log.info(
            "Models loaded successfully in %.2fs. Real-ESRGAN=RealESRGAN_x4plus (half=%s), "
            "CodeFormer=codeformer.pth (fidelity_weight=%.1f), device=%s.",
            time.time() - t0, use_half, FIDELITY_WEIGHT, _device,
        )
    except Exception as exc:
        _model_error = f"{type(exc).__name__}: {exc}"
        log.exception("Model failed to load -- see traceback above. Root cause: %s", _model_error)
        raise


@app.get("/health")
def health():
    return {
        "ok": _codeformer_net is not None,
        "model": "Real-ESRGAN + CodeFormer",
        "device": _device,
        "scale": SCALE,
        "loaded": _codeformer_net is not None,
        "error": _model_error,
    }


def _make_face_helper():
    return FaceRestoreHelper(
        SCALE,
        face_size=512,
        crop_ratio=(1, 1),
        det_model="retinaface_resnet50",
        save_ext="png",
        use_parse=True,
        device=_device,
    )


def _run_pipeline(bgr_img):
    """Synchronous, GPU-bound. Runs in the thread pool so the event loop stays responsive and the
    request can still be cancelled cleanly by the timeout wrapper in the endpoint below."""
    face_helper = _make_face_helper()
    face_helper.read_image(bgr_img)
    num_faces = face_helper.get_face_landmarks_5(only_center_face=False, resize=640, eye_dist_threshold=5)
    face_helper.align_warp_face()

    for cropped_face in face_helper.cropped_faces:
        cropped_face_t = img2tensor(cropped_face / 255.0, bgr2rgb=True, float32=True)
        normalize(cropped_face_t, (0.5, 0.5, 0.5), (0.5, 0.5, 0.5), inplace=True)
        cropped_face_t = cropped_face_t.unsqueeze(0).to(_device)
        try:
            with torch.no_grad():
                output = _codeformer_net(cropped_face_t, w=FIDELITY_WEIGHT, adain=True)[0]
                restored_face = tensor2img(output, rgb2bgr=True, min_max=(-1, 1))
            del output
            if _device == "cuda":
                torch.cuda.empty_cache()
        except Exception as exc:
            # A single face's restoration failing (e.g. a degenerate crop) shouldn't sink the
            # whole request -- fall back to the unrestored crop for that one face and keep going.
            log.warning("CodeFormer failed on one detected face, using unrestored crop: %s", exc)
            restored_face = tensor2img(cropped_face_t, rgb2bgr=True, min_max=(-1, 1))
        restored_face = restored_face.astype("uint8")
        face_helper.add_restored_face(restored_face, cropped_face)

    # Background pass always runs -- with 0 faces detected this IS the entire output (general
    # enhancement, automatically, no separate code path), matching the automatic-fallback
    # requirement from the brief.
    bg_img = _bg_upsampler.enhance(bgr_img, outscale=SCALE)[0]

    if num_faces > 0:
        face_helper.get_inverse_affine(None)
        restored_img = face_helper.paste_faces_to_input_image(upsample_img=bg_img)
    else:
        restored_img = bg_img

    return restored_img, num_faces


@app.post("/enhance")
async def enhance(request: Request):
    if _codeformer_net is None or _bg_upsampler is None:
        raise HTTPException(status_code=503, detail=f"The enhancement model isn't loaded ({_model_error or 'still starting'}).")

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

    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    t0 = time.time()
    loop = asyncio.get_event_loop()
    try:
        restored_img, faces_found = await asyncio.wait_for(
            loop.run_in_executor(_executor, _run_pipeline, bgr),
            timeout=INFERENCE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        log.error("Inference timed out after %ss on a %sx%s input (resized=%s).", INFERENCE_TIMEOUT_SECONDS, original_w, original_h, resized)
        raise HTTPException(status_code=504, detail=f"Enhancement is taking longer than {INFERENCE_TIMEOUT_SECONDS}s -- please try a smaller image.")
    except Exception as exc:
        log.exception("Inference failed on a %sx%s input (resized=%s): %s", original_w, original_h, resized, exc)
        raise HTTPException(status_code=500, detail=f"Enhancement failed during processing: {type(exc).__name__}. Try a smaller image.")
    elapsed = time.time() - t0
    model_label = "Real-ESRGAN + CodeFormer" if faces_found > 0 else "Real-ESRGAN"
    log.info("Enhanced %sx%s -> input longest side %spx in %.2fs (%d face(s) restored, model=%s).",
              original_w, original_h, longest, elapsed, faces_found, model_label)

    out_rgb = cv2.cvtColor(restored_img, cv2.COLOR_BGR2RGB)
    out_img = Image.fromarray(out_rgb, "RGB")

    buf = io.BytesIO()
    out_img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Enhance-Model": model_label,
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
    log.exception("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "The enhancement service hit an unexpected error -- see server logs for the specific cause."})
