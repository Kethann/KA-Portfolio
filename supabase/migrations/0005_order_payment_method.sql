-- How each order was paid, as a display summary for the owner's records: card network + last 4
-- digits, or UPI / net banking (with bank) / wallet. Never the full card number, UPI ID or name
-- (Razorpay holds those). Filled from the verified checkout, the payment webhook or demo mode.
begin;

alter table orders add column payment_method jsonb;

revoke all on all tables in schema public from anon, authenticated;
grant select on products, product_media, categories, tips, licenses, legal_pages to anon, authenticated;

commit;
