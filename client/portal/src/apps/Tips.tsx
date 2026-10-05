// Tips: short articles on the site's Tips page. Markdown with preview, cover image, publish/draft,
// delete with Undo (the deleted tip is re-created from what the server returned).
import { useEffect, useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad, useUnsavedGuard } from '../hooks';
import { del, post, put } from '../api';
import { Badge, Empty, ErrorState, Field, SkeletonRows, STATUS_TONE, useConfirm, useToast, SearchBox } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { DetailHeader, MarkdownField, TagInput, Uploader, useSaveKey } from './common';
import { ago } from '../format';

type Tip = { id: string; slug: string; title: string; excerpt: string; body: string; coverUrl: string; categoryId: string | null; tags: string[]; status: 'draft' | 'published'; publishedAt: string | null; updatedAt: string };
const blank = (): Omit<Tip, 'id' | 'publishedAt' | 'updatedAt'> => ({ slug: '', title: '', excerpt: '', body: '', coverUrl: '', categoryId: null, tags: [], status: 'draft' });

export default function Tips({ route, go, active }: AppProps){
  const s = useLoad<{ tips: Tip[] }>('/tips');
  const [q, setQ] = useState('');
  const toast = useToast();
  const rows = useMemo(() => (s.data?.tips || []).filter(t => !q || (t.title + ' ' + t.tags.join(' ')).toLowerCase().includes(q.toLowerCase())), [s.data, q]);
  if (route) return <Editor key={route} id={route === 'new' ? null : route} tip={s.data?.tips.find(t => t.id === route) || null} loading={!s.data} go={go} active={active}
    onSaved={(t) => { s.setData(d => d ? { tips: d.tips.some(x => x.id === t.id) ? d.tips.map(x => x.id === t.id ? t : x) : [t, ...d.tips] } : d); }}
    onDeleted={(t) => {
      s.setData(d => d ? { tips: d.tips.filter(x => x.id !== t.id) } : d); go('');
      toast.show(`Deleted “${t.title}”`, { action: { label: 'Undo', run: () => { void post<{ tip: Tip }>('/tips', t).then(r => { s.setData(d => d ? { tips: [r.tip, ...d.tips] } : d); toast.show('Restored', { tone: 'success' }); }).catch(toast.error); } } });
    }} />;
  return (
    <div className="app">
      <WinTools><button type="button" className="btn primary sm" onClick={() => go('new')}><Icon name="plus" /> New tip</button></WinTools>
      <div className="app-toolbar"><SearchBox value={q} onChange={setQ} placeholder="Search tips" label="Search tips" /></div>
      <div className="app-main">
        {s.error && !s.data ? <ErrorState message={s.error} retry={s.reload} /> : !s.data ? <SkeletonRows rows={6} /> : !rows.length ? (
          <Empty icon="tips" title={q ? 'No matches' : 'No tips yet'} action={!q && <button type="button" className="btn primary" onClick={() => go('new')}><Icon name="plus" /> Write the first tip</button>}>Short, useful posts: techniques, process notes, free resources.</Empty>
        ) : (
          <ul className="tip-list">
            {rows.map(t => (
              <li key={t.id}><button type="button" onClick={() => go(t.id)}>
                <span className="tip-cover">{t.coverUrl ? <img src={t.coverUrl} alt="" loading="lazy" /> : <Icon name="tips" size={22} />}</span>
                <span className="tip-text"><b className="truncate">{t.title}</b><span className="faint truncate">{t.excerpt || 'No excerpt'}</span>
                  <span className="row" style={{ gap: 6 }}><Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>{t.tags.slice(0, 3).map(x => <Badge key={x}>{x}</Badge>)}<span className="faint" style={{ fontSize: 12 }}>{ago(t.updatedAt)}</span></span></span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Editor({ id, tip, loading, go, active, onSaved, onDeleted }: { id: string | null; tip: Tip | null; loading: boolean; go: (r: string) => void; active: boolean; onSaved: (t: Tip) => void; onDeleted: (t: Tip) => void }){
  const [d, setD] = useState<ReturnType<typeof blank> & { updatedAt?: string }>(() => tip ? { ...tip } : blank());
  const [base, setBase] = useState(() => JSON.stringify(tip ? { ...tip } : blank()));
  useEffect(() => { if (tip && base === JSON.stringify(blank())){ setD({ ...tip }); setBase(JSON.stringify({ ...tip })); } }, [tip]); // late-arriving list
  const cats = useLoad<{ categories: { id: string; kind: string; name: string }[] }>('/categories');
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== base;
  useUnsavedGuard(dirty);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD(x => ({ ...x, [k]: v }));
  const save = async (status?: 'draft' | 'published') => {
    if (busy) return;
    if (!d.title.trim()) return toast.show('Add a title first.', { tone: 'error' });
    setBusy(true);
    try {
      const body = { ...d, status: status || d.status };
      const r = id ? await put<{ tip: Tip }>(`/tips/${id}`, body) : await post<{ tip: Tip }>('/tips', body);
      setD({ ...r.tip }); setBase(JSON.stringify({ ...r.tip })); onSaved(r.tip);
      toast.show(status === 'published' ? 'Published' : status === 'draft' ? 'Hidden from the site (kept as a draft)' : 'Saved', { tone: 'success' });
      if (!id) go(r.tip.id);
    } catch (e: any){ toast.error(e); } finally { setBusy(false); }
  };
  useSaveKey(active, () => void save());
  if (id && loading) return <div className="pad"><SkeletonRows rows={8} /></div>;
  if (id && !loading && !tip) return <ErrorState message="This tip doesn’t exist any more." retry={() => go('')} />;
  return (
    <div className="app">
      <WinTools>
        {dirty && <span className="faint" style={{ fontSize: 12 }}>Unsaved</span>}
        <button type="button" className="btn sm" disabled={busy || (!dirty && !!id)} onClick={() => save()}>Save</button>
        {d.status === 'published' ? <button type="button" className="btn sm" disabled={busy} onClick={() => save('draft')}>Hide from the site</button> : <button type="button" className="btn primary sm" disabled={busy} onClick={() => save('published')}>Publish</button>}
      </WinTools>
      <div className="app-main" style={{ maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <DetailHeader back={() => { if (!dirty) return go(''); void confirm({ title: 'Leave without saving?', confirm: 'Discard changes', danger: true }).then(ok => ok && go('')); }}
          title={d.title || 'New tip'} meta={<><Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>{tip?.slug && <span className="faint">/?tip={tip.slug}</span>}</>}>
          {tip?.status === 'published' && <a className="btn sm ghost" href={`/?tip=${encodeURIComponent(tip.slug)}`} target="_blank" rel="noopener"><Icon name="external" /> View</a>}
          {tip && <button type="button" className="btn sm ghost" onClick={async () => { if (await confirm({ title: `Delete “${tip.title}”?`, body: 'You can undo this for a few seconds.', confirm: 'Delete', danger: true })){ try { const r = await del<{ deleted: Tip }>(`/tips/${tip.id}`); if (r.deleted) onDeleted(r.deleted); } catch (e){ toast.error(e); } } }}><Icon name="trash" /> Delete</button>}
        </DetailHeader>
        <Field label="Title"><input value={d.title} onChange={e => set('title', e.target.value)} maxLength={160} autoFocus={!id} /></Field>
        <div className="form-grid">
          <Field label="Web address" hint="Filled from the title if empty"><span className="input-affix"><span>?tip=</span><input value={d.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} onBlur={() => set('slug', d.slug.replace(/-+/g, '-').replace(/^-|-$/g, ''))} maxLength={80} /></span></Field>
          <Field label="Category"><select value={d.categoryId || ''} onChange={e => set('categoryId', e.target.value || null)}><option value="">None</option>
            {cats.data?.categories.filter(c => c.kind === 'tips').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        </div>
        <Field label="Excerpt" hint={`${d.excerpt.length}/400 · shown in the list and link previews`}><textarea rows={2} value={d.excerpt} onChange={e => set('excerpt', e.target.value)} maxLength={400} /></Field>
        <Field label="Tags"><TagInput label="Tags" value={d.tags} onChange={v => set('tags', v)} /></Field>
        <div className="field"><span className="field-label">Cover image</span>
          {d.coverUrl && <div className="cover-preview"><img src={d.coverUrl} alt="" /><button type="button" className="btn sm" onClick={() => set('coverUrl', '')}>Remove</button></div>}
          <Uploader kind="image" accept="image/png,image/jpeg,image/webp,image/avif" label={d.coverUrl ? 'Replace cover' : 'Upload a cover'} onUploaded={u => set('coverUrl', u.publicUrl || '')}>Wide images work best (16:9)</Uploader>
        </div>
        <MarkdownField label="Article" value={d.body} onChange={v => set('body', v)} rows={18} hint="Markdown. Images: upload them as covers or products and paste the link." />
      </div>
    </div>
  );
}
