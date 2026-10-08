// GLSL for the GPU text renderer (WebGL 1, so it runs everywhere WebGL does).
//  - LETTER: one quad per letter, shaded from the glyph's distance field: crisp edges at any size, a bevelled lit surface,
//    side walls (extrusion) and a soft shadow, 17 materials, and what the elements do to the letters themselves
//    (snow settling on top edges, rain running down the faces, heat on the rims, electric arcs along the outline).
//  - ELEMENT: a full-screen pass for what happens around the letters: flames rising off them, embers, snowfall in depth,
//    rain streaks and splashes on the letter tops, lightning bolts that strike a letter and light the whole frame.

export const COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 5; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6); for (int i = 0; i < 3; i++){ v += a * noise(p); p = m * p; a *= 0.5; } return v; }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
// black body: the colour of fire by temperature 0..1
vec3 fireRamp(float t){
  vec3 c = mix(vec3(0.0), vec3(0.55, 0.05, 0.01), smoothstep(0.0, 0.25, t));
  c = mix(c, vec3(1.0, 0.32, 0.03), smoothstep(0.2, 0.5, t));
  c = mix(c, vec3(1.0, 0.72, 0.18), smoothstep(0.45, 0.75, t));
  return mix(c, vec3(1.0, 0.97, 0.85), smoothstep(0.75, 1.0, t));
}
`;

export const LETTER_VS = `
attribute vec2 aPos; attribute vec2 aUV; attribute vec4 aTile; attribute vec4 aState; attribute vec4 aExtra; attribute vec2 aRot;
uniform vec2 uView;
varying vec2 vUV; varying vec4 vTile; varying vec4 vState; varying vec4 vExtra; varying vec2 vRot; varying vec2 vPos;
void main(){
  vUV = aUV; vTile = aTile; vState = aState; vExtra = aExtra; vRot = aRot; vPos = aPos;
  vec2 c = aPos / uView * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}`;

export const LETTER_FS = COMMON + `
uniform sampler2D uAtlas; uniform vec2 uAtlasSize; uniform float uSpread; uniform float uScale; uniform float uPx;
uniform float uTime; uniform float uMat; uniform float uFace; uniform float uMaskPass;
uniform float uHeight; uniform float uBevel; uniform float uExt; uniform float uShadow; uniform vec2 uAway; uniform vec3 uLight; uniform vec2 uCam;
uniform float uEnvRot; uniform float uSweep; uniform float uFontPx; uniform vec4 uBox;
uniform vec3 uText; uniform vec3 uA1; uniform vec3 uA2; uniform vec3 uGlow; uniform vec3 uBg;
uniform float uElem; uniform float uAmt; uniform float uAccum; uniform float uStrike; uniform float uFlash; uniform float uGlowAmt;
varying vec2 vUV; varying vec4 vTile; varying vec4 vState; varying vec4 vExtra; varying vec2 vRot; varying vec2 vPos;

float sdAt(vec2 offLocal){
  vec2 uv = clamp(vUV + offLocal * uScale, vTile.xy + 0.5, vTile.zw - 0.5);
  return (0.5 - texture2D(uAtlas, uv / uAtlasSize).r) * 2.0 * uSpread / uScale;
}
// the studio around the letters, reflected by metals: a sky, two soft boxes, a bright horizon line and a warm floor
vec3 env(vec3 r){
  float up = -r.y, a = atan(r.x, max(0.05, r.z)) + uEnvRot;
  vec3 sky = mix(vec3(0.06, 0.07, 0.09), vec3(0.85, 0.9, 1.0), smoothstep(-0.05, 0.75, up));
  vec3 flo = mix(vec3(0.05, 0.04, 0.035), vec3(0.32, 0.27, 0.22), smoothstep(-1.0, -0.08, up));
  vec3 c = up > -0.04 ? sky : flo;
  c += vec3(3.2) * smoothstep(0.32, 0.02, length(vec2(sin(a) - 0.5, (up - 0.55) * 1.4)));
  c += vec3(2.0, 1.85, 1.6) * smoothstep(0.24, 0.0, length(vec2(sin(a) + 0.62, (up - 0.2) * 1.8)));
  c += vec3(1.3) * smoothstep(0.05, 0.0, abs(up + 0.04)) * (0.7 + 0.3 * sin(a * 3.0));
  return c;
}
vec3 tint(vec3 base, vec3 env3, float k){ return env3 * mix(vec3(1.0), base, k); }

void main(){
  float sc = max(vExtra.w, 0.05);
  mat2 R = mat2(vRot.x, vRot.y, -vRot.y, vRot.x), Ri = mat2(vRot.x, -vRot.y, vRot.y, vRot.x);
  float blur = vState.y, op = vState.x;
  float aa = uPx / sc * 0.85 + blur * 0.9;
  float sd = sdAt(vec2(0.0));
  float e = 1.0 / uScale;
  vec2 gL = vec2(sdAt(vec2(e, 0.0)) - sdAt(vec2(-e, 0.0)), sdAt(vec2(0.0, e)) - sdAt(vec2(0.0, -e)));
  vec2 g = R * (dot(gL, gL) > 1e-8 ? normalize(gL) : vec2(0.0, -1.0));   // outward, on screen
  float cover = smoothstep(aa, -aa, sd);

  if (uMaskPass > 0.5){ gl_FragColor = vec4(cover * op); return; }

  float m = uMat, seed = vExtra.x;
  vec2 W = vPos;                                  // stage position (CSS px)
  vec2 B = vExtra.yz;                             // position in the text block, 0..1
  vec3 L = uLight, V = normalize(vec3(uCam * 0.9, 1.0)), H = normalize(L + V);
  vec4 outc = vec4(0.0);

  if (uFace > 0.5){
    // ---------------------------------------------------------------- shadow and side walls (behind the face)
    vec2 awayL = Ri * uAway / sc;
    vec4 side = vec4(0.0);
    if (uExt > 0.0 && sd > -aa){
      for (int k = 1; k <= 28; k++){
        float s = float(k) / 28.0 * uExt;
        float sk = sdAt(-awayL * s);
        if (sk < aa){
          float dk = s / uExt;
          vec2 o = -awayL * s;
          vec2 gh = vec2(sdAt(o + vec2(e, 0.0)) - sdAt(o - vec2(e, 0.0)), sdAt(o + vec2(0.0, e)) - sdAt(o - vec2(0.0, e)));
          gh = R * (dot(gh, gh) > 1e-8 ? normalize(gh) : vec2(0.0, 1.0));
          vec3 n3 = normalize(vec3(gh, 0.25));
          float li = 0.22 + 0.78 * max(dot(n3, L), 0.0);
          vec3 sc3 = m < 1.5 || m > 15.5 ? uText * 0.55 : m < 5.5 ? vec3(0.35, 0.3, 0.26) : m < 7.5 ? uGlow * 0.6 : m < 9.5 ? uA1 * 0.35 : uA1 * 0.5;
          if (m > 2.5 && m < 4.5) sc3 = m < 3.5 ? vec3(0.55, 0.36, 0.08) : vec3(0.55, 0.3, 0.25);
          if (m > 15.5 && m < 16.5) sc3 = uA1 * 0.8;
          vec3 col = sc3 * li * (1.0 - 0.5 * dk) * (0.55 + 0.45 * smoothstep(0.0, 0.25, dk));   // occlusion where the side meets the face
          col += vec3(0.9, 0.95, 1.0) * pow(max(dot(reflect(-V, n3), L), 0.0), 24.0) * 0.25 * (1.0 - dk);
          float sa = smoothstep(aa, -aa, sk) * (m > 5.5 && m < 7.5 ? 0.45 : 1.0);
          side = vec4(col * sa, sa);
          break;
        }
      }
    }
    float shs = sdAt(-awayL * (uExt + uShadow));
    float shA = smoothstep(uShadow * 1.2, -uShadow * 0.4, shs) * 0.42 * step(0.01, uShadow);
    vec4 under = side + vec4(0.0, 0.0, 0.0, shA) * (1.0 - side.a);

    // ---------------------------------------------------------------- the face: a bevelled, lit surface
    float d = max(-sd, 0.0);
    float u = clamp(d / max(uBevel, 0.5), 0.0, 1.0);
    bool chamfer = (m > 1.5 && m < 5.5) || (m > 10.5 && m < 11.5) || (m > 15.5 && m < 16.5);
    float slope = chamfer ? 1.0 : (1.0 - u) / sqrt(max(0.02, 1.0 - (1.0 - u) * (1.0 - u)));
    slope *= uHeight * (1.0 - step(0.999, u)) * (1.0 - smoothstep(0.0, 6.0, blur));
    if (m > 10.5 && m < 11.5) slope = -slope;               // carved: cut into the stone
    vec2 wob = vec2(0.0);
    if (m > 9.5 && m < 10.5) wob = (vec2(fbm3(W * 0.11), fbm3(W * 0.11 + 7.0)) - 0.5) * 0.9;     // stone grain
    if (m > 8.5 && m < 9.5) wob = (vec2(fbm3(W * 0.05 + uTime * 0.2), fbm3(W * 0.05 + 3.0)) - 0.5) * 0.7;   // lava crust
    if (m > 14.5 && m < 15.5) wob = (vec2(fbm3(W * 0.03), fbm3(W * 0.03 + 5.0)) - 0.5) * 1.4 * (1.0 - u);   // foil crinkles
    if (m > 12.5 && m < 13.5) wob = (vec2(noise(W * 0.4), noise(W * 0.4 + 9.0)) - 0.5) * 0.25;       // bone pores
    vec3 N = normalize(vec3(g * slope + wob, 1.0));
    float diff = max(dot(N, L), 0.0), nh = max(dot(N, H), 0.0), nv = max(dot(N, V), 0.0);
    float fres = pow(1.0 - nv, 4.0);
    vec3 Rf = reflect(-V, N);
    float sweep = exp(-pow((B.x * 1.3 + B.y * 0.5) - uSweep, 2.0) * 40.0);   // a slow light sweep across the word
    vec3 c; float a = 1.0;
    if (m < 1.5){                                   // satin: the letters' own colour, softly lit
      c = uText * (0.35 + 0.75 * diff) + vec3(1.0) * pow(nh, 40.0) * 0.35 + uText * fres * 0.25;
    } else if (m < 5.5){                            // chrome, gold, rose gold, brushed steel
      vec3 e3 = env(Rf + vec3(0.0, (B.y - 0.5) * 0.6, 0.0));
      if (m > 4.5) e3 = mix(e3, vec3(dot(e3, vec3(0.33))), 0.4) * (0.85 + 0.3 * noise(vec2(W.x * 0.02, W.y * 1.6)));
      vec3 base = m < 2.5 ? vec3(0.92, 0.94, 0.97) : m < 3.5 ? vec3(1.0, 0.76, 0.33) : m < 4.5 ? vec3(0.98, 0.66, 0.56) : vec3(0.78, 0.8, 0.83);
      c = e3 * base * 0.8 + base * 0.06;
      c += vec3(1.0) * pow(nh, m > 4.5 ? 60.0 : 180.0) * 2.0 + base * sweep * 1.4;
    } else if (m < 7.5){                            // glass, ice
      vec3 t3 = m < 6.5 ? mix(uGlow, vec3(1.0), 0.5) : vec3(0.72, 0.9, 1.0);
      float frost = 0.0;
      if (m > 6.5){ frost = pow(fbm(W * 0.06 + seed), 2.5) * 1.4 + smoothstep(0.035, 0.0, abs(noise(W * 0.07) - 0.5)) * 0.6; }
      c = t3 * 0.25 + env(Rf) * (0.2 + fres * 0.9) + vec3(1.0) * pow(nh, 220.0) * 3.0 + vec3(0.9, 0.97, 1.0) * frost * 0.5 + t3 * sweep * 0.8;
      a = clamp((m < 6.5 ? 0.16 : 0.38) + fres * 0.85 + frost * 0.3 + (1.0 - u) * 0.35, 0.0, 1.0);
    } else if (m < 8.5){                            // neon: a glass tube along the outline, lit from inside
      float tubeR = uFontPx * 0.045;
      float t = 1.0 - clamp(abs(d - tubeR * 1.2) / tubeR, 0.0, 1.0);
      float flick = 0.94 + 0.06 * sin(uTime * 40.0 + seed * 9.0) * step(0.97, noise(vec2(uTime * 3.0, seed)));
      c = mix(uA1 * 0.4, mix(uA1, vec3(1.0), 0.75), pow(t, 2.0)) * (1.2 + t * 1.5) * flick;
      a = smoothstep(0.0, 0.25, t) + 0.12 * smoothstep(tubeR * 4.0, 0.0, d);
      c += vec3(1.0) * pow(nh, 60.0) * t * 0.6;
    } else if (m < 9.5){                            // lava: a cooling crust with molten cracks that flow
      float n = fbm(W * 0.035 + vec2(0.0, -uTime * 0.15) + seed);
      float crack = 1.0 - smoothstep(0.0, 0.07, abs(n - 0.5));
      vec3 crust = mix(vec3(0.07, 0.03, 0.02), vec3(0.24, 0.12, 0.08), diff);
      vec3 hot = fireRamp(0.34 + crack * 0.3 + 0.05 * sin(uTime * 2.0 + seed)) * 1.5;
      float glowC = 1.0 - smoothstep(0.0, 0.16, abs(n - 0.5));            // the crust glows a little around each crack
      c = mix(crust + vec3(0.5, 0.12, 0.02) * glowC * 0.35, hot, clamp(crack * 1.15 + pow(u, 4.0) * 0.12, 0.0, 1.0)) + vec3(1.0, 0.8, 0.6) * pow(nh, 30.0) * 0.2 * (1.0 - crack);
    } else if (m < 11.5){                           // stone, carved stone
      float gr = fbm(W * 0.12 + seed), sp = hash(floor(W * 1.3));
      vec3 sb = m < 10.5 ? mix(mix(uText, vec3(0.55, 0.53, 0.5), 0.65), vec3(0.28, 0.27, 0.26), gr * 0.6) : uBg * 0.9 + 0.04;
      sb = mix(sb, sp > 0.94 ? vec3(0.95) : sp < 0.05 ? vec3(0.1) : sb, 0.5);
      c = sb * (0.22 + 0.95 * diff) + vec3(1.0) * pow(nh, 20.0) * 0.1;
    } else if (m < 12.5){                           // marble with veins
      float n = fbm(W * 0.02 + seed), v = abs(sin((W.x * 0.6 + W.y * 0.35) * 0.06 + n * 7.0));
      c = mix(vec3(0.96, 0.95, 0.93), vec3(0.32, 0.32, 0.34), pow(1.0 - v, 14.0) * 0.75);
      c = mix(c, mix(uA1, vec3(0.85, 0.7, 0.4), 0.5), pow(1.0 - v, 40.0) * 0.6);
      c = c * (0.35 + 0.7 * diff) + env(Rf) * 0.08 + vec3(1.0) * pow(nh, 90.0) * 0.9;
    } else if (m < 13.5){                           // bone
      c = mix(vec3(0.93, 0.89, 0.78), vec3(0.76, 0.7, 0.56), fbm(W * 0.08 + seed)) * (0.3 + 0.8 * diff) + vec3(1.0) * pow(nh, 18.0) * 0.12;
    } else if (m < 14.5){                           // glossy candy: light glowing through the thick middle
      c = uA1 * (0.3 + 0.6 * diff) + mix(uA1, vec3(1.0), 0.4) * pow(u, 2.0) * 0.35 + vec3(1.0) * pow(nh, 160.0) * 2.0 + env(Rf) * fres * 0.4;
    } else if (m < 15.5){                           // foil balloon
      vec3 e3 = env(Rf * vec3(1.0, 1.0, 0.6));
      c = e3 * mix(uA1, vec3(1.0), 0.25) * 0.75 + uA1 * 0.12 + vec3(1.0) * pow(nh, 70.0) * 1.4 + uA1 * sweep * 0.8;
    } else if (m < 16.5){                           // block extrude: bold colour, crisp light
      c = uText * (0.45 + 0.6 * diff) + vec3(1.0) * pow(nh, 40.0) * 0.4;
    } else {                                        // letterpress: the paper itself, raised
      vec3 pap = uBg + 0.05;
      c = pap * (0.65 + 0.55 * diff);
      a = clamp(0.25 + (1.0 - nv) * 3.5, 0.0, 1.0);
    }
    // what the elements do to the surface
    if (uElem > 2.5 && uElem < 3.5){ c = c * 0.82 + env(Rf) * 0.12 + vec3(1.0) * pow(nh, 300.0) * 1.5; }   // wet: darker, glossier
    if (uElem > 0.5 && uElem < 1.5 && (m < 8.5 || m > 9.5)){ float heat = smoothstep(uFontPx * 0.16, 0.0, d) * (0.6 + 0.4 * noise(W * 0.05 + vec2(0.0, uTime * 3.0))); c += fireRamp(0.5 + heat * 0.4) * heat * 0.55 * uAmt; }
    c *= 1.0 + uFlash * 1.6;
    c = aces(c * vState.z);
    vec4 face = vec4(c * a, a) * cover;
    outc = face + under * (1.0 - face.a);
  }

  // ---------------------------------------------------------------- glow (neon tubes, glowing styles, flicker effects)
  float glowA = max(uGlowAmt, vState.w) * (uMat > 7.5 && uMat < 8.5 ? 1.4 : 1.0);
  if (glowA > 0.0){
    float gd = max(sd, 0.0);
    vec3 gc = uMat > 7.5 && uMat < 8.5 ? uA1 : mix(uGlow, uA1, 0.5);
    float reach = uSpread / uScale;
    float gw = (exp(-gd / (uFontPx * 0.05)) * 0.65 + exp(-gd / (uFontPx * 0.13)) * 0.3) * smoothstep(reach * 0.95, reach * 0.4, gd);
    vec4 gl = vec4(gc * gw, gw * 0.7) * glowA * (1.0 - cover * uFace);
    outc += gl * (1.0 - outc.a * 0.5);
  }

  // ---------------------------------------------------------------- the elements, on the letters themselves
  float topness = smoothstep(0.25, 0.85, -g.y);
  if (uElem > 1.5 && uElem < 2.5){        // snow settles on every upward edge and slowly builds up
    float capH = uFontPx * (0.028 + 0.055 * uAmt) * uAccum * (0.65 + 0.55 * noise(vec2(W.x * 0.045, seed)));
    float cap = topness * (1.0 - smoothstep(capH * 0.75, capH, sd)) * smoothstep(-capH * 0.55, -capH * 0.25, sd) * step(0.5, capH);
    float sh = 0.78 + 0.22 * smoothstep(capH, 0.0, sd) - 0.12 * noise(W * 0.3);
    vec3 snowc = mix(vec3(0.62, 0.72, 0.86), vec3(1.0), sh) + vec3(1.0) * step(0.985, hash(floor(W * 0.8) + floor(uTime * 2.0))) * 0.8;
    vec4 s4 = vec4(snowc, 1.0) * cap * op;
    outc = s4 + outc * (1.0 - s4.a);
  }
  if (uElem > 2.5 && uElem < 3.5){        // rain: drops slide down the faces, splashes on the top edges
    float inside = smoothstep(aa, -aa, sd);
    float col = floor(W.x / 6.0), sp = 0.25 + hash(vec2(col, 3.0)) * 0.6;
    float y = fract(W.y / (uFontPx * 0.9) - uTime * sp - hash(vec2(col, 7.0)) * 9.0);
    float lane = smoothstep(0.45, 0.15, abs(fract(W.x / 6.0) - 0.5)) * step(0.55, hash(vec2(col, 11.0)));
    float drop = lane * (smoothstep(0.0, 0.03, y) * smoothstep(0.22, 0.03, y)) * inside;
    float cell = floor(W.x / 9.0), ph = fract(uTime * 1.1 + hash(vec2(cell, 1.0)) * 7.0);
    float splash = topness * smoothstep(5.0, 0.0, abs(sd - 2.0 - ph * 4.0)) * pow(1.0 - ph, 5.0) * step(0.6, hash(vec2(cell, floor(uTime * 1.1 + hash(vec2(cell, 1.0)) * 7.0))));
    float w = clamp(drop * 0.75 + splash * 0.9, 0.0, 1.0) * uAmt * op;
    vec4 r4 = vec4(vec3(0.88, 0.94, 1.0) * w, w * 0.8);
    outc = r4 + outc * (1.0 - r4.a);
  }
  if (uElem > 0.5 && uElem < 1.5 && uFace < 0.5){   // flat letters: a heated rim glows around them
    float rim = smoothstep(uFontPx * 0.05, 0.0, abs(sd)) * (0.55 + 0.45 * noise(W * 0.06 + vec2(0.0, uTime * 4.0))) * op * uAmt;
    vec4 h4 = vec4(fireRamp(0.62 + rim * 0.3) * rim, rim * 0.85);
    outc = h4 + outc * (1.0 - h4.a);
  }
  if (uElem > 3.5){                        // lightning: electricity crawls along the outline; bright when it strikes
    float n = noise(W * 0.08 + vec2(uTime * 9.0, seed * 5.0));
    float arcLine = smoothstep(1.6, 0.0, abs(sd + (n - 0.5) * 6.0));
    float live = uStrike * 0.9 + step(0.84, noise(vec2(uTime * 6.0 + seed * 3.0, B.x * 4.0))) * 0.55;
    float arc = arcLine * live * op;
    vec3 ac = mix(vec3(0.75, 0.85, 1.0), uGlow, 0.3);
    float halo = exp(-abs(sd) / (uFontPx * 0.05)) * live * 0.35 * op;
    vec4 e4 = vec4(ac * (arc * 1.4 + halo), clamp(arc + halo * 0.6, 0.0, 1.0));
    outc = e4 + outc * (1.0 - e4.a);
  }
  gl_FragColor = outc * op;
}`;

export const FULL_VS = `
attribute vec2 aPos; uniform vec2 uView; varying vec2 vPos;
void main(){ vPos = (aPos * 0.5 + 0.5) * uView; vPos.y = uView.y - vPos.y; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const ELEMENT_FS = COMMON + `
uniform sampler2D uMask; uniform vec2 uView; uniform float uTime; uniform float uElem; uniform float uPass; uniform float uAmt; uniform float uFontPx;
uniform vec4 uBox; uniform float uCut; uniform float uFlash; uniform float uBoltA; uniform float uBoltN; uniform vec2 uBolt[32]; uniform vec3 uGlow; uniform vec3 uA1;
varying vec2 vPos;
float mk(vec2 p){ return texture2D(uMask, vec2(p.x / uView.x, 1.0 - p.y / uView.y)).a; }
float inBoxX(vec2 p, float m){ return smoothstep(uBox.x - m, uBox.x, p.x) * smoothstep(uBox.z + m, uBox.z, p.x); }

// ---------------------------------------------------------------- fire: flames rise off the letters, with embers
vec4 flames(vec2 p){
  float H = uFontPx * (0.55 + uAmt * 0.75);
  float mx = uFontPx * 0.5;
  if (p.x < uBox.x - mx || p.x > uBox.z + mx || p.y > uBox.w + mx * 0.4 || p.y < uBox.y - H * 1.4) return vec4(0.0);   // nothing burns far from the words
  float acc = 0.0, wsum = 0.0;
  float t = uTime;
  float lean = noise(vec2(p.x * 0.006, t * 0.35)) - 0.5;                 // the whole fire sways slowly
  float sw0 = fbm3(vec2(p.x * 0.022 + 5.0, p.y * 0.02 + t * 1.9)) - 0.5, sw1 = noise(vec2(p.x * 0.05, p.y * 0.04 + t * 3.1)) - 0.5;
  float jit = hash(p + fract(t)) - 0.5;                                  // dithered steps: no banding in the flame
  for (int k = 0; k < 16; k++){
    float fk = (float(k) + 0.5 + jit) / 16.0, dy = fk * H;
    float sway = mix(sw0, sw1, fk);
    vec2 q = p + vec2((lean * 0.9 + sway * 1.3) * dy, dy);
    float mv = (mk(q) * 2.0 + mk(q + vec2(uFontPx * 0.03, 0.0)) + mk(q - vec2(uFontPx * 0.03, 0.0))) * 0.25;
    float w = pow(1.0 - fk, 1.6);
    acc += mv * w; wsum += w;
  }
  float f = acc / wsum;
  float n = fbm(vec2(p.x * 0.03, p.y * 0.026 + t * 2.7));
  float detail = noise(vec2(p.x * 0.08, p.y * 0.06 + t * 5.5));
  float fl = smoothstep(0.1, 0.95, f * (0.3 + 1.15 * n + 0.25 * detail) * 1.35);
  float a = smoothstep(0.03, 0.35, fl);
  vec3 col = fireRamp(fl * 0.86) * (1.1 + fl * 0.45);
  // a hot glow hugging the letters
  float halo = (mk(p + vec2(6.0, 0.0)) + mk(p - vec2(6.0, 0.0)) + mk(p + vec2(0.0, 7.0)) + mk(p - vec2(0.0, 7.0))) * 0.25;
  col += vec3(1.0, 0.35, 0.05) * halo * 0.6; a = max(a, halo * 0.35);
  a *= 1.0 - mk(p) * uCut;
  return vec4(col * a, a);
}
vec3 embers(vec2 p){
  vec3 c = vec3(0.0);
  for (int L = 0; L < 3; L++){
    float fl = float(L), sc = 34.0 + fl * 22.0, sp = 45.0 + fl * 30.0;
    vec2 g = vec2((p.x + sin(p.y * 0.015 + uTime * 0.8 + fl * 2.0) * 22.0) / sc, (p.y + uTime * sp) / sc);
    vec2 id = floor(g), f = fract(g) - 0.5; float h = hash(id + fl * 17.0);
    if (h < 0.88 - uAmt * 0.06) continue;
    vec2 o = (hash2(id) - 0.5) * 0.6;
    float r = (1.2 + fl * 0.6) / sc;
    float d = length(f - o);
    float life = smoothstep(uBox.w, uBox.y, p.y) * smoothstep(uBox.y - uFontPx * (1.6 + fl * 0.8), uBox.y - uFontPx * 0.2, p.y);
    float tw = 0.5 + 0.5 * sin(uTime * 9.0 + h * 40.0);
    c += fireRamp(0.5 + 0.25 * h) * (smoothstep(r, 0.0, d) * 2.2 + exp(-d * sc * 0.35) * 0.35) * life * tw;
  }
  return c * inBoxX(p, uFontPx);
}
// ---------------------------------------------------------------- snow: three depths of flakes, the nearest soft and large
vec4 snow(vec2 p){
  vec4 acc = vec4(0.0);
  for (int L = 0; L < 3; L++){
    float fl = float(L) / 2.0;
    float sc = mix(26.0, 130.0, fl), sp = mix(30.0, 95.0, fl);
    float dens = mix(0.5, 0.07, fl) * (0.5 + uAmt * 0.7);
    vec2 q = vec2(p.x + sin(p.y * 0.01 + uTime * 0.6 + fl * 3.0) * 16.0 * (fl + 0.5) + uTime * 10.0 * (fl + 0.4), p.y - uTime * sp) / sc;
    vec2 id = floor(q), f = fract(q) - 0.5;
    float h = hash(id + fl * 31.0);
    if (h > dens) continue;
    vec2 o = (hash2(id) - 0.5) * 0.7;
    float r = mix(1.1, 4.5, fl) / sc * (0.6 + 0.8 * hash(id + 3.0)), b = mix(0.6, 3.5, fl) / sc;
    float d = length(f - o);
    float a = smoothstep(r + b, max(0.0, r - b * 0.4), d) * mix(0.8, 0.5, fl) * (0.75 + 0.25 * sin(uTime * 2.0 + h * 30.0));
    acc += vec4(vec3(0.96, 0.98, 1.0) * a, a) * (1.0 - acc.a);
  }
  return acc;
}
// ---------------------------------------------------------------- rain: slanted streaks in two depths, splashes on the letters
float streaks(vec2 p, float k){
  float r = 0.0;
  for (int L = 0; L < 2; L++){
    float fl = float(L), sc = mix(8.0, 14.0, fl) * k;
    vec2 q = vec2((p.x + p.y * 0.16) / sc, (p.y + uTime * mix(950.0, 1500.0, fl)) / (sc * 16.0));
    vec2 id = floor(q), f = fract(q); float h = hash(id + fl * 9.0);
    if (h < 0.8 - uAmt * 0.12) continue;
    float lane = smoothstep(0.1, 0.0, abs(f.x - 0.5 - (hash(id + 2.0) - 0.5) * 0.5));
    r += lane * smoothstep(0.0, 0.3, f.y) * smoothstep(0.9, 0.45, f.y) * mix(0.3, 0.6, fl);
  }
  return r;
}
vec4 rain(vec2 p){
  float s = streaks(p, 1.0);
  // splashes where the rain meets the top of a letter
  float edge = clamp(mk(p + vec2(0.0, 4.0)) - mk(p - vec2(0.0, 3.0)), 0.0, 1.0);
  float cell = floor(p.x / 11.0), ph = fract(uTime * 1.6 + hash(vec2(cell, 2.0)) * 5.0);
  float crown = 0.0;
  for (int j = 1; j <= 4; j++){
    float dy = float(j) * 3.0;
    crown += clamp(mk(p + vec2(0.0, dy + 2.0)) - mk(p + vec2(0.0, dy - 2.0)), 0.0, 1.0) * step(dy, ph * 14.0) * (1.0 - ph);
  }
  float spl = (edge * 0.6 + crown * 0.5) * step(0.45, hash(vec2(cell, floor(uTime * 1.6 + hash(vec2(cell, 2.0)) * 5.0)))) * pow(1.0 - ph, 2.0);
  float a = clamp(s * 0.55 + spl * uAmt, 0.0, 1.0);
  return vec4(vec3(0.82, 0.88, 0.96) * a, a * 0.85);
}
// ---------------------------------------------------------------- lightning: a jagged bolt with branches, and the flash
float segD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0); return length(pa - ba * h); }
vec4 bolt(vec2 p){
  float d = 1e5;
  for (int i = 0; i < 31; i++){
    if (float(i) >= uBoltN - 1.0) break;
    vec2 a = uBolt[i], b = uBolt[i + 1];
    if (a.x < -9000.0 || b.x < -9000.0) continue;
    d = min(d, segD(p, a, b));
  }
  float core = smoothstep(2.2, 0.4, d), glow = exp(-d / 16.0) * 0.7 + exp(-d / 60.0) * 0.25;
  vec3 c = vec3(1.0) * core * 1.5 + mix(vec3(0.6, 0.72, 1.0), uGlow, 0.35) * glow;
  float a = clamp(core + glow * 0.6, 0.0, 1.0) * uBoltA;
  vec4 f = vec4(vec3(0.82, 0.88, 1.0) * uFlash * 0.22, uFlash * 0.18);
  return vec4(c * uBoltA, a) + f * (1.0 - a);
}
void main(){
  vec2 p = vPos; vec4 o = vec4(0.0);
  if (uElem > 0.5 && uElem < 1.5){ if (uPass < 0.5) o = flames(p); else { vec3 e = embers(p); o = vec4(e, max(e.r, max(e.g, e.b)) * 0.9); } }
  else if (uElem > 1.5 && uElem < 2.5){ if (uPass > 0.5) o = snow(p); }
  else if (uElem > 2.5 && uElem < 3.5){ if (uPass > 0.5) o = rain(p); }
  else if (uElem > 3.5){ if (uPass > 0.5){ vec4 r = vec4(vec3(0.8, 0.86, 0.95), 0.75) * streaks(p, 1.2) * 0.6; vec4 b = bolt(p); o = b + r * (1.0 - b.a); } }
  gl_FragColor = o;
}`;
