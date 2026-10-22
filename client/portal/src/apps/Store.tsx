// Store: everything about the shop in one window. Left: open or close it (with the closed board and special access),
// payments & tax, categories. Right: the real Store page as visitors see it right now: the closed board while the store
// is closed, the live shop while it is open. It reloads by itself when the store opens or closes.
import { useEffect, useRef, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad } from '../hooks';
import { Badge, Segmented } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import StoreStatusPanel from './StoreStatus';
import { StoreSettings, Categories } from './Settings';

type Tab = 'status' | 'payments' | 'categories';
const TABS: [Tab, string][] = [['status', 'Open / closed & access'], ['payments', 'Payments & tax'], ['categories', 'Categories']];
const DEVICES = { desktop: { w: 1280, h: 860, label: 'Desktop' }, mobile: { w: 390, h: 844, label: 'Phone' } } as const;
type Device = keyof typeof DEVICES;

export default function Store({ route, go }: AppProps){
  const tab: Tab = TABS.some(t => t[0] === route) ? route as Tab : 'status';
  // the open/closed state, checked every few seconds so the preview follows a change made here or anywhere else
  const st = useLoad<{ status: { open: boolean } }>('/store/access', { pollMs: 5000, active: true });
  const open = st.data?.status.open;
  return (
    <div className="app">
      <WinTools><a className="btn sm ghost" href="/?page=store" target="_blank" rel="noopener"><Icon name="link" size={13} /> Open the store page</a></WinTools>
      <div className="tabs" role="tablist" aria-label="Store settings">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go(k === 'status' ? '' : k)}>{l}</button>)}
      </div>
      <div className="store-app">
        <div className="store-app-settings app-main"><div className="stack-lg" style={{ maxWidth: 760, width: '100%' }}>
          {tab === 'status' ? <StoreStatusPanel /> : tab === 'payments' ? <StoreSettings go={r => go(r === 'storestatus' ? '' : r)} /> : <Categories />}
        </div></div>
        <StorePreview open={open} />
      </div>
    </div>
  );
}

// The public Store page in a frame. It is the real page (same code, same data), so what shows here is what visitors see.
function StorePreview({ open }: { open: boolean | undefined }){
  const [device, setDevice] = useState<Device>('desktop');
  const [nonce, setNonce] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const dev = DEVICES[device];
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 24) / dev.w, (el.clientHeight - 24) / dev.h)));
    ro.observe(el); return () => ro.disconnect();
  }, [dev.w, dev.h]);
  return (
    <aside className="studio-preview store-app-preview" aria-label="Store preview">
      <div className="row between" style={{ padding: '8px 12px', gap: 8, flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 8 }}>
          {open === undefined ? <Badge>Checking…</Badge> : open ? <Badge tone="success">Open · what visitors see</Badge> : <Badge tone="warning">Closed · visitors see this board</Badge>}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <Segmented label="Preview size" value={device} onChange={setDevice} options={Object.entries(DEVICES).map(([k, v]) => ({ value: k as Device, label: v.label }))} />
          <button type="button" className="icon-btn sm" aria-label="Reload preview" title="Reload" onClick={() => setNonce(n => n + 1)}><Icon name="refresh" size={13} /></button>
        </span>
      </div>
      <div ref={box} className="preview-stage">
        <div className="device" style={{ width: dev.w * scale, height: dev.h * scale }}>
          {open !== undefined && <iframe key={`${device}-${open}-${nonce}`} src="/?page=store&preview=1" title="The Store page as visitors see it"
            style={{ width: dev.w, height: dev.h, transform: `scale(${scale})` }} />}
        </div>
      </div>
    </aside>
  );
}
