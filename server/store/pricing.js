// The ONE place product prices are worked out. The catalog shows these numbers and checkout
// charges these numbers; the browser never supplies a price. All amounts are integer minor
// units (paise for INR, cents for USD). Each currency has its own manually set price: nothing
// is ever converted.

export const CURRENCIES = ['INR', 'USD'];

// A product's price in one currency, right now:
//   { currency, amount, compareAt|null, onSale, saleEndsAt|null, free, available }
// `available` is false when the product can't be bought in that currency (view-only, draft,
// or no price set), so callers never have to guess.
export function priceFor(product, currency, now = new Date()){
  const cur = currency === 'USD' ? 'usd' : 'inr';
  const base = { currency, amount: 0, compareAt: null, onSale: false, saleEndsAt: null, free: false, available: false };
  if (!product || !product.sellable || product.status !== 'published') return base;
  if (product.is_free) return { ...base, free: true, available: true };
  const regular = product[`price_${cur}`];
  if (!Number.isSafeInteger(regular) || regular <= 0) return base;
  const sale = product[`sale_price_${cur}`];
  const started = !product.sale_starts_at || new Date(product.sale_starts_at) <= now;
  const notEnded = !product.sale_ends_at || new Date(product.sale_ends_at) > now;
  if (Number.isSafeInteger(sale) && sale >= 0 && sale < regular && started && notEnded){
    return { ...base, amount: sale, compareAt: regular, onSale: true, saleEndsAt: product.sale_ends_at ? new Date(product.sale_ends_at).toISOString() : null, available: true };
  }
  return { ...base, amount: regular, available: true };
}

// Whole percent saved, rounded down (a badge never overstates the discount).
export function percentOff(p){
  if (!p.onSale || !p.compareAt) return 0;
  return Math.floor(((p.compareAt - p.amount) * 100) / p.compareAt);
}

// Display helper used in emails and receipts (the storefront formats with Intl in the browser).
export function formatMoney(amount, currency){
  const major = amount / 100;
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, minimumFractionDigits: amount % 100 ? 2 : 0 }).format(major);
}
