// Store + Tips bundle (dist/assets/store.js), loaded the first time either page is opened.
// Each view renders in its own shadow root so its styles can't touch the rest of the site.
import { createRoot, type Root } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { lazy, Suspense, useState, useEffect } from 'react';
import storeCss from './store.css?inline';
import { Store } from './Store';
import { Tips } from './Tips';
import type { Currency, Product } from './api';
import { overlayLayer } from './overlay';

const Checkout = lazy(() => import('./Checkout'));

type CheckoutRequest = { mode: 'buy'; product: Product; currency: Currency; opener?: HTMLElement | null } | { mode: 'resend'; opener?: HTMLElement | null };
let requestCheckout: ((r: CheckoutRequest | null) => void) | null = null;

function CheckoutHost(){
  const [req, setReq] = useState<CheckoutRequest | null>(null);
  useEffect(() => { requestCheckout = setReq; return () => { requestCheckout = null; }; }, []);
  if (!req) return null;
  return createPortal(<Suspense fallback={null}><Checkout request={req} onClose={() => setReq(null)} /></Suspense>, overlayLayer());
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
      onBuy={(product, currency, opener) => requestCheckout?.({ mode: 'buy', product, currency, opener })}
      onResend={(opener) => requestCheckout?.({ mode: 'resend', opener })} />
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
