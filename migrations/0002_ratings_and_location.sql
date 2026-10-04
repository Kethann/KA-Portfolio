-- Ratings: only people who bought or downloaded an item can rate it (from their download page), one rating
-- per order and item (rating again updates it). The owner can hide or delete any rating in the portal.
create table product_ratings (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  product_id  text not null references products(id) on delete cascade,
  order_id    text not null references orders(id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  review      text not null default '' check (length(review) <= 600),
  name        text not null default '' check (length(name) <= 40),
  status      text not null default 'visible' check (status in ('visible','hidden')),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (order_id, product_id)
) strict;
create index product_ratings_product on product_ratings (product_id, status, created_at desc);

-- Visitor location: everything Cloudflare knows from the connection (no extra lookups, no permission popups)
alter table visits add column postal text;
alter table visits add column latitude real;
alter table visits add column longitude real;
alter table visits add column isp text;
alter table visits add column continent text;
alter table visits add column location_accuracy integer;
alter table visits add column location_source text;
