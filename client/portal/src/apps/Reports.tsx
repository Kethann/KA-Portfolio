// Reports: pick a range and grouping; revenue per currency, by product, country, coupons, refunds and
// downloads. Export as CSV, or print / save as PDF (the print stylesheet shows only this report).
import { useMemo, useState } from 'react';
import type { AppProps } from './registry';
import { useLoad, usePref } from '../hooks';
import { downloadFile } from '../api';
import { AsyncButton, Chart, Empty, ErrorState, Segmented, SkeletonRows, useToast } from '../ui';
import { Icon } from '../icons';
import { WinTools } from '../shell/Window';
import { money, num, todayIST } from '../format';
import { CurrencyMark, MASK, Money, useMoneyHidden } from '../money';

type Preset = '7' | '30' | '90' | '365' | 'custom';
export default function Reports({ open }: AppProps){
  const [preset, setPreset] = usePref<Preset>('reports.preset', '30');
  const [group, setGroup] = usePref<'day' | 'week' | 'month'>('reports.group', 'day');
  const [cFrom, setCFrom] = useState(todayIST(-29)), [cTo, setCTo] = useState(todayIST());
  const from = preset === 'custom' ? cFrom : todayIST(-(Number(preset) - 1)), to = preset === 'custom' ? cTo : todayIST();
  const s = useLoad<any>(`/reports?from=${from}&to=${to}&group=${group}`);
  const toast = useToast();
  const [hidden, setHidden] = useMoneyHidden();
  const m = (v: number | string, c: string) => hidden ? MASK : money(Number(v), c);
  const d = s.data;
  const periods: string[] = useMemo(() => [...new Set<string>((d?.byPeriod || []).map((r: any) => r.period))].sort(), [d]);
  const curs: string[] = useMemo(() => [...new Set<string>((d?.byCurrency || []).map((r: any) => r.currency))], [d]);
  return (
    <div className="app report-app">
      <WinTools>
        <button type="button" className="icon-btn" aria-pressed={hidden} aria-label={hidden ? 'Show amounts' : 'Hide amounts'} title={hidden ? 'Show amounts' : 'Hide amounts (for screen sharing)'} onClick={() => setHidden(!hidden)}><Icon name={hidden ? 'eyeOff' : 'eye'} /></button>
        <AsyncButton className="btn sm" onClick={async () => { await downloadFile(`/reports.csv?from=${from}&to=${to}&group=${group}`, `report-${from}-to-${to}.csv`); toast.show('CSV downloaded', { tone: 'success' }); }}><Icon name="downloads" /> CSV</AsyncButton>
        <button type="button" className="btn sm" onClick={() => {
          // the print-only layout stays until the dialog closes (print() doesn't block in every browser)
          document.body.classList.add('printing-report');
          addEventListener('afterprint', () => document.body.classList.remove('printing-report'), { once: true });
          requestAnimationFrame(() => print());
        }}><Icon name="file" /> PDF</button>
      </WinTools>
      <div className="app-toolbar">
        <Segmented label="Range" value={preset} onChange={setPreset} options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '90', label: '90d' }, { value: '365', label: '1y' }, { value: 'custom', label: 'Custom' }]} />
        {preset === 'custom' && <><input type="date" aria-label="From" value={cFrom} max={cTo} onChange={e => setCFrom(e.target.value)} style={{ width: 'auto' }} /><input type="date" aria-label="To" value={cTo} min={cFrom} onChange={e => setCTo(e.target.value)} style={{ width: 'auto' }} /></>}
        <span className="grow" />
        <Segmented label="Group by" value={group} onChange={setGroup} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      </div>
      <div className="app-main print-area">
        <div className="print-only"><h1 className="section-title">Sales report</h1><p className="muted">{from} to {to} · India time · grouped by {group}</p></div>
        {s.error && !d ? <ErrorState message={s.error} retry={s.reload} /> : !d ? <SkeletonRows rows={10} /> : <>
          <div className="kpis">
            {curs.length ? d.byCurrency.map((c: any) => (
              <div key={c.currency} className="kpi kpi-rev"><div className="kpi-label"><CurrencyMark currency={c.currency} size={22} />Revenue · {c.currency}</div><div className="kpi-value"><Money minor={Number(c.revenue)} currency={c.currency} hidden={hidden} /></div>
                <div className="kpi-sub">{num(c.orders)} orders · {m(c.discounts, c.currency)} in discounts</div></div>
            )) : <div className="kpi"><div className="kpi-label">Revenue</div><div className="kpi-value">—</div><div className="kpi-sub">No paid orders in this range</div></div>}
            <div className="kpi"><div className="kpi-label">Refunds</div><div className="kpi-value">{d.refunds.reduce((a: number, r: any) => a + r.refunds, 0)}</div>
              <div className="kpi-sub">{d.refunds.map((r: any) => m(r.amount, r.currency)).join(' · ') || 'none'}</div></div>
            <div className="kpi"><div className="kpi-label">Downloads</div><div className="kpi-value">{num(d.downloads.reduce((a: number, r: any) => a + r.downloads, 0))}</div><div className="kpi-sub">across {d.downloads.length} files</div></div>
          </div>
          {curs.map(c => (
            <section key={c} className="card" aria-label={`Revenue in ${c}`}><h3 className="row" style={{ gap: 8 }}><CurrencyMark currency={c} size={20} />Revenue per {group} · {c}</h3>
              <Chart key={`${c}-${from}-${to}-${group}`} kind="bar" labels={periods} series={[{ name: c, values: periods.map(p => Number(d.byPeriod.find((r: any) => r.period === p && r.currency === c)?.revenue || 0)) }]} format={v => m(v, c)} height={170} />
            </section>
          ))}
          <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}>
            <Table title="By product" empty="No sales" rows={d.byProduct} cols={[['Item', (r: any) => r.title], ['Sold', (r: any) => num(r.sold), true], ['Revenue', (r: any) => m(r.revenue, r.currency), true]]} />
            <Table title="By country" empty="No sales" rows={d.byCountry} cols={[['Country', (r: any) => r.country], ['Orders', (r: any) => num(r.orders), true], ['Revenue', (r: any) => m(r.revenue, r.currency), true]]} />
            <Table title="Coupons" empty="No codes used" rows={d.coupons} cols={[['Code', (r: any) => <span className="mono">{r.code}</span>], ['Uses', (r: any) => num(r.uses), true], ['Discount', (r: any) => m(r.discount, r.currency), true]]} />
            <Table title="Downloads" empty="No downloads" rows={d.downloads} cols={[['File', (r: any) => r.title], ['Downloads', (r: any) => num(r.downloads), true]]} />
          </div>
          <p className="field-hint no-print">Scheduled email reports are set in <button type="button" className="btn ghost sm" onClick={() => open('settings', 'reports')}>Settings → Reports</button></p>
        </>}
      </div>
    </div>
  );
}

function Table({ title, rows, cols, empty }: { title: string; rows: any[]; cols: [string, (r: any) => React.ReactNode, boolean?][]; empty: string }){
  return (
    <section className="card" aria-label={title}><h3>{title}</h3>
      {!rows.length ? <Empty title={empty} /> : (
        <table className="simple-table">
          <thead><tr>{cols.map(([h, , right]) => <th key={h} className={right ? 'right' : ''}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([h, f, right]) => <td key={h} className={right ? 'right num' : ''}>{f(r)}</td>)}</tr>)}</tbody>
        </table>
      )}
    </section>
  );
}
