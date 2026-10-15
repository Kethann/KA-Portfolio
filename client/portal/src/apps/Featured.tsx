// Content > Featured: About > Featured Work as a showcase. Rows come down one after another and alternate sides
// (picture on one side, words on the other). Each picture frame is a "template": its pictures sit on top of each other
// and cross-fade in place (ease in, ease out), never slide, so a version with titles and logos melts into a clean one.
// The owner sets the frame's shape and size per row, the words beside it, and the pace and order for all rows.
import { useEffect, useMemo, useState } from 'react';
import { Field, Segmented, Switch } from '../ui';
import { Icon } from '../icons';
import { updateSite, useSite, thumb, featuredDefaults, featuredRow, FEATURED_RATIOS } from './siteDoc';
import type { FeaturedRow, FeaturedShow, SiteDoc, SiteImage } from './siteDoc';

const MAX_ROWS = 6, MAX_SLIDES = 12;
const ratioOf = (r: string, first?: SiteImage, w = 4, h = 5) => {
  if (r === 'free') return `${w} / ${h}`;
  if (r !== 'auto'){ const [w, h] = r.split(':').map(Number); return `${w} / ${h}`; }
  return first?.width && first?.height ? `${first.width} / ${first.height}` : '4 / 5';
};

export default function Featured(){
  const { doc } = useSite();
  if (!doc) return null;
  const show: FeaturedShow = doc.featuredShow || featuredDefaults(doc);
  const set = (fn: (s: FeaturedShow) => FeaturedShow) => updateSite(d => ({ ...d, featuredShow: fn(d.featuredShow || featuredDefaults(d)) }));
  const setRow = (i: number, patch: Partial<FeaturedRow>) => set(s => ({ ...s, rows: s.rows.map((r, k) => k === i ? { ...r, ...patch } : r) }));
  const move = (i: number, by: -1 | 1) => set(s => { const rows = s.rows.slice(); const j = i + by; if (j < 0 || j >= rows.length) return s; [rows[i], rows[j]] = [rows[j], rows[i]]; return { ...s, rows }; });
  const unused = doc.folders.find(f => !show.rows.some(r => r.folder === f)) || doc.folders[0];
  return (
    <div className="app-main" style={{ maxWidth: 980, margin: '0 auto', width: '100%' }}>
      <div className="stack-lg">
        <section className="card stack">
          <div className="row between"><h3 style={{ margin: 0 }}>Featured Work showcase</h3>{!doc.featuredShow && <span className="faint" style={{ fontSize: 12 }}>Starting from your featured stacks</span>}</div>
          <p className="muted" style={{ marginTop: -4 }}>Rows come down one after another and alternate sides: the picture on one side, your words on the other. Inside each frame the pictures cross-fade in place, softly easing in and out, so a version with titles and logos melts into the clean one.</p>
          <Switch checked={show.enabled} onChange={v => set(s => ({ ...s, enabled: v }))} label="Show Featured Work as this showcase (off: the stacks, as before)" />
          <div className="form-grid">
            <Field label="Order"><Segmented label="Order" value={show.order} onChange={v => set(s => ({ ...s, order: v }))} options={[{ value: 'sequence', label: 'In turn' }, { value: 'random', label: 'Shuffled' }]} /></Field>
            <Field label={`Each picture stays ${show.interval} s`}><input type="range" min={2} max={15} step={0.5} value={show.interval} onChange={e => set(s => ({ ...s, interval: Number(e.target.value) }))} /></Field>
            <Field label={`Cross-fade ${show.fade} s`} hint="How long one picture takes to melt into the next"><input type="range" min={0.4} max={4} step={0.1} value={show.fade} onChange={e => set(s => ({ ...s, fade: Number(e.target.value) }))} /></Field>
          </div>
          <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
            <Switch checked={show.zoom} onChange={v => set(s => ({ ...s, zoom: v }))} label="A very slow zoom while a picture shows" />
            <Switch checked={show.captions} onChange={v => set(s => ({ ...s, captions: v }))} label="Show the picture’s title under the words" />
          </div>
        </section>

        <div className="feat-rows">
          {show.rows.map((r, i) => <RowEditor key={i} doc={doc} row={r} index={i} count={show.rows.length} show={show} onChange={p => setRow(i, p)} onMove={by => move(i, by)}
            onRemove={() => set(s => ({ ...s, rows: s.rows.filter((_, k) => k !== i) }))} />)}
        </div>
        <div className="row">
          <button type="button" className="btn" disabled={show.rows.length >= MAX_ROWS || !doc.folders.length} onClick={() => set(s => ({ ...s, rows: [...s.rows, featuredRow(unused)] }))}><Icon name="plus" /> Add a row</button>
          <span className="faint" style={{ fontSize: 12 }}>Up to {MAX_ROWS} rows. Changes go live when you press <b>Publish changes</b>.</span>
        </div>
      </div>
    </div>
  );
}

function RowEditor({ doc, row, index, count, show, onChange, onMove, onRemove }: { doc: SiteDoc; row: FeaturedRow; index: number; count: number; show: FeaturedShow;
  onChange: (p: Partial<FeaturedRow>) => void; onMove: (by: -1 | 1) => void; onRemove: () => void }){
  // any portfolio picture can be placed in this frame; the list starts on the row's own stack
  const [browse, setBrowse] = useState<string>(row.folder);
  const visible = useMemo(() => doc.images.filter(i => !i.hidden), [doc.images]);
  const stackPics = useMemo(() => visible.filter(i => i.cat === row.folder), [visible, row.folder]);
  const pics = browse === '*' ? visible : visible.filter(i => i.cat === browse);
  const chosen = row.slides.map(s => visible.find(p => p.slug === s)).filter(Boolean) as SiteImage[];
  const playing = chosen.length ? chosen : stackPics.slice(0, MAX_SLIDES);
  const flip = row.side === 'right' || (row.side === 'auto' && index % 2 === 1);   // picture on the right
  const toggle = (slug: string) => onChange({ slides: row.slides.includes(slug) ? row.slides.filter(s => s !== slug) : row.slides.length < MAX_SLIDES ? [...row.slides, slug] : row.slides });
  return (
    <section className="card stack" aria-label={`Featured row ${index + 1}`}>
      <div className="row between">
        <b>Row {index + 1} <span className="faint" style={{ fontWeight: 400 }}>· picture on the {flip ? 'right' : 'left'}</span></b>
        <span className="row" style={{ gap: 2 }}>
          <button type="button" className="icon-btn sm" aria-label="Move up" title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
          <button type="button" className="icon-btn sm" aria-label="Move down" title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
          <button type="button" className="icon-btn sm" aria-label={`Remove row ${index + 1}`} title="Remove row" onClick={onRemove}><Icon name="trash" size={13} /></button>
        </span>
      </div>
      <div className={'feat-row' + (flip ? ' flip' : '')}>
        <FramePreview pics={playing} ratio={ratioOf(row.ratio, playing[0], row.ratioW || 4, row.ratioH || 5)} show={show} />
        <div className="stack">
          <div className="form-grid">
            <Field label="Stack (folder)"><select value={row.folder} onChange={e => { onChange({ folder: e.target.value }); setBrowse(e.target.value); }}>{doc.folders.map(f => <option key={f} value={f}>{f}</option>)}</select></Field>
            <Field label="Frame shape"><select value={row.ratio} onChange={e => onChange({ ratio: e.target.value })}>{FEATURED_RATIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              {row.ratio === 'free' && <span className="row" style={{ gap: 6, marginTop: 6 }}>
                <input inputMode="decimal" aria-label="Shape width" value={row.ratioW ?? 4} onChange={e => onChange({ ratioW: Math.max(1, Math.min(100, Number(e.target.value.replace(/[^\d.]/g, '')) || 1)) })} className="num" style={{ width: 64 }} />
                <span className="faint">:</span>
                <input inputMode="decimal" aria-label="Shape height" value={row.ratioH ?? 5} onChange={e => onChange({ ratioH: Math.max(1, Math.min(100, Number(e.target.value.replace(/[^\d.]/g, '')) || 1)) })} className="num" style={{ width: 64 }} />
                <span className="faint" style={{ fontSize: 12 }}>width : height</span></span>}</Field>
            <Field label="Frame size" hint={row.size === 'auto' ? 'Sized from the pictures: portrait a little narrower, landscape wider' : undefined}><Segmented label="Frame size" value={row.size} onChange={v => onChange({ size: v })} options={[{ value: 'auto', label: 'Auto' }, { value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }, { value: 'free', label: 'Free' }]} />
              {row.size === 'free' && <label className="row" style={{ gap: 8, marginTop: 6 }}><input type="range" min={25} max={75} step={1} value={row.width ?? 50} onChange={e => onChange({ width: Number(e.target.value) })} aria-label="Picture width" style={{ flex: 1 }} /><span className="num faint" style={{ width: 70, fontSize: 12 }}>{row.width ?? 50}% of row</span></label>}</Field>
            <Field label="Picture side"><Segmented label="Picture side" value={row.side} onChange={v => onChange({ side: v })} options={[{ value: 'auto', label: 'Zig-zag' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} /></Field>
          </div>
          <div className="form-grid">
            <Field label="Small line above" hint="Optional, e.g. “Campaign · 2026”"><input value={row.eyebrow} maxLength={40} onChange={e => onChange({ eyebrow: e.target.value })} /></Field>
            <Field label="Title" hint={`Empty = “${row.folder}”`}><input value={row.title} maxLength={80} onChange={e => onChange({ title: e.target.value })} placeholder={row.folder} /></Field>
          </div>
          <Field label="Description" hint={`${row.description.length}/600 · the text flows to fit beside the frame`}><textarea rows={3} maxLength={600} value={row.description} onChange={e => onChange({ description: e.target.value })} placeholder="A few lines about this work: the brief, your role, what made it special." /></Field>
          <div className="form-grid">
            <Field label="Button" hint="Optional; empty opens the gallery"><input value={row.ctaLabel} maxLength={30} onChange={e => onChange({ ctaLabel: e.target.value })} placeholder="View the work" /></Field>
            <Field label="Button link" hint="https://… or /?page=store"><input value={row.ctaUrl} maxLength={300} onChange={e => onChange({ ctaUrl: e.target.value })} placeholder="(opens the gallery)" /></Field>
          </div>
        </div>
      </div>
      <Field label={`Pictures placed in this frame · ${row.slides.length ? `${row.slides.length} chosen, in this order` : `all ${Math.min(stackPics.length, MAX_SLIDES)} from “${row.folder}”`}`} hint="Tap pictures to place them in the frame, in the order you tap (up to 12), from any stack. Tip: put the clean picture and the one with titles and logos next to each other.">
        <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <select value={browse} onChange={e => setBrowse(e.target.value)} aria-label="Show pictures from" style={{ width: 'auto' }}>
            <option value="*">All pictures ({visible.length})</option>{doc.folders.map(f => <option key={f} value={f}>{f} ({visible.filter(i => i.cat === f).length})</option>)}</select>
          {row.slides.length > 0 && <button type="button" className="btn sm ghost" onClick={() => onChange({ slides: [] })}>Clear the chosen pictures</button>}
        </div>
        {chosen.length > 0 && <div className="feat-pics feat-chosen" aria-label="Placed pictures, in order">{chosen.map((p, k) => (
          <button key={p.slug} type="button" className="feat-pic" aria-pressed="true" data-n={k + 1} title={`${p.title} · tap to remove`} aria-label={`Remove ${p.title}`} onClick={() => toggle(p.slug)}><img src={thumb(p, 160)} alt="" loading="lazy" decoding="async" /></button>))}</div>}
        <div className="feat-pics">{pics.map(p => { const n = row.slides.indexOf(p.slug); return (
          <button key={p.slug} type="button" className="feat-pic" aria-pressed={n >= 0} data-n={n + 1} title={p.title} aria-label={`${n >= 0 ? 'Remove' : 'Add'} ${p.title}`} onClick={() => toggle(p.slug)}><img src={thumb(p, 160)} alt="" loading="lazy" decoding="async" /></button>); })}
          {!pics.length && <span className="faint">No visible pictures here yet.</span>}
        </div>
      </Field>
    </section>
  );
}

// The same cross-fade the site plays, so the timing can be judged here
function FramePreview({ pics, ratio, show }: { pics: SiteImage[]; ratio: string; show: FeaturedShow }){
  const [at, setAt] = useState(0);
  useEffect(() => {
    setAt(0);
    if (pics.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setAt(a => show.order === 'random' ? (a + 1 + Math.floor(Math.random() * (pics.length - 1))) % pics.length : (a + 1) % pics.length), show.interval * 1000);
    return () => clearInterval(t);
  }, [pics, show.interval, show.order]);
  return (
    <div className="feat-frame" style={{ aspectRatio: ratio, ['--fade' as string]: `${show.fade}s` }}>
      {pics.map((p, i) => <img key={p.slug} src={thumb(p, 480)} alt="" className={i === at ? 'on' : ''} loading="lazy" decoding="async" />)}
    </div>
  );
}
