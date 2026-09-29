// Licenses & Legal: license texts (versioned: buyers keep the version they bought) and the legal pages.
import { useState } from 'react';
import type { AppProps } from './registry';
import { useLoad, useUnsavedGuard } from '../hooks';
import { del, post, put } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, SkeletonRows, Switch, useConfirm, useToast } from '../ui';
import { Icon } from '../icons';
import { MarkdownField, useSaveKey } from './common';
import { ago } from '../format';

type License = { id: string; key: string; name: string; summary: string; body_md: string; version: number; updated_at: string };
type Page = { slug: string; title: string; body: string; published: boolean; updatedAt: string | null; isDraftText?: boolean; hasBlanks?: boolean };
const BLANKS = /\[[A-Z0-9][^\]\n]{0,60}\]/;

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
            <Icon name="legal" size={14} /><span className="truncate grow">{p.title}</span>{p.published ? <Badge tone="success">live</Badge> : <Badge tone="warning">not live</Badge>}</button>
        ))}
      </nav>
      <div className="app-main">
        {pages.data && pages.data.pages.some(p => !p.published) && kind !== 'page' && (
          <p className="notice warn"><Icon name="alert" /> <span>{pages.data.pages.filter(p => !p.published).map(p => p.title).join(', ')} {pages.data.pages.filter(p => !p.published).length === 1 ? 'isn’t' : 'aren’t'} published yet. Checkout, receipts and the site footer link to them, and Razorpay checks them before activating payments. Open each one, fill in the [BLANKS] and publish.</span></p>
        )}
        {err ? <ErrorState message={lic.error || pages.error!} retry={() => { lic.reload(); pages.reload(); }} />
          : !lic.data || !pages.data ? <SkeletonRows rows={8} />
          : kind === 'license' ? <LicenseEditor key={id} license={id === 'new' ? null : lic.data.licenses.find(l => l.id === id) || null} active={active} onSaved={(d, newId) => { lic.setData(d); if (newId) go(`license/${newId}`); }}
              onDeleted={(d) => { lic.setData(d); go(''); }} />
          : kind === 'page' && pages.data.pages.find(p => p.slug === id) ? <PageEditor key={id} page={pages.data.pages.find(p => p.slug === id)!} active={active} onSaved={pages.setData} />
          : <Empty icon="legal" title="Licenses and legal pages">
              Licenses say what buyers may do with a download; a copy travels with every purchase. Legal pages (terms, privacy, refunds, delivery) are linked from checkout and the footer.
              The starting texts are drafts, not legal advice: have them checked for your situation before relying on them.
            </Empty>}
      </div>
    </div>
  );
}

function LicenseEditor({ license, active, onSaved, onDeleted }: { license: License | null; active: boolean; onSaved: (d: { licenses: License[] }, newId?: string) => void; onDeleted: (d: { licenses: License[] }) => void }){
  const confirm = useConfirm();
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
        <div className="row">
          {license && <AsyncButton className="btn ghost" onClick={async () => {
            if (!(await confirm({ title: `Delete “${license.name}”?`, body: 'Only possible while no product uses it and nothing was sold under it.', confirm: 'Delete', danger: true }))) return;
            onDeleted(await del<{ licenses: License[] }>(`/licenses/${license.id}`)); toast.show('License deleted', { tone: 'success' });
          }}><Icon name="trash" /> Delete</AsyncButton>}
          <AsyncButton className="btn primary" disabled={!dirty || !d.name.trim() || (!license && d.key.length < 2)} onClick={save}>Save</AsyncButton></div></div>
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
  const confirm = useConfirm();
  const blanks = BLANKS.test(d.body);
  const save = async () => {
    if (d.published && blanks && !(await confirm({ title: 'Publish with blanks?', body: 'The text still has [BRACKETS] to fill in (your name, email, city…). Visitors would see them as they are.', confirm: 'Publish anyway' }))) return;
    onSaved(await put(`/legal/${page.slug}`, d)); setBase(JSON.stringify(d)); toast.show(d.published ? 'Saved and live' : 'Saved (not live)', { tone: 'success' });
  };
  useSaveKey(active, () => { if (dirty) void save().catch(toast.error); });
  return (
    <div className="stack-lg" style={{ maxWidth: 860 }}>
      <div className="row between"><div><h2 className="section-title">{d.title}</h2><p className="faint">/legal/{page.slug}{page.updatedAt ? ` · updated ${ago(page.updatedAt)}` : ' · not written yet'}</p></div>
        <div className="row">{page.published && <a className="btn sm ghost" href={`/legal/${page.slug}`} target="_blank" rel="noopener"><Icon name="external" /> View</a>}
          <AsyncButton className="btn primary" disabled={!dirty} onClick={save}>Save</AsyncButton></div></div>
      {page.isDraftText && <p className="notice"><Icon name="info" /> <span>This is a starting draft written for this store. It isn’t legal advice: read it, fill in the [BLANKS], ideally have someone qualified check it, then switch on Published and save.</span></p>}
      {blanks && <p className="notice warn"><Icon name="alert" /> <span>{(d.body.match(new RegExp(BLANKS.source, 'g')) || []).length} blank(s) left to fill in, like {d.body.match(BLANKS)![0]}.</span></p>}
      <Field label="Title"><input value={d.title} onChange={e => setD({ ...d, title: e.target.value })} maxLength={120} /></Field>
      <MarkdownField label="Page text" value={d.body} onChange={v => setD({ ...d, body: v })} rows={22} hint="Blanks in [BRACKETS] are details only you can fill in. ## makes a heading, - makes a list." />
      <Switch checked={d.published} onChange={v => setD({ ...d, published: v })} label="Published (visible on the site)" />
    </div>
  );
}
