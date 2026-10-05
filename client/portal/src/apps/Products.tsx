// Products (Artzz gallery pieces and Artifacts for sale): list, reorder, edit, publish, images, file.
import { useEffect, useMemo, useState, useRef } from 'react';
import type { AppProps } from './registry';
import { useDraft, useLoad, usePref, useUnsavedGuard } from '../hooks';
import { api, del, get, post, put, patch } from '../api';
import { Badge, Empty, ErrorState, Field, Segmented, SkeletonRows, Switch, AsyncButton, STATUS_TONE, useConfirm, useToast, SearchBox } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { DateTimeInput, DetailHeader, MarkdownField, MoneyInput, TagInput, Uploader, useSaveKey } from './common';
import { money, ago, bytes } from '../format';
import { appendToZip, licenseText, zipFiles } from '../zip';

type Media = { id: string; url: string; alt: string; width: number | null; height: number | null };
type Product = {
  id: string; kind: 'artzz' | 'artifacts'; slug: string; title: string; summary: string; description: string; categoryId: string | null; category: string | null;
  tags: string[]; techTags: string[]; version: string; status: 'draft' | 'published' | 'archived'; sellable: boolean; isFree: boolean;
  priceInr: number | null; priceUsd: number | null; salePriceInr: number | null; salePriceUsd: number | null; saleStartsAt: string | null; saleEndsAt: string | null;
  licenseId: string | null; license: string | null; demoUrl: string; previewUrl: string; maxDownloads: number; linkTtlHours: number; refundAfterDownload: boolean;
  sort: number; media: Media[]; file: { id: string; filename: string; bytes: number; licenseVersion: number | null; createdAt: string } | null; sales: number; updatedAt: string; publishedAt: string | null;
};
type Kind = 'all' | 'artzz' | 'artifacts';

export default function Products({ route, go, active, open }: AppProps){
  if (route === 'new') return <NewProduct go={go} />;
  if (route) return <Editor id={route} go={go} active={active} open={open} />;
  return <List go={go} />;
}

function List({ go }: { go: (r: string) => void }){
  const [kind, setKind] = usePref<Kind>('products.kind', 'all');
  const [view, setView] = usePref<'grid' | 'list'>('products.view', 'grid');
  const [q, setQ] = useState('');
  const s = useLoad<{ products: Product[] }>(`/products${kind === 'all' ? '' : `?kind=${kind}`}`);
  const toast = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const items = useMemo(() => (s.data?.products || []).filter(p => !q || (p.title + ' ' + p.slug + ' ' + p.tags.join(' ')).toLowerCase().includes(q.toLowerCase())), [s.data, q]);

  const move = async (id: string, to: number) => {
    const all = s.data!.products, p = all.find(x => x.id === id)!;
    const same = all.filter(x => x.kind === p.kind);
    const from = same.findIndex(x => x.id === id);
    if (to < 0 || to >= same.length || from === to) return;
    const next = [...same]; next.splice(to, 0, next.splice(from, 1)[0]);
    const prev = s.data;
    s.setData({ products: [...all.filter(x => x.kind !== p.kind), ...next].sort((a, b) => a.kind.localeCompare(b.kind) || (a.kind === p.kind ? next.indexOf(a) - next.indexOf(b) : a.sort - b.sort)) });
    try { await post('/products/reorder', { ids: next.map(x => x.id) }); } catch (e){ s.setData(prev!); toast.error(e); }
  };

  return (
    <div className="app">
      <WinTools><button type="button" className="btn primary sm" onClick={() => go('new')}><Icon name="plus" /> New</button></WinTools>
      <div className="app-toolbar">
        <Segmented label="Section" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'artzz', label: 'Artzz' }, { value: 'artifacts', label: 'Artifacts' }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Search titles and tags" label="Search products" />
        <span className="grow" />
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'grid', label: <Icon name="grid" label="Grid" /> }, { value: 'list', label: <Icon name="list" label="List" /> }]} />
      </div>
      <div className="app-main">
        {s.error && !s.data ? <ErrorState message={s.error} retry={s.reload} /> : !s.data ? <SkeletonRows rows={6} /> : !items.length ? (
          <Empty icon="products" title={q ? 'No matches' : 'No products yet'} action={!q && <button type="button" className="btn primary" onClick={() => go('new')}><Icon name="plus" /> Add your first product</button>}>
            {q ? 'Try a different word.' : 'Artzz are gallery pieces; Artifacts are downloads you sell.'}
          </Empty>
        ) : view === 'grid' ? (
          <div className="p-grid">
            {items.map(p => (
              <button key={p.id} type="button" className={'p-card' + (dragId === p.id ? ' dragging' : '')} onClick={() => go(p.id)} draggable={!q}
                onDragStart={() => setDragId(p.id)} onDragEnd={() => setDragId(null)} onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  const dragged = dragId && s.data!.products.find(x => x.id === dragId);
                  if (!dragged || dragged.id === p.id) return;
                  if (dragged.kind !== p.kind){ toast.show('Artzz and Artifacts are ordered separately: drop it onto an item in the same section.'); return; }
                  const same = s.data!.products.filter(x => x.kind === p.kind); void move(dragged.id, same.findIndex(x => x.id === p.id));
                }}>
                <span className="p-thumb">{p.media[0] ? <img src={p.media[0].url} alt="" loading="lazy" decoding="async" /> : <Icon name="image" size={28} />}</span>
                <span className="p-body">
                  <span className="p-title truncate">{p.title}</span>
                  <span className="row" style={{ gap: 6 }}><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge><Badge>{p.kind}</Badge>{p.sales > 0 && <span className="faint num" style={{ fontSize: 12 }}>{p.sales} sold</span>}</span>
                  <span className="p-price num">{priceLine(p)}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <ul className="list p-list">
            {items.map(p => {
              const same = s.data!.products.filter(x => x.kind === p.kind), i = same.findIndex(x => x.id === p.id);
              return (
                <li key={p.id}>
                  <span className="p-mini">{p.media[0] ? <img src={p.media[0].url} alt="" loading="lazy" /> : <Icon name="image" />}</span>
                  <button type="button" className="btn ghost truncate" style={{ flex: 1, justifyContent: 'flex-start', fontWeight: 600 }} onClick={() => go(p.id)}>{p.title}</button>
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  <span className="num muted p-hide-sm" style={{ width: 150, textAlign: 'right' }}>{priceLine(p)}</span>
                  <span className="faint p-hide-sm" style={{ width: 90, fontSize: 12 }}>{ago(p.updatedAt)}</span>
                  {!q && <span className="row" style={{ gap: 0 }}>
                    <button type="button" className="icon-btn sm" aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => move(p.id, i - 1)}><Icon name="chevronDown" size={14} style={{ transform: 'rotate(180deg)' }} /></button>
                    <button type="button" className="icon-btn sm" aria-label={`Move ${p.title} down`} disabled={i === same.length - 1} onClick={() => move(p.id, i + 1)}><Icon name="chevronDown" size={14} /></button>
                  </span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// A sale price counts only inside its window (no dates = always), and only when it is actually lower.
function saleOn(p: Pick<Product, 'saleStartsAt' | 'saleEndsAt'>, now = Date.now()){
  return (!p.saleStartsAt || new Date(p.saleStartsAt).getTime() <= now) && (!p.saleEndsAt || new Date(p.saleEndsAt).getTime() > now);
}
function effective(p: Product){
  const on = saleOn(p);
  const inr = on && p.salePriceInr !== null && p.priceInr !== null && p.salePriceInr < p.priceInr ? p.salePriceInr : p.priceInr;
  const usd = on && p.salePriceUsd !== null && p.priceUsd !== null && p.salePriceUsd < p.priceUsd ? p.salePriceUsd : p.priceUsd;
  return { inr, usd, inrSale: inr !== p.priceInr, usdSale: usd !== p.priceUsd };
}
function priceLine(p: Product){
  if (!p.sellable) return 'Not for sale';
  if (p.isFree) return 'Free';
  const e = effective(p);
  return [e.inr !== null ? money(e.inr, 'INR') : null, e.usd !== null ? money(e.usd, 'USD') : null].filter(Boolean).join(' · ') || 'No price yet';
}

function NewProduct({ go }: { go: (r: string) => void }){
  const [kind, setKind] = useState<'artzz' | 'artifacts'>('artifacts');
  const [title, setTitle] = useState('');
  const toast = useToast();
  const create = async () => {
    if (!title.trim()) return toast.show('Give it a title first.', { tone: 'error' });
    const r = await post<{ product: Product }>('/products', { kind, title });
    toast.show('Draft created', { tone: 'success' });
    go(r.product.id);
  };
  return (
    <div className="app-main" style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <DetailHeader back={() => go('')} title="New product" />
      <Field label="Section"><Segmented label="Section" value={kind} onChange={setKind} options={[{ value: 'artzz', label: 'Artzz · gallery piece' }, { value: 'artifacts', label: 'Artifacts · download' }]} /></Field>
      <Field label="Title"><input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create().catch(toast.error); }} maxLength={160} /></Field>
      <div className="row"><AsyncButton className="btn primary" onClick={create}><Icon name="plus" /> Create draft</AsyncButton><span className="faint" style={{ fontSize: 12 }}>It stays private until you publish.</span></div>
    </div>
  );
}

function Editor({ id, go, active, open }: { id: string; go: (r: string) => void; active: boolean; open: AppProps['open'] }){
  const toast = useToast();
  const confirm = useConfirm();
  const s = useLoad<{ product: Product }>(`/products/${id}`);
  const cats = useLoad<{ categories: { id: string; kind: string; name: string }[] }>('/categories');
  // "＋ New category…" in the Category menu: created for this product's section and selected at once
  const [newCat, setNewCat] = useState<string | null>(null);
  const addCategory = async () => {
    const name = (newCat || '').trim(); if (!name || !p) return;
    try {
      const r = await post<{ categories: { id: string; kind: string; name: string }[] }>('/categories', { kind: p.kind, name });
      cats.setData(r);
      const made = r.categories.find(c => c.kind === p.kind && c.name.toLowerCase() === name.toLowerCase());
      if (made) set('categoryId', made.id);
      setNewCat(null);
      toast.show(`Category “${name}” added`, { tone: 'success' });
    } catch (err){ toast.error(err); }
  };
  const lic = useLoad<{ licenses: { id: string; key: string; name: string; summary: string; body_md: string; version: number }[] }>('/licenses');
  // Server-owned parts (uploaded media/file, sales count) follow the server even while fields are being
  // edited; the version stamp (updatedAt) stays the one this edit started from.
  const [draft, setDraft] = useDraft<Product>(s.data?.product, { resetKey: id, same: (a, b) => JSON.stringify(strip(a)) === JSON.stringify(strip(b)),
    merge: (d, srv) => ({ ...d, media: srv.media, file: srv.file, sales: srv.sales }) });
  const [saving, setSaving] = useState(false);
  const [packLicense, setPackLicense] = usePref('products.packLicense', true);
  const saved = s.data?.product;
  const dirty = !!draft && !!saved && JSON.stringify(strip(draft)) !== JSON.stringify(strip(saved));
  useUnsavedGuard(dirty);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setDraft(d => d && { ...d, [k]: v });

  const save = async (status?: Product['status']) => {
    if (!draft || saving) return;
    // the same rules the server enforces, checked here first for instant feedback
    const problem = (status || draft.status) === 'published' ? publishProblem(draft) : draftProblem(draft);
    if (problem){ toast.show(problem, { tone: 'error' }); return; }
    setSaving(true);
    try {
      const r = await put<{ product: Product }>(`/products/${id}`, { ...draft, status: status || draft.status, updatedAt: draft.updatedAt || saved!.updatedAt });
      s.setData(r); setDraft(r.product);
      if (status === 'published' && saved!.status !== 'published') history.reload();
      toast.show(status === 'published' ? 'Published: it’s live on the store' : status === 'draft' ? 'Unpublished: back to draft' : 'Saved', { tone: 'success' });
    } catch (e: any){
      if (e.code === 'stale'){
        // changed elsewhere since this edit began: take that version's stamp so the next Save is a
        // deliberate overwrite, keep the edits on screen, and explain
        try { const fresh = await get<{ product: Product }>(`/products/${id}`); s.setData(fresh); setDraft(d => d && { ...d, updatedAt: fresh.product.updatedAt }); } catch { /* the error below still shows */ }
        toast.show('This product was changed somewhere else after you opened it. Your edits are still here: Save again to keep yours.', { tone: 'error', ms: 10000 });
      } else toast.error(e);
    } finally { setSaving(false); }
  };
  useSaveKey(active, () => void save());
  const history = useLoad<{ revisions: { id: number; action: 'publish' | 'restore'; created_at: string; actor: string | null }[] }>(`/products/${id}/history`);

  const packed = useRef(false);   // a hook: it must run before the early returns below, on every render
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!draft || !saved) return <div className="pad"><SkeletonRows rows={10} /></div>;
  const p = draft;
  const license = lic.data?.licenses.find(l => l.id === p.licenseId);
  const refresh = (r: { product: Product }) => { s.setData(r); setDraft(d => d ? { ...d, media: r.product.media, file: r.product.file, updatedAt: r.product.updatedAt } : r.product); };

  const remove = async () => {
    if (!(await confirm({ title: `Delete “${p.title}”?`, body: p.sales ? 'It has sales, so it will be archived (hidden, orders keep working). You can restore it later.' : 'This draft and its files will be removed.', confirm: p.sales ? 'Archive' : 'Delete', danger: true }))) return;
    if (p.sales){ await del(`/products/${id}`); toast.show('Archived', { action: { label: 'Undo', run: () => { void post(`/products/${id}/restore`).then(() => toast.show('Restored as a draft', { tone: 'success' })).catch(toast.error); } } }); go(''); return; }
    go('');
    toast.undoable(`Deleted “${p.title}”`, () => del(`/products/${id}`), () => go(id));
  };

  // Deliverable: optionally repackaged so LICENSE.txt travels inside the download.
  // LICENSE.txt is packed into the download in the browser (the whole file in memory, ZIP up to 4 GB), so only for
  // files up to 1 GB; bigger files go up as they are (buyers still get LICENSE.txt attached to the delivery email).
  const prepareFile = async (file: File) => {
    packed.current = false;
    if (!packLicense || !license) return file;
    if (file.size > 1024 * 1024 * 1024){ toast.show('Large file: uploaded as it is. LICENSE.txt is attached to the buyer’s email instead of packed inside.'); return file; }
    packed.current = true;
    const text = new TextEncoder().encode(licenseText({ product: p.title, license: license.name, summary: license.summary, body: license.body_md, version: license.version }));
    const buf = new Uint8Array(await file.arrayBuffer());
    const isZip = /\.zip$/i.test(file.name) && buf[0] === 0x50 && buf[1] === 0x4b;
    const blob = isZip ? appendToZip(buf, [{ name: 'LICENSE.txt', data: text }]) : zipFiles([{ name: file.name, data: buf }, { name: 'LICENSE.txt', data: text }]);
    return new File([blob], isZip ? file.name : file.name.replace(/\.[^.]+$/, '') + '.zip', { type: 'application/zip' });
  };
  const fileUploaded = async (u: { path: string; file: File }) => {
    const r = await put<{ product: Product }>(`/products/${id}/file`, { path: u.path, filename: u.file.name, bytes: u.file.size, licenseVersion: packed.current && license ? license.version : null });
    refresh(r);
    toast.show(packLicense && license ? 'File uploaded with LICENSE.txt inside' : 'File uploaded', { tone: 'success' });
  };

  return (
    <div className="app">
      <WinTools>
        {dirty && <span className="faint" style={{ fontSize: 12 }}>Unsaved</span>}
        <button type="button" className="btn sm" disabled={!dirty || saving} onClick={() => save()}>Save</button>
        {p.status === 'published'
          ? <button type="button" className="btn sm" disabled={saving} onClick={() => save('draft')}>Unpublish</button>
          : <button type="button" className="btn primary sm" disabled={saving} onClick={() => save('published')}>Publish</button>}
      </WinTools>
      <div className="app-main">
        <DetailHeader back={() => { if (!dirty) return go(''); void confirm({ title: 'Leave without saving?', body: 'Your changes to this product will be lost.', confirm: 'Discard changes', danger: true }).then(ok => ok && go('')); }}
          title={p.title || 'Untitled'} meta={<><Badge tone={STATUS_TONE[saved.status]}>{saved.status}</Badge><span className="faint">{p.kind === 'artzz' ? 'Artzz' : 'Artifacts'} · /?product={saved.slug} · updated {ago(saved.updatedAt)}</span></>}>
          {saved.status === 'published' && <a className="btn sm ghost" href={`/?product=${encodeURIComponent(saved.slug)}`} target="_blank" rel="noopener"><Icon name="external" /> View</a>}
          <AsyncButton className="btn sm ghost" onClick={async () => { const r = await post<{ product: Product }>(`/products/${id}/duplicate`); toast.show('Duplicated as a draft', { tone: 'success' }); go(r.product.id); }}><Icon name="copy" /> Duplicate</AsyncButton>
          <button type="button" className="btn sm ghost" onClick={() => remove().catch(toast.error)}><Icon name="trash" /> Delete</button>
        </DetailHeader>

        <div className="editor-grid">
          <div className="stack-lg">
            <section className="card stack" aria-labelledby="pe-basics"><h3 id="pe-basics">Basics</h3>
              <Field label="Title"><input value={p.title} onChange={e => set('title', e.target.value)} maxLength={160} /></Field>
              <Field label="Web address" hint="Letters, numbers and dashes. Changing it breaks old links."><span className="input-affix"><span>?product=</span><input value={p.slug} onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                onBlur={() => set('slug', p.slug.replace(/-+/g, '-').replace(/^-|-$/g, ''))} maxLength={60} /></span></Field>
              <Field label="Short description" hint={`${p.summary.length}/400 · shown on the card`}><textarea rows={2} value={p.summary} onChange={e => set('summary', e.target.value)} maxLength={400} /></Field>
              <MarkdownField label="Full description" value={p.description} onChange={v => set('description', v)} rows={8} hint="Markdown: **bold**, lists, links." />
              <div className="form-grid">
                <Field label="Category" hint={newCat === null ? 'Shown as a filter in the store' : undefined}>
                  {newCat === null
                    ? <select value={p.categoryId || ''} onChange={e => e.target.value === '__new' ? setNewCat('') : set('categoryId', e.target.value || null)}>
                        <option value="">No category</option>{cats.data?.categories.filter(c => c.kind === p.kind).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value="__new">＋ New category…</option></select>
                    : <span className="row" style={{ gap: 6 }}>
                        <input autoFocus aria-label="New category name" value={newCat} maxLength={60} placeholder={p.kind === 'artzz' ? 'e.g. Poster arts' : 'e.g. Design kits'}
                          onChange={e => setNewCat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter'){ e.preventDefault(); void addCategory(); } if (e.key === 'Escape') setNewCat(null); }} style={{ flex: 1 }} />
                        <AsyncButton className="btn sm" disabled={!newCat.trim()} onClick={addCategory}>Add</AsyncButton>
                        <button type="button" className="btn sm ghost" onClick={() => setNewCat(null)}>Cancel</button>
                      </span>}
                </Field>
                <Field label="Version"><input value={p.version} onChange={e => set('version', e.target.value)} maxLength={30} placeholder="1.0" /></Field>
              </div>
              <Field label="Tags"><TagInput label="Tags" value={p.tags} onChange={v => set('tags', v)} /></Field>
              {p.kind === 'artifacts' && <Field label="Made with" hint="Software or formats, e.g. Photoshop, Figma, PSD"><TagInput label="Made with" value={p.techTags} onChange={v => set('techTags', v)} /></Field>}
            </section>

            <section className="card stack" aria-labelledby="pe-media"><h3 id="pe-media"><span className="grow">Images</span><span className="faint" style={{ fontSize: 12 }}>First image is the cover</span></h3>
              {p.media.length > 0 && (
                <ul className="media-grid">
                  {p.media.map((m, i) => (
                    <li key={m.id}>
                      <img src={m.url} alt={m.alt} loading="lazy" />
                      <input aria-label={`Alt text for image ${i + 1}`} placeholder="Describe the image" defaultValue={m.alt} onBlur={async e => { if (e.target.value !== m.alt){ try { refresh(await patch(`/products/${id}/media`, { alt: { [m.id]: e.target.value } })); } catch (err){ toast.error(err); } } }} />
                      <div className="media-actions">
                        <button type="button" className="icon-btn sm" aria-label="Move earlier" disabled={i === 0} onClick={async () => { const o = p.media.map(x => x.id); [o[i - 1], o[i]] = [o[i], o[i - 1]]; try { refresh(await patch(`/products/${id}/media`, { order: o })); } catch (e){ toast.error(e); } }}><Icon name="chevronLeft" size={14} /></button>
                        <button type="button" className="icon-btn sm" aria-label="Move later" disabled={i === p.media.length - 1} onClick={async () => { const o = p.media.map(x => x.id); [o[i + 1], o[i]] = [o[i], o[i + 1]]; try { refresh(await patch(`/products/${id}/media`, { order: o })); } catch (e){ toast.error(e); } }}><Icon name="chevronRight" size={14} /></button>
                        <button type="button" className="icon-btn sm" aria-label="Remove image" onClick={async () => { if (await confirm({ title: 'Remove this image?', confirm: 'Remove', danger: true })) try { refresh(await api('DELETE', `/products/${id}/media/${m.id}`)); } catch (e){ toast.error(e); } }}><Icon name="trash" size={14} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Uploader kind="image" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" label="Upload images" multiple onUploaded={async (u) => { refresh(await post(`/products/${id}/media`, { url: u.publicUrl, alt: '', width: u.width, height: u.height })); }}>PNG, JPG, WebP or AVIF · up to 10 MB each</Uploader>
            </section>

            <section className="card stack" aria-labelledby="pe-sale"><h3 id="pe-sale">Selling</h3>
              <Switch checked={p.sellable} onChange={v => set('sellable', v)} label={p.kind === 'artzz' ? 'Sell this piece as a download' : 'For sale'} />
              {p.sellable && <>
                <Switch checked={p.isFree} onChange={v => set('isFree', v)} label="Free download (email required)" />
                {!p.isFree && <>
                  <div className="form-grid">
                    <Field label="Price in India"><MoneyInput currency="INR" label="INR price" value={p.priceInr} onChange={v => set('priceInr', v)} placeholder="499.00" /></Field>
                    <Field label="Price elsewhere"><MoneyInput currency="USD" label="USD price" value={p.priceUsd} onChange={v => set('priceUsd', v)} placeholder="9.00" /></Field>
                    <Field label="Sale price (INR)" hint="Optional, lower than the price"><MoneyInput currency="INR" label="INR sale price" value={p.salePriceInr} onChange={v => set('salePriceInr', v)} clearable /></Field>
                    <Field label="Sale price (USD)"><MoneyInput currency="USD" label="USD sale price" value={p.salePriceUsd} onChange={v => set('salePriceUsd', v)} clearable /></Field>
                    <Field label="Sale starts" hint="India time · empty = now"><DateTimeInput label="Sale start" value={toLocal(p.saleStartsAt)} onChange={v => set('saleStartsAt', fromLocal(v))} /></Field>
                    <Field label="Sale ends" hint="Empty = no end"><DateTimeInput label="Sale end" value={toLocal(p.saleEndsAt)} min={toLocal(p.saleStartsAt) || undefined} onChange={v => set('saleEndsAt', fromLocal(v))} /></Field>
                  </div>
                  <p className="field-hint">Prices are charged exactly as set: ₹ in India, $ elsewhere. Razorpay’s minimum is ₹1 / $1.</p>
                </>}
                <div className="form-grid">
                  <Field label="License"><select value={p.licenseId || ''} onChange={e => set('licenseId', e.target.value || null)}>
                    <option value="">Choose a license</option>{lic.data?.licenses.map(l => <option key={l.id} value={l.id}>{l.name} (v{l.version})</option>)}</select></Field>
                  <Field label="Downloads per purchase" hint="1 to 100"><IntInput label="Downloads per purchase" value={p.maxDownloads} min={1} max={100} onChange={v => set('maxDownloads', v)} /></Field>
                  <Field label="Link works for" hint="Hours, 1 to 168 (7 days)"><IntInput label="Link lifetime in hours" value={p.linkTtlHours} min={1} max={168} onChange={v => set('linkTtlHours', v)} /></Field>
                </div>
                <Switch checked={p.refundAfterDownload} onChange={v => set('refundAfterDownload', v)} label="Allow refunds after the file was downloaded" />
              </>}
              <div className="form-grid">
                <Field label="Live demo link"><input type="url" value={p.demoUrl} onChange={e => set('demoUrl', e.target.value)} placeholder="https://" /></Field>
                <Field label="Preview link"><input type="url" value={p.previewUrl} onChange={e => set('previewUrl', e.target.value)} placeholder="https://" /></Field>
              </div>
            </section>

            {p.sellable && (
              <section className="card stack" aria-labelledby="pe-file"><h3 id="pe-file">File buyers download</h3>
                {p.file ? (
                  <div className="file-row">
                    <Icon name="zip" size={22} />
                    <div className="grow" style={{ minWidth: 0 }}><div className="truncate" style={{ fontWeight: 600 }}>{p.file.filename}</div>
                      <div className="faint" style={{ fontSize: 12 }}>{bytes(p.file.bytes)} · uploaded {ago(p.file.createdAt)}{p.file.licenseVersion ? ` · LICENSE.txt v${p.file.licenseVersion} inside` : ''}</div></div>
                    <AsyncButton className="btn sm" onClick={async () => { const r = await get<{ url: string }>(`/products/${id}/file`); window.open(r.url, '_blank', 'noopener'); }}><Icon name="downloads" /> Download</AsyncButton>
                  </div>
                ) : <p className="muted">No file yet. A for-sale item can’t be published without one.</p>}
                <Switch checked={packLicense} onChange={setPackLicense} label={license ? `Put LICENSE.txt (${license.name}) inside the download` : 'Put LICENSE.txt inside the download (choose a license first)'} disabled={!license} />
                <Uploader kind="deliverable" accept="*/*" label={p.file ? 'Replace the file' : 'Upload the file'} prepare={prepareFile} onUploaded={fileUploaded}>
                  Any size (big files upload in parts). Stored privately; buyers only get expiring links.
                </Uploader>
                <p className="field-hint">Replacing keeps earlier versions, so links already emailed keep working until they expire.</p>
              </section>
            )}
          </div>

          <aside className="stack" aria-label="Store preview">
            <div className="eyebrow">Store preview</div>
            <div className="store-card-preview">
              <div className="scp-img">{p.media[0] ? <img src={p.media[0].url} alt="" /> : <Icon name="image" size={30} />}</div>
              <div className="scp-body">
                <div className="scp-title">{p.title || 'Untitled'}</div>
                {p.summary && <div className="scp-sum">{p.summary}</div>}
                <div className="scp-price num">{previewPrice(p)}</div>
              </div>
            </div>
            <Readiness p={p} />
            <section className="card stack" aria-label="Publish history">
              <div className="row between"><b>Publish history</b><button type="button" className="btn sm ghost" onClick={() => history.reload()}>Refresh</button></div>
              {history.error && !history.data ? <p className="field-error">{history.error}</p> : !history.data ? <p className="faint">Loading revisions…</p> : !history.data.revisions.length ? <p className="faint">Published versions appear here after the first publish.</p> : <ul className="list">{history.data.revisions.map(rev => <li key={rev.id}>
                <span className="grow"><b>{rev.action === 'restore' ? 'Restored publish' : 'Published'}</b><span className="faint" style={{ display: 'block', fontSize: 12 }}>{ago(rev.created_at)}{rev.actor ? ` · ${rev.actor}` : ''}</span></span>
                <AsyncButton className="btn sm ghost" disabled={saving || rev.id === history.data?.revisions[0]?.id} onClick={async () => {
                  if (!(await confirm({ title: 'Restore this published version?', body: 'This replaces the current product with the selected published version. You can restore other versions from this history.', confirm: 'Restore version' }))) return;
                  const r = await post<{ product: Product }>(`/products/${id}/history/${rev.id}/restore`);
                  s.setData(r); setDraft(r.product); history.reload(); toast.show('Published version restored', { tone: 'success' });
                }}>Restore</AsyncButton>
              </li>)}</ul>}
            </section>
            <RatingsCard id={id} />
            <dl className="kv card">
              <dt>Status</dt><dd><Badge tone={STATUS_TONE[saved.status]}>{saved.status}</Badge></dd>
              <dt>Sold</dt><dd className="num">{p.sales}</dd>
              <dt>License</dt><dd>{license?.name || '—'}</dd>
              <dt>Published</dt><dd>{saved.publishedAt ? ago(saved.publishedAt) : 'never'}</dd>
            </dl>
            <div className="card stack">
              <div className="eyebrow">Checkout pass</div>
              <p className="field-hint" style={{ margin: 0 }}>The ticket buyers see while paying: its logo, label, fonts and where the text sits. One design for every product.</p>
              <button type="button" className="btn sm" onClick={() => open('studio', 'pass')}><Icon name="studio" /> Design the checkout pass</button>
            </div>
            <p className="field-hint"><kbd>Ctrl</kbd> <kbd>S</kbd> saves. Publishing checks for images, prices and a file.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

// What a published item needs, in the order the owner would fix it.
function checklist(p: Product){
  const selling = p.sellable && !p.isFree;
  return [
    { ok: !!p.title.trim(), label: 'Title', fix: 'Add a title.' },
    { ok: !!p.slug.replace(/-/g, ''), label: 'Web address', fix: 'Give it a web address (letters and numbers).' },
    { ok: p.kind !== 'artzz' || p.media.length > 0, label: p.kind === 'artzz' ? 'At least one image' : 'Cover image (recommended)', fix: 'Add at least one image before publishing an Artzz item.', soft: p.kind !== 'artzz' },
    ...(selling ? [
      { ok: p.priceInr !== null && p.priceInr >= 100, label: 'Price in India (₹1 or more)', fix: 'Set the India price (₹1 or more), or mark it free.' },
      { ok: p.priceUsd !== null && p.priceUsd >= 100, label: 'Price elsewhere ($1 or more)', fix: 'Set the price for other countries ($1 or more), or mark it free.' },
    ] : []),
    ...(p.sellable ? [
      { ok: !!p.file, label: 'File for buyers', fix: 'Upload the file buyers will download before publishing it for sale.' },
      { ok: !!p.licenseId, label: 'License', fix: 'Choose a license: it tells buyers what they may do with the file.', soft: true },
    ] : []),
  ];
}
function draftProblem(p: Product){
  if (p.sellable && !p.isFree && ((p.salePriceInr !== null && p.priceInr !== null && p.salePriceInr >= p.priceInr) || (p.salePriceUsd !== null && p.priceUsd !== null && p.salePriceUsd >= p.priceUsd))) return 'The sale price must be lower than the normal price.';
  if (p.saleStartsAt && p.saleEndsAt && new Date(p.saleEndsAt) <= new Date(p.saleStartsAt)) return 'The sale must end after it starts.';
  if (p.sellable && !p.isFree && ((p.salePriceInr !== null && p.salePriceInr < 100) || (p.salePriceUsd !== null && p.salePriceUsd < 100))) return 'A sale price must be at least ₹1 / $1.';
  return null;
}
function publishProblem(p: Product){
  return checklist(p).find(c => !c.ok && !c.soft)?.fix || draftProblem(p);
}
function Readiness({ p }: { p: Product }){
  const items = checklist(p), missing = items.filter(c => !c.ok && !c.soft).length;
  return (
    <div className="card stack readiness" aria-label="Ready to publish">
      <div className="row between"><b>{missing ? 'Before publishing' : 'Ready to publish'}</b>{missing ? <Badge tone="warning">{missing} to do</Badge> : <Badge tone="success">all set</Badge>}</div>
      <ul className="check-list">{items.map(c => (
        <li key={c.label} className={c.ok ? 'ok' : c.soft ? 'soft' : 'todo'}><Icon name={c.ok ? 'check' : c.soft ? 'info' : 'alert'} size={13} />{c.label}</li>
      ))}</ul>
    </div>
  );
}

function previewPrice(p: Product){
  if (!p.sellable) return 'View only';
  if (p.isFree) return 'Free';
  if (p.priceInr === null && p.priceUsd === null) return 'Set a price';
  const e = effective(p);
  const one = (v: number | null, full: number | null, sale: boolean, cur: 'INR' | 'USD') => v === null ? null
    : <span>{money(v, cur)}{sale && full !== null && <s className="faint" style={{ marginLeft: 6 }}>{money(full, cur)}</s>}</span>;
  return <span className="scp-prices">{one(e.inr, p.priceInr, e.inrSale, 'INR')}{one(e.usd, p.priceUsd, e.usdSale, 'USD')}</span>;
}

// Whole numbers typed freely (the field can be emptied while typing); clamped when you leave it.
function IntInput({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }){
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text) !== value) setText(String(value)); }, [value]);   // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (t: string) => { const n = Math.min(max, Math.max(min, parseInt(t, 10) || min)); setText(String(n)); onChange(n); };
  return <input inputMode="numeric" aria-label={label} className="num" value={text}
    onChange={e => { const t = e.target.value.replace(/\D/g, '').slice(0, 4); setText(t); const n = parseInt(t, 10); if (n >= min && n <= max) onChange(n); }}
    onBlur={() => commit(text)} onKeyDown={e => { if (e.key === 'Enter') commit(text); }} />;
}
const strip = (p: Product) => ({ ...p, media: undefined, file: undefined, updatedAt: undefined, sales: undefined });
// datetime-local works in the viewer's zone; the portal assumes India time is the owner's zone.
function toLocal(v: string | null){ if (!v) return ''; const d = new Date(v); const ist = new Date(d.getTime() + 330 * 60e3); return ist.toISOString().slice(0, 16); }
function fromLocal(v: string){ if (!v) return null; return new Date(v + ':00+05:30').toISOString(); }

// Ratings and downloads for one item: buyers rate it from their download page; hide or delete any rating here.
type RatingRow = { id: string; rating: number; review: string; name: string; status: 'visible' | 'hidden'; created_at: string; order_ref: string };
function RatingsCard({ id }: { id: string }){
  const r = useLoad<{ ratings: RatingRow[]; avg: number | null; count: number; downloads: number }>(`/products/${id}/ratings`);
  const confirm = useConfirm();
  const toast = useToast();
  if (!r.data) return null;
  const d = r.data;
  const stars = (n: number) => '★★★★★'.slice(0, Math.round(n)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(n));
  return (
    <section className="card stack" aria-labelledby={`rt-${id}`}>
      <div className="row between"><div className="eyebrow" id={`rt-${id}`}>Ratings & downloads</div><span className="faint num">{d.downloads} download{d.downloads === 1 ? '' : 's'}</span></div>
      {d.count ? <div className="row" style={{ gap: 8, alignItems: 'baseline' }}><b style={{ fontSize: 20, color: 'var(--accent)' }}>{stars(d.avg || 0)}</b><span className="num">{(d.avg || 0).toFixed(1)}</span><span className="faint">· {d.count} rating{d.count === 1 ? '' : 's'}</span></div>
        : <p className="field-hint" style={{ margin: 0 }}>No ratings yet. Buyers can rate from their download page.</p>}
      {d.ratings.length > 0 && <ul className="list" style={{ display: 'grid', gap: 10, margin: 0, padding: 0, listStyle: 'none', maxHeight: 320, overflow: 'auto' }}>
        {d.ratings.map(x => (
          <li key={x.id} style={{ display: 'grid', gap: 4, opacity: x.status === 'hidden' ? 0.55 : 1 }}>
            <div className="row between"><span><b style={{ color: 'var(--accent)' }}>{stars(x.rating)}</b> <span className="faint">{x.name || 'Verified buyer'} · {x.order_ref}{x.status === 'hidden' ? ' · hidden' : ''}</span></span>
              <span className="row" style={{ gap: 4 }}>
                <AsyncButton className="btn sm ghost" onClick={async () => r.setData(await patch(`/ratings/${x.id}`, { status: x.status === 'hidden' ? 'visible' : 'hidden' }))}>{x.status === 'hidden' ? 'Show' : 'Hide'}</AsyncButton>
                <AsyncButton className="icon-btn sm" title="Delete" onClick={async () => { if (await confirm({ title: 'Delete this rating?', confirm: 'Delete', danger: true })){ r.setData(await del(`/ratings/${x.id}`)); toast.show('Rating deleted', { tone: 'success' }); } }}><Icon name="trash" size={14} /></AsyncButton>
              </span></div>
            {x.review && <p style={{ margin: 0, fontSize: 13 }}>{x.review}</p>}
          </li>
        ))}
      </ul>}
    </section>
  );
}
