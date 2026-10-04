// Settings: account security (password, 2FA, sessions), store & tax, messages rules + blocklist,
// scheduled reports, categories, system status, backups, audit log, appearance.
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppProps } from './registry';
import { useDraft, useLoad, usePref, useUnsavedGuard } from '../hooks';
import { del, get, post, put } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Modal, Segmented, SkeletonRows, Switch, useConfirm, useToast, SearchBox } from '../ui';
import { Icon } from '../icons';
import { ago, bytes, dateTime } from '../format';
import { qrMatrix, qrPath } from '../qr';

type Sec = 'security' | 'team' | 'store' | 'messages' | 'reports' | 'categories' | 'system' | 'backups' | 'audit' | 'appearance';
const SECTIONS: [Sec, string, string][] = [['security', 'Account & security', 'shield'], ['team', 'Team', 'visitors'], ['store', 'Store & tax', 'products'], ['messages', 'Messages', 'messages'], ['reports', 'Email reports', 'reports'],
  ['categories', 'Categories', 'tag'], ['system', 'System status', 'info'], ['backups', 'Backups', 'archive'], ['audit', 'Activity log', 'list'], ['appearance', 'Appearance', 'studio']];

export default function Settings({ route, go }: AppProps){
  const me = useLoad<{ role: 'owner' | 'admin' }>('/account');
  const isOwner = me.data?.role === 'owner';
  const sections = SECTIONS.filter(s => s[0] !== 'team' || isOwner);   // only owners manage the team
  const sec: Sec = sections.some(s => s[0] === route) ? route as Sec : 'security';
  return (
    <div className="content-split">
      <nav className="folder-nav" aria-label="Settings sections">
        {sections.map(([k, l, ic]) => <button key={k} type="button" className={'folder-btn' + (k === sec ? ' on' : '')} aria-current={k === sec || undefined} onClick={() => go(k)}><Icon name={ic} size={14} /><span className="grow truncate">{l}</span></button>)}
      </nav>
      <div className="app-main"><div style={{ maxWidth: 820, width: '100%' }} className="stack-lg">
        {sec === 'security' ? <Security /> : sec === 'team' ? <Team /> : sec === 'store' ? <StoreSettings /> : sec === 'messages' ? <MessageSettings /> : sec === 'reports' ? <ReportSettings />
          : sec === 'categories' ? <Categories /> : sec === 'system' ? <System /> : sec === 'backups' ? <Backups /> : sec === 'audit' ? <Audit /> : <Appearance />}
      </div></div>
    </div>
  );
}

function Section({ title, children, desc }: { title: string; children: ReactNode; desc?: ReactNode }){
  return <section className="card stack"><h3>{title}</h3>{desc && <p className="muted" style={{ marginTop: -6 }}>{desc}</p>}{children}</section>;
}

// ---- settings documents (store / messages / reports) share one load/save pattern
function useSettingsDoc<T>(key: string){
  const s = useLoad<{ value: T; revision: number }>(`/settings/${key}`);
  const [v, setV] = useDraft<T>(s.data?.value);
  const toast = useToast();
  const dirty = !!v && !!s.data && JSON.stringify(v) !== JSON.stringify(s.data.value);
  useUnsavedGuard(dirty);
  const save = async () => {
    try { const r = await put<{ value: T; revision: number }>(`/settings/${key}`, { value: v, revision: s.data!.revision }); s.setData(r); setV(r.value); toast.show('Saved', { tone: 'success' }); }
    catch (e: any){
      // saved elsewhere meanwhile: load that version's revision, keep these edits on screen, and say so
      if (e.code === 'stale'){ await s.reload(); throw new Error('These settings were changed on another device. Your edits are still here: check them and save again.'); }
      throw e;
    }
  };
  return { s, v, setV, dirty, save };
}
function SaveRow({ dirty, save }: { dirty: boolean; save: () => Promise<void> }){
  return <div className="row sticky-save"><AsyncButton className="btn primary" disabled={!dirty} onClick={save}>Save changes</AsyncButton>{dirty && <span className="faint" style={{ fontSize: 12 }}>Unsaved changes</span>}</div>;
}

function Security(){
  const acct = useLoad<{ email: string; twoFactor: boolean; passwordChangedAt: string }>('/account');
  const sess = useLoad<{ sessions: any[] }>('/sessions');
  const toast = useToast();
  const confirm = useConfirm();
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState('');
  const [off, setOff] = useState({ password: '', code: '' });
  const qr = useMemo(() => setup ? qrPath(qrMatrix(setup.otpauth)) : null, [setup]);
  if (acct.error && !acct.data) return <ErrorState message={acct.error} retry={acct.reload} />;
  if (!acct.data) return <SkeletonRows rows={8} />;
  const a = acct.data;
  const mismatch = !!pw.again && pw.next !== pw.again;
  return <>
    <Section title="Password" desc={`Signed in as ${a.email}. Password last changed ${ago(a.passwordChangedAt)}.`}>
      <div className="form-grid">
        <Field label="Current password"><input type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></Field>
        <Field label="New password" hint="12+ characters. A short sentence works well."><input type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} minLength={12} /></Field>
        <Field label="New password again" error={mismatch ? 'The two new passwords don’t match.' : null}><input type="password" autoComplete="new-password" value={pw.again} onChange={e => setPw({ ...pw, again: e.target.value })} /></Field>
      </div>
      <div><AsyncButton className="btn primary" disabled={!pw.current || pw.next.length < 12 || pw.next !== pw.again} onClick={async () => { await post('/password', { current: pw.current, next: pw.next }); setPw({ current: '', next: '', again: '' }); toast.show('Password changed. Other devices were signed out.', { tone: 'success', ms: 6000 }); acct.reload(); sess.reload(); }}>Change password</AsyncButton></div>
    </Section>

    <Section title="Two-factor sign-in" desc="After your password, you also enter a 6-digit code from an authenticator app (Google Authenticator, 1Password, Authy…).">
      {a.twoFactor ? <>
        <div className="row"><Badge tone="success">On</Badge><span className="muted">Codes are required at every sign-in.</span></div>
        <div className="form-grid">
          <Field label="Password"><input type="password" autoComplete="current-password" value={off.password} onChange={e => setOff({ ...off, password: e.target.value })} /></Field>
          <Field label="Current code"><input inputMode="numeric" autoComplete="one-time-code" value={off.code} onChange={e => setOff({ ...off, code: e.target.value.replace(/\D/g, '').slice(0, 6) })} className="mono" /></Field>
        </div>
        <div><AsyncButton className="btn danger" disabled={!off.password || off.code.length !== 6} onClick={async () => { if (!(await confirm({ title: 'Turn off two-factor sign-in?', body: 'Your account will be protected by the password alone.', confirm: 'Turn off', danger: true }))) return; await post('/2fa/disable', off); setOff({ password: '', code: '' }); toast.show('Two-factor sign-in is off', { tone: 'success' }); acct.reload(); }}>Turn off</AsyncButton></div>
      </> : !setup ? (
        <div><AsyncButton className="btn primary" onClick={async () => setSetup(await post('/2fa/start'))}><Icon name="shield" /> Set up two-factor</AsyncButton></div>
      ) : (
        <div className="twofa">
          {qr && <svg className="qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR code for your authenticator app" shapeRendering="crispEdges"><rect width={qr.size} height={qr.size} fill="#fff" /><path d={qr.d} fill="#000" /></svg>}
          <div className="stack">
            <p>1. Scan the code with your authenticator app, or enter this key:</p>
            <code className="secret mono">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
            <p>2. Type the 6-digit code it shows:</p>
            <div className="row"><input inputMode="numeric" autoComplete="one-time-code" aria-label="6-digit code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mono code-input" style={{ maxWidth: 200 }} autoFocus />
              <AsyncButton className="btn primary" disabled={code.length !== 6} onClick={async () => { await post('/2fa/enable', { code }); setSetup(null); setCode(''); toast.show('Two-factor sign-in is on', { tone: 'success' }); acct.reload(); }}>Turn on</AsyncButton>
              <button type="button" className="btn ghost" onClick={() => { setSetup(null); setCode(''); }}>Cancel</button></div>
          </div>
        </div>
      )}
    </Section>

    <Section title="Signed-in devices" desc="Sessions end after 2 hours without activity, and always after 12 hours.">
      {!sess.data ? <SkeletonRows rows={3} /> : <ul className="list">{sess.data.sessions.map(x => (
        <li key={x.id}><Icon name={/mobile|tablet/i.test(x.device || '') ? 'messages' : 'grid'} /><span className="grow truncate"><b>{x.device || uaLabel(x.user_agent)}</b> <span className="faint">{[x.system, x.browser].filter(Boolean).join(' · ')}</span><span className="faint mono"> · {x.ip || '—'}</span></span>
          {x.current ? <Badge tone="accent">this device</Badge> : <span className="faint" style={{ fontSize: 12 }}>active {ago(x.last_seen_at)}</span>}
          {!x.current && <AsyncButton className="btn sm ghost" onClick={async () => { await del(`/sessions/${x.id}`); sess.reload(); toast.show('Signed out that device', { tone: 'success' }); }}>Sign out</AsyncButton>}</li>
      ))}</ul>}
      <div><AsyncButton className="btn" onClick={async () => { if (await confirm({ title: 'Sign out everywhere?', body: 'Every device, including this one, is signed out.', confirm: 'Sign out everywhere', danger: true })){ await post('/logout-everywhere'); location.reload(); } }}><Icon name="logout" /> Sign out everywhere</AsyncButton></div>
    </Section>
  </>;
}
// Percent edited as text so "12." and "12.5" can be typed; stored as basis points (1250 = 12.5%).
function PercentInput({ bp, onChange, label }: { bp: number; onChange: (bp: number) => void; label: string }){
  const [text, setText] = useState(() => String(bp / 100));
  useEffect(() => { if (Math.round((parseFloat(text) || 0) * 100) !== bp) setText(String(bp / 100)); }, [bp]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <input inputMode="decimal" aria-label={label} className="num" value={text}
    onChange={e => { const t = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'); setText(t); onChange(Math.min(10000, Math.round((parseFloat(t) || 0) * 100))); }}
    onBlur={() => setText(String(bp / 100))} />;
}
function uaLabel(ua: string | null){
  if (!ua) return 'Unknown device';
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const o = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return `${b}${o ? ' on ' + o : ''}`;
}

function StoreSettings(){
  const { s, v, setV, dirty, save } = useSettingsDoc<any>('store');
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!v) return <SkeletonRows rows={8} />;
  const set = (k: string, x: unknown) => setV({ ...v, [k]: x });
  return <>
    <Section title="Store">
      <Switch checked={v.enabled} onChange={x => set('enabled', x)} label="Store open (turn off to pause all new checkouts)" />
      <Switch checked={v.allowCouponStacking} onChange={x => set('allowCouponStacking', x)} label="Allow more than one discount code per order" />
      <Switch checked={v.showRatings !== false} onChange={x => set('showRatings', x)} label="Show star ratings and reviews in the store (only buyers can rate)" />
      <Switch checked={v.showDownloads !== false} onChange={x => set('showDownloads', x)} label="Show how many times each item was downloaded" />
      <Switch checked={v.international !== false} onChange={x => set('international', x)} label="Accept international payments (buyers outside India pay in USD with an international card)" />
      {v.international !== false && <p className="field-hint" style={{ margin: 0 }}>Razorpay only charges foreign cards once <b>International payments</b> is activated on your Razorpay account (Dashboard → Account &amp; Settings). Give every paid item a USD price too.</p>}
      {v.international === false && <p className="field-hint" style={{ margin: 0 }}>Everyone sees and pays prices in ₹ INR. Free downloads still work worldwide.</p>}
      <Field label={`Unpaid orders expire after ${v.orderExpiryMinutes} minutes`}><input type="range" min={10} max={120} step={5} value={v.orderExpiryMinutes} onChange={e => set('orderExpiryMinutes', Number(e.target.value))} /></Field>
    </Section>
    <Section title="Tax (GST)" desc="Check with your accountant before charging tax. Rates apply to the price after discounts.">
      <Switch checked={v.taxEnabled} onChange={x => set('taxEnabled', x)} label="Charge tax" />
      {v.taxEnabled && <div className="form-grid">
        <Field label="Label"><input value={v.taxLabel} onChange={e => set('taxLabel', e.target.value)} maxLength={20} /></Field>
        <Field label="Rate" hint="e.g. 18 or 12.5"><span className="input-affix"><span>%</span><PercentInput bp={v.taxRateBp} onChange={x => set('taxRateBp', x)} label="Tax rate" /></span></Field>
        <Field label="Prices"><Segmented label="Tax mode" value={v.taxInclusive ? 'in' : 'ex'} onChange={x => set('taxInclusive', x === 'in')} options={[{ value: 'in', label: 'Include tax' }, { value: 'ex', label: 'Tax added at checkout' }]} /></Field>
      </div>}
    </Section>
    <Section title="On invoices" desc="Shown on receipts and printable invoices.">
      <div className="form-grid">
        <Field label="Business name"><input value={v.sellerName} onChange={e => set('sellerName', e.target.value)} maxLength={120} /></Field>
        <Field label="Tax ID (GSTIN)" hint="Optional"><input value={v.sellerTaxId} onChange={e => set('sellerTaxId', e.target.value)} maxLength={30} className="mono" /></Field>
      </div>
      <Field label="Address"><textarea rows={3} value={v.sellerAddress} onChange={e => set('sellerAddress', e.target.value)} maxLength={400} /></Field>
    </Section>
    <SaveRow dirty={dirty} save={save} />
  </>;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function MessageSettings(){
  const { s, v, setV, dirty, save } = useSettingsDoc<any>('messages');
  const bl = useLoad<{ blocklist: { id: string; kind: string; value: string; created_at: string }[] }>('/blocklist');
  const [nb, setNb] = useState({ kind: 'email', value: '' });
  const toast = useToast();
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!v) return <SkeletonRows rows={8} />;
  const bh = v.businessHours, ar = v.autoReply;
  return <>
    <Section title="Notifications">
      <Field label="Send new-message alerts to" hint="Empty = your owner email"><input type="email" value={v.notifyEmail} onChange={e => setV({ ...v, notifyEmail: e.target.value })} /></Field>
      <Switch checked={v.spamFilter} onChange={x => setV({ ...v, spamFilter: x })} label="Send messages matching the blocklist to Spam" />
    </Section>
    <Section title="Auto-reply">
      <Switch checked={ar.enabled} onChange={x => setV({ ...v, autoReply: { ...ar, enabled: x } })} label="Reply automatically to every contact message" />
      {ar.enabled && <><Field label="Subject"><input value={ar.subject} onChange={e => setV({ ...v, autoReply: { ...ar, subject: e.target.value } })} maxLength={150} /></Field>
        <Field label="Message" hint="{{name}} and {{signature}} are filled in"><textarea rows={5} value={ar.body} onChange={e => setV({ ...v, autoReply: { ...ar, body: e.target.value } })} /></Field></>}
    </Section>
    <Section title="Business hours" desc="Outside these hours (India time), people get your away message instead.">
      <Switch checked={bh.enabled} onChange={x => setV({ ...v, businessHours: { ...bh, enabled: x } })} label="Use business hours" />
      {bh.enabled && <>
        <div className="row" role="group" aria-label="Working days">{DAYS.map((d, i) => (
          <button key={d} type="button" className={'chip-btn' + (bh.days.includes(i) ? ' on' : '')} aria-pressed={bh.days.includes(i)} onClick={() => setV({ ...v, businessHours: { ...bh, days: bh.days.includes(i) ? bh.days.filter((x: number) => x !== i) : [...bh.days, i].sort() } })}>{d}</button>
        ))}</div>
        <div className="form-grid">
          <Field label="From"><input type="time" value={bh.start} onChange={e => setV({ ...v, businessHours: { ...bh, start: e.target.value } })} /></Field>
          <Field label="To"><input type="time" value={bh.end} onChange={e => setV({ ...v, businessHours: { ...bh, end: e.target.value } })} /></Field>
        </div>
        <Field label="Away message"><textarea rows={3} value={bh.awayMessage} onChange={e => setV({ ...v, businessHours: { ...bh, awayMessage: e.target.value } })} /></Field>
      </>}
    </Section>
    <SaveRow dirty={dirty} save={save} />
    <Section title="Blocklist" desc="Messages from these go straight to Spam.">
      <div className="row">
        <select aria-label="Type" value={nb.kind} onChange={e => setNb({ ...nb, kind: e.target.value })} style={{ width: 'auto' }}><option value="email">Email</option><option value="domain">Domain</option><option value="ip">IP address</option><option value="keyword">Word</option></select>
        <input aria-label="Value" value={nb.value} onChange={e => setNb({ ...nb, value: e.target.value })} placeholder={nb.kind === 'domain' ? 'spam-site.com' : nb.kind === 'keyword' ? 'crypto' : ''} style={{ flex: 1, minWidth: 160 }} />
        <AsyncButton className="btn" disabled={!nb.value.trim()} onClick={async () => { bl.setData(await post('/blocklist', nb)); setNb({ ...nb, value: '' }); toast.show('Blocked', { tone: 'success' }); }}><Icon name="plus" /> Add</AsyncButton>
      </div>
      {!bl.data ? <SkeletonRows rows={2} /> : !bl.data.blocklist.length ? <p className="faint">Nothing blocked.</p> : (
        <ul className="list">{bl.data.blocklist.map(b => <li key={b.id}><Badge>{b.kind}</Badge><span className="grow mono truncate">{b.value}</span><span className="faint" style={{ fontSize: 12 }}>{ago(b.created_at)}</span>
          <AsyncButton className="icon-btn sm" title="Unblock" onClick={async () => { bl.setData(await del(`/blocklist/${b.id}`)); }}><Icon name="close" size={13} /></AsyncButton></li>)}</ul>
      )}
    </Section>
  </>;
}

function ReportSettings(){
  const { s, v, setV, dirty, save } = useSettingsDoc<any>('reports');
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!v) return <SkeletonRows rows={4} />;
  return <>
    <Section title="Email reports" desc="A short summary of sales, refunds and downloads, sent by the scheduled jobs.">
      <Switch checked={v.daily} onChange={x => setV({ ...v, daily: x })} label="Every morning (yesterday’s numbers)" />
      <Switch checked={v.weekly} onChange={x => setV({ ...v, weekly: x })} label="Every Monday (last 7 days)" />
      <Field label="Send to" hint="Empty = your owner email"><input type="email" value={v.email} onChange={e => setV({ ...v, email: e.target.value })} /></Field>
    </Section>
    <SaveRow dirty={dirty} save={save} />
  </>;
}

function Categories(){
  const s = useLoad<{ categories: { id: string; kind: string; name: string; slug: string; used: number }[] }>('/categories');
  const [n, setN] = useState({ kind: 'artifacts', name: '' });
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <SkeletonRows rows={6} />;
  return (
    <Section title="Categories" desc="Group items in the store and tips. Deleting a category keeps its items (they become uncategorised).">
      <div className="row">
        <select aria-label="Used for" value={n.kind} onChange={e => setN({ ...n, kind: e.target.value })} style={{ width: 'auto' }}><option value="artifacts">Artifacts</option><option value="artzz">Artzz</option><option value="tips">Tips</option></select>
        <input aria-label="Category name" value={n.name} onChange={e => setN({ ...n, name: e.target.value })} placeholder="New category" maxLength={60} style={{ flex: 1, minWidth: 160 }} />
        <AsyncButton className="btn" disabled={!n.name.trim()} onClick={async () => { s.setData(await post('/categories', n)); setN({ ...n, name: '' }); toast.show('Added', { tone: 'success' }); }}><Icon name="plus" /> Add</AsyncButton>
      </div>
      {(['artifacts', 'artzz', 'tips'] as const).map(kind => {
        const list = s.data!.categories.filter(c => c.kind === kind);
        const reorder = async (i: number, dir: -1 | 1) => {
          const to = i + dir; if (to < 0 || to >= list.length) return;
          const ids = list.map(x => x.id); [ids[i], ids[to]] = [ids[to], ids[i]];
          try { s.setData(await post('/categories/reorder', { kind, ids })); } catch (err) { toast.error(err); }
        };
        return <div key={kind}><div className="eyebrow" style={{ margin: '8px 0 4px' }}>{kind}</div>
          {!list.length ? <p className="faint">None yet.</p> : <ul className="list">{list.map(c => (
            <li key={c.id}>{edit?.id === c.id
              ? <input autoFocus aria-label="Rename category" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} onKeyDown={async e => { if (e.key === 'Enter'){ try { s.setData(await put(`/categories/${c.id}`, { name: edit.name, kind: c.kind })); setEdit(null); } catch (err){ toast.error(err); } } if (e.key === 'Escape') setEdit(null); }} style={{ flex: 1 }} />
              : <span className="grow">{c.name} <span className="faint">· {c.used} item{c.used === 1 ? '' : 's'}</span></span>}
              <button type="button" className="icon-btn sm" aria-label={`Move ${c.name} up`} disabled={list.indexOf(c) === 0} onClick={() => void reorder(list.indexOf(c), -1)}>↑</button>
              <button type="button" className="icon-btn sm" aria-label={`Move ${c.name} down`} disabled={list.indexOf(c) === list.length - 1} onClick={() => void reorder(list.indexOf(c), 1)}>↓</button>
              <button type="button" className="btn sm ghost" onClick={() => setEdit({ id: c.id, name: c.name })}>Rename</button>
              <AsyncButton className="icon-btn sm" title="Delete" onClick={async () => { if (await confirm({ title: `Delete “${c.name}”?`, body: c.used ? `${c.used} item(s) will become uncategorised.` : undefined, confirm: 'Delete', danger: true })) s.setData(await del(`/categories/${c.id}`)); }}><Icon name="trash" size={13} /></AsyncButton></li>
          ))}</ul>}</div>;
      })}
    </Section>
  );
}

function System(){
  const s = useLoad<any>('/system');
  const st = useLoad<any>('/system/storage');
  const toast = useToast();
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <SkeletonRows rows={10} />;
  const d = s.data;
  const pct = (a: number | null, b: number) => a === null ? 0 : Math.min(100, (a / b) * 100);
  return <>
    <Section title="Health">
      <dl className="kv">
        <dt>Environment</dt><dd>{d.production ? <Badge tone="success">production</Badge> : <Badge tone="warning">development</Badge>} on {d.host}{d.demoPayments && <> · <Badge tone="warning">demo payments</Badge></>}</dd>
        <dt>Database</dt><dd>responding in {d.database.ms} ms · {bytes(d.database.bytes)} of {bytes(d.database.limitBytes)}</dd>
        <dt>Keep-alive job</dt><dd>{d.lastHeartbeat ? `last ran ${ago(d.lastHeartbeat)}` : <span className="faint">hasn’t run yet (runs daily once deployed)</span>}</dd>
        <dt>Last backup</dt><dd>{d.lastBackup ? ago(d.lastBackup) : <span className="faint">none yet</span>}</dd>
        <dt>Emails failed (7 days)</dt><dd>{d.emailFailures7d ? <Badge tone="danger">{d.emailFailures7d}</Badge> : <Badge tone="success">0</Badge>}</dd>
      </dl>
      <div className="meter" aria-label="Database size"><i style={{ width: `${pct(d.database.bytes, d.database.limitBytes)}%` }} /></div>
    </Section>
    <Section title="Services" desc="Which features are configured. Only the setting names are shown here, never their values.">
      <ul className="list">{d.services.map((x: any) => (
        <li key={x.key}>{x.ok ? <Badge tone="success">ready</Badge> : x.required ? <Badge tone="danger">missing</Badge> : <Badge>optional</Badge>}<span className="grow">{x.label}</span>
          <span className="faint mono" style={{ fontSize: 11 }}>{x.vars.map((v: any) => `${v.set ? '✓' : '✗'} ${v.name}`).join('  ')}</span></li>
      ))}</ul>
      <div><AsyncButton className="btn" onClick={async () => { const r = await post<{ to: string }>('/system/test-email'); toast.show(`Test email sent to ${r.to}`, { tone: 'success' }); s.reload(); }}><Icon name="mail" /> Send a test email</AsyncButton></div>
    </Section>
    <Section title="File storage" desc="Supabase’s free plan includes 1 GB.">
      {!st.data ? <SkeletonRows rows={3} /> : Object.entries(st.data.buckets).map(([k, b]: [string, any]) => (
        <div key={k} className="stack" style={{ gap: 4 }}><div className="row between"><span>{k === 'media' ? 'Images & fonts (public)' : k === 'deliverables' ? 'Files for buyers (private)' : 'Backups (private)'}</span><span className="faint num">{b.error ? b.error : `${bytes(b.bytes)} · ${b.count} files`}</span></div>
          <div className="meter"><i style={{ width: `${pct(b.bytes, st.data.limitBytes)}%` }} /></div></div>
      ))}
    </Section>
    <Section title="Recent emails">
      {!d.email.length ? <p className="faint">No emails sent yet.</p> : <ul className="list">{d.email.map((e: any, i: number) => (
        <li key={i}><Badge tone={e.status === 'sent' ? 'success' : 'danger'}>{e.status}</Badge><span className="grow truncate">{e.subject}<span className="faint"> → {e.to_email}</span>{e.error && <span className="field-error"> · {e.error}</span>}</span><span className="faint" style={{ fontSize: 12 }}>{ago(e.created_at)}</span></li>
      ))}</ul>}
    </Section>
  </>;
}

function Backups(){
  const s = useLoad<{ backups: any[]; keep: number }>('/backups');
  const toast = useToast();
  const confirm = useConfirm();
  const [days, setDays] = useState('365');
  return <>
    <Section title="Backups" desc="Every Monday the whole database is exported to private storage. The newest ones are kept; download a copy now and then and keep it somewhere else too.">
      <div><AsyncButton className="btn primary" onClick={async () => { const r = await post<{ bytes: number }>('/backups'); toast.show(`Backup done (${bytes(r.bytes)})`, { tone: 'success' }); s.reload(); }}><Icon name="archive" /> Back up now</AsyncButton></div>
      {s.error && !s.data ? <ErrorState message={s.error} retry={s.reload} /> : !s.data ? <SkeletonRows rows={3} /> : !s.data.backups.length ? <p className="faint">No backups yet.</p> : (
        <ul className="list">{s.data.backups.map(b => (
          <li key={b.id}><Badge tone={b.status === 'ok' ? 'success' : 'danger'}>{b.status}</Badge><span className="grow">{dateTime(b.created_at)} <span className="faint">· {bytes(b.bytes)}</span>{b.error && <span className="field-error"> · {b.error}</span>}</span>
            {b.status === 'ok' && <AsyncButton className="btn sm" onClick={async () => { const r = await get<{ url: string }>(`/backups/${b.id}/link`); location.assign(r.url); }}><Icon name="downloads" /> Download</AsyncButton>}
            <AsyncButton className="icon-btn sm" title="Delete this backup" onClick={async () => {
              if (!(await confirm({ title: 'Delete this backup?', body: `The copy from ${dateTime(b.created_at)} is removed from storage. This can’t be undone.`, confirm: 'Delete', danger: true }))) return;
              s.setData(await del(`/backups/${b.id}`)); toast.show('Backup deleted', { tone: 'success' });
            }}><Icon name="trash" size={13} /></AsyncButton></li>
        ))}</ul>
      )}
      <p className="field-hint">Backups leave out passwords, 2FA keys and sign-in sessions. After restoring, create the owner account again with the setup code.</p>
    </Section>
    <Section title="Visitor data" desc="Delete visitor records older than a number of days (your privacy policy says how long you keep them).">
      <div className="row"><span>Delete visits older than</span><input inputMode="numeric" aria-label="Days" value={days} onChange={e => setDays(e.target.value.replace(/\D/g, ''))} style={{ width: 90 }} className="num" /><span>days</span>
        <AsyncButton className="btn" disabled={!days || Number(days) < 1} onClick={async () => { if (!(await confirm({ title: `Delete visits older than ${days} days?`, body: 'This can’t be undone.', confirm: 'Delete', danger: true }))) return; const r = await post<{ deleted: number }>('/visits/purge', { olderThanDays: Number(days) }); toast.show(`Deleted ${r.deleted} visit records`, { tone: 'success' }); }}>Delete</AsyncButton></div>
    </Section>
  </>;
}

function Audit(){
  const s = useLoad<{ entries: any[] }>('/audit?limit=300');
  const [q, setQ] = useState('');
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <SkeletonRows rows={10} />;
  const rows = s.data.entries.filter(e => !q || `${e.action} ${e.target || ''} ${e.actor || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section title="Activity log" desc="Sign-ins and every change made in the portal, newest first.">
      <SearchBox value={q} onChange={setQ} placeholder="Filter, e.g. login or coupon" label="Filter the log" />
      {!rows.length ? <Empty icon="list" title="Nothing matches" /> : <ul className="list">{rows.map(e => (
        <li key={e.id}><Badge tone={/failed|deleted|revoked|disabled|_off/.test(e.action) ? 'danger' : /login|owner/.test(e.action) ? 'info' : 'neutral'}>{e.action.replace(/_/g, ' ')}</Badge>
          <span className="grow truncate faint mono" style={{ fontSize: 12 }}>{e.target || ''}</span>{e.actor && <span className="faint" style={{ fontSize: 12 }} title="Who did it">{e.actor}</span>}<span className="faint mono" style={{ fontSize: 12 }}>{e.ip || ''}</span><span className="faint" style={{ fontSize: 12 }}>{dateTime(e.at)}</span></li>
      ))}</ul>}
    </Section>
  );
}

function Appearance(){
  const [theme, setTheme] = usePref<'system' | 'dark' | 'light'>('theme', 'system');
  const [accent, setAccent] = usePref<'ember' | 'crimson'>('accent', 'ember');
  const [tour, setTour] = usePref('tour.v1', false);
  return (
    <Section title="Appearance" desc="Only changes how the portal looks on this device.">
      <Field label="Theme"><Segmented label="Theme" value={theme} onChange={setTheme} options={[{ value: 'system', label: 'Match system' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></Field>
      <Field label="Accent"><div className="row">
        {(['ember', 'crimson'] as const).map(a => <button key={a} type="button" className={'accent-pick' + (accent === a ? ' on' : '')} aria-pressed={accent === a} onClick={() => setAccent(a)}><span style={{ background: a === 'ember' ? '#FF9438' : '#E0303E' }} />{a === 'ember' ? 'Ember' : 'Crimson'}</button>)}
      </div></Field>
      <div><button type="button" className="btn" disabled={!tour} onClick={() => { setTour(false); location.reload(); }}>Show the welcome tour again</button></div>
    </Section>
  );
}

// ---- Team (owners only) ------------------------------------------------------------------------
type Person = { id: string; email: string; name: string; role: 'owner' | 'admin'; twoFactor: boolean; mustChangePassword: boolean; disabledAt: string | null;
  createdAt: string; lockedUntil: string | null; lastSeenAt: string | null; activeSessions: number; you: boolean };
// 16 characters from letters and digits that can't be mistaken for each other (no 0/O, 1/l/I)
function tempPassword(){
  const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(r, x => a[x % a.length]).join('').replace(/(.{4})(?!$)/g, '$1-');
}
function Team(){
  const s = useLoad<{ people: Person[] }>('/team');
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Person | null>(null);
  const [reveal, setReveal] = useState<{ title: string; email: string; password: string } | null>(null);
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <SkeletonRows rows={5} />;
  const act = async (p: Person, fn: () => Promise<{ people: Person[] }>, done: string) => { s.setData(await fn()); toast.show(done, { tone: 'success' }); };
  return <>
    <Section title="Team" desc="People who can sign in to this portal. Owners can do everything, including managing this list; admins can use the whole portal except this page.">
      <div><button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" /> Add a person</button></div>
      <ul className="team-list">{s.data.people.map(p => (
        <li key={p.id} className={p.disabledAt ? 'is-off' : ''}>
          <span className="team-avatar" aria-hidden="true">{(p.name || p.email).slice(0, 1).toUpperCase()}</span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="row" style={{ gap: 6 }}><b className="truncate">{p.name || p.email.split('@')[0]}</b>
              <Badge tone={p.role === 'owner' ? 'accent' : 'neutral'}>{p.role}</Badge>
              {p.you && <Badge tone="info">you</Badge>}
              {p.disabledAt && <Badge tone="danger">access off</Badge>}
              {p.mustChangePassword && !p.disabledAt && <Badge tone="warning">hasn’t set a password yet</Badge>}
              {p.twoFactor && <Badge tone="success">2FA</Badge>}
              {p.lockedUntil && new Date(p.lockedUntil) > new Date() && <Badge tone="warning">locked out for now</Badge>}</span>
            <span className="faint truncate" style={{ fontSize: 12, display: 'block' }}>{p.email} · {p.lastSeenAt ? `active ${ago(p.lastSeenAt)}` : 'never signed in'}{p.activeSessions ? ` · ${p.activeSessions} device${p.activeSessions === 1 ? '' : 's'}` : ''}</span>
          </span>
          {!p.you && <span className="row team-actions" style={{ gap: 4 }}>
            <select aria-label={`Role for ${p.email}`} value={p.role} onChange={e => void act(p, () => put(`/team/${p.id}`, { role: e.target.value }), 'Role changed').catch(toast.error)} style={{ width: 'auto' }}>
              <option value="admin">Admin</option><option value="owner">Owner</option></select>
            <button type="button" className="btn sm ghost" onClick={() => setResetting(p)}>Reset password</button>
            {p.activeSessions > 0 && <AsyncButton className="btn sm ghost" onClick={() => act(p, () => post(`/team/${p.id}/sign-out`), `${p.email} was signed out everywhere`)}>Sign out</AsyncButton>}
            <AsyncButton className="btn sm ghost" onClick={async () => {
              if (!p.disabledAt && !(await confirm({ title: `Switch off ${p.email}?`, body: 'They’re signed out at once and can’t sign in until you switch them back on. Nothing they made is deleted.', confirm: 'Switch off', danger: true }))) return;
              await act(p, () => post(`/team/${p.id}/access`, { enabled: !!p.disabledAt }), p.disabledAt ? 'Access switched back on' : 'Access switched off');
            }}>{p.disabledAt ? 'Switch on' : 'Switch off'}</AsyncButton>
            <AsyncButton className="icon-btn sm" title={`Delete ${p.email}`} onClick={async () => {
              if (!(await confirm({ title: `Delete ${p.email}?`, body: 'Their account and every session are removed. The activity log keeps what they did.', confirm: 'Delete', danger: true, typeToConfirm: p.email }))) return;
              await act(p, () => del(`/team/${p.id}`), 'Removed from the team');
            }}><Icon name="trash" size={13} /></AsyncButton>
          </span>}
        </li>
      ))}</ul>
    </Section>
    {adding && <AddPerson onClose={() => setAdding(false)} onAdded={(d, email, password) => { s.setData(d); setAdding(false); setReveal({ title: 'Person added', email, password }); }} />}
    {resetting && <ResetPassword person={resetting} onClose={() => setResetting(null)} onDone={(d, password) => { s.setData(d); setReveal({ title: 'Password reset', email: resetting.email, password }); setResetting(null); }} />}
    {reveal && <Reveal {...reveal} onClose={() => setReveal(null)} />}
  </>;
}
function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }){
  return <span className="input-with-btn"><input className="mono" value={value} onChange={e => onChange(e.target.value)} aria-label="Temporary password" minLength={12} />
    <button type="button" className="icon-btn" title="Make a new one" aria-label="Generate a password" onClick={() => onChange(tempPassword())}><Icon name="refresh" /></button></span>;
}
(PasswordField as any).labelable = true;
function AddPerson({ onClose, onAdded }: { onClose: () => void; onAdded: (d: { people: Person[] }, email: string, password: string) => void }){
  const [f, setF] = useState({ name: '', email: '', role: 'admin' as 'admin' | 'owner', password: tempPassword() });
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) && f.password.length >= 12;
  return <Modal title="Add a person" onClose={onClose} footer={<>
    <button type="button" className="btn" onClick={onClose}>Cancel</button>
    <AsyncButton className="btn primary" disabled={!ok} onClick={async () => onAdded(await post('/team', { ...f, email: f.email.trim() }), f.email.trim().toLowerCase(), f.password)}>Add to the team</AsyncButton>
  </>}>
    <div className="form-grid">
      <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} maxLength={80} autoFocus placeholder="e.g. Asha" /></Field>
      <Field label="Email"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} maxLength={254} placeholder="name@example.com" /></Field>
    </div>
    <Field label="Role"><Segmented label="Role" value={f.role} onChange={v => setF({ ...f, role: v })} options={[{ value: 'admin', label: 'Admin' }, { value: 'owner', label: 'Owner' }]} /></Field>
    <p className="field-hint" style={{ marginTop: -6 }}>{f.role === 'owner' ? 'Owners can do everything, including adding and removing people.' : 'Admins can use the whole portal except the Team page.'}</p>
    <Field label="Temporary password" hint="They’ll choose their own the first time they sign in. At least 12 characters."><PasswordField value={f.password} onChange={v => setF({ ...f, password: v })} /></Field>
  </Modal>;
}
function ResetPassword({ person, onClose, onDone }: { person: Person; onClose: () => void; onDone: (d: { people: Person[] }, password: string) => void }){
  const [password, setPassword] = useState(tempPassword());
  return <Modal title={`Reset the password for ${person.email}`} onClose={onClose} footer={<>
    <button type="button" className="btn" onClick={onClose}>Cancel</button>
    <AsyncButton className="btn primary" disabled={password.length < 12} onClick={async () => onDone(await post(`/team/${person.id}/password`, { password }), password)}>Reset password</AsyncButton>
  </>}>
    <p className="muted" style={{ marginTop: 0 }}>They’re signed out everywhere and must choose their own password with this temporary one.</p>
    <Field label="Temporary password"><PasswordField value={password} onChange={setPassword} /></Field>
  </Modal>;
}
function Reveal({ title, email, password, onClose }: { title: string; email: string; password: string; onClose: () => void }){
  const toast = useToast();
  const url = `${location.origin}/portal/`;
  const text = `KA Portal: ${url}\nEmail: ${email}\nTemporary password: ${password}\nYou'll choose your own password when you first sign in.`;
  return <Modal title={title} onClose={onClose} footer={<>
    <button type="button" className="btn" onClick={onClose}>Done</button>
    <button type="button" className="btn primary" onClick={async () => { try { await navigator.clipboard.writeText(text); toast.show('Sign-in details copied', { tone: 'success' }); } catch { toast.show('Copy isn’t allowed here: select the text instead', { tone: 'error' }); } }}><Icon name="copy" /> Copy sign-in details</button>
  </>}>
    <p className="muted" style={{ marginTop: 0 }}>Send these to them privately (not in a public chat). The password isn’t shown again.</p>
    <dl className="kv card"><dt>Portal</dt><dd className="mono">{url}</dd><dt>Email</dt><dd className="mono">{email}</dd><dt>Password</dt><dd className="mono" style={{ userSelect: 'all' }}>{password}</dd></dl>
  </Modal>;
}
