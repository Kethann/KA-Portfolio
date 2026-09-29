-- Checkout details:
--  * api_verified_at: Razorpay's API (called by the server with the secret key) confirmed the
--    payment. Together with the signed webhook it is the second proof when a buyer's browser
--    never returns (tab closed after paying). The browser redirect alone never counts.
--  * client_secret_hash: a random secret handed only to the browser that started the checkout,
--    so that browser (and nobody else) can see its own order status and on-screen link.
--  * refund bookkeeping.
begin;

alter table orders add column api_verified_at timestamptz;
alter table orders add column client_secret_hash text;
alter table orders add column refund_id text;
alter table orders add column refund_amount integer check (refund_amount >= 0);
alter table orders add column note text;
alter table orders add column delivery_claimed_at timestamptz;   -- one sender at a time; status becomes delivered only after the email succeeds

alter table orders drop constraint paid_needs_both;
alter table orders add constraint paid_needs_two_proofs check (
  paid_at is null or is_free
  or (captured_at is not null and (signature_verified_at is not null or api_verified_at is not null)));

-- where each download link was issued (email, the checkout screen, a resend, or the portal)
alter table download_tokens add column channel text not null default 'email' check (channel in ('email','screen','resend','portal'));

revoke all on all tables in schema public from anon, authenticated;
grant select on products, product_media, categories, tips, licenses, legal_pages to anon, authenticated;

commit;
