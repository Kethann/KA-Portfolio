// Sounds: every sound the site can make, in one place. Whether visitors start with sound on, the master and
// category volumes, and for each moment: on / off, its volume, which sound (two fitting choices first, then the
// whole CC0 library, or a file you upload) and a preview. Previews play the draft, so you hear before you publish.
import { useEffect, useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { ErrorState, Field, SkeletonRows, Switch, useToast } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { Uploader, useSaveKey } from './common';
import { SiteSaveBar } from './Content';
import { loadSite, saveSite, updateSite, useSite } from './siteDoc';
import { SOUND_CATEGORIES, SOUND_EVENTS, SOUND_SYNTHS, SOUND_FILES, SOUND_DEFAULTS } from '../../../../shared/sounds.js';
import type { SoundSettings, SoundEventSetting } from '../../../../shared/sounds.js';
import { getSoundEngine } from '../../../src/lib/sound/engine';

const pct = (v: number) => Math.round(v * 100) + '%';
const nice = (name: string) => name.startsWith('synth:') ? name.slice(6).replace(/^\w/, c => c.toUpperCase()) + ' (soft, generated)' : name.replace(/-0*(\d+)$/, ' $1').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
const isUpload = (f?: string) => !!f && /^https?:\/\//.test(f);

export default function Sounds({ active }: AppProps){
  const site = useSite();
  const toast = useToast();
  const [cat, setCat] = useState<string>('all');
  useEffect(() => { void loadSite(); }, []);
  useSaveKey(active, () => { if (site.dirty) saveSite().then(() => toast.show('Sounds updated', { tone: 'success' })).catch(toast.error); });
  const s: SoundSettings = (site.doc as unknown as { sounds?: SoundSettings })?.sounds || SOUND_DEFAULTS;
  // the preview engine always plays the draft
  useEffect(() => { getSoundEngine().configure(s); }, [s]);
  const events = useMemo(() => SOUND_EVENTS.filter(e => cat === 'all' || e.category === cat), [cat]);
  if (site.error && !site.doc) return <ErrorState message={site.error} retry={() => loadSite(true)} />;
  if (!site.doc) return <div className="pad"><SkeletonRows rows={10} /></div>;

  const set = (fn: (x: SoundSettings) => SoundSettings) => updateSite(d => ({ ...d, sounds: fn(((d as unknown as { sounds?: SoundSettings }).sounds) || structuredClone(SOUND_DEFAULTS)) } as typeof d));
  const setEvent = (id: string, patch: Partial<SoundEventSetting> | null) => set(x => {
    const events = { ...x.events };
    if (patch === null) delete events[id]; else events[id] = { ...(events[id] || {}), ...patch };
    return { ...x, events };
  });
  const preview = (id: string) => { const eng = getSoundEngine(); eng.configure(s); eng.preview(id, 1); };

  return (
    <div className="app">
      <WinTools><SiteSaveBar /></WinTools>
      <div className="app-main">
        <section className="card stack">
          <h3>For visitors</h3>
          <p className="field-hint" style={{ margin: 0 }}>Every visitor has a Sound switch and a volume slider in the ☰ menu; their choice is remembered. Nothing ever plays before their first tap or key press. People who prefer reduced motion start muted either way.</p>
          <Switch checked={s.defaultOn} onChange={v => set(x => ({ ...x, defaultOn: v }))} label="Sound on by default for new visitors" />
          <Field label={`Master volume · ${pct(s.master)}`} hint="Everything below is scaled by this. The defaults are deliberately quiet.">
            <input type="range" min={0} max={1} step={0.05} value={s.master} onChange={e => set(x => ({ ...x, master: Number(e.target.value) }))} />
          </Field>
        </section>

        <section className="card stack">
          <h3>Categories</h3>
          <div className="form-grid">
            {SOUND_CATEGORIES.map(c => {
              const v = s.categories[c.id] ?? c.volume;
              const first = SOUND_EVENTS.find(e => e.category === c.id && e.file);
              return <Field key={c.id} label={<span className="row" style={{ gap: 8 }}>{c.label} · {pct(v)}{first && <button type="button" className="btn sm ghost" onClick={() => preview(first.id)} aria-label={`Preview ${c.label}`}><Icon name="play" size={12} />Play</button>}</span>}>
                <input type="range" min={0} max={1} step={0.05} value={v} onChange={e => set(x => ({ ...x, categories: { ...x.categories, [c.id]: Number(e.target.value) } }))} />
              </Field>;
            })}
          </div>
        </section>

        <section className="card stack">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0 }}>Every sound</h3>
            <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Show category">
              <option value="all">All categories</option>
              {SOUND_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <ul className="list sound-list">
            {events.map(e => {
              const o = s.events[e.id] || {};
              const on = o.on ?? e.on, vol = o.volume ?? e.volume, file = o.file || e.file;
              const changed = !!s.events[e.id];
              return <li key={e.id} className="sound-row">
                <div className="sound-main">
                  <div className="sound-name"><strong>{e.label}</strong><span className="faint" style={{ fontSize: 12 }}>{SOUND_CATEGORIES.find(c => c.id === e.category)?.label}{changed ? ' · changed' : ''}</span></div>
                  <Switch checked={on} onChange={v => setEvent(e.id, { on: v })} label={on ? 'On' : 'Off'} />
                </div>
                <div className="sound-controls">
                  <select value={isUpload(file) ? '__upload' : file} onChange={ev => { const v = ev.target.value; if (v !== '__upload') setEvent(e.id, { file: v }); }} aria-label={`Sound for ${e.label}`} disabled={!on}>
                    {isUpload(file) && <option value="__upload">Your upload</option>}
                    {!e.file && !isUpload(file) && <option value="">No sound yet (upload one)</option>}
                    {e.file && <optgroup label="Best fits"><option value={e.file}>{nice(e.file)} (default)</option>{e.alt && <option value={e.alt}>{nice(e.alt)}</option>}</optgroup>}
                    <optgroup label="Soft, generated (no file)">{SOUND_SYNTHS.filter(n => n !== e.file && n !== e.alt).map(n => <option key={n} value={n}>{nice(n)}</option>)}</optgroup>
                    <optgroup label="Library (CC0, Kenney)">{SOUND_FILES.filter(n => n !== e.file && n !== e.alt).map(n => <option key={n} value={n}>{nice(n)}</option>)}</optgroup>
                  </select>
                  <label className="sound-vol"><span className="sr-only">Volume</span>
                    <input type="range" min={0} max={1} step={0.01} value={vol} disabled={!on} onChange={ev => setEvent(e.id, { volume: Number(ev.target.value) })} aria-label={`Volume for ${e.label}`} />
                    <span className="num faint" style={{ fontSize: 12, minWidth: 36 }}>{pct(vol)}</span>
                  </label>
                  <button type="button" className="btn sm" disabled={!file} onClick={() => preview(e.id)}><Icon name="play" size={13} />Preview</button>
                  <Uploader kind="audio" accept=".mp3,.webm,.ogg,.wav,.m4a,audio/mpeg,audio/webm,audio/ogg,audio/wav,audio/mp4" label="Upload"
                    onUploaded={u => { if (u.publicUrl){ setEvent(e.id, { file: u.publicUrl, on: true }); toast.show('Uploaded: press Publish changes to use it on the site'); } }}>Your own sound</Uploader>
                  {changed && <button type="button" className="btn sm ghost" onClick={() => setEvent(e.id, null)}>Reset</button>}
                </div>
              </li>;
            })}
          </ul>
          <p className="field-hint" style={{ margin: 0 }}>The soft sounds are generated in the browser (no download). The library files are CC0 by Kenney (kenney.nl), via soundcn. Keep uploads short (UI sounds under 30 KB, beds under 300 KB); Sonniss GameAudioGDC files are fine to use, but not for AI or machine-learning training.</p>
        </section>
      </div>
    </div>
  );
}
