// Messages: inbox (split view), search, labels, bulk actions, reply with canned replies, spam + block.
// Message text is always shown as plain text (never HTML).
import { useEffect, useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useDebounced, useLoad, useMedia } from '../hooks';
import { api, del, patch, post } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Modal, SkeletonRows, STATUS_TONE, useConfirm, useToast } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { Copy, TagInput } from './common';
import { ago, dateTime, money } from '../format';

type Msg = { id: string; source: string; name: string; email: string; subject: string; preview: string; status: string; labels: string[]; created_at: string; replied_at: string | null; country: string | null };
type Box = 'inbox' | 'new' | 'done' | 'spam' | 'all';
const UUID = /^[0-9a-f-]{36}$/i;

export default function Messages({ route, go, active, open }: AppProps){
  const [box, setBox] = useState<Box>('inbox');
  const [q, setQ] = useState('');
  const [label, setLabel] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cannedOpen, setCannedOpen] = useState(false);
  const dq = useDebounced(q, 300);
  const narrow = useMedia('(max-width: 760px)');
  const openId = UUID.test(route) ? route : null;
  const qs = new URLSearchParams({ status: box === 'all' ? '' : box, limit: '200' });
  if (dq) qs.set('q', dq); if (label) qs.set('label', label);
  const s = useLoad<{ messages: Msg[]; counts: any; labels: string[] }>(`/messages?${qs}`, { pollMs: 20e3, active });
  const toast = useToast();
  useEffect(() => setSel(new Set()), [box, dq, label]);

  const bulk = async (action: string) => {
    const ids = [...sel]; if (!ids.length) return;
    const prev = s.data!;
    s.setData({ ...prev, messages: prev.messages.filter(m => !sel.has(m.id)) });
    setSel(new Set());
    if (action === 'delete'){ toast.undoable(`Deleted ${ids.length} message${ids.length > 1 ? 's' : ''}`, () => post('/messages/bulk', { ids, action }), () => s.setData(prev)); return; }
    try { await post('/messages/bulk', { ids, action }); toast.show(`Moved ${ids.length} to ${action}`, { tone: 'success' }); s.reload(); } catch (e){ s.setData(prev); toast.error(e); }
  };
  const list = (
    <div className="msg-list">
      <div className="app-toolbar">
        <div className="search" style={{ maxWidth: 'none' }}><Icon name="search" /><input type="search" placeholder="Search messages" value={q} onChange={e => setQ(e.target.value)} aria-label="Search messages" /></div>
      </div>
      <div className="tabs" role="tablist" aria-label="Folders">
        {(['inbox', 'new', 'done', 'spam', 'all'] as Box[]).map(b => (
          <button key={b} type="button" role="tab" aria-selected={box === b} onClick={() => setBox(b)}>{b[0].toUpperCase() + b.slice(1)}{s.data && (b === 'inbox' || b === 'new' || b === 'spam') && s.data.counts[b] ? ` ${s.data.counts[b]}` : ''}</button>
        ))}
      </div>
      {(s.data?.labels.length || 0) > 0 && (
        <div className="row label-bar">{['', ...s.data!.labels].map(l => <button key={l || 'all'} type="button" className={'chip-btn' + (label === l ? ' on' : '')} aria-pressed={label === l} onClick={() => setLabel(l)}>{l || 'All labels'}</button>)}</div>
      )}
      {sel.size > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Selected messages">
          <span>{sel.size} selected</span><span className="grow" />
          <button type="button" className="btn sm ghost" onClick={() => bulk('done')}>Done</button>
          <button type="button" className="btn sm ghost" onClick={() => bulk('read')}>Read</button>
          <button type="button" className="btn sm ghost" onClick={() => bulk('spam')}>Spam</button>
          <button type="button" className="btn sm ghost" onClick={() => bulk('delete')}><Icon name="trash" /></button>
        </div>
      )}
      <div className="msg-scroll">
        {s.error && !s.data ? <ErrorState message={s.error} retry={s.reload} /> : !s.data ? <div className="pad"><SkeletonRows rows={8} cols={2} /></div> : !s.data.messages.length ? (
          <Empty icon="inbox" title={box === 'spam' ? 'No spam' : q ? 'No matches' : 'Inbox zero'}>{box === 'inbox' && !q ? 'New contact messages land here and in your email.' : ''}</Empty>
        ) : (
          <ul className="msg-items" aria-label="Messages">
            {s.data.messages.map(m => (
              <li key={m.id} className={(m.id === openId ? 'open ' : '') + (m.status === 'new' ? 'unread' : '')}>
                <input type="checkbox" aria-label={`Select message from ${m.name}`} checked={sel.has(m.id)} onChange={() => { const n = new Set(sel); n.has(m.id) ? n.delete(m.id) : n.add(m.id); setSel(n); }} />
                <button type="button" className="msg-item" onClick={() => go(m.id)} aria-current={m.id === openId || undefined}>
                  <span className="row between"><b className="truncate">{m.name || m.email || 'Someone'}</b><time className="faint">{ago(m.created_at)}</time></span>
                  <span className="truncate msg-subj">{m.subject || '(no subject)'}</span>
                  <span className="truncate faint">{m.preview}</span>
                  {(m.labels.length > 0 || m.source !== 'contact' || m.replied_at) && <span className="row" style={{ gap: 4 }}>{m.source !== 'contact' && <Badge tone="info">{m.source}</Badge>}{m.replied_at && <Badge tone="success">replied</Badge>}{m.labels.map(l => <Badge key={l}>{l}</Badge>)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
  return (
    <div className="app">
      <WinTools><button type="button" className="btn sm ghost" onClick={() => setCannedOpen(true)}><Icon name="list" /> Saved replies</button><button type="button" className="btn sm ghost" onClick={() => open('settings', 'messages')}><Icon name="settings" /> Rules</button></WinTools>
      <div className={'msg-split' + (openId ? ' has-open' : '')}>
        {(!narrow || !openId) && list}
        {openId ? <Detail key={openId} id={openId} go={go} open={open} onChanged={s.reload} /> : !narrow && <div className="msg-empty"><Empty icon="messages" title="Pick a message">Use ↑ ↓ in the list, or search by name, email or words.</Empty></div>}
      </div>
      {cannedOpen && <CannedManager onClose={() => setCannedOpen(false)} />}
    </div>
  );
}

function Detail({ id, go, open, onChanged }: { id: string; go: (r: string) => void; open: AppProps['open']; onChanged: () => void }){
  const s = useLoad<any>(`/messages/${id}`);
  const canned = useLoad<{ canned: { id: string; title: string; body: string }[] }>('/canned');
  const toast = useToast();
  const confirm = useConfirm();
  const [reply, setReply] = useState('');
  const [labels, setLabels] = useState<string[] | null>(null);
  useEffect(() => { if (s.data) { setLabels(s.data.message.labels); onChanged(); } }, [s.data]);
  const draftKey = `ka.portal.reply.${id}`;
  useEffect(() => { try { setReply(sessionStorage.getItem(draftKey) || ''); } catch { /* ignore */ } }, [draftKey]);
  useEffect(() => { try { reply ? sessionStorage.setItem(draftKey, reply) : sessionStorage.removeItem(draftKey); } catch { /* ignore */ } }, [reply, draftKey]);
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <div className="pad" style={{ flex: 1 }}><SkeletonRows rows={8} /></div>;
  const { message: m, replies, history, orders } = s.data;
  const setStatus = async (status: string) => {
    s.setData({ ...s.data, message: { ...m, status } });
    try { await patch(`/messages/${id}`, { status }); onChanged(); toast.show(status === 'spam' ? 'Moved to spam' : status === 'done' ? 'Marked done' : 'Updated', { tone: 'success' }); }
    catch (e){ s.reload(); toast.error(e); }
  };
  return (
    <article className="msg-detail" aria-label={`Message from ${m.name}`}>
      <header className="msg-head">
        <button type="button" className="icon-btn msg-back" aria-label="Back to the list" onClick={() => go('inbox')}><Icon name="chevronLeft" /></button>
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="truncate">{m.subject || '(no subject)'}</h2>
          <div className="faint" style={{ fontSize: 12 }}>{m.name} · <span className="mono">{m.email}</span> <Copy text={m.email} label="Copy email" /> · {dateTime(m.created_at)}{m.meta?.country ? ` · ${m.meta.country}` : ''}</div>
        </div>
        <Badge tone={STATUS_TONE[m.status]}>{m.status}</Badge>
      </header>
      <div className="msg-actions row">
        {m.status !== 'done' && <button type="button" className="btn sm" onClick={() => setStatus('done')}><Icon name="check" /> Done</button>}
        {m.status !== 'spam' ? <button type="button" className="btn sm ghost" onClick={() => setStatus('spam')}>Spam</button> : <button type="button" className="btn sm ghost" onClick={() => setStatus('read')}>Not spam</button>}
        {m.email && <AsyncButton className="btn sm ghost" onClick={async () => { if (await confirm({ title: `Block ${m.email}?`, body: 'Future messages from this address go straight to Spam, and earlier ones move there too.', confirm: 'Block', danger: true })){ await post('/blocklist', { kind: 'email', value: m.email }); toast.show('Sender blocked', { tone: 'success' }); s.reload(); onChanged(); } }}>Block sender</AsyncButton>}
        <span className="grow" />
        <button type="button" className="btn sm ghost" aria-label="Delete message" onClick={() => { go('inbox'); toast.undoable('Message deleted', () => post('/messages/bulk', { ids: [id], action: 'delete' }).then(onChanged), () => go(id)); }}><Icon name="trash" /></button>
      </div>
      <div className="msg-body">{m.body}</div>
      {labels && <Field label="Labels"><TagInput label="Labels" value={labels} onChange={async v => { setLabels(v); try { await patch(`/messages/${id}`, { labels: v }); onChanged(); } catch (e){ toast.error(e); } }} placeholder="e.g. client, commission" max={10} /></Field>}
      {replies.length > 0 && <section className="stack"><div className="eyebrow">Your replies</div>
        {replies.map((r: any) => <div key={r.id} className="msg-reply"><div className="faint" style={{ fontSize: 12 }}>{dateTime(r.sent_at)} · {r.status}</div><div className="msg-body" style={{ margin: 0 }}>{r.body}</div></div>)}</section>}
      {m.email && (
        <section className="stack reply-box" aria-label="Reply">
          <div className="row between"><div className="eyebrow">Reply to {m.name || m.email}</div>
            {canned.data && canned.data.canned.length > 0 && <select aria-label="Insert a saved reply" value="" onChange={e => { const c = canned.data!.canned.find(x => x.id === e.target.value); if (c) setReply(r => (r ? r + '\n\n' : '') + c.body.replace(/\{\{name\}\}/g, m.name || 'there')); }} style={{ width: 'auto' }}>
              <option value="">Insert saved reply…</option>{canned.data.canned.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}</div>
          <textarea aria-label="Reply text" rows={6} value={reply} onChange={e => setReply(e.target.value)} placeholder="Write your reply. Your email signature is added automatically." />
          <div className="row"><span className="faint grow" style={{ fontSize: 12 }}>Sent from your store address; their replies come to your email.</span>
            <AsyncButton className="btn primary" disabled={!reply.trim()} onClick={async () => { await post(`/messages/${id}/reply`, { body: reply }); setReply(''); toast.show('Reply sent', { tone: 'success' }); s.reload(); onChanged(); }}><Icon name="send" /> Send</AsyncButton></div>
        </section>
      )}
      {(history.length > 0 || orders.length > 0) && (
        <section className="grid-auto">
          {orders.length > 0 && <div className="card"><h3>Their orders</h3><ul className="list">{orders.map((o: any) => (
            <li key={o.id}><button type="button" className="btn ghost sm mono" onClick={() => open('orders', o.id)}>{o.public_id}</button><Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge><span className="grow" /><span className="num">{money(o.total, o.currency)}</span></li>))}</ul></div>}
          {history.length > 0 && <div className="card"><h3>Earlier messages</h3><ul className="list">{history.map((h: any) => (
            <li key={h.id}><button type="button" className="btn ghost sm truncate" style={{ flex: 1, justifyContent: 'flex-start' }} onClick={() => go(h.id)}>{h.subject || '(no subject)'}</button><span className="faint" style={{ fontSize: 12 }}>{ago(h.created_at)}</span></li>))}</ul></div>}
        </section>
      )}
    </article>
  );
}

function CannedManager({ onClose }: { onClose: () => void }){
  const s = useLoad<{ canned: { id: string; title: string; body: string }[] }>('/canned');
  const [edit, setEdit] = useState<{ id?: string; title: string; body: string } | null>(null);
  const toast = useToast();
  const items = useMemo(() => s.data?.canned || [], [s.data]);
  return (
    <Modal wide title="Saved replies" onClose={onClose} footer={edit ? <>
      <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
      <AsyncButton className="btn primary" onClick={async () => { s.setData(edit.id ? await api('PUT', `/canned/${edit.id}`, edit) : await post('/canned', edit)); setEdit(null); toast.show('Saved', { tone: 'success' }); }}>Save</AsyncButton>
    </> : <button type="button" className="btn primary" onClick={() => setEdit({ title: '', body: '' })}><Icon name="plus" /> New reply</button>}>
      {edit ? <>
        <Field label="Name"><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} maxLength={80} autoFocus /></Field>
        <Field label="Text" hint="{{name}} becomes the sender’s name."><textarea rows={8} value={edit.body} onChange={e => setEdit({ ...edit, body: e.target.value })} /></Field>
      </> : !s.data ? <SkeletonRows rows={3} /> : !items.length ? <Empty icon="list" title="No saved replies">Save answers you send often, like pricing or turnaround times.</Empty> : (
        <ul className="list">{items.map(c => (
          <li key={c.id}><span className="grow truncate"><b>{c.title}</b> <span className="faint">{c.body.slice(0, 80)}</span></span>
            <button type="button" className="btn sm ghost" onClick={() => setEdit(c)}>Edit</button>
            <AsyncButton className="btn sm ghost" onClick={async () => { s.setData(await del(`/canned/${c.id}`)); }}><Icon name="trash" /></AsyncButton></li>
        ))}</ul>
      )}
    </Modal>
  );
}
