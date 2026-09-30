// LOCAL DEMO payment window (only when the server says demoPayments: true, which is impossible in
// production). Stands in for Razorpay's window so the whole checkout can be tried without keys.
// Card details typed here never leave this component: only "approve" or "decline" is sent.
//
// Test wallet: five pretend cards with balances (kept on this device). Paying more than a card holds
// is declined for insufficient funds, like a real card; approved payments come off the balance;
// "Reset balances" refills them. Any other valid card number simply approves.
import { useRef, useState } from 'react';
import { detectBrand, formatNumber, luhn, formatExpiry, expiryValid, cvvLength, maxDigits, nameValid, BRAND_NAMES, DECLINE_TEST, type Brand } from './cards';
import { formatPrice, type Currency } from '../api';

type Field = 'number' | 'expiry' | 'cvv' | 'name';
type TestCard = { id: string; label: string; number: string; name: string; balance: Record<Currency, number>; declines?: boolean };

// balances in minor units (paise / cents)
export const TEST_CARDS: TestCard[] = [
  { id: 'visa', label: 'Visa Platinum', number: '4242424242424242', name: 'KA TEST BUYER', balance: { INR: 10000000, USD: 120000 } },
  { id: 'master', label: 'Mastercard Everyday', number: '5555555555554444', name: 'KA TEST BUYER', balance: { INR: 500000, USD: 6000 } },
  { id: 'amex', label: 'Amex Travel', number: '378282246310005', name: 'KA TEST BUYER', balance: { INR: 2500000, USD: 30000 } },
  { id: 'rupay', label: 'RuPay Student', number: '6522000000000014', name: 'KA TEST BUYER', balance: { INR: 30000, USD: 400 } },
  { id: 'decline', label: 'Always declined', number: DECLINE_TEST, name: 'KA TEST BUYER', balance: { INR: 0, USD: 0 }, declines: true },
];
const WALLET_KEY = 'ka-demo-wallet';
type Wallet = Record<string, Record<Currency, number>>;
const freshWallet = (): Wallet => Object.fromEntries(TEST_CARDS.map(c => [c.id, { ...c.balance }]));
function loadWallet(): Wallet {
  try { const w = JSON.parse(localStorage.getItem(WALLET_KEY) || 'null'); if (w && typeof w === 'object') return { ...freshWallet(), ...w }; } catch { /* private mode */ }
  return freshWallet();
}
function saveWallet(w: Wallet){ try { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); } catch { /* private mode: balances reset on reload */ } }

export function DemoPay({ amount, currency, onResult, onClose }: { amount: number; currency: Currency; onResult(outcome: 'approve' | 'decline', reason?: string, card?: { network: string; last4: string }): void; onClose(): void }){
  const [num, setNum] = useState(''), [exp, setExp] = useState(''), [cvv, setCvv] = useState(''), [name, setName] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<Wallet>(loadWallet);
  const refs = { number: useRef<HTMLInputElement>(null), expiry: useRef<HTMLInputElement>(null), cvv: useRef<HTMLInputElement>(null), name: useRef<HTMLInputElement>(null) };
  const digits = num.replace(/\D/g, '');
  const brand: Brand = detectBrand(digits);
  const picked = TEST_CARDS.find(c => c.number === digits) || null;
  const amountText = formatPrice(amount, currency);
  const check = (f: Field): string => {
    if (f === 'number') return luhn(digits) && digits.length >= 13 ? '' : 'That card number isn’t valid.';
    if (f === 'expiry') return expiryValid(exp) ? '' : 'Use a future date as MM/YY.';
    if (f === 'cvv') return cvv.length === cvvLength(brand) ? '' : `Enter the ${cvvLength(brand)}-digit security code.`;
    return nameValid(name) ? '' : 'Use letters and spaces only.';
  };
  const blur = (f: Field) => setErrors(e => ({ ...e, [f]: check(f) }));
  const next = (f: Field) => refs[f].current?.focus();
  const pick = (c: TestCard) => {
    const b = detectBrand(c.number);
    setNum(c.number); setExp('12/30'); setCvv(b === 'amex' ? '1234' : '123'); setName(c.name); setErrors({});
  };
  const pay = (e: React.FormEvent) => {
    e.preventDefault();
    const all: Partial<Record<Field, string>> = {};
    (['number', 'expiry', 'cvv', 'name'] as Field[]).forEach(f => { all[f] = check(f); });
    setErrors(all);
    const bad = (['number', 'expiry', 'cvv', 'name'] as Field[]).find(f => all[f]);
    if (bad){ refs[bad].current?.focus(); return; }
    setBusy(true);
    setTimeout(() => {
      if (picked?.declines) return onResult('decline', 'Your bank declined this card (test card that always declines).');
      if (picked){
        const left = wallet[picked.id]?.[currency] ?? 0;
        if (left < amount) return onResult('decline', `Insufficient funds: ${picked.label} has ${formatPrice(left, currency)}, and this costs ${amountText}.`);
        const w = { ...wallet, [picked.id]: { ...wallet[picked.id], [currency]: left - amount } };
        setWallet(w); saveWallet(w);
      }
      onResult('approve', undefined, { network: BRAND_NAMES[brand], last4: digits.slice(-4) });
    }, 700);
  };
  const reset = () => { const w = freshWallet(); setWallet(w); saveWallet(w); };
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
      <div className="kdp-wallet" role="group" aria-labelledby="kdp-wallet-h">
        <div className="kdp-wallet-head"><span id="kdp-wallet-h">Test wallet · tap a card</span><button type="button" className="kas-link" onClick={reset}>Reset balances</button></div>
        <ul>{TEST_CARDS.map(c => {
          const left = wallet[c.id]?.[currency] ?? 0, short = !c.declines && left < amount;
          return <li key={c.id}><button type="button" className={`kdp-wcard brand-${detectBrand(c.number)} ${picked?.id === c.id ? 'is-on' : ''}`} aria-pressed={picked?.id === c.id} onClick={() => pick(c)}>
            <span className="kdp-wname">{c.label}</span>
            <span className="kdp-wnum">•••• {c.number.slice(-4)}</span>
            <span className={`kdp-wbal ${short || c.declines ? 'is-short' : ''}`}>{c.declines ? 'Declines' : formatPrice(left, currency)}{short ? ' · too low' : ''}</span>
          </button></li>;
        })}</ul>
      </div>
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
