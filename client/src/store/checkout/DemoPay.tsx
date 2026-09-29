// LOCAL DEMO payment window (only when the server says demoPayments: true, which is impossible in
// production). Stands in for Razorpay's window so the whole checkout can be tried without keys.
// Card details typed here never leave this component: only "approve" or "decline" is sent.
// Test cards: 4242 4242 4242 4242 approves, 4000 0000 0000 0002 declines.
import { useRef, useState } from 'react';
import { detectBrand, formatNumber, luhn, formatExpiry, expiryValid, cvvLength, maxDigits, nameValid, BRAND_NAMES, DECLINE_TEST, type Brand } from './cards';

type Field = 'number' | 'expiry' | 'cvv' | 'name';

export function DemoPay({ amountText, onResult, onClose }: { amountText: string; onResult(outcome: 'approve' | 'decline'): void; onClose(): void }){
  const [num, setNum] = useState(''), [exp, setExp] = useState(''), [cvv, setCvv] = useState(''), [name, setName] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs = { number: useRef<HTMLInputElement>(null), expiry: useRef<HTMLInputElement>(null), cvv: useRef<HTMLInputElement>(null), name: useRef<HTMLInputElement>(null) };
  const digits = num.replace(/\D/g, '');
  const brand: Brand = detectBrand(digits);
  const check = (f: Field): string => {
    if (f === 'number') return luhn(digits) && digits.length >= 13 ? '' : 'That card number isn’t valid.';
    if (f === 'expiry') return expiryValid(exp) ? '' : 'Use a future date as MM/YY.';
    if (f === 'cvv') return cvv.length === cvvLength(brand) ? '' : `Enter the ${cvvLength(brand)}-digit security code.`;
    return nameValid(name) ? '' : 'Use letters and spaces only.';
  };
  const blur = (f: Field) => setErrors(e => ({ ...e, [f]: check(f) }));
  const next = (f: Field) => refs[f].current?.focus();
  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    const all: Partial<Record<Field, string>> = {};
    (['number', 'expiry', 'cvv', 'name'] as Field[]).forEach(f => { all[f] = check(f); });
    setErrors(all);
    const bad = (['number', 'expiry', 'cvv', 'name'] as Field[]).find(f => all[f]);
    if (bad){ refs[bad].current?.focus(); return; }
    setBusy(true);
    setTimeout(() => onResult(digits === DECLINE_TEST ? 'decline' : 'approve'), 700);
  };
  const groups = formatNumber(digits, brand);
  const ghost = brand === 'amex' ? '•••• •••••• •••••' : '•••• •••• •••• ••••';
  return <div className="kdp" role="dialog" aria-modal="true" aria-labelledby="kdp-title">
    <div className="kdp-card-wrap">
      <div className={`kdp-card brand-${brand} ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(f => !f)} aria-hidden="true">
        <div className="kdp-face kdp-front">
          <span className="kdp-brand">{BRAND_NAMES[brand]}</span>
          <span className="kdp-number">{Array.from(ghost).map((g, i) => {
            const ch = groups[i];
            return <span key={i} className={ch && ch !== ' ' ? 'kdp-d is-on' : 'kdp-d'}>{ch && ch !== ' ' ? ch : g}</span>;
          })}</span>
          <span className="kdp-meta"><span>{name.trim() || 'CARDHOLDER NAME'}</span><span>{exp || 'MM/YY'}</span></span>
        </div>
        <div className="kdp-face kdp-back"><span className="kdp-stripe" /><span className="kdp-sig">{'•'.repeat(cvv.length) || '•••'}</span></div>
      </div>
    </div>
    <form className="kdp-form" onSubmit={pay} noValidate>
      <h3 id="kdp-title">Demo payment <span>(test mode, nothing is charged)</span></h3>
      <p className="kdp-hint">4242 4242 4242 4242 approves · 4000 0000 0000 0002 declines</p>
      <label className="kdp-field">Card number
        <input ref={refs.number} inputMode="numeric" autoComplete="cc-number" value={groups} aria-invalid={!!errors.number}
          onChange={e => { const d = e.target.value.replace(/\D/g, '').slice(0, maxDigits(detectBrand(e.target.value))); setNum(d); if (d.length === maxDigits(detectBrand(d)) && luhn(d)) next('expiry'); }}
          onBlur={() => blur('number')} placeholder="1234 5678 9012 3456" />
        <span className="kdp-err" role={errors.number ? 'alert' : undefined}>{errors.number}</span></label>
      <div className="kdp-row">
        <label className="kdp-field">Expiry
          <input ref={refs.expiry} inputMode="numeric" autoComplete="cc-exp" value={exp} maxLength={5} aria-invalid={!!errors.expiry}
            onChange={e => { const v = formatExpiry(e.target.value); setExp(v); if (v.length === 5 && expiryValid(v)) next('cvv'); }} onBlur={() => blur('expiry')} placeholder="MM/YY" />
          <span className="kdp-err" role={errors.expiry ? 'alert' : undefined}>{errors.expiry}</span></label>
        <label className="kdp-field">CVV
          <input ref={refs.cvv} inputMode="numeric" autoComplete="cc-csc" type="password" value={cvv} maxLength={cvvLength(brand)} aria-invalid={!!errors.cvv}
            onFocus={() => setFlipped(true)} onBlur={() => { setFlipped(false); blur('cvv'); }}
            onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, cvvLength(brand)); setCvv(v); if (v.length === cvvLength(brand)) next('name'); }} placeholder={'•'.repeat(cvvLength(brand))} />
          <span className="kdp-err" role={errors.cvv ? 'alert' : undefined}>{errors.cvv}</span></label>
      </div>
      <label className="kdp-field">Name on card
        <input ref={refs.name} autoComplete="cc-name" value={name} maxLength={50} aria-invalid={!!errors.name} onChange={e => setName(e.target.value)} onBlur={() => blur('name')} placeholder="As printed on the card" />
        <span className="kdp-err" role={errors.name ? 'alert' : undefined}>{errors.name}</span></label>
      <div className="kdp-actions">
        <button type="button" className="kas-btn is-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className="kas-buy" disabled={busy}>{busy ? 'Processing…' : `Pay ${amountText}`}</button>
      </div>
    </form>
  </div>;
}
