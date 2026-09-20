// Manages the Python FastAPI super-resolution service (see upscale_service_codeformer.py) as a
// child process, and exposes an Express router that proxies /enhance to it. Kept as a fully
// separate process rather than reimplemented in Node because the actual work here -- running
// real pretrained PyTorch models (Real-ESRGAN for general super-resolution, CodeFormer for
// automatic face restoration, GPU-accelerated) -- has nothing to do with the rest of this Node
// server's stack, and isolating it means a crash or memory spike in the ML runtime can never
// take down the site's own request handling.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";

const PYTHON_PORT = 8799;
const PYTHON_BASE_URL = `http://127.0.0.1:${PYTHON_PORT}`;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;

export function startEnhanceService({ root }) {
  const venvDir = resolve(root, "server/gfpgan-venv");
  const pythonBin = process.platform === "win32"
    ? resolve(venvDir, "Scripts/python.exe")
    : resolve(venvDir, "bin/python");

  if (!existsSync(pythonBin)){
    console.warn("[enhance] Python venv not found at", pythonBin, "-- Image Upscaler will report itself unavailable. See server/gfpgan-venv setup in project notes.");
    return { router: buildRouter(() => false, () => "Python environment not set up on this server (see server/requirements.txt).") };
  }

  let child = null;
  let ready = false;
  let restarting = false;
  let lastFailureReason = null; // populated from the Python process's own log lines when startup fails

  // Logging defaults to ON (opt OUT with ENHANCE_SERVICE_LOGS=0) -- an earlier build gated this
  // behind an opt-IN env var, which meant a real model-load failure produced no visible signal
  // at all by default: exactly the "generic stuck state" this round's fix is about. Errors
  // (stderr) always surface regardless; only routine stdout access-log noise can be silenced.
  const logsEnabled = process.env.ENHANCE_SERVICE_LOGS !== "0";

  function spawnService(){
    ready = false;
    child = spawn(pythonBin, ["-m", "uvicorn", "upscale_service_codeformer:app", "--host", "127.0.0.1", "--port", String(PYTHON_PORT)], {
      cwd: resolve(root, "server"),
      stdio: ["ignore", "pipe", "pipe"],
      // KMP_DUPLICATE_LIB_OK also set inside upscale_service.py itself (belt and suspenders --
      // it must be set before torch/cv2 import, which the module-level code there guarantees
      // regardless of how this process ends up launched).
      env: { ...process.env, KMP_DUPLICATE_LIB_OK: "TRUE" },
    });
    child.stdout.on("data", (d) => {
      const line = d.toString();
      if (line.includes("Application startup complete")){ ready = true; lastFailureReason = null; }
      if (logsEnabled) process.stdout.write(`[enhance-service] ${line}`);
    });
    child.stderr.on("data", (d) => {
      const line = d.toString();
      if (line.includes("Application startup complete")){ ready = true; lastFailureReason = null; }
      // Traceback lines from Python's `logging.exception(...)` land here -- always surfaced
      // (not gated by logsEnabled) so a model-load failure is never silent.
      process.stderr.write(`[enhance-service] ${line}`);
      const causeMatch = line.match(/Root cause: (.+)/);
      if (causeMatch) lastFailureReason = causeMatch[1].trim();
    });
    child.on("exit", (code, signal) => {
      ready = false;
      if (!lastFailureReason) lastFailureReason = `service process exited unexpectedly (code=${code}, signal=${signal})`;
      if (restarting) return; // our own intentional respawn below already accounted for this
      console.error(`[enhance] Python service exited (code=${code}, signal=${signal}) -- restarting once in 3s. Last known cause: ${lastFailureReason}`);
      restarting = true;
      setTimeout(() => { restarting = false; spawnService(); }, 3000);
    });
  }
  spawnService();
  process.on("exit", () => { try { child?.kill(); } catch {} });

  return { router: buildRouter(() => ready, () => lastFailureReason) };
}

function buildRouter(isReady, getFailureReason){
  const router = express.Router();
  const limits = new Map();

  function rateLimited(req){
    const now = Date.now();
    for (const [id, v] of limits) if (v.until < now) limits.delete(id);
    const id = req.ip;
    const v = limits.get(id) || { count: 0, until: now + 10 * 60 * 1000 };
    v.count++; limits.set(id, v);
    return v.count > 12; // 12 enhancements per 10 minutes per IP -- generous for real use, cheap to abuse otherwise
  }

  router.post("/enhance", express.raw({ type: ["image/png", "image/jpeg", "image/webp"], limit: "12mb" }), async (req, res) => {
    if (rateLimited(req)){
      res.set("Retry-After", "600");
      return res.status(429).json({ error: "Please wait a few minutes before enhancing another image." });
    }
    if (!isReady()){
      const reason = getFailureReason && getFailureReason();
      return res.status(503).json({
        error: reason
          ? `The enhancement service failed to start (${reason}). Please try again shortly, or check the server logs.`
          : "The enhancement service is starting up -- please try again in a few seconds.",
      });
    }
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0){
      return res.status(400).json({ error: "Choose a PNG, JPEG, or WebP image." });
    }
    if (body.length > MAX_UPLOAD_BYTES){
      return res.status(413).json({ error: "Please choose an image smaller than 12 MB." });
    }

    try{
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const upstream = await fetch(`${PYTHON_BASE_URL}/enhance`, {
        method: "POST",
        headers: { "Content-Type": req.get("content-type") || "application/octet-stream" },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!upstream.ok){
        let detail = "The enhancement service couldn't process this image.";
        try{ detail = (await upstream.json())?.detail || detail; }catch{}
        return res.status(upstream.status).json({ error: detail });
      }

      const outBuffer = Buffer.from(await upstream.arrayBuffer());
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "no-store");
      for (const h of ["x-enhance-model", "x-enhance-seconds", "x-enhance-input-resized", "x-enhance-input-width", "x-enhance-input-height", "x-enhance-output-width", "x-enhance-output-height", "x-enhance-faces-restored"]){
        const v = upstream.headers.get(h);
        if (v) res.set(h, v);
      }
      res.send(outBuffer);
    }catch(err){
      const timedOut = err?.name === "AbortError";
      console.error("[enhance] proxy error:", err);
      res.status(timedOut ? 504 : 502).json({
        error: timedOut
          ? "This is taking longer than expected. Please try a smaller image or try again."
          : "Could not reach the enhancement service. Please try again in a moment.",
      });
    }
  });

  router.get("/enhance/status", async (req, res) => {
    res.json({ ready: isReady(), failureReason: isReady() ? null : (getFailureReason && getFailureReason()) || null });
  });

  return router;
}
