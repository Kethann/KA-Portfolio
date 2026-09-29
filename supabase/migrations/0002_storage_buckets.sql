-- Storage buckets (Supabase only; skipped where the storage schema doesn't exist, e.g. PGlite).
--   media         public   images for products, tips and the portfolio   (10 MB, images only)
--   deliverables  private  files buyers download via signed links only   (50 MB = free-tier max)
--   backups       private  weekly database exports                        (50 MB)
-- No storage policies are created: with RLS on storage.objects and no policies, browsers can't
-- list, read or write private objects; only the server's service-role key can.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('media', 'media', true, 10485760, array['image/png','image/jpeg','image/webp','image/avif','image/gif']),
      ('deliverables', 'deliverables', false, 52428800, null),
      ('backups', 'backups', false, 52428800, array['application/gzip','application/json'])
    on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;
