// Agreements: project agreements clients sign online before work starts (10% advance, cancellation fees, ownership,
// e-signature). Prepare one (straight from a contact message, or blank), preview the exact text, send it, and follow it:
// sent → opened → signed (or declined). The signed copy, with the client's drawn signature and the signing record,
// opens from here and can be saved as a PDF. Default terms (your legal name, percentages, payment details) are set once.
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad } from '../hooks';
import { del, get, post, put } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Segmented, SkeletonRows, Switch, useConfirm, useToast, SearchBox } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { ago, dateTime } from '../format';
import { buildAgreement, cleanDefaults, cleanProject, money } from '../../../../shared/agreement.js';
import type { AgreementDefaults, AgreementProject } from '../../../../shared/agreement.js';

type Status = 'draft' | 'sent' | 'signed' | 'declined' | 'void';
type Row = { id: string; number: string; status: Status; client_name: string; client_email: string; title: string; data: Partial<AgreementProject>; message_id: string | null;
  created_at: string; updated_at: string; sent_at: string | null; viewed_at: string | null; signed_at: string | null; declined_at: string | null; voided_at: string | null;
  advance_paid_at: string | null; link: string | null; document_hash?: string; decline_reason?: string; signer_name?: string; signer_ip?: string; signer_country?: string;
  advance_note?: string; meta?: { log?: { at: string; event: string; ip?: string; reason?: string }[] } };
type Draft = { clientName: string; clientEmail: string; title: string; messageId: string | null; project: AgreementProject };

const STATUS: Record<Status, [string, 'neutral' | 'info' | 'success' | 'warning' | 'accent']> = {
  draft: ['Draft', 'neutral'], sent: ['Waiting for signature', 'info'], signed: ['Signed', 'success'], declined: ['Declined', 'warning'], void: ['Void', 'neutral']
};
const badge = (r: Row) => r.status === 'sent' && r.viewed_at ? <Badge tone="accent">Opened · not signed</Badge> : <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>;
const emptyDraft = (d: AgreementDefaults): Draft => ({ clientName: '', clientEmail: '', title: '', messageId: null, project: cleanProject({}, d) });

export default function Agreements({ route, go, active }: AppProps){
  const s = useLoad<{ agreements: Row[] }>('/agreements', { pollMs: 30e3, active });
  const defs = useLoad<{ value: AgreementDefaults; revision: number }>('/agreements/defaults');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'signed'>('all');
  const list = useMemo(() => (s.data?.agreements || []).filter(r =>
    (filter === 'all' || (filter === 'signed' ? r.status === 'signed' : ['draft', 'sent'].includes(r.status))) &&
    (!q || `${r.number} ${r.title} ${r.client_name} ${r.client_email}`.toLowerCase().includes(q.toLowerCase()))), [s.data, q, filter]);
  const sel = route.startsWith('new') ? 'new' : route === 'defaults' ? 'defaults' : route || null;
  const fromMessage = route.startsWith('new:') ? route.slice(4) : null;
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  const counts = { waiting: (s.data?.agreements || []).filter(r => r.status === 'sent').length, signed: (s.data?.agreements || []).filter(r => r.status === 'signed').length,
    advanceDue: (s.data?.agreements || []).filter(r => r.status === 'signed' && !r.advance_paid_at).length };
  return (
    <div className="app">
      <WinTools><button type="button" className={'btn sm' + (sel === 'defaults' ? ' primary' : ' ghost')} onClick={() => go('defaults')}><Icon name="settings" size={13} /> Default terms</button>
        <button type="button" className="btn sm primary" onClick={() => go('new')}><Icon name="plus" /> New agreement</button></WinTools>
      <div className="content-split">
        <nav className="folder-nav agr-list" aria-label="Agreements">
          <SearchBox value={q} onChange={setQ} placeholder="Client, project, number…" label="Search agreements" />
          <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'signed', label: 'Signed' }]} />
          <p className="faint" style={{ fontSize: 12, margin: '4px 2px' }}>{counts.waiting} waiting · {counts.signed} signed{counts.advanceDue ? ` · ${counts.advanceDue} advance${counts.advanceDue === 1 ? '' : 's'} to collect` : ''}</p>
          {!s.data ? <SkeletonRows rows={5} /> : !list.length ? <p className="faint" style={{ padding: 8 }}>No agreements{q ? ' match' : ' yet'}.</p> :
            list.map(r => <button key={r.id} type="button" className={'agr-item' + (sel === r.id ? ' on' : '')} onClick={() => go(r.id)}>
              <span className="row between" style={{ gap: 6 }}><b className="truncate">{r.client_name}</b>{badge(r)}</span>
              <span className="truncate">{r.title}</span>
              <span className="faint" style={{ fontSize: 12 }}>{r.number} · {money(Number(r.data?.fee) || 0, r.data?.currency || 'INR')} · {ago(r.signed_at || r.sent_at || r.created_at)}{r.status === 'signed' && !r.advance_paid_at ? ' · advance due' : ''}</span>
            </button>)}
        </nav>
        <div className="app-main">
          {!defs.data ? <SkeletonRows rows={8} /> : sel === 'defaults' ? <DefaultTerms load={defs} /> :
            sel === 'new' ? <Editor key={'new' + (fromMessage || '')} defaults={cleanDefaults(defs.data.value)} messageId={fromMessage} onSaved={(id) => { s.reload(); go(id); }} needsSetup={!defs.data.value.legalName} goDefaults={() => go('defaults')} /> :
            sel ? <Detail key={sel} id={sel} active={active} defaults={cleanDefaults(defs.data.value)} onChanged={s.reload} onGone={() => { s.reload(); go(''); }} goDefaults={() => go('defaults')} /> :
            <Intro onNew={() => go('new')} needsSetup={!defs.data.value.legalName} goDefaults={() => go('defaults')} />}
        </div>
      </div>
    </div>
  );
}

function Intro({ onNew, needsSetup, goDefaults }: { onNew: () => void; needsSetup: boolean; goDefaults: () => void }){
  return <div className="stack-lg" style={{ maxWidth: 720 }}>
    <section className="card stack"><h2 style={{ margin: 0 }}>Project agreements</h2>
      <p className="muted" style={{ margin: 0 }}>Before you start work for someone, send them a short, professional agreement to sign online. It covers the scope and fee, the advance that starts the work, what they pay if they stop half-way, revisions, who owns the work, and their responsibilities. They tick each key point, type their name and draw their signature; you both get a signed copy by email, and it stays here.</p>
      <ol className="muted" style={{ margin: 0, paddingLeft: 20 }}><li>Set your default terms once (your legal name, the advance %, cancellation fees, payment details).</li><li>Create an agreement, from a contact message or blank, and check the preview.</li><li>Send it. You’ll see when they open it and when they sign.</li><li>Mark the advance as received, and start.</li></ol>
      <div className="row" style={{ gap: 8 }}>{needsSetup ? <button type="button" className="btn primary" onClick={goDefaults}>Set up default terms</button> : <button type="button" className="btn primary" onClick={onNew}><Icon name="plus" /> New agreement</button>}</div>
    </section>
    <p className="field-hint">This is a carefully drafted template for a freelance creative practice in India (Indian Contract Act, 1872; Information Technology Act, 2000), not legal advice. Have a lawyer read your default terms once, and adjust them in Default terms if needed.</p>
  </div>;
}

// ---- default terms ------------------------------------------------------------------------------------------------
function DefaultTerms({ load }: { load: ReturnType<typeof useLoad<{ value: AgreementDefaults; revision: number }>> }){
  const [v, setV] = useState<AgreementDefaults>(() => cleanDefaults(load.data!.value));
  const toast = useToast();
  const dirty = JSON.stringify(v) !== JSON.stringify(cleanDefaults(load.data!.value));
  const set = <K extends keyof AgreementDefaults>(k: K, x: AgreementDefaults[K]) => setV({ ...v, [k]: x });
  const num = (k: keyof AgreementDefaults, label: string, hint: string, min: number, max: number, suffix = '') =>
    <Field label={`${label}${suffix ? ` · ${v[k]}${suffix}` : ''}`} hint={hint}><input type="number" min={min} max={max} value={v[k] as number} onChange={e => set(k, Number(e.target.value) as never)} /></Field>;
  return <div className="stack-lg" style={{ maxWidth: 760 }}>
    <section className="card stack"><h3 style={{ margin: 0 }}>You, as the Creator</h3>
      <div className="form-grid">
        <Field label="Your legal name" hint="Required. The person (or business) the client contracts with, e.g. “Voleti Kethan”."><input value={v.legalName} maxLength={120} onChange={e => set('legalName', e.target.value)} placeholder="Your full legal name" /></Field>
        <Field label="Trading name" hint="Shown as “trading as …”"><input value={v.tradingName} maxLength={80} onChange={e => set('tradingName', e.target.value)} /></Field>
        <Field label="Email for notices" hint="Empty = your owner email"><input type="email" value={v.email} maxLength={200} onChange={e => set('email', e.target.value)} /></Field>
        <Field label="City for disputes" hint="Courts there decide any dispute, e.g. “Hyderabad, Telangana”"><input value={v.city} maxLength={80} onChange={e => set('city', e.target.value)} /></Field>
      </div>
      <Field label="Postal address" hint="Optional, shown under your name"><input value={v.address} maxLength={300} onChange={e => set('address', e.target.value)} /></Field>
    </section>
    <section className="card stack"><h3 style={{ margin: 0 }}>Money and cancellation</h3>
      <div className="form-grid">
        {num('advancePercent', 'Advance before work starts', 'Non-refundable once work has started', 0, 100, '%')}
        {num('cancelStartedPercent', 'Minimum if they stop after work starts', 'Of the total fee (or the work done, if more)', 0, 100, '%')}
        {num('cancelDraftPercent', 'Minimum if they stop after first drafts', 'Of the total fee (or the work done, if more)', 0, 100, '%')}
        {num('paymentDays', 'Invoices due within', 'Days', 1, 90, ' days')}
        {num('revisions', 'Revision rounds included', 'Per project; can be changed per agreement', 0, 50)}
        {num('inactivityDays', 'Silence before a project counts as cancelled', 'After one written reminder', 7, 365, ' days')}
      </div>
      <Field label="Extra revisions cost" hint="e.g. “₹1,500 per extra round”. Empty = quoted separately"><input value={v.revisionFee} maxLength={120} onChange={e => set('revisionFee', e.target.value)} /></Field>
      <Field label="Payment details for the advance" hint="UPI ID, bank account, or how to pay. Shown in the agreement and in the signed email."><textarea rows={3} maxLength={400} value={v.paymentDetails} onChange={e => set('paymentDetails', e.target.value)} placeholder="UPI: yourname@bank · or A/C 1234…, IFSC …" /></Field>
    </section>
    <section className="card stack"><h3 style={{ margin: 0 }}>Your work</h3>
      <Switch checked={v.portfolioUse} onChange={x => set('portfolioUse', x)} label="I may show the finished work in my portfolio and social media (each agreement can turn this off)" />
      <Field label="Your own extra clauses" hint="Optional, plain text, one per line. Added as the last clause of every agreement."><textarea rows={5} maxLength={6000} value={v.extraTerms} onChange={e => set('extraTerms', e.target.value)} /></Field>
    </section>
    <div className="row" style={{ gap: 8 }}><AsyncButton className="btn primary" disabled={!dirty} onClick={async () => { const r = await put<{ value: AgreementDefaults; revision: number }>('/agreements/defaults', { value: v, revision: load.data!.revision }); load.setData(r); setV(cleanDefaults(r.value)); toast.show('Default terms saved', { tone: 'success' }); }}>Save default terms</AsyncButton>
      {dirty && <button type="button" className="btn ghost" onClick={() => setV(cleanDefaults(load.data!.value))}>Discard</button>}</div>
    <p className="field-hint">Changes apply to agreements you send from now on. Agreements already sent keep the exact text the client received.</p>
  </div>;
}

// ---- create / edit a draft -------------------------------------------------------------------------------------------
function Editor({ defaults, messageId, existing, onSaved, needsSetup, goDefaults }: { defaults: AgreementDefaults; messageId?: string | null; existing?: Row; onSaved: (id: string) => void; needsSetup: boolean; goDefaults: () => void }){
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => existing ? { clientName: existing.client_name, clientEmail: existing.client_email, title: existing.title, messageId: existing.message_id, project: cleanProject(existing.data, defaults) } : emptyDraft(defaults));
  const [showPreview, setShowPreview] = useState(true);
  // from a contact message: their name, email and what they wrote about
  useEffect(() => {
    if (!messageId || existing) return;
    get<{ message: { name: string; email: string; subject: string; body: string } }>(`/messages/${messageId}`).then(m => setD(x => ({ ...x, messageId, clientName: x.clientName || m.message.name, clientEmail: x.clientEmail || m.message.email,
      title: x.title || (m.message.subject ? m.message.subject.split(',')[0].slice(0, 120) : ''), project: { ...x.project, scope: x.project.scope || m.message.body.slice(0, 1500) } }))).catch(() => {});
  }, [messageId, existing]);
  const P = d.project, setP = <K extends keyof AgreementProject>(k: K, v: AgreementProject[K]) => setD({ ...d, project: { ...P, [k]: v } });
  const doc = useMemo(() => buildAgreement({ number: existing?.number || 'KA-AG-…', title: d.title || 'Project title', clientName: d.clientName || 'Client name', clientEmail: d.clientEmail || 'client@email', date: new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()), project: P, defaults }), [d, defaults, existing]);
  const valid = d.clientName.trim().length > 1 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.clientEmail) && d.title.trim().length > 1;
  const save = async () => {
    const body = { ...d, project: P };
    const r = existing ? await put<{ agreement: Row }>(`/agreements/${existing.id}`, body) : await post<{ agreement: Row }>('/agreements', body);
    toast.show(existing ? 'Draft saved' : `Draft ${r.agreement.number} created`, { tone: 'success' }); onSaved(r.agreement.id); return r.agreement;
  };
  const M = (n: number) => money(n, P.currency);
  return <div className="agr-editor">
    <div className="stack-lg agr-form">
      {needsSetup && <div className="callout row" style={{ gap: 10, flexWrap: 'wrap' }}><span className="grow">Add your legal name in Default terms before sending: it is who the client signs with.</span><button type="button" className="btn sm primary" onClick={goDefaults}>Default terms</button></div>}
      <section className="card stack"><h3 style={{ margin: 0 }}>Client</h3>
        <div className="form-grid">
          <Field label="Client’s full name"><input value={d.clientName} maxLength={120} onChange={e => setD({ ...d, clientName: e.target.value })} /></Field>
          <Field label="Client’s email" hint="The private signing link goes here"><input type="email" value={d.clientEmail} maxLength={200} onChange={e => setD({ ...d, clientEmail: e.target.value })} /></Field>
          <Field label="Company" hint="Optional"><input value={P.clientCompany} maxLength={200} onChange={e => setP('clientCompany', e.target.value)} /></Field>
          <Field label="Phone" hint="Optional"><input value={P.clientPhone} maxLength={40} onChange={e => setP('clientPhone', e.target.value)} /></Field>
        </div>
        <Field label="Client’s address" hint="Optional"><input value={P.clientAddress} maxLength={300} onChange={e => setP('clientAddress', e.target.value)} /></Field>
      </section>
      <section className="card stack"><h3 style={{ margin: 0 }}>The project</h3>
        <Field label="Project title"><input value={d.title} maxLength={160} onChange={e => setD({ ...d, title: e.target.value })} placeholder="e.g. Film poster series for “Devara”" /></Field>
        <Field label="Scope of work" hint="What you will do. Be specific: anything not here is a change request."><textarea rows={4} maxLength={4000} value={P.scope} onChange={e => setP('scope', e.target.value)} /></Field>
        <Field label="Deliverables" hint="What they receive: formats, sizes, number of designs, source files…"><textarea rows={3} maxLength={4000} value={P.deliverables} onChange={e => setP('deliverables', e.target.value)} /></Field>
        <div className="form-grid">
          <Field label="Timeline" hint="e.g. “first drafts in 7 days, final in 21 days”"><input value={P.timeline} maxLength={300} onChange={e => setP('timeline', e.target.value)} /></Field>
          <Field label="Planned start" hint="Optional"><input value={P.startDate} maxLength={80} onChange={e => setP('startDate', e.target.value)} placeholder="after the advance is received" /></Field>
        </div>
      </section>
      <section className="card stack"><h3 style={{ margin: 0 }}>Fee and payments</h3>
        <div className="form-grid">
          <Field label="Total fee"><input type="number" min={0} step="1" value={P.fee || ''} onChange={e => setP('fee', Number(e.target.value))} /></Field>
          <Field label="Currency"><Segmented label="Currency" value={P.currency} onChange={v => setP('currency', v)} options={[{ value: 'INR', label: '₹ INR' }, { value: 'USD', label: '$ USD' }]} /></Field>
          <Field label={`Advance · ${P.advancePercent}% = ${M(Math.round(P.fee * P.advancePercent) / 100)}`}><input type="range" min={0} max={100} step={5} value={P.advancePercent} onChange={e => setP('advancePercent', Number(e.target.value))} /></Field>
          <Field label="Tax note"><input value={P.taxNote} maxLength={120} onChange={e => setP('taxNote', e.target.value)} /></Field>
          <Field label={`If they stop after work starts · at least ${P.cancelStartedPercent}%`}><input type="range" min={0} max={100} step={5} value={P.cancelStartedPercent} onChange={e => setP('cancelStartedPercent', Number(e.target.value))} /></Field>
          <Field label={`If they stop after first drafts · at least ${P.cancelDraftPercent}%`}><input type="range" min={0} max={100} step={5} value={P.cancelDraftPercent} onChange={e => setP('cancelDraftPercent', Number(e.target.value))} /></Field>
          <Field label="Balance is due"><input value={P.balanceTerms} maxLength={200} onChange={e => setP('balanceTerms', e.target.value)} /></Field>
          <Field label="Revision rounds included"><input type="number" min={0} max={50} value={P.revisions} onChange={e => setP('revisions', Number(e.target.value))} /></Field>
        </div>
        <Field label="Payment link" hint="Optional: a Razorpay / UPI payment link for the advance"><input value={P.paymentLink} maxLength={300} onChange={e => setP('paymentLink', e.target.value)} placeholder="https://rzp.io/l/…" /></Field>
      </section>
      <section className="card stack"><h3 style={{ margin: 0 }}>Ownership and privacy</h3>
        <Segmented label="Rights" value={P.rights} onChange={v => setP('rights', v)} options={[{ value: 'full', label: 'Copyright passes on full payment' }, { value: 'license', label: 'Usage licence only' }]} />
        {P.rights === 'license' && <Field label="They may use the work for"><input value={P.usage} maxLength={300} onChange={e => setP('usage', e.target.value)} placeholder="e.g. the film’s promotion in India for 2 years, online and print" /></Field>}
        <Switch checked={P.confidential} onChange={v => setP('confidential', v)} label="Confidential project (no portfolio use without their permission)" />
        <Field label="Notes for this project" hint="Optional extra terms, one per line"><textarea rows={3} maxLength={4000} value={P.notes} onChange={e => setP('notes', e.target.value)} /></Field>
      </section>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <AsyncButton className="btn primary" disabled={!valid} onClick={save}>{existing ? 'Save draft' : 'Create draft'}</AsyncButton>
        <button type="button" className="btn ghost" onClick={() => setShowPreview(p => !p)}>{showPreview ? 'Hide preview' : 'Show preview'}</button>
        {!valid && <span className="faint" style={{ fontSize: 12 }}>Add the client’s name, email and a project title.</span>}
      </div>
    </div>
    {showPreview && <AgreementPreview doc={doc} />}
  </div>;
}

function AgreementPreview({ doc }: { doc: ReturnType<typeof buildAgreement> }){
  return <aside className="agr-preview" aria-label="Preview of the agreement">
    <p className="eyebrow">Preview · exactly what the client reads</p>
    <h2>{doc.title}</h2><p className="faint" style={{ margin: 0 }}>{doc.number} · {doc.date}</p>
    <div className="agr-parties"><div><b>Creator</b>{doc.parties.creator.map((x, i) => <span key={i}>{x}</span>)}</div><div><b>Client</b>{doc.parties.client.map((x, i) => <span key={i}>{x}</span>)}</div></div>
    <dl className="kv">{doc.summary.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
    {doc.sections.map((s, i) => <section key={i}><h4>{i + 1}. {s.heading}</h4>{s.paras.map((p, j) => <p key={j}>{p}</p>)}</section>)}
  </aside>;
}

// ---- one agreement ----------------------------------------------------------------------------------------------------
function Detail({ id, active, defaults, onChanged, onGone, goDefaults }: { id: string; active: boolean; defaults: AgreementDefaults; onChanged: () => void; onGone: () => void; goDefaults: () => void }){
  const a = useLoad<{ agreement: Row }>(`/agreements/${id}`, { pollMs: 20e3, active });
  const toast = useToast();
  const confirm = useConfirm();
  const [note, setNote] = useState('');
  if (a.error && !a.data) return <ErrorState message={a.error} retry={a.reload} />;
  if (!a.data) return <SkeletonRows rows={8} />;
  const r = a.data.agreement;
  const after = (x: { agreement: Row }, msg: string) => { a.setData(x); onChanged(); toast.show(msg, { tone: 'success' }); };
  const P = cleanProject(r.data, defaults), adv = Math.round(P.fee * P.advancePercent) / 100;
  if (r.status === 'draft') return <div className="stack-lg">
    <div className="row between" style={{ gap: 8, flexWrap: 'wrap' }}><div><p className="eyebrow" style={{ margin: 0 }}>{r.number} · draft</p><h2 style={{ margin: 0 }}>{r.title}</h2></div>
      <span className="row" style={{ gap: 8 }}>
        <AsyncButton className="btn primary" onClick={async () => {
          if (!(await confirm({ title: `Send ${r.number} to ${r.client_name}?`, body: `${r.client_email} gets a private link to read and sign it${r.message_id ? ', and it also shows on the device they wrote from' : ''}. The text is frozen when it is sent; to change it later you withdraw it, edit, and send again.`, confirm: 'Send agreement' }))) return;
          after(await post(`/agreements/${r.id}/send`), 'Sent. You’ll see here when they open and sign it.');
        }}><Icon name="send" /> Send to client</AsyncButton>
        <AsyncButton className="btn ghost danger-text" onClick={async () => { if (!(await confirm({ title: 'Delete this draft?', confirm: 'Delete', danger: true }))) return; await del(`/agreements/${r.id}`); toast.show('Draft deleted', { tone: 'success' }); onGone(); }}><Icon name="trash" /> Delete</AsyncButton>
      </span></div>
    <Editor existing={r} defaults={defaults} onSaved={() => { a.reload(); onChanged(); }} needsSetup={!defaults.legalName} goDefaults={goDefaults} />
  </div>;
  const log = r.meta?.log || [];
  return <div className="stack-lg" style={{ maxWidth: 860 }}>
    <div className="row between" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div><p className="eyebrow" style={{ margin: 0 }}>{r.number}</p><h2 style={{ margin: '2px 0' }}>{r.title}</h2><span className="row" style={{ gap: 8 }}>{badge(r)}<span className="faint">{r.client_name} · {r.client_email}</span></span></div>
      <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {r.link && <a className="btn sm primary" href={r.link} target="_blank" rel="noopener"><Icon name="external" size={13} /> {r.status === 'signed' ? 'Open signed copy' : 'Open the client’s page'}</a>}
        {r.link && <button type="button" className="btn sm ghost" onClick={() => void navigator.clipboard.writeText(r.link!).then(() => toast.show('Link copied', { tone: 'success' }))}><Icon name="copy" /> Copy link</button>}
      </span>
    </div>
    <section className="card stack"><h3 style={{ margin: 0 }}>Progress</h3>
      <ol className="agr-steps">
        <li className="done">Sent {r.sent_at ? dateTime(r.sent_at) : ''}</li>
        <li className={r.viewed_at ? 'done' : ''}>{r.viewed_at ? `Opened ${dateTime(r.viewed_at)}` : 'Not opened yet'}</li>
        <li className={r.status === 'signed' ? 'done' : r.status === 'declined' ? 'bad' : ''}>{r.status === 'signed' ? `Signed by ${r.signer_name} · ${dateTime(r.signed_at!)}` : r.status === 'declined' ? `Declined ${dateTime(r.declined_at!)}${r.decline_reason ? `: “${r.decline_reason}”` : ''}` : r.status === 'void' ? `Voided ${dateTime(r.voided_at!)}` : 'Waiting for signature'}</li>
        <li className={r.advance_paid_at ? 'done' : ''}>{r.advance_paid_at ? `Advance received ${dateTime(r.advance_paid_at)}${r.advance_note ? ` · ${r.advance_note}` : ''}` : `Advance ${money(adv, P.currency)} (${P.advancePercent}%) not received yet`}</li>
      </ol>
      {r.status === 'signed' && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="Note, e.g. UPI ref 4321…" style={{ flex: '1 1 200px' }} aria-label="Payment note" />
        <AsyncButton className={'btn sm' + (r.advance_paid_at ? ' ghost' : ' primary')} onClick={async () => after(await post(`/agreements/${r.id}/advance`, { paid: !r.advance_paid_at, note }), r.advance_paid_at ? 'Marked as not received' : 'Advance marked as received. Time to start!')}>{r.advance_paid_at ? 'Undo: not received' : 'Mark advance received'}</AsyncButton>
      </div>}
    </section>
    {r.status === 'signed' && <section className="card stack"><h3 style={{ margin: 0 }}>Signing record</h3>
      <dl className="kv"><dt>Signed by</dt><dd>{r.signer_name}</dd><dt>When</dt><dd>{dateTime(r.signed_at!)}</dd><dt>Internet address</dt><dd className="mono">{r.signer_ip || 'unknown'}{r.signer_country ? ` · ${r.signer_country}` : ''}</dd><dt>Document fingerprint</dt><dd className="mono" style={{ wordBreak: 'break-all' }}>SHA-256 {r.document_hash}</dd></dl>
      <p className="field-hint" style={{ margin: 0 }}>Both of you received the signed agreement by email (as an attachment). Open the signed copy to see their drawn signature and save it as a PDF.</p>
    </section>}
    <section className="card stack"><h3 style={{ margin: 0 }}>Actions</h3>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {r.status === 'sent' && <AsyncButton className="btn sm" onClick={async () => after(await post(`/agreements/${r.id}/send`), `Sent the link again to ${r.client_email}`)}><Icon name="mail" /> Email the link again</AsyncButton>}
        {r.status === 'sent' && <AsyncButton className="btn sm ghost" onClick={async () => { if (!(await confirm({ title: 'Withdraw to edit?', body: 'The link stops showing the agreement (it says it is being updated) until you send the new version.', confirm: 'Withdraw' }))) return; after(await post(`/agreements/${r.id}/withdraw`), 'Withdrawn. Edit it and send again.'); }}>Withdraw and edit</AsyncButton>}
        {['sent', 'signed', 'declined'].includes(r.status) && <AsyncButton className="btn sm ghost danger-text" onClick={async () => { if (!(await confirm({ title: `Void ${r.number}?`, body: 'It stays on record, marked as no longer in force. The client’s page says so too.', confirm: 'Void agreement', danger: true }))) return; after(await post(`/agreements/${r.id}/void`, { reason: '' }), 'Voided'); }}>Void</AsyncButton>}
      </div>
    </section>
    {log.length > 0 && <details className="card"><summary><b>History</b> <span className="faint">({log.length})</span></summary>
      <ul className="list" style={{ marginTop: 8 }}>{log.slice().reverse().map((l, i) => <li key={i}><span className="faint" style={{ width: 150, flex: 'none' }}>{dateTime(l.at)}</span><span className="grow">{l.event}{l.ip ? ` · ${l.ip}` : ''}{l.reason ? ` · ${l.reason}` : ''}</span></li>)}</ul></details>}
  </div>;
}

