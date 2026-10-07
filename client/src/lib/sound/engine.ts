// The sound engine (Web Audio, no dependencies). Rules it never breaks:
//  - nothing is created or played before the visitor's first tap, click or key press (that gesture unlocks audio);
//  - sound is off until the visitor switches it on, unless the owner set "on by default" in the portal (and even then
//    it stays off for people who prefer reduced motion); the visitor's choice and volume are remembered;
//  - every event has a minimum gap between plays and an optional small pitch spread, so nothing machine-guns;
//  - files are fetched only when first needed (small UI sounds are warmed up in idle time after unlocking).
import { SOUND_EVENTS, SOUND_CATEGORIES, SOUND_DEFAULTS, librarySrc } from '../../../../shared/sounds.js';
import type { SoundSettings, SoundEvent } from '../../../../shared/sounds.js';
import { synthBuffer } from './synth';

const KEY = 'ka-sound-3';   // { on: boolean | null, volume: 0-1 } (renamed when the default volume changed, so everyone starts at it)
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d; };

export interface Resolved { id: string; on: boolean; volume: number; file: string; gap: number; jitter: number; category: string }

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private last = new Map<string, number>();
  private webmOk: boolean | null = null;
  private listeners = new Set<() => void>();
  settings: SoundSettings = { ...SOUND_DEFAULTS, categories: {}, events: {} };
  user: { on: boolean | null; volume: number } = { on: null, volume: 0.1 };   // 10% to start: quiet by default

  constructor(){
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') this.user = { on: typeof s.on === 'boolean' ? s.on : null, volume: clamp01(s.volume, 0.1) }; } catch { /* private mode: defaults */ }
    if (typeof window !== 'undefined'){
      const unlock = () => { this.unlock(); };
      for (const t of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(t, unlock, { capture: true, passive: true });
    }
  }
  /** is sound on for this visitor right now? */
  get enabled(){ return this.user.on ?? (this.settings.defaultOn && !reducedMotion()); }
  get unlocked(){ return !!this.ctx && this.ctx.state === 'running'; }
  onChange(fn: () => void){ this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private notify(){ for (const f of this.listeners) try { f(); } catch { /* ignore */ } }
  private save(){ try { localStorage.setItem(KEY, JSON.stringify(this.user)); } catch { /* ignore */ } }

  /** called inside a user gesture: creates / resumes the audio context (browsers only allow this then) */
  unlock(){
    if (typeof window === 'undefined') return;
    try {
      if (!this.ctx){
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!AC) return;
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.out = this.ctx.createGain(); this.out.gain.value = 1;
        // a gentle limiter: several sounds at once can never get loud
        const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
        this.out.connect(comp).connect(this.ctx.destination);
        if (this.enabled) this.warm();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* no audio on this device */ }
  }
  setEnabled(on: boolean){
    this.user.on = on; this.save(); this.notify();
    if (on){ this.unlock(); this.warm(); this.play('sound.on', { force: true }); }
  }
  setVolume(v: number){ this.user.volume = clamp01(v, 0.1); this.save(); this.notify(); }
  /** settings saved in the portal (served with the site document) */
  configure(s: Partial<SoundSettings> | null | undefined){
    if (!s || typeof s !== 'object') return;
    this.settings = { defaultOn: !!s.defaultOn, master: clamp01(s.master, SOUND_DEFAULTS.master), categories: { ...(s.categories || {}) }, events: { ...(s.events || {}) } };
    this.notify();
  }
  /** an event with the portal's overrides applied */
  resolve(id: string): Resolved | null {
    const e = SOUND_EVENTS.find((x: SoundEvent) => x.id === id); if (!e) return null;
    const o = this.settings.events[id] || {};
    return { id, on: o.on ?? e.on, volume: clamp01(o.volume, e.volume), file: (typeof o.file === 'string' && o.file) ? o.file : e.file, gap: e.gap, jitter: e.jitter, category: e.category };
  }
  categoryVolume(c: string){ const d = SOUND_CATEGORIES.find((x: { id: string; volume: number }) => x.id === c)?.volume ?? 0.6; return clamp01(this.settings.categories[c as keyof SoundSettings['categories']], d); }

  private canWebm(){
    if (this.webmOk !== null) return this.webmOk;
    try { const a = document.createElement('audio'); this.webmOk = !!a.canPlayType('audio/webm; codecs="opus"') && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent); } catch { this.webmOk = false; }
    return this.webmOk;
  }
  private urlFor(file: string, ext?: 'webm' | 'mp3'){ return /^(https?:)?\/\//.test(file) || file.startsWith('/') ? file : librarySrc(file, ext || (this.canWebm() ? 'webm' : 'mp3')); }
  private decode(url: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx; if (!ctx) return Promise.resolve(null);
    return fetch(url, { credentials: 'omit' }).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then(b => new Promise<AudioBuffer>((res, rej) => { const p = ctx.decodeAudioData(b, res, rej); if (p && typeof p.then === 'function') p.then(res, rej); }));
  }
  /** a decoded file (library names fall back from WebM to MP3 if a browser can't decode Opus) */
  private buffer(file: string): Promise<AudioBuffer | null> {
    if (file.startsWith('synth:')){   // generated in the browser: no download
      const hit = this.buffers.get(file); if (hit) return hit;
      const p = Promise.resolve(this.ctx ? synthBuffer(this.ctx, file) : null); this.buffers.set(file, p); return p;
    }
    const key = this.urlFor(file); const hit = this.buffers.get(key); if (hit) return hit;
    const library = !(/^(https?:)?\/\//.test(file) || file.startsWith('/'));
    const p = this.decode(key).catch(() => {
      if (library && key.endsWith('.webm')){ this.webmOk = false; return this.decode(this.urlFor(file, 'mp3')).catch(() => null); }
      return null;
    });
    this.buffers.set(key, p);
    return p;
  }
  /** fetch the small sounds in idle time once audio is on, so the first play has no delay */
  private warm(){
    if (!this.ctx) return;
    const ids = SOUND_EVENTS.filter((e: SoundEvent) => e.category !== 'ambient').map((e: SoundEvent) => this.resolve(e.id)).filter((r): r is Resolved => !!r && r.on && !!r.file);
    const files = [...new Set(ids.map(r => r.file))];
    const idle = (fn: () => void) => ('requestIdleCallback' in window ? (window as unknown as { requestIdleCallback(f: () => void, o?: object): void }).requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 400));
    let i = 0; const next = () => { if (i >= files.length) return; void this.buffer(files[i++]).then(() => idle(next)); }; idle(next);
  }
  /** play an event (ignored when sound is off, before the first gesture, inside its gap, or when switched off in the portal) */
  play(id: string, opts: { force?: boolean; rate?: number; volume?: number } = {}){
    if (!opts.force && !this.enabled) return;
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running'){ if (ctx && ctx.state === 'suspended') void ctx.resume(); if (!ctx) return; }
    const r = this.resolve(id); if (!r || !r.on || !r.file) return;
    const now = performance.now(), prev = this.last.get(id) || 0; if (now - prev < r.gap) return; this.last.set(id, now);
    const gain = r.volume * this.categoryVolume(r.category) * this.settings.master * this.user.volume * (opts.volume ?? 1);
    if (gain <= 0.0002) return;
    this.emit(r.file, gain, opts.rate ?? (r.jitter ? 1 + (Math.random() * 2 - 1) * r.jitter : 1));
  }
  /** the portal's preview: plays a file (or an event) now, whatever the visitor setting, at a given loudness */
  preview(fileOrId: string, volume = 0.5){
    this.unlock();
    const r = this.resolve(fileOrId), file = r ? r.file : fileOrId; if (!file) return;
    const gain = (r ? r.volume * this.categoryVolume(r.category) * this.settings.master : 1) * volume;
    this.emit(file, Math.max(0.01, gain), 1);
  }
  private emit(file: string, gain: number, rate: number){
    const ctx = this.ctx, out = this.out; if (!ctx || !out) return;
    void this.buffer(file).then(buf => {
      if (!buf){ if (!file.startsWith('synth:')) this.element(file, gain); return; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = Math.max(0.5, Math.min(2.5, rate));
      const g = ctx.createGain(); g.gain.value = Math.min(1, gain);
      src.connect(g).connect(out); src.start();
      src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* already gone */ } };
    });
  }
  /** an uploaded file that can't be fetched (no CORS) still plays through a plain audio element */
  private element(file: string, gain: number){
    try { const a = new Audio(this.urlFor(file)); a.volume = Math.min(1, gain); a.preload = 'auto'; void a.play().catch(() => {}); } catch { /* ignore */ }
  }
}

let engine: SoundEngine | null = null;
/** the one engine of the page (shared by every bundle through window.kaSound) */
export function getSoundEngine(): SoundEngine {
  const w = typeof window !== 'undefined' ? window as unknown as { kaSound?: SoundEngine } : null;
  if (w?.kaSound) return w.kaSound;
  engine = engine || new SoundEngine();
  if (w) w.kaSound = engine;
  return engine;
}
