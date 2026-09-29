// Card helpers for the LOCAL DEMO payment window only. Real card details are only ever typed into
// Razorpay's own secure window; this site never collects, sends, stores or logs card numbers or CVV.
export type Brand = 'visa' | 'mastercard' | 'amex' | 'rupay' | 'discover' | 'unknown';
export const BRAND_NAMES: Record<Brand, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', rupay: 'RuPay', discover: 'Discover', unknown: 'Card' };

export function detectBrand(digits: string): Brand {
  const d = digits.replace(/\D/g, '');
  if (/^3[47]/.test(d)) return 'amex';
  if (/^(508[5-9]|6069(8[5-9]|9)|607[0-8]|6080|65(2[1-9]|30)|81|82)/.test(d)) return 'rupay';
  if (/^4/.test(d)) return 'visa';
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(d)) return 'mastercard';
  if (/^(6011|65|64[4-9]|622)/.test(d)) return 'discover';
  return 'unknown';
}
export const maxDigits = (b: Brand) => (b === 'amex' ? 15 : b === 'unknown' ? 19 : 16);
export const cvvLength = (b: Brand) => (b === 'amex' ? 4 : 3);

// 4-4-4-4, or 4-6-5 for Amex
export function formatNumber(digits: string, b: Brand){
  const d = digits.replace(/\D/g, '').slice(0, maxDigits(b));
  const groups = b === 'amex' ? [4, 6, 5] : [4, 4, 4, 4, 3];
  const out: string[] = [];
  let i = 0;
  for (const g of groups){ if (i >= d.length) break; out.push(d.slice(i, i + g)); i += g; }
  return out.join(' ');
}

export function luhn(digits: string){
  const d = digits.replace(/\D/g, '');
  if (d.length < 12) return false;
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--){
    let n = d.charCodeAt(i) - 48;
    if (alt){ n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

export function formatExpiry(raw: string){
  const d = raw.replace(/\D/g, '').slice(0, 4);
  if (d.length === 1 && Number(d) > 1) return '0' + d + '/';
  return d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}
// valid MM/YY that is this month or later (cards expire at the end of the month)
export function expiryValid(v: string, now = new Date()){
  const m = /^(\d{2})\/(\d{2})$/.exec(v);
  if (!m) return false;
  const month = Number(m[1]), year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const end = new Date(year, month, 1);          // first day after the expiry month
  return end > now && year < now.getFullYear() + 20;
}
export const nameValid = (v: string) => /^[A-Za-z][A-Za-z .'-]{1,48}$/.test(v.trim());

// Test cards for demo mode: 4000 0000 0000 0002 declines, any other valid number approves.
export const DECLINE_TEST = '4000000000000002';
