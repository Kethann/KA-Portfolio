// Realistic scene backgrounds rendered on the GPU (WebGL fragment shaders): fire with rising heat and embers,
// nebulae with depth-layered stars, underwater caustics and light shafts, volumetric light through haze,
// rain on glass refracting city bokeh, lit cave rock, drifting fog, aurora curtains, lava, golden dust...
// Every shader reads the palette (so a theme or your own colours recolour it), an intensity and a clock.
// The same program renders the live stage (at a resolution that adapts to the device's speed) and exports at any size.

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime; uniform float uI; uniform float uSeed;
uniform vec3 uBg; uniform vec3 uText; uniform vec3 uA1; uniform vec3 uA2; uniform vec3 uGlow;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21) + uSeed * 0.0001); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))) + uSeed * 0.001) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 3; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }
vec3 glowAt(vec2 p, vec2 c, float r, vec3 col){ float d = length(p - c); return col * exp(-d * d / (r * r)); }
// black body: the colour of fire by temperature 0..1
vec3 fireRamp(float t){
  vec3 c = mix(vec3(0.0), vec3(0.5, 0.04, 0.01), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(1.0, 0.3, 0.03), smoothstep(0.2, 0.5, t));
  c = mix(c, vec3(1.0, 0.7, 0.18), smoothstep(0.45, 0.75, t));
  return mix(c, vec3(1.0, 0.96, 0.84), smoothstep(0.75, 1.0, t));
}
// a lightning bolt hanging from the clouds: its x follows a jagged path down; returns its brightness
float boltAt(vec2 p, float x0, float seed, float len){
  float y = 0.5 - p.y;   // 0 at the top of the frame
  float yy = clamp(y, 0.0, len);
  float px = x0 + (fbm3(vec2(yy * 6.0, seed)) - 0.5) * 0.35 + (noise(vec2(yy * 40.0, seed * 3.0)) - 0.5) * 0.03;
  float d = length(vec2(p.x - px, y - yy));                 // past the tip, the distance to the tip: the glow fades out round
  float core = smoothstep(0.004, 0.0, d) * step(0.0, y) * step(y, len);
  return core * 1.4 + exp(-d * 60.0) * 0.6 + exp(-d * 12.0) * 0.18;
}
// falling rain: hair-thin, slightly slanted streaks of different lengths and speeds
float rainStreaks(vec2 p, float t){
  float r = 0.0;
  for (int i = 0; i < 2; i++){
    float fi = float(i), sc = 60.0 + fi * 50.0;
    vec2 q = vec2(p.x * sc + p.y * 6.0, p.y * (2.0 + fi) + t * (4.5 + fi * 2.0));
    vec2 id = floor(q); vec2 f = fract(q); float h = hash(id + fi * 7.0);
    float lane = smoothstep(0.09, 0.0, abs(f.x - 0.5 - (h - 0.5) * 0.6));
    float len = smoothstep(0.0, 0.35, f.y) * smoothstep(1.0, 0.55, f.y);
    r += lane * len * step(0.82, h) * (0.6 + 0.4 * fi);
  }
  return r;
}
// soft out-of-focus lights: a disc with a brighter rim, like a real lens
vec3 bokeh(vec2 p, float scale, float drift, vec3 c1, vec3 c2, float density){
  vec2 g = p * scale + vec2(0.0, drift); vec2 id = floor(g), f = fract(g) - 0.5;
  float h = hash(id + 1.7); if (h > density) return vec3(0.0);
  vec2 o = (hash2(id) - 0.5) * 0.36; float r = 0.13 + 0.15 * hash(id + 4.1); float d = length(f - o);
  float disc = smoothstep(r, r - 0.035, d) * (0.6 + 0.4 * smoothstep(r - 0.09, r, d));
  return mix(c1, c2, hash(id + 9.0)) * disc;
}
`;
const MAIN = `
void main(){
  vec2 uv = gl_FragCoord.xy / uRes; vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 c = scene(uv, p);
  c += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;   // dither: no banding in soft gradients
  gl_FragColor = vec4(max(c, 0.0), 1.0);
}`;

export const SHADERS: Record<string, string> = {
  // ---------------------------------------------------------------- fire: a wall of flame, smoke above, embers and heat
  fire: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec2 sq = p * 1.3 + vec2(0.0, -t * 0.06);
    float smoke = fbm(sq + fbm(sq * 1.7 + vec2(t * 0.03, 0.0)) * 1.3);
    vec3 col = uBg * 0.1 + mix(vec3(0.06, 0.03, 0.025), vec3(0.22, 0.08, 0.03), smoothstep(0.35, 0.85, smoke)) * (0.4 + uv.y * 0.2);
    float h = 1.0 - uv.y;                                   // 1 at the bottom
    vec2 q = vec2(p.x * 2.4, uv.y * 2.6 - t * 1.35);
    float n1 = fbm(q + vec2(fbm(q * 1.4 + 3.0) * 0.7, 0.0));
    float n2 = fbm(vec2(p.x * 6.0, uv.y * 5.0 - t * 2.4) + n1 * 1.5);
    float base = smoothstep(0.5 - uI * 0.15, 1.0, h);
    float ft = clamp(base * 1.45 + (n1 - 0.5) * 1.3 + (n2 - 0.5) * 0.6 - 0.55, 0.0, 1.0);
    vec3 flame = fireRamp(ft) * (0.9 + ft * 0.5);
    col = mix(col, flame, smoothstep(0.02, 0.35, ft));
    col += vec3(1.0, 0.32, 0.05) * pow(h, 3.5) * (0.22 + uI * 0.25);            // the glow the fire throws upward
    col += vec3(0.9, 0.35, 0.08) * smoothstep(0.55, 0.95, smoke) * pow(h, 1.5) * 0.25;   // smoke lit from below
    for (int L = 0; L < 3; L++){
      float fl = float(L);
      vec2 g = vec2(p.x * (9.0 + fl * 6.0) + sin(uv.y * 6.0 + t + fl) * 0.6, uv.y * (5.0 + fl * 3.0) + t * (0.8 + fl * 0.4));
      vec2 id = floor(g), f = fract(g) - 0.5; float e = hash(id + fl * 11.0);
      if (e < 0.86) continue;
      vec2 o = (hash2(id) - 0.5) * 0.6;
      float d = length((f - o) * vec2(1.0, 0.6));
      col += fireRamp(0.7 + 0.3 * e) * smoothstep(0.08 + fl * 0.03, 0.0, d) * (0.6 + 0.4 * sin(t * 12.0 + e * 50.0)) * smoothstep(0.0, 0.6, h) * (1.4 - fl * 0.3);
    }
    col = col / (1.0 + col * 0.55) * 1.3;                                      // filmic roll-off: no blown-out white
    return col * (1.0 - 0.35 * length(p * vec2(0.8, 1.0)));
  }`,
  // ---------------------------------------------------------------- snow: a moonlit winter night with snowfall in depth
  snow: `vec3 flakes(vec2 p, float scale, float speed, float size, float blur, float t, float dens){
    vec2 q = vec2(p.x + sin(p.y * 3.0 + t * 0.4 + scale) * 0.03 + t * 0.02 * speed, p.y + t * speed) * scale;
    vec2 id = floor(q), f = fract(q) - 0.5; float h = hash(id + scale);
    if (h > dens) return vec3(0.0);
    vec2 o = (hash2(id) - 0.5) * 0.7;
    float d = length(f - o), r = size * (0.6 + 0.6 * hash(id + 2.0));
    return vec3(smoothstep(r + blur, r - blur * 0.5, d));
  }
  vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec3 sky = mix(mix(uBg, vec3(0.1, 0.16, 0.3), 0.55), mix(uBg, vec3(0.02, 0.03, 0.08), 0.7), uv.y);
    vec2 moon = vec2(0.5, 0.36); float md = length(p - moon);
    vec3 col = sky + vec3(0.8, 0.86, 1.0) * (smoothstep(0.032, 0.029, md) * (0.85 - 0.15 * fbm3(p * 60.0)) + exp(-md * 9.0) * 0.22 + exp(-md * 2.5) * 0.06);
    float far = fbm3(vec2(p.x * 2.2, 3.0)) * 0.16 - 0.14;
    col = mix(col, mix(sky, vec3(0.5, 0.58, 0.76), 0.4), smoothstep(far + 0.004, far, p.y));   // distant snowy hills
    // a line of pines: each a narrow triangle of a random height along a rolling ridge
    float ridge = fbm3(vec2(p.x * 3.0 + 9.0, 1.0)) * 0.12 - 0.3;
    float cell = p.x * 26.0, ci = floor(cell), cx = fract(cell) - 0.5;
    float th = 0.05 + 0.09 * hash(vec2(ci, 4.0));
    float pine = step(abs(cx) * 2.0 * th, ridge + th - p.y) * step(ridge - 0.02, p.y);
    col = mix(col, uBg * 0.2 + vec3(0.015, 0.03, 0.05), max(pine, smoothstep(ridge + 0.004, ridge, p.y)));
    float ground = -0.36 + fbm3(vec2(p.x * 2.0, 5.0)) * 0.05;
    col = mix(col, vec3(0.72, 0.8, 0.95) * (0.75 + 0.25 * fbm(p * 8.0)), smoothstep(ground + 0.004, ground, p.y));   // snow on the ground
    col += vec3(0.6, 0.7, 0.9) * fbm(p * 1.5 + vec2(t * 0.02, 0.0)) * 0.12 * smoothstep(0.2, -0.4, p.y);   // low mist
    col += flakes(p, 60.0, 0.05, 0.07, 0.02, t, 0.45) * 0.5;
    col += flakes(p + 3.0, 28.0, 0.08, 0.07, 0.04, t, 0.22) * 0.7 * (0.5 + uI);
    col += flakes(p + 7.0, 11.0, 0.13, 0.06, 0.09, t, 0.06) * 0.5 * (0.4 + uI);
    return col;
  }`,
  // ---------------------------------------------------------------- deep space: nebula + depth-layered twinkling stars
  space: `vec3 stars(vec2 p, float s, float t, float k){
    vec2 g = p * s; vec2 id = floor(g), f = fract(g) - 0.5; float h = hash(id); vec2 o = (hash2(id) - 0.5) * 0.7;
    float d = length(f - o); float tw = 0.65 + 0.35 * sin(t * (1.0 + h * 3.0) + h * 40.0);
    float star = smoothstep(0.05 * k, 0.0, d) + 0.25 * exp(-d * 40.0 / k);
    return vec3(star * step(0.72, h) * tw) * mix(vec3(0.8, 0.88, 1.0), vec3(1.0, 0.9, 0.8), hash(id + 3.0));
  }
  vec3 scene(vec2 uv, vec2 p){
    float t = uTime; vec2 q = p * 1.5 + vec2(t * 0.008, 0.0);
    float n = fbm(q + fbm(q * 1.7 + t * 0.015) * 1.6);
    float n2 = fbm(q * 2.2 - 3.7 + t * 0.01);
    float dust = smoothstep(0.25, 0.65, fbm(q * 3.2 + 7.0));
    vec3 neb = uA1 * pow(n, 2.6) * 1.9 + uA2 * pow(n2, 3.0) * 1.6;
    neb *= 0.25 + 0.75 * dust;
    vec3 col = uBg * 0.55 + neb * (0.3 + uI * 0.9);
    col += stars(p + vec2(t * 0.002, 0.0), 70.0, t, 0.7) * 0.7;
    col += stars(p + vec2(t * 0.004, 0.0), 32.0, t, 1.0);
    col += stars(p + vec2(t * 0.007, 0.0) + 11.0, 13.0, t, 1.6) * 1.2;
    return col;
  }`,
  // ---------------------------------------------------------------- under the sea: caustics, light shafts, plankton
  ocean: `float caustic(vec2 p, float t){
    vec2 i = p; float c = 1.0; float inten = 0.005;
    for (int n = 0; n < 4; n++){
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
    }
    c /= 4.0; c = 1.17 - pow(c, 1.4); return pow(abs(c), 8.0);
  }
  vec3 scene(vec2 uv, vec2 p){
    float t = uTime * 0.5;
    vec3 deep = mix(uBg * 0.35, mix(uBg, uA2, 0.55), pow(uv.y, 1.4));
    vec3 col = deep;
    col += uGlow * caustic(p * 3.0 + vec2(0.0, t * 0.2), t) * 0.22 * uv.y * (0.4 + uI);
    float a = atan(p.x - 0.2, 1.4 - p.y);
    float rays = pow(fbm(vec2(a * 9.0, t * 0.3)), 2.5) * smoothstep(0.0, 1.0, uv.y);
    col += uGlow * rays * 0.45 * (0.4 + uI);
    vec2 g = vec2(p.x * 22.0, p.y * 22.0 + uTime * 0.6); vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    col += vec3(0.8, 0.95, 1.0) * smoothstep(0.06, 0.0, length(f - (hash2(id) - 0.5) * 0.6)) * step(0.9, hash(id)) * 0.4;
    return col;
  }`,
  // ---------------------------------------------------------------- cinema: haze, god rays from a key light, anamorphic streak, letterbox
  cinema: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec2 L = vec2(0.55 + sin(t * 0.07) * 0.08, 0.62);
    vec2 d = p - L; float ang = atan(d.y, d.x);
    float rays = pow(fbm(vec2(ang * 7.0, t * 0.12)), 2.2) * exp(-length(d) * 1.1);
    float haze = fbm(p * 2.2 + vec2(t * 0.03, 0.0));
    vec3 col = mix(uBg * 0.25, uBg * 0.8, 1.0 - length(p) * 0.7);
    col += uA1 * rays * (0.6 + uI * 0.9);
    col += uGlow * glowAt(p, L, 0.18, vec3(0.6)) * (0.5 + uI);
    col += uA2 * haze * 0.12 * (0.5 + uI);
    float streak = exp(-abs(p.y - L.y) * 120.0) * exp(-abs(p.x - L.x) * 1.4);
    col += mix(uGlow, vec3(0.55, 0.75, 1.0), 0.5) * streak * 0.9;
    float bar = (uRes.y - uRes.x / 2.39) * 0.5 / uRes.y;
    if (uv.y < bar || uv.y > 1.0 - bar) col *= 0.0;
    return col;
  }`,
  spotlight: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime; vec3 col = uBg * 0.18;
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      vec2 src = vec2(-0.55 + fi * 0.55, 0.75);
      float sw = sin(t * 0.33 + fi * 2.1) * 0.35;
      vec2 dir = normalize(vec2(sw, -1.0));
      vec2 d = p - src; float along = dot(d, dir); float across = abs(dot(d, vec2(-dir.y, dir.x)));
      float cone = smoothstep(along * 0.28 + 0.02, along * 0.18, across) * step(0.0, along);
      float dust = 0.6 + 0.4 * fbm(p * 6.0 + vec2(0.0, t * 0.2));
      col += mix(uGlow, uA1, fi * 0.4) * cone * exp(-along * 0.9) * dust * (0.35 + uI * 0.5);
      col += mix(uGlow, uA1, fi * 0.4) * glowAt(p, src + dir * 1.25, 0.25, vec3(0.25));
    }
    col += uA1 * 0.1 * smoothstep(0.35, 0.0, uv.y);
    return col;
  }`,
  // ---------------------------------------------------------------- rain: a city at night, wet street reflections, rain in depth
  rain: `vec3 city(vec2 p){
    vec3 c = mix(uBg * 0.25, mix(uBg, uA2, 0.3), 0.5 + p.y * 0.5);
    c += bokeh(p, 4.0, 0.0, uA1, uGlow, 0.35) * 0.55 * smoothstep(0.4, -0.2, p.y);
    c += bokeh(p + 3.1, 7.0, 0.0, uGlow, uA2, 0.3) * 0.4 * smoothstep(0.35, -0.2, p.y);
    return c;
  }
  vec3 scene(vec2 uv, vec2 p){
    float t = uTime, hz = -0.18;
    vec3 col;
    if (p.y > hz) col = city(p);
    else {
      // the wet street mirrors the lights, stretched and broken up by ripples
      vec2 rp = vec2(p.x + (noise(vec2(p.x * 30.0, p.y * 80.0 + t * 3.0)) - 0.5) * 0.02, 2.0 * hz - p.y);
      col = city(vec2(rp.x, hz + (hz - p.y) * 0.35)) * 0.55 * (0.7 + 0.3 * noise(vec2(p.x * 3.0, p.y * 40.0)));
      col += uBg * 0.05;
      vec2 g = vec2(p.x * 14.0, p.y * 30.0); vec2 id = floor(g); float ph = fract(t * 1.4 + hash(id) * 9.0);
      float ring = smoothstep(0.05, 0.0, abs(length((fract(g) - 0.5) * vec2(1.0, 2.2)) - ph * 0.45)) * (1.0 - ph) * step(0.7, hash(id + 1.0));
      col += vec3(0.6, 0.7, 0.85) * ring * 0.35;
    }
    col += vec3(0.7, 0.75, 0.85) * rainStreaks(p, t) * 0.45 * (0.5 + uI);
    col += vec3(0.55, 0.6, 0.7) * rainStreaks(p * 0.6 + 2.0, t * 0.8) * 0.25;
    float flash = pow(max(0.0, sin(t * 0.31 + 1.0)), 600.0) + pow(max(0.0, sin(t * 0.31 + 1.06)), 600.0) * 0.6;
    col += vec3(0.75, 0.8, 1.0) * flash * 0.5 * uI;
    col += vec3(0.5, 0.55, 0.65) * fbm(p * 2.0 + vec2(t * 0.05, 0.0)) * 0.08;   // mist
    return col;
  }`,
  // ---------------------------------------------------------------- storm: heavy clouds lit from inside, forked lightning, rain
  storm: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    float cyc = t * 0.35, k = fract(cyc), id = floor(cyc);
    float strike = k < 0.04 ? 1.0 : k < 0.07 ? 0.2 : k < 0.12 ? 1.0 : k < 0.3 ? 1.0 - (k - 0.12) / 0.18 : 0.0;
    strike *= step(0.25, hash(vec2(id, 7.0)));
    float bx = (hash(vec2(id, 1.0)) - 0.5) * 1.2;
    vec2 q = p * 1.3 + vec2(t * 0.03, 0.0);
    float cl = fbm(q + fbm(q * 1.6 - t * 0.02) * 1.4);
    float cl2 = fbm(q * 2.4 + 5.0 + t * 0.015);
    vec3 col = mix(uBg * 0.12, mix(uBg, uA2, 0.35) * 0.5, smoothstep(0.3, 0.8, cl));
    col += mix(uA2, vec3(1.0), 0.4) * smoothstep(0.45, 0.9, cl2) * 0.08;
    // the clouds light up from inside around the strike
    float lit = exp(-length((p - vec2(bx, 0.38)) * vec2(0.9, 1.5)) * 2.4) * strike;
    col += mix(uGlow, vec3(0.85, 0.9, 1.0), 0.6) * (cl * 1.6 + 0.2) * lit * (0.8 + uI);
    col += vec3(0.75, 0.82, 1.0) * strike * 0.12 * uI;
    float b = boltAt(p, bx, id, 0.55 + hash(vec2(id, 3.0)) * 0.45);
    float br = boltAt(p - vec2(0.06, 0.12), bx + 0.06, id + 0.5, 0.25) * 0.6;   // a branch
    col += mix(vec3(0.8, 0.86, 1.0), uGlow, 0.25) * (b + br) * strike;
    col += vec3(0.75, 0.8, 0.9) * rainStreaks(p, t) * 0.38;
    col += vec3(0.6, 0.65, 0.75) * rainStreaks(p * 0.7 + 3.0, t * 0.85) * 0.2;
    return col * (1.0 - 0.3 * length(p));
  }`,
  // ---------------------------------------------------------------- frozen: frosted glass crystals, cold light, glints
  ice: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec2 g = p * 6.0; vec2 id = floor(g); vec2 f = fract(g);
    float d1 = 9.0, d2 = 9.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 n = vec2(float(x), float(y)); vec2 o = hash2(id + n); float d = length(n + o - f); if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    float edge = smoothstep(0.08, 0.0, d2 - d1);
    float frost = fbm(p * 7.0) * smoothstep(0.2, 1.2, length(p * vec2(0.8, 1.0)));
    vec3 col = mix(mix(uBg, uA2, 0.35), uBg * 0.6, uv.y * 0.3 + 0.2);
    col += uGlow * glowAt(p, vec2(0.0, 0.7), 0.7, vec3(0.35));
    col += vec3(0.85, 0.95, 1.0) * (edge * 0.12 + frost * 0.5) * (0.5 + uI);
    vec2 sg = p * 30.0; vec2 sid = floor(sg); float sh = hash(sid);
    col += vec3(1.0) * smoothstep(0.08, 0.0, length(fract(sg) - 0.5 - (hash2(sid) - 0.5) * 0.6)) * step(0.97, sh) * (0.5 + 0.5 * sin(t * 3.0 + sh * 50.0));
    return col;
  }`,
  // ---------------------------------------------------------------- underground: lit 3D rock (bump-mapped), lantern, dust
  underground: `float rock(vec2 p){ return fbm(p * 2.2) * 0.7 + (1.0 - abs(fbm(p * 4.5 + 3.0) * 2.0 - 1.0)) * 0.3; }
  vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    float e = 0.004, h = rock(p), hx = rock(p + vec2(e, 0.0)), hy = rock(p + vec2(0.0, e));
    vec3 n = normalize(vec3((h - hx) / e * 0.06, (h - hy) / e * 0.06, 1.0));
    vec2 lp = vec2(sin(t * 0.3) * 0.35, cos(t * 0.23) * 0.15);
    vec3 L = normalize(vec3(lp - p, 0.35));
    float flick = 0.92 + 0.08 * sin(t * 13.0) * sin(t * 7.3);
    float fall = 1.0 / (1.0 + dot(lp - p, lp - p) * 6.0);
    float diff = max(0.0, dot(n, L));
    vec3 stone = mix(uBg * 0.6, mix(uBg, uA2, 0.6), h);
    vec3 col = stone * (0.08 + diff * fall * 1.6 * flick) * mix(vec3(1.0), uA1 * 1.4 + 0.2, 0.5);
    col += uA1 * fall * 0.25 * flick * (0.5 + uI);
    vec2 g = vec2(p.x * 18.0, p.y * 18.0 + t * 0.3); vec2 id = floor(g);
    col += uGlow * smoothstep(0.05, 0.0, length(fract(g) - 0.5 - (hash2(id) - 0.5) * 0.6)) * step(0.9, hash(id)) * fall * 0.8;
    return col;
  }`,
  crypt: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec3 col = mix(uBg * 0.2, uBg * 0.6, uv.y);
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      float f = fbm(p * (1.5 + fi * 0.7) + vec2(t * (0.03 + fi * 0.02), fi * 3.0));
      col += mix(uA2, uText, 0.3) * smoothstep(0.35, 0.9, f) * (0.1 + 0.05 * fi) * (0.6 + uI) * smoothstep(1.0, 0.0, uv.y + 0.2 * fi);
    }
    col += uGlow * glowAt(p, vec2(0.45, 0.55), 0.35, vec3(0.18));
    col += uA1 * glowAt(p, vec2(0.0, -0.3), 0.6, vec3(0.06 + 0.03 * sin(t * 1.7)));
    return col * (1.0 - 0.6 * length(p) * 0.6);
  }`,
  // ---------------------------------------------------------------- ancient parchment: fibres, stains, burnt edges, warm light
  ancient: `vec3 scene(vec2 uv, vec2 p){
    float fib = fbm(vec2(p.x * 40.0, p.y * 6.0)) * 0.5 + fbm(p * 9.0) * 0.5;
    float stain = smoothstep(0.55, 0.8, fbm(p * 2.4 + 4.0));
    vec3 paper = uBg * (0.86 + fib * 0.22);
    paper = mix(paper, paper * vec3(0.78, 0.66, 0.5), stain * 0.6);
    float edge = smoothstep(0.55, 0.95, length(p * vec2(0.85, 1.1)) + fbm(p * 5.0) * 0.18);
    paper = mix(paper, paper * vec3(0.45, 0.32, 0.2), edge);
    paper += uGlow * glowAt(p, vec2(0.1, 0.2), 0.8, vec3(0.08 + 0.02 * sin(uTime * 0.8))) * uI;
    return paper;
  }`,
  temple: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec2 L = vec2(0.0, 0.75); vec2 d = p - L; float ang = atan(d.x, -d.y);
    float rays = pow(fbm(vec2(ang * 10.0, t * 0.08)), 2.0) * smoothstep(1.6, 0.0, length(d));
    vec3 col = mix(uBg * 0.3, mix(uBg, uA1, 0.3), uv.y);
    col += uGlow * rays * (0.5 + uI);
    float cols = step(0.55, fract(p.x * 3.0 + 0.5)) * step(p.y, -0.15);
    col = mix(col, uBg * 0.12, cols * 0.85);
    vec2 g = vec2(p.x * 26.0, p.y * 26.0 - t * 0.2); vec2 id = floor(g);
    col += uGlow * smoothstep(0.05, 0.0, length(fract(g) - 0.5 - (hash2(id) - 0.5) * 0.7)) * step(0.88, hash(id)) * rays * 3.0;
    return col;
  }`,
  // ---------------------------------------------------------------- neon horizon: glowing grid, striped sun, mountains, fog
  synthwave: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime; float hz = -0.08;
    vec3 col;
    if (p.y > hz){
      col = mix(mix(uBg, uA1, 0.35), uBg * 0.4, smoothstep(hz, 0.6, p.y));
      vec2 sp = p - vec2(0.0, hz + 0.2); float r = length(sp);
      float bands = step(0.0, sin((p.y - hz) * 90.0 - t * 2.0) + (p.y - hz) * 12.0 - 1.4);
      vec3 sun = mix(uA1, uGlow, smoothstep(-0.25, 0.25, sp.y)) * smoothstep(0.255, 0.25, r) * bands;
      col += sun + uA1 * exp(-r * 4.0) * 0.35;
      float m = fbm3(vec2(p.x * 3.0, 0.0)) * 0.22 + hz + 0.02;
      col = mix(col, uBg * 0.25, step(p.y, m) * 0.95);
      vec2 g = p * 60.0; vec2 id = floor(g); col += vec3(step(0.985, hash(id)) * smoothstep(0.1, 0.4, p.y - hz));
    } else {
      float z = 0.35 / (hz - p.y + 0.001);
      vec2 gp = vec2(p.x * z, z + t * 1.2 * (0.4 + uI));
      vec2 gl = abs(fract(gp) - 0.5) / fwidthApprox(z);
      float line = 1.0 - min(min(gl.x, gl.y), 1.0);
      col = uBg * 0.3 + uA2 * line * 0.9 * smoothstep(0.0, 0.25, hz - p.y + 0.02) ;
      col += uA2 * exp(-(hz - p.y) * 9.0) * 0.4;
    }
    return col;
  }`.replace('fwidthApprox(z)', '(z * 0.06 + 0.02)'),
  forest: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec3 col = mix(mix(uBg, uA2, 0.25), uBg * 0.4, 1.0 - uv.y);
    for (int i = 0; i < 4; i++){
      float fi = float(i), depth = 1.0 - fi * 0.22;
      float x = p.x * (2.0 + fi * 1.5) + fi * 7.3;
      float trunk = step(0.82 - fi * 0.08, fract(x + fbm3(vec2(floor(x), fi)) * 0.3));
      col = mix(col, mix(uBg * 0.15, col, fi * 0.25), trunk * depth * 0.85);
    }
    float a = atan(p.x + 0.6, 1.2 - p.y);
    col += uGlow * pow(fbm(vec2(a * 12.0, t * 0.05)), 3.0) * smoothstep(0.0, 1.0, uv.y) * 0.5 * uI;
    vec2 g = p * 7.0 + vec2(sin(t * 0.2), cos(t * 0.17)); vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    vec2 o = (hash2(id) - 0.5) * 0.6 + 0.12 * vec2(sin(t * 0.7 + hash(id) * 9.0), cos(t * 0.6 + hash(id) * 7.0));
    float fly = exp(-length(f - o) * 28.0) * step(0.7, hash(id + 2.0)) * (0.5 + 0.5 * sin(t * 2.0 + hash(id) * 30.0));
    col += uGlow * fly * 1.6 * (0.5 + uI);
    return col;
  }`,
  glow: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime * 0.12;
    vec2 q = p + vec2(fbm(p * 1.4 + t), fbm(p * 1.4 - t + 5.0)) * 0.6;
    float a = fbm(q * 1.2 + 2.0), b = fbm(q * 1.6 - 3.0);
    vec3 col = uBg * 0.85;
    col = mix(col, mix(uBg, uA1, 0.55), smoothstep(0.45, 0.8, a) * (0.4 + uI * 0.6));
    col = mix(col, mix(uBg, uA2, 0.5), smoothstep(0.5, 0.85, b) * (0.35 + uI * 0.5));
    return col;
  }`,
  party: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec3 col = uBg * 0.7 + uA1 * 0.06;
    col += bokeh(p + vec2(0.0, t * 0.02), 3.0, 0.0, uA1, uA2, 0.6) * 0.5 * (0.5 + uI);
    col += bokeh(p + vec2(1.3, -t * 0.03), 5.0, 0.0, uGlow, uA1, 0.55) * 0.45 * (0.5 + uI);
    col += bokeh(p + vec2(2.7, t * 0.05), 9.0, 0.0, uA2, uGlow, 0.5) * 0.35 * (0.5 + uI);
    return col;
  }`,
  sakura: `vec3 petal(vec2 p, float scale, float t, float speed){
    vec2 g = p * scale + vec2(t * 0.15 * speed, t * 0.35 * speed); vec2 id = floor(g); vec2 f = fract(g) - 0.5;
    float h = hash(id); if (h < 0.55) return vec3(0.0);
    float a = t * (0.6 + h) + h * 20.0; vec2 o = (hash2(id) - 0.5) * 0.5; vec2 d = f - o;
    d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d; d.x *= 1.0 + 0.6 * abs(sin(a * 0.7));
    float e = length(d * vec2(1.0, 1.9)); return mix(uA1, uGlow, hash(id + 2.0)) * smoothstep(0.13, 0.09, e);
  }
  vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec3 col = mix(mix(uBg, uA1, 0.12), uBg, uv.y);
    col += uGlow * glowAt(p, vec2(0.55, 0.45), 0.55, vec3(0.35));
    col += bokeh(p, 4.0, t * 0.05, uA1, uGlow, 0.4) * 0.25;
    vec3 pt = petal(p, 9.0, -t, 1.0) * 0.9 + petal(p + 3.3, 5.0, -t, 0.7) * 0.6 * (0.4 + uI);
    return mix(col, pt, clamp(length(pt) * 1.4, 0.0, 0.9));
  }`,
  hearts: `float heartSdf(vec2 p){ p.x = abs(p.x); p.y = -p.y + 0.1; if (p.y + p.x > 1.0) return sqrt(dot(p - vec2(0.25, 0.75), p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
    return sqrt(min(dot(p - vec2(0.0, 1.0), p - vec2(0.0, 1.0)), dot(p - 0.5 * max(p.x + p.y, 0.0), p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y); }
  vec3 layer(vec2 p, float scale, float t, float blur){
    vec2 g = p * scale + vec2(0.0, -t * 0.25); vec2 id = floor(g); vec2 f = fract(g) - 0.5; float h = hash(id); if (h < 0.6) return vec3(0.0);
    vec2 d = (f - (hash2(id) - 0.5) * 0.4) * 3.2; float s = heartSdf(d + vec2(0.0, 0.5));
    return mix(uA1, uGlow, hash(id + 1.0)) * smoothstep(blur, -blur, s);
  }
  vec3 scene(vec2 uv, vec2 p){
    float t = uTime; vec3 col = mix(mix(uBg, uA1, 0.18), uBg, uv.y);
    col += layer(p, 2.5, t * 0.6, 0.25) * 0.25 + layer(p + 2.0, 4.0, t * 0.8, 0.12) * 0.35 * (0.5 + uI) + layer(p + 5.0, 7.0, t, 0.05) * 0.4 * (0.4 + uI);
    return col;
  }`,
  noir: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec2 q = mat2(0.9, -0.44, 0.44, 0.9) * (p - vec2(0.3, 0.5));
    float blinds = step(0.5, fract(q.y * 7.0)) * smoothstep(1.4, 0.2, length(p - vec2(0.3, 0.2)));
    vec3 col = uBg * 0.35 + uGlow * blinds * 0.16 * (0.5 + uI);
    float smoke = fbm(p * 2.0 + vec2(t * 0.04, -t * 0.03) + fbm(p * 3.0 + t * 0.02));
    col += mix(uText, uGlow, 0.5) * smoothstep(0.45, 0.9, smoke) * 0.12;
    return col * (1.0 - 0.45 * length(p));
  }`,
  // ---------------------------------------------------------------- new scenes
  aurora: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime * 0.25;
    vec3 col = mix(uBg * 0.2, uBg * 0.7, uv.y);
    for (int i = 0; i < 3; i++){
      float fi = float(i);
      float x = p.x * (1.2 + fi * 0.4) + t * (0.3 + fi * 0.1);
      float curtain = fbm(vec2(x * 2.0, fi * 4.0 + t * 0.4));
      float y0 = 0.05 + fi * 0.12 + curtain * 0.35;
      float band = smoothstep(y0 - 0.02, y0 + 0.05, p.y) * exp(-(p.y - y0) * (4.0 - fi));
      float rays = 0.6 + 0.4 * fbm(vec2(x * 22.0, t));
      col += mix(uA2, uA1, fi * 0.45) * band * rays * (0.35 + uI * 0.6);
    }
    vec2 g = p * 70.0; col += vec3(step(0.987, hash(floor(g)))) * smoothstep(0.0, 0.3, p.y) * 0.8;
    float m = fbm3(vec2(p.x * 2.5, 1.0)) * 0.25 - 0.32; col = mix(col, uBg * 0.08, step(p.y, m));
    return col;
  }`,
  lava: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime * 0.15;
    vec2 q = p * 2.2 + vec2(fbm(p * 2.0 + t), fbm(p * 2.0 - t + 3.0));
    float n = fbm(q + t * 0.5);
    float crack = smoothstep(0.06, 0.0, abs(n - 0.5));
    vec3 crust = mix(vec3(0.05, 0.02, 0.015), vec3(0.16, 0.07, 0.04), fbm(q * 3.0));
    vec3 hot = mix(uA1, vec3(1.0, 0.85, 0.4), crack);
    return mix(crust, hot, clamp(crack * (0.7 + uI) + smoothstep(0.62, 0.85, n) * 0.5, 0.0, 1.0));
  }`,
  clouds: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime * 0.03;
    vec3 sky = mix(mix(uA1, uGlow, 0.5), mix(uBg, uA2, 0.6), uv.y);
    vec2 q = p * vec2(1.2, 2.4) + vec2(t, 0.0);
    float c = fbm(q + fbm(q * 2.0 + t));
    float dens = smoothstep(0.42, 0.75, c);
    vec3 lit = mix(uA1 * 0.6, vec3(1.0, 0.92, 0.85), smoothstep(0.4, 0.9, fbm(q * 1.5 + vec2(0.3, -0.2))));
    vec3 col = mix(sky, lit, dens * (0.6 + uI * 0.4));
    col += uGlow * glowAt(p, vec2(0.0, -0.25), 0.4, vec3(0.6));
    return col;
  }`,
  smoke: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime * 0.12;
    vec2 q = p * 1.6; q += vec2(fbm(q + t), fbm(q - t + 4.0)) * 1.2;
    float s = fbm(q * 1.4 + t);
    vec3 col = uBg * 0.5;
    col = mix(col, uA1 * 0.9, smoothstep(0.45, 0.85, s) * (0.4 + uI * 0.5));
    col = mix(col, uA2 * 0.9, smoothstep(0.55, 0.95, fbm(q * 2.1 - t)) * (0.35 + uI * 0.5));
    return col;
  }`,
  golddust: `vec3 scene(vec2 uv, vec2 p){
    float t = uTime;
    vec3 col = uBg * 0.6 + uA1 * 0.05 * (1.0 - length(p));
    col += bokeh(p + vec2(t * 0.01, t * 0.02), 4.0, 0.0, uA1, uGlow, 0.5) * 0.35;
    col += bokeh(p + vec2(-t * 0.015, t * 0.03) + 2.0, 8.0, 0.0, uGlow, uA1, 0.45) * 0.4 * (0.5 + uI);
    vec2 g = p * 40.0 + vec2(0.0, t * 0.6); vec2 id = floor(g);
    col += uGlow * smoothstep(0.08, 0.0, length(fract(g) - 0.5 - (hash2(id) - 0.5) * 0.6)) * step(0.93, hash(id)) * (0.5 + 0.5 * sin(t * 3.0 + hash(id) * 40.0));
    float sweep = exp(-pow((p.x + p.y * 0.4) - sin(t * 0.2) * 1.2, 2.0) * 6.0);
    col += uGlow * sweep * 0.12;
    return col;
  }`,
};

export const fragmentFor = (id: string) => SHADERS[id] ? HEAD + SHADERS[id] + MAIN : null;
const VERT = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';

/** one WebGL context that can draw any of the shader scenes */
export class ShaderPainter {
  gl: WebGLRenderingContext | null; private progs = new Map<string, { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }>(); broken = new Set<string>();
  constructor(public canvas: HTMLCanvasElement, preserve = false){
    this.gl = (canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: preserve, powerPreference: 'high-performance' }) as WebGLRenderingContext | null);
    if (this.gl){
      const g = this.gl, b = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, b);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    }
  }
  private program(id: string){
    const g = this.gl!; const hit = this.progs.get(id); if (hit) return hit;
    const src = fragmentFor(id); if (!src) return null;
    const sh = (type: number, code: string) => { const s = g.createShader(type)!; g.shaderSource(s, code); g.compileShader(s); if (!g.getShaderParameter(s, g.COMPILE_STATUS)){ console.warn('scene shader', id, g.getShaderInfoLog(s)); return null; } return s; };
    const vs = sh(g.VERTEX_SHADER, VERT), fs = sh(g.FRAGMENT_SHADER, src); if (!vs || !fs){ this.broken.add(id); return null; }
    const p = g.createProgram()!; g.attachShader(p, vs); g.attachShader(p, fs); g.linkProgram(p);
    if (!g.getProgramParameter(p, g.LINK_STATUS)){ this.broken.add(id); return null; }
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of ['uRes', 'uTime', 'uI', 'uSeed', 'uBg', 'uText', 'uA1', 'uA2', 'uGlow']) u[n] = g.getUniformLocation(p, n);
    const rec = { p, u }; this.progs.set(id, rec); return rec;
  }
  /** can this scene be drawn here? (compiles it once) */
  supports(id: string){ return !!this.gl && !this.broken.has(id) && !!this.program(id); }
  draw(id: string, w: number, h: number, t: number, intensity: number, seed: number, cols: { bg: number[]; text: number[]; a1: number[]; a2: number[]; glow: number[] }){
    const g = this.gl; if (!g) return false; const pr = this.program(id); if (!pr) return false;
    if (this.canvas.width !== w || this.canvas.height !== h){ this.canvas.width = w; this.canvas.height = h; }
    g.viewport(0, 0, w, h); g.useProgram(pr.p);
    const loc = g.getAttribLocation(pr.p, 'a'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    g.uniform2f(pr.u.uRes, w, h); g.uniform1f(pr.u.uTime, t); g.uniform1f(pr.u.uI, intensity); g.uniform1f(pr.u.uSeed, seed % 10000);
    g.uniform3fv(pr.u.uBg, cols.bg); g.uniform3fv(pr.u.uText, cols.text); g.uniform3fv(pr.u.uA1, cols.a1); g.uniform3fv(pr.u.uA2, cols.a2); g.uniform3fv(pr.u.uGlow, cols.glow);
    g.drawArrays(g.TRIANGLES, 0, 3);
    return true;
  }
}
