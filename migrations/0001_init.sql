-- KA store + portal schema for Cloudflare D1 (SQLite). Applied with `wrangler d1 migrations apply`;
-- tests and local development apply the same files to a local SQLite database.
-- Conventions (the database layer in server/core/db.js converts at the edge, so handlers see plain JS values):
--   * ids: text UUIDs (v4 format) generated here;         * money: integer minor units (paise / cents)
--   * time: ISO-8601 UTC text, e.g. 2026-09-30T12:00:00.000Z (sorts and compares correctly as text)
--   * booleans: 0/1 integers  -> true/false in JS         * JSON / lists: JSON text -> objects/arrays in JS
--   * no client ever talks to D1 directly: only the Worker does, so there are no public roles or policies.

-- ------------------------------------------------------------------ settings & content
create table settings (
  key         text primary key,
  value       text not null check (json_valid(value)),
  revision    integer not null default 1,
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

create table legal_pages (
  slug        text primary key check (slug in ('terms','privacy','refunds','delivery')),
  title       text not null,
  body_md     text not null default '',
  published   integer not null default 0 check (published in (0,1)),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

create table licenses (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  key         text not null unique check (length(key) between 2 and 40 and key not glob '*[^a-z0-9-]*'),
  name        text not null,
  summary     text not null default '',
  body_md     text not null default '',
  version     integer not null default 1,
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

create table email_templates (
  key         text primary key,
  subject     text not null,
  body_md     text not null,
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

-- ------------------------------------------------------------------ catalog
create table categories (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  kind        text not null check (kind in ('artzz','artifacts','tips')),
  name        text not null,
  slug        text not null check (length(slug) between 1 and 60 and slug not glob '*[^a-z0-9-]*'),
  sort        integer not null default 0,
  unique (kind, slug)
) strict;

create table products (
  id                  text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  kind                text not null check (kind in ('artzz','artifacts')),
  slug                text not null unique check (length(slug) between 1 and 80 and slug not glob '*[^a-z0-9-]*'),
  title               text not null check (length(title) between 1 and 160),
  summary             text not null default '',
  description         text not null default '',
  category_id         text references categories(id) on delete set null,
  tags                text not null default '[]' check (json_valid(tags)),
  tech_tags           text not null default '[]' check (json_valid(tech_tags)),
  version             text not null default '',
  status              text not null default 'draft' check (status in ('draft','published','archived')),
  sellable            integer not null default 0 check (sellable in (0,1)),        -- Artzz items can be view-only
  is_free             integer not null default 0 check (is_free in (0,1)),
  price_inr           integer check (price_inr >= 0),       -- paise
  price_usd           integer check (price_usd >= 0),       -- cents
  sale_price_inr      integer check (sale_price_inr >= 0),
  sale_price_usd      integer check (sale_price_usd >= 0),
  sale_starts_at      text,
  sale_ends_at        text,
  license_id          text references licenses(id) on delete set null,
  demo_url            text not null default '',
  preview_url         text not null default '',
  max_downloads       integer not null default 5 check (max_downloads between 1 and 100),
  link_ttl_hours      integer not null default 48 check (link_ttl_hours between 1 and 168),
  refund_after_download integer not null default 1 check (refund_after_download in (0,1)),
  sort                integer not null default 0,
  created_at          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  published_at        text,
  -- a published, sellable, paid product must have both prices set (no auto conversion)
  constraint priced_when_selling check (
    status <> 'published' or not sellable or is_free
    or (coalesce(price_inr,0) > 0 and coalesce(price_usd,0) > 0)),
  constraint sale_below_price check (
    (sale_price_inr is null or price_inr is null or sale_price_inr < price_inr) and
    (sale_price_usd is null or price_usd is null or sale_price_usd < price_usd)),
  constraint sale_window check (sale_starts_at is null or sale_ends_at is null or sale_starts_at < sale_ends_at)
) strict;
create index products_listing on products (kind, status, sort);

create table product_media (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  product_id  text not null references products(id) on delete cascade,
  url         text not null,
  alt         text not null default '',
  width       integer check (width > 0),
  height      integer check (height > 0),
  sort        integer not null default 0
) strict;
create index product_media_product on product_media (product_id, sort);

create table product_files (
  id              text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  product_id      text not null references products(id) on delete cascade,
  storage_path    text not null,         -- private bucket only
  filename        text not null,
  bytes           integer not null check (bytes >= 0),
  sha256          text not null default '',
  license_version integer,               -- license text packaged inside this file
  is_current      integer not null default 1 check (is_current in (0,1)),
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
create unique index product_files_one_current on product_files (product_id) where is_current = 1;

create table tips (
  id            text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  slug          text not null unique check (length(slug) between 1 and 80 and slug not glob '*[^a-z0-9-]*'),
  title         text not null,
  excerpt       text not null default '',
  body_md       text not null default '',
  cover_url     text not null default '',
  category_id   text references categories(id) on delete set null,
  tags          text not null default '[]' check (json_valid(tags)),
  status        text not null default 'draft' check (status in ('draft','published')),
  published_at  text,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

-- ------------------------------------------------------------------ coupons
create table coupons (
  id                text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  code              text not null check (length(code) between 3 and 32 and code not glob '*[^A-Z0-9_-]*'),     -- stored upper-case
  description       text not null default '',
  kind              text not null check (kind in ('percent','fixed')),
  percent_bp        integer check (percent_bp between 1 and 10000),        -- basis points: 1000 = 10%
  amount_inr        integer check (amount_inr > 0),                        -- fixed amount per currency
  amount_usd        integer check (amount_usd > 0),
  currencies        text not null default '["INR","USD"]' check (json_valid(currencies) and json_array_length(currencies) > 0),
  starts_at         text,
  ends_at           text,
  max_uses          integer check (max_uses > 0),
  used_count        integer not null default 0 check (used_count >= 0),
  per_email_limit   integer check (per_email_limit > 0),
  first_order_only  integer not null default 0 check (first_order_only in (0,1)),
  min_order_inr     integer not null default 0 check (min_order_inr >= 0),
  min_order_usd     integer not null default 0 check (min_order_usd >= 0),
  max_discount_inr  integer check (max_discount_inr > 0),
  max_discount_usd  integer check (max_discount_usd > 0),
  applies_to        text not null default 'all' check (applies_to in ('all','products','category','artzz','artifacts')),
  product_ids       text not null default '[]' check (json_valid(product_ids)),
  category_id       text references categories(id) on delete set null,
  stackable         integer not null default 0 check (stackable in (0,1)),
  paused            integer not null default 0 check (paused in (0,1)),
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  constraint coupon_value check (
    (kind = 'percent' and percent_bp is not null) or
    (kind = 'fixed' and (amount_inr is not null or amount_usd is not null))),
  constraint coupon_window check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint coupon_uses check (max_uses is null or used_count <= max_uses)
) strict;
create unique index coupons_code on coupons (code);

-- ------------------------------------------------------------------ orders & payments
create table orders (
  id                    text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  public_id             text not null unique,            -- shown to buyers, e.g. KA-7F3K9Q2M
  email                 text not null check (email = lower(email) and email glob '?*@?*.?*' and email not glob '*[ 	]*'),
  currency              text not null check (currency in ('INR','USD')),
  subtotal              integer not null check (subtotal >= 0),
  discount              integer not null default 0 check (discount >= 0),
  tax                   integer not null default 0 check (tax >= 0),
  total                 integer not null check (total >= 0),
  status                text not null default 'created' check (status in
                          ('created','paid','delivered','failed','cancelled','expired','mismatch','refunded')),
  is_free               integer not null default 0 check (is_free in (0,1)),
  razorpay_order_id     text unique,
  razorpay_payment_id   text unique,
  signature_verified_at text,                     -- browser handler signature checked on the server
  api_verified_at       text,                     -- payment fetched from Razorpay's API and matched
  captured_at           text,                     -- verified payment.captured webhook
  paid_at               text,                     -- two proofs present
  delivered_at          text,
  delivery_claimed_at   text,                     -- one sender at a time; delivered only after the email succeeds
  refunded_at           text,
  refund_requested_at   text,
  refund_id             text,
  refund_amount         integer check (refund_amount >= 0),
  client_secret_hash    text,
  payment_method        text check (payment_method is null or json_valid(payment_method)),
  note                  text,
  invoice_number        integer unique,
  country               text,
  ip                    text,
  expires_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now','+45 minutes')),
  created_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  constraint total_math check (total = subtotal - discount + tax),
  constraint discount_cap check (discount <= subtotal),
  constraint paid_needs_two_proofs check (
    paid_at is null or is_free
    or (captured_at is not null and (signature_verified_at is not null or api_verified_at is not null)))
) strict;
create index orders_email on orders (email, created_at desc);
create index orders_status on orders (status, created_at desc);

create table order_items (
  id              text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  order_id        text not null references orders(id) on delete cascade,
  product_id      text not null references products(id),
  title           text not null,                         -- snapshot at purchase time
  license_key     text,
  license_version integer,
  unit_price      integer not null check (unit_price >= 0),
  discount        integer not null default 0 check (discount >= 0),
  total           integer not null check (total >= 0),
  constraint item_math check (total = unit_price - discount)
) strict;
create index order_items_order on order_items (order_id);

create table order_events (
  id          integer primary key autoincrement,
  order_id    text not null references orders(id) on delete cascade,
  type        text not null,
  data        text not null default '{}' check (json_valid(data)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
create index order_events_order on order_events (order_id, id);

create table coupon_redemptions (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  coupon_id   text not null references coupons(id) on delete cascade,
  order_id    text not null references orders(id) on delete cascade,
  email       text not null,
  currency    text not null check (currency in ('INR','USD')),
  amount      integer not null check (amount >= 0),
  status      text not null default 'reserved' check (status in ('reserved','confirmed','released')),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (coupon_id, order_id)
) strict;
create index coupon_redemptions_email on coupon_redemptions (coupon_id, email) where status <> 'released';

create table webhook_events (
  id            text primary key,               -- Razorpay event id (x-razorpay-event-id): idempotency key
  type          text not null,
  payload       text not null check (json_valid(payload)),
  received_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  processed_at  text,
  result        text
) strict;

-- one row; the invoice number is taken with a single atomic update ... returning
create table invoice_counter (
  id    integer primary key check (id = 1),
  last  integer not null default 0
) strict;
insert into invoice_counter (id, last) values (1, 0);

create table download_tokens (
  id              text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  order_id        text not null references orders(id) on delete cascade,
  product_id      text not null references products(id),
  token_hash      text not null unique,          -- sha256 of the link token; the token itself is never stored
  expires_at      text not null,
  max_downloads   integer not null check (max_downloads > 0),
  download_count  integer not null default 0 check (download_count >= 0),
  channel         text not null default 'email' check (channel in ('email','screen','resend','portal')),
  revoked_at      text,
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  constraint within_limit check (download_count <= max_downloads)
) strict;
create index download_tokens_order on download_tokens (order_id);

create table download_events (
  id          integer primary key autoincrement,
  token_id    text references download_tokens(id) on delete set null,
  order_id    text references orders(id) on delete cascade,
  product_id  text references products(id) on delete set null,
  ip          text,
  country     text,
  user_agent  text,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
create index download_events_order on download_events (order_id, created_at desc);

-- ------------------------------------------------------------------ messages & leads
create table messages (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  source      text not null check (source in ('contact','assistant','system')),
  name        text not null default '',
  email       text not null default '',
  subject     text not null default '',
  body        text not null,
  status      text not null default 'new' check (status in ('new','read','done','spam')),
  labels      text not null default '[]' check (json_valid(labels)),
  ip          text,
  meta        text not null default '{}' check (json_valid(meta)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  replied_at  text
) strict;
create index messages_inbox on messages (status, created_at desc);

create table message_replies (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  message_id  text not null references messages(id) on delete cascade,
  body        text not null,
  sent_at     text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  status      text not null default 'sent'
) strict;

create table canned_replies (
  id     text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  title  text not null,
  body   text not null
) strict;

create table blocklist (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  kind        text not null check (kind in ('email','domain','ip','keyword')),
  value       text not null,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (kind, value)
) strict;

create table notify_signups (
  id           text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  topic        text not null check (length(topic) between 1 and 40 and topic not glob '*[^a-z0-9-]*'),
  email        text not null check (email = lower(email)),
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notified_at  text,
  unique (topic, email)
) strict;

-- ------------------------------------------------------------------ visitors
create table visits (
  id              integer primary key autoincrement,
  visited_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  session_id      text not null,
  visitor_id      text not null,
  is_new          integer not null default 0 check (is_new in (0,1)),
  path            text not null default '/',
  referrer        text not null default '',
  duration_ms     integer check (duration_ms >= 0),
  ip              text,
  country         text,
  region          text,
  city            text,
  timezone        text,
  language        text,
  device_type     text,
  device_vendor   text,
  device_model    text,
  os              text,
  os_version      text,
  browser         text,
  browser_version text,
  screen_w        integer,
  screen_h        integer,
  is_bot          integer not null default 0 check (is_bot in (0,1)),
  user_agent      text,
  last_seen_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
create index visits_time on visits (visited_at desc);
create index visits_session on visits (session_id, visited_at desc);
create index visits_ip on visits (ip);

create table ip_geo_cache (
  ip           text primary key,
  country      text,
  region       text,
  city         text,
  timezone     text,
  provider     text not null,
  looked_up_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

create table geo_quota (
  provider  text not null,
  period    text not null,           -- 'YYYY-MM' or 'YYYY-MM-DD' depending on the provider
  used      integer not null default 0,
  primary key (provider, period)
) strict;

-- ------------------------------------------------------------------ assistant
create table kb_sources (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  kind        text not null check (kind in ('text','faq','document','product')),
  title       text not null,
  body        text not null default '',
  enabled     integer not null default 1 check (enabled in (0,1)),
  product_id  text references products(id) on delete cascade,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

create table kb_chunks (
  id          integer primary key autoincrement,
  source_id   text not null references kb_sources(id) on delete cascade,
  ord         integer not null,
  content     text not null
) strict;
create index kb_chunks_source on kb_chunks (source_id, ord);

create table assistant_conversations (
  id           text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  visitor_id   text,
  audience     text not null default 'visitor' check (audience in ('visitor','buyer','admin','playground')),
  order_id     text references orders(id) on delete set null,   -- set only after order id + email verified
  ip           text,
  country      text,
  started_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

create table assistant_messages (
  id               integer primary key autoincrement,
  conversation_id  text not null references assistant_conversations(id) on delete cascade,
  role             text not null check (role in ('user','assistant')),
  content          text not null,
  sources          text not null default '[]' check (json_valid(sources)),
  tokens_in        integer not null default 0,
  tokens_out       integer not null default 0,
  cost_micros      integer not null default 0,     -- USD micro-dollars (1e-6), integer
  rating           integer check (rating in (-1, 1)),
  created_at       text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
create index assistant_messages_conv on assistant_messages (conversation_id, id);

create table assistant_usage (
  day               text primary key,             -- YYYY-MM-DD
  requests          integer not null default 0,
  tokens_in         integer not null default 0,
  tokens_out        integer not null default 0,
  cost_micros       integer not null default 0,
  cutoff_notified   integer not null default 0 check (cutoff_notified in (0,1))
) strict;

create table assistant_model_usage (
  day           text not null,                 -- Google's quota day (America/Los_Angeles), YYYY-MM-DD
  model         text not null check (length(model) between 1 and 80),
  requests      integer not null default 0 check (requests >= 0),   -- answered
  failures      integer not null default 0 check (failures >= 0),   -- refused (quota, overload, errors)
  quota_limit   integer check (quota_limit > 0),                      -- learned from a daily-quota refusal
  exhausted_at  text,                                                 -- when the daily quota ran out
  primary key (day, model)
) strict;

-- ------------------------------------------------------------------ portal access & system
create table admin_users (
  id                   text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  email                text not null unique check (email = lower(email)),
  name                 text not null default '' check (length(name) <= 80),
  role                 text not null default 'admin' check (role in ('owner', 'admin')),
  password_hash        text not null,
  must_change_password integer not null default 0 check (must_change_password in (0,1)),
  disabled_at          text,
  created_by           text references admin_users(id) on delete set null,
  totp_secret          text,                 -- encrypted with ADMIN_ENCRYPTION_KEY
  totp_enabled         integer not null default 0 check (totp_enabled in (0,1)),
  totp_last_step       integer,              -- last accepted 30s step: a code can't be reused
  failed_attempts      integer not null default 0,
  locked_until         text,
  password_changed_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at           text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;

create table admin_sessions (
  id            text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  user_id       text not null references admin_users(id) on delete cascade,
  token_hash    text not null unique,
  csrf_hash     text not null,
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_seen_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at    text not null,
  ip            text,
  user_agent    text,
  revoked_at    text
) strict;

create table audit_log (
  id      integer primary key autoincrement,
  at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  action  text not null,
  target  text,
  data    text not null default '{}' check (json_valid(data)),
  ip      text,
  actor   text     -- the signed-in person's email (null for visitors / sign-in attempts)
) strict;

create table rate_limits (
  key           text primary key,
  window_start  text not null,
  count         integer not null
) strict;

create table email_log (
  id           integer primary key autoincrement,
  to_email     text not null,
  subject      text not null,
  template     text not null,
  status       text not null check (status in ('sent','failed','bounced','skipped')),
  provider_id  text,
  error        text,
  created_at   text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
create index email_log_time on email_log (created_at desc);

create table backups (
  id            text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  storage_path  text not null,
  bytes         integer not null default 0,
  tables        text not null default '{}' check (json_valid(tables)),
  status        text not null check (status in ('ok','failed')),
  error         text
) strict;

-- ------------------------------------------------------------------ full-text search (FTS5)
-- Replaces Postgres tsvector columns: each index mirrors its table through triggers.
create virtual table tips_fts using fts5(title, excerpt, body_md, content='tips', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER tips_fts_ai AFTER INSERT on tips BEGIN insert into tips_fts (rowid, title, excerpt, body_md) values (new.rowid, new.title, new.excerpt, new.body_md); END;
CREATE TRIGGER tips_fts_ad AFTER DELETE on tips BEGIN insert into tips_fts (tips_fts, rowid, title, excerpt, body_md) values ('delete', old.rowid, old.title, old.excerpt, old.body_md); END;
CREATE TRIGGER tips_fts_au AFTER UPDATE of title, excerpt, body_md on tips BEGIN insert into tips_fts (tips_fts, rowid, title, excerpt, body_md) values ('delete', old.rowid, old.title, old.excerpt, old.body_md); insert into tips_fts (rowid, title, excerpt, body_md) values (new.rowid, new.title, new.excerpt, new.body_md); END;

create virtual table messages_fts using fts5(name, email, subject, body, content='messages', content_rowid='rowid', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER messages_fts_ai AFTER INSERT on messages BEGIN insert into messages_fts (rowid, name, email, subject, body) values (new.rowid, new.name, new.email, new.subject, new.body); END;
CREATE TRIGGER messages_fts_ad AFTER DELETE on messages BEGIN insert into messages_fts (messages_fts, rowid, name, email, subject, body) values ('delete', old.rowid, old.name, old.email, old.subject, old.body); END;
CREATE TRIGGER messages_fts_au AFTER UPDATE of name, email, subject, body on messages BEGIN insert into messages_fts (messages_fts, rowid, name, email, subject, body) values ('delete', old.rowid, old.name, old.email, old.subject, old.body); insert into messages_fts (rowid, name, email, subject, body) values (new.rowid, new.name, new.email, new.subject, new.body); END;

create virtual table kb_chunks_fts using fts5(content, content='kb_chunks', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER kb_chunks_fts_ai AFTER INSERT on kb_chunks BEGIN insert into kb_chunks_fts (rowid, content) values (new.id, new.content); END;
CREATE TRIGGER kb_chunks_fts_ad AFTER DELETE on kb_chunks BEGIN insert into kb_chunks_fts (kb_chunks_fts, rowid, content) values ('delete', old.id, old.content); END;
CREATE TRIGGER kb_chunks_fts_au AFTER UPDATE of content on kb_chunks BEGIN insert into kb_chunks_fts (kb_chunks_fts, rowid, content) values ('delete', old.id, old.content); insert into kb_chunks_fts (rowid, content) values (new.id, new.content); END;

create virtual table assistant_messages_fts using fts5(content, content='assistant_messages', content_rowid='id', tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER assistant_messages_fts_ai AFTER INSERT on assistant_messages BEGIN insert into assistant_messages_fts (rowid, content) values (new.id, new.content); END;
CREATE TRIGGER assistant_messages_fts_ad AFTER DELETE on assistant_messages BEGIN insert into assistant_messages_fts (assistant_messages_fts, rowid, content) values ('delete', old.id, old.content); END;
