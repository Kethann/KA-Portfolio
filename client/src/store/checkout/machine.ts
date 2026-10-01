// Checkout state machine: one explicit phase at a time, no scattered booleans.
//
//   loading --QUOTED--> idle --SUBMIT--> validating --VALID--> creating
//      |                 ^                  |                     |-- ORDER_FREE --> success
//   QUOTE_FAILED         |<----INVALID------+                     |-- ORDER_FAILED -> failed
//      v                 |                                        '-- ORDER_CREATED -> paying
//     idle               |                                               |-- PAID --> confirming --CONFIRMED--> success
//                        |                                               |-- DISMISSED --> cancelled (or failed if an attempt failed)
//                        |                                               '-- PAY_FAILED --> failed      '--CONFIRM_FAILED--> failed
//                        '------------------------- RETRY (from failed / cancelled) ---------------------'
// Events that don't belong to the current phase are ignored, which is what makes double
// submits and late callbacks harmless.
import type { Currency } from '../api';

export interface Quote { currency: Currency; subtotal: number; discount: number; tax: number; taxIncluded: number; taxLabel: string; total: number; free: boolean; onSale: boolean; compareAt: number | null; codes: { code: string; amount: number }[]; needsEmail: boolean }
export interface OrderResult { orderId: string; clientSecret: string; free: boolean; demo?: boolean; downloadUrl?: string | null; emailed?: boolean; razorpay?: { keyId: string; orderId: string; amount: number; currency: Currency; name: string; description: string; email: string } }
export interface PaymentMethod { type: string; network?: string; last4?: string; detail?: string }
// emailed: the delivery email was accepted by the mail service (false = it's retried; the on-screen link works now)
export interface Success { orderId: string; downloadUrl: string | null; method: PaymentMethod | null; total: number; currency: Currency; free: boolean; emailed: boolean }

export type Phase = 'loading' | 'idle' | 'validating' | 'creating' | 'paying' | 'confirming' | 'success' | 'failed' | 'cancelled';
export interface State { phase: Phase; quote: Quote | null; notice: string; order: OrderResult | null; success: Success | null; failure: string; attemptFailed: string }
export type Event =
  | { type: 'QUOTED'; quote: Quote } | { type: 'QUOTE_FAILED'; error: string }
  | { type: 'SUBMIT' } | { type: 'INVALID'; error?: string } | { type: 'VALID' }
  | { type: 'ORDER_CREATED'; order: OrderResult } | { type: 'ORDER_FREE'; success: Success } | { type: 'ORDER_FAILED'; error: string }
  | { type: 'ATTEMPT_FAILED'; error: string } | { type: 'PAID' } | { type: 'DISMISSED' } | { type: 'PAY_FAILED'; error: string }
  | { type: 'CONFIRMED'; success: Success } | { type: 'CONFIRM_FAILED'; error: string } | { type: 'RETRY' };

export const initialState: State = { phase: 'loading', quote: null, notice: '', order: null, success: null, failure: '', attemptFailed: '' };

export function reduce(s: State, e: Event): State {
  switch (s.phase){
    case 'loading':
      if (e.type === 'QUOTED') return { ...s, phase: 'idle', quote: e.quote, notice: '' };
      if (e.type === 'QUOTE_FAILED') return { ...s, phase: 'idle', notice: e.error };
      return s;
    case 'idle':
      if (e.type === 'QUOTED') return { ...s, quote: e.quote, notice: '' };
      if (e.type === 'QUOTE_FAILED') return { ...s, notice: e.error };
      if (e.type === 'SUBMIT' && s.quote) return { ...s, phase: 'validating', notice: '' };
      return s;
    case 'validating':
      if (e.type === 'INVALID') return { ...s, phase: 'idle', notice: e.error || '' };
      if (e.type === 'VALID') return { ...s, phase: 'creating' };
      return s;
    case 'creating':
      if (e.type === 'ORDER_CREATED') return { ...s, phase: 'paying', order: e.order, attemptFailed: '' };
      if (e.type === 'ORDER_FREE') return { ...s, phase: 'success', success: e.success };
      if (e.type === 'ORDER_FAILED') return { ...s, phase: 'failed', failure: e.error };
      return s;
    case 'paying':
      if (e.type === 'ATTEMPT_FAILED') return { ...s, attemptFailed: e.error };   // Razorpay lets the buyer retry inside its window
      if (e.type === 'PAID') return { ...s, phase: 'confirming' };
      if (e.type === 'PAY_FAILED') return { ...s, phase: 'failed', failure: e.error };
      if (e.type === 'DISMISSED') return s.attemptFailed ? { ...s, phase: 'failed', failure: s.attemptFailed } : { ...s, phase: 'cancelled' };
      return s;
    case 'confirming':
      if (e.type === 'CONFIRMED') return { ...s, phase: 'success', success: e.success };
      if (e.type === 'CONFIRM_FAILED') return { ...s, phase: 'failed', failure: e.error };
      return s;
    case 'failed': case 'cancelled':
      if (e.type === 'RETRY') return { ...s, phase: 'idle', order: null, failure: '', attemptFailed: '', notice: '' };
      if (e.type === 'QUOTED') return { ...s, quote: e.quote };
      return s;
    case 'success':
      return s;
  }
}

export const stepOf = (p: Phase) => (p === 'success' ? 2 : ['creating', 'paying', 'confirming', 'failed', 'cancelled'].includes(p) ? 1 : 0);
export const isStage = (p: Phase) => !['loading', 'idle', 'validating'].includes(p);
