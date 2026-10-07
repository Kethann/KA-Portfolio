// Sounds generated in the browser (no files): soft, airy and quiet by design, so they sit under the site instead of
// on top of it. Each is computed sample by sample once, then cached like any decoded file.
//   air      a soft breath of moving air (page changes, opening)
//   swish    a shorter, lighter air movement (swipes, closing)
//   drift    a slow, wide wash of air with a faint high glimmer (the intro, while the shards fly)
//   gather   tiny glints rising out of air (the intro's particles gathering)
//   assemble a warm low swell with a clear glass tone settling on top (KA assembled)
//   shimmer  one faint glint (particles)
//   glass    a clear crystal "tink" with a faint sparkle after it (taps, nav: made for the frozen-glass look)
//   frost    a tiny icy crackle (ticks, small controls)
//   bloom    two gentle notes rising (opening, page change)
//   fold     the same notes falling (closing)
//   glide    one soft note bending upward (next / previous)
//   pad      a slow warm chord (the intro)
//   flick    a soft, rounded wheel tick (spinning a stack: rate and loudness follow the spin speed)
//   tap      a soft round tap
//   tick     a tiny, dry tick (dragging the nav)
//   chime    two gentle notes rising (success)
//   low      two soft low notes falling (errors)

type Gen = (sr: number, rnd: () => number) => Float32Array;
const TAU = Math.PI * 2;
const seeded = (seed: number) => { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** state-variable band-pass filter over white noise, its centre moving with time (Hz as a function of 0..1) */
function airNoise(sr: number, dur: number, rnd: () => number, centre: (u: number) => number, damp = 1.1, env: (u: number) => number){
  const n = Math.floor(sr * dur), out = new Float32Array(n); let low = 0, band = 0;
  for (let i = 0; i < n; i++){
    const u = i / n, fc = centre(u), f = 2 * Math.sin(Math.PI * Math.min(fc, sr * 0.45) / sr);
    const x = rnd() * 2 - 1, high = x - low - damp * band; band += f * high; low += f * band;
    out[i] = band * env(u);
  }
  return out;
}
const bell = (u: number, peak = 0.4) => u < peak ? Math.sin((u / peak) * Math.PI / 2) ** 2 : Math.cos(((u - peak) / (1 - peak)) * Math.PI / 2) ** 2;
function tone(out: Float32Array, sr: number, at: number, freq: number, amp: number, decay: number, opts: { attack?: number; partials?: [number, number][]; type?: 'sine' | 'tri'; glide?: number } = {}){
  const start = Math.floor(at * sr), att = Math.max(1, Math.floor((opts.attack ?? 0.004) * sr)), parts = opts.partials || [[1, 1]];
  let ph = parts.map(() => 0);
  for (let i = start; i < out.length; i++){
    const t = (i - start) / sr, e = Math.min(1, (i - start) / att) * Math.exp(-decay * t);
    if (e < 0.0004 && i - start > att) break;
    const fNow = freq * (opts.glide ? Math.exp(-opts.glide * t) * 0.5 + 0.5 : 1);
    let v = 0;
    parts.forEach(([mul, a], k) => { ph[k] += TAU * fNow * mul / sr; const s = Math.sin(ph[k]); v += a * (opts.type === 'tri' ? (2 / Math.PI) * Math.asin(s) : s); });
    out[i] += v * amp * e;
  }
}
function normalise(out: Float32Array, peak: number){ let m = 0; for (const v of out) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < out.length; i++) out[i] *= peak / m; return out; }
function fade(out: Float32Array, sr: number, ms = 6){ const k = Math.floor(sr * ms / 1000); for (let i = 0; i < k && i < out.length; i++){ out[i] *= i / k; out[out.length - 1 - i] *= i / k; } return out; }

const GENS: Record<string, Gen> = {
  air: (sr, r) => fade(normalise(airNoise(sr, 0.55, r, u => 420 + 1500 * Math.sin(u * Math.PI) ** 1.4, 1.25, u => bell(u, 0.42)), 0.55), sr),
  swish: (sr, r) => fade(normalise(airNoise(sr, 0.24, r, u => 900 + 2200 * u, 1.0, u => bell(u, 0.3)), 0.45), sr),
  drift: (sr, r) => {
    const dur = 3.4, out = airNoise(sr, dur, r, u => 260 + 520 * Math.sin(u * Math.PI) + 120 * Math.sin(u * TAU * 1.5), 1.4, u => bell(u, 0.45) * (0.8 + 0.2 * Math.sin(u * TAU * 2.2)));
    normalise(out, 0.5);
    for (let k = 0; k < 5; k++) tone(out, sr, 0.7 + k * 0.42 + r() * 0.2, 2200 + r() * 1400, 0.035, 5 + r() * 3);   // faint glimmer far away
    return fade(out, sr, 30);
  },
  gather: (sr, r) => {   // soft glints rising one after another (no noise)
    const out = new Float32Array(Math.floor(sr * 1.6));
    for (let k = 0; k < 7; k++){ const at = 0.05 + k * 0.16 + r() * 0.04; tone(out, sr, at, [1318.5, 1568, 1760, 1975.5, 2349.3, 2637, 3136][k], 0.12 + k * 0.01, 7, { attack: 0.012, partials: [[1, 1], [2, 0.08]] }); }
    return fade(normalise(out, 0.45), sr, 12);
  },
  assemble: (sr) => {   // a warm low swell with a clear bell on top, settling (no noise)
    const dur = 2.4, out = new Float32Array(Math.floor(sr * dur));
    tone(out, sr, 0, 440, 0.22, 1.6, { attack: 0.3, partials: [[1, 1], [1.5, 0.25]] });   // a warm, mid swell (no low rumble)
    tone(out, sr, 0.18, 880, 0.2, 2.2, { attack: 0.02, partials: [[1, 1], [2, 0.1], [3, 0.03]] });
    tone(out, sr, 0.26, 1318.5, 0.14, 2.6, { attack: 0.02, partials: [[1, 1], [2, 0.06]] });
    tone(out, sr, 0.34, 1760, 0.08, 3, { attack: 0.02 });
    return fade(normalise(out, 0.55), sr, 25);
  },
  bloom: (sr) => {   // two gentle notes rising: something opens
    const out = new Float32Array(Math.floor(sr * 0.75));
    tone(out, sr, 0, 784, 0.4, 6, { attack: 0.014, partials: [[1, 1], [2, 0.12], [3, 0.03]] });
    tone(out, sr, 0.065, 1174.7, 0.32, 6.5, { attack: 0.014, partials: [[1, 1], [2, 0.08]] });
    return fade(normalise(out, 0.45), sr, 8);
  },
  fold: (sr) => {   // the same two notes falling: something closes
    const out = new Float32Array(Math.floor(sr * 0.65));
    tone(out, sr, 0, 1174.7, 0.3, 7, { attack: 0.012, partials: [[1, 1], [2, 0.08]] });
    tone(out, sr, 0.06, 784, 0.36, 7.5, { attack: 0.012, partials: [[1, 1], [2, 0.12]] });
    return fade(normalise(out, 0.4), sr, 8);
  },
  glide: (sr) => {   // one soft note bending slightly upward: next / previous
    const n = Math.floor(sr * 0.28), out = new Float32Array(n); let ph = 0;
    for (let i = 0; i < n; i++){ const t = i / sr, f = 880 * (1 + 0.07 * (1 - Math.exp(-t * 18))), e = Math.min(1, t / 0.01) * Math.exp(-t * 14);
      ph += TAU * f / sr; out[i] = (Math.sin(ph) + 0.1 * Math.sin(ph * 2)) * e; }
    return fade(normalise(out, 0.4), sr, 4);
  },
  pad: (sr) => {   // a slow, warm chord with a gentle shimmer: the intro while the shards fly
    const dur = 3.6, n = Math.floor(sr * dur), out = new Float32Array(n);
    const notes = [440, 554.4, 659.3, 880];   // a bright, open chord: nothing low, no wobble (those read as an engine hum)
    notes.forEach((f, k) => { let ph = 0; for (let i = 0; i < n; i++){ const t = i / sr, u = t / dur, env = Math.sin(Math.PI * Math.min(1, u)) ** 1.5;
      ph += TAU * f / sr; out[i] += Math.sin(ph) * env * (0.3 - k * 0.05); } });
    return fade(normalise(out, 0.4), sr, 40);
  },
  shimmer: (sr, r) => { const out = new Float32Array(Math.floor(sr * 0.32)); const f = 2600 + r() * 600; tone(out, sr, 0, f, 0.5, 14, { partials: [[1, 1], [1.5, 0.35], [2.01, 0.2]] }); return fade(normalise(out, 0.45), sr, 3); },
  glass: (sr, r) => {
    const out = new Float32Array(Math.floor(sr * 0.55)), f = 2150 + r() * 120;
    // a struck glass: inharmonic partials, the high ones dying fastest, and a hair of noise at the strike
    const parts: [number, number, number][] = [[1, 1, 11], [2.32, 0.42, 17], [4.25, 0.2, 26], [6.63, 0.08, 38]];
    for (const [m, a, d] of parts) tone(out, sr, 0, f * m, a * 0.5, d, { attack: 0.0012 });
    tone(out, sr, 0.034, f * 1.5, 0.12, 22, { attack: 0.001, partials: [[1, 1], [2.32, 0.3]] });   // the faint sparkle after it
    for (let i = 0; i < Math.floor(sr * 0.0015); i++) out[i] += (r() * 2 - 1) * 0.18 * (1 - i / (sr * 0.0015));
    return fade(normalise(out, 0.5), sr, 2);
  },
  frost: (sr, r) => {
    const out = new Float32Array(Math.floor(sr * 0.13));
    tone(out, sr, 0, 3900 + r() * 300, 0.25, 48, { attack: 0.0008 });
    const ice = airNoise(sr, 0.07, r, () => 7200, 0.6, u => Math.exp(-u * 7));
    for (let k = 0; k < 6; k++){ const at = Math.floor((k * 0.009 + r() * 0.004) * sr), len = Math.floor(sr * 0.006); for (let i = 0; i < len && at + i < ice.length; i++) out[at + i] += ice[at + i] * (1 - i / len) * 0.9; }
    return fade(normalise(out, 0.38), sr, 1);
  },
  flick: (sr) => { const out = new Float32Array(Math.floor(sr * 0.09)); tone(out, sr, 0, 1180, 0.5, 58, { attack: 0.0025, partials: [[1, 1], [2.02, 0.16], [3.1, 0.04]] }); return fade(normalise(out, 0.4), sr, 2); },
  tap: (sr) => { const out = new Float32Array(Math.floor(sr * 0.12)); tone(out, sr, 0, 760, 0.6, 38, { attack: 0.002, glide: 26, partials: [[1, 1], [2, 0.12]] }); return fade(normalise(out, 0.55), sr, 2); },
  tick: (sr, r) => { const out = new Float32Array(Math.floor(sr * 0.035)); tone(out, sr, 0, 2100, 0.5, 140, { attack: 0.0008 }); for (let i = 0; i < 90 && i < out.length; i++) out[i] += (r() * 2 - 1) * 0.08 * (1 - i / 90); return fade(normalise(out, 0.4), sr, 1); },
  chime: (sr) => { const out = new Float32Array(Math.floor(sr * 1.3)); tone(out, sr, 0, 1318.5, 0.32, 3.6, { partials: [[1, 1], [2, 0.08], [3, 0.03]] }); tone(out, sr, 0.13, 1975.5, 0.28, 3.4, { partials: [[1, 1], [2, 0.06]] }); return fade(normalise(out, 0.5), sr, 8); },
  low: (sr) => { const out = new Float32Array(Math.floor(sr * 0.6)); tone(out, sr, 0, 220, 0.4, 7, { type: 'tri', attack: 0.006 }); tone(out, sr, 0.14, 174.6, 0.4, 6, { type: 'tri', attack: 0.006 }); return fade(normalise(out, 0.45), sr, 6); },
};
export const SYNTH_NAMES = Object.keys(GENS);
/** a generated sound as an AudioBuffer (cached by the engine) */
export function synthBuffer(ctx: BaseAudioContext, name: string): AudioBuffer | null {
  const gen = GENS[name.replace(/^synth:/, '')]; if (!gen) return null;
  const data = gen(ctx.sampleRate, seeded(name.length * 7919 + 17));
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate); buf.getChannelData(0).set(data);
  return buf;
}
