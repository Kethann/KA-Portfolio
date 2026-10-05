// License seals: every order has a permanent public code (KA-XXXXX-XXXXX, 50 random bits) that the seal on
// the checkout pass, the download page and LICENSE.txt point to. /license/<code> (handlers/license.js) shows
// whether that license is valid and who holds it. The code is random and stored, not derived from a secret,
// so rotating any server secret never breaks a license someone already printed.
import { getDb } from '../core/db.js';
import { CODE_ALPHABET, normalizeLicenseCode, sealSvg } from '../../shared/seal.js';

export { normalizeLicenseCode, sealSvg };

export function newLicenseCode(){
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b & 31];
  return `KA-${s.slice(0, 5)}-${s.slice(5)}`;
}

export const licenseUrl = (siteUrl, code) => `${String(siteUrl || '').replace(/\/+$/, '')}/license/${code}`;

// The order's code, creating it the first time (orders made before seals existed). Safe to race: only one
// write can fill an empty code, and a clash with another order's code (1 in 2^50) just tries again.
export async function ensureLicenseCode(db, orderId){
  for (let attempt = 0; attempt < 4; attempt++){
    const row = await db.maybeOne('select license_code from orders where id = $1', [orderId]);
    if (!row) return null;
    if (row.license_code) return row.license_code;
    try { await db.query('update orders set license_code = $2 where id = $1 and license_code is null', [orderId, newLicenseCode()]); }
    catch (err){ if (!/unique|constraint/i.test(String(err && err.message))) throw err; }
  }
  const row = await db.maybeOne('select license_code from orders where id = $1', [orderId]);
  return row?.license_code || null;
}

// { code, url } for an order, or null when it isn't (or is no longer) a valid license
export async function licenseFor(orderId, siteUrl){
  const db = await getDb();
  const o = await db.maybeOne('select status from orders where id = $1', [orderId]);
  if (!o || !['paid', 'delivered'].includes(o.status)) return null;
  const code = await ensureLicenseCode(db, orderId);
  return code ? { code, url: licenseUrl(siteUrl, code) } : null;
}

// "k•••@gmail.com": enough for the holder to recognise, not enough to contact them
export function maskEmail(email){
  const [local = '', domain = ''] = String(email || '').split('@');
  return local && domain ? `${local[0]}•••@${domain}` : '';
}

// Name typed at checkout for the license: printable text only, single spaces, up to 80 characters.
export function cleanHolder(value){
  if (typeof value !== 'string') return null;
  const t = value.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return t || null;
}
