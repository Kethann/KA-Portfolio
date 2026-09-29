// Store + Tips bundle (dist/assets/store.js), loaded the first time either page is opened.
// Each view renders in its own shadow root so its styles can't touch the rest of the site.
import { createRoot, type Root } from 'react-dom/client';
import { lazy, Suspense, useState, useEffect } from 'react';
import storeCss from './store.css?inline';
import { Store } from './Store';
import { Tips } from './Tips';
import type { Currency, Product } from './api';

const Checkout = lazy(() => import('./Checkout'));

type CheckoutRequest = { mode: 'buy'; product: Product; currency: Currency } | { mode: 'resend' };
let requestCheckout: ((r: CheckoutRequest | null) => void) | null = null;

function CheckoutHost(){
  const [req, setReq] = useState<CheckoutRequest | null>(null);
  useEffect(() => { requestCheckout = setReq; return () => { requestCheckout = null; }; }, []);
  if (!req) return null;
  return <Suspense fallback={null}><Checkout request={req} onClose={() => setReq(null)} /></Suspense>;
}

function shadowHost(container: HTMLElement){
  const host = document.createElement('div');
  host.className = 'ka-store-host';
  container.replaceChildren(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = storeCss;
  const target = document.createElement('div');
  shadow.append(style, target);
  return { host, target };
}

export function mountStore(container: HTMLElement, options: { initialProduct?: string | null } = {}){
  const { host, target } = shadowHost(container);
  const root: Root = createRoot(target);
  root.render(<>
    <Store initialProduct={options.initialProduct}
      onBuy={(product, currency) => requestCheckout?.({ mode: 'buy', product, currency })}
      onResend={() => requestCheckout?.({ mode: 'resend' })} />
    <CheckoutHost />
  </>);
  return { dispose(){ root.unmount(); host.remove(); } };
}

export function mountTips(container: HTMLElement, options: { initialTip?: string | null } = {}){
  const { host, target } = shadowHost(container);
  const root: Root = createRoot(target);
  root.render(<Tips initialTip={options.initialTip} />);
  return { dispose(){ root.unmount(); host.remove(); } };
}
