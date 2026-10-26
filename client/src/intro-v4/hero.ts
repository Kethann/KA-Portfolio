import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { LOGO_BODY_IMAGE, LOGO_VIEWBOX, GLYPH_POINTS, GLYPH_INNER } from './logo-paths';
import { T } from './timeline';
import {
  Stage, Flight, planFormation, bezier, flightProgress, span, smoothstep, lerp, easeInOutCubic, easeInOutSine,
} from './choreography';
import { Slot, sampleImageSlots } from './sample-points';
import { createGlyphGeometry } from './glyph-geometry';
import { BigGlyphPlan, planBigStar, bigStarPose, createPose, wipeX, absorbTime } from './big-glyph-path';
import {
  createLogoTexture, createGlyphTexture, createLogoRevealMaterial, GLYPH_QUAD_SCALE,
} from './logo-reveal-material';
import { createGlowTexture, createStreakTexture } from './fx-textures';
import { DustSystem, GlowPoints, buildDust, createGlowPoints } from './dust';

declare global {
  interface Window {
    kaLayoutW?: () => number;
    kaLayoutH?: () => number;
    kaLite?: boolean;
  }
}

export interface HeroIntroOptions {
  stage: HTMLElement;
  veil?: HTMLElement | null;
  spacer?: Element | null;
  replay?: HTMLElement | null;
  reducedMotion?: boolean;
}

const FOV = 32;
const DIST = 10;

const layoutW = () => (window.kaLayoutW ? window.kaLayoutW() : window.innerWidth);
const layoutH = () => (window.kaLayoutH ? window.kaLayoutH() : window.innerHeight);

// The finished logo sits exactly where Version 1's does: same responsive framing (its 232x302 world box,
// skill-ring clearance and the desktop tightening), expressed as the share of the screen height it fills.
function v1LogoShare(w: number, h: number) {
  const c = (x: number) => Math.max(0, Math.min(1, x));
  const desktopScale = 1 + 0.5 * c((w - 1024) / 416) * c((h - 540) / 228);
  const designHalfH = (980 * Math.tan(THREE.MathUtils.degToRad(25))) / desktopScale;
  const halfH = Math.max(designHalfH, (232 / 2 + 46 * 2.1) / (w / h));
  const box = Math.min(232 / LOGO_VIEWBOX.w, 302 / LOGO_VIEWBOX.h) * LOGO_VIEWBOX.h;
  return box / (2 * halfH);
}

function heroStage(w: number, h: number): Stage {
  const viewH = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
  const viewW = viewH * (w / h);
  const lh = viewH * v1LogoShare(w, h);
  return { fov: FOV, dist: DIST, aspect: w / h, viewW, viewH, logo: { cx: 0, cy: 0, w: (lh * LOGO_VIEWBOX.w) / LOGO_VIEWBOX.h, h: lh } };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('the KA logo image did not load'));
    img.src = src;
  });
}

export class HeroIntroV4 {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  private glowTex = createGlowTexture();
  private streakTex = createStreakTexture();
  private glyphGeo = createGlyphGeometry(GLYPH_POINTS, GLYPH_INNER);
  private glyphTex = createGlyphTexture();

  private bigRoot = new THREE.Group();
  private bigMat = new THREE.MeshPhysicalMaterial({
    color: 0xd0101c, metalness: 0.3, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.25,
    emissive: new THREE.Color(0x4a0006), emissiveIntensity: 0.6, envMapIntensity: 2.3, flatShading: true,
  });
  private bigMesh = new THREE.Mesh(this.glyphGeo, this.bigMat);
  private bigGlow: THREE.Sprite;
  private streakH: THREE.Sprite;
  private streakV: THREE.Sprite;
  private halo: THREE.Sprite;

  private smallMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0.35, roughness: 0.14, clearcoat: 1,
    emissive: new THREE.Color(0x2a0003), envMapIntensity: 2, flatShading: true,
  });
  private small: THREE.InstancedMesh;
  private smallGlow: GlowPoints;

  private logoMesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private logoTex?: THREE.Texture;
  private slots: Slot[] = [];

  private stage!: Stage;
  private flights: Flight[] = [];
  private absorb: number[] = [];
  private plan!: BigGlyphPlan;
  private dust?: DustSystem;

  private pose = createPose();
  private tmpV = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();
  private glyphPos = new THREE.Vector3();
  private glintPos = new THREE.Vector3();
  private bigColor = new THREE.Color(1.0, 0.32, 0.4);
  private emissiveA = new THREE.Color(0x4a0006);
  private emissiveB = new THREE.Color(0xff6f7c);

  private t = 0;
  private last = 0;
  private raf = 0;
  private visible = true;
  private gathered = false;
  private completed = false;
  private veilDone = false;
  private resizeTimer = 0;
  private lastW = 0;
  private lastH = 0;
  private pointer = new THREE.Vector2();
  private parallax = new THREE.Vector2();
  private readonly count: number;
  private readonly reduced: boolean;

  constructor(private o: HeroIntroOptions) {
    this.reduced = !!o.reducedMotion;
    this.count = window.kaLite ? 110 : 190;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    o.stage.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xfff1ea, 2.2);
    key.position.set(-3, 4, 6);
    const rim = new THREE.PointLight(0xff2a3a, 40, 0, 2);
    rim.position.set(3, 1.5, -2);
    const fill = new THREE.PointLight(0xffd0d6, 12, 0, 2);
    fill.position.set(0, -3, 5);
    this.scene.add(key, rim, fill);

    this.bigRoot.add(this.bigMesh);
    this.scene.add(this.bigRoot);

    // Additive light on a transparent canvas: colour is weighted by the texture's alpha and alpha grows by the same
    // amount, so the canvas stays validly premultiplied and the glow simply adds to the nebula behind it.
    const sprite = (map: THREE.Texture, rotation = 0, order = 10) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map, rotation, depthWrite: false, transparent: true,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
        blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      }));
      s.renderOrder = order;
      this.scene.add(s);
      return s;
    };
    this.halo = sprite(this.glowTex, 0, 0);
    this.halo.material.color.setRGB(0.85, 0.08, 0.12);
    this.bigGlow = sprite(this.glowTex);
    this.streakH = sprite(this.streakTex);
    this.streakV = sprite(this.streakTex, Math.PI / 2);

    this.small = new THREE.InstancedMesh(this.glyphGeo, this.smallMat, this.count);
    this.small.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.small.frustumCulled = false;
    this.scene.add(this.small);
    this.smallGlow = createGlowPoints(this.count, this.glowTex);
    this.smallGlow.points.renderOrder = 5;
    this.scene.add(this.smallGlow.points);

    if (this.reduced) this.t = T.end;
  }

  async start() {
    const img = await loadImage(LOGO_BODY_IMAGE);
    this.logoTex = createLogoTexture(img, this.renderer);
    this.slots = sampleImageSlots(img, this.count);
    this.layout(true);

    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.sync);
    window.addEventListener('pageshow', this.sync);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    if (this.o.spacer) {
      new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; this.sync(); }).observe(this.o.spacer);
    }
    this.o.replay?.addEventListener('click', this.replay);

    if (this.reduced) {
      this.render(this.t);
      this.finishVeil();
      this.complete();
      return;
    }
    this.sync();
  }

  private replay = () => {
    if (this.t < T.end) return;
    this.t = 0;
    this.o.replay?.classList.remove('on');
    this.sync();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.t < T.skipTo) {
      this.t = T.skipTo;
      this.finishVeil();
    }
  };

  private onPointer = (e: PointerEvent) => {
    this.pointer.set((e.clientX / Math.max(1, layoutW())) * 2 - 1, (e.clientY / Math.max(1, layoutH())) * 2 - 1);
  };

  private onResize = () => {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.layout(false), 80);
  };

  // Runs while the intro plays; once it has finished it rests whenever the hero is scrolled away or the tab is hidden.
  private shouldRun() {
    return !this.reduced && !document.hidden && (this.t < T.end || this.visible);
  }

  private sync = () => {
    const run = this.shouldRun();
    if (run && !this.raf) {
      this.last = -1;
      this.raf = requestAnimationFrame(this.frame);
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  };

  private frame = (now: number) => {
    this.raf = 0;
    if (this.last < 0) this.last = now;
    const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.1));
    this.last = now;
    this.t += dt;
    this.render(this.t);
    if (this.shouldRun()) this.raf = requestAnimationFrame(this.frame);
  };

  private finishVeil() {
    if (this.veilDone || !this.o.veil) return;
    this.veilDone = true;
    this.o.veil.style.opacity = '0';
    this.o.veil.style.pointerEvents = 'none';
  }

  private complete() {
    if (this.completed) return;
    this.completed = true;
    window.dispatchEvent(new CustomEvent('ka-sequence-complete'));
  }

  private layout(force: boolean) {
    const w = Math.max(1, layoutW());
    const h = Math.max(1, layoutH());
    if (!force && w === this.lastW && h === this.lastH) return;
    this.lastW = w;
    this.lastH = h;

    const budget = window.kaLite ? 1500000 : w <= 760 ? 2400000 : 8000000;
    const pr = Math.min(window.devicePixelRatio || 1, window.kaLite ? 1.25 : 2, Math.sqrt(budget / (w * h)));
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    this.stage = heroStage(w, h);
    this.flights = planFormation(this.stage, this.slots, T.formStart, T.formSpread);
    this.plan = planBigStar(this.stage);
    this.absorb = this.flights.map((f) => Math.max(absorbTime(this.plan, f.p3.x), f.delay + f.dur));
    this.flights.forEach((f, i) => this.small.setColorAt(i, f.color));
    if (this.small.instanceColor) this.small.instanceColor.needsUpdate = true;

    const pxPerUnit = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    if (this.dust) {
      this.scene.remove(this.dust.points);
      this.dust.dispose();
    }
    this.dust = buildDust(this.stage, this.flights, this.plan, this.glowTex);
    this.dust.setScale(pxPerUnit);
    this.dust.points.renderOrder = 6;
    this.scene.add(this.dust.points);
    this.smallGlow.setScale(pxPerUnit);

    this.buildLogoPlane();
    const { logo } = this.stage;
    this.halo.position.set(logo.cx, logo.cy, -0.4);
    this.halo.scale.set(logo.w * 2.1, logo.h * 1.5, 1);

    bigStarPose(this.plan, T.glint, this.pose);
    this.glintPos.copy(this.pose.pos);
    this.glyphPos.copy(this.plan.glyph);
    this.render(this.t);
  }

  private buildLogoPlane() {
    const { cx, cy, w, h } = this.stage.logo;
    const pad = h * 0.16;
    const pw = w + pad * 2;
    const ph = h + pad * 2;
    const left = cx - pw / 2;
    const bottom = cy - ph / 2;
    const gs = this.plan.r * GLYPH_QUAD_SCALE;
    const g = this.plan.glyph;
    const imgRect = new THREE.Vector4(pad / pw, pad / ph, (pad + w) / pw, (pad + h) / ph);
    const glyphRect = new THREE.Vector4(
      (g.x - gs - left) / pw, (g.y - gs - bottom) / ph, (g.x + gs - left) / pw, (g.y + gs - bottom) / ph,
    );
    if (this.logoMesh) {
      this.logoMesh.geometry.dispose();
      this.logoMesh.geometry = new THREE.PlaneGeometry(pw, ph);
      const u = this.logoMesh.material.uniforms;
      u.uImgRect.value = imgRect;
      u.uGlyphRect.value = glyphRect;
      u.uSoftness.value = this.plan.R * 0.35;
    } else {
      const mat = createLogoRevealMaterial({
        map: this.logoTex!, glyphMap: this.glyphTex, imgRect, glyphRect, softness: this.plan.R * 0.35,
      });
      this.logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
      this.logoMesh.renderOrder = 1;
      this.scene.add(this.logoMesh);
    }
    this.logoMesh.position.set(cx, cy, 0);
  }

  private render(t: number) {
    const { plan } = this;

    if (!this.veilDone && this.o.veil) {
      const v = 1 - smoothstep(0, 0.7, t);
      this.o.veil.style.opacity = String(v);
      if (v <= 0) this.finishVeil();
    }
    if (!this.gathered && t >= T.formStart) {
      this.gathered = true;
      window.dispatchEvent(new CustomEvent('ka-intro-phase', { detail: 'assembling' }));
    }
    if (t >= T.docked) this.complete();
    if (t >= T.end) this.o.replay?.classList.add('on');

    const dolly = 1 - easeInOutCubic(span(t, 0, T.docked));
    const rest = smoothstep(T.settled, T.end, t);
    this.parallax.lerp(this.pointer, 0.05);
    const px = -0.15 * dolly + this.parallax.x * 0.22 * rest;
    const py = 0.05 * dolly - this.parallax.y * 0.14 * rest;
    this.camera.position.set(px, py, DIST + 0.7 * dolly);
    this.camera.lookAt(0, 0, 0);

    this.dust!.update(t);
    this.updateFormation(t);
    this.updateBigGlyph(t);
    this.updateStreaks(t);

    this.halo.material.opacity = 0.16 * smoothstep(T.atEdge, T.rollDone + 0.6, t);
    this.halo.visible = this.halo.material.opacity > 0.003;

    const u = this.logoMesh!.material.uniforms;
    u.uRevealX.value = wipeX(plan, t);
    u.uEdge.value = smoothstep(T.atEdge - 0.15, T.atEdge + 0.1, t) * (1 - smoothstep(T.rollDone - 0.1, T.rollDone + 0.4, t));
    u.uStarDock.value = t >= T.docked ? 1 : 0;
    u.uTime.value = t;
    if (t < T.end) {
      u.uSheen.value = lerp(-0.6, 1.2, easeInOutSine(span(t, T.sheenStart, T.sheenEnd)));
      u.uSheenAmp.value = t > T.sheenStart && t < T.sheenEnd ? 1 : 0;
    } else {
      const cycle = (t - T.end) % 7;
      u.uSheen.value = lerp(-0.6, 1.2, easeInOutSine(span(cycle, 2, 3.4)));
      u.uSheenAmp.value = 0.55;
    }

    this.renderer.render(this.scene, this.camera);
  }

  private updateFormation(t: number) {
    const glow = this.smallGlow;
    const absorbDur = 0.28;
    for (let i = 0; i < this.flights.length; i++) {
      const f = this.flights[i];
      const landT = f.delay + f.dur;
      const k = span(t, this.absorb[i], this.absorb[i] + absorbDur);
      if (t < f.delay || k >= 1) {
        this.tmpM.makeScale(0, 0, 0);
        this.small.setMatrixAt(i, this.tmpM);
        glow.set(i, this.tmpV.set(0, 0, 0), 0, f.color, 0);
        continue;
      }
      const s = span(t, f.delay, landT);
      bezier(f.p0, f.p1, f.p2, f.p3, flightProgress(f, t), this.tmpV);
      let scale = f.size * (0.55 + 0.45 * s);
      let angle = f.phase + f.spin * Math.min(t - f.delay, f.dur);
      let alpha = 0.3;
      if (t > landT) {
        const a = t - landT;
        angle += f.spin * 0.12 * a;
        scale *= (1 + 0.35 * Math.exp(-7 * a) * Math.sin(16 * a)) * (1 + 0.1 * Math.sin(t * 5 + f.phase));
        alpha = 0.22 + 0.5 * Math.exp(-6 * a) + 0.1 * Math.sin(t * 3.3 + f.phase * 2);
      }
      if (k > 0) {
        scale *= 1 - k * k;
        alpha += 1.2 * Math.sin(Math.PI * k);
      }
      this.tmpQ.setFromAxisAngle(f.spinAxis, angle);
      this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS.setScalar(scale));
      this.small.setMatrixAt(i, this.tmpM);
      glow.set(i, this.tmpV, f.size * 3.2, f.color, alpha);
    }
    this.small.instanceMatrix.needsUpdate = true;
    glow.commit();
  }

  private updateBigGlyph(t: number) {
    const p = bigStarPose(this.plan, t, this.pose);
    this.bigRoot.visible = p.visible;
    this.bigGlow.visible = p.visible && p.glow > 0.01;
    if (!p.visible) return;
    this.bigRoot.position.copy(p.pos);
    this.bigRoot.scale.set(p.squashX, p.squashY, 1);
    this.bigMesh.quaternion.copy(p.quat);
    this.bigMesh.scale.set(p.scale, p.scale, p.scale * p.depth);

    const m = p.morph;
    this.bigMat.emissive.copy(this.emissiveA).lerp(this.emissiveB, m);
    this.bigMat.emissiveIntensity = 0.6 + 2.6 * m;
    const fading = p.opacity < 1;
    if (this.bigMat.transparent !== fading) {
      this.bigMat.transparent = fading;
      this.bigMat.needsUpdate = true;
    }
    this.bigMat.opacity = p.opacity;
    this.bigMat.depthWrite = !fading;

    this.bigGlow.position.copy(p.pos);
    this.bigGlow.scale.setScalar(p.scale * 4.2);
    this.bigGlow.material.color.copy(this.bigColor);
    this.bigGlow.material.opacity = Math.min(1, p.glow * 0.32);
  }

  private updateStreaks(t: number) {
    const R = this.plan.R;
    let e = 0;
    let at = this.glyphPos;
    let len = R * 9;
    const glint = Math.exp(-Math.pow((t - T.glint) / 0.13, 2));
    const dock = t >= T.docked - 0.04 ? Math.exp(-Math.max(0, t - T.docked) * 4) * smoothstep(T.docked - 0.04, T.docked, t) : 0;
    let idle = 0;
    if (t > T.morphEnd) {
      const x = (t - T.morphEnd) % 3.8;
      idle = 0.6 * Math.exp(-Math.pow((x - 0.6) / 0.16, 2));
    }
    if (glint > dock && glint > idle) {
      e = glint;
      at = this.glintPos;
    } else if (dock > idle) {
      e = dock;
      len = R * 7;
    } else {
      e = idle;
      len = R * 5;
    }
    const on = e > 0.01;
    this.streakH.visible = this.streakV.visible = on;
    if (!on) return;
    this.streakH.position.copy(at).setZ(at.z + 0.1);
    this.streakV.position.copy(this.streakH.position);
    this.streakH.scale.set(len * (0.6 + 0.4 * e), R * 0.5, 1);
    this.streakV.scale.set(len * 0.55 * (0.6 + 0.4 * e), R * 0.4, 1);
    for (const s of [this.streakH, this.streakV]) {
      s.material.color.setRGB(2.2, 1.5, 1.6);
      s.material.opacity = e;
    }
  }
}
