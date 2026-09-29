// Placeholder until Phase 3 lands the real checkout flow in this file.
import { useRef } from 'react';
import { useFocusTrap } from './hooks';
import type { Currency, Product } from './api';

type Req = { mode: 'buy'; product: Product; currency: Currency } | { mode: 'resend' };
export default function Checkout({ request, onClose }: { request: Req; onClose(): void }){
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true, onClose);
  return <div className="kas-modal" role="dialog" aria-modal="true" aria-label="Checkout" ref={ref}>
    <div className="kas-modal-backdrop" onClick={onClose} />
    <div className="kas-modal-card">
      <h2>{request.mode === 'buy' ? request.product.title : 'Your download links'}</h2>
      <p>Checkout is being set up.</p>
      <button type="button" className="kas-btn" onClick={onClose} data-autofocus>Close</button>
    </div>
  </div>;
}
