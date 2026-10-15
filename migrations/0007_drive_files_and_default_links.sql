-- A product's file can come from Google Drive: the file id is kept here (server side only) and buyers are given our own
-- expiring links, which stream the file through the server (see server/store/drive.js).
--   source   'upload' (stored in private storage, as before) or 'drive'
--   drive_id the Drive file id when source = 'drive' (never sent to a browser)
alter table product_files add column source text not null default 'upload' check (source in ('upload','drive'));
alter table product_files add column drive_id text;

-- Link lifetime and download limit can now be set once for the whole store (Settings > Store & tax > Download links).
-- A product follows that default unless it has its own terms (delivery_custom = 1). Products that already had
-- non-default terms keep them.
alter table products add column delivery_custom integer not null default 0 check (delivery_custom in (0,1));
update products set delivery_custom = 1 where link_ttl_hours <> 48 or max_downloads <> 5;
