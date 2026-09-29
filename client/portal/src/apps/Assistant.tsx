// KA Assistant: what it costs (clearly marked as estimates), what it knows, what it said, a playground
// that runs the real pipeline, and its rules and settings.
import { useEffect, useRef, useState } from 'react';
import type { AppProps } from './registry';
import { useDebounced, useDraft, useLoad, useMedia, useUnsavedGuard } from '../hooks';
import { del, post, put } from '../api';
import { AsyncButton, Badge, Chart, Empty, ErrorState, Field, Modal, Segmented, SkeletonRows, Switch, useConfirm, useToast, SearchBox } from '../ui';
import { Icon } from '../icons';
import { TagInput } from './common';
import { ago, dateTime, num } from '../format';
import logo from '../assets/ka-logo.png';

type Tab = 'overview' | 'knowledge' | 'logs' | 'playground' | 'settings';
const usd = (micros: number) => `$${(Number(micros) / 1e6).toFixed(Number(micros) < 10000 ? 4 : 2)}`;

// Training hand-offs between tabs (in memory only): a weak answer → "Teach it" opens the knowledge
// editor pre-filled; after saving → "Ask it again" opens the Playground with the question typed in.
const handoff: { teach?: { question: string; answer?: string }; ask?: string } = {};

export default function Assistant({ route, go }: AppProps){
  const tab: Tab = (['overview', 'knowledge', 'logs', 'playground', 'settings'] as Tab[]).includes(route.split('/')[0] as Tab) ? route.split('/')[0] as Tab : 'overview';
  return (
    <div className="app">
      <div className="tabs" role="tablist" aria-label="Assistant sections">
        {([['overview', 'Overview'], ['knowledge', 'Knowledge'], ['logs', 'Conversations'], ['playground', 'Playground'], ['settings', 'Rules & settings']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go(k)}>{l}</button>
        ))}
      </div>
      {tab === 'knowledge' ? <Knowledge go={go} /> : tab === 'logs' ? <Logs id={route.split('/')[1]} go={go} /> : tab === 'playground' ? <Playground /> : tab === 'settings' ? <SettingsTab /> : <Overview go={go} />}
    </div>
  );
}

function Overview({ go }: { go: (r: string) => void }){
  const s = useLoad<any>('/assistant');
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <div className="pad"><SkeletonRows rows={8} /></div>;
  const d = s.data, cap = d.settings.dailyBudgetMicros, spent = Number(d.today.cost_micros);
  // the last 30 days (India time), zeros included, so one day of use doesn't fill the whole chart
  const days: string[] = Array.from({ length: 30 }, (_, i) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - (29 - i) * 864e5)));
  const costOf = (day: string) => Number(d.days.find((x: any) => x.day === day)?.cost_micros || 0);
  return (
    <div className="app-main">
      <div className="row between">
        <div className="row"><img src={logo} alt="" width={40} height={40} className="ka-avatar" /><div><h2 className="section-title">KA Assistant</h2>
          <p className="faint">{d.settings.enabled ? 'On' : 'Off'} · {d.provider.name === 'anthropic' ? 'Anthropic' : 'Google Gemini'} · <span className="mono" title="Tried in this order: when one is out of free quota or busy, the next answers">{(d.provider.chain || [d.provider.model]).join(' → ')}</span></p></div></div>
        {!d.provider.configured && <Badge tone="danger">{d.provider.keyVar} is not set</Badge>}
      </div>
      <div className="kpis">
        <div className="kpi"><div className="kpi-label">Spent today (estimate)</div><div className="kpi-value">{usd(spent)}</div>
          <div className="kpi-sub">of {usd(cap)} daily cap{d.today.cutoff_notified ? ' · paused for today' : ''}</div>
          <div className="meter" style={{ marginTop: 8 }} aria-label="Share of the daily cap used"><i style={{ width: `${Math.min(100, (spent / Math.max(1, cap)) * 100)}%`, background: spent >= cap ? 'var(--danger)' : undefined }} /></div></div>
        <div className="kpi"><div className="kpi-label">Questions (30 days)</div><div className="kpi-value">{num(d.totals.questions)}</div><div className="kpi-sub">{num(d.totals.conversations)} conversations</div></div>
        <div className="kpi"><div className="kpi-label">Ratings</div><div className="kpi-value">👍 {d.ratings.up} · 👎 {d.ratings.down}</div><div className="kpi-sub">from your reviews of answers</div></div>
        <div className="kpi"><div className="kpi-label">Knowledge</div><div className="kpi-value">{d.kb.sources}</div><div className="kpi-sub">{d.kb.chunks} searchable pieces + live store data</div></div>
      </div>
      {d.quota && <QuotaCard quota={d.quota} />}
      <section className="card"><h3>Estimated cost per day</h3>
        {d.days.length ? <Chart kind="bar" labels={days} series={[{ name: 'Cost', values: days.map(costOf) }]} format={usd} height={150} /> : <Empty icon="reports" title="No usage yet" />}
        <p className="field-hint" style={{ marginTop: 8 }}>
          Costs are estimates: tokens counted by the provider × {d.provider.pricesAreDefaults ? <b>default prices</b> : 'your prices'} (${d.provider.priceIn} per 1M input, ${d.provider.priceOut} per 1M output tokens).
          {d.provider.pricesAreDefaults && ' Set AI_PRICE_IN and AI_PRICE_OUT to your plan’s real prices.'} Your provider’s bill is the source of truth. The cap is checked before each answer, so one answer can go slightly over it.
        </p>
      </section>
      <section className="card"><h3><span className="grow">Latest questions</span><button type="button" className="btn sm ghost" onClick={() => go('logs')}>All conversations</button></h3>
        {!d.recent.length ? <p className="faint">No questions yet.</p> : <ul className="list">{d.recent.map((r: any, i: number) => (
          <li key={i}><Icon name="messages" size={14} />
            <button type="button" className="btn ghost truncate" style={{ flex: 1, justifyContent: 'flex-start', padding: 0, height: 'auto', fontWeight: 500 }} onClick={() => go(`logs/${r.conversation_id}`)}>{r.content}</button>
            <span className="faint" style={{ fontSize: 12 }}>{ago(r.created_at)}</span></li>))}</ul>}
      </section>
    </div>
  );
}

type KbEdit = { id?: string; kind: string; title: string; body: string; enabled: boolean; question?: string };
// Gemini's free quota per model: counted from this site's own requests, with each daily limit learned
// from Google's refusal. Google offers no API for the remaining count, so this is the closest view.
function QuotaCard({ quota }: { quota: { day: string; resetsAt: string; models: { model: string; used: number; failures: number; limit: number | null; left: number | null; exhausted: boolean; limitLearnedToday: boolean }[] } }){
  const reset = new Date(quota.resetsAt);
  const inIst = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(reset);
  const mins = Math.max(0, Math.round((reset.getTime() - Date.now()) / 60e3));
  const inText = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  const usable = quota.models.filter(m => !m.exhausted).length;
  return (
    <section className="card stack" aria-labelledby="q-h">
      <h3 id="q-h"><span className="grow">Gemini free quota today</span>
        {usable ? <Badge tone="success">{usable} of {quota.models.length} models available</Badge> : <Badge tone="danger">all used up</Badge>}</h3>
      <p className="faint" style={{ marginTop: -6, fontSize: 12 }}>Resets at {inIst} India time (in {inText}). The assistant uses the first model with quota left, top to bottom.</p>
      <ul className="quota-list">{quota.models.map((m, i) => {
        const pct = m.limit ? Math.min(100, (m.used / m.limit) * 100) : 0;
        return (
          <li key={m.model}>
            <span className="quota-rank faint num">{i + 1}</span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className="row between" style={{ gap: 8 }}><span className="mono truncate">{m.model}</span>
                <span className="num" style={{ whiteSpace: 'nowrap' }}>{m.exhausted ? <Badge tone="danger">used up</Badge>
                  : m.limit !== null ? <><b>{m.left}</b> <span className="faint">left of {m.limit}</span></> : <><b>{m.used}</b> <span className="faint">used · limit not reached yet</span></>}</span></span>
              <span className="meter" aria-hidden="true"><i style={{ width: `${m.exhausted ? 100 : pct}%`, background: m.exhausted ? 'var(--danger)' : pct > 80 ? 'var(--warning)' : undefined }} /></span>
            </span>
          </li>
        );
      })}</ul>
      <p className="field-hint">Counts this website’s requests. Google shows each model’s limit only once it’s reached, so “limit not reached yet” means plenty is left. If you use the same API key elsewhere, Google’s total is higher: see the exact numbers at <a href="https://aistudio.google.com/usage" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.</p>
    </section>
  );
}

function Knowledge({ go }: { go: (r: string) => void }){
  const s = useLoad<{ sources: { id: string; kind: string; title: string; body: string; enabled: boolean; updated_at: string; chunks: number }[] }>('/assistant/kb');
  const [edit, setEditState] = useState<KbEdit | null>(null);
  const [start, setStart] = useState('');
  const [q, setQ] = useState('');
  const toast = useToast();
  const confirm = useConfirm();
  const setEdit = (e: KbEdit | null) => { setEditState(e); setStart(e ? JSON.stringify(e) : ''); };
  const dirty = !!edit && JSON.stringify(edit) !== start;
  useUnsavedGuard(dirty);
  // arriving from "Teach it" on a conversation: open a pre-filled FAQ entry
  useEffect(() => {
    const t = handoff.teach; if (!t) return;
    handoff.teach = undefined;
    setEdit({ kind: 'faq', title: t.question.slice(0, 120), body: `Q: ${t.question}\nA: `, enabled: true, question: t.question });
  }, []);
  const close = async () => { if (!dirty || await confirm({ title: 'Discard this text?', body: 'It hasn’t been saved.', confirm: 'Discard', danger: true })) setEdit(null); };
  const save = async () => {
    const e = edit!;
    s.setData(e.id ? await put(`/assistant/kb/${e.id}`, e) : await post('/assistant/kb', e));
    setEdit(null);
    toast.show('Saved. The assistant uses it from the next question.', { tone: 'success', ms: 7000,
      action: e.question ? { label: 'Ask it again', run: () => { handoff.ask = e.question; go('playground'); } } : { label: 'Try it', run: () => go('playground') } });
  };
  const list = (s.data?.sources || []).filter(k => !q || `${k.title} ${k.body}`.toLowerCase().includes(q.toLowerCase()));
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  return (
    <div className="app-main">
      <div className="row between"><p className="muted" style={{ maxWidth: 620 }}>Write what the assistant should know: who you are, how you work, FAQs, turnaround times. Your published products, tips, portfolio titles and policies are added automatically.</p>
        <button type="button" className="btn primary" onClick={() => setEdit({ kind: 'text', title: '', body: '', enabled: true })}><Icon name="plus" /> Add knowledge</button></div>
      <div className="kb-tips card">
        <b>Training it well</b>
        <ol>
          <li>Read <button type="button" className="btn ghost sm" onClick={() => go('logs')}>Conversations</button> and press <b>Teach it</b> under any weak answer.</li>
          <li>Write the fact the way you’d say it to a customer, one topic per paragraph.</li>
          <li>Ask the same question in the <button type="button" className="btn ghost sm" onClick={() => go('playground')}>Playground</button> to check the new answer.</li>
        </ol>
      </div>
      {(s.data?.sources.length || 0) > 3 && <SearchBox value={q} onChange={setQ} placeholder="Search what it knows" label="Search knowledge" style={{ maxWidth: 360 }} />}
      {!s.data ? <SkeletonRows rows={4} /> : !s.data.sources.length ? <Empty icon="assistant" title="Nothing written yet">Start with a short “About me” and your most common questions.</Empty> : !list.length ? <Empty icon="search" title="No matches" /> : (
        <ul className="kb-list">{list.map(k => (
          <li key={k.id} className={k.enabled ? '' : 'off'}>
            <button type="button" className="kb-item" onClick={() => setEdit({ id: k.id, kind: k.kind, title: k.title, body: k.body, enabled: k.enabled })}>
              <span className="row" style={{ gap: 6 }}><b>{k.title}</b><Badge>{k.kind}</Badge>{!k.enabled && <Badge tone="warning">off</Badge>}{/PLACEHOLDER|\[.+?\]/.test(k.body) && <Badge tone="danger">has blanks</Badge>}</span>
              <span className="faint truncate">{k.body.slice(0, 160) || 'Empty'}</span>
              <span className="faint" style={{ fontSize: 12 }}>{k.chunks} piece{k.chunks === 1 ? '' : 's'} · updated {ago(k.updated_at)}</span>
            </button>
          </li>
        ))}</ul>
      )}
      {edit && (
        <Modal wide title={edit.question ? 'Teach the assistant' : edit.id ? 'Edit knowledge' : 'Add knowledge'} onClose={() => void close()} footer={<>
          {edit.id && <AsyncButton className="btn ghost" onClick={async () => { if (await confirm({ title: `Delete “${edit.title}”?`, confirm: 'Delete', danger: true })){ s.setData(await del(`/assistant/kb/${edit.id}`)); setEdit(null); } }}><Icon name="trash" /> Delete</AsyncButton>}
          <span className="grow" />
          <button type="button" className="btn" onClick={() => void close()}>Cancel</button>
          <AsyncButton className="btn primary" disabled={!edit.title.trim() || !edit.body.trim() || /\nA:\s*$/.test(edit.body)} onClick={save}>Save</AsyncButton>
        </>}>
          {edit.question && <p className="notice"><Icon name="info" /> <span>Someone asked: <b>“{edit.question}”</b>. Write the answer after <span className="mono">A:</span> the way you’d want it said.</span></p>}
          <div className="form-grid">
            <Field label="Title"><input value={edit.title} onChange={e => setEditState({ ...edit, title: e.target.value })} maxLength={120} autoFocus={!edit.question} placeholder="e.g. Commissions and turnaround" /></Field>
            <Field label="Type"><Segmented label="Type" value={edit.kind} onChange={v => setEditState({ ...edit, kind: v })} options={[{ value: 'text', label: 'About' }, { value: 'faq', label: 'FAQ' }, { value: 'document', label: 'Document' }]} /></Field>
          </div>
          <Field label="Text" hint={edit.kind === 'faq' ? 'One question and answer per paragraph: “Q: …” on one line, “A: …” on the next, then a blank line.' : 'Plain facts work best. Leave blank lines between topics; each paragraph is searched separately.'}>
            <textarea rows={14} value={edit.body} onChange={e => setEditState({ ...edit, body: e.target.value })} autoFocus={!!edit.question}
              onFocus={e => { if (edit.question){ const n = e.currentTarget.value.length; e.currentTarget.setSelectionRange(n, n); } }} /></Field>
          <div className="row between"><Switch checked={edit.enabled} onChange={v => setEditState({ ...edit, enabled: v })} label="The assistant may use this" />
            <span className="faint" style={{ fontSize: 12 }}>{edit.body.split(/\n\s*\n/).filter(x => x.trim()).length} searchable piece(s)</span></div>
        </Modal>
      )}
    </div>
  );
}

function Logs({ id, go }: { id?: string; go: (r: string) => void }){
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const narrow = useMedia('(max-width: 760px)');
  const [aud, setAud] = useState<'all' | 'visitor' | 'buyer' | 'playground'>('all');
  const s = useLoad<{ conversations: any[] }>(`/assistant/conversations?${new URLSearchParams({ q: dq, ...(aud !== 'all' ? { audience: aud } : {}) })}`);
  const c = useLoad<{ conversation: any; messages: any[] }>(id ? `/assistant/conversations/${id}` : null);
  const toast = useToast();
  const confirm = useConfirm();
  const rate = async (mid: number, rating: number) => {
    c.setData(d => d ? { ...d, messages: d.messages.map(m => m.id === mid ? { ...m, rating } : m) } : d);
    try { await post(`/assistant/messages/${mid}/rate`, { rating }); } catch (e){ toast.error(e); c.reload(); }
  };
  const teach = (mid: number) => {
    const msgs = c.data!.messages, i = msgs.findIndex(m => m.id === mid);
    const question = [...msgs.slice(0, i)].reverse().find(m => m.role === 'user')?.content || '';
    handoff.teach = { question: question.slice(0, 500), answer: msgs[i]?.content };
    go('knowledge');
  };
  return (
    <div className={'msg-split' + (id ? ' has-open' : '')} style={{ flex: 1, minHeight: 0 }}>
      {(!narrow || !id) && <div className="msg-list">
        <div className="app-toolbar"><SearchBox value={q} onChange={setQ} placeholder="Search what people asked" label="Search conversations" style={{ maxWidth: 'none' }} />
          <select aria-label="Who" value={aud} onChange={e => setAud(e.target.value as typeof aud)} style={{ width: 'auto' }}><option value="all">Everyone</option><option value="visitor">Visitors</option><option value="buyer">Verified buyers</option><option value="playground">Playground</option></select></div>
        <div className="msg-scroll">
          {!s.data ? <div className="pad"><SkeletonRows rows={6} cols={2} /></div> : !s.data.conversations.length ? <Empty icon="messages" title="No conversations" /> : (
            <ul className="msg-items">{s.data.conversations.map(x => (
              <li key={x.id} className={x.id === id ? 'open' : ''}><button type="button" className="msg-item" onClick={() => go(`logs/${x.id}`)}>
                <span className="row between"><b className="truncate">{x.first_question || '(empty)'}</b><time className="faint">{ago(x.last_at)}</time></span>
                <span className="row" style={{ gap: 6 }}><Badge tone={x.audience === 'buyer' ? 'info' : x.audience === 'playground' ? 'warning' : 'neutral'}>{x.audience}</Badge><span className="faint" style={{ fontSize: 12 }}>{x.questions} question{x.questions === 1 ? '' : 's'} · {usd(x.cost_micros)}{x.country ? ` · ${x.country}` : ''}</span>{x.rating < 0 && <Badge tone="danger">👎</Badge>}</span>
              </button></li>
            ))}</ul>
          )}
        </div>
      </div>}
      {(!narrow || id) && <div className="msg-detail">
        {!id ? <Empty icon="messages" title="Pick a conversation">Read what people asked and how the assistant answered. Rate answers to spot what to add to the knowledge base.</Empty>
          : !c.data ? <SkeletonRows rows={6} /> : <>
            <div className="row between">{narrow && <button type="button" className="icon-btn" aria-label="Back to conversations" onClick={() => go('logs')}><Icon name="chevronLeft" /></button>}<div className="faint grow" style={{ fontSize: 12 }}>Started {dateTime(c.data.conversation.started_at)}{c.data.conversation.country ? ` · ${c.data.conversation.country}` : ''} · kept {90} days</div>
              <AsyncButton className="btn sm ghost" onClick={async () => { if (await confirm({ title: 'Delete this conversation?', confirm: 'Delete', danger: true })){ await del(`/assistant/conversations/${id}`); go('logs'); s.reload(); } }}><Icon name="trash" /></AsyncButton></div>
            <div className="chat-thread">{c.data.messages.map(m => (
              <div key={m.id} className={'chat-msg ' + m.role}>
                {m.role === 'assistant' && <img src={logo} alt="" width={24} height={24} className="ka-avatar" />}
                <div className="chat-bubble"><div className="chat-text">{m.content}</div>
                  {m.role === 'assistant' && <div className="chat-meta">
                    <span className="faint">{(m.sources || []).join(' · ') || 'no sources'} · {num(m.tokens_in)} in / {num(m.tokens_out)} out · {usd(m.cost_micros)}</span>
                    <span className="row" style={{ gap: 0 }}>
                      <button type="button" className={'icon-btn sm' + (m.rating === 1 ? ' star-on' : '')} aria-pressed={m.rating === 1} aria-label="Good answer" onClick={() => rate(m.id, m.rating === 1 ? 0 : 1)}>👍</button>
                      <button type="button" className={'icon-btn sm' + (m.rating === -1 ? ' star-on' : '')} aria-pressed={m.rating === -1} aria-label="Bad answer" onClick={() => rate(m.id, m.rating === -1 ? 0 : -1)}>👎</button>
                      <button type="button" className={'btn sm ' + (m.rating === -1 ? 'primary' : 'ghost')} onClick={() => teach(m.id)} title="Add what it should have said to its knowledge"><Icon name="sparkle" size={13} /> Teach it</button>
                    </span></div>}
                </div>
              </div>
            ))}</div>
          </>}
      </div>}
    </div>
  );
}

function Playground(){
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string; meta?: any }[]>([]);
  const [text, setText] = useState(() => { const a = handoff.ask || ''; handoff.ask = undefined; return a; });
  const [busy, setBusy] = useState(false);
  const [conv, setConv] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const toast = useToast();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  const send = async () => {
    const q = text.trim(); if (!q || busy) return;
    const next = [...msgs, { role: 'user' as const, content: q }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await post<any>('/assistant/playground', { messages: next.map(({ role, content }) => ({ role, content })), conversationId: conv });
      setConv(r.conversationId);
      setMsgs([...next, { role: 'assistant', content: r.reply, meta: r }]);
    } catch (e){ toast.error(e); setMsgs(msgs); setText(q); } finally { setBusy(false); }
  };
  return (
    <div className="playground">
      <div className="chat-thread" aria-live="polite">
        {!msgs.length && <Empty icon="sparkle" title="Try it like a visitor would">Everything runs for real: same rules, knowledge and model. It costs the same as a visitor’s question and counts toward today’s cap.</Empty>}
        {msgs.map((m, i) => (
          <div key={i} className={'chat-msg ' + m.role}>
            {m.role === 'assistant' && <img src={logo} alt="" width={24} height={24} className="ka-avatar" />}
            <div className="chat-bubble"><div className="chat-text">{m.content}</div>
              {m.meta && <div className="chat-meta"><span className="faint">{m.meta.sources.join(' · ')} · {num(m.meta.usage.in)} in / {num(m.meta.usage.out)} out · {usd(m.meta.cost)}{m.meta.handedOff ? ' · forwarded to inbox' : ''}</span></div>}</div>
          </div>
        ))}
        {busy && <div className="chat-msg assistant"><img src={logo} alt="" width={24} height={24} className="ka-avatar" /><div className="chat-bubble"><span className="typing-dots" aria-label="Thinking"><i /><i /><i /></span></div></div>}
        <div ref={end} />
      </div>
      <div className="chat-input">
        <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Ask something… (Enter to send, Shift+Enter for a new line)" aria-label="Message"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing){ e.preventDefault(); void send(); } }} />
        <div className="row">
          <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={send}><Icon name="send" /> Send</button>
          <AsyncButton className="btn ghost" disabled={!text.trim() && !msgs.length} onClick={async () => {
            const m = [...msgs.map(({ role, content }) => ({ role, content })), ...(text.trim() ? [{ role: 'user', content: text.trim() }] : [])];
            if (m.at(-1)?.role !== 'user') return toast.show('Type a question to preview the prompt for it.', { tone: 'error' });
            setPrompt((await post<{ system: string }>('/assistant/playground', { messages: m, preview: true })).system);
          }}><Icon name="eye" /> View prompt</AsyncButton>
          <button type="button" className="btn ghost" disabled={!msgs.length} onClick={() => { setMsgs([]); setConv(null); }}>New chat</button>
        </div>
      </div>
      {prompt && <Modal wide title="Exact prompt sent to the model" onClose={() => setPrompt(null)}><pre className="prompt-view">{prompt}</pre></Modal>}
    </div>
  );
}

function SettingsTab(){
  const s = useLoad<{ value: any; revision: number }>('/settings/assistant');
  const ov = useLoad<any>('/assistant');
  const [v, setV] = useDraft<any>(s.data?.value);
  const toast = useToast();
  const dirty = !!v && !!s.data && JSON.stringify(v) !== JSON.stringify(s.data.value);
  useUnsavedGuard(dirty);
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!v) return <div className="pad"><SkeletonRows rows={8} /></div>;
  return (
    <div className="app-main"><div className="stack-lg" style={{ maxWidth: 820 }}>
      <section className="card stack"><h3>On the site</h3>
        <Switch checked={v.enabled} onChange={x => setV({ ...v, enabled: x })} label="Assistant is on" />
        <Field label="Greeting"><input value={v.greeting} onChange={e => setV({ ...v, greeting: e.target.value })} maxLength={200} /></Field>
        <Field label="Suggested questions"><TagInput label="Suggested questions" value={v.suggestions} onChange={x => setV({ ...v, suggestions: x.slice(0, 5) })} max={5} placeholder="Type a question and press Enter" /></Field>
        <Field label="Personality" hint="How it talks. The hard rules below always apply."><textarea rows={3} value={v.persona} onChange={e => setV({ ...v, persona: e.target.value })} maxLength={1000} /></Field>
        <Field label="Language"><input value={v.languages} onChange={e => setV({ ...v, languages: e.target.value })} maxLength={300} /></Field>
      </section>
      <section className="card stack"><h3>What it may do</h3>
        <Switch checked={v.visitorRules.recommendProducts} onChange={x => setV({ ...v, visitorRules: { ...v.visitorRules, recommendProducts: x } })} label="Recommend products (uses live prices)" />
        <Switch checked={v.visitorRules.takeMessages} onChange={x => setV({ ...v, visitorRules: { ...v.visitorRules, takeMessages: x, collectLeads: x } })} label="Forward messages to your inbox when someone leaves an email and asks to be contacted" />
        <Switch checked={v.buyerRules.orderStatus} onChange={x => setV({ ...v, buyerRules: { ...v.buyerRules, orderStatus: x } })} label="Answer order questions after the buyer gives their order ID and matching email" />
      </section>
      <section className="card stack"><h3>Spending cap</h3>
        <Field label={`Daily cap: $${(v.dailyBudgetMicros / 1e6).toFixed(2)} (estimate)`} hint="When reached, the assistant tells visitors to use the Contact page until midnight India time, and you get one email.">
          <input type="range" min={0} max={5_000_000} step={50_000} value={v.dailyBudgetMicros} onChange={e => setV({ ...v, dailyBudgetMicros: Number(e.target.value) })} /></Field>
      </section>
      <section className="card stack"><h3><span className="grow">Your rules</span><span className="faint" style={{ fontSize: 12 }}>{(v.customRules || []).length}/20</span></h3>
        <p className="muted" style={{ marginTop: -6 }}>Your own instructions, like “Always mention that commissions start with a free call” or “Answer in a friendly, short way”. They apply to every answer, after the built-in safety rules below (those always win).</p>
        {(v.customRules || []).length === 0 && <p className="faint">No rules yet.</p>}
        {(v.customRules || []).map((r: string, i: number) => {
          const rules: string[] = v.customRules;
          const put = (next: string[]) => setV({ ...v, customRules: next });
          return (
            <div key={i} className="rule-row">
              <span className="faint num">{i + 1}.</span>
              <textarea aria-label={`Rule ${i + 1}`} rows={2} maxLength={200} value={r} onChange={e => put(rules.map((x, j) => j === i ? e.target.value : x))} placeholder="Write one clear instruction" />
              <div className="row" style={{ gap: 0 }}>
                <button type="button" className="icon-btn sm" aria-label="Move up" disabled={i === 0} onClick={() => { const n = [...rules]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; put(n); }}><Icon name="chevronDown" size={13} style={{ transform: 'rotate(180deg)' }} /></button>
                <button type="button" className="icon-btn sm" aria-label="Move down" disabled={i === rules.length - 1} onClick={() => { const n = [...rules]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; put(n); }}><Icon name="chevronDown" size={13} /></button>
                <button type="button" className="icon-btn sm" aria-label={`Delete rule ${i + 1}`} onClick={() => put(rules.filter((_, j) => j !== i))}><Icon name="trash" size={13} /></button>
              </div>
            </div>
          );
        })}
        <div><button type="button" className="btn sm" disabled={(v.customRules || []).length >= 20} onClick={() => setV({ ...v, customRules: [...(v.customRules || []), ''] })}><Icon name="plus" /> Add a rule</button></div>
        <p className="field-hint">Up to 200 characters each. Empty rules are dropped when you save. Test a new rule in the Playground.</p>
      </section>
      <div className="row sticky-save"><AsyncButton className="btn primary" disabled={!dirty} onClick={async () => { const r = await put<{ value: any; revision: number }>('/settings/assistant', { value: v, revision: s.data!.revision }); s.setData(r); setV(r.value); toast.show('Saved', { tone: 'success' }); }}>Save changes</AsyncButton>{dirty && <span className="faint" style={{ fontSize: 12 }}>Unsaved changes</span>}</div>
      <section className="card stack"><h3>Rules it can never break</h3>
        <p className="muted" style={{ marginTop: -6 }}>Built into the server, not editable here. Card numbers are blocked before reaching the AI, and answers are filtered for private emails and secret keys.</p>
        {ov.data ? <ol className="rules-list">{ov.data.rules.map((r: string, i: number) => <li key={i}>{r}</li>)}</ol> : <SkeletonRows rows={4} cols={1} />}
      </section>
    </div></div>
  );
}
