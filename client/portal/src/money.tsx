// Money on screen: one privacy switch for every revenue figure (hide amounts while sharing the screen),
// numbers that count up to their new value, a currency mark per currency, and a tiny trend line.
import { useEffect, useRef, useState } from 'react';
import { usePref } from './hooks';
import { money } from './format';

export const MASK = '••••';
export function useMoneyHidden(){ return usePref<boolean>('money.hidden', false); }

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Counts from the previous value to the new one (eased, ~0.9s). The first value counts up from zero.
export function useCountUp(target: number, ms = 900){
  const [v, setV] = useState(reduced() ? target : 0);
  const from = useRef(reduced() ? target : 0);
  useEffect(() => {
    if (reduced() || !Number.isFinite(target)){ from.current = target; setV(target); return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms), k = 1 - Math.pow(1 - t, 3);
      const x = a + (target - a) * k;
      from.current = x; setV(x);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// A money amount (minor units) that counts up, or a mask while amounts are hidden. Screen readers get the
// final value straight away, never the in-between numbers.
export function Money({ minor, currency, hidden }: { minor: number; currency: string; hidden: boolean }){
  const v = useCountUp(Number(minor) || 0);
  if (hidden) return <span className="money-mask" aria-label="Amount hidden">{MASK}</span>;
  return <span className="num"><span aria-hidden="true">{money(Math.round(v), currency)}</span><span className="sr-only">{money(minor, currency)}</span></span>;
}

const MARKS: Record<string, { sym: string; name: string }> = { INR: { sym: '₹', name: 'Indian rupee' }, USD: { sym: '$', name: 'US dollar' } };
export function CurrencyMark({ currency, size = 28 }: { currency: string; size?: number }){
  const m = MARKS[currency] || { sym: currency.slice(0, 1), name: currency };
  return <span className={'cur-mark cur-' + currency.toLowerCase()} style={{ width: size, height: size, fontSize: size * 0.5 }} role="img" aria-label={m.name}>{m.sym}</span>;
}

// Trend line under a KPI: values only, no axes. Draws itself in once.
export function Sparkline({ values, height = 30 }: { values: number[]; height?: number }){
  if (values.length < 2 || !values.some(v => v > 0)) return null;
  const W = 100, H = height, max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 2 - (v / max) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path className="spark-area" d={`${line} L${W},${H} L0,${H} Z`} />
      <path className="spark-line" d={line} pathLength={1} />
    </svg>
  );
}
