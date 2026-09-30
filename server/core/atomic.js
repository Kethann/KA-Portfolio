// Single-statement atomic helpers (D1 runs each statement atomically; there are no stored functions).
import { getDb } from './db.js';

// "ISO time `seconds` ago / ahead" as SQL, for a $n parameter holding a number of seconds.
export const secondsAgo = (n) => `strftime('%Y-%m-%dT%H:%M:%fZ','now','-' || $${n} || ' seconds')`;
export const secondsAhead = (n) => `strftime('%Y-%m-%dT%H:%M:%fZ','now','+' || $${n} || ' seconds')`;

// Fixed-window rate limit: one upsert, safe under concurrency. true = allowed.
export async function rateLimitHit(key, windowSeconds, max){
  const db = await getDb();
  const row = await db.one(`insert into rate_limits (key, window_start, count) values ($1, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < ${secondsAgo(2)} then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < ${secondsAgo(2)} then now() else rate_limits.window_start end
    returning count`, [key, windowSeconds]);
  return row.count <= max;
}

// Gapless sequential invoice numbers. As a batch step: put NEXT_INVOICE first and use INVOICE_VALUE in the
// statement that stores it, so the number is taken and used in the same all-or-nothing batch.
export const NEXT_INVOICE = [`update invoice_counter set last = last + 1 where id = 1 returning last`];
export const INVOICE_VALUE = `(select last from invoice_counter where id = 1)`;
export async function nextInvoiceNumber(){
  const db = await getDb();
  return (await db.one(NEXT_INVOICE[0])).last;
}
