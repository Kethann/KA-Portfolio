// Small, strict input validators. Everything from the browser is untrusted; each helper either
// returns a clean value or throws a 400 with a message a person can act on.
import { HttpError } from './http.js';

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function str(value, { name = 'This field', max = 1000, min = 0, required = false, trim = true } = {}){
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be text.`);
  const v = trim ? value.trim() : value;
  if (required && !v) throw new HttpError(400, `${name} is required.`);
  if (v.length > max) throw new HttpError(400, `${name} must be ${max} characters or fewer.`);
  if (v && v.length < min) throw new HttpError(400, `${name} must be at least ${min} characters.`);
  // strip control characters except tab/newline
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function email(value, { required = true } = {}){
  const v = str(value, { name: 'Email', max: 254, required }).toLowerCase();
  if (!v && !required) return '';
  if (!EMAIL.test(v)) throw new HttpError(400, 'Enter a valid email address.');
  return v;
}

export function int(value, { name = 'This number', min = -Infinity, max = Infinity, required = true } = {}){
  if ((value === undefined || value === null || value === '') && !required) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new HttpError(400, `${name} must be a whole number.`);
  if (value < min || value > max) throw new HttpError(400, `${name} must be between ${min} and ${max}.`);
  return value;
}

export function bool(value, fallback = false){
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new HttpError(400, 'Expected true or false.');
  return value;
}

export function oneOf(value, options, name = 'This value'){
  if (!options.includes(value)) throw new HttpError(400, `${name} is not one of the allowed options.`);
  return value;
}

export function uuid(value, name = 'ID'){
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, `${name} is not valid.`);
  return value.toLowerCase();
}

export function slug(value, name = 'Slug'){
  const v = str(value, { name, max: 80, required: true }).toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(v)) throw new HttpError(400, `${name} may only use lowercase letters, numbers and dashes.`);
  return v;
}

// http(s) URLs only: rejects javascript:, data:, and friends.
export function url(value, { name = 'Link', required = false } = {}){
  const v = str(value, { name, max: 2000, required });
  if (!v) return '';
  let u;
  try { u = new URL(v); } catch { throw new HttpError(400, `${name} must be a full https:// address.`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new HttpError(400, `${name} must start with https://.`);
  return u.toString();
}

export function stringArray(value, { name = 'List', maxItems = 30, maxLength = 60 } = {}){
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new HttpError(400, `${name} can have up to ${maxItems} items.`);
  return [...new Set(value.map(v => str(v, { name, max: maxLength })).filter(Boolean))];
}

export function currency(value){
  if (value !== 'INR' && value !== 'USD') throw new HttpError(400, 'Currency must be INR or USD.');
  return value;
}
