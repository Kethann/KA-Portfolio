// Visitors: overview (countries, devices, sources, pages, busiest hours), live now, and the raw log.
import { Fragment, useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useDebounced, useLoad, usePref } from '../hooks';
import { downloadFile, put } from '../api';
import { AsyncButton, Badge, Chart, Empty, ErrorState, Modal, Segmented, SkeletonRows, VirtualTable, useToast, SearchBox } from '../ui';
import type { Column } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { ago, dateTime, num, todayIST } from '../format';

const flag = (cc?: string | null) => cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐';
const regionName = (() => { try { const d = new Intl.DisplayNames(['en'], { type: 'region' }); return (cc: string) => { try { return d.of(cc) || cc; } catch { return cc; } }; } catch { return (cc: string) => cc; } })();
const dur = (ms: number) => !ms ? '—' : ms < 60e3 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60e3)}m ${Math.round((ms % 60e3) / 1000)}s`;

export default function Visitors({ route, go, active }: AppProps){
  const tab = route === 'live' ? 'live' : route === 'log' ? 'log' : 'overview';
  return (
    <div className="app">
      <div className="tabs" role="tablist" aria-label="Visitor views">
        {([['overview', 'Overview'], ['live', 'Live now'], ['log', 'Visit log']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go(k === 'overview' ? '' : k)}>{l}</button>)}
      </div>
      {tab === 'live' ? <Live active={active} /> : tab === 'log' ? <Log /> : <Overview active={active} />}
    </div>
  );
}

function Overview({ active }: { active: boolean }){
  const [range, setRange] = usePref<'7' | '30' | '90'>('visitors.range', '30');
  const from = todayIST(-(Number(range) - 1)), to = todayIST();
  const s = useLoad<any>(`/visitors?from=${from}&to=${to}`, { pollMs: 60e3, active });
  const d = s.data;
  const days = useMemo(() => { const out: string[] = []; const st = new Date(from + 'T00:00:00Z'); for (let i = 0; i < Number(range); i++){ const x = new Date(st); x.setUTCDate(x.getUTCDate() + i); out.push(x.toISOString().slice(0, 10)); } return out; }, [from, range]);
  if (s.error && !d) return <ErrorState message={s.error} retry={s.reload} />;
  return (
    <div className="app-main">
      <WinTools><Segmented label="Range" value={range} onChange={setRange} options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} /></WinTools>
      {!d ? <SkeletonRows rows={10} /> : <>
        <div className="kpis">
          <div className="kpi"><div className="kpi-label"><Icon name="visitors" size={13} />Visitors</div><div className="kpi-value">{num(d.totals.visitors)}</div><div className="kpi-sub">{num(d.totals.new_visitors)} new · {num(d.totals.returning)} returning</div></div>
          <div className="kpi"><div className="kpi-label"><Icon name="grid" size={13} />Visits</div><div className="kpi-value">{num(d.totals.sessions)}</div><div className="kpi-sub">{num(d.totals.views)} page views</div></div>
          <div className="kpi"><div className="kpi-label"><Icon name="calendar" size={13} />Time on page</div><div className="kpi-value">{dur(d.totals.avg_ms)}</div><div className="kpi-sub">average, when measured</div></div>
          <div className="kpi"><div className="kpi-label"><Icon name="shield" size={13} />Bots filtered</div><div className="kpi-value">{num(d.totals.bots)}</div><div className="kpi-sub">not counted above</div></div>
        </div>
        <section className="card"><h3>Visits per day</h3>
          {d.series.length ? <Chart labels={days} series={[{ name: 'Visits', values: days.map(x => d.series.find((r: any) => r.day === x)?.sessions || 0) }]} format={v => `${v} visits`} height={170} /> : <Empty icon="visitors" title="No visits in this range">Visits appear once the site is live and people drop by.</Empty>}
        </section>
        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))' }}>
          <Bars title="Countries" rows={d.countries.map((r: any) => ({ k: r.k === '—' ? 'Unknown' : `${flag(r.k)} ${regionName(r.k)}`, n: r.n }))} />
          <Bars title="Cities" rows={d.cities.map((r: any) => ({ k: `${flag(r.country)} ${r.k}`, n: r.n }))} />
          <Bars title="Where they came from" rows={d.referrers} />
          <Bars title="Pages" rows={d.paths.map((r: any) => ({ k: r.k.replace('/?page=', '').replace(/^\/$/, 'Home') || 'Home', n: r.n }))} />
          <Bars title="Devices" rows={d.devices.map((r: any) => ({ k: r.k === 'smarttv' ? 'TV' : r.k[0].toUpperCase() + r.k.slice(1), n: r.n }))} />
          <Bars title="Browsers" rows={d.browsers} />
          <Bars title="Systems" rows={d.oses} />
          <section className="card"><h3>Busiest hours (India time)</h3>
            <Chart kind="bar" labels={Array.from({ length: 24 }, (_, h) => `${h}:00`)} series={[{ name: 'Views', values: Array.from({ length: 24 }, (_, h) => d.hours.find((r: any) => r.h === h)?.n || 0) }]} height={130} />
          </section>
        </div>
      </>}
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: { k: string; n: number }[] }){
  const max = Math.max(1, ...rows.map(r => r.n));
  return (
    <section className="card"><h3>{title}</h3>
      {!rows.length ? <p className="faint">No data yet.</p> : <ul className="list bar-list">{rows.slice(0, 10).map((r, i) => (
        <li key={i + r.k}><span className="truncate">{r.k}</span><span className="num muted">{num(r.n)}</span><span className="bar" aria-hidden="true"><i style={{ width: `${(r.n / max) * 100}%` }} /></span></li>
      ))}</ul>}
    </section>
  );
}

function Live({ active }: { active: boolean }){
  const s = useLoad<{ live: any[]; count: number }>('/visitors/live', { pollMs: 10e3, active });
  if (s.error && !s.data) return <ErrorState message={s.error} retry={s.reload} />;
  if (!s.data) return <div className="pad"><SkeletonRows rows={6} /></div>;
  return (
    <div className="app-main">
      <div className="row"><span className={'live-dot' + (s.data.count ? ' on' : '')} /><b>{s.data.count} on the site now</b><span className="faint" style={{ fontSize: 12 }}>active in the last 5 minutes · refreshes every 10 s</span></div>
      {!s.data.live.length ? <Empty icon="visitors" title="Nobody right now">This updates by itself.</Empty> : (
        <ul className="list live-list" aria-live="polite">{s.data.live.map(v => (
          <li key={v.session_id}><span className="live-flag" aria-hidden="true">{flag(v.country)}</span>
            <span className="grow truncate"><b>{v.city || (v.country ? regionName(v.country) : 'Unknown place')}</b> <span className="faint">· {v.path.replace('/?page=', '') || 'home'}</span></span>
            <Badge>{[v.device_vendor, v.device_model].filter(Boolean).join(' ') || v.device_type || 'device'}</Badge><span className="faint p-hide-sm" style={{ fontSize: 12 }}>{[v.browser, v.os].filter(Boolean).join(' · ')}{v.referrer ? ` · from ${v.referrer.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}` : ''}</span>
            <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{ago(v.last_seen_at)}</span></li>
        ))}</ul>
      )}
    </div>
  );
}

function Log(){
  const [q, setQ] = useState('');
  const [bots, setBots] = useState<'exclude' | 'include' | 'only'>('exclude');
  const [open, setOpen] = useState<any>(null);
  const [markedOnly, setMarkedOnly] = useState(false);
  const dq = useDebounced(q, 300);
  const qs = new URLSearchParams({ limit: '1000', bots }); if (dq) qs.set('q', dq); if (markedOnly) qs.set('marked', '1');
  const s = useLoad<{ rows: any[]; hasMore: boolean }>(`/visitors/log?${qs}`);
  const toast = useToast();
  const cols: Column<any>[] = [
    { key: 'when', label: 'When', width: '120px', render: r => <span title={dateTime(r.visited_at)}>{ago(r.visited_at)}</span> },
    { key: 'where', label: 'Where', width: '1.3fr', render: r => <span className="truncate" title={[r.city, r.region, r.postal, r.isp].filter(Boolean).join(' · ')}>{flag(r.country)} {r.city ? `${r.city}${r.region ? ', ' + r.region : ''}` : r.country || 'Unknown'}</span> },
    { key: 'ip', label: 'IP', width: '1fr', render: r => <span className="mono truncate">{r.ip}</span> },
    { key: 'page', label: 'Page', width: '1fr', hideBelow: 720, render: r => <span className="truncate">{r.path}</span> },
    { key: 'dev', label: 'Device', width: '1.2fr', hideBelow: 880, render: r => <span className="truncate" title={[r.device_vendor, r.device_model, r.device_type, r.browser, r.os].filter(Boolean).join(' · ')}>{[r.device_vendor, r.device_model].filter(Boolean).join(' ') || r.device_type || 'Unknown'} · {r.browser || 'browser'} · {r.os || 'system'}</span> },
    { key: 'time', label: 'Time', width: '70px', align: 'right', hideBelow: 560, render: r => dur(r.duration_ms) },
    { key: 'bot', label: '', width: '64px', render: r => <span className="row" style={{ gap: 4 }}>{r.mark && <span title={`Marked: ${r.mark.label}${r.mark.note ? ' · ' + r.mark.note : ''}`} aria-label="Marked visitor" style={{ color: 'var(--accent, #ff9438)' }}>★</span>}{r.is_bot ? <Badge tone="warning">bot</Badge> : r.is_new ? <Badge tone="accent">new</Badge> : null}</span> }
  ];
  return (
    <div className="app" style={{ minHeight: 0, flex: 1 }}>
      <div className="app-toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="IP, city, page, browser…" label="Search the visit log" />
        <button type="button" className={'btn sm' + (markedOnly ? ' primary' : ' ghost')} aria-pressed={markedOnly} onClick={() => setMarkedOnly(m => !m)}>★ Marked</button>
        <Segmented label="Bots" value={bots} onChange={setBots} options={[{ value: 'exclude', label: 'People' }, { value: 'include', label: 'All' }, { value: 'only', label: 'Bots' }]} />
        <span className="grow" />
        <AsyncButton className="btn sm" onClick={async () => { await downloadFile(`/visitors.csv?${qs}`, `visitors-${todayIST()}.csv`); toast.show('CSV downloaded', { tone: 'success' }); }}><Icon name="downloads" /> CSV</AsyncButton>
      </div>
      <div className="app-main fill">
        {s.error && !s.data ? <ErrorState message={s.error} retry={s.reload} /> : !s.data ? <SkeletonRows rows={10} /> : (
          <VirtualTable label="Visit log" rows={s.data.rows} columns={cols} rowKey={r => String(r.id)} onOpen={setOpen} empty={<Empty icon="visitors" title="No visits match" />}
            footer={<span>{s.data.rows.length}{s.data.hasMore ? '+' : ''} visits · IP addresses are personal data: handle this list with care</span>} />
        )}
      </div>
      {open && (
        <Modal title="Visit details" onClose={() => setOpen(null)}>
          <dl className="kv">
            {[['Time', dateTime(open.visited_at)], ['Last seen', dateTime(open.last_seen_at)], ['Time on page', dur(open.duration_ms)], ['Page', open.path], ['Came from', open.referrer || 'Direct'],
              ['IP', open.ip], ['Location', [open.city, open.region, open.postal, open.country].filter(Boolean).join(', ') || 'Unknown'], ['Location source', open.geo_provider || 'platform / IP estimate'],
              ['Network', open.isp || '—'], ['Time zone', open.timezone || '—'], ['Language', open.language || '—'],
              ['Device', [open.device_type, open.device_vendor, open.device_model].filter(Boolean).join(' · ')], ['System', `${open.os || '—'} ${open.os_version || ''}`], ['Browser', `${open.browser || '—'} ${open.browser_version || ''}`],
              ['Screen', open.screen_w ? `${open.screen_w} × ${open.screen_h}` : '—'], ['Visitor', `${open.visitor_id}${open.is_new ? ' (first visit)' : ''}`], ['Bot', open.is_bot ? 'yes' : 'no']].map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd className={k === 'IP' || k === 'Visitor' ? 'mono' : ''}>{v}</dd></Fragment>)}
          </dl>
          <VisitorHistory visitorId={open.visitor_id} onChanged={s.reload} />
          {open.latitude != null && open.longitude != null && <section className="card stack" aria-label="Location map">
            <div className="row between"><b>{open.location_source === 'browser-consent' ? 'Visitor-shared location' : 'Approximate IP area'}</b>
              {open.location_accuracy && <Badge tone={open.location_source === 'browser-consent' ? 'success' : 'neutral'}>{open.location_accuracy >= 1000 ? `about ${(open.location_accuracy / 1000).toFixed(1)} km accuracy` : `about ${open.location_accuracy} m accuracy`}</Badge>}</div>
            <iframe title="Map showing approximate visitor location" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: 260, border: 0, borderRadius: 12 }}
              src={`https://www.openstreetmap.org/export/embed.html?marker=${open.latitude}%2C${open.longitude}&layer=mapnik`} />
            <p className="field-hint" style={{ margin: 0 }}><a href={`https://www.openstreetmap.org/?mlat=${open.latitude}&mlon=${open.longitude}#map=15/${open.latitude}/${open.longitude}`} target="_blank" rel="noopener noreferrer">Open map ?</a>
              {open.location_source === 'browser-consent' ? ' � shared by the visitor after a location permission prompt; coordinates are rounded.' : ' � estimated from the visitor�s internet connection; it may be inaccurate and cannot identify a street address.'}</p>
          </section>}          <details><summary className="faint">Raw user agent</summary><code className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>{open.user_agent}</code></details>
        </Modal>
      )}
    </div>
  );
}

// One visitor's earlier visits (same device), an engagement score, and a mark with a label and a note so they can be found again.
const LABELS: [string, string][] = [['follow-up', 'Follow up'], ['interested', 'Interested'], ['client', 'Client'], ['ignore', 'Ignore']];
function VisitorHistory({ visitorId, onChanged }: { visitorId: string; onChanged: () => void }){
  const h = useLoad<any>(`/visitors/history?v=${encodeURIComponent(visitorId)}`);
  const toast = useToast();
  const [label, setLabel] = useState('follow-up');
  const [note, setNote] = useState('');
  const [seen, setSeen] = useState<string | null>(null);
  const d = h.data;
  if (d && seen !== d.visitor){ setSeen(d.visitor); setLabel(d.mark?.label || 'follow-up'); setNote(d.mark?.note || ''); }
  const save = async (marked: boolean) => {
    try { await put('/visitors/mark', { visitorId, marked, label, note }); toast.show(marked ? 'Visitor marked' : 'Mark removed', { tone: 'success' }); await h.reload(); onChanged(); }
    catch (e) { toast.error(e); }
  };
  return (
    <section className="card stack" aria-label="Visitor history" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="row between"><b>This visitor’s history</b>{d && <Badge tone={d.score >= 60 ? 'success' : d.score >= 30 ? 'accent' : 'neutral'}>Engagement {d.score}/100</Badge>}</div>
      {h.error && !d ? <p className="field-error">{h.error}</p> : !d ? <SkeletonRows rows={3} /> : <>
        <p className="faint" style={{ margin: 0 }}>{d.total} visit{d.total === 1 ? '' : 's'} in {d.sessions} session{d.sessions === 1 ? '' : 's'} · first seen {dateTime(d.firstSeen)} · {d.minutes} min in total
          {d.places.length ? ` · ${d.places.join(' · ')}` : ''}{d.ips.length > 1 ? ` · ${d.ips.length} IP addresses` : ''}</p>
        {d.pages.length > 0 && <p className="faint" style={{ margin: 0 }}>Pages: {d.pages.map((p: any) => `${p.path} ×${p.n}`).join(', ')}</p>}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select aria-label="Mark as" value={label} onChange={e => setLabel(e.target.value)} style={{ width: 'auto' }}>{LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input aria-label="Note about this visitor" value={note} maxLength={300} placeholder="Note (optional)" onChange={e => setNote(e.target.value)} style={{ flex: '1 1 200px', minWidth: 140 }} />
          <AsyncButton className="btn sm primary" onClick={() => save(true)}>{d.mark ? 'Update mark' : '★ Mark visitor'}</AsyncButton>
          {d.mark && <AsyncButton className="btn sm ghost" onClick={() => save(false)}>Remove mark</AsyncButton>}
        </div>
        <ul className="list" style={{ maxHeight: 220, overflow: 'auto', margin: 0 }}>
          {d.visits.map((v: any) => (
            <li key={v.id} className="row" style={{ gap: 10 }}>
              <span className="faint" style={{ width: 120, flex: 'none' }} title={dateTime(v.visited_at)}>{ago(v.visited_at)}</span>
              <span className="truncate grow">{v.path}</span>
              <span className="faint truncate" style={{ maxWidth: 160 }}>{[v.city, v.country].filter(Boolean).join(', ')}</span>
              <span className="faint num" style={{ width: 56, textAlign: 'right' }}>{dur(v.duration_ms)}</span>
            </li>
          ))}
        </ul>
        {d.total > d.visits.length && <p className="field-hint" style={{ margin: 0 }}>Showing the latest {d.visits.length} of {d.total} visits.</p>}
      </>}
    </section>
  );
}
