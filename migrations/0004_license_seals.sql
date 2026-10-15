-- Verifiable licenses. Every order gets a permanent public code (KA-XXXXX-XXXXX) printed in the seal on the
-- checkout pass, the download page and LICENSE.txt; scanning it opens /license/<code>, which shows whether the
-- license is valid and who holds it. Older orders receive a code the first time one is needed.
-- license_holder: the name the buyer asked to have on the license (optional; otherwise the masked email shows).
alter table orders add column license_code text;
alter table orders add column license_holder text;
create unique index orders_license_code on orders (license_code) where license_code is not null;
