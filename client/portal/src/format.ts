// Display formatting. Stored times are UTC; the portal shows Asia/Kolkata. Money is integer minor units.
export const TZ = 'Asia/Kolkata';
const moneyFmt: Record<string, Intl.NumberFormat> = {};
export function money(minor: number | string | null | undefined, currency: string){
  const n = Number(minor || 0);
  const f = moneyFmt[currency] ||= new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, minimumFractionDigits: 2 });
  return f.format(n / 100);
}
export function moneyCompact(minor: number, currency: string){
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100);
}
const dt = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const d = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
export const dateTime = (v: string | number | Date | null | undefined) => (v ? dt.format(new Date(v)) : '—');
export const date = (v: string | number | Date | null | undefined) => (v ? d.format(new Date(v)) : '—');
export function ago(v: string | number | Date | null | undefined){
  if (!v) return '—';
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return date(v);
}
export function bytes(n: number | null | undefined){
  if (n === null || n === undefined) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1){ v /= 1024; i++; }
  return `${v < 10 && i ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}
export const num = (n: number) => new Intl.NumberFormat('en-IN').format(n);
export function todayIST(offsetDays = 0){
  const t = new Date(Date.now() + offsetDays * 864e5);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(t);
}
// "₹499.00" → 49900 (minor units); '' → null. Accepts "499", "499.5", "1,299.00".
export function parseMoney(s: string): number | null {
  const t = String(s).replace(/[^\d.]/g, '');
  if (!t) return null;
  const n = Math.round(parseFloat(t) * 100);
  return Number.isFinite(n) ? n : null;
}
export const minorToInput = (n: number | null | undefined) => (n === null || n === undefined ? '' : (n / 100).toFixed(2));
export const pct = (bp: number) => `${(bp / 100).toFixed(bp % 100 ? 1 : 0)}%`;
