// Licenses & Legal: license texts (versioned: buyers keep the version they bought) and the legal pages.
import { useState } from 'react';
import type { AppProps } from './registry';
import { useLoad, useUnsavedGuard } from '../hooks';
import { post, put } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, SkeletonRows, Switch, useToast } from '../ui';
import { Icon } from '../icons';
import { MarkdownField, useSaveKey } from './common';
import { ago } from '../format';

type License = { id: string; key: string; name: string; summary: string; body_md: string; version: number; updated_at: string };
type Page = { slug: string; title: string; body: string; published: boolean; updatedAt: string | null };

export default function Legal({ route, go, active }: AppProps){
  const [kind, id] = route.split('/');
  const lic = useLoad<{ licenses: License[] }>('/licenses');
  const pages = useLoad<{ pages: Page[] }>('/legal');
  const err = (lic.error && !lic.data) || (pages.error && !pages.data);
  return (
    <div className="content-split">
      <nav className="folder-nav" aria-label="Licenses and legal pages">
        <div className="eyebrow" style={{ padding: '0 8px 6px' }}>Licenses</div>
        {lic.data?.licenses.map(l => (
          <button key={l.id} type="button" className={'folder-btn' + (kind === 'license' && id === l.id ? ' on' : '')} onClick={() => go(`license/${l.id}`)}>
            <Icon name="file" size={14} /><span className="truncate grow">{l.name}</span><span className="faint num">v{l.version}</span></button>
        ))}
        <button type="button" className={'folder-btn' + (kind === 'license' && id === 'new' ? ' on' : '')} onClick={() => go('license/new')}><Icon name="plus" size={14} /><span className="grow">New license</span></button>
        <div className="eyebrow" style={{ padding: '14px 8px 6px' }}>Legal pages</div>
        {pages.data?.pages.map(p => (
          <button key={p.slug} type="button" className={'folder-btn' + (kind === 'page' && id === p.slug ? ' on' : '')} onClick={() => go(`page/${p.slug}`)}>
            <Icon name="legal" size={14} /><span className="truncate grow">{p.title}</span>{p.published ? <Badge tone="success">live</Badge> : <Badge>draft</Badge>}</button>
        ))}
      </nav>
      <div className="app-main">
        {err ? <ErrorState message={lic.error || pages.error!} retry={() => { lic.reload(); pages.reload(); }} />
          : !lic.data || !pages.data ? <SkeletonRows rows={8} />
          : kind === 'license' ? <LicenseEditor key={id} license={id === 'new' ? null : lic.data.licenses.find(l => l.id === id) || null} active={active} onSaved={(d, newId) => { lic.setData(d); if (newId) go(`license/${newId}`); }} />
          : kind === 'page' && pages.data.pages.find(p => p.slug === id) ? <PageEditor key={id} page={pages.data.pages.find(p => p.slug === id)!} active={active} onSaved={pages.setData} />
          : <Empty icon="legal" title="Licenses and legal pages">
              Licenses say what buyers may do with a download; a copy travels with every purchase. Legal pages (terms, privacy, refunds, delivery) are linked from checkout and the footer.
              The starting texts are drafts, not legal advice: have them checked for your situation before relying on them.
            </Empty>}
      </div>
    </div>
  );
}

function LicenseEditor({ license, active, onSaved }: { license: License | null; active: boolean; onSaved: (d: { licenses: License[] }, newId?: string) => void }){
  const [d, setD] = useState({ name: license?.name || '', summary: license?.summary || '', body: license?.body_md || '', key: license?.key || '' });
  const [base, setBase] = useState(JSON.stringify(d));
  const toast = useToast();
  const dirty = JSON.stringify(d) !== base;
  useUnsavedGuard(dirty);
  const save = async () => {
    const r = license ? await put<{ licenses: License[] }>(`/licenses/${license.id}`, d) : await post<{ licenses: License[] }>('/licenses', d);
    setBase(JSON.stringify(d));
    const saved = r.licenses.find(l => (license ? l.id === license.id : l.name === d.name));
    toast.show(license && saved && saved.version !== license.version ? `Saved as version ${saved.version}. New buyers get this text; earlier buyers keep theirs.` : 'Saved', { tone: 'success', ms: 6000 });
    onSaved(r, license ? undefined : saved?.id);
  };
  useSaveKey(active, () => { if (dirty) void save().catch(toast.error); });
  return (
    <div className="stack-lg" style={{ maxWidth: 860 }}>
      <div className="row between"><div><h2 className="section-title">{license ? license.name : 'New license'}</h2>{license && <p className="faint">Version {license.version} · updated {ago(license.updated_at)} · key <span className="mono">{license.key}</span></p>}</div>
        <AsyncButton className="btn primary" disabled={!dirty || !d.name.trim()} onClick={save}>Save</AsyncButton></div>
      <div className="form-grid">
        <Field label="Name"><input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} maxLength={60} placeholder="e.g. Personal, Commercial" /></Field>
        {!license && <Field label="Key" hint="Short ID, e.g. personal (can’t change later)"><input value={d.key} onChange={e => setD({ ...d, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} maxLength={40} className="mono" /></Field>}
      </div>
      <Field label="One-line summary" hint="Shown next to the price"><input value={d.summary} onChange={e => setD({ ...d, summary: e.target.value })} maxLength={300} /></Field>
      <MarkdownField label="Full license text" value={d.body} onChange={v => setD({ ...d, body: v })} rows={18} hint="Changing the text creates a new version. Each order keeps the version the buyer agreed to." />
    </div>
  );
}

function PageEditor({ page, active, onSaved }: { page: Page; active: boolean; onSaved: (d: { pages: Page[] }) => void }){
  const [d, setD] = useState({ title: page.title, body: page.body, published: page.published });
  const [base, setBase] = useState(JSON.stringify(d));
  const toast = useToast();
  const dirty = JSON.stringify(d) !== base;
  useUnsavedGuard(dirty);
  const save = async () => { onSaved(await put(`/legal/${page.slug}`, d)); setBase(JSON.stringify(d)); toast.show(d.published ? 'Saved and live' : 'Saved as a draft', { tone: 'success' }); };
  useSaveKey(active, () => { if (dirty) void save().catch(toast.error); });
  return (
    <div className="stack-lg" style={{ maxWidth: 860 }}>
      <div className="row between"><div><h2 className="section-title">{d.title}</h2><p className="faint">/legal/{page.slug}{page.updatedAt ? ` · updated ${ago(page.updatedAt)}` : ' · not written yet'}</p></div>
        <div className="row">{page.published && <a className="btn sm ghost" href={`/legal/${page.slug}`} target="_blank" rel="noopener"><Icon name="external" /> View</a>}
          <AsyncButton className="btn primary" disabled={!dirty} onClick={save}>Save</AsyncButton></div></div>
      <Field label="Title"><input value={d.title} onChange={e => setD({ ...d, title: e.target.value })} maxLength={120} /></Field>
      <MarkdownField label="Page text" value={d.body} onChange={v => setD({ ...d, body: v })} rows={22} hint="Blanks in [BRACKETS] are details only you can fill in." />
      <Switch checked={d.published} onChange={v => setD({ ...d, published: v })} label="Published (visible on the site)" />
    </div>
  );
}
