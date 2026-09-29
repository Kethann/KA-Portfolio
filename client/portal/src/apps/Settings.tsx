// Settings: account security (password, 2FA, sessions), store & tax, messages rules + blocklist,
// scheduled reports, categories, system status, backups, audit log, appearance.
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppProps } from './registry';
import { useLoad, usePref } from '../hooks';
import { del, get, post, put } from '../api';
import { AsyncButton, Badge, Empty, ErrorState, Field, Segmented, SkeletonRows, Switch, useConfirm, useToast } from '../ui';
import { Icon } from '../icons';
import { ago, bytes, dateTime } from '../format';
import { qrMatrix, qrPath } from '../qr';

type Sec = 'security' | 'store' | 'messages' | 'reports' | 'categories' | 'system' | 'backups' | 'audit' | 'appearance';
const SECTIONS: [Sec, string, string][] = [['security', 'Account & security', 'shield'], ['store', 'Store & tax', 'products'], ['messages', 'Messages', 'messages'], ['reports', 'Email reports', 'reports'],
  ['categories', 'Categories', 'tag'], ['system', 'System status', 'info'], ['backups', 'Backups', 'archive'], ['audit', 'Activity log', 'list'], ['appearance', 'Appearance', 'studio']];

export default function Settings({ route, go }: AppProps){
  const sec: Sec = SECTIONS.some(s => s[0] === route) ? route as Sec : 'security';
  return (
    <div className="content-split">
      <nav className="folder-nav" aria-label="Settings sections">
        {SECTIONS.map(([k, l, ic]) => <button key={k} type="button" className={'folder-btn' + (k === sec ? ' on' : '')} aria-current={k === sec || undefined} onClick={() => go(k)}><Icon name={ic} size={14} /><span className="grow truncate">{l}</span></button>)}
      </nav>
      <div className="app-main"><div style={{ maxWidth: 820, width: '100%' }} className="stack-lg">
        {sec === 'security' ? <Security /> : sec === 'store' ? <StoreSettings /> : sec === 'messages' ? <MessageSettings /> : sec === 'reports' ? <ReportSettings />
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
  const [v, setV] = useState<T | null>(null);
  const toast = useToast();
  useEffect(() => { if (s.data) setV(s.data.value); }, [s.data]);
  const dirty = !!v && !!s.data && JSON.stringify(v) !== JSON.stringify(s.data.value);
  const save = async () => {
    try { const r = await put<{ value: T; revision: number }>(`/settings/${key}`, { value: v, revision: s.data!.revision }); s.setData(r); toast.show('Saved', { tone: 'success' }); }
    catch (e: any){ if (e.code === 'stale') s.reload(); throw e; }
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
        <li key={x.id}><Icon name={/Mobile|Android|iPhone/i.test(x.user_agent || '') ? 'messages' : 'grid'} /><span className="grow truncate">{uaLabel(x.user_agent)} <span className="faint mono">· {x.ip || '—'}</span></span>
          {x.current ? <Badge tone="accent">this device</Badge> : <span className="faint" style={{ fontSize: 12 }}>active {ago(x.last_seen_at)}</span>}
          {!x.current && <AsyncButton className="btn sm ghost" onClick={async () => { await del(`/sessions/${x.id}`); sess.reload(); toast.show('Signed out that device', { tone: 'success' }); }}>Sign out</AsyncButton>}</li>
      ))}</ul>}
      <div><AsyncButton className="btn" onClick={async () => { if (await confirm({ title: 'Sign out everywhere?', body: 'Every device, including this one, is signed out.', confirm: 'Sign out everywhere', danger: true })){ await post('/logout-everywhere'); location.reload(); } }}><Icon name="logout" /> Sign out everywhere</AsyncButton></div>
    </Section>
  </>;
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
      <Field label={`Unpaid orders expire after ${v.orderExpiryMinutes} minutes`}><input type="range" min={10} max={120} step={5} value={v.orderExpiryMinutes} onChange={e => set('orderExpiryMinutes', Number(e.target.value))} /></Field>
    </Section>
    <Section title="Tax (GST)" desc="Check with your accountant before charging tax. Rates apply to the price after discounts.">
      <Switch checked={v.taxEnabled} onChange={x => set('taxEnabled', x)} label="Charge tax" />
      {v.taxEnabled && <div className="form-grid">
        <Field label="Label"><input value={v.taxLabel} onChange={e => set('taxLabel', e.target.value)} maxLength={20} /></Field>
        <Field label="Rate" hint="e.g. 18"><span className="input-affix"><span>%</span><input inputMode="decimal" value={String(v.taxRateBp / 100)} onChange={e => set('taxRateBp', Math.round((parseFloat(e.target.value) || 0) * 100))} className="num" /></span></Field>
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
        return <div key={kind}><div className="eyebrow" style={{ margin: '8px 0 4px' }}>{kind}</div>
          {!list.length ? <p className="faint">None yet.</p> : <ul className="list">{list.map(c => (
            <li key={c.id}>{edit?.id === c.id
              ? <input autoFocus aria-label="Rename category" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} onKeyDown={async e => { if (e.key === 'Enter'){ try { s.setData(await put(`/categories/${c.id}`, { name: edit.name, kind: c.kind })); setEdit(null); } catch (err){ toast.error(err); } } if (e.key === 'Escape') setEdit(null); }} style={{ flex: 1 }} />
              : <span className="grow">{c.name} <span className="faint">· {c.used} item{c.used === 1 ? '' : 's'}</span></span>}
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
            {b.status === 'ok' && <AsyncButton className="btn sm" onClick={async () => { const r = await get<{ url: string }>(`/backups/${b.id}/link`); location.assign(r.url); }}><Icon name="downloads" /> Download</AsyncButton>}</li>
        ))}</ul>
      )}
      <p className="field-hint">Backups leave out passwords, 2FA keys and sign-in sessions. After restoring, create the owner account again with the setup code.</p>
    </Section>
    <Section title="Visitor data" desc="Delete visitor records older than a number of days (your privacy policy says how long you keep them).">
      <div className="row"><span>Delete visits older than</span><input inputMode="numeric" aria-label="Days" value={days} onChange={e => setDays(e.target.value.replace(/\D/g, ''))} style={{ width: 90 }} className="num" /><span>days</span>
        <AsyncButton className="btn" disabled={!days} onClick={async () => { if (!(await confirm({ title: `Delete visits older than ${days} days?`, body: 'This can’t be undone.', confirm: 'Delete', danger: true }))) return; const r = await post<{ deleted: number }>('/visits/purge', { olderThanDays: Number(days) }); toast.show(`Deleted ${r.deleted} visit records`, { tone: 'success' }); }}>Delete</AsyncButton></div>
    </Section>
  </>;
}

function Audit(){
  const s = useLoad<{ entries: any[] }>('/audit?limit=300');
  const [q, setQ] = useState('');
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <SkeletonRows rows={10} />;
  const rows = s.data.entries.filter(e => !q || `${e.action} ${e.target || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Section title="Activity log" desc="Sign-ins and every change made in the portal, newest first.">
      <input type="search" aria-label="Filter the log" placeholder="Filter, e.g. login or coupon" value={q} onChange={e => setQ(e.target.value)} />
      {!rows.length ? <Empty icon="list" title="Nothing matches" /> : <ul className="list">{rows.map(e => (
        <li key={e.id}><Badge tone={/failed|deleted|revoked|disabled|_off/.test(e.action) ? 'danger' : /login|owner/.test(e.action) ? 'info' : 'neutral'}>{e.action.replace(/_/g, ' ')}</Badge>
          <span className="grow truncate faint mono" style={{ fontSize: 12 }}>{e.target || ''}</span><span className="faint mono" style={{ fontSize: 12 }}>{e.ip || ''}</span><span className="faint" style={{ fontSize: 12 }}>{dateTime(e.at)}</span></li>
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
