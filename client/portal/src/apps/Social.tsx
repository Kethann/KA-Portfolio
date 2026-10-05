// Social: write a post once (pictures, caption, hashtags), see how it reads on each network, check it against that
// network's limits, then save it as a draft, schedule it, send it now through your automation webhook, or copy it
// and post by hand. Posts stay in the list with their status and what happened on each network.
import { useEffect, useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad, useUnsavedGuard } from '../hooks';
import { del, post, put } from '../api';
import { Badge, Empty, ErrorState, Field, Modal, Segmented, SkeletonRows, Switch, AsyncButton, useConfirm, useToast, SearchBox } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { DateTimeInput, DetailHeader, Uploader, useSaveKey } from './common';
import { loadSite, thumb, useSite } from './siteDoc';
import { ago, dateTime } from '../format';
import { PLATFORMS, PLATFORM_IDS, POST_LIMITS, checkPost, composeText, parseTags, suggestTags, textLength, type PlatformId } from '../../../../shared/social.js';

type Media = { url: string; alt: string };
type Result = { state: string; via?: string; at?: string; note?: string };
type Status = 'draft' | 'scheduled' | 'sending' | 'posted' | 'failed';
type SocialPost = { id: string; title: string; caption: string; hashtags: string[]; media: Media[]; platforms: PlatformId[]; status: Status; scheduledAt: string | null; sentAt: string | null; results: Record<string, Result>; createdAt: string; updatedAt: string };
type Settings = { connected: boolean; host: string; defaultPlatforms: PlatformId[]; defaultHashtags: string[]; signature: string; lastTest: { ok: boolean; at: string; note: string } | null };
type HashSet = { id: string; name: string; tags: string[] };
type Index = { posts: SocialPost[]; counts: { all: number; draft: number; scheduled: number; posted: number; failed: number }; due: number; settings: Settings; hashtagSets: HashSet[]; popular: string[]; starterSets: { name: string; tags: string[] }[] };
type Draft = { title: string; caption: string; hashtags: string[]; media: Media[]; platforms: PlatformId[]; when: 'now' | 'later'; scheduledAt: string };

const TONE: Record<Status, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = { draft: 'neutral', scheduled: 'info', sending: 'warning', posted: 'success', failed: 'danger' };
const LABEL: Record<Status, string> = { draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending…', posted: 'Posted', failed: 'Failed' };
const pad = (n: number) => String(n).padStart(2, '0');
const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocal(d.toISOString()); };
const fromPost = (p: SocialPost): Draft => ({ title: p.title, caption: p.caption, hashtags: p.hashtags, media: p.media, platforms: p.platforms, when: p.scheduledAt ? 'later' : 'now', scheduledAt: toLocal(p.scheduledAt) });
const blank = (s?: Settings): Draft => ({ title: '', caption: '', hashtags: s?.defaultHashtags || [], media: [], platforms: s?.defaultPlatforms?.length ? s.defaultPlatforms : ['instagram'], when: 'now', scheduledAt: '' });
const body = (d: Draft, status: 'draft' | 'scheduled') => ({ title: d.title, caption: d.caption, hashtags: d.hashtags, media: d.media, platforms: d.platforms, status,
  scheduledAt: d.scheduledAt ? new Date(d.scheduledAt).toISOString() : null });

export default function Social({ route, go, active }: AppProps){
  const s = useLoad<Index>('/social');
  const [filter, setFilter] = useState<'all' | 'draft' | 'scheduled' | 'posted'>('all');
  const [q, setQ] = useState('');
  const [connect, setConnect] = useState(false);
  const toast = useToast();
  const data = s.data;
  const rows = useMemo(() => (data?.posts || []).filter(p => (filter === 'all' || (filter === 'scheduled' ? p.status === 'scheduled' || p.status === 'sending' : filter === 'draft' ? p.status === 'draft' || p.status === 'failed' : p.status === 'posted'))
    && (!q || (p.title + ' ' + p.caption + ' ' + p.hashtags.join(' ')).toLowerCase().includes(q.toLowerCase()))), [data, filter, q]);
  const upsert = (p: SocialPost) => s.setData(d => d ? { ...d, posts: d.posts.some(x => x.id === p.id) ? d.posts.map(x => x.id === p.id ? p : x) : [p, ...d.posts] } : d);
  const current = route && route !== 'new' ? data?.posts.find(p => p.id === route) || null : null;

  return (
    <div className="app">
      <WinTools>
        <button type="button" className={'btn sm' + (data?.settings.connected ? '' : ' ghost')} onClick={() => setConnect(true)}><Icon name="link" /> {data?.settings.connected ? 'Connected' : 'Connect'}</button>
        <button type="button" className="btn primary sm" onClick={() => go('new')}><Icon name="plus" /> New post</button>
      </WinTools>
      {s.error && !data ? <ErrorState message={s.error} retry={s.reload} /> : !data ? <div className="pad"><SkeletonRows rows={8} /></div> : (
        <div className={'social' + (route ? ' has-route' : '')}>
          <aside className="social-list" aria-label="Posts">
            <div className="social-filters">
              <Segmented label="Show" value={filter} onChange={setFilter} options={[
                { value: 'all', label: `All ${data.counts.all}` }, { value: 'draft', label: `Drafts ${data.counts.draft + data.counts.failed}` },
                { value: 'scheduled', label: `Scheduled ${data.counts.scheduled}` }, { value: 'posted', label: `Posted ${data.counts.posted}` }]} />
              <SearchBox value={q} onChange={setQ} placeholder="Search posts" label="Search posts" />
            </div>
            {data.due > 0 && <div className="social-due" role="status"><Icon name="bell" size={14} /> {data.due} post{data.due === 1 ? ' is' : 's are'} due{data.settings.connected ? ' and will go out within minutes' : ': open it and post by hand, or Connect to send automatically'}.</div>}
            {!rows.length ? <Empty icon="send" title={q || filter !== 'all' ? 'No posts here' : 'No posts yet'} action={!q && filter === 'all' && <button type="button" className="btn primary" onClick={() => go('new')}><Icon name="plus" /> Write the first post</button>}>
              Plan a picture, caption and hashtags once, then send it to your networks.</Empty> : (
              <ul className="social-rows">
                {rows.map(p => (
                  <li key={p.id}><button type="button" className={route === p.id ? 'on' : ''} onClick={() => go(p.id)}>
                    <span className="social-thumb">{p.media[0] ? <img src={p.media[0].url} alt="" loading="lazy" /> : <Icon name="image" size={20} />}</span>
                    <span className="social-row-text"><b className="truncate">{p.title || p.caption.split('\n')[0] || 'Untitled post'}</b>
                      <span className="faint truncate">{p.platforms.map(x => PLATFORMS[x].name).join(' · ') || 'No network yet'}</span>
                      <span className="row" style={{ gap: 6 }}><Badge tone={TONE[p.status]}>{LABEL[p.status]}</Badge>
                        <span className="faint" style={{ fontSize: 12 }}>{p.status === 'scheduled' && p.scheduledAt ? dateTime(p.scheduledAt) : p.status === 'posted' && p.sentAt ? ago(p.sentAt) : ago(p.updatedAt)}</span></span></span>
                  </button></li>
                ))}
              </ul>
            )}
          </aside>
          <section className="social-main">
            {!route ? <Empty icon="send" title="Pick a post, or start a new one">Write once, check it against each network, and post or schedule it from here.</Empty>
              : route !== 'new' && !current ? <ErrorState message="This post doesn’t exist any more." retry={() => go('')} />
              : <Composer key={route} post={current} data={data} active={active} go={go} onSaved={upsert}
                onDeleted={(id) => { s.setData(d => d ? { ...d, posts: d.posts.filter(x => x.id !== id) } : d); go(''); void s.reload(); }} reload={s.reload} />}
          </section>
        </div>
      )}
      {connect && data && <ConnectModal settings={data.settings} onClose={() => setConnect(false)} onSaved={(st) => { s.setData(d => d ? { ...d, settings: st } : d); toast.show('Saved', { tone: 'success' }); }} />}
    </div>
  );
}

// ---- the composer ------------------------------------------------------------------------------------
function Composer({ post: saved, data, active, go, onSaved, onDeleted, reload }: { post: SocialPost | null; data: Index; active: boolean; go: (r: string) => void; onSaved: (p: SocialPost) => void; onDeleted: (id: string) => void; reload: () => void }){
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Draft>(() => saved ? fromPost(saved) : blank(data.settings));
  const [base, setBase] = useState(() => JSON.stringify(saved ? fromPost(saved) : blank(data.settings)));
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PlatformId>(d.platforms[0] || 'instagram');
  const [picker, setPicker] = useState(false);
  const dirty = JSON.stringify(d) !== base;
  useUnsavedGuard(dirty);
  const locked = saved?.status === 'posted' || saved?.status === 'sending';
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(x => ({ ...x, [k]: v }));
  const issues = useMemo(() => checkPost(d), [d]);
  const errors = issues.filter(i => i.level === 'error');
  const connected = data.settings.connected;
  useEffect(() => { if (!d.platforms.includes(view) && d.platforms[0]) setView(d.platforms[0]); }, [d.platforms, view]);

  const apply = (p: SocialPost, msg: string) => { const f = fromPost(p); setD(f); setBase(JSON.stringify(f)); onSaved(p); toast.show(msg, { tone: 'success' }); };
  const save = async (status: 'draft' | 'scheduled') => {
    if (busy || locked) return;
    if (status === 'scheduled' && d.when !== 'later') return;
    setBusy(true);
    try {
      const payload = { ...body(d, status), updatedAt: saved?.updatedAt };
      const r = saved ? await put<{ post: SocialPost }>(`/social/posts/${saved.id}`, payload) : await post<{ post: SocialPost }>('/social/posts', payload);
      apply(r.post, status === 'scheduled' ? `Scheduled for ${dateTime(r.post.scheduledAt!)}` : 'Saved as a draft');
      if (!saved) go(r.post.id);
    } catch (e: any){ toast.error(e); } finally { setBusy(false); }
  };
  const sendNow = async () => {
    if (busy || locked) return;
    if (!connected){ toast.show('Connect your automation first (the Connect button), or copy the text and post by hand.', { tone: 'error' }); return; }
    if (errors.length){ toast.show(errors[0].message, { tone: 'error' }); return; }
    if (!(await confirm({ title: 'Send this post now?', body: `It goes to ${d.platforms.map(p => PLATFORMS[p].name).join(', ')} through your automation. You can’t unsend it from here.`, confirm: 'Send now' }))) return;
    setBusy(true);
    try {
      let id = saved?.id;
      const payload = { ...body(d, 'draft'), scheduledAt: null, updatedAt: saved?.updatedAt };
      const r = id ? await put<{ post: SocialPost }>(`/social/posts/${id}`, payload) : await post<{ post: SocialPost }>('/social/posts', payload);
      id = r.post.id;
      const sent = await post<{ post: SocialPost }>(`/social/posts/${id}/send`);
      apply(sent.post, sent.post.status === 'posted' ? 'Sent to your automation' : 'The send failed. Details are on the post.');
      if (!saved) go(id);
    } catch (e: any){ toast.error(e); } finally { setBusy(false); }
  };
  const mark = async (platform: PlatformId, done: boolean) => {
    if (!saved) return;
    try { const r = await post<{ post: SocialPost }>(`/social/posts/${saved.id}/mark`, { platform, done }); apply(r.post, done ? `Marked posted on ${PLATFORMS[platform].name}` : 'Marked as not posted'); }
    catch (e: any){ toast.error(e); }
  };
  useSaveKey(active, () => { if (!locked) void save('draft'); });

  const togglePlatform = (p: PlatformId) => set('platforms', d.platforms.includes(p) ? d.platforms.filter(x => x !== p) : [...d.platforms, p]);
  const text = (p: PlatformId) => composeText(d, p);
  const copy = async (p: PlatformId) => { try { await navigator.clipboard.writeText(text(p)); toast.show(`Text for ${PLATFORMS[p].name} copied`, { tone: 'success' }); } catch { toast.show('Copy failed. Select the text and copy it.', { tone: 'error' }); } };
  const open = (p: PlatformId) => {
    const t = encodeURIComponent(text(p));
    const first = d.media[0] ? new URL(d.media[0].url, location.origin).toString() : '';
    const u: Partial<Record<PlatformId, string>> = {
      x: `https://twitter.com/intent/tweet?text=${t}`, threads: `https://www.threads.net/intent/post?text=${t}`,
      linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${t}`, facebook: 'https://www.facebook.com/',
      instagram: 'https://www.instagram.com/', pinterest: `https://www.pinterest.com/pin/create/button/?media=${encodeURIComponent(first)}&description=${t}` };
    window.open(u[p], '_blank', 'noopener');
  };

  return (
    <div className="social-composer">
      <DetailHeader back={() => { if (!dirty) return go(''); void confirm({ title: 'Leave without saving?', confirm: 'Discard changes', danger: true }).then(ok => ok && go('')); }}
        title={d.title || (saved ? 'Post' : 'New post')} meta={saved ? <Badge tone={TONE[saved.status]}>{LABEL[saved.status]}</Badge> : <span className="faint">Not saved yet</span>}>
        {saved && <button type="button" className="btn sm ghost" onClick={async () => { try { const r = await post<{ post: SocialPost }>(`/social/posts/${saved.id}/duplicate`); onSaved(r.post); go(r.post.id); toast.show('Copied to a new draft', { tone: 'success' }); } catch (e: any){ toast.error(e); } }}>Duplicate</button>}
        {saved && <button type="button" className="btn sm ghost" onClick={async () => { if (await confirm({ title: 'Delete this post?', body: 'It is removed from the list. Anything already sent stays on the network.', confirm: 'Delete', danger: true })){ try { await del(`/social/posts/${saved.id}`); onDeleted(saved.id); toast.show('Deleted', { tone: 'success' }); } catch (e: any){ toast.error(e); } } }}><Icon name="trash" /> Delete</button>}
      </DetailHeader>

      {saved?.status === 'posted' && <div className="social-note ok" role="status"><Icon name="check" size={14} /> This post has been sent{saved.sentAt ? ` ${ago(saved.sentAt)}` : ''}. It can’t be edited. Duplicate it to post again.</div>}
      {saved?.status === 'failed' && <div className="social-note bad" role="alert"><Icon name="alert" size={14} /> The last send failed: {Object.values(saved.results).find(r => r.note)?.note || 'try again'}. Your post is kept; edit it or send again.</div>}

      <fieldset className="social-fieldset" disabled={locked}>
        <Field label="Networks" hint="Each network has its own limits. The counters below use them.">
          <div className="social-nets" role="group" aria-label="Networks">
            {PLATFORM_IDS.map(p => {
              const on = d.platforms.includes(p), len = textLength(text(p), p), over = len > PLATFORMS[p].limit;
              return <button key={p} type="button" aria-pressed={on} className={'social-net' + (on ? ' on' : '') + (on && over ? ' over' : '')} onClick={() => togglePlatform(p)}>
                <b>{PLATFORMS[p].name}</b>{on && <span className="num">{len}/{PLATFORMS[p].limit}</span>}</button>;
            })}
          </div>
        </Field>

        <div className="field"><span className="field-label">Pictures <span className="faint">({d.media.length}/{POST_LIMITS.media})</span></span>
          {d.media.length > 0 && <ul className="social-media">
            {d.media.map((m, i) => (
              <li key={m.url + i}>
                <img src={m.url} alt={m.alt || ''} />
                <input aria-label={`Description of picture ${i + 1}`} value={m.alt} maxLength={POST_LIMITS.alt} placeholder="Describe it (for screen readers)" onChange={e => set('media', d.media.map((x, j) => j === i ? { ...x, alt: e.target.value } : x))} />
                <span className="row" style={{ gap: 2 }}>
                  <button type="button" className="icon-btn sm" aria-label="Move earlier" disabled={i === 0} onClick={() => set('media', move(d.media, i, -1))}>←</button>
                  <button type="button" className="icon-btn sm" aria-label="Move later" disabled={i === d.media.length - 1} onClick={() => set('media', move(d.media, i, 1))}>→</button>
                  <button type="button" className="icon-btn sm" aria-label="Remove picture" onClick={() => set('media', d.media.filter((_, j) => j !== i))}><Icon name="trash" size={13} /></button>
                </span>
              </li>
            ))}
          </ul>}
          <div className="row" style={{ gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px' }}><Uploader kind="image" multiple accept="image/png,image/jpeg,image/webp,image/avif,image/gif" label="Add pictures"
              onUploaded={u => { if (u.publicUrl) setD(x => ({ ...x, media: [...x.media, { url: u.publicUrl!, alt: '' }].slice(0, POST_LIMITS.media) })); }}>PNG, JPG or WebP. Instagram prefers JPG or PNG.</Uploader></div>
            <button type="button" className="btn sm" onClick={() => setPicker(true)}><Icon name="image" /> From my portfolio</button>
          </div>
        </div>

        <Field label="Caption" hint={`${d.caption.length}/${POST_LIMITS.caption}`}>
          <textarea rows={7} value={d.caption} maxLength={POST_LIMITS.caption} placeholder="What is this post about?" onChange={e => set('caption', e.target.value)} />
        </Field>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {data.settings.signature && <button type="button" className="btn sm ghost" disabled={d.caption.includes(data.settings.signature)} onClick={() => set('caption', `${d.caption.replace(/\s+$/, '')}${d.caption ? '\n\n' : ''}${data.settings.signature}`)}>Add my signature</button>}
          <button type="button" className="btn sm ghost" disabled={!d.caption} onClick={() => set('caption', '')}>Clear caption</button>
        </div>

        <Hashtags d={d} data={data} set={set} reload={reload} />
      </fieldset>

      <section className="social-section"><div className="eyebrow">How it reads</div>
        {d.platforms.length ? <>
          <Segmented label="Preview network" value={view} onChange={setView} options={d.platforms.map(p => ({ value: p, label: PLATFORMS[p].name }))} />
          <Preview platform={view} text={text(view)} media={d.media} name="You" />
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn sm" onClick={() => void copy(view)}><Icon name="copy" /> Copy text for {PLATFORMS[view].name}</button>
            <button type="button" className="btn sm ghost" onClick={() => open(view)}><Icon name="external" /> Open {PLATFORMS[view].name}</button>
          </div>
        </> : <p className="faint">Choose a network above to see a preview.</p>}
      </section>

      {issues.length > 0 && <ul className="social-issues" aria-label="Checks">{issues.map((i, k) => <li key={k} className={i.level}><Icon name={i.level === 'error' ? 'alert' : 'info'} size={14} /> {i.message}</li>)}</ul>}

      {saved && saved.platforms.length > 0 && (saved.status === 'posted' || saved.status === 'failed' || Object.keys(saved.results).length > 0 || saved.status === 'draft' || saved.status === 'scheduled') && (
        <section className="social-section"><div className="eyebrow">Posted by hand?</div>
          <p className="field-hint" style={{ margin: 0 }}>Tick a network once you have posted there yourself. When every network is ticked, the post counts as posted.</p>
          <ul className="social-results">{saved.platforms.map(p => {
            const r = saved.results[p];
            return <li key={p}><span className="grow"><b>{PLATFORMS[p].name}</b> {r ? <Badge tone={r.state === 'failed' ? 'danger' : 'success'}>{r.state === 'failed' ? 'Failed' : r.via === 'manual' ? 'Posted by hand' : 'Sent'}</Badge> : <span className="faint">Not posted yet</span>}
              {r?.at && <span className="faint" style={{ fontSize: 12 }}> · {ago(r.at)}</span>}{r?.note && <span className="faint" style={{ fontSize: 12 }}> · {r.note}</span>}</span>
              <Switch checked={!!r && r.state !== 'failed'} onChange={v => void mark(p, v)} label={`Posted on ${PLATFORMS[p].name}`} disabled={saved.status === 'sending'} /></li>;
          })}</ul></section>
      )}

      {!locked && <section className="social-section social-when"><div className="eyebrow">When</div>
        <Segmented label="When to post" value={d.when} onChange={v => { set('when', v); if (v === 'later' && !d.scheduledAt) set('scheduledAt', tomorrow9()); }}
          options={[{ value: 'now', label: 'Now or later by hand' }, { value: 'later', label: 'Schedule a time' }]} />
        {d.when === 'later' && <Field label="Date and time" hint={connected ? 'Sent automatically through your automation (checked every few minutes).' : 'No automation connected: at that time it shows as due, and you post it by hand.'}>
          <DateTimeInput label="Post at" value={d.scheduledAt} min={toLocal(new Date().toISOString())} onChange={v => set('scheduledAt', v)} /></Field>}
        <div className="row social-actions">
          <AsyncButton className="btn" disabled={busy || (!dirty && !!saved && saved.status === 'draft')} onClick={() => save('draft')}>Save draft</AsyncButton>
          {d.when === 'later' && <AsyncButton className="btn primary" disabled={busy || !d.scheduledAt || errors.length > 0} onClick={() => save('scheduled')}>Schedule</AsyncButton>}
          {d.when === 'now' && <AsyncButton className="btn primary" disabled={busy || errors.length > 0} onClick={sendNow}><Icon name="send" /> {connected ? 'Send now' : 'Send now (connect first)'}</AsyncButton>}
          {dirty && <span className="faint" style={{ fontSize: 12 }}>Unsaved changes</span>}
        </div></section>}

      {picker && <PortfolioPicker onClose={() => setPicker(false)} taken={d.media.map(m => m.url)} onPick={(urls) => { setD(x => ({ ...x, media: [...x.media, ...urls.map(url => ({ url, alt: '' }))].slice(0, POST_LIMITS.media) })); setPicker(false); }} />}
    </div>
  );
}

function move<T>(list: T[], i: number, by: number){ const j = i + by; if (j < 0 || j >= list.length) return list; const c = [...list]; [c[i], c[j]] = [c[j], c[i]]; return c; }

// ---- hashtags: chips, saved sets, suggestions -------------------------------------------------------
function Hashtags({ d, data, set, reload }: { d: Draft; data: Index; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; reload: () => void }){
  const toast = useToast();
  const [text, setText] = useState('');
  const [naming, setNaming] = useState(false);
  const [setName, setSetName] = useState('');
  const add = (raw: string | string[]) => { const next = parseTags([...d.hashtags, ...(Array.isArray(raw) ? raw : [raw])]); set('hashtags', next); setText(''); };
  const suggestions = useMemo(() => suggestTags(d.caption, { used: d.hashtags, popular: data.popular, limit: 10 }), [d.caption, d.hashtags, data.popular]);
  const igMax = PLATFORMS.instagram.tags || 30;
  const saveSet = async () => {
    try { await post('/social/hashtag-sets', { name: setName, tags: d.hashtags }); toast.show(`Saved the set “${setName}”`, { tone: 'success' }); setNaming(false); setSetName(''); reload(); }
    catch (e: any){ toast.error(e); }
  };
  return (
    <div className="field"><span className="field-label">Hashtags <span className="faint">({d.hashtags.length}{d.platforms.includes('instagram') ? `/${igMax}` : ''})</span></span>
      <div className="tags-input social-tags" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}>
        {d.hashtags.map(t => <span key={t} className="chip">#{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => set('hashtags', d.hashtags.filter(x => x !== t))}><Icon name="close" size={11} /></button></span>)}
        <input aria-label="Add hashtags" value={text} placeholder={d.hashtags.length ? '' : 'Type a hashtag, press Enter or space'}
          onChange={e => { const v = e.target.value; if (/[\s,]$/.test(v)) add(v); else setText(v); }}
          onPaste={e => { const t = e.clipboardData.getData('text'); if (/[\s,#]/.test(t.trim())){ e.preventDefault(); add(t); } }}
          onKeyDown={e => { if (e.key === 'Enter'){ e.preventDefault(); add(text); } else if (e.key === 'Backspace' && !text && d.hashtags.length) set('hashtags', d.hashtags.slice(0, -1)); }} onBlur={() => text && add(text)} />
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        <select aria-label="Add a hashtag set" value="" onChange={e => { const v = e.target.value; if (!v) return; const all = [...data.hashtagSets.map(s => ({ k: 's' + s.id, tags: s.tags })), ...data.starterSets.map((s, i) => ({ k: 'p' + i, tags: s.tags }))]; const f = all.find(x => x.k === v); if (f) add(f.tags); }}>
          <option value="">Add a set…</option>
          {data.hashtagSets.length > 0 && <optgroup label="Your sets">{data.hashtagSets.map(s => <option key={s.id} value={'s' + s.id}>{s.name} ({s.tags.length})</option>)}</optgroup>}
          <optgroup label="Starter sets">{data.starterSets.map((s, i) => <option key={s.name} value={'p' + i}>{s.name} ({s.tags.length})</option>)}</optgroup>
        </select>
        {!naming ? <button type="button" className="btn sm ghost" disabled={!d.hashtags.length} onClick={() => setNaming(true)}>Save as a set</button>
          : <span className="row" style={{ gap: 6 }}><input aria-label="Set name" value={setName} maxLength={40} placeholder="Set name" autoFocus onChange={e => setSetName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void saveSet(); }} />
            <button type="button" className="btn sm" disabled={!setName.trim()} onClick={() => void saveSet()}>Save</button><button type="button" className="btn sm ghost" onClick={() => setNaming(false)}>Cancel</button></span>}
        <button type="button" className="btn sm ghost" disabled={!d.hashtags.length} onClick={async () => { try { await navigator.clipboard.writeText(d.hashtags.map(t => '#' + t).join(' ')); toast.show('Hashtags copied', { tone: 'success' }); } catch { toast.show('Copy failed.', { tone: 'error' }); } }}><Icon name="copy" /> Copy all</button>
        <button type="button" className="btn sm ghost" disabled={!d.hashtags.length} onClick={() => set('hashtags', [])}>Clear</button>
      </div>
      {suggestions.length > 0 && <div className="social-suggest"><span className="faint" style={{ fontSize: 12 }}>Suggestions:</span>
        {suggestions.map(t => <button key={t} type="button" className="chip add" onClick={() => add(t)}>+ #{t}</button>)}</div>}
    </div>
  );
}

// ---- preview ---------------------------------------------------------------------------------------
function Preview({ platform, text, media, name }: { platform: PlatformId; text: string; media: Media[]; name: string }){
  const P = PLATFORMS[platform];
  const fold = platform === 'instagram' ? 125 : platform === 'linkedin' ? 210 : platform === 'facebook' ? 480 : 600;   // roughly where "… more" cuts the text
  const shown = text.length > fold ? text.slice(0, fold).trimEnd() + '… more' : text;
  const len = textLength(text, platform), over = len > P.limit;
  return (
    <div className={`social-preview net-${platform}`} aria-label={`${P.name} preview`}>
      <div className="sp-head"><span className="sp-avatar" aria-hidden="true">K</span><span><b>{name}</b><span className="faint"> · {P.name}</span></span></div>
      {media[0] ? <div className={'sp-media' + (media.length > 1 ? ' multi' : '')}><img src={media[0].url} alt={media[0].alt || ''} />{media.length > 1 && <span className="sp-count">1/{media.length}</span>}</div>
        : P.needsImage ? <div className="sp-media empty"><Icon name="image" size={22} /> {P.name} needs a picture</div> : null}
      <p className="sp-text">{shown || <span className="faint">Your caption appears here.</span>}</p>
      <div className={'sp-foot' + (over ? ' over' : '')}><span className="num">{len}/{P.limit}</span>{over ? ` · ${len - P.limit} too long` : ' characters'}</div>
    </div>
  );
}

// ---- pick from the portfolio ------------------------------------------------------------------------
function PortfolioPicker({ onClose, onPick, taken }: { onClose: () => void; onPick: (urls: string[]) => void; taken: string[] }){
  const site = useSite();
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => { void loadSite(); }, []);
  const imgs = site.doc?.images || [];
  return (
    <Modal title="Pick from your portfolio" onClose={onClose} wide footer={<>
      <button type="button" className="btn" onClick={onClose}>Cancel</button>
      <button type="button" className="btn primary" disabled={!chosen.length} onClick={() => onPick(chosen)}>Add {chosen.length || ''} picture{chosen.length === 1 ? '' : 's'}</button></>}>
      {!site.doc ? <SkeletonRows rows={4} /> : !imgs.length ? <p className="faint">No portfolio images yet. Upload pictures with “Add pictures” instead.</p> : (
        <ul className="social-picker">
          {imgs.map(i => { const url = thumb(i, 1080), on = chosen.includes(url), dup = taken.includes(url);
            return <li key={i.id}><button type="button" aria-pressed={on} disabled={dup} className={on ? 'on' : ''} title={dup ? 'Already on this post' : i.title} onClick={() => setChosen(c => on ? c.filter(x => x !== url) : [...c, url])}>
              <img src={thumb(i, 480)} alt="" loading="lazy" /><span className="truncate">{i.title}</span>{on && <span className="sp-tick"><Icon name="check" size={12} /></span>}</button></li>; })}
        </ul>)}
    </Modal>
  );
}

// ---- connect your automation ------------------------------------------------------------------------
function ConnectModal({ settings, onClose, onSaved }: { settings: Settings; onClose: () => void; onSaved: (s: Settings) => void }){
  const toast = useToast();
  const confirm = useConfirm();
  const [url, setUrl] = useState('');
  const [defaults, setDefaults] = useState<PlatformId[]>(settings.defaultPlatforms);
  const [tags, setTags] = useState(settings.defaultHashtags.map(t => '#' + t).join(' '));
  const [sig, setSig] = useState(settings.signature);
  const [test, setTest] = useState<{ ok: boolean; note: string } | null>(null);
  const [live, setLive] = useState(settings);
  const save = async (extra: object = {}) => {
    const r = await put<{ settings: Settings }>('/social/settings', { defaultPlatforms: defaults, defaultHashtags: tags, signature: sig, ...(url.trim() ? { webhookUrl: url.trim() } : {}), ...extra });
    setLive(r.settings); onSaved(r.settings); setUrl(''); return r.settings;
  };
  return (
    <Modal title="Connect your accounts" onClose={onClose} wide footer={<><button type="button" className="btn" onClick={onClose}>Close</button>
      <AsyncButton className="btn primary" onClick={async () => { try { await save(); onClose(); } catch (e: any){ toast.error(e); } }}>Save</AsyncButton></>}>
      <div className="stack">
        <p className="field-hint" style={{ margin: 0 }}>Instagram, X, LinkedIn and the others only let apps post after a business review, and they need your passwords or keys. So this portal never holds those. Instead it hands each finished post to <b>your own automation</b> (Zapier, Make, n8n, Buffer through Zapier …), which is already logged in to your accounts and does the posting.</p>
        <ol className="social-steps">
          <li>In Zapier, Make or n8n, create a flow that starts with a <b>Webhook</b> (“Catch Hook”).</li>
          <li>Add steps that post to your networks, using the fields we send: <code>text.instagram</code>, <code>text.x</code> … (caption + hashtags, already sized per network), <code>media[0].url</code> (a picture link) and <code>platforms</code>.</li>
          <li>Paste the webhook link below, save, and press <b>Send a test</b>.</li>
        </ol>
        <Field label="Webhook link" hint={live.connected ? `Connected to ${live.host}. The link is stored encrypted and is never shown again. Paste a new one to replace it.` : 'Starts with https://. It works like a password: keep it private.'}>
          <input type="password" autoComplete="off" value={url} placeholder={live.connected ? '•••••••• (saved)' : 'https://hooks.zapier.com/hooks/catch/…'} onChange={e => setUrl(e.target.value)} />
        </Field>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <AsyncButton className="btn sm" disabled={!live.connected && !url.trim()} onClick={async () => { try { if (url.trim()) await save(); const r = await post<{ ok: boolean; note: string }>('/social/settings/test'); setTest(r); } catch (e: any){ toast.error(e); } }}>Send a test</AsyncButton>
          {live.connected && <button type="button" className="btn sm ghost" onClick={async () => { if (await confirm({ title: 'Disconnect?', body: 'Scheduled posts stay scheduled but are no longer sent automatically.', confirm: 'Disconnect', danger: true })){ try { await save({ clearWebhook: true }); setTest(null); } catch (e: any){ toast.error(e); } } }}>Disconnect</button>}
          {test && <Badge tone={test.ok ? 'success' : 'danger'}>{test.ok ? 'The webhook answered' : test.note}</Badge>}
          {!test && live.lastTest && <span className="faint" style={{ fontSize: 12 }}>Last test {live.lastTest.ok ? 'worked' : 'failed'} {ago(live.lastTest.at)}</span>}
        </div>
        <div className="eyebrow">Defaults for new posts</div>
        <Field label="Networks"><div className="social-nets">{PLATFORM_IDS.map(p => <button key={p} type="button" aria-pressed={defaults.includes(p)} className={'social-net' + (defaults.includes(p) ? ' on' : '')} onClick={() => setDefaults(x => x.includes(p) ? x.filter(y => y !== p) : [...x, p])}><b>{PLATFORMS[p].name}</b></button>)}</div></Field>
        <Field label="Hashtags I always use" hint="Added to every new post"><input value={tags} onChange={e => setTags(e.target.value)} placeholder="#kethanartzz #movieposter" /></Field>
        <Field label="Signature line" hint="One tap adds it to a caption (for example your website)"><textarea rows={2} value={sig} maxLength={300} onChange={e => setSig(e.target.value)} placeholder="More at kethan.pages.dev" /></Field>
      </div>
    </Modal>
  );
}

