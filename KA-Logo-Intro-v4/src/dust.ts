import * as THREE from 'three';
import {
  Stage, Flight, Ambient, bezier, bezierTangent, easeOutCubic, rng,
} from './choreography';
import { BigGlyphPlan, bigStarPose, createPose, absorbTime } from './big-glyph-path';
import { T } from './timeline';

const SPRITE_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uIntensity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float m = texture2D(uMap, gl_PointCoord).a;
    gl_FragColor = vec4(vColor * m * vAlpha * uIntensity, 1.0);
  }
`;

function spriteMaterial(map: THREE.Texture, vertexShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uMap: { value: map }, uIntensity: { value: 1 }, uScale: { value: 1 }, ...uniforms },
    vertexShader,
    fragmentShader: SPRITE_FRAG,
  });
}

const PALETTE = [0xffffff, 0xffe3e6, 0xff9aa5, 0xff4455, 0xff1f33, 0xffc9a8].map((c) => new THREE.Color(c));

class Spawner {
  p: number[] = [];
  v: number[] = [];
  misc: number[] = [];
  size: number[] = [];
  color: number[] = [];
  constructor(private r: () => number) {}
  push(p: THREE.Vector3, v: THREE.Vector3, birth: number, life: number, gravity: number, size: number, c: THREE.Color) {
    this.p.push(p.x, p.y, p.z);
    this.v.push(v.x, v.y, v.z);
    this.misc.push(birth, life, gravity, this.r());
    this.size.push(size);
    this.color.push(c.r, c.g, c.b);
  }
}

export interface DustSystem {
  points: THREE.Points;
  update(t: number): void;
  setScale(pxPerUnit: number): void;
  dispose(): void;
}

export function buildDust(
  stage: Stage, flights: Flight[], plan: BigGlyphPlan, glowTex: THREE.Texture, seed = 23,
): DustSystem {
  const r = rng(seed);
  const U = stage.logo.h;
  const sp = new Spawner(r);
  const pick = (from = 0) => PALETTE[from + Math.floor(r() * (PALETTE.length - from))];
  const jitter = (s: number, out = new THREE.Vector3()) =>
    out.set((r() - 0.5) * 2 * s, (r() - 0.5) * 2 * s, (r() - 0.5) * s);
  const pos = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const vel = new THREE.Vector3();

  for (const f of flights) {
    const n = 9;
    for (let k = 1; k <= n; k++) {
      const s = k / (n + 1);
      const e = easeOutCubic(s);
      bezier(f.p0, f.p1, f.p2, f.p3, e, pos);
      bezierTangent(f.p0, f.p1, f.p2, f.p3, e, tan).normalize();
      vel.copy(tan).multiplyScalar(-0.05 * U).add(jitter(0.05 * U));
      sp.push(pos, vel, f.delay + s * f.dur, 0.45 + r() * 0.5, -0.08 * U, U * (0.008 + r() * 0.01), f.color);
    }
    for (let k = 0; k < 3; k++) {
      sp.push(f.p3, jitter(0.09 * U), f.delay + f.dur * 0.8, 0.4 + r() * 0.4, 0, U * (0.01 + r() * 0.01), pick());
    }
    const tA = Math.max(absorbTime(plan, f.p3.x), f.delay + f.dur);
    for (let k = 0; k < 5; k++) {
      vel.set((r() - 0.3) * 0.12 * U, (0.05 + r() * 0.2) * U, (r() - 0.5) * 0.05 * U);
      sp.push(f.p3, vel, tA + r() * 0.05, 0.5 + r() * 0.5, -0.12 * U, U * (0.008 + r() * 0.012), pick(1));
    }
  }

  const pose = createPose();
  const prev = new THREE.Vector3();
  const trail = (t0: number, t1: number, rate: number, lifeMax: number) => {
    const dt = 1 / rate;
    bigStarPose(plan, t0, pose);
    prev.copy(pose.pos);
    for (let t = t0 + dt; t < t1; t += dt) {
      bigStarPose(plan, t, pose);
      vel.copy(pose.pos).sub(prev).divideScalar(dt).multiplyScalar(-0.06).add(jitter(0.06 * U));
      prev.copy(pose.pos);
      const p = pose.pos.clone().add(jitter(pose.scale * 0.45));
      sp.push(p, vel, t, Math.min(lifeMax, 0.45 + r() * 0.55), -0.1 * U, U * (0.008 + r() * 0.012), pick());
    }
  };
  trail(T.bigEnter, T.bigLanded, 110, 1);
  trail(T.leapStart, T.atEdge, 80, 1);
  trail(T.rollDone, T.docked, 110, T.skipTo - T.docked - 0.05);

  bigStarPose(plan, T.glint, pose);
  for (let i = 0; i < 280; i++) {
    const a = r() * Math.PI * 2;
    const z = (r() - 0.5) * 0.8;
    const speed = (0.25 + Math.pow(r(), 1.5) * 0.85) * U;
    vel.set(Math.cos(a), Math.sin(a), z).normalize().multiplyScalar(speed);
    sp.push(pose.pos, vel, T.glint + r() * 0.04, 0.6 + r() * 0.9, -0.05 * U, U * (0.009 + r() * 0.016), pick());
  }

  for (let i = 0; i < 150; i++) {
    const side = r() < 0.5 ? -1 : 1;
    pos.set(plan.landing.x + side * r() * plan.R * 0.6, plan.floorY, plan.zFront + (r() - 0.5) * 0.2);
    vel.set(side * (0.1 + r() * 0.5) * U, (0.12 + r() * 0.45) * U, (r() - 0.5) * 0.1 * U);
    sp.push(pos, vel, T.bigLanded + r() * 0.05, 0.5 + r() * 0.6, -0.9 * U, U * (0.008 + r() * 0.012), pick());
  }

  for (let t = T.atEdge; t < T.rollDone; t += 1 / 250) {
    bigStarPose(plan, t, pose);
    const onRim = r() < 0.45;
    if (onRim) {
      const a = r() * Math.PI * 2;
      pos.set(pose.pos.x + Math.cos(a) * plan.R * 0.8, pose.pos.y + Math.sin(a) * plan.R * 0.8, pose.pos.z);
    } else {
      pos.set(pose.pos.x + (r() - 0.5) * plan.R * 0.4, plan.floorY, pose.pos.z + (r() - 0.5) * 0.15);
    }
    vel.set(-(0.05 + r() * 0.3) * U, (0.08 + r() * 0.4) * U, (r() - 0.5) * 0.12 * U);
    sp.push(pos, vel, t, 0.45 + r() * 0.65, -0.85 * U, U * (0.007 + r() * 0.012), pick());
  }

  for (let i = 0; i < 150; i++) {
    const a = r() * Math.PI * 2;
    const speed = (0.08 + Math.pow(r(), 1.4) * 0.38) * U;
    vel.set(Math.cos(a) * speed, Math.sin(a) * speed, (r() - 0.5) * 0.05 * U);
    sp.push(plan.glyph, vel, T.docked + r() * 0.03, 0.4 + r() * 0.6, -0.04 * U, U * (0.007 + r() * 0.012), pick());
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sp.p, 3));
  geo.setAttribute('aVel', new THREE.Float32BufferAttribute(sp.v, 3));
  geo.setAttribute('aMisc', new THREE.Float32BufferAttribute(sp.misc, 4));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sp.size, 1));
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(sp.color, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);

  const mat = spriteMaterial(glowTex, /* glsl */ `
    attribute vec3 aVel;
    attribute vec4 aMisc;
    attribute float aSize;
    attribute vec3 aColor;
    uniform float uTime, uScale, uDrag;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float age = uTime - aMisc.x;
      float k = age / aMisc.y;
      if (age < 0.0 || k >= 1.0) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 0.0;
        vAlpha = 0.0;
        vColor = vec3(0.0);
        return;
      }
      vec3 p = position + aVel * (1.0 - exp(-uDrag * age)) / uDrag;
      p.y += 0.5 * aMisc.z * age * age;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float tw = 0.55 + 0.45 * sin(uTime * (16.0 + aMisc.w * 24.0) + aMisc.w * 60.0);
      vAlpha = pow(1.0 - k, 1.4) * smoothstep(0.0, 0.05, age) * tw;
      vColor = aColor;
      gl_PointSize = aSize * uScale / -mv.z * (0.55 + 0.45 * (1.0 - k));
    }
  `, { uTime: { value: 0 }, uDrag: { value: 1.8 } });
  mat.uniforms.uIntensity.value = 2.2;

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    update(t) {
      mat.uniforms.uTime.value = t;
    },
    setScale(px) {
      mat.uniforms.uScale.value = px;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export interface GlowPoints {
  points: THREE.Points;
  set(i: number, p: THREE.Vector3, size: number, c: THREE.Color, alpha: number): void;
  commit(): void;
  setScale(pxPerUnit: number): void;
  dispose(): void;
}

export function createGlowPoints(count: number, glowTex: THREE.Texture): GlowPoints {
  const geo = new THREE.BufferGeometry();
  const mk = (n: number) => new THREE.BufferAttribute(new Float32Array(count * n), n).setUsage(THREE.DynamicDrawUsage);
  const aPos = mk(3), aSize = mk(1), aColor = mk(3), aAlpha = mk(1);
  geo.setAttribute('position', aPos);
  geo.setAttribute('aSize', aSize);
  geo.setAttribute('aColor', aColor);
  geo.setAttribute('aAlpha', aAlpha);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mat = spriteMaterial(glowTex, /* glsl */ `
    attribute float aSize;
    attribute vec3 aColor;
    attribute float aAlpha;
    uniform float uScale;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      vColor = aColor;
      vAlpha = aAlpha;
      gl_PointSize = aAlpha > 0.0 ? aSize * uScale / -mv.z : 0.0;
    }
  `, {});
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    set(i, p, size, c, alpha) {
      aPos.setXYZ(i, p.x, p.y, p.z);
      aSize.setX(i, size);
      aColor.setXYZ(i, c.r, c.g, c.b);
      aAlpha.setX(i, alpha);
    },
    commit() {
      aPos.needsUpdate = aSize.needsUpdate = aColor.needsUpdate = aAlpha.needsUpdate = true;
    },
    setScale(px) {
      mat.uniforms.uScale.value = px;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

export interface AmbientPoints {
  points: THREE.Points;
  update(t: number, fade: number): void;
  setScale(pxPerUnit: number): void;
  dispose(): void;
}

export function createAmbientPoints(a: Ambient, glowTex: THREE.Texture): AmbientPoints {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(a.seed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(a.size, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mat = spriteMaterial(glowTex, /* glsl */ `
    attribute float aSeed;
    attribute float aSize;
    uniform float uScale, uTime, uFade;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec3 p = position;
      p.x += sin(uTime * 0.11 + aSeed * 31.0) * 0.12;
      p.y += cos(uTime * 0.09 + aSeed * 17.0) * 0.1 + uTime * 0.015 * (aSeed - 0.5);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float tw = pow(0.5 + 0.5 * sin(uTime * (0.7 + aSeed * 2.4) + aSeed * 40.0), 3.0);
      vAlpha = uFade * (0.25 + 0.75 * tw);
      vColor = mix(vec3(1.0, 0.86, 0.88), vec3(1.0, 0.22, 0.3), fract(aSeed * 7.13));
      gl_PointSize = aSize * uScale / -mv.z;
    }
  `, { uTime: { value: 0 }, uFade: { value: 0 } });
  mat.uniforms.uIntensity.value = 0.9;
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    update(t, fade) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uFade.value = fade;
    },
    setScale(px) {
      mat.uniforms.uScale.value = px;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
