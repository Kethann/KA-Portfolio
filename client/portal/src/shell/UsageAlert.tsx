// Free-plan storage warning: when file storage or the database passes 80% (95% = urgent), a popup says how full
// each one is, once a day ("Remind me tomorrow"). Only in the portal — the public site never shows it.
import { useEffect, useState } from 'react';
import { get } from '../api';
import { Modal } from '../ui';
import { useDesk } from './desk';

type Item = { key: string; label: string; used: number | null; limit: number; ratio: number | null };
type Report = { items: Item[]; level: 'ok' | 'warn' | 'critical'; measuredAt: string };
const SNOOZE = 'ka.portal.usageSnooze';
const size = (n: number) => n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${Math.round(n / 1024 ** 2)} MB`;

export function UsageAlert(){
  const desk = useDesk();
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      get<Report>('/usage').then(rep => {
        if (!alive || rep.level === 'ok') return;
        let snoozed = '';
        try { snoozed = localStorage.getItem(SNOOZE) || ''; } catch { /* private mode */ }
        if (snoozed === `${rep.level}:${new Date().toDateString()}`) return;
        setR(rep);
      }).catch(() => { /* never block the portal over this */ });
    }, 2500);   // after the desktop has settled
    return () => { alive = false; clearTimeout(t); };
  }, []);
  if (!r) return null;
  const close = (snooze: boolean) => {
    if (snooze){ try { localStorage.setItem(SNOOZE, `${r.level}:${new Date().toDateString()}`); } catch { /* private mode */ } }
    setR(null);
  };
  const critical = r.level === 'critical';
  return (
    <Modal title={critical ? 'Free storage is almost full' : 'Free storage is getting full'} onClose={() => close(true)}
      footer={<>
        <button type="button" className="btn ghost" onClick={() => close(true)}>Remind me tomorrow</button>
        <button type="button" className="btn primary" onClick={() => { close(true); desk.open('settings', 'system'); }}>Open System status</button>
      </>}>
      <p className="muted" style={{ margin: 0 }}>
        {critical ? 'Uploads will stop working when it is full. Free some space (old product files, unused images) or ask to add a second free storage.'
          : 'Nothing is wrong yet. This is an early warning so there is time to free space or add a second free storage.'}
      </p>
      <ul className="list" style={{ display: 'grid', gap: 12, padding: 0, margin: '8px 0 0', listStyle: 'none' }}>
        {r.items.filter(i => i.used !== null).map(i => {
          const pct = Math.min(100, Math.round((i.ratio || 0) * 100));
          const tone = (i.ratio || 0) >= 0.95 ? 'var(--danger)' : (i.ratio || 0) >= 0.8 ? 'var(--warning, #e8a33d)' : 'var(--success, #4caf7a)';
          return (
            <li key={i.key} style={{ display: 'grid', gap: 6 }}>
              <div className="row between"><b>{i.label}</b><span className="num">{size(i.used!)} of {size(i.limit)} · {pct}%</span></div>
              <span className="meter" style={{ height: 8 }}><i style={{ display: 'block', height: '100%', width: `${pct}%`, background: tone, borderRadius: 4 }} /></span>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
