// Wallpaper: the homepage intro as a live wallpaper. The site is opened in "wallpaper mode" (only the intro's two
// layers, rendered sharp) at the chosen screen size; each frame of both layers is composed into a canvas of exactly
// that resolution and recorded as a video (WebM or MP4, whatever this browser can encode), or saved as a still
// (PNG, JPEG or WebP). Everything happens in this browser; nothing is uploaded.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Field, Segmented, useToast } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { useWinShown } from '../shell/desk';
import { bytes } from '../format';

type Size = { id: string; label: string; w: number; h: number; group: string };
const dpr = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));
const SCREEN = (): Size => ({ id: 'screen', label: 'This screen', group: 'Yours', w: Math.round(screen.width * dpr()), h: Math.round(screen.height * dpr()) });
const SIZES: Size[] = [
  { id: 'fhd', label: 'Full HD 1080p', group: 'Desktop', w: 1920, h: 1080 },
  { id: 'qhd', label: 'QHD 1440p', group: 'Desktop', w: 2560, h: 1440 },
  { id: '4k', label: '4K UHD', group: 'Desktop', w: 3840, h: 2160 },
  { id: 'uw', label: 'Ultrawide 21:9', group: 'Desktop', w: 3440, h: 1440 },
  { id: 'mac', label: 'MacBook 16:10', group: 'Desktop', w: 2880, h: 1800 },
  { id: 'phone', label: 'Phone 1080 × 1920', group: 'Phone & tablet', w: 1080, h: 1920 },
  { id: 'iphone', label: 'iPhone Pro', group: 'Phone & tablet', w: 1179, h: 2556 },
  { id: 'android', label: 'Android 20:9', group: 'Phone & tablet', w: 1080, h: 2400 },
  { id: 'ipad', label: 'iPad', group: 'Phone & tablet', w: 2048, h: 2732 },
  { id: 'square', label: 'Square post', group: 'Social', w: 2160, h: 2160 },
  { id: 'story', label: 'Story / Reel', group: 'Social', w: 1080, h: 1920 },
  { id: 'custom', label: 'Custom size', group: 'Yours', w: 1920, h: 1080 }
];
type Fmt = { id: string; label: string; kind: 'video' | 'image'; mime: string; ext: string };
const VIDEO: Fmt[] = [
  { id: 'mp4', label: 'MP4 (H.264): plays everywhere', kind: 'video', mime: 'video/mp4;codecs=avc1.640034', ext: 'mp4' },
  { id: 'mp4b', label: 'MP4', kind: 'video', mime: 'video/mp4', ext: 'mp4' },
  { id: 'webm9', label: 'WebM (VP9): best quality', kind: 'video', mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { id: 'webm8', label: 'WebM (VP8)', kind: 'video', mime: 'video/webm;codecs=vp8', ext: 'webm' }
];
const IMAGE: Fmt[] = [
  { id: 'png', label: 'PNG (lossless)', kind: 'image', mime: 'image/png', ext: 'png' },
  { id: 'jpeg', label: 'JPEG (small)', kind: 'image', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'webp', label: 'WebP', kind: 'image', mime: 'image/webp', ext: 'webp' }
];
const supportedVideo = () => typeof MediaRecorder === 'undefined' ? [] : VIDEO.filter((f, i, all) => MediaRecorder.isTypeSupported(f.mime) && !(f.id === 'mp4b' && all.some(x => x.id === 'mp4' && MediaRecorder.isTypeSupported(x.mime))));

export default function Wallpaper(){
  const toast = useToast();
  const [sizeId, setSizeId] = useState('fhd');
  const [custom, setCustom] = useState({ w: 1920, h: 1080 });
  const videos = useMemo(supportedVideo, []);
  const [kind, setKind] = useState<'video' | 'image'>(videos.length ? 'video' : 'image');
  const [fmtId, setFmtId] = useState(videos[0]?.id || 'png');
  const [fps, setFps] = useState(30);
  const [secs, setSecs] = useState(12);
  const [part, setPart] = useState<'intro' | 'loop'>('intro');
  const [quality, setQuality] = useState<'standard' | 'high' | 'max'>('high');
  const [state, setState] = useState<{ phase: 'idle' | 'loading' | 'waiting' | 'recording' | 'done' | 'error'; p: number; msg?: string }>({ phase: 'idle', p: 0 });
  const [result, setResult] = useState<{ url: string; name: string; size: number; kind: 'video' | 'image' } | null>(null);
  const frame = useRef<HTMLIFrameElement>(null), stage = useRef<HTMLDivElement>(null), cancel = useRef<() => void>(() => {});
  const [box, setBox] = useState({ w: 600, h: 340 });

  const size = sizeId === 'screen' ? SCREEN() : sizeId === 'custom' ? { ...SIZES[SIZES.length - 1], ...custom } : SIZES.find(s => s.id === sizeId)!;
  const W = Math.max(320, Math.min(7680, Math.round(size.w))), H = Math.max(320, Math.min(7680, Math.round(size.h)));
  const fmt = (kind === 'video' ? videos : IMAGE).find(f => f.id === fmtId) || (kind === 'video' ? videos[0] : IMAGE[0]);
  // a sensible bitrate for the size: about 0.1 bit per pixel per frame at "high"
  const bitrate = Math.round(W * H * fps * ({ standard: 0.06, high: 0.11, max: 0.2 }[quality]));
  const estimate = kind === 'video' ? Math.round(bitrate / 8 * secs) : Math.round(W * H * (fmt?.id === 'png' ? 1.4 : 0.25));

  useEffect(() => { if (kind === 'video' && !videos.some(v => v.id === fmtId) && videos[0]) setFmtId(videos[0].id); if (kind === 'image' && !IMAGE.some(v => v.id === fmtId)) setFmtId('png'); }, [kind, fmtId, videos]);
  // the preview keeps the chosen shape, fitted into the panel
  useEffect(() => {
    const el = stage.current; if (!el) return;
    const fit = () => { const r = el.getBoundingClientRect(), k = Math.min((r.width - 2) / W, (r.height - 2) / H); setBox({ w: Math.max(80, Math.floor(W * k)), h: Math.max(80, Math.floor(H * k)) }); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [W, H]);
  useEffect(() => () => cancel.current(), []);   // closing the window stops a recording
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);   // a replaced file frees its memory

  // the site, in wallpaper mode, laid out at exactly the target size (it treats one CSS pixel as one screen pixel there),
  // shown scaled down to fit the preview
  const css = { w: W, h: H };
  const [nonce, setNonce] = useState(0);
  const src = `/?wallpaper=1&r=${nonce}`;
  const reload = () => new Promise<Window>((resolve, reject) => {
    const f = frame.current; if (!f) return reject(new Error('The preview is not ready.'));
    const t = setTimeout(() => reject(new Error('The site took too long to load. Try again.')), 30000);
    f.onload = () => { clearTimeout(t); resolve(f.contentWindow!); };
    setNonce(n => n + 1);
  });
  const layers = (win: Window) => [win.document.querySelector<HTMLCanvasElement>('#nebula-bg canvas'), win.document.querySelector<HTMLCanvasElement>('#stage canvas')].filter(Boolean) as HTMLCanvasElement[];
  const composeInto = (ctx: CanvasRenderingContext2D, win: Window) => { ctx.fillStyle = '#050506'; ctx.fillRect(0, 0, W, H); for (const c of layers(win)) if (c.width && c.height) ctx.drawImage(c, 0, 0, W, H); };
  const waitFor = (win: Window, ms: number) => new Promise<void>(res => {
    let done = false; const fin = () => { if (!done){ done = true; res(); } };
    win.addEventListener('ka-sequence-complete', () => setTimeout(fin, 1800), { once: true }); setTimeout(fin, ms);
  });

  const run = async () => {
    if (!fmt) return;
    setResult(null);
    let stopped = false; cancel.current = () => { stopped = true; };
    try {
      setState({ phase: 'loading', p: 0, msg: 'Opening the intro…' });
      const win = await reload();
      for (let i = 0; i < 50 && layers(win).length < 2; i++) await new Promise(r => setTimeout(r, 100));
      if (!layers(win).length) throw new Error('The intro could not start in this browser (WebGL is off?).');
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const ctx = out.getContext('2d', { alpha: false })!;
      if (kind === 'image' || part === 'loop'){ setState({ phase: 'waiting', p: 0, msg: kind === 'image' ? 'Waiting for the finished logo…' : 'Waiting for the intro to finish…' }); await waitFor(win, 16000); }
      if (stopped) throw new Error('Stopped.');
      if (kind === 'image'){
        composeInto(ctx, win);
        const blob = await new Promise<Blob | null>(r => out.toBlob(r, fmt.mime, fmt.id === 'png' ? undefined : 0.95));
        if (!blob) throw new Error('This browser could not save that format. Try PNG.');
        setResult({ url: URL.createObjectURL(blob), name: `ka-intro-${W}x${H}.${fmt.ext}`, size: blob.size, kind: 'image' });
        setState({ phase: 'done', p: 1 }); return;
      }
      // video: every frame of the site is drawn into the exact-size canvas, which the recorder captures
      const stream = out.captureStream(fps);
      const rec = new MediaRecorder(stream, { mimeType: fmt.mime, videoBitsPerSecond: bitrate });
      const chunks: Blob[] = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const ended = new Promise<void>(r => { rec.onstop = () => r(); });
      let raf = 0; const t0 = performance.now();
      const tick = () => {
        composeInto(ctx, win);
        const p = (performance.now() - t0) / (secs * 1000);
        setState(s => s.phase === 'recording' ? { ...s, p: Math.min(1, p) } : s);
        if (stopped || p >= 1){ if (rec.state === 'recording') rec.stop(); return; }
        raf = requestAnimationFrame(tick);
      };
      setState({ phase: 'recording', p: 0, msg: `Recording ${secs} s…` });
      rec.start(1000); tick();
      cancel.current = () => { stopped = true; cancelAnimationFrame(raf); if (rec.state === 'recording') rec.stop(); };
      await ended;
      stream.getTracks().forEach(t => t.stop());
      if (stopped && !chunks.length) throw new Error('Stopped.');
      const blob = new Blob(chunks, { type: fmt.mime.split(';')[0] });
      setResult({ url: URL.createObjectURL(blob), name: `ka-intro-${W}x${H}-${fps}fps.${fmt.ext}`, size: blob.size, kind: 'video' });
      setState({ phase: 'done', p: 1 });
    } catch (e: any){
      setState({ phase: 'error', p: 0, msg: e.message || 'Something went wrong.' });
      if (e.message !== 'Stopped.') toast.error(e);
    }
  };
  const busy = state.phase === 'loading' || state.phase === 'waiting' || state.phase === 'recording';
  const shown = useWinShown();   // minimised (and not recording): the preview unloads, it runs the full site
  const groups = [...new Set(SIZES.map(s => s.group))];
  return (
    <div className="app">
      <WinTools>{result && <a className="btn primary sm" href={result.url} download={result.name}><Icon name="downloads" /> Download {result.kind === 'video' ? 'video' : 'image'}</a>}</WinTools>
      <div className="wall">
        <aside className="wall-side stack">
          <Field label="Screen size">
            <select value={sizeId} onChange={e => setSizeId(e.target.value)} disabled={busy}>
              <option value="screen">This screen ({SCREEN().w} × {SCREEN().h})</option>
              {groups.map(g => <optgroup key={g} label={g}>{SIZES.filter(s => s.group === g).map(s => <option key={s.id} value={s.id}>{s.label}{s.id !== 'custom' ? ` · ${s.w} × ${s.h}` : ''}</option>)}</optgroup>)}
            </select>
          </Field>
          {sizeId === 'custom' && <div className="form-grid">
            <Field label="Width (px)"><input inputMode="numeric" value={custom.w} disabled={busy} onChange={e => setCustom({ ...custom, w: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
            <Field label="Height (px)"><input inputMode="numeric" value={custom.h} disabled={busy} onChange={e => setCustom({ ...custom, h: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></Field>
          </div>}
          <div className="wall-dim"><b>{W} × {H}</b><span>{W > H ? 'landscape' : W < H ? 'portrait' : 'square'} · {(W * H / 1e6).toFixed(1)} MP</span></div>
          <Field label="Save as"><Segmented label="Save as" value={kind} onChange={v => setKind(v)} options={[...(videos.length ? [{ value: 'video' as const, label: 'Live video' }] : []), { value: 'image' as const, label: 'Still image' }]} /></Field>
          <Field label="Format"><select value={fmt?.id} onChange={e => setFmtId(e.target.value)} disabled={busy}>{(kind === 'video' ? videos : IMAGE).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}</select></Field>
          {kind === 'video' && <>
            <Field label="Part of the intro"><Segmented label="Part" value={part} onChange={setPart} options={[{ value: 'intro', label: 'From the start' }, { value: 'loop', label: 'Finished logo, glowing' }]} /></Field>
            <div className="form-grid">
              <Field label={`Length · ${secs} s`}><input type="range" min={4} max={40} step={1} value={secs} disabled={busy} onChange={e => setSecs(Number(e.target.value))} /></Field>
              <Field label="Frame rate"><Segmented label="Frame rate" value={String(fps)} onChange={v => setFps(Number(v))} options={[{ value: '24', label: '24' }, { value: '30', label: '30' }, { value: '60', label: '60' }]} /></Field>
            </div>
            <Field label="Quality"><Segmented label="Quality" value={quality} onChange={setQuality} options={[{ value: 'standard', label: 'Standard' }, { value: 'high', label: 'High' }, { value: 'max', label: 'Maximum' }]} /></Field>
          </>}
          <p className="field-hint" style={{ margin: 0 }}>About {bytes(estimate)}{kind === 'video' ? ` · ${(bitrate / 1e6).toFixed(1)} Mbit/s` : ''}. {kind === 'video' ? 'Recorded live in real time, so keep this window open until it finishes.' : 'Taken when the logo has finished assembling.'}</p>
          <div className="row">
            {busy ? <button type="button" className="btn" onClick={() => cancel.current()}><Icon name="close" /> Stop</button>
              : <button type="button" className="btn primary grow" onClick={() => void run()} disabled={!fmt}><Icon name={kind === 'video' ? 'play' : 'image'} /> {kind === 'video' ? 'Record the wallpaper' : 'Capture the image'}</button>}
          </div>
          {!videos.length && <p className="field-hint" style={{ margin: 0 }}>This browser can’t record video. Use Chrome, Edge or Safari for a live wallpaper; still images work here.</p>}
          {result && <div className="wall-result">
            <Icon name="check" /><div className="grow"><b>{result.name}</b><span className="faint"> · {bytes(result.size)}</span></div>
            <a className="btn primary sm" href={result.url} download={result.name}><Icon name="downloads" /> Download</a>
          </div>}
        </aside>
        <div className="wall-stage" ref={stage}>
          <div className="wall-screen" style={{ width: box.w, height: box.h }}>
            {(shown || busy) && <iframe ref={frame} title="Intro preview" src={src} style={{ width: css.w, height: css.h, transform: `scale(${box.w / css.w})` }} />}
            {busy && <div className="wall-progress"><span>{state.msg}</span><i style={{ width: `${Math.round(state.p * 100)}%` }} /></div>}
            {state.phase === 'error' && <div className="wall-progress is-error"><span>{state.msg}</span></div>}
          </div>
          <p className="faint" style={{ fontSize: 12, margin: '10px 0 0', textAlign: 'center' }}>Live preview at {W} × {H}. <button type="button" className="link-btn" disabled={busy} onClick={() => setNonce(n => n + 1)}>Replay the intro</button></p>
          {result?.kind === 'video' && <video className="wall-video" src={result.url} controls loop muted playsInline style={{ aspectRatio: `${W} / ${H}` }} />}
          {result?.kind === 'image' && <img className="wall-video" src={result.url} alt="The captured wallpaper" style={{ aspectRatio: `${W} / ${H}` }} />}
        </div>
      </div>
    </div>
  );
}
