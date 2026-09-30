-- The portal team: more than one person can sign in.
--   role owner  everything, including adding, changing and removing people
--   role admin  the whole portal except managing the team
-- A person the owner adds gets a temporary password and must choose their own at first sign-in.
-- Switching someone off (disabled_at) signs them out everywhere and blocks sign-in; deleting removes
-- the account and every session. The activity log now records who did each thing.
begin;

alter table admin_users add column name text not null default '' check (length(name) <= 80);
alter table admin_users add column role text not null default 'admin' check (role in ('owner', 'admin'));
alter table admin_users add column must_change_password boolean not null default false;
alter table admin_users add column disabled_at timestamptz;
alter table admin_users add column created_by uuid references admin_users(id) on delete set null;

-- whoever set the portal up is its owner
update admin_users set role = 'owner' where id = (select id from admin_users order by created_at limit 1);

alter table audit_log add column actor text;   -- the signed-in person's email (null for visitors / sign-in attempts)

revoke all on all tables in schema public from anon, authenticated;
grant select on products, product_media, categories, tips, licenses, legal_pages to anon, authenticated;

commit;
