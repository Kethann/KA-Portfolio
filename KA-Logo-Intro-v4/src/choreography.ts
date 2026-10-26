import * as THREE from 'three';
import type { Slot } from './sample-points';

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const k = span(x, a, b);
  return k * k * (3 - 2 * k);
};
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInCubic = (x: number) => x * x * x;
export const easeInOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
export const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);
export const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Stage {
  fov: number;
  dist: number;
  aspect: number;
  viewW: number;
  viewH: number;
  logo: { cx: number; cy: number; w: number; h: number };
}

export function makeStage(aspect: number, imageAspect: number, fov = 32, dist = 10): Stage {
  const viewH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const viewW = viewH * aspect;
  const h = Math.min(viewH * 0.56, (viewW * 0.64) / imageAspect);
  return {
    fov,
    dist,
    aspect,
    viewW,
    viewH,
    logo: { cx: 0, cy: -viewH * 0.025, w: h * imageAspect, h },
  };
}

export function uvToWorld(stage: Stage, u: number, v: number, z = 0, out = new THREE.Vector3()) {
  const { cx, cy, w, h } = stage.logo;
  return out.set(cx + (u - 0.5) * w, cy + (0.5 - v) * h, z);
}

export function cubicBezier(a: number, b: number, c: number, d: number, s: number) {
  const m = 1 - s;
  return m * m * m * a + 3 * m * m * s * b + 3 * m * s * s * c + s * s * s * d;
}

export function bezier(
  p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
  s: number, out: THREE.Vector3,
) {
  return out.set(
    cubicBezier(p0.x, p1.x, p2.x, p3.x, s),
    cubicBezier(p0.y, p1.y, p2.y, p3.y, s),
    cubicBezier(p0.z, p1.z, p2.z, p3.z, s),
  );
}

export function bezierTangent(
  p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3,
  s: number, out: THREE.Vector3,
) {
  const m = 1 - s;
  const a = 3 * m * m, b = 6 * m * s, c = 3 * s * s;
  return out.set(
    a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y),
    a * (p1.z - p0.z) + b * (p2.z - p1.z) + c * (p3.z - p2.z),
  );
}

// Cubic Hermite in time: start/end positions with start/end velocities (units per second),
// so consecutive segments hand speed over without a dead stop.
export function hermite(
  p0: THREE.Vector3, v0: THREE.Vector3, p1: THREE.Vector3, v1: THREE.Vector3,
  dur: number, s: number, out: THREE.Vector3,
) {
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
  return out.set(
    h00 * p0.x + h10 * dur * v0.x + h01 * p1.x + h11 * dur * v1.x,
    h00 * p0.y + h10 * dur * v0.y + h01 * p1.y + h11 * dur * v1.y,
    h00 * p0.z + h10 * dur * v0.z + h01 * p1.z + h11 * dur * v1.z,
  );
}

export function hermiteEase(x0: number, v0: number, x1: number, v1: number, dur: number, s: number) {
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * x0 + (s3 - 2 * s2 + s) * dur * v0 + (-2 * s3 + 3 * s2) * x1 + (s3 - s2) * dur * v1;
}

export interface Flight {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  p3: THREE.Vector3;
  delay: number;
  dur: number;
  size: number;
  color: THREE.Color;
  spinAxis: THREE.Vector3;
  spin: number;
  phase: number;
}

const FORMATION_COLORS = [0xffffff, 0xffd6dc, 0xff8a96, 0xff3344, 0xffb3a8];

export function flightProgress(f: Flight, t: number) {
  return easeOutCubic(span(t, f.delay, f.delay + f.dur));
}

export function planFormation(
  stage: Stage, slots: Slot[], start: number, spread: number, seed = 7,
): Flight[] {
  const r = rng(seed);
  const { viewW, viewH } = stage;
  const unit = stage.logo.h;
  return slots.map((slot) => {
    const p3 = uvToWorld(stage, slot.u, slot.v, 0.14);
    const side = Math.floor(r() * 4);
    const along = r() * 2 - 1;
    const p0 = new THREE.Vector3();
    if (side === 0) p0.set(-viewW * 0.7, along * viewH * 0.6, 0);
    else if (side === 1) p0.set(viewW * 0.7, along * viewH * 0.6, 0);
    else if (side === 2) p0.set(along * viewW * 0.6, viewH * 0.68, 0);
    else p0.set(along * viewW * 0.6, -viewH * 0.68, 0);
    p0.z = -1.5 + r() * 3.5;

    const mid = p0.clone().lerp(p3, 0.5);
    const dir = p3.clone().sub(p0);
    const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
    const bend = (r() < 0.5 ? -1 : 1) * (0.25 + r() * 0.45) * dir.length();
    const p1 = mid.clone().addScaledVector(perp, bend).add(new THREE.Vector3(0, 0, 1 + r() * 1.5));
    const p2 = p3.clone().add(new THREE.Vector3((r() - 0.5) * unit * 0.25, (r() - 0.5) * unit * 0.25, 0.6 + r() * 0.6));

    const order = 0.62 * r() + 0.38 * slot.u;
    return {
      p0, p1, p2, p3,
      delay: start + order * spread,
      dur: 0.95 + r() * 0.5,
      size: unit * (0.009 + Math.pow(r(), 2.2) * 0.014),
      color: new THREE.Color(FORMATION_COLORS[Math.floor(r() * FORMATION_COLORS.length)]),
      spinAxis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() * 0.6 + 0.4).normalize(),
      spin: (r() < 0.5 ? -1 : 1) * (3 + r() * 6),
      phase: r() * Math.PI * 2,
    };
  });
}

export interface Ambient {
  pos: Float32Array;
  seed: Float32Array;
  size: Float32Array;
  count: number;
}

export function planAmbient(stage: Stage, count: number, seed = 11): Ambient {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const sd = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const z = -7 + r() * 6.2;
    const depthScale = (stage.dist - z) / stage.dist;
    pos[i * 3] = (r() - 0.5) * stage.viewW * 1.15 * depthScale;
    pos[i * 3 + 1] = (r() - 0.5) * stage.viewH * 1.15 * depthScale;
    pos[i * 3 + 2] = z;
    sd[i] = r();
    size[i] = stage.logo.h * (0.006 + Math.pow(r(), 3) * 0.022);
  }
  return { pos, seed: sd, size, count };
}
