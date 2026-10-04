-- Product snapshots back the portal's publish history and safe rollback.
create table product_revisions (
  id          integer primary key autoincrement,
  product_id  text not null references products(id) on delete cascade,
  action      text not null check (action in ('publish','restore')),
  snapshot    text not null check (json_valid(snapshot)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor       text
) strict;
create index product_revisions_product on product_revisions (product_id, created_at desc);
