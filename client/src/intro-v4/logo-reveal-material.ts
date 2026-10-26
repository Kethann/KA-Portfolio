import * as THREE from 'three';
import { STAR_UNIT_PATH } from './logo-paths';

export const GLYPH_QUAD_SCALE = 2.6;

export function createLogoTexture(img: HTMLImageElement, renderer: THREE.WebGLRenderer): THREE.Texture {
  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.premultiplyAlpha = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

// R: crisp glyph shape, G: soft halo, B: hot core falloff. Circumradius = size / (2 * GLYPH_QUAD_SCALE).
export function createGlyphTexture(size = 256): THREE.CanvasTexture {
  const unit = size / (2 * GLYPH_QUAD_SCALE);
  const path = new Path2D(STAR_UNIT_PATH);
  const layer = (draw: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.translate(size / 2, size / 2);
    draw(ctx);
    return ctx.getImageData(0, 0, size, size).data;
  };
  const shape = layer((ctx) => {
    ctx.scale(unit, unit);
    ctx.fillStyle = '#fff';
    ctx.fill(path);
  });
  const halo = layer((ctx) => {
    // Shadow-only trick: shape drawn off-canvas, its blurred shadow offset back into view.
    const off = size * 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = size * 0.07;
    ctx.shadowOffsetX = off;
    ctx.setTransform(unit * 1.25, 0, 0, unit * 1.25, size / 2 - off, size / 2);
    ctx.fillStyle = '#fff';
    ctx.fill(path);
  });
  const core = layer((ctx) => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, unit * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-size / 2, -size / 2, size, size);
  });
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const out = ctx.createImageData(size, size);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = shape[i + 3];
    out.data[i + 1] = halo[i + 3];
    out.data[i + 2] = core[i + 3];
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export interface LogoRevealOptions {
  map: THREE.Texture;
  glyphMap: THREE.Texture;
  imgRect: THREE.Vector4;
  glyphRect: THREE.Vector4;
  softness: number;
}

export function createLogoRevealMaterial(o: LogoRevealOptions): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uMap: { value: o.map },
      uGlyphMap: { value: o.glyphMap },
      uImgRect: { value: o.imgRect },
      uGlyphRect: { value: o.glyphRect },
      uRevealX: { value: -100 },
      uDirection: { value: 1 },
      uSoftness: { value: o.softness },
      uEdge: { value: 0 },
      uStarDock: { value: 0 },
      uGlyphGlow: { value: 1 },
      uSheen: { value: -1 },
      uSheenAmp: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform sampler2D uGlyphMap;
      uniform vec4 uImgRect;
      uniform vec4 uGlyphRect;
      uniform float uRevealX, uDirection, uSoftness, uEdge, uStarDock, uGlyphGlow;
      uniform float uSheen, uSheenAmp, uTime, uOpacity;
      varying vec2 vUv;
      varying vec3 vWorld;

      float inside(vec2 p) {
        return step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
      }

      void main() {
        vec2 iuv = (vUv - uImgRect.xy) / (uImgRect.zw - uImgRect.xy);
        vec4 c = texture2D(uMap, clamp(iuv, 0.0, 1.0)) * inside(iuv);

        float d = (uRevealX - vWorld.x) * uDirection;
        float reveal = smoothstep(-uSoftness, uSoftness, d);
        float band = exp(-pow(d / uSoftness, 2.0)) * uEdge;
        float heat = exp(-max(d, 0.0) / (uSoftness * 4.0)) * uEdge;

        float diag = iuv.x - 0.42 * iuv.y;
        float sh = exp(-pow((diag - uSheen) / 0.035, 2.0)) * 0.42
                 + exp(-pow((diag - uSheen + 0.075) / 0.012, 2.0)) * 0.3;

        vec3 base = c.rgb / max(c.a, 1e-4);
        vec3 lit = base * (1.0 + heat * 0.25)
                 + vec3(1.0, 0.4, 0.38) * band * 0.9
                 + vec3(1.0, 0.93, 0.9) * sh * uSheenAmp;
        float a = c.a * reveal;

        vec2 guv = (vUv - uGlyphRect.xy) / (uGlyphRect.zw - uGlyphRect.xy);
        vec3 g = texture2D(uGlyphMap, clamp(guv, 0.0, 1.0)).rgb * inside(guv) * uStarDock;
        float tw = 0.8 + 0.2 * sin(uTime * 2.1) * sin(uTime * 3.7 + 1.3);
        vec3 ruby = vec3(1.0, 0.07, 0.12);
        vec3 core = mix(ruby * 1.25, vec3(1.7, 1.5, 1.5), g.b);
        vec3 gcol = core * g.r + ruby * g.g * 0.6 * tw * uGlyphGlow;
        float ga = clamp(g.r + g.g * 0.3 * uGlyphGlow, 0.0, 1.0);

        // composite premultiplied in linear light, then encode the straight colour for the screen
        vec3 P = lit * a * (1.0 - g.r) + gcol;
        float A = a * (1.0 - ga) + ga;
        vec3 straight = clamp(P / max(A, 1e-4), 0.0, 1.0);
        vec3 enc = linearToOutputTexel(vec4(straight, 1.0)).rgb;
        gl_FragColor = vec4(enc * A, A) * uOpacity;
      }
    `,
  });
}
