// Coupon rules. evaluateCoupons() is pure (no I/O) so every rule is unit-tested; createOrder()
// calls it again inside a transaction with the coupon rows locked (SELECT ... FOR UPDATE), which
// is what makes usage limits race-safe. All math is integer minor units.
import { HttpError } from '../core/http.js';
import { formatMoney } from './pricing.js';

export const MAX_CODES = 3;

export function normalizeCodes(codes){
  if (codes === undefined || codes === null || codes === '') return [];
  const list = Array.isArray(codes) ? codes : [codes];
  if (list.length > MAX_CODES) throw new HttpError(400, 'Too many codes.');
  const clean = list.map(c => (typeof c === 'string' ? c.trim().toUpperCase() : '')).filter(Boolean);
  for (const c of clean) if (!/^[A-Z0-9_-]{3,32}$/.test(c)) throw new HttpError(400, 'That code isn’t valid.', { code: 'coupon_invalid' });
  return [...new Set(clean)];
}

const reject = (message) => { throw new HttpError(400, message, { code: 'coupon_rejected' }); };

// ctx: { product, currency, subtotal, email|null, now, usage: { [couponId]: { byEmail } },
//        hasPriorOrders: boolean|null, allowStacking }
// Returns { discount, applied: [{ id, code, amount }], needsEmail }.
export function evaluateCoupons(coupons, ctx){
  const { product, currency, subtotal, now } = ctx;
  if (!coupons.length) return { discount: 0, applied: [], needsEmail: false };
  if (subtotal <= 0) reject('This item is already free, so no code is needed.');
  if (coupons.length > 1 && (!ctx.allowStacking || coupons.some(c => !c.stackable))) reject('Only one code can be used per order.');
  const cur = currency === 'USD' ? 'usd' : 'inr';
  let remaining = subtotal, needsEmail = false;
  const applied = [];
  for (const c of coupons){
    if (c.paused) reject(`${c.code} isn’t active right now.`);
    if (c.starts_at && new Date(c.starts_at) > now) reject(`${c.code} isn’t active yet.`);
    if (c.ends_at && new Date(c.ends_at) <= now) reject(`${c.code} has expired.`);
    if (!(c.currencies || []).includes(currency)) reject(`${c.code} can’t be used with ${currency}.`);
    const scope = c.applies_to || 'all';
    const fits = scope === 'all'
      || (scope === 'products' && (c.product_ids || []).includes(product.id))
      || (scope === 'category' && c.category_id && c.category_id === product.category_id)
      || (scope === 'artzz' && product.kind === 'artzz')
      || (scope === 'artifacts' && product.kind === 'artifacts');
    if (!fits) reject(`${c.code} doesn’t apply to this item.`);
    const min = c[`min_order_${cur}`] || 0;
    if (subtotal < min) reject(`${c.code} needs an order of at least ${formatMoney(min, currency)}.`);
    if (c.max_uses !== null && c.max_uses !== undefined && c.used_count >= c.max_uses) reject(`${c.code} has been fully used.`);
    if (c.per_email_limit || c.first_order_only){
      if (!ctx.email) needsEmail = true;
      else {
        const used = ctx.usage?.[c.id]?.byEmail || 0;
        if (c.per_email_limit && used >= c.per_email_limit) reject(`You’ve already used ${c.code}.`);
        if (c.first_order_only && ctx.hasPriorOrders) reject(`${c.code} is for first orders only.`);
      }
    }
    let amount;
    if (c.kind === 'percent'){
      amount = Math.floor((remaining * c.percent_bp) / 10000);
    } else {
      const fixed = c[`amount_${cur}`];
      if (!Number.isSafeInteger(fixed) || fixed <= 0) reject(`${c.code} can’t be used with ${currency}.`);
      amount = fixed;
    }
    const cap = c[`max_discount_${cur}`];
    if (Number.isSafeInteger(cap) && cap > 0) amount = Math.min(amount, cap);
    amount = Math.max(0, Math.min(amount, remaining));
    remaining -= amount;
    applied.push({ id: c.id, code: c.code, amount });
  }
  return { discount: subtotal - remaining, applied, needsEmail };
}
