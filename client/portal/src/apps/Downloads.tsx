// Downloads: every issued link (with revoke) and every download (who, when, where from).
import { useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad } from '../hooks';
import { post } from '../api';
import { Badge, Empty, ErrorState, SkeletonRows, STATUS_TONE, VirtualTable, useConfirm, useToast, SearchBox } from '../ui';
import type { Column } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { ago, dateTime } from '../format';

type Link = { id: string; channel: string; created_at: string; expires_at: string; max_downloads: number; download_count: number; revoked_at: string | null; title: string; public_id: string; email: string; order_id: string; state: string };
type Event = { created_at: string; ip: string | null; country: string | null; user_agent: string | null; title: string | null; public_id: string | null; email: string | null; order_id: string | null };

export default function Downloads({ active, open }: AppProps){
  const [tab, setTab] = useState<'events' | 'links'>('events');
  const [q, setQ] = useState('');
  const s = useLoad<{ events: Event[]; links: Link[] }>('/downloads?limit=500', { pollMs: 30e3, active });
  const toast = useToast();
  const confirm = useConfirm();
  const match = (x: { title?: string | null; email?: string | null; public_id?: string | null }) => !q || `${x.title} ${x.email} ${x.public_id}`.toLowerCase().includes(q.toLowerCase());
  const events = useMemo(() => (s.data?.events || []).filter(match), [s.data, q]);
  const links = useMemo(() => (s.data?.links || []).filter(match), [s.data, q]);
  const revoke = async (l: Link) => {
    if (!(await confirm({ title: 'Revoke this link?', body: `${l.title} for ${l.email} stops working immediately.`, confirm: 'Revoke', danger: true }))) return;
    const prev = s.data!;
    s.setData({ ...prev, links: prev.links.map(x => x.id === l.id ? { ...x, state: 'revoked', revoked_at: new Date().toISOString() } : x) });
    try { await post(`/links/${l.id}/revoke`); toast.show('Link revoked', { tone: 'success' }); } catch (e){ s.setData(prev); toast.error(e); }
  };
  const eventCols: Column<Event>[] = [
    { key: 'when', label: 'When', width: '130px', render: e => <span title={dateTime(e.created_at)}>{ago(e.created_at)}</span>, sort: (a, b) => a.created_at.localeCompare(b.created_at) },
    { key: 'what', label: 'File', width: '1.4fr', render: e => <span className="truncate">{e.title || '—'}</span> },
    { key: 'who', label: 'Buyer', width: '1.4fr', render: e => <span className="truncate">{e.email || '—'}</span> },
    { key: 'order', label: 'Order', width: '130px', hideBelow: 700, render: e => <span className="mono">{e.public_id}</span> },
    { key: 'from', label: 'From', width: '1fr', hideBelow: 860, render: e => <span className="mono faint truncate" title={e.user_agent || ''}>{e.ip || '—'}{e.country ? ` · ${e.country}` : ''}</span> }
  ];
  const linkCols: Column<Link>[] = [
    { key: 'state', label: 'Status', width: '96px', render: l => <Badge tone={STATUS_TONE[l.state]}>{l.state}</Badge>, sort: (a, b) => a.state.localeCompare(b.state) },
    { key: 'what', label: 'File', width: '1.4fr', render: l => <span className="truncate">{l.title}</span> },
    { key: 'who', label: 'Buyer', width: '1.4fr', render: l => <span className="truncate">{l.email}</span> },
    { key: 'used', label: 'Used', width: '70px', align: 'right', render: l => <span className="num">{l.download_count}/{l.max_downloads}</span> },
    { key: 'exp', label: 'Expires', width: '140px', hideBelow: 760, render: l => <span className="muted">{dateTime(l.expires_at)}</span>, sort: (a, b) => a.expires_at.localeCompare(b.expires_at) },
    { key: 'via', label: 'Sent by', width: '80px', hideBelow: 900, render: l => <span className="faint">{l.channel}</span> },
    { key: 'x', label: '', width: '76px', align: 'right', render: l => l.state === 'active' ? <button type="button" className="btn sm ghost" onClick={() => revoke(l)}>Revoke</button> : null }
  ];
  return (
    <div className="app">
      <WinTools><button type="button" className="icon-btn" aria-label="Refresh" onClick={s.reload}><Icon name="refresh" /></button></WinTools>
      <div className="tabs" role="tablist" aria-label="Downloads views">
        <button type="button" role="tab" aria-selected={tab === 'events'} onClick={() => setTab('events')}>Downloads {s.data ? `(${s.data.events.length})` : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'links'} onClick={() => setTab('links')}>Links {s.data ? `(${s.data.links.filter(l => l.state === 'active').length} active)` : ''}</button>
      </div>
      <div className="app-toolbar"><SearchBox value={q} onChange={setQ} placeholder="File, buyer or order" label="Search downloads" />
        <span className="faint" style={{ fontSize: 12 }}>Files are private; buyers only ever get short-lived links.</span></div>
      <div className="app-main fill" role="tabpanel">
        {s.error && !s.data ? <ErrorState message={s.error} retry={s.reload} /> : !s.data ? <SkeletonRows rows={8} /> : tab === 'events'
          ? <VirtualTable label="Downloads" rows={events} columns={eventCols} rowKey={e => e.created_at + (e.ip || '') + (e.public_id || '')} onOpen={e => e.order_id && open('orders', e.order_id)} empty={<Empty icon="downloads" title="No downloads yet" />} />
          : <VirtualTable label="Download links" rows={links} columns={linkCols} rowKey={l => l.id} onOpen={l => open('orders', l.order_id)} empty={<Empty icon="link" title="No links yet" />} />}
      </div>
    </div>
  );
}
