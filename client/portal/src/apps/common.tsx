// Building blocks shared by the apps: tag input, money input, markdown editor with preview,
// image uploader (drag-drop, progress), save shortcut, and a list/detail layout.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { post, upload } from '../api';
import { Icon } from '../icons';
import { Segmented, Spinner, useToast } from '../ui';
import { minorToInput, parseMoney } from '../format';

export function TagInput({ value, onChange, placeholder = 'Add and press Enter', max = 20, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number; label: string }){
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...value, ...parts])].slice(0, max));
    setText('');
  };
  return (
    <div className="tags-input" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
      {value.map(t => (
        <span key={t} className="chip">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter(x => x !== t))}><Icon name="close" size={11} /></button></span>
      ))}
      <input aria-label={label} value={text} placeholder={value.length ? '' : placeholder} onChange={e => { if (e.target.value.endsWith(',')) add(e.target.value); else setText(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Enter'){ e.preventDefault(); add(text); } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
        onBlur={() => add(text)} />
    </div>
  );
}

// Money in minor units, edited as a decimal ("499.00").
export function MoneyInput({ value, onChange, currency, label, placeholder, clearable }: { value: number | null; onChange: (v: number | null) => void; currency: 'INR' | 'USD'; label: string; placeholder?: string; clearable?: boolean }){
  const [text, setText] = useState(minorToInput(value));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current){ last.current = value; setText(minorToInput(value)); } }, [value]);
  return (
    <span className="input-affix">
      <span aria-hidden="true">{currency === 'INR' ? '₹' : '$'}</span>
      <input inputMode="decimal" aria-label={label} placeholder={placeholder} value={text} onChange={e => { const t = e.target.value.replace(/[^\d.,]/g, ''); setText(t); const v = parseMoney(t); last.current = v; onChange(v); }}
        onBlur={() => setText(minorToInput(parseMoney(text)))} className={'num' + (clearable ? ' has-clear' : '')} />
      {clearable && value !== null && <button type="button" className="field-clear" aria-label={`Clear ${label}`} title="Clear" onClick={() => { last.current = null; setText(''); onChange(null); }}><Icon name="close" size={12} /></button>}
    </span>
  );
}

(MoneyInput as any).labelable = true;   // a single input: safe inside <label>

// Optional date + time with a clear (✕): clearing a datetime field by hand is awkward or impossible
// in several browsers. `value` is the input's own local format ("2026-10-01T09:30") or ''.
export function DateTimeInput({ value, onChange, label, min }: { value: string; onChange: (v: string) => void; label: string; min?: string }){
  return (
    <span className="input-with-btn">
      <input type="datetime-local" aria-label={label} value={value} min={min} onChange={e => onChange(e.target.value)} />
      {value && <button type="button" className="icon-btn" aria-label={`Clear ${label}`} title="Clear" onClick={() => onChange('')}><Icon name="close" size={13} /></button>}
    </span>
  );
}
(DateTimeInput as any).labelable = true;

// Markdown source + server-rendered preview (the same safe renderer the site uses).
export function MarkdownField({ value, onChange, label, rows = 12, hint }: { value: string; onChange: (v: string) => void; label: string; rows?: number; hint?: ReactNode }){
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [html, setHtml] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (mode !== 'preview') return;
    let alive = true; setBusy(true);
    post<{ html: string }>('/markdown', { body: value }).then(r => { if (alive) setHtml(r.html); }).catch(() => { if (alive) setHtml('<p>Preview isn’t available right now.</p>'); }).finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [mode, value]);
  return (
    <div className="field md-field">
      <div className="row between"><span className="field-label">{label}</span>
        <Segmented label={`${label} view`} value={mode} onChange={setMode} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} /></div>
      {mode === 'write'
        ? <textarea aria-label={label} rows={rows} value={value} onChange={e => onChange(e.target.value)} spellCheck />
        : <div className="md-preview prose" aria-live="polite">{busy ? <Spinner /> : <div dangerouslySetInnerHTML={{ __html: html }} />}</div>}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

// Drop zone + file picker that uploads straight to storage with progress.
export function Uploader({ kind, accept, onUploaded, label, multiple = false, children, prepare }: {
  kind: 'image' | 'font' | 'deliverable' | 'audio'; accept: string; label: string; multiple?: boolean; children?: ReactNode;
  prepare?: (file: File) => Promise<File>;   // e.g. repackage with LICENSE.txt before it leaves the browser
  onUploaded: (r: { path: string; publicUrl: string | null; file: File; width?: number; height?: number }) => Promise<void> | void;
}){
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const run = useCallback(async (files: File[]) => {
    for (const original of files){
      try {
        setProgress(0);
        const file = prepare ? await prepare(original) : original;
        const dims = kind === 'image' ? await imageSize(file).catch(() => undefined) : undefined;
        const r = await upload(file, kind, p => setProgress(p));
        await onUploaded({ path: r.path, publicUrl: r.publicUrl, file, ...dims });
      } catch (e){ toast.error(e); }
    }
    setProgress(null);
  }, [kind, onUploaded, toast, prepare]);
  return (
    <div className={'dropzone' + (over ? ' over' : '')} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = [...e.dataTransfer.files]; if (f.length) void run(multiple ? f : f.slice(0, 1)); }}>
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; if (f.length) void run(f); }} />
      {progress !== null ? (
        <div className="dz-progress" role="progressbar" aria-label="Uploading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span className="dz-bar"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span><span className="num">{Math.round(progress * 100)}%</span>
        </div>
      ) : (
        <button type="button" className="dz-btn" onClick={() => input.current?.click()}>
          <Icon name="upload" size={18} /><span><b>{label}</b><span className="faint">{children || 'or drop a file here'}</span></span>
        </button>
      )}
    </div>
  );
}
export function imageSize(file: File): Promise<{ width: number; height: number }>{
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error('Unreadable image')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

// Ctrl/Cmd+S while this window is in front.
export function useSaveKey(active: boolean, save: () => void){
  const ref = useRef(save); ref.current = save;
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); ref.current(); } };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [active]);
}

export function DetailHeader({ back, title, children, meta }: { back?: () => void; title: ReactNode; children?: ReactNode; meta?: ReactNode }){
  return (
    <div className="detail-head">
      {back && <button type="button" className="icon-btn" onClick={back} aria-label="Back to the list"><Icon name="chevronLeft" /></button>}
      <div className="grow" style={{ minWidth: 0 }}><h2 className="truncate">{title}</h2>{meta && <div className="detail-meta">{meta}</div>}</div>
      <div className="row">{children}</div>
    </div>
  );
}

export function Copy({ text, label = 'Copy' }: { text: string; label?: string }){
  const toast = useToast();
  return <button type="button" className="icon-btn sm" aria-label={label} title={label} onClick={async () => { try { await navigator.clipboard.writeText(text); toast.show('Copied', { tone: 'success', ms: 1400 }); } catch { toast.show('Copy isn’t allowed here', { tone: 'error' }); } }}><Icon name="copy" size={13} /></button>;
}
