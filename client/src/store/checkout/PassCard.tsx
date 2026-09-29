// The live 3D "pass" above the checkout form: product, license, amount (counting), the buyer's
// email as it is typed, and after payment how it was paid. Tilt follows the pointer (or the
// phone's motion sensor where no permission prompt is needed); tap or Enter flips it.
import { useEffect, useRef } from 'react';
import { formatPrice, type Currency, type Product } from '../api';
import type { Phase, PaymentMethod } from './machine';

export function useCountUp(target: number, reduced: boolean){
  const value = useRef(target);
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const from = value.current, to = target;
    if (reduced || from === to || !el.current){ value.current = to; return; }
    let raf = 0; const t0 = performance.now(), dur = 520;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      value.current = Math.round(from + (to - from) * e);
      if (el.current) el.current.dataset.v = String(value.current);
      el.current?.dispatchEvent(new CustomEvent('kco-count'));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return { el, value };
}

// Formats an animating minor-unit amount without re-rendering React on every frame.
export function CountingPrice({ amount, currency, reduced, free }: { amount: number; currency: Currency; reduced: boolean; free?: boolean }){
  const { el, value } = useCountUp(amount, reduced);
  useEffect(() => {
    const node = el.current; if (!node) return;
    const paint = () => { node.textContent = free && value.current === 0 ? 'Free' : formatPrice(value.current, currency); };
    paint(); node.addEventListener('kco-count', paint);
    return () => node.removeEventListener('kco-count', paint);
  }, [currency, free, el, value]);
  return <span ref={el} aria-hidden="true" />;
}

function useTilt(ref: React.RefObject<HTMLDivElement>, enabled: boolean){
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0, idle = true;
    const apply = () => {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      el.style.setProperty('--rx', `${(-y * 9).toFixed(2)}deg`); el.style.setProperty('--ry', `${(x * 11).toFixed(2)}deg`);
      el.style.setProperty('--gx', `${(50 + x * 40).toFixed(1)}%`); el.style.setProperty('--gy', `${(50 + y * 40).toFixed(1)}%`);
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.002) raf = requestAnimationFrame(apply); else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(apply); };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      idle = false; kick();
    };
    const onLeave = () => { tx = 0; ty = 0; idle = true; kick(); };
    // motion sensor: only where it works without a permission prompt (not iOS 13+)
    const D = window.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined;
    const onTilt = (e: DeviceOrientationEvent) => {
      if (!idle || e.gamma === null || e.beta === null) return;
      tx = Math.max(-1, Math.min(1, e.gamma / 30)); ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30)); kick();
    };
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerleave', onLeave);
    const useGyro = D && typeof D.requestPermission !== 'function' && matchMedia('(pointer: coarse)').matches;
    if (useGyro) window.addEventListener('deviceorientation', onTilt);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerleave', onLeave);
      if (useGyro) window.removeEventListener('deviceorientation', onTilt);
    };
  }, [ref, enabled]);
}

function methodText(m: PaymentMethod | null){
  if (!m) return '';
  if (m.type === 'card') return `${m.network || 'Card'}${m.last4 ? ` •••• ${m.last4}` : ''}`;
  return ({ upi: 'UPI', netbanking: 'Net banking', wallet: 'Wallet', emi: 'EMI', paylater: 'Pay later' } as Record<string, string>)[m.type] || m.type;
}

export interface PassCardProps {
  product: Product; currency: Currency; amount: number; free: boolean; email: string; orderId: string | null;
  phase: Phase; method: PaymentMethod | null; flipped: boolean; onFlip(): void; reduced: boolean; cardRef: React.RefObject<HTMLDivElement>;
}

export function PassCard({ product, currency, amount, free, email, orderId, phase, method, flipped, onFlip, reduced, cardRef }: PassCardProps){
  const tiltRef = useRef<HTMLDivElement>(null);
  useTilt(tiltRef, !reduced);
  const shown = email.trim().slice(0, 40);
  const kindLabel = product.kind === 'artzz' ? 'ARTZZ' : 'ARTIFACTS';
  const thumb = product.media[0];
  const tone = phase === 'success' ? 'ok' : phase === 'failed' ? 'bad' : ['creating', 'paying', 'confirming'].includes(phase) ? 'busy' : 'idle';
  return <div className={`kco-card-wrap tone-${tone}`} ref={cardRef} data-phase={phase}>
    <div className="kco-tilt" ref={tiltRef}>
      <div className={`kco-card ${flipped ? 'is-flipped' : ''}`} role="button" tabIndex={0}
        aria-label={`${product.title} pass. ${flipped ? 'Showing license details' : 'Showing summary'}. Press Enter to flip.`} aria-pressed={flipped}
        onClick={onFlip} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onFlip(); } }}>
        <div className="kco-face kco-front" aria-hidden={flipped}>
          <span className="kco-sheen" aria-hidden="true" /><span className="kco-noise" aria-hidden="true" />
          <div className="kco-card-top">
            <span className="kco-brand"><img src="/images/favicon-64.png" alt="" width="22" height="22" />{kindLabel}</span>
            <span className="kco-chip" aria-hidden="true" />
          </div>
          <div className="kco-card-mid">
            {thumb ? <img className="kco-thumb" src={thumb.url} alt="" /> : <span className="kco-thumb kco-thumb-empty" />}
            <div className="kco-title"><strong>{product.title}</strong><small>{product.license ? `${product.license.name} license` : 'Digital download'}</small></div>
          </div>
          <div className="kco-amount"><CountingPrice amount={amount} currency={currency} reduced={reduced} free={free} /></div>
          <div className="kco-card-foot">
            <span className="kco-email" aria-hidden="true">
              {shown ? Array.from(shown).map((ch, i) => <span key={i} className="kco-char">{ch}</span>) : <span className="kco-ghost">you@example.com</span>}
            </span>
            <span className="kco-order">{method && phase === 'success' ? methodText(method) : orderId || '•••• ••••'}</span>
          </div>
        </div>
        <div className="kco-face kco-back" aria-hidden={!flipped}>
          <span className="kco-stripe" aria-hidden="true" />
          <div className="kco-back-body">
            <p><b>{product.license ? product.license.name : 'Personal'} license</b>{product.license?.summary ? ` — ${product.license.summary}` : ''}</p>
            <p>Download link by email, valid for {product.delivery.linkHours} hours and {product.delivery.maxDownloads} downloads. Receipt to {shown || 'your email'}.</p>
            <p className="kco-sign">Kethan Artzz</p>
          </div>
        </div>
      </div>
    </div>
  </div>;
}
