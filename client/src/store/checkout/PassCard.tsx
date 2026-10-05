// The live 3D "pass" above the checkout form: product, license, amount (counting), the buyer's
// email as it is typed, and after payment how it was paid. Tilt follows the pointer (or the
// phone's motion sensor where no permission prompt is needed); tap or Enter flips it.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatPrice, type Currency, type Product } from '../api';
import type { Phase, PaymentMethod, LicenseRef } from './machine';
import { sealSvg } from '../../../../shared/seal.js';

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
    // Border glow: a bright arc runs around the card's edge. It follows the pointer while it is over the card
    // and drifts slowly round the edge when it is not (--ba = angle, --bi = strength; the CSS draws the arc).
    let ang = 150, tgt = 150, bi = 0.8, hot = false, gRaf = 0;
    const glow = () => {
      if (!hot) tgt += 0.3;
      const d = ((tgt - ang + 540) % 360) - 180;
      ang = (ang + d * 0.14 + 360) % 360;
      const want = hot ? 0.9 + 0.1 * Math.min(1, Math.hypot(tx, ty)) : 0.8;
      bi += (want - bi) * 0.1;
      el.style.setProperty('--ba', `${ang.toFixed(1)}deg`); el.style.setProperty('--bi', bi.toFixed(3));
      gRaf = requestAnimationFrame(glow);
    };
    gRaf = requestAnimationFrame(glow);
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
      if (Math.hypot(tx, ty) > 0.06){ hot = true; tgt = Math.atan2(tx, -ty) * 180 / Math.PI + 360; }
    };
    const onLeave = () => { tx = 0; ty = 0; idle = true; hot = false; tgt = ang; kick(); };
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
      cancelAnimationFrame(raf); cancelAnimationFrame(gRaf);
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

// The pass design from the portal (Studio > Checkout pass); every field has a default.
export type SignatureTone = 'gold' | 'white' | 'ink' | 'accent';
export interface PassSettings { label: string; logoUrl: string; logoSize: number; showTag: boolean; tagText: string; titleFont: string; priceFont: string;
  textPosition: 'bottom' | 'center' | 'top'; pricePosition: 'right' | 'left' | 'below'; stampText: string; foil: boolean; dim: number;
  // the signature on the back (any font, including ones uploaded in Studio) and the license seal beside it
  signatureText: string; signatureFont: string; signatureSize: number; signatureTone: SignatureTone; signatureAngle: number; showSeal: boolean;
  // the words on the back of the pass
  backEyebrow: string; licensedLabel: string; signLabel: string; backNote: string; showTerms: boolean }
export const PASS_DEFAULTS: PassSettings = { label: 'KA PASS', logoUrl: '', logoSize: 24, showTag: true, tagText: '', titleFont: '', priceFont: '',
  textPosition: 'bottom', pricePosition: 'right', stampText: 'PAID', foil: true, dim: 55,
  signatureText: 'Kethan Artzz', signatureFont: '', signatureSize: 30, signatureTone: 'gold', signatureAngle: -4, showSeal: true,
  backEyebrow: 'License', licensedLabel: 'Licensed to', signLabel: 'Authorised signature', backNote: '', showTerms: true };
// What the signature is drawn in until a font is chosen (the portal's sample uses the same stack).
export const SIGNATURE_DEFAULT_FONT = "'Segoe Script', 'Bradley Hand', 'Brush Script MT', 'Lucida Handwriting', cursive";
export const SIGNATURE_INK: Record<SignatureTone, string> = { gold: '#f2c27b', white: '#fff6ea', ink: '#e9e1d8', accent: 'var(--kas-accent, #ff9438)' };
declare global { interface Window { kaPassCard?: Partial<PassSettings> | null } }
function usePassSettings(override?: Partial<PassSettings>): PassSettings {
  const [live, setLive] = useState(() => window.kaPassCard || null);
  useEffect(() => { const on = () => setLive(window.kaPassCard || null); addEventListener('ka-pass-card', on); return () => removeEventListener('ka-pass-card', on); }, []);
  return { ...PASS_DEFAULTS, ...(live || {}), ...(override || {}) };
}
const fam = (f: string, fallback: string) => (f ? (f === 'system-ui' ? 'system-ui' : `'${f}', ${fallback}`) : undefined);

export interface PassCardProps {
  product: Product; currency: Currency; amount: number; free: boolean; email: string; orderId: string | null;
  phase: Phase; method: PaymentMethod | null; flipped: boolean; onFlip(): void; reduced: boolean; cardRef: React.RefObject<HTMLDivElement>;
  settings?: Partial<PassSettings>;   // the portal's live preview passes its draft here
  holder?: string;                     // the name typed for the license (optional)
  license?: LicenseRef | null;         // set once the order is paid: the seal then carries its code
}

export function PassCard({ product, currency, amount, free, email, orderId, phase, method, flipped, onFlip, reduced, cardRef, settings, holder = '', license = null }: PassCardProps){
  const pass = usePassSettings(settings);
  const tiltRef = useRef<HTMLDivElement>(null);
  useTilt(tiltRef, !reduced);
  const shown = email.trim().slice(0, 40);

  const thumb = product.media[0];
  const tone = phase === 'success' ? 'ok' : phase === 'failed' ? 'bad' : ['creating', 'paying', 'confirming'].includes(phase) ? 'busy' : 'idle';
  return <div className={`kco-card-wrap tone-${tone} pass-text-${pass.textPosition} pass-price-${pass.pricePosition} ${pass.foil ? '' : 'pass-no-foil'}`} ref={cardRef} data-phase={phase}
    style={{ ['--kco-dim' as string]: String(pass.dim / 100) } as React.CSSProperties}>
    <div className="kco-tilt" ref={tiltRef}>
      <div className={`kco-card ${flipped ? 'is-flipped' : ''}`} role="button" tabIndex={0}
        aria-label={`${product.title} pass. ${flipped ? 'Showing license details' : 'Showing summary'}. Press Enter to flip.`} aria-pressed={flipped}
        onClick={onFlip} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onFlip(); } }}>
        {/* A ticket, not a payment card: the artwork fills it, a holographic foil follows the tilt,
            and a perforated stub carries the buyer's email and the order. PAID stamps on success. */}
        <div className="kco-face kco-front" aria-hidden={flipped}>
          {thumb ? <img className="kco-art" src={thumb.url} alt="" decoding="async" /> : <span className="kco-art kco-art-empty" />}
          <span className="kco-scrim" aria-hidden="true" /><span className="kco-foil" aria-hidden="true" />
          <span className="kco-sheen" aria-hidden="true" /><span className="kco-noise" aria-hidden="true" />
          <div className="kco-card-top">
            <span className="kco-brand"><img src={pass.logoUrl || '/images/ka-logo.png'} alt="" width={pass.logoSize} height={pass.logoSize} style={{ width: pass.logoSize, height: pass.logoSize }} decoding="async" />{pass.label}</span>
            {pass.showTag && <span className="kco-tag">{pass.tagText || (free ? 'Free download' : 'Instant download')}</span>}
          </div>
          <div className="kco-main">
            <div className="kco-title"><strong style={{ fontFamily: fam(pass.titleFont, 'serif') }}>{product.title}</strong><small>{product.license ? `${product.license.name} license` : 'Digital download'}</small></div>
            <div className="kco-amount" style={{ fontFamily: fam(pass.priceFont, 'monospace') }}><CountingPrice amount={amount} currency={currency} reduced={reduced} free={free} /></div>
          </div>
          <div className="kco-stub">
            <span className="kco-email" aria-hidden="true">
              {shown ? Array.from(shown).map((ch, i) => <span key={i} className="kco-char">{ch}</span>) : <span className="kco-ghost">you@example.com</span>}
            </span>
            <span className="kco-order">{method && phase === 'success' ? methodText(method) : orderId || 'KA-••••••••'}</span>
          </div>
          {phase === 'success' && <span className="kco-stamp" aria-hidden="true">{free ? 'YOURS' : pass.stampText}</span>}
        </div>
        <div className="kco-face kco-back" aria-hidden={!flipped}>
          {thumb && <img className="kco-back-art" src={thumb.url} alt="" decoding="async" aria-hidden="true" />}
          <span className="kco-back-glow" aria-hidden="true" />
          <div className={`kco-back-grid ${pass.showSeal ? '' : 'no-seal'}`}>
            <div className="kco-back-info">
              <span className="kco-back-eyebrow">{pass.backEyebrow || PASS_DEFAULTS.backEyebrow}</span>
              <strong className="kco-back-lic">{product.license ? product.license.name : 'Personal'} license</strong>
              {product.license?.summary && <span className="kco-back-sum">{product.license.summary}</span>}
              <span className="kco-back-to"><small>{pass.licensedLabel || PASS_DEFAULTS.licensedLabel}</small>{holder.trim().slice(0, 80) || shown || 'you'}</span>
              {pass.backNote && <span className="kco-back-note">{pass.backNote}</span>}
              {pass.showTerms && <span className="kco-back-terms">Link by email · {product.delivery.linkHours} h · {product.delivery.maxDownloads} downloads</span>}
              <span className="kco-sign-wrap">
                <span className="kco-sign" style={{ fontFamily: pass.signatureFont ? fam(pass.signatureFont, 'cursive') : SIGNATURE_DEFAULT_FONT, fontSize: pass.signatureSize,
                  color: SIGNATURE_INK[pass.signatureTone] || SIGNATURE_INK.gold, transform: `rotate(${pass.signatureAngle}deg)` }}>{pass.signatureText || 'Kethan Artzz'}</span>
                <small>{pass.signLabel || PASS_DEFAULTS.signLabel}</small>
              </span>
            </div>
            {pass.showSeal && <Seal license={license} />}
          </div>
        </div>
      </div>
    </div>
  </div>;
}

// The license seal on the back: the real, scannable seal once the order is paid; before that, an empty seal
// that says where it will appear. Drawn as an image (the card itself is the button that flips it).
function Seal({ license }: { license: LicenseRef | null }){
  const svg = useMemo(() => license ? sealSvg({ url: license.url, code: license.code, id: 'kco-seal-' + license.code }) : '', [license]);
  if (!license) return <span className="kco-seal is-empty" aria-hidden="true"><span>Seal issued<br />at purchase</span></span>;
  return <span className="kco-seal" role="img" aria-label={`License seal ${license.code}. Scan it to check the license.`}>
    <span className="kco-seal-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
    <span className="kco-seal-code" aria-hidden="true">{license.code}</span>
  </span>;
}
