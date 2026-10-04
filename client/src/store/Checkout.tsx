// Checkout dialog. Every amount comes from the server's quote; the browser sends only ids, codes
// and the email. Real payment details are entered in Razorpay's own secure window (cards, UPI,
// net banking, wallets): this site never sees, sends, stores or logs card numbers or CVV.
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { useFocusTrap, useMedia } from './hooks';
import { postJson, publicConfig, formatPrice, ApiError, type Currency, type Product } from './api';
import { reduce, initialState, stepOf, isStage, type Quote, type OrderResult, type Success, type PaymentMethod } from './checkout/machine';
import { PassCard, CountingPrice } from './checkout/PassCard';
import { DemoPay } from './checkout/DemoPay';

type Req = { mode: 'buy'; product: Product; currency: Currency; opener?: HTMLElement | null } | { mode: 'resend'; opener?: HTMLElement | null };
interface Status { orderId: string; status: string; downloadUrl: string | null; method?: PaymentMethod | null }
type Widget = { token(): string; reset(): void; remove(): void; live?: boolean };

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, fn: (resp: { error?: { description?: string } }) => void): void } } }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_KEY = 'ka-buyer-email';
let razorpayScript: Promise<void> | null = null;
function loadRazorpay(){
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScript) razorpayScript = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.async = true;
    s.onload = () => (window.Razorpay ? resolve() : reject(new Error('Payment window unavailable')));
    s.onerror = () => { razorpayScript = null; reject(new Error('Payment window could not load')); };
    document.head.appendChild(s);
  });
  return razorpayScript;
}

// The bot check (Turnstile). The form that holds it is removed while a payment runs or after it fails and
// comes back for "Try again", so the check is attached to whichever box element is on screen right now (a
// callback ref), not just once. token() waits a few seconds for the invisible check to finish instead of
// sending an empty pass when Pay is pressed quickly.
function useTurnstile(){
  const el = useRef<HTMLDivElement | null>(null);
  const widget = useRef<Widget | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const box = useCallback((node: HTMLDivElement | null) => {
    if (node === el.current) return;
    widget.current?.remove(); widget.current = null; el.current = node;
    if (!node || !window.kaTurnstile){ loading.current = null; return; }
    loading.current = window.kaTurnstile(node).then(w => { if (el.current === node) widget.current = w; else w.remove(); }).catch(() => {});
  }, []);
  useEffect(() => () => { widget.current?.remove(); widget.current = null; el.current = null; }, []);
  const token = async (waitMs = 8000) => {
    if (loading.current) await loading.current;
    const t0 = Date.now();
    while (widget.current?.live && !widget.current.token() && Date.now() - t0 < waitMs) await new Promise(r => setTimeout(r, 250));
    return widget.current?.token() || '';
  };
  return { box, token, reset: () => widget.current?.reset() };
}

function useOnline(){
  const [online, set] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => set(true), down = () => set(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}

export default function Checkout({ request, onClose }: { request: Req; onClose(): void }){
  const ref = useRef<HTMLDivElement>(null);
  const [busyLock, setBusyLock] = useState(false);
  const close = useCallback(() => { if (!busyLock) onClose(); }, [busyLock, onClose]);
  useFocusTrap(ref, true, close, request.opener);
  if (request.mode === 'resend') return <div className="kas-modal" role="dialog" aria-modal="true" aria-labelledby="kas-co-title" ref={ref}>
    <div className="kas-modal-backdrop" onClick={close} />
    <div className="kas-modal-card kas-co">
      <button type="button" className="kas-co-close" onClick={close} aria-label="Close"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button>
      <h2 id="kas-co-title">Get your download links</h2>
      <Resend onClose={onClose} />
    </div>
  </div>;
  return <div className="kas-modal kco-modal" role="dialog" aria-modal="true" aria-labelledby="kco-title" ref={ref}>
    <div className="kas-modal-backdrop" onClick={close} />
    <Buy product={request.product} currency={request.currency} onClose={onClose} onBusy={setBusyLock} />
  </div>;
}

const STATUS_LINES: Record<string, string[]> = {
  creating: ['Creating your order…', 'Locking in your price…'],
  paying: ['Complete the payment in the secure window', 'Cards, UPI, net banking and wallets are accepted'],
  payingUSD: ['Complete the payment in the secure window', 'International Visa, Mastercard and Amex cards are accepted'],
  confirming: ['Contacting Razorpay…', 'Securing payment…', 'Preparing your download…']
};

function Buy({ product, currency, onClose, onBusy }: { product: Product; currency: Currency; onClose(): void; onBusy(b: boolean): void }){
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const online = useOnline();
  const [s, dispatch] = useReducer(reduce, initialState);
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } });
  const [remember, setRemember] = useState(() => { try { return !!localStorage.getItem(EMAIL_KEY); } catch { return false; } });
  const [emailError, setEmailError] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [codeError, setCodeError] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [demo, setDemo] = useState(false);
  const [line, setLine] = useState(0);
  const ts = useTurnstile();
  const emailRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLHeadingElement>(null);
  const flipFrom = useRef<DOMRect | null>(null);
  const inFlight = useRef(false);   // synchronous lock: two fast clicks can't both start a payment
  const stage = isStage(s.phase);
  const busy = ['validating', 'creating', 'paying', 'confirming'].includes(s.phase);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => { publicConfig().then(c => setDemo(!!(c as { demoPayments?: boolean }).demoPayments)); }, []);

  const requestQuote = useCallback(async (list: string[], addr?: string) => {
    const q = await postJson<Quote & { ok?: boolean; error?: string; code?: string }>('/api/checkout/quote', { productId: product.id, currency, codes: list, email: addr && EMAIL.test(addr) ? addr : undefined, turnstileToken: list.length ? await ts.token() : undefined });
    if (list.length) ts.reset();
    if (q.ok === false) throw new ApiError(q.error || 'That code can’t be used.', 200, q.code);   // a rejected code is an answer, not a failure
    return q as Quote;
  }, [product.id, currency, ts]);
  useEffect(() => { requestQuote([]).then(q => dispatch({ type: 'QUOTED', quote: q })).catch((e: Error) => dispatch({ type: 'QUOTE_FAILED', error: e.message })); /* first quote only */ // eslint-disable-line react-hooks/exhaustive-deps
  }, []);

  // FLIP: remember where the card was, then let it glide to its new place when the layout changes
  const setPhaseLayout = () => { if (cardRef.current) flipFrom.current = cardRef.current.getBoundingClientRect(); };
  useLayoutEffect(() => {
    const el = cardRef.current, first = flipFrom.current;
    flipFrom.current = null;
    if (!el || !first || reduced || !el.animate) return;
    const last = el.getBoundingClientRect();
    const dx = first.left - last.left, dy = first.top - last.top, sc = first.width / last.width;
    if (Math.abs(dx) + Math.abs(dy) < 2 && Math.abs(sc - 1) < 0.01) return;
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${sc})` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.22,.8,.24,1)' });
  }, [stage, reduced]);

  // rotating status text while working; focus the status for screen readers and keyboards
  useEffect(() => {
    if (!STATUS_LINES[s.phase]) return;
    setLine(0);
    const t = setInterval(() => setLine(l => l + 1), 1900);
    return () => clearInterval(t);
  }, [s.phase]);
  useEffect(() => { if (stage) requestAnimationFrame(() => statusRef.current?.focus({ preventScroll: true })); }, [s.phase, stage]);

  // success / failure feedback: confetti, gentle vibration
  useEffect(() => {
    if (s.phase === 'success'){
      buzz([18, 40, 26]);
      if (!reduced) import('./checkout/confetti').then(m => {
        const r = cardRef.current?.getBoundingClientRect();
        const host = (cardRef.current?.closest('.kas-modal') as HTMLElement | null) || document.body;   // inside the dialog, above its content
        m.burst(host, r ? { x: r.left + r.width / 2, y: r.top + r.height / 3 } : { x: innerWidth / 2, y: innerHeight / 3 });
      }).catch(() => {});
    } else if (s.phase === 'failed') buzz([60, 50, 60]);
  }, [s.phase, reduced]);

  const quote = s.quote;
  const applyCode = async () => {
    const c = code.trim().toUpperCase();
    if (!c || codeBusy) return;
    setCodeError(''); setCodeBusy(true);
    try { const next = [...codes.filter(x => x !== c), c]; dispatch({ type: 'QUOTED', quote: await requestQuote(next, email.trim()) }); setCodes(next); setCode(''); }
    catch (e){ setCodeError((e as Error).message); }
    finally { setCodeBusy(false); }
  };
  const removeCode = async (c: string) => {
    const next = codes.filter(x => x !== c);
    setCodes(next); setCodeBusy(true);
    try { dispatch({ type: 'QUOTED', quote: await requestQuote(next, email.trim()) }); } catch (e){ setCodeError((e as Error).message); } finally { setCodeBusy(false); }
  };
  const validateEmail = () => { const ok = EMAIL.test(email.trim()); setEmailError(ok || !email ? '' : 'Enter a valid email address.'); return ok; };

  const successFrom = (order: OrderResult, st: Status): Success => ({ orderId: order.orderId, downloadUrl: st.downloadUrl, method: st.method || null, total: quote?.total || 0, currency: quote?.currency || currency, free: false, emailed: st.status === 'delivered' });

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (s.phase !== 'idle' || !quote || inFlight.current) return;   // double submits are ignored by design
    inFlight.current = true;
    dispatch({ type: 'SUBMIT' });
    const addr = email.trim();
    if (!EMAIL.test(addr)){ setEmailError('Enter the email where your download link should go.'); dispatch({ type: 'INVALID' }); inFlight.current = false; emailRef.current?.focus(); return; }
    if (!online){ dispatch({ type: 'INVALID', error: 'You’re offline. Reconnect and try again.' }); inFlight.current = false; return; }
    setEmailError('');
    try { if (remember) localStorage.setItem(EMAIL_KEY, addr); else localStorage.removeItem(EMAIL_KEY); } catch {}
    // The bot-check pass is collected now, while the form (and the check inside it) is still on screen: the
    // next step swaps the form for the payment view, which removes the check.
    const pass = await ts.token();
    setPhaseLayout(); setFlipped(false);
    dispatch({ type: 'VALID' });
    let order: OrderResult;
    try {
      order = await postJson<OrderResult>('/api/checkout/order', { productId: product.id, currency, email: addr, codes, turnstileToken: pass });
    } catch (err){
      ts.reset();
      if (err instanceof ApiError && err.code === 'coupon_rejected') setCodeError((err as Error).message);
      dispatch({ type: 'ORDER_FAILED', error: (err as Error).message || 'We couldn’t start the payment. Nothing was charged.' });
      return;
    }
    ts.reset();
    if (order.free){ dispatch({ type: 'ORDER_FREE', success: { orderId: order.orderId, downloadUrl: order.downloadUrl || null, method: null, total: 0, currency, free: true, emailed: order.emailed !== false } }); return; }
    dispatch({ type: 'ORDER_CREATED', order });
    if (order.demo) return;                                   // DemoPay renders instead of Razorpay
    try { await loadRazorpay(); } catch {
      cancelOrder(order);
      dispatch({ type: 'PAY_FAILED', error: 'The secure payment window couldn’t load. Nothing was charged. Check your connection and try again.' });
      return;
    }
    let settled = false;
    const rp = order.razorpay!;
    const rzp = new window.Razorpay!({
      key: rp.keyId, order_id: rp.orderId, amount: rp.amount, currency: rp.currency, name: rp.name, description: rp.description,
      prefill: { email: rp.email }, notes: { order: order.orderId }, theme: { color: '#c9864f' }, retry: { enabled: true, max_count: 3 },
      handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        settled = true;
        dispatch({ type: 'PAID' });
        try {
          const first = await postJson<Status>('/api/checkout/verify', { orderId: order.orderId, clientSecret: order.clientSecret, ...resp });
          const final = await waitForDelivery(order, first);
          dispatch({ type: 'CONFIRMED', success: successFrom(order, { ...final, method: first.method }) });
        } catch (err){
          dispatch({ type: 'CONFIRM_FAILED', error: (err as Error).message || 'We couldn’t confirm the payment yet. If money was taken, your link will be emailed automatically.' });
        }
      },
      modal: { escape: true, confirm_close: true, ondismiss: () => { if (!settled){ cancelOrder(order); dispatch({ type: 'DISMISSED' }); } } }
    });
    rzp.on('payment.failed', (resp) => dispatch({ type: 'ATTEMPT_FAILED', error: resp.error?.description ? `Payment failed: ${resp.error.description}. You can try again.` : 'Payment failed. You can try again.' }));
    rzp.open();
  };

  const onDemo = async (outcome: 'approve' | 'decline', reason?: string, card?: { network: string; last4: string }) => {
    const order = s.order; if (!order) return;
    if (outcome === 'decline'){
      await postJson('/api/checkout/demo-pay', { orderId: order.orderId, clientSecret: order.clientSecret, outcome }).catch(() => {});
      dispatch({ type: 'PAY_FAILED', error: `${reason || 'Your bank declined this payment (test card).'} Nothing was charged.` }); return;
    }
    dispatch({ type: 'PAID' });
    try {
      const st = await postJson<Status>('/api/checkout/demo-pay', { orderId: order.orderId, clientSecret: order.clientSecret, outcome, card });
      dispatch({ type: 'CONFIRMED', success: successFrom(order, { ...st, method: { type: 'card', network: card?.network || 'Demo card', last4: card?.last4 } }) });
    } catch (err){ dispatch({ type: 'CONFIRM_FAILED', error: (err as Error).message }); }
  };
  const retry = () => { inFlight.current = false; setPhaseLayout(); dispatch({ type: 'RETRY' }); requestAnimationFrame(() => emailRef.current?.focus({ preventScroll: true })); };

  const step = stepOf(s.phase);
  const amount = s.success ? s.success.total : quote?.total ?? 0;
  const lines = STATUS_LINES[s.phase === 'paying' && (quote?.currency || currency) === 'USD' ? 'payingUSD' : s.phase];
  const usd = (quote?.currency || currency) === 'USD';
  return <div className={`kco kas-modal-card ${stage ? 'is-stage' : ''}`} data-phase={s.phase}>
    <header className="kco-head">
      <ol className="kco-steps" style={{ ['--step' as string]: step } as React.CSSProperties} aria-label="Checkout progress">
        {['Details', 'Payment', 'Done'].map((label, i) => <li key={label} aria-current={i === step ? 'step' : undefined} className={i < step ? 'is-done' : ''}>{label}</li>)}
        <span className="kco-steps-bar" aria-hidden="true" />
      </ol>
      <button type="button" className="kas-co-close" onClick={onClose} aria-label="Close" disabled={busy}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </header>
    <h2 id="kco-title" className="kas-sr">Checkout: {product.title}</h2>
    {!online && <p className="kco-offline" role="alert">You’re offline. Your details are kept; reconnect to continue.</p>}
    <div className="kco-body">
      <section className="kco-visual" aria-label="Order">
        <PassCard product={product} currency={quote?.currency || currency} amount={amount} free={!!quote?.free} email={email} orderId={s.order?.orderId || s.success?.orderId || null}
          phase={s.phase} method={s.success?.method || null} flipped={flipped} onFlip={() => setFlipped(f => !f)} reduced={reduced} cardRef={cardRef} />
        {!stage && <Summary quote={quote} reduced={reduced} />}
        {stage && <div className="kco-status" aria-live="polite">
          {lines ? <>
            <span className="kas-spinner" aria-hidden="true" />
            <h3 ref={statusRef} tabIndex={-1} key={line}>{lines[line % lines.length]}</h3>
            {s.attemptFailed && <p className="kas-co-error" role="alert">{s.attemptFailed}</p>}
          </> : s.phase === 'success' && s.success ? <>
            <span className="kco-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="34" height="34"><path d="M5 12.5l4.2 4.2L19 7" /></svg></span>
            <h3 ref={statusRef} tabIndex={-1}>{s.success.free ? 'It’s yours!' : 'Payment successful'}</h3>
            <p>{s.success.free ? 'Free download' : formatPrice(s.success.total, s.success.currency)} · Order <strong>{s.success.orderId}</strong></p>
            <p className="kco-note">{s.success.emailed
              ? <>A download link{s.success.free ? '' : ' and your receipt'} {s.success.free ? 'was' : 'were'} sent to <strong>{email.trim()}</strong>.</>
              : <>Your download link{s.success.free ? '' : ' and receipt'} will be emailed to <strong>{email.trim()}</strong> shortly. Use “Download now” to get it right away.</>}</p>
            <div className="kas-co-actions">
              {s.success.downloadUrl && <a className="kas-buy" href={s.success.downloadUrl}>Download now</a>}
              <button type="button" className={s.success.downloadUrl ? 'kas-btn is-ghost' : 'kas-buy'} onClick={onClose}>Continue browsing</button>
            </div>
          </> : <>
            <span className={`kco-mark ${s.phase === 'failed' ? 'is-bad' : ''}`} aria-hidden="true">{s.phase === 'failed' ? '!' : '×'}</span>
            <h3 ref={statusRef} tabIndex={-1}>{s.phase === 'failed' ? 'Payment didn’t go through' : 'Payment cancelled'}</h3>
            <p>{s.phase === 'failed' ? s.failure : 'Nothing was charged. Your details are still here.'}</p>
            <p className="kco-note">No download was sent.</p>
            <div className="kas-co-actions"><button type="button" className="kas-buy" onClick={retry}>Try again</button><button type="button" className="kas-btn is-ghost" onClick={onClose}>Close</button></div>
          </>}
        </div>}
      </section>
      {!stage && <form className="kco-form" onSubmit={submit} noValidate>
        <div className={`kco-field ${emailError ? 'is-error' : EMAIL.test(email.trim()) ? 'is-ok' : ''}`}>
          <input ref={emailRef} id="kco-email" type="email" inputMode="email" autoComplete="email" required maxLength={254} placeholder=" " value={email}
            onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(''); }} onBlur={validateEmail}
            onFocus={e => { const t = e.currentTarget; setTimeout(() => t.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }), 280); }}
            aria-invalid={!!emailError} aria-describedby="kco-email-help kco-email-err" data-autofocus={!email || undefined} />
          <label htmlFor="kco-email">Email for your download link</label>
          <span id="kco-email-err" className="kco-err" role={emailError ? 'alert' : undefined}>{emailError}</span>
          <span id="kco-email-help" className="kas-sr">Your download link and receipt are sent to this address.</span>
        </div>
        <label className="kco-remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember my email on this device for receipts</label>
        {quote && !quote.free ? <div className="kco-code">
          {!codeOpen ? <button type="button" className="kas-link" onClick={() => setCodeOpen(true)}>Have a discount code?</button> : <>
            <div className="kco-code-row">
              <div className={`kco-field ${codeError ? 'is-error' : ''}`}>
                <input id="kco-code" value={code} placeholder=" " onChange={e => { setCode(e.target.value); setCodeError(''); }} autoCapitalize="characters" spellCheck={false} maxLength={32}
                  onKeyDown={e => { if (e.key === 'Enter'){ e.preventDefault(); applyCode(); } }} aria-describedby="kco-code-err" autoFocus />
                <label htmlFor="kco-code">Discount code</label>
              </div>
              <button type="button" className="kas-btn" onClick={applyCode} disabled={codeBusy || !code.trim()}>{codeBusy ? '…' : 'Apply'}</button>
            </div>
            <span id="kco-code-err" className="kco-err" role={codeError ? 'alert' : undefined}>{codeError}</span>
            {codes.length > 0 && <ul className="kas-co-codes">{codes.map(c => <li key={c}>{c}<button type="button" onClick={() => removeCode(c)} aria-label={`Remove ${c}`}>×</button></li>)}</ul>}
          </>}
        </div> : null}
        <div className="ka-turnstile" ref={ts.box} />
        {s.notice && <p className="kas-co-error" role="alert">{s.notice}</p>}
        <div className="kco-paybar">
          <MagneticButton type="submit" className="kas-buy kco-pay" disabled={s.phase !== 'idle' || !quote || !online}
            aria-label={!quote ? undefined : quote.free ? 'Get it free' : `Pay ${formatPrice(quote.total, quote.currency)}`}>
            {s.phase === 'loading' ? 'Loading…' : !quote ? 'Unavailable' : quote.free ? 'Get it free' : <>Pay <CountingPrice amount={quote.total} currency={quote.currency} reduced={reduced} /></>}
          </MagneticButton>
          <ul className="kco-trust" aria-label="Checkout protection">
            <li><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>Secure payment</li>
            <li><span className="kco-rzp">Razorpay</span></li>
            <li><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>Instant download</li>
          </ul>
        </div>
        <p className="kas-co-fine">{usd
          ? <>Pay with an international card in Razorpay’s secure window. You’re charged in US dollars; your bank may add a foreign-transaction fee.</>
          : <>Pay by card, UPI, net banking or wallet in Razorpay’s secure window.</>} By continuing you agree to the <a href="/legal/terms" target="_blank" rel="noopener">Terms</a>, <a href="/legal/refunds" target="_blank" rel="noopener">Refund policy</a> and the item’s license.</p>
      </form>}
    </div>
    {demo && s.phase === 'paying' && s.order?.demo && quote &&
      <DemoPay amount={quote.total} currency={quote.currency} onResult={onDemo} onClose={() => { cancelOrder(s.order!); dispatch({ type: 'DISMISSED' }); }} />}
  </div>;
}

function Summary({ quote, reduced }: { quote: Quote | null; reduced: boolean }){
  if (!quote) return <div className="kco-summary kco-skel" aria-busy="true" aria-label="Loading price" />;
  return <dl className="kco-summary" aria-live="polite">
    <dt>Price</dt><dd>{quote.onSale && quote.compareAt ? <><s>{formatPrice(quote.compareAt, quote.currency)}</s> </> : null}{formatPrice(quote.subtotal, quote.currency)}</dd>
    {quote.discount > 0 && <><dt className="kco-disc">Discount{quote.codes.length ? ` (${quote.codes.map(c => c.code).join(', ')})` : ''}</dt><dd className="kco-disc">−{formatPrice(quote.discount, quote.currency)}</dd></>}
    {quote.tax > 0 && <><dt>{quote.taxLabel}</dt><dd>{formatPrice(quote.tax, quote.currency)}</dd></>}
    <dt className="is-total">Total</dt>
    <dd className="is-total"><CountingPrice amount={quote.total} currency={quote.currency} reduced={reduced} free={quote.free} /><span className="kas-sr">{quote.free ? 'Free' : formatPrice(quote.total, quote.currency)}</span></dd>
    {quote.taxIncluded > 0 && <><dt className="is-note">Includes {quote.taxLabel}</dt><dd className="is-note">{formatPrice(quote.taxIncluded, quote.currency)}</dd></>}
  </dl>;
}

// Pay button: leans slightly toward a mouse pointer and ripples where it's pressed.
function MagneticButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>){
  const ref = useRef<HTMLButtonElement>(null);
  const fine = useMedia('(hover: hover) and (pointer: fine)'), reduced = useMedia('(prefers-reduced-motion: reduce)');
  const move = (e: React.PointerEvent) => {
    if (!fine || reduced || !ref.current || props.disabled) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', `${((e.clientX - r.left) / r.width - 0.5) * 6}px`);
    ref.current.style.setProperty('--my', `${((e.clientY - r.top) / r.height - 0.5) * 6}px`);
  };
  const leave = () => { ref.current?.style.setProperty('--mx', '0px'); ref.current?.style.setProperty('--my', '0px'); };
  const down = (e: React.PointerEvent) => {
    if (reduced || !ref.current) return;
    const r = ref.current.getBoundingClientRect(), dot = document.createElement('span');
    dot.className = 'kco-ripple'; dot.style.left = `${e.clientX - r.left}px`; dot.style.top = `${e.clientY - r.top}px`;
    ref.current.appendChild(dot); setTimeout(() => dot.remove(), 600);
  };
  return <button {...props} ref={ref} onPointerMove={move} onPointerLeave={leave} onPointerDown={down} />;
}

// Haptics on phones, only after the visitor has interacted (browsers block it otherwise).
function buzz(pattern: number[]){
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (!ua || !ua.hasBeenActive || typeof navigator.vibrate !== 'function') return;
  try { navigator.vibrate(pattern); } catch { /* not supported */ }
}

function cancelOrder(order: OrderResult){
  postJson('/api/checkout/cancel', { orderId: order.orderId, clientSecret: order.clientSecret }).catch(() => {});
}

// After the browser proof, delivery needs the webhook too: poll briefly for it.
async function waitForDelivery(order: OrderResult, first: Status): Promise<Status>{
  let last = first, link = first.downloadUrl;
  for (let i = 0; i < 20 && !['delivered', 'paid'].includes(last.status); i++){
    await new Promise(r => setTimeout(r, 1500));
    last = await postJson<Status>('/api/checkout/status', { orderId: order.orderId, clientSecret: order.clientSecret });
    link = link || last.downloadUrl;
  }
  if (!['delivered', 'paid'].includes(last.status)) throw new Error(`Your payment is being confirmed. Your download link will arrive by email within a few minutes. Order ${order.orderId}.`);
  if (!link){ last = await postJson<Status>('/api/checkout/status', { orderId: order.orderId, clientSecret: order.clientSecret }); link = last.downloadUrl; }
  return { ...last, downloadUrl: link };
}

function Resend({ onClose }: { onClose(): void }){
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } });
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState('');
  const ts = useTurnstile();
  if (done) return <div className="kas-co-result" role="status"><p className="kas-co-lead">{done}</p>
    <div className="kas-co-actions"><button type="button" className="kas-buy" onClick={onClose} data-autofocus>Done</button></div></div>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())){ setError('Enter the email you used to buy.'); return; }
    setWorking(true); setError('');
    try { const r = await postJson<{ message: string }>('/api/downloads/resend', { email: email.trim(), turnstileToken: await ts.token() }); setDone(r.message); }
    catch (err){ setError((err as Error).message); ts.reset(); }
    finally { setWorking(false); }
  };
  return <form className="kas-co-form" onSubmit={submit} noValidate>
    <p>Enter the email you used. We’ll send fresh download links for everything you bought.</p>
    <label className="kas-field">Email
      <input type="email" inputMode="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} data-autofocus placeholder="you@example.com" />
    </label>
    <div className="ka-turnstile" ref={ts.box} />
    {error && <p className="kas-co-error" role="alert">{error}</p>}
    <button type="submit" className="kas-buy kas-co-pay" disabled={working}>{working ? 'Sending…' : 'Email my links'}</button>
  </form>;
}
