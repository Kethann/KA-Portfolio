// Store data access + shared types. Prices always come from the server as integer minor units.
export type Currency = 'INR' | 'USD';
export interface Price { currency: Currency; amount: number; compareAt: number | null; onSale: boolean; saleEndsAt: string | null; free: boolean; available: boolean; percentOff: number }
export interface Media { url: string; alt: string; width: number | null; height: number | null }
export interface Product {
  id: string; slug: string; kind: 'artzz' | 'artifacts'; title: string; summary: string; description: string;
  category: { slug: string; name: string } | null; tags: string[]; techTags: string[]; version: string;
  sellable: boolean; free: boolean; prices: Record<Currency, Price>;
  license: { key: string; name: string; summary: string } | null; demoUrl: string; previewUrl: string; media: Media[];
  delivery: { linkHours: number; maxDownloads: number };
}
export interface Category { kind: string; slug: string; name: string }
export interface TipSummary { slug: string; title: string; excerpt: string; coverUrl: string; tags: string[]; publishedAt: string | null; category: { slug: string; name: string } | null }
export interface Tip extends TipSummary { html: string }
export interface PublicConfig { turnstileSiteKey?: string; razorpayKeyId?: string; country?: string | null; suggestedCurrency?: Currency; store?: { enabled: boolean } }

declare global {
  interface Window {
    kaApiUrl?: (path: string) => string;
    kaPublicConfig?: () => Promise<PublicConfig>;
    kaTurnstile?: (el: HTMLElement) => Promise<{ token(): string; reset(): void; remove(): void }>;
    kaToast?: (text: string, state?: string) => void;
  }
}

export const apiUrl = (path: string) => (window.kaApiUrl ? window.kaApiUrl(path) : path);

export class ApiError extends Error { constructor(message: string, public status: number, public code?: string){ super(message); } }

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T>{
  const res = await fetch(apiUrl(path), { headers: { Accept: 'application/json' }, signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || 'Something went wrong. Please try again.', res.status, body.code);
  return body as T;
}

export async function postJson<T>(path: string, data: unknown, signal?: AbortSignal): Promise<T>{
  const res = await fetch(apiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data), signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error || 'Something went wrong. Please try again.', res.status, body.code);
  return body as T;
}

export function publicConfig(): Promise<PublicConfig>{
  return window.kaPublicConfig ? window.kaPublicConfig() : getJson<PublicConfig>('/api/public-config').catch(() => ({}));
}

// ---- currency: suggested by country, overridable by the visitor, remembered on this device.
const CURRENCY_KEY = 'ka-currency';
const listeners = new Set<(c: Currency) => void>();
let current: Currency | null = null;
export function savedCurrency(): Currency | null {
  try { const v = localStorage.getItem(CURRENCY_KEY); return v === 'INR' || v === 'USD' ? v : null; } catch { return null; }
}
export function getCurrency(): Currency | null { return current ?? savedCurrency(); }
export function setCurrency(c: Currency, remember = true){
  current = c;
  if (remember) try { localStorage.setItem(CURRENCY_KEY, c); } catch { /* private mode: keep in memory */ }
  listeners.forEach(fn => fn(c));
}
export function onCurrency(fn: (c: Currency) => void){ listeners.add(fn); return () => { listeners.delete(fn); }; }

export function formatPrice(amount: number, currency: Currency){
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, minimumFractionDigits: amount % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(amount / 100);
}
export function formatDate(iso: string | null){
  if (!iso) return '';
  try { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); } catch { return ''; }
}
