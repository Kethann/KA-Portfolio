// Checkout dialog: email -> optional code -> Razorpay Checkout -> server verification -> link.
// Every number shown here comes from the server's quote; the browser only sends ids and codes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from './hooks';
import { postJson, formatPrice, ApiError, type Currency, type Product } from './api';

type Req = { mode: 'buy'; product: Product; currency: Currency; opener?: HTMLElement | null } | { mode: 'resend'; opener?: HTMLElement | null };
interface Quote { currency: Currency; subtotal: number; discount: number; tax: number; taxIncluded: number; taxLabel: string; total: number; free: boolean; onSale: boolean; compareAt: number | null; codes: { code: string; amount: number }[]; needsEmail: boolean }
interface OrderResult { orderId: string; clientSecret: string; free: boolean; downloadUrl?: string | null; razorpay?: { keyId: string; orderId: string; amount: number; currency: Currency; name: string; description: string; email: string } }
interface Status { orderId: string; status: string; downloadUrl: string | null }
type Widget = { token(): string; reset(): void; remove(): void };
type View = { kind: 'form' } | { kind: 'paying' } | { kind: 'confirming' } | { kind: 'done'; orderId: string; downloadUrl: string | null; free: boolean }
  | { kind: 'failed'; message: string } | { kind: 'cancelled' } | { kind: 'resent'; message: string };

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open(): void; on(event: string, fn: (resp: { error?: { description?: string } }) => void): void } } }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
let razorpayScript: Promise<void> | null = null;
function loadRazorpay(){
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScript) razorpayScript = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.async = true;
    s.onload = () => window.Razorpay ? resolve() : reject(new Error('Payment window unavailable'));
    s.onerror = () => { razorpayScript = null; reject(new Error('Payment window could not load')); };
    document.head.appendChild(s);
  });
  return razorpayScript;
}

function useTurnstile(){
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<Widget | null>(null);
  useEffect(() => {
    let alive = true;
    if (box.current && window.kaTurnstile) window.kaTurnstile(box.current).then(w => { if (alive) widget.current = w; else w.remove(); }).catch(() => {});
    return () => { alive = false; widget.current?.remove(); widget.current = null; };
  }, []);
  return { box, token: () => widget.current?.token() || '', reset: () => widget.current?.reset() };
}

export default function Checkout({ request, onClose }: { request: Req; onClose(): void }){
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ kind: 'form' });
  const busy = view.kind === 'paying' || view.kind === 'confirming';
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useFocusTrap(ref, true, close, request.opener);
  const title = request.mode === 'buy' ? request.product.title : 'Get your download links';
  return <div className="kas-modal" role="dialog" aria-modal="true" aria-labelledby="kas-co-title" ref={ref}>
    <div className="kas-modal-backdrop" onClick={close} />
    <div className="kas-modal-card kas-co">
      <button type="button" className="kas-co-close" onClick={close} aria-label="Close" disabled={busy}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      <h2 id="kas-co-title">{title}</h2>
      {request.mode === 'resend' ? <Resend setView={setView} view={view} onClose={onClose} />
        : <Buy product={request.product} currency={request.currency} view={view} setView={setView} onClose={onClose} />}
    </div>
  </div>;
}

function Buy({ product, currency, view, setView, onClose }: { product: Product; currency: Currency; view: View; setView(v: View): void; onClose(): void }){
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('ka-buyer-email') || ''; } catch { return ''; } });
  const [emailError, setEmailError] = useState('');
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [codeError, setCodeError] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const ts = useTurnstile();
  const emailRef = useRef<HTMLInputElement>(null);

  const requestQuote = useCallback(async (list: string[]) => {
    const q = await postJson<Quote>('/api/checkout/quote', { productId: product.id, currency, codes: list, email: EMAIL.test(email.trim()) ? email.trim() : undefined, turnstileToken: list.length ? ts.token() : undefined });
    if (list.length) ts.reset();
    return q;
  }, [product.id, currency, email, ts]);

  useEffect(() => { requestQuote([]).then(setQuote).catch((e: Error) => setError(e.message)); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [product.id, currency]);

  const applyCode = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setCodeError(''); setWorking(true);
    try { const next = [...codes.filter(x => x !== c), c]; setQuote(await requestQuote(next)); setCodes(next); setCode(''); }
    catch (e) { setCodeError((e as Error).message); }
    finally { setWorking(false); }
  };
  const removeCode = async (c: string) => {
    const next = codes.filter(x => x !== c);
    setCodes(next); setWorking(true);
    try { setQuote(await requestQuote(next)); } catch (e) { setError((e as Error).message); } finally { setWorking(false); }
  };

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!EMAIL.test(addr)){ setEmailError('Enter the email where your download link should go.'); emailRef.current?.focus(); return; }
    setEmailError(''); setError(''); setWorking(true);
    try { localStorage.setItem('ka-buyer-email', addr); } catch {}
    let order: OrderResult;
    try {
      order = await postJson<OrderResult>('/api/checkout/order', { productId: product.id, currency, email: addr, codes, turnstileToken: ts.token() });
    } catch (err){
      ts.reset(); setWorking(false);
      setError((err as Error).message);
      if (err instanceof ApiError && err.code === 'coupon_rejected') setCodeError((err as Error).message);
      return;
    }
    ts.reset();
    if (order.free){ setWorking(false); setView({ kind: 'done', orderId: order.orderId, downloadUrl: order.downloadUrl || null, free: true }); return; }
    try { await loadRazorpay(); } catch {
      setWorking(false); cancelOrder(order);
      setView({ kind: 'failed', message: 'The payment window couldn’t load. Nothing was charged. Check your connection and try again.' }); return;
    }
    setView({ kind: 'paying' });
    let settled = false;
    const rp = order.razorpay!;
    const rzp = new window.Razorpay!({
      key: rp.keyId, order_id: rp.orderId, amount: rp.amount, currency: rp.currency, name: rp.name, description: rp.description,
      prefill: { email: rp.email }, notes: { order: order.orderId }, theme: { color: '#c9864f' },
      retry: { enabled: true, max_count: 3 },
      handler: async (resp: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        settled = true;
        setView({ kind: 'confirming' });
        try {
          const first = await postJson<Status>('/api/checkout/verify', { orderId: order.orderId, clientSecret: order.clientSecret, ...resp });
          const final = await waitForDelivery(order, first);
          setView({ kind: 'done', orderId: order.orderId, downloadUrl: final.downloadUrl, free: false });
        } catch (err){
          setView({ kind: 'failed', message: (err as Error).message || 'We couldn’t confirm the payment yet. If money was taken, your link will be emailed automatically.' });
        }
        setWorking(false);
      },
      modal: {
        escape: true, confirm_close: true,
        ondismiss: () => { if (settled) return; setWorking(false); cancelOrder(order); setView({ kind: 'cancelled' }); }
      }
    });
    rzp.on('payment.failed', (resp) => {
      // Razorpay lets the buyer retry inside the window; this only reports the latest attempt.
      setError(resp.error?.description ? `Payment failed: ${resp.error.description}` : 'Payment failed. You can try again.');
    });
    rzp.open();
  };

  if (view.kind === 'done') return <Done orderId={view.orderId} downloadUrl={view.downloadUrl} free={view.free} email={email.trim()} onClose={onClose} />;
  if (view.kind === 'failed' || view.kind === 'cancelled') return <div className="kas-co-result" role="status">
    <p className="kas-co-lead">{view.kind === 'cancelled' ? 'Payment cancelled. Nothing was charged.' : view.message}</p>
    <div className="kas-co-actions"><button type="button" className="kas-buy" data-autofocus onClick={() => { setError(''); setView({ kind: 'form' }); }}>Try again</button>
      <button type="button" className="kas-btn is-ghost" onClick={onClose}>Close</button></div>
  </div>;
  if (view.kind === 'paying' || view.kind === 'confirming') return <div className="kas-co-result" role="status" aria-live="polite">
    <span className="kas-spinner" aria-hidden="true" />
    <p className="kas-co-lead">{view.kind === 'paying' ? 'Complete the payment in the Razorpay window.' : 'Payment received. Confirming it with Razorpay…'}</p>
    {error && <p className="kas-co-error" role="alert">{error}</p>}
  </div>;

  const media = product.media[0];
  return <form className="kas-co-form" onSubmit={pay} noValidate>
    <div className="kas-co-item">
      {media ? <img src={media.url} alt="" width={64} height={80} /> : <span className="kas-img-empty" />}
      <div><strong>{product.title}</strong>{product.license && <small>{product.license.name} license</small>}</div>
    </div>
    <label className="kas-field">Email for your download link
      <input ref={emailRef} type="email" inputMode="email" autoComplete="email" required maxLength={254} value={email}
        onChange={e => setEmail(e.target.value)} aria-invalid={!!emailError} aria-describedby="kas-co-email-err" data-autofocus={!email || undefined} placeholder="you@example.com" />
      <span id="kas-co-email-err" className="kas-co-error" role={emailError ? 'alert' : undefined}>{emailError}</span>
    </label>
    {!quote?.free || codes.length ? <div className="kas-co-code">
      {!codeOpen ? <button type="button" className="kas-link" onClick={() => setCodeOpen(true)}>Have a code?</button> : <>
        <label className="kas-field">Discount code
          <span className="kas-co-code-row">
            <input value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" spellCheck={false} maxLength={32}
              onKeyDown={e => { if (e.key === 'Enter'){ e.preventDefault(); applyCode(); } }} aria-describedby="kas-co-code-err" autoFocus />
            <button type="button" className="kas-btn" onClick={applyCode} disabled={working || !code.trim()}>Apply</button>
          </span>
          <span id="kas-co-code-err" className="kas-co-error" role={codeError ? 'alert' : undefined}>{codeError}</span>
        </label>
        {codes.length > 0 && <ul className="kas-co-codes">{codes.map(c => <li key={c}>{c}<button type="button" onClick={() => removeCode(c)} aria-label={`Remove ${c}`}>×</button></li>)}</ul>}
      </>}
    </div> : null}
    <dl className="kas-co-lines" aria-live="polite">
      {!quote ? <><dt>Total</dt><dd>…</dd></> : <>
        {quote.discount > 0 || quote.tax > 0 ? <><dt>Price</dt><dd>{formatPrice(quote.subtotal, quote.currency)}</dd></> : null}
        {quote.discount > 0 && <><dt>Discount</dt><dd>−{formatPrice(quote.discount, quote.currency)}</dd></>}
        {quote.tax > 0 && <><dt>{quote.taxLabel}</dt><dd>{formatPrice(quote.tax, quote.currency)}</dd></>}
        <dt className="is-total">Total</dt><dd className="is-total">{quote.free ? 'Free' : formatPrice(quote.total, quote.currency)}</dd>
        {quote.taxIncluded > 0 && <><dt className="is-note">Includes {quote.taxLabel}</dt><dd className="is-note">{formatPrice(quote.taxIncluded, quote.currency)}</dd></>}
      </>}
    </dl>
    <div className="ka-turnstile" ref={ts.box} />
    {error && <p className="kas-co-error" role="alert">{error}</p>}
    <button type="submit" className="kas-buy kas-co-pay" disabled={working || !quote}>
      {working ? 'Working…' : !quote ? 'Loading…' : quote.free ? 'Get it free' : `Pay ${formatPrice(quote.total, quote.currency)}`}
    </button>
    <p className="kas-co-fine">Secure payment by Razorpay. By continuing you agree to the <a href="/legal/terms" target="_blank" rel="noopener">Terms</a>, <a href="/legal/refunds" target="_blank" rel="noopener">Refund policy</a> and the item’s license. Your file is delivered by email as a download link.</p>
  </form>;
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
  if (!['delivered', 'paid'].includes(last.status)) throw new Error('Your payment is being confirmed. Your download link will arrive by email within a few minutes. Order ' + order.orderId + '.');
  if (!link){ last = await postJson<Status>('/api/checkout/status', { orderId: order.orderId, clientSecret: order.clientSecret }); link = last.downloadUrl; }
  return { ...last, downloadUrl: link };
}

function Done({ orderId, downloadUrl, free, email, onClose }: { orderId: string; downloadUrl: string | null; free: boolean; email: string; onClose(): void }){
  return <div className="kas-co-result" role="status">
    <span className="kas-co-check" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
    <p className="kas-co-lead">{free ? 'It’s yours.' : 'Payment confirmed. Thank you!'}</p>
    <p>Order <strong>{orderId}</strong>. A download link{free ? '' : ' and your receipt'} {email ? <>were sent to <strong>{email}</strong></> : 'were emailed to you'}.</p>
    <div className="kas-co-actions">
      {downloadUrl && <a className="kas-buy" href={downloadUrl} data-autofocus>Download now</a>}
      <button type="button" className={downloadUrl ? 'kas-btn is-ghost' : 'kas-buy'} onClick={onClose} data-autofocus={!downloadUrl || undefined}>Done</button>
    </div>
  </div>;
}

function Resend({ view, setView, onClose }: { view: View; setView(v: View): void; onClose(): void }){
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('ka-buyer-email') || ''; } catch { return ''; } });
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const ts = useTurnstile();
  if (view.kind === 'resent') return <div className="kas-co-result" role="status"><p className="kas-co-lead">{view.message}</p>
    <div className="kas-co-actions"><button type="button" className="kas-buy" onClick={onClose} data-autofocus>Done</button></div></div>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())){ setError('Enter the email you used to buy.'); return; }
    setWorking(true); setError('');
    try { const r = await postJson<{ message: string }>('/api/downloads/resend', { email: email.trim(), turnstileToken: ts.token() }); setView({ kind: 'resent', message: r.message }); }
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
