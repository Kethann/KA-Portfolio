// Store status: open or close the store in one tap, the words on the "closed" board, and special access while it
// is closed (by email: they get a link in their inbox; by device: a private link or QR code that unlocks that browser).
// Used in Settings > Store status and, as a compact switch, on the Overview.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLoad } from '../hooks';
import { del, post } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Segmented, SkeletonRows, Switch, useConfirm, useToast } from '../ui';
import { Icon } from '../icons';
import { DateTimeInput } from './common';
import { ago, dateTime } from '../format';
import { qrMatrix, qrPath } from '../qr';

export type StoreStatusDoc = { open: boolean; closedTitle: string; closedMessage: string; reopensAt: string; autoOpen: boolean; closedScene: 'panda' | 'emoji' };
export type StorePass = { id: string; kind: 'email' | 'device'; label: string; email: string | null; createdAt: string; lastUsedAt: string | null; uses: number; link: string | null };
type View = { status: StoreStatusDoc; passes: StorePass[] };

// India time for the datetime-local input, like the coupon dates
const toLocal = (iso: string) => iso ? new Date(new Date(iso).getTime() + 330 * 60e3).toISOString().slice(0, 16) : '';
const toIso = (v: string) => v ? new Date(v + ':00+05:30').toISOString() : '';

function useStoreStatus(){
  const s = useLoad<View>('/store/access');
  const toast = useToast();
  const confirm = useConfirm();
  // open/close in one tap; closing asks first, because visitors notice at once
  const setOpen = async (open: boolean) => {
    if (!s.data) return;
    if (!open && !(await confirm({ title: 'Close the store?', body: 'Visitors see the “closed” board with the panda and can’t buy. People you gave special access can still shop. You can reopen any time.', confirm: 'Close the store' }))) return;
    const prev = s.data;
    s.setData({ ...prev, status: { ...prev.status, open } });
    try { s.setData(await post<View>('/store/status', { open })); toast.show(open ? 'The store is open' : 'The store is closed. Visitors see the closed board within a few seconds.', { tone: 'success' }); }
    catch (e){ s.setData(prev); toast.error(e); }
  };
  return { s, setOpen };
}

/** the one-tap switch for the Overview header */
export function StoreQuickToggle(){
  const { s, setOpen } = useStoreStatus();
  if (!s.data) return null;
  const open = s.data.status.open;
  return (
    <button type="button" className={'store-pill' + (open ? ' is-open' : ' is-closed')} aria-pressed={!open} title={open ? 'The store is open. Click to close it.' : 'The store is closed. Click to open it.'} onClick={() => void setOpen(!open)}>
      <span className="store-pill-dot" aria-hidden="true" /><span>{open ? 'Store open' : 'Store closed'}</span>
      {!open && s.data.passes.length > 0 && <span className="faint" style={{ fontSize: 11 }}>· {s.data.passes.length} pass{s.data.passes.length === 1 ? '' : 'es'}</span>}
    </button>
  );
}

export default function StoreStatusPanel(){
  const { s, setOpen } = useStoreStatus();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<StoreStatusDoc | null>(null);
  const [adding, setAdding] = useState<{ kind: 'email' | 'device'; label: string; email: string; notify: boolean }>({ kind: 'email', label: '', email: '', notify: true });
  const [shown, setShown] = useState<StorePass | null>(null);
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <SkeletonRows rows={8} />;
  const st = draft || s.data.status;
  const dirty = !!draft && JSON.stringify({ ...draft, open: s.data.status.open }) !== JSON.stringify(s.data.status);
  const set = <K extends keyof StoreStatusDoc>(k: K, v: StoreStatusDoc[K]) => setDraft({ ...st, [k]: v });
  const saveBoard = async () => {
    s.setData(await post<View>('/store/status', { closedTitle: st.closedTitle, closedMessage: st.closedMessage, reopensAt: st.reopensAt, autoOpen: !!st.reopensAt && st.autoOpen, closedScene: st.closedScene }));
    setDraft(null); toast.show('Closed board saved', { tone: 'success' });
  };
  const add = async () => {
    const v = await post<View>('/store/access', { kind: adding.kind, label: adding.label, email: adding.kind === 'email' ? adding.email : undefined, notify: adding.notify });
    s.setData(v);
    const made = v.passes[v.passes.length - 1];
    setAdding({ ...adding, label: '', email: '' });
    if (made?.kind === 'device') setShown(made);
    toast.show(made?.kind === 'email' ? (adding.notify ? `Access given. A link is on its way to ${made.email}.` : 'Access given. They can ask for their link on the closed board.') : 'Pass created. Send them the link or let them scan the QR code.', { tone: 'success' });
  };
  const remove = async (p: StorePass) => {
    if (!(await confirm({ title: `Remove ${p.label}’s access?`, body: 'Their link stops working at once. While the store is closed they will see the closed board again.', confirm: 'Remove access', danger: true }))) return;
    try { s.setData(await del<View>(`/store/access/${p.id}`)); toast.show('Access removed', { tone: 'success' }); } catch (e){ toast.error(e); }
  };
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.show('Link copied', { tone: 'success' }); } catch { toast.show('Copy failed. Select the link and copy it instead.'); } };
  const open = s.data.status.open;
  return <>
    <section className={'card stack store-status' + (open ? ' is-open' : ' is-closed')}>
      <div className="row" style={{ alignItems: 'center', gap: 14 }}>
        <span className="store-status-icon" aria-hidden="true">{open ? '🛍️' : '🐼'}</span>
        <div className="grow">
          <h3 style={{ margin: 0 }}>{open ? 'The store is open' : 'The store is closed'}</h3>
          <p className="muted" style={{ margin: '2px 0 0' }}>{open ? 'Visitors can browse and buy as usual.' : `Visitors see the closed board${s.data.passes.length ? `; ${s.data.passes.length} ${s.data.passes.length === 1 ? 'person has' : 'people have'} special access` : ''}.`}</p>
        </div>
        <Switch checked={open} onChange={v => void setOpen(v)} label={open ? 'Open' : 'Closed'} />
      </div>
    </section>

    <section className="card stack">
      <h3>The closed board</h3>
      <p className="muted" style={{ marginTop: -6 }}>What visitors see on the Store page while it is closed. The panda leaves the chat button and hangs this sign.</p>
      <div className="store-board-preview" data-scene={st.closedScene} aria-hidden="true">
        <span className="sbp-thread" />{st.closedScene === 'emoji' ? <span className="sbp-panda">😢</span> : <Panda3D />}
        <div className="sbp-sign"><b>CLOSED</b><span>{st.closedTitle || 'The store is taking a nap'}</span></div>
      </div>
      <Field label="Headline"><input value={st.closedTitle} maxLength={80} onChange={e => set('closedTitle', e.target.value)} placeholder="The store is taking a nap" /></Field>
      <Field label="Message" hint="A line or two: why, and when to come back."><textarea rows={3} maxLength={400} value={st.closedMessage} onChange={e => set('closedMessage', e.target.value)} /></Field>
      <div className="form-grid">
        <Field label="Reopens" hint="Optional, India time. Shown as a countdown."><DateTimeInput label="Reopens" value={toLocal(st.reopensAt)} onChange={v => set('reopensAt', toIso(v))} /></Field>
        <Field label="When the time comes" hint={st.reopensAt ? (st.autoOpen ? 'The store opens by itself at that moment, and the board plays the opening animation.' : 'The countdown ends, but the store stays closed until you switch it on above.') : 'Set a reopening time first.'}>
          <Switch checked={!!st.reopensAt && st.autoOpen} disabled={!st.reopensAt} onChange={v => set('autoOpen', v)} label="Open the store automatically" />
        </Field>
        <Field label="Scene"><Segmented label="Scene" value={st.closedScene} onChange={v => set('closedScene', v)} options={[{ value: 'panda', label: '🐼 Resting panda' }, { value: 'emoji', label: '😢 Sad face' }]} /></Field>
      </div>
      <div className="row"><AsyncButton className="btn primary" disabled={!dirty} onClick={saveBoard}>Save the board</AsyncButton>{dirty && <button type="button" className="btn ghost" onClick={() => setDraft(null)}>Discard</button>}</div>
    </section>

    <section className="card stack">
      <h3>Special access</h3>
      <p className="muted" style={{ marginTop: -6 }}>Let chosen people shop while the store is closed. <b>By email</b>: they get a private link (and can ask for it again on the closed board). <b>By device</b>: you send a link or QR code; opening it unlocks that browser.</p>
      <div className="pass-add">
        <Segmented label="Access by" value={adding.kind} onChange={v => setAdding({ ...adding, kind: v })} options={[{ value: 'email', label: 'Email' }, { value: 'device', label: 'Device' }]} />
        {adding.kind === 'email'
          ? <input type="email" value={adding.email} onChange={e => setAdding({ ...adding, email: e.target.value })} placeholder="their@email.com" aria-label="Email address" className="grow" />
          : <input value={adding.label} onChange={e => setAdding({ ...adding, label: e.target.value })} placeholder="Whose device? e.g. Priya’s phone" aria-label="Name for this device" maxLength={60} className="grow" />}
        {adding.kind === 'email' && <input value={adding.label} onChange={e => setAdding({ ...adding, label: e.target.value })} placeholder="Name (optional)" aria-label="Name" maxLength={60} style={{ maxWidth: 170 }} />}
        <AsyncButton className="btn primary" disabled={adding.kind === 'email' ? !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adding.email) : adding.label.trim().length < 2} onClick={add}><Icon name="plus" /> Give access</AsyncButton>
      </div>
      {adding.kind === 'email' && <Switch checked={adding.notify} onChange={v => setAdding({ ...adding, notify: v })} label="Email them their link now" />}
      {!s.data.passes.length ? <Empty icon="lock" title="No one has special access">While the store is closed, nobody can buy until you add someone here.</Empty> : (
        <ul className="list pass-list">{s.data.passes.map(p => (
          <li key={p.id}>
            <Badge tone={p.kind === 'email' ? 'info' : 'accent'}>{p.kind === 'email' ? 'Email' : 'Device'}</Badge>
            <span className="grow truncate"><b>{p.label}</b>{p.email && p.email !== p.label ? <span className="faint"> · {p.email}</span> : null}</span>
            <span className="faint" style={{ fontSize: 12 }} title={p.lastUsedAt ? `Last used ${dateTime(p.lastUsedAt)}` : `Added ${dateTime(p.createdAt)}`}>{p.lastUsedAt ? `used ${ago(p.lastUsedAt)}` : `added ${ago(p.createdAt)}`}</span>
            {p.kind === 'device' && p.link && <button type="button" className="icon-btn sm" aria-label={`Show ${p.label}’s link and QR code`} title="Link and QR code" onClick={() => setShown(p)}><Icon name="link" size={13} /></button>}
            {p.kind === 'email' && <AsyncButton className="icon-btn sm" title="Email the link again" onClick={async () => { await post(`/store/access/${p.id}/resend`); toast.show(`Link sent to ${p.email}`, { tone: 'success' }); }}><Icon name="mail" size={13} /></AsyncButton>}
            <button type="button" className="icon-btn sm" aria-label={`Remove ${p.label}’s access`} title="Remove access" onClick={() => void remove(p)}><Icon name="trash" size={13} /></button>
          </li>
        ))}</ul>
      )}
    </section>
    {shown?.link && <PassLink pass={shown} onClose={() => setShown(null)} onCopy={copy} />}
  </>;
}

// The same 3D panda as on the website (client/src/panda.ts), resting on the board preview; the emoji stays only
// if 3D can't run here. Loaded on demand, so the portal stays light until this page is opened.
function Panda3D(){
  const host = useRef<HTMLSpanElement>(null), wrap = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let dispose: (() => void) | null = null, gone = false;
    import('../../../src/panda').then(m => host.current && wrap.current ? m.mountPanda(host.current, wrap.current) : null)
      .then(d => { if (gone) d?.(); else { dispose = d || null; setReady(!!d); } }).catch(() => setReady(false));
    return () => { gone = true; dispose?.(); };
  }, []);
  return <span ref={wrap} className="sbp-panda3d" aria-hidden="true"><span ref={host} className="sbp-panda3d-host" />{!ready && <span className="sbp-panda">🐼</span>}</span>;
}

function PassLink({ pass, onClose, onCopy }: { pass: StorePass; onClose: () => void; onCopy: (t: string) => void }){
  const qr = useMemo(() => qrPath(qrMatrix(pass.link!)), [pass.link]);
  return (
    <section className="card stack pass-share" role="dialog" aria-label={`${pass.label}’s private link`}>
      <div className="row"><h3 className="grow" style={{ margin: 0 }}>{pass.label}’s private link</h3><button type="button" className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={14} /></button></div>
      <div className="row" style={{ alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
        <svg className="qr" width={150} height={150} viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR code of the link" shapeRendering="crispEdges"><rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.d} fill="#000" /></svg>
        <div className="stack grow" style={{ minWidth: 220 }}>
          <p className="muted" style={{ margin: 0 }}>Opening this link once unlocks the store on that device, even while it is closed. Scan it with the phone’s camera, or send it to them.</p>
          <code className="pass-link mono">{pass.link}</code>
          <div className="row"><button type="button" className="btn primary sm" onClick={() => onCopy(pass.link!)}><Icon name="copy" /> Copy link</button>
            {'share' in navigator && <button type="button" className="btn sm" onClick={() => void navigator.share({ title: 'Your store access', url: pass.link! }).catch(() => {})}><Icon name="send" /> Share…</button>}</div>
        </div>
      </div>
    </section>
  );
}
