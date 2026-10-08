// The GPU text renderer: draws the letters as real-time lit 3D objects and the elements (fire, snow, rain, lightning)
// on and around them, in one WebGL canvas that sits in the camera layer above the (now invisible) DOM letters.
// The DOM letters stay the source of truth: every frame each letter's live animation state (position, rotation, scale,
// skew, opacity, blur, brightness, glow) is read from GSAP, so every typing effect drives the GPU letters exactly.
// Lighting is live: the reflections and highlights move with the camera, the pointer and a slow light sweep.
import { gsap } from 'gsap';
import { buildAtlas, type Atlas } from './sdf';
import { LETTER_VS, LETTER_FS, FULL_VS, ELEMENT_FS } from './shaders';
import { seeded } from '../rng';
import type { CharInfo, Palette } from '../types';

export type ElementKind = 'none' | 'fire' | 'snow' | 'rain' | 'storm';
const ELEM: Record<ElementKind, number> = { none: 0, fire: 1, snow: 2, rain: 3, storm: 4 };

/** material id -> shader number, and its shape: bevel width / steepness / extrusion / shadow (fractions of the font size) */
export const GPU_MATERIALS: Record<string, { n: number; bevel: number; height: number; ext: number; shadow: number }> = {
  satin: { n: 1, bevel: 0.05, height: 0.9, ext: 0.035, shadow: 0.06 },
  chrome: { n: 2, bevel: 0.045, height: 1.0, ext: 0.065, shadow: 0.07 },
  gold: { n: 3, bevel: 0.045, height: 1.0, ext: 0.065, shadow: 0.07 },
  rosegold: { n: 4, bevel: 0.045, height: 1.0, ext: 0.065, shadow: 0.07 },
  steel: { n: 5, bevel: 0.04, height: 0.9, ext: 0.06, shadow: 0.07 },
  glass: { n: 6, bevel: 0.09, height: 1.2, ext: 0.035, shadow: 0.05 },
  ice: { n: 7, bevel: 0.08, height: 1.2, ext: 0.04, shadow: 0.05 },
  neon: { n: 8, bevel: 0.06, height: 1.0, ext: 0, shadow: 0.03 },
  lava: { n: 9, bevel: 0.06, height: 1.0, ext: 0.05, shadow: 0.06 },
  stone: { n: 10, bevel: 0.05, height: 0.95, ext: 0.06, shadow: 0.07 },
  carved: { n: 11, bevel: 0.05, height: 1.0, ext: 0, shadow: 0 },
  marble: { n: 12, bevel: 0.05, height: 1.0, ext: 0.06, shadow: 0.07 },
  bone: { n: 13, bevel: 0.07, height: 1.1, ext: 0.05, shadow: 0.06 },
  candy: { n: 14, bevel: 0.1, height: 1.3, ext: 0.05, shadow: 0.06 },
  foil: { n: 15, bevel: 0.12, height: 1.5, ext: 0.02, shadow: 0.06 },
  extrude: { n: 16, bevel: 0.02, height: 0.8, ext: 0.16, shadow: 0.06 },
  emboss: { n: 17, bevel: 0.04, height: 0.7, ext: 0, shadow: 0 },
};

export interface GpuSetup {
  chars: CharInfo[]; stage: DOMRect; font: string; fontPx: number; palette: Palette;
  material: string | null;          // null: the letters stay DOM (2D look); only the elements are drawn
  depth: number; light: number; glow: number; element: ElementKind; amount: number; seed: number; textEl: HTMLElement;
  clock: () => number;              // the piece's own time (restarts with the loop): snow builds up from it
}

const hexRgb = (h: string) => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const FLOATS = 18;   // per vertex: pos2 uv2 tile4 state4 extra4 rot2

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null>; a: Record<string, number> };

export class GpuText {
  canvas: HTMLCanvasElement; gl: WebGLRenderingContext | null = null;
  private letter: Prog | null = null; private elem: Prog | null = null;
  private vbo: WebGLBuffer | null = null; private tri: WebGLBuffer | null = null;
  private atlasTex: WebGLTexture | null = null; private atlas: Atlas | null = null; private atlasKey = '';
  private fbo: WebGLFramebuffer | null = null; private maskTex: WebGLTexture | null = null; private maskW = 0; private maskH = 0;
  private s: GpuSetup | null = null; private raf = 0; private data = new Float32Array(0);
  private cam = { x: 0, y: 0 }; private t0 = performance.now(); private quality = 1; private last = 0; private slow = 0;
  private strike = { next: 0, start: -10, pts: [] as number[], rng: seeded(1) };
  private box = { x0: 0, y0: 0, x1: 1, y1: 1 };
  /** where each drawn letter's top is this frame (lightning aims at it) */
  private tops: { x: number; y: number }[] = [];
  /** the stage's live size (CSS px): the letters re-centre when the panel opens or the window resizes */
  private vw = 1; private vh = 1;
  reduced = false;
  /** how many letters the last frame drew (diagnostics) */
  drawn = 0;
  /** tests: force how far snow has built up (0..1) */
  debugAccum: number | null = null;
  /** false when this device has no WebGL: the studio then keeps its flat letters */
  available = false;

  constructor(host: HTMLElement, before: Element | null){
    this.canvas = document.createElement('canvas'); this.canvas.className = 'fx-gpu'; this.canvas.setAttribute('aria-hidden', 'true');
    host.insertBefore(this.canvas, before);
    try { this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'high-performance' }) as WebGLRenderingContext | null; } catch { this.gl = null; }
    if (this.gl) this.available = this.init(this.gl);
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.stop(); this.available = false; this.canvas.hidden = true; });
    this.canvas.hidden = true;
  }
  private compile(g: WebGLRenderingContext, vs: string, fs: string, attrs: string[], unis: string[]): Prog | null {
    const sh = (type: number, src: string) => { const s = g.createShader(type)!; g.shaderSource(s, src); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)){ console.warn('gpu text shader', g.getShaderInfoLog(s)); return null; } return s; };
    const v = sh(g.VERTEX_SHADER, vs), f = sh(g.FRAGMENT_SHADER, fs); if (!v || !f) return null;
    const p = g.createProgram()!; g.attachShader(p, v); g.attachShader(p, f); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)){ console.warn('gpu text link', g.getProgramInfoLog(p)); return null; }
    const u: Record<string, WebGLUniformLocation | null> = {}, a: Record<string, number> = {};
    for (const n of unis) u[n] = g.getUniformLocation(p, n);
    for (const n of attrs) a[n] = g.getAttribLocation(p, n);
    return { p, u, a };
  }
  private init(g: WebGLRenderingContext){
    this.letter = this.compile(g, LETTER_VS, LETTER_FS, ['aPos', 'aUV', 'aTile', 'aState', 'aExtra', 'aRot'],
      ['uView', 'uAtlas', 'uAtlasSize', 'uSpread', 'uScale', 'uPx', 'uTime', 'uMat', 'uFace', 'uMaskPass', 'uHeight', 'uBevel', 'uExt', 'uShadow', 'uAway', 'uLight', 'uCam',
        'uEnvRot', 'uSweep', 'uFontPx', 'uBox', 'uText', 'uA1', 'uA2', 'uGlow', 'uBg', 'uElem', 'uAmt', 'uAccum', 'uStrike', 'uFlash', 'uGlowAmt']);
    this.elem = this.compile(g, FULL_VS, ELEMENT_FS, ['aPos'],
      ['uMask', 'uView', 'uTime', 'uElem', 'uPass', 'uAmt', 'uFontPx', 'uBox', 'uCut', 'uFlash', 'uBoltA', 'uBoltN', 'uBolt', 'uGlow', 'uA1']);
    if (!this.letter || !this.elem) return false;
    this.vbo = g.createBuffer(); this.tri = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, this.tri); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    this.atlasTex = g.createTexture();
    this.maskTex = g.createTexture(); this.fbo = g.createFramebuffer();
    return true;
  }

  /** a new composition: rebuilds the atlas when the letters or the font changed */
  setup(s: GpuSetup){
    this.s = s;
    const active = this.available && (s.material !== null || s.element !== 'none');
    this.canvas.hidden = !active;
    if (!active){ this.stop(); return false; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.max(0.6, Math.min(dpr * 1.1, 220 / Math.max(10, s.fontPx)));
    const room = s.fontPx * 0.34;
    const key = [s.font, scale.toFixed(2), Math.round(room), ...new Set(s.chars.map(c => c.char + Math.round(c.rect.width) + 'x' + Math.round(c.rect.height)))].join('|');
    if (key !== this.atlasKey){
      this.atlas = buildAtlas(s.chars.map(c => ({ ch: c.char, w: c.rect.width, h: c.rect.height })), s.font, scale, room, room, Date.now());
      const g = this.gl!;
      g.bindTexture(g.TEXTURE_2D, this.atlasTex);
      g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, this.atlas.canvas);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      this.atlasKey = key;
    }
    this.strike = { next: (performance.now() - this.t0) / 1000 + 1.2, start: -10, pts: [], rng: seeded(s.seed ^ 0xb017) };
    this.start();
    return true;
  }
  setCamera(rx: number, ry: number){ this.cam.x = ry / 12; this.cam.y = -rx / 12; }

  start(){ if (!this.raf && !this.reduced && this.s && !this.canvas.hidden) this.raf = requestAnimationFrame(this.frame); else if (this.reduced) this.draw(); }
  stop(){ cancelAnimationFrame(this.raf); this.raf = 0; }
  destroy(){ this.stop(); this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); this.canvas.remove(); this.gl = null; this.available = false; }

  private frame = (now: number) => {
    this.raf = 0; if (!this.s || document.hidden || this.canvas.hidden) return;
    if (this.last){ const dt = now - this.last; if (dt > 28){ if (++this.slow > 24 && this.quality > 0.6){ this.quality = Math.max(0.6, this.quality - 0.1); this.slow = 0; } } else { this.slow = Math.max(0, this.slow - 1); if (dt < 18 && this.quality < 1) this.quality = Math.min(1, this.quality + 0.002); } }
    this.last = now;
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  /** renders one frame; `size` overrides the drawing size (exports), in device pixels */
  draw(size?: { w: number; h: number }){
    const g = this.gl, s = this.s; if (!g || !s || !this.letter || !this.elem || !this.atlas) return;
    const cw = this.canvas.clientWidth || s.stage.width, ch = this.canvas.clientHeight || s.stage.height;
    this.vw = cw; this.vh = ch;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * this.quality;
    const W = size ? size.w : Math.max(2, Math.round(cw * dpr)), H = size ? size.h : Math.max(2, Math.round(ch * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H){ this.canvas.width = W; this.canvas.height = H; }
    const pxCss = cw / W;
    const t = (performance.now() - this.t0) / 1000;
    const n = this.fill(s);
    this.drawn = n;
    const mat = s.material ? GPU_MATERIALS[s.material] || GPU_MATERIALS.satin : null;
    const elem = ELEM[s.element];
    // ---- lightning: strikes on a schedule, at a letter
    let boltA = 0, flash = 0;
    if (s.element === 'storm'){
      const st = this.strike;
      if (t >= st.next) this.newStrike(t, s);
      const k = t - st.start;
      boltA = k < 0 ? 0 : k < 0.05 ? 1 : k < 0.09 ? 0.25 : k < 0.17 ? 1 : k < 0.5 ? Math.max(0, 1 - (k - 0.17) / 0.33) : 0;
      flash = boltA * 0.9;
    }
    g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE_MINUS_SRC_ALPHA);
    // ---- 1. the letters' silhouettes (fire and rain need to know where the letters are)
    if (elem === 1 || elem === 3){
      const mw = Math.max(2, Math.round(W * 0.5)), mh = Math.max(2, Math.round(H * 0.5));
      if (mw !== this.maskW || mh !== this.maskH){
        g.bindTexture(g.TEXTURE_2D, this.maskTex);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, mw, mh, 0, g.RGBA, g.UNSIGNED_BYTE, null);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        g.bindFramebuffer(g.FRAMEBUFFER, this.fbo); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, this.maskTex, 0);
        this.maskW = mw; this.maskH = mh;
      }
      g.bindFramebuffer(g.FRAMEBUFFER, this.fbo); g.viewport(0, 0, mw, mh); g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT);
      this.drawLetters(g, s, n, t, mat, elem, 0, 0, pxCss * 2, true);
      g.bindFramebuffer(g.FRAMEBUFFER, null);
    }
    g.viewport(0, 0, W, H); g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT);
    if (elem) this.drawElement(g, s, t, elem, 0, boltA, flash, !mat);
    if (n) this.drawLetters(g, s, n, t, mat, elem, boltA, flash, pxCss, false);
    if (elem) this.drawElement(g, s, t, elem, 1, boltA, flash, !mat);
  }

  /** each visible letter's quad, from its live animation state; returns how many letters */
  private fill(s: GpuSetup){
    const at = this.atlas!, need = s.chars.length * 6 * FLOATS;
    if (this.data.length < need) this.data = new Float32Array(need);
    const d = this.data, tx = Number(gsap.getProperty(s.textEl, 'x')) || 0, ty = Number(gsap.getProperty(s.textEl, 'y')) || 0;
    // opacity is read from the inline style every effect writes (cheaper than a computed style, every frame)
    const inl = (e: HTMLElement) => { const v = e.style.opacity; if (v === '') return 1; const f = parseFloat(v); return isFinite(f) ? f : 1; };
    const textOp = inl(s.textEl);
    // the box of the words, from where the letters are laid out right now
    const ox = s.textEl.offsetLeft, oy = s.textEl.offsetTop;
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const c of s.chars){ if (!c.char.trim()) continue; const l = ox + c.el.offsetLeft, t = oy + c.el.offsetTop; bx0 = Math.min(bx0, l); by0 = Math.min(by0, t); bx1 = Math.max(bx1, l + c.el.offsetWidth); by1 = Math.max(by1, t + c.el.offsetHeight); }
    if (isFinite(bx0)) this.box = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
    const bw = Math.max(1, this.box.x1 - this.box.x0), bh = Math.max(1, this.box.y1 - this.box.y0);
    this.tops = [];
    let k = 0, n = 0;
    for (const c of s.chars){
      const tile = at.tiles.get(c.char); if (!tile) continue;
      const el = c.el;
      if ((el.textContent || '') !== (el.dataset.ch || c.char)) continue;   // scrambling (Decode): the DOM shows the symbol
      const op = inl(el) * textOp * (el.style.visibility === 'hidden' ? 0 : 1);
      if (op < 0.003) continue;
      const w = c.rect.width, h = c.rect.height;
      const x = (Number(gsap.getProperty(el, 'x')) || 0) + (Number(gsap.getProperty(el, 'xPercent')) || 0) * w / 100 + tx;
      const y = (Number(gsap.getProperty(el, 'y')) || 0) + (Number(gsap.getProperty(el, 'yPercent')) || 0) * h / 100 + ty;
      const rot = (Number(gsap.getProperty(el, 'rotation')) || 0) * Math.PI / 180, skew = Math.tan((Number(gsap.getProperty(el, 'skewX')) || 0) * Math.PI / 180);
      const sxv = Number(gsap.getProperty(el, 'scaleX')), syv = Number(gsap.getProperty(el, 'scaleY'));
      const sx = isFinite(sxv) ? sxv : 1, sy = isFinite(syv) ? syv : 1;
      const f = el.style.filter || '', blur = parseFloat(/blur\(([\d.]+)px\)/.exec(f)?.[1] || '0'), bright = parseFloat(/brightness\(([\d.]+)\)/.exec(f)?.[1] || '1');
      const ts = el.style.textShadow, glow = ts && ts !== 'none' ? 1 : 0;
      const cx = ox + el.offsetLeft + w / 2 + x, cy = oy + el.offsetTop + h / 2 + y;
      if (op > 0.5) this.tops.push({ x: cx, y: cy - h * 0.36 });
      const pc = tile.pad / at.scale, hw = w / 2 + pc, hh = h / 2 + pc;
      const cos = Math.cos(rot), sin = Math.sin(rot), scl = (Math.abs(sx) + Math.abs(sy)) / 2;
      const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, -hh], [hw, hh], [-hw, hh]];
      for (const [lx, ly] of corners){
        const ax = lx * sx + skew * ly * sy, ay = ly * sy;
        const px = cx + ax * cos - ay * sin, py = cy + ax * sin + ay * cos;
        d[k++] = px; d[k++] = py;
        d[k++] = tile.x + tile.pad + (lx + w / 2) * at.scale; d[k++] = tile.y + tile.pad + (ly + h / 2) * at.scale;
        d[k++] = tile.x; d[k++] = tile.y; d[k++] = tile.x + tile.w; d[k++] = tile.y + tile.h;
        d[k++] = op; d[k++] = blur; d[k++] = bright; d[k++] = glow;
        d[k++] = (c.index * 0.6180339) % 1; d[k++] = (px - this.box.x0) / bw; d[k++] = (py - this.box.y0) / bh; d[k++] = scl;
        d[k++] = cos; d[k++] = sin;
      }
      n++;
    }
    return n;
  }

  private drawLetters(g: WebGLRenderingContext, s: GpuSetup, n: number, t: number, mat: typeof GPU_MATERIALS[string] | null, elem: number, strike: number, flash: number, pxCss: number, maskPass: boolean){
    const P = this.letter!, at = this.atlas!, u = P.u, f = s.fontPx, depth = Math.max(0, Math.min(1, s.depth));
    g.useProgram(P.p);
    g.bindBuffer(g.ARRAY_BUFFER, this.vbo); g.bufferData(g.ARRAY_BUFFER, this.data.subarray(0, n * 6 * FLOATS), g.DYNAMIC_DRAW);
    const stride = FLOATS * 4; let off = 0;
    for (const [name, size] of [['aPos', 2], ['aUV', 2], ['aTile', 4], ['aState', 4], ['aExtra', 4], ['aRot', 2]] as [string, number][]){
      const loc = P.a[name]; if (loc >= 0){ g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, size, g.FLOAT, false, stride, off); }
      off += size * 4;
    }
    g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, this.atlasTex); g.uniform1i(u.uAtlas, 0);
    g.uniform2f(u.uView, this.vw, this.vh);
    g.uniform2f(u.uAtlasSize, at.canvas.width, at.canvas.height); g.uniform1f(u.uSpread, at.spread); g.uniform1f(u.uScale, at.scale);
    g.uniform1f(u.uPx, pxCss); g.uniform1f(u.uTime, t); g.uniform1f(u.uMaskPass, maskPass ? 1 : 0);
    g.uniform1f(u.uFace, mat ? 1 : 0); g.uniform1f(u.uMat, mat ? mat.n : 0);
    const la = s.light * Math.PI / 180 + Math.sin(t * 0.21) * 0.18 + this.cam.x * 0.5;   // the key light breathes a little
    const L = [Math.cos(la) * 0.72, Math.sin(la) * 0.72, 0.7], ln = Math.hypot(L[0], L[1], L[2]);
    g.uniform3f(u.uLight, L[0] / ln, L[1] / ln, L[2] / ln); g.uniform2f(u.uAway, -Math.cos(s.light * Math.PI / 180), -Math.sin(s.light * Math.PI / 180));
    g.uniform1f(u.uHeight, mat ? mat.height * (0.55 + depth * 0.9) : 0); g.uniform1f(u.uBevel, mat ? mat.bevel * f : 1);
    g.uniform1f(u.uExt, mat ? mat.ext * f * depth : 0); g.uniform1f(u.uShadow, mat ? mat.shadow * f * (0.4 + depth) : 0);
    g.uniform2f(u.uCam, this.cam.x, this.cam.y); g.uniform1f(u.uEnvRot, Math.sin(t * 0.15) * 0.35 + this.cam.x * 0.8);
    g.uniform1f(u.uSweep, ((t * 0.16) % 2.2) * 1.6 - 0.9); g.uniform1f(u.uFontPx, f);
    g.uniform4f(u.uBox, this.box.x0, this.box.y0, this.box.x1, this.box.y1);
    const p = s.palette; g.uniform3fv(u.uText, hexRgb(p.text)); g.uniform3fv(u.uA1, hexRgb(p.accent1)); g.uniform3fv(u.uA2, hexRgb(p.accent2)); g.uniform3fv(u.uGlow, hexRgb(p.glow)); g.uniform3fv(u.uBg, hexRgb(p.bg));
    g.uniform1f(u.uElem, elem); g.uniform1f(u.uAmt, Math.max(0.15, s.amount));
    g.uniform1f(u.uAccum, this.debugAccum ?? Math.max(0, Math.min(1, (s.clock() - 0.6) / 7))); g.uniform1f(u.uStrike, strike); g.uniform1f(u.uFlash, flash);
    g.uniform1f(u.uGlowAmt, mat ? Math.max(0, s.glow) : 0);
    g.drawArrays(g.TRIANGLES, 0, n * 6);
    for (const name of ['aPos', 'aUV', 'aTile', 'aState', 'aExtra', 'aRot']){ const loc = P.a[name]; if (loc >= 0) g.disableVertexAttribArray(loc); }
  }

  private drawElement(g: WebGLRenderingContext, s: GpuSetup, t: number, elem: number, pass: number, boltA: number, flash: number, flatLetters: boolean){
    const P = this.elem!, u = P.u;
    g.useProgram(P.p);
    g.bindBuffer(g.ARRAY_BUFFER, this.tri); const loc = P.a.aPos; g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    g.activeTexture(g.TEXTURE1); g.bindTexture(g.TEXTURE_2D, this.maskTex); g.uniform1i(u.uMask, 1);
    g.uniform2f(u.uView, this.vw, this.vh); g.uniform1f(u.uTime, t); g.uniform1f(u.uElem, elem); g.uniform1f(u.uPass, pass);
    g.uniform1f(u.uAmt, Math.max(0.15, s.amount)); g.uniform1f(u.uFontPx, s.fontPx);
    g.uniform4f(u.uBox, this.box.x0, this.box.y0, this.box.x1, this.box.y1); g.uniform1f(u.uCut, flatLetters ? 1 : 0.6);
    g.uniform1f(u.uFlash, flash); g.uniform1f(u.uBoltA, boltA);
    const pts = this.strike.pts, arr = new Float32Array(64); arr.set(pts.slice(0, 64));
    g.uniform1f(u.uBoltN, Math.min(32, pts.length / 2)); g.uniform2fv(u.uBolt, arr);
    g.uniform3fv(u.uGlow, hexRgb(s.palette.glow)); g.uniform3fv(u.uA1, hexRgb(s.palette.accent1));
    g.drawArrays(g.TRIANGLES, 0, 3);
    g.disableVertexAttribArray(loc);
  }

  /** a new lightning strike: a jagged bolt from above the frame to the top of a visible letter, with a branch */
  private newStrike(t: number, s: GpuSetup){
    const r = this.strike.rng, vis = this.tops;
    this.strike.start = t; this.strike.next = t + 2.6 + r() * 4.2;
    if (!vis.length){ this.strike.pts = []; return; }
    const top = vis[Math.floor(r() * vis.length)];
    const end = [top.x, top.y + 2], beg = [end[0] + (r() - 0.5) * this.vw * 0.5, -20];
    let pts: number[][] = [beg, end];
    for (let lv = 0; lv < 4; lv++){
      const next: number[][] = [pts[0]];
      for (let i = 1; i < pts.length; i++){
        const a = pts[i - 1], b = pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        next.push([(a[0] + b[0]) / 2 + (r() - 0.5) * len * 0.42, (a[1] + b[1]) / 2 + (r() - 0.5) * len * 0.12], b);
      }
      pts = next;
    }
    const flat = pts.flat();
    // a branch splitting off part-way down
    const from = pts[4 + Math.floor(r() * 6)], dir = r() < 0.5 ? -1 : 1, br: number[] = [-9999, -9999, from[0], from[1]];
    let bx = from[0], by = from[1];
    for (let i = 0; i < 6; i++){ bx += dir * (14 + r() * 26); by += 16 + r() * 22; br.push(bx, by); }
    this.strike.pts = [...flat, ...br].slice(0, 64);
  }

  /** draws the current frame into a 2D context at any size (stills export) */
  paintInto(x: CanvasRenderingContext2D, W: number, H: number, scale: number){
    if (!this.gl || !this.s || this.canvas.hidden) return;
    const max = Math.min(4096, this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS)?.[0] || 4096);
    const k = Math.min(scale, max / W, max / H);
    this.draw({ w: Math.round(W * k), h: Math.round(H * k) });
    try { x.drawImage(this.canvas, 0, 0, W, H); } catch { /* nothing to draw */ }
    this.draw();
  }
}
