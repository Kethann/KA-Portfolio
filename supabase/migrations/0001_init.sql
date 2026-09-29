-- KA store + portal schema. Run once in the Supabase SQL editor (or `supabase db push`).
-- Conventions:
--   * money: integer minor units (paise / cents), never floating point; every amount travels with
--     its currency, and an order is locked to one currency for its whole life.
--   * time: timestamptz (stored in UTC); the portal displays Asia/Kolkata.
--   * access: row-level security is ON for every table. Only the server (service role / database
--     owner connection) reads or writes private data. The public `anon` role can read published
--     catalog content only; everything else has no policy, so it is denied.

begin;

-- ------------------------------------------------------------------ settings & content
create table settings (
  key         text primary key,
  value       jsonb not null,
  revision    integer not null default 1,
  updated_at  timestamptz not null default now()
);

create table legal_pages (
  slug        text primary key check (slug in ('terms','privacy','refunds','delivery')),
  title       text not null,
  body_md     text not null default '',
  published   boolean not null default false,
  updated_at  timestamptz not null default now()
);

create table licenses (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique check (key ~ '^[a-z0-9-]{2,40}$'),
  name        text not null,
  summary     text not null default '',
  body_md     text not null default '',
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);

create table email_templates (
  key         text primary key,
  subject     text not null,
  body_md     text not null,
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------------ catalog
create table categories (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('artzz','artifacts','tips')),
  name        text not null,
  slug        text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  sort        integer not null default 0,
  unique (kind, slug)
);

create table products (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null check (kind in ('artzz','artifacts')),
  slug                text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  title               text not null check (length(title) between 1 and 160),
  summary             text not null default '',
  description         text not null default '',
  category_id         uuid references categories(id) on delete set null,
  tags                text[] not null default '{}',
  tech_tags           text[] not null default '{}',
  version             text not null default '',
  status              text not null default 'draft' check (status in ('draft','published','archived')),
  sellable            boolean not null default false,       -- Artzz items can be view-only
  is_free             boolean not null default false,
  price_inr           integer check (price_inr >= 0),       -- paise
  price_usd           integer check (price_usd >= 0),       -- cents
  sale_price_inr      integer check (sale_price_inr >= 0),
  sale_price_usd      integer check (sale_price_usd >= 0),
  sale_starts_at      timestamptz,
  sale_ends_at        timestamptz,
  license_id          uuid references licenses(id) on delete set null,
  demo_url            text not null default '',
  preview_url         text not null default '',
  max_downloads       integer not null default 5 check (max_downloads between 1 and 100),
  link_ttl_hours      integer not null default 48 check (link_ttl_hours between 1 and 168),
  refund_after_download boolean not null default true,      -- false = never refundable once downloaded
  sort                integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  published_at        timestamptz,
  -- a published, sellable, paid product must have both prices set (no auto conversion)
  constraint priced_when_selling check (
    status <> 'published' or not sellable or is_free
    or (coalesce(price_inr,0) > 0 and coalesce(price_usd,0) > 0)),
  constraint sale_below_price check (
    (sale_price_inr is null or price_inr is null or sale_price_inr < price_inr) and
    (sale_price_usd is null or price_usd is null or sale_price_usd < price_usd)),
  constraint sale_window check (sale_starts_at is null or sale_ends_at is null or sale_starts_at < sale_ends_at)
);
create index products_listing on products (kind, status, sort);

create table product_media (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  url         text not null,
  alt         text not null default '',
  width       integer check (width > 0),
  height      integer check (height > 0),
  sort        integer not null default 0
);
create index product_media_product on product_media (product_id, sort);

create table product_files (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  storage_path    text not null,         -- private bucket only
  filename        text not null,
  bytes           bigint not null check (bytes >= 0),
  sha256          text not null default '',
  license_version integer,               -- license text packaged inside this file
  is_current      boolean not null default true,
  created_at      timestamptz not null default now()
);
create unique index product_files_one_current on product_files (product_id) where is_current;

create table tips (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{1,80}$'),
  title         text not null,
  excerpt       text not null default '',
  body_md       text not null default '',
  cover_url     text not null default '',
  category_id   uuid references categories(id) on delete set null,
  tags          text[] not null default '{}',
  status        text not null default 'draft' check (status in ('draft','published')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search        tsvector generated always as (
                  to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(excerpt,'') || ' ' || coalesce(body_md,''))) stored
);
create index tips_search on tips using gin (search);

-- ------------------------------------------------------------------ coupons
create table coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text not null check (code ~ '^[A-Z0-9_-]{3,32}$'),     -- stored upper-case
  description       text not null default '',
  kind              text not null check (kind in ('percent','fixed')),
  percent_bp        integer check (percent_bp between 1 and 10000),        -- basis points: 1000 = 10%
  amount_inr        integer check (amount_inr > 0),                        -- fixed amount per currency
  amount_usd        integer check (amount_usd > 0),
  currencies        text[] not null default '{INR,USD}',
  starts_at         timestamptz,
  ends_at           timestamptz,
  max_uses          integer check (max_uses > 0),
  used_count        integer not null default 0 check (used_count >= 0),
  per_email_limit   integer check (per_email_limit > 0),
  first_order_only  boolean not null default false,
  min_order_inr     integer not null default 0 check (min_order_inr >= 0),
  min_order_usd     integer not null default 0 check (min_order_usd >= 0),
  max_discount_inr  integer check (max_discount_inr > 0),
  max_discount_usd  integer check (max_discount_usd > 0),
  applies_to        text not null default 'all' check (applies_to in ('all','products','category','artzz','artifacts')),
  product_ids       uuid[] not null default '{}',
  category_id       uuid references categories(id) on delete set null,
  stackable         boolean not null default false,
  paused            boolean not null default false,
  created_at        timestamptz not null default now(),
  constraint coupon_value check (
    (kind = 'percent' and percent_bp is not null) or
    (kind = 'fixed' and (amount_inr is not null or amount_usd is not null))),
  constraint coupon_window check (starts_at is null or ends_at is null or starts_at < ends_at),
  constraint coupon_uses check (max_uses is null or used_count <= max_uses),
  constraint coupon_currencies check (currencies <@ array['INR','USD']::text[] and cardinality(currencies) > 0)
);
create unique index coupons_code on coupons (code);

-- ------------------------------------------------------------------ orders & payments
create table orders (
  id                    uuid primary key default gen_random_uuid(),
  public_id             text not null unique,            -- shown to buyers, e.g. KA-7F3K9Q2M
  email                 text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  currency              text not null check (currency in ('INR','USD')),
  subtotal              integer not null check (subtotal >= 0),
  discount              integer not null default 0 check (discount >= 0),
  tax                   integer not null default 0 check (tax >= 0),
  total                 integer not null check (total >= 0),
  status                text not null default 'created' check (status in
                          ('created','paid','delivered','failed','cancelled','expired','mismatch','refunded')),
  is_free               boolean not null default false,
  razorpay_order_id     text unique,
  razorpay_payment_id   text unique,
  signature_verified_at timestamptz,                     -- browser handler signature checked on the server
  captured_at           timestamptz,                     -- verified payment.captured webhook
  paid_at               timestamptz,                     -- both of the above present
  delivered_at          timestamptz,
  refunded_at           timestamptz,
  refund_requested_at   timestamptz,
  invoice_number        integer unique,
  country               text,
  ip                    text,
  expires_at            timestamptz not null default (now() + interval '45 minutes'),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint total_math check (total = subtotal - discount + tax),
  constraint discount_cap check (discount <= subtotal),
  constraint paid_needs_both check (paid_at is null or (signature_verified_at is not null and captured_at is not null) or is_free)
);
create index orders_email on orders (email, created_at desc);
create index orders_status on orders (status, created_at desc);

create table order_items (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  product_id      uuid not null references products(id),
  title           text not null,                         -- snapshot at purchase time
  license_key     text,
  license_version integer,
  unit_price      integer not null check (unit_price >= 0),
  discount        integer not null default 0 check (discount >= 0),
  total           integer not null check (total >= 0),
  constraint item_math check (total = unit_price - discount)
);
create index order_items_order on order_items (order_id);

create table order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  type        text not null,
  data        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index order_events_order on order_events (order_id, id);

create table coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references coupons(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  email       text not null,
  currency    text not null check (currency in ('INR','USD')),
  amount      integer not null check (amount >= 0),
  status      text not null default 'reserved' check (status in ('reserved','confirmed','released')),
  created_at  timestamptz not null default now(),
  unique (coupon_id, order_id)
);
create index coupon_redemptions_email on coupon_redemptions (coupon_id, email) where status <> 'released';

create table webhook_events (
  id            text primary key,               -- Razorpay event id (x-razorpay-event-id): idempotency key
  type          text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  result        text
);

create table invoice_counter (
  id    boolean primary key default true check (id),
  last  integer not null default 0
);
insert into invoice_counter (id, last) values (true, 0);

create table download_tokens (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  product_id      uuid not null references products(id),
  token_hash      text not null unique,          -- sha256 of the link token; the token itself is never stored
  expires_at      timestamptz not null,
  max_downloads   integer not null check (max_downloads > 0),
  download_count  integer not null default 0 check (download_count >= 0),
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  constraint within_limit check (download_count <= max_downloads)
);
create index download_tokens_order on download_tokens (order_id);

create table download_events (
  id          bigint generated always as identity primary key,
  token_id    uuid references download_tokens(id) on delete set null,
  order_id    uuid references orders(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  ip          text,
  country     text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index download_events_order on download_events (order_id, created_at desc);

-- ------------------------------------------------------------------ messages & leads
create table messages (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('contact','assistant','system')),
  name        text not null default '',
  email       text not null default '',
  subject     text not null default '',
  body        text not null,
  status      text not null default 'new' check (status in ('new','read','done','spam')),
  labels      text[] not null default '{}',
  ip          text,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  replied_at  timestamptz,
  search      tsvector generated always as (
                to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(subject,'') || ' ' || coalesce(body,''))) stored
);
create index messages_inbox on messages (status, created_at desc);
create index messages_search on messages using gin (search);

create table message_replies (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references messages(id) on delete cascade,
  body        text not null,
  sent_at     timestamptz not null default now(),
  status      text not null default 'sent'
);

create table canned_replies (
  id     uuid primary key default gen_random_uuid(),
  title  text not null,
  body   text not null
);

create table blocklist (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('email','domain','ip','keyword')),
  value       text not null,
  created_at  timestamptz not null default now(),
  unique (kind, value)
);

create table notify_signups (
  id           uuid primary key default gen_random_uuid(),
  topic        text not null check (topic ~ '^[a-z0-9-]{1,40}$'),
  email        text not null check (email = lower(email)),
  created_at   timestamptz not null default now(),
  notified_at  timestamptz,
  unique (topic, email)
);

-- ------------------------------------------------------------------ visitors
create table visits (
  id              bigint generated always as identity primary key,
  visited_at      timestamptz not null default now(),
  session_id      text not null,
  visitor_id      text not null,
  is_new          boolean not null default false,
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
  is_bot          boolean not null default false,
  user_agent      text,
  last_seen_at    timestamptz not null default now()
);
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
  looked_up_at timestamptz not null default now()
);

create table geo_quota (
  provider  text not null,
  period    text not null,           -- 'YYYY-MM' or 'YYYY-MM-DD' depending on the provider
  used      integer not null default 0,
  primary key (provider, period)
);

-- ------------------------------------------------------------------ assistant
create table kb_sources (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('text','faq','document','product')),
  title       text not null,
  body        text not null default '',
  enabled     boolean not null default true,
  product_id  uuid references products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table kb_chunks (
  id          bigint generated always as identity primary key,
  source_id   uuid not null references kb_sources(id) on delete cascade,
  ord         integer not null,
  content     text not null,
  search      tsvector generated always as (to_tsvector('simple', content)) stored
);
create index kb_chunks_search on kb_chunks using gin (search);

create table assistant_conversations (
  id           uuid primary key default gen_random_uuid(),
  visitor_id   text,
  audience     text not null default 'visitor' check (audience in ('visitor','buyer','admin','playground')),
  order_id     uuid references orders(id) on delete set null,   -- set only after order id + email verified
  ip           text,
  country      text,
  started_at   timestamptz not null default now(),
  last_at      timestamptz not null default now()
);

create table assistant_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references assistant_conversations(id) on delete cascade,
  role             text not null check (role in ('user','assistant')),
  content          text not null,
  sources          jsonb not null default '[]',
  tokens_in        integer not null default 0,
  tokens_out       integer not null default 0,
  cost_micros      bigint not null default 0,     -- USD micro-dollars (1e-6), integer
  rating           smallint check (rating in (-1, 1)),
  created_at       timestamptz not null default now(),
  search           tsvector generated always as (to_tsvector('simple', content)) stored
);
create index assistant_messages_conv on assistant_messages (conversation_id, id);
create index assistant_messages_search on assistant_messages using gin (search);

create table assistant_usage (
  day               date primary key,
  requests          integer not null default 0,
  tokens_in         bigint not null default 0,
  tokens_out        bigint not null default 0,
  cost_micros       bigint not null default 0,
  cutoff_notified   boolean not null default false
);

-- ------------------------------------------------------------------ owner access & system
create table admin_users (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique check (email = lower(email)),
  password_hash       text not null,
  totp_secret         text,                 -- encrypted with ADMIN_ENCRYPTION_KEY
  totp_enabled        boolean not null default false,
  totp_last_step      bigint,                -- last accepted 30s step: a code can't be reused
  failed_attempts     integer not null default 0,
  locked_until        timestamptz,
  password_changed_at timestamptz not null default now(),
  created_at          timestamptz not null default now()
);

create table admin_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references admin_users(id) on delete cascade,
  token_hash    text not null unique,
  csrf_hash     text not null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  ip            text,
  user_agent    text,
  revoked_at    timestamptz
);

create table audit_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  action  text not null,
  target  text,
  data    jsonb not null default '{}',
  ip      text
);

create table rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         integer not null
);

create table email_log (
  id           bigint generated always as identity primary key,
  to_email     text not null,
  subject      text not null,
  template     text not null,
  status       text not null check (status in ('sent','failed','bounced','skipped')),
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now()
);
create index email_log_time on email_log (created_at desc);

create table backups (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  storage_path  text not null,
  bytes         bigint not null default 0,
  tables        jsonb not null default '{}',
  status        text not null check (status in ('ok','failed')),
  error         text
);

-- ------------------------------------------------------------------ atomic helpers
-- Fixed-window rate limit: one statement, safe under concurrency. Returns true when allowed.
create function rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean language plpgsql as $$
declare v_count integer;
begin
  insert into rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;

-- Gapless sequential invoice numbers: the counter row is locked for the rest of the transaction.
create function next_invoice_number() returns integer language sql as $$
  update invoice_counter set last = last + 1 where id returning last;
$$;

-- ------------------------------------------------------------------ row-level security
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    -- ENABLE (not FORCE): the server connects as the table owner, which bypasses RLS by design;
    -- every client role (anon, authenticated) is filtered by the policies below.
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Public (anon) may read published catalog content only. Nothing else has a policy, so every
-- other table is closed to anon and authenticated clients even if a key leaks into a browser.
create policy public_read_published_products on products for select to anon, authenticated
  using (status = 'published');
create policy public_read_product_media on product_media for select to anon, authenticated
  using (exists (select 1 from products p where p.id = product_id and p.status = 'published'));
create policy public_read_categories on categories for select to anon, authenticated using (true);
create policy public_read_published_tips on tips for select to anon, authenticated
  using (status = 'published');
create policy public_read_licenses on licenses for select to anon, authenticated using (true);
create policy public_read_published_legal on legal_pages for select to anon, authenticated
  using (published);

-- Table privileges: clients may SELECT only the public catalog tables (still filtered by the
-- policies above) and may never write anything. Functions are not callable by clients.
-- Supabase grants anon/authenticated default privileges on NEW tables: every later migration
-- must repeat the revoke below for the tables it adds (tests/db-security.test.mjs checks this).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant select on products, product_media, categories, tips, licenses, legal_pages to anon, authenticated;

commit;
