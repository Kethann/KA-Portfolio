// Every cryptographic primitive the server uses, in one place (node:crypto; on Cloudflare
// Workers the same module is available with the nodejs_compat flag).
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

export function randomToken(bytes = 32){ return randomBytes(bytes).toString('base64url'); }
export function sha256hex(value){ return createHash('sha256').update(value).digest('hex'); }
export function hmacHex(key, value){ return createHmac('sha256', key).update(value).digest('hex'); }

// Constant-time comparison of two strings (false for different lengths or non-strings).
export function safeEqual(a, b){
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a), bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ---- passwords: scrypt with a per-password salt. Stored as scrypt$N$r$p$salt$hash.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password){
  const salt = randomBytes(16).toString('base64url');
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key.toString('base64url')}`;
}
export async function verifyPassword(password, stored){
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, salt, expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ---- symmetric encryption (AES-256-GCM) for secrets at rest, e.g. the owner's 2FA seed.
function keyFrom(secret){ return createHash('sha256').update(String(secret)).digest(); }
export function encrypt(plain, secret){
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}
export function decrypt(packed, secret){
  const [v, iv, tag, body] = String(packed).split('.');
  if (v !== 'v1') throw new Error('Unknown encryption format.');
  const d = createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8');
}

// ---- TOTP (RFC 6238): 30-second steps, 6 digits, SHA-1 (what every authenticator app uses).
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf){
  let bits = 0, value = 0, out = '';
  for (const byte of buf){
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5){ out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str){
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean){
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8){ out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export function newTotpSecret(){ return base32Encode(randomBytes(20)); }
export function totpCode(secret, time = Date.now(), step = 30){
  const counter = Math.floor(time / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
  return String(code).padStart(6, '0');
}
// Accepts the current code and one step either side (clock drift). Returns the matched step so
// the caller can refuse to accept the same code twice.
export function verifyTotp(secret, code, time = Date.now()){
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  for (const drift of [0, -1, 1]){
    const t = time + drift * 30000;
    if (safeEqual(totpCode(secret, t), String(code))) return Math.floor(t / 30000);
  }
  return null;
}
