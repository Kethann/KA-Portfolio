-- Coupons: how often a code was applied at checkout (accepted by the cart quote) or refused there, besides paid uses.
alter table coupons add column applied_count integer not null default 0 check (applied_count >= 0);
alter table coupons add column rejected_count integer not null default 0 check (rejected_count >= 0);
alter table coupons add column last_applied_at text;

-- Visits the owner saved: never removed by the daily retention clean-up or a bulk clear (unless asked).
alter table visits add column kept integer not null default 0 check (kept in (0,1));
create index visits_kept on visits (kept) where kept = 1;

-- Contact replies reach the sender's device too: the site shows each reply once and records when it was seen.
alter table message_replies add column seen_at text;
