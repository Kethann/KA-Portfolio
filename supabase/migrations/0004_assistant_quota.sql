-- Gemini free-tier bookkeeping for the portal's "quota left" view. Google counts free requests per
-- model per day (reset at midnight Pacific time) and has no API that says how many are left, so we
-- count this site's own requests per model and learn each model's daily limit from Google's
-- "quota exceeded" reply (it states the limit).
begin;

create table assistant_model_usage (
  day           date not null,                 -- Google's quota day (America/Los_Angeles)
  model         text not null check (length(model) between 1 and 80),
  requests      integer not null default 0 check (requests >= 0),   -- answered
  failures      integer not null default 0 check (failures >= 0),   -- refused (quota, overload, errors)
  quota_limit   integer check (quota_limit > 0),                      -- learned from a daily-quota refusal
  exhausted_at  timestamptz,                                          -- when the daily quota ran out
  primary key (day, model)
);
alter table assistant_model_usage enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on products, product_media, categories, tips, licenses, legal_pages to anon, authenticated;

commit;
