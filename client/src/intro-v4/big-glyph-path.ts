import * as THREE from 'three';
import {
  Stage, uvToWorld, bezier, hermite, span, lerp, smoothstep, easeInOutCubic, easeOutCubic,
} from './choreography';
import { T } from './timeline';
import { GLYPH_POINTS, LOGO_STAR, LOGO_VIEWBOX } from './logo-paths';

export const SNAP = (2 * Math.PI) / GLYPH_POINTS;

export interface BigGlyphPlan {
  R: number;
  r: number;
  floorY: number;
  centerY: number;
  zFront: number;
  logoLeft: number;
  logoRight: number;
  start: THREE.Vector3;
  enterC1: THREE.Vector3;
  enterC2: THREE.Vector3;
  landing: THREE.Vector3;
  leapV0: THREE.Vector3;
  edgeStart: THREE.Vector3;
  edgeEnd: THREE.Vector3;
  rollV: THREE.Vector3;
  rollSpeed: number;
  omega: number;
  thetaEdge: number;
  thetaRollEnd: number;
  thetaFreeEnd: number;
  thetaTarget: number;
  apex: THREE.Vector3;
  apexV: THREE.Vector3;
  glyph: THREE.Vector3;
  zero: THREE.Vector3;
  wipeLead: number;
}

export interface GlyphPose {
  visible: boolean;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
  squashX: number;
  squashY: number;
  depth: number;
  glow: number;
  opacity: number;
  morph: number;
}

export function createPose(): GlyphPose {
  return {
    visible: false, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1,
    squashX: 1, squashY: 1, depth: 1, glow: 0, opacity: 1, morph: 0,
  };
}

export function planBigStar(stage: Stage): BigGlyphPlan {
  const { cx, cy, w, h } = stage.logo;
  const R = h * 0.085;
  const r = (LOGO_STAR.r / LOGO_VIEWBOX.h) * h;
  const zFront = 0.5;
  const logoLeft = cx - w / 2;
  const logoRight = cx + w / 2;
  const floorY = cy - h / 2 - R * 0.1;
  const centerY = floorY + R;

  const landing = new THREE.Vector3(cx - w * 0.04, centerY, zFront);
  const start = new THREE.Vector3(-stage.viewW * 0.62, stage.viewH * 0.62, 2.2);
  const enterC1 = new THREE.Vector3(-stage.viewW * 0.12, -stage.viewH * 0.3, 2.9);
  const enterC2 = new THREE.Vector3(landing.x + R * 2.4, landing.y + stage.viewH * 0.45, zFront + 0.6);

  const edgeStart = new THREE.Vector3(logoLeft - R * 0.15, centerY, zFront);
  const edgeEnd = new THREE.Vector3(logoRight + R * 0.15, centerY, zFront);
  const rollDur = T.rollDone - T.atEdge;
  const rollSpeed = (edgeEnd.x - edgeStart.x) / rollDur;
  const omega = -rollSpeed / R;
  const leapDur = T.atEdge - T.leapStart;
  const thetaEdge = 0.5 * omega * leapDur;
  const thetaRollEnd = thetaEdge + omega * rollDur;
  const thetaFreeEnd = thetaRollEnd + (omega * (T.docked - T.rollDone)) / 3;
  const thetaTarget = Math.round(thetaFreeEnd / SNAP) * SNAP;

  const glyph = uvToWorld(stage, LOGO_STAR.cx / LOGO_VIEWBOX.w, LOGO_STAR.cy / LOGO_VIEWBOX.h, 0.05);
  // Kept inside the frame so narrow (phone) screens still see the loop.
  const apex = new THREE.Vector3(
    Math.min(logoRight + R * 0.9, stage.viewW * 0.44 - R * 1.6),
    Math.min(glyph.y + R * 2.3, stage.viewH / 2 - R * 1.4),
    0.9,
  );

  return {
    R, r, floorY, centerY, zFront, logoLeft, logoRight,
    start, enterC1, enterC2, landing,
    leapV0: new THREE.Vector3(-R * 3, R * 11, 0),
    edgeStart, edgeEnd,
    rollV: new THREE.Vector3(rollSpeed, 0, 0),
    rollSpeed, omega, thetaEdge, thetaRollEnd, thetaFreeEnd, thetaTarget,
    apex,
    apexV: new THREE.Vector3(-R * 6, 0, -0.25),
    glyph,
    zero: new THREE.Vector3(),
    wipeLead: R * 0.15,
  };
}

const euler = new THREE.Euler(0, 0, 0, 'XYZ');

function rollTheta(p: BigGlyphPlan, t: number) {
  return p.thetaEdge + p.omega * (t - T.atEdge);
}

export function bigStarPose(p: BigGlyphPlan, t: number, out: GlyphPose): GlyphPose {
  let rotX = 0, rotY = 0, theta = 0;
  out.visible = t >= T.bigEnter && t < T.morphEnd;
  out.scale = p.R;
  out.squashX = 1;
  out.squashY = 1;
  out.depth = 1;
  out.opacity = 1;
  out.morph = 0;
  out.glow = 0.5;

  if (t < T.bigLanded) {
    const s = span(t, T.bigEnter, T.bigLanded);
    const e = s * (1.35 - 0.35 * s);
    bezier(p.start, p.enterC1, p.enterC2, p.landing, e, out.pos);
    const k = (1 - e) * (1 - e);
    theta = 6 * Math.PI * k;
    rotX = 1.3 * k * Math.sin(9 * s);
    rotY = 2.4 * k;
    out.glow = 0.45 + 0.25 * k;
  } else if (t < T.flipStart) {
    const u = t - T.bigLanded;
    let sq = 0.34 * Math.exp(-9 * u) * Math.sin(28 * u);
    if (u > 0.42) sq += 0.12 * Math.exp(-12 * (u - 0.42)) * Math.sin(28 * (u - 0.42));
    const hk = span(u, 0.14, 0.42);
    const hop = p.R * 0.22 * 4 * hk * (1 - hk);
    out.squashY = 1 - sq;
    out.squashX = 1 + sq * 0.55;
    out.pos.set(p.landing.x, p.floorY + p.R * out.squashY + hop, p.landing.z);
    theta = 0.1 * Math.exp(-6 * u) * Math.sin(18 * u);
  } else if (t < T.flipEnd) {
    const k = span(t, T.flipStart, T.flipEnd);
    rotY = 2 * Math.PI * easeInOutCubic(k);
    out.pos.set(p.landing.x, p.centerY + p.R * 0.35 * Math.sin(Math.PI * k), p.landing.z);
    out.glow = 0.5 + 2.4 * Math.exp(-Math.pow((t - T.glint) / 0.09, 2));
  } else if (t < T.leapStart) {
    const k = span(t, T.flipEnd, T.leapStart);
    const sq = 0.16 * easeOutCubic(k);
    out.squashY = 1 - sq;
    out.squashX = 1 + sq * 0.5;
    out.pos.set(p.landing.x, p.floorY + p.R * out.squashY, p.landing.z);
  } else if (t < T.atEdge) {
    const dur = T.atEdge - T.leapStart;
    const u = t - T.leapStart;
    const s = u / dur;
    hermite(p.landing, p.leapV0, p.edgeStart, p.rollV, dur, s, out.pos);
    const sq = 0.16 * (1 - span(u, 0, 0.08));
    const stretch = 0.1 * Math.sin(Math.PI * s);
    out.squashY = 1 - sq + stretch;
    out.squashX = 1 + sq * 0.5 - stretch * 0.5;
    out.pos.y -= p.R * sq;
    theta = (0.5 * p.omega * u * u) / dur;
    out.glow = 0.6;
  } else if (t < T.rollDone) {
    const u = t - T.atEdge;
    theta = rollTheta(p, t);
    const fade = smoothstep(0, 0.15, u) * (1 - smoothstep(T.rollDone - T.atEdge - 0.15, T.rollDone - T.atEdge, u));
    const bob = -p.R * 0.07 * Math.pow(Math.sin(2 * theta), 2) * fade;
    out.pos.set(p.edgeStart.x + p.rollSpeed * u, p.centerY + bob, p.zFront);
    out.glow = 0.8;
  } else if (t < T.docked) {
    const D = T.docked - T.rollDone;
    const pr = span(t, T.rollDone, T.docked);
    if (t < T.loopApex) {
      hermite(p.edgeEnd, p.rollV, p.apex, p.apexV, T.loopApex - T.rollDone, span(t, T.rollDone, T.loopApex), out.pos);
    } else {
      hermite(p.apex, p.apexV, p.glyph, p.zero, T.docked - T.loopApex, span(t, T.loopApex, T.docked), out.pos);
    }
    const free = p.thetaRollEnd + ((p.omega * D) / 3) * (1 - Math.pow(1 - pr, 3));
    theta = free + (p.thetaTarget - p.thetaFreeEnd) * smoothstep(0, 1, pr);
    rotX = 2 * Math.PI * easeInOutCubic(span(pr, 0.08, 0.8));
    out.scale = lerp(p.R, p.r, easeInOutCubic(pr));
    out.glow = 0.75;
  } else {
    const u = t - T.docked;
    out.pos.copy(p.glyph);
    theta = p.thetaTarget + 0.14 * Math.exp(-6 * u) * Math.sin(20 * u);
    out.scale = p.r * (1 + 0.16 * Math.exp(-8 * u) * Math.sin(24 * u));
    out.glow = 0.5 + 1.8 * Math.exp(-5 * u);
    const m = span(t, T.settled, T.morphEnd);
    out.morph = m;
    out.depth = lerp(1, 0.05, easeInOutCubic(m));
    out.opacity = 1 - smoothstep(0.35, 1, m);
    out.glow *= 1 - m;
  }

  euler.set(rotX, rotY, theta);
  out.quat.setFromEuler(euler);
  return out;
}

// Linear for all t: off the left edge before the roll, past the right edge after it, so the
// reveal never jumps.
export function wipeX(p: BigGlyphPlan, t: number) {
  return p.edgeStart.x + p.rollSpeed * (t - T.atEdge) + p.wipeLead;
}

export function absorbTime(p: BigGlyphPlan, x: number) {
  return T.atEdge + (x - p.wipeLead - p.edgeStart.x) / p.rollSpeed;
}
