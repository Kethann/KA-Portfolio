-- Project agreements (portal: Agreements). The owner prepares one for a client (often from a contact message), sends it,
-- and the client reads and signs it online. What the client signs is frozen: `document` is the exact text sent, and
-- `document_hash` its SHA-256, so the signed copy can always be shown to be the one that was agreed.
create table agreements (
  id              text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  number          text not null unique,                       -- KA-AG-2026-0001
  status          text not null default 'draft' check (status in ('draft','sent','signed','declined','void')),
  message_id      text references messages(id) on delete set null,
  client_name     text not null,
  client_email    text not null,
  title           text not null,
  data            text not null default '{}' check (json_valid(data)),   -- the project terms (scope, fee, advance, cancellation…)
  document        text,                                       -- the full agreement as sent (frozen at send time)
  document_hash   text,
  created_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at         text,
  viewed_at       text,
  signed_at       text,
  declined_at     text,
  decline_reason  text,
  voided_at       text,
  signer_name     text,
  signer_ip       text,
  signer_ua       text,
  signer_country  text,
  signature       text,                                       -- the drawn (or typed) signature as a PNG data URL
  advance_paid_at text,
  advance_note    text,
  meta            text not null default '{}' check (json_valid(meta))   -- evidence trail: views, consents ticked, emails sent
) strict;
create index agreements_list on agreements (status, created_at desc);
create index agreements_message on agreements (message_id);
