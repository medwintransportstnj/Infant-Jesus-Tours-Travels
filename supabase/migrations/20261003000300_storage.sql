-- =====================================================================
-- Storage: four public-read buckets, admin-only writes.
-- Size and MIME limits are enforced by Storage itself, so they hold even
-- if someone bypasses the admin UI. SVG is intentionally not allowed
-- (it can carry script).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('vehicle-images', 'vehicle-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('gallery-images', 'gallery-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('website-assets', 'website-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('logos',          'logos',          true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets serve files by URL without any policy. We add NO anon policy,
-- so visitors cannot list, upload, overwrite or delete objects.
create policy "site images: admin read" on storage.objects for select to authenticated
  using (bucket_id in ('vehicle-images', 'gallery-images', 'website-assets', 'logos') and (select public.is_admin()));

create policy "site images: admin upload" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('vehicle-images', 'gallery-images', 'website-assets', 'logos')
    and (select public.is_admin())
    -- server-generated style names only: no traversal, no odd extensions
    and name ~ '^[a-z0-9][a-z0-9/_-]{0,120}\.(webp|jpg|jpeg|png)$'
  );

create policy "site images: admin update" on storage.objects for update to authenticated
  using (bucket_id in ('vehicle-images', 'gallery-images', 'website-assets', 'logos') and (select public.is_admin()))
  with check (
    bucket_id in ('vehicle-images', 'gallery-images', 'website-assets', 'logos')
    and (select public.is_admin())
    and name ~ '^[a-z0-9][a-z0-9/_-]{0,120}\.(webp|jpg|jpeg|png)$'
  );

create policy "site images: admin delete" on storage.objects for delete to authenticated
  using (bucket_id in ('vehicle-images', 'gallery-images', 'website-assets', 'logos') and (select public.is_admin()));
