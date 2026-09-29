// Owner-editable settings stored in the `settings` table as JSON documents. Every key has a
// complete default here, and reads are merged over it, so a new field never breaks old data.
import { getDb } from './db.js';

export const DEFAULTS = {
  store: {
    enabled: true,
    allowCouponStacking: false,       // one coupon per order unless turned on
    taxEnabled: false,                // GST/tax: confirm treatment with your accountant first
    taxLabel: 'GST',
    taxRateBp: 0,                     // basis points (1800 = 18%), applied to the discounted amount
    taxInclusive: true,               // true: prices already include tax (tax shown as a part of the total)
    sellerName: '', sellerAddress: '', sellerTaxId: '',
    orderExpiryMinutes: 45
  },
  upscaler: {
    comingSoon: true,
    title: 'Image Upscaler',
    badge: 'Under development',
    text: 'A tool that sharpens and enlarges your images is being built. It isn’t available yet.',
    notifyEnabled: true
  },
  messages: {
    notifyEmail: '',                  // falls back to OWNER_EMAIL
    autoReply: { enabled: false, subject: 'Thanks for your message', body: 'Hi {{name}},\n\nThanks for reaching out. I read every message and will reply soon.\n\n{{signature}}' },
    businessHours: { enabled: false, days: [1, 2, 3, 4, 5], start: '10:00', end: '19:00', awayMessage: 'I’m away right now and will reply when I’m back.' },
    spamFilter: true
  },
  assistant: {
    enabled: true,
    persona: 'Warm, direct and honest. Speaks on Kethan’s behalf in first person, and says so plainly when asked if it is an AI.',
    greeting: 'Hi! Ask me about my work, the store or licenses.',
    suggestions: ['What do you design?', 'How do downloads work?', 'Which license do I need?'],
    languages: 'Reply in the visitor’s language.',
    dailyBudgetMicros: 500000,        // USD 0.50 per day, then automatic shut-off
    visitorRules: { recommendProducts: true, takeMessages: true, collectLeads: true },
    buyerRules: { orderStatus: true }
  },
  reports: { daily: false, weekly: true, email: '' },
  visitors: { retentionDays: 365 },   // visits older than this are deleted daily (0 = keep forever)
  site: null,                         // the portfolio document (seeded on first read)
  system: { lastHeartbeat: null, lastBackup: null }
};

function merge(base, over){
  if (Array.isArray(base) || base === null || typeof base !== 'object') return over === undefined ? base : over;
  const out = { ...base };
  if (over && typeof over === 'object' && !Array.isArray(over)) for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
}

export async function getSetting(key){
  const db = await getDb();
  const row = await db.maybeOne('select value, revision from settings where key = $1', [key]);
  return merge(DEFAULTS[key] ?? null, row ? row.value : undefined);
}

export async function getSettingWithRevision(key){
  const db = await getDb();
  const row = await db.maybeOne('select value, revision from settings where key = $1', [key]);
  return { value: merge(DEFAULTS[key] ?? null, row ? row.value : undefined), revision: row ? row.revision : 0 };
}

// Optimistic concurrency: pass the revision you read; a stale write is refused (409 upstream).
export async function setSetting(key, value, expectedRevision){
  const db = await getDb();
  if (expectedRevision === undefined){
    const row = await db.one(`insert into settings (key, value) values ($1, $2)
      on conflict (key) do update set value = excluded.value, revision = settings.revision + 1, updated_at = now()
      returning revision`, [key, value]);
    return row.revision;
  }
  if (expectedRevision === 0){
    const rows = await db.query(`insert into settings (key, value) values ($1, $2) on conflict (key) do nothing returning revision`, [key, value]);
    return rows[0] ? rows[0].revision : null;
  }
  const rows = await db.query(`update settings set value = $2, revision = revision + 1, updated_at = now()
    where key = $1 and revision = $3 returning revision`, [key, value, expectedRevision]);
  return rows[0] ? rows[0].revision : null;
}
