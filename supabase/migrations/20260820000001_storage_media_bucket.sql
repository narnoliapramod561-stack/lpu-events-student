-- ==============================================================================
-- LPU Events — Storage Media Bucket & Security Policies
-- ==============================================================================

-- 1. Create 'media' storage bucket (public access for event images/banners/logos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  10485760, -- 10MB max upload size
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];

-- 2. Public Read Policy (Allow anyone to view media assets)
drop policy if exists "Public Access to Media Bucket" on storage.objects;
create policy "Public Access to Media Bucket"
  on storage.objects for select
  using (bucket_id = 'media');

-- 3. Authenticated Admin Upload Policy
drop policy if exists "Authenticated Admin Media Upload" on storage.objects;
create policy "Authenticated Admin Media Upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and exists (
      select 1 from public.admin_users
      where auth_user_id = auth.uid() and is_active = true
    )
  );

-- 4. Authenticated Admin Update Policy
drop policy if exists "Authenticated Admin Media Update" on storage.objects;
create policy "Authenticated Admin Media Update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.admin_users
      where auth_user_id = auth.uid() and is_active = true
    )
  );

-- 5. Authenticated Admin Delete Policy
drop policy if exists "Authenticated Admin Media Delete" on storage.objects;
create policy "Authenticated Admin Media Delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and exists (
      select 1 from public.admin_users
      where auth_user_id = auth.uid() and is_active = true
    )
  );
