-- 20260902000001_grant_media_assets_and_register_rpc.sql
-- Grant full table permissions on media_assets to authenticated, service_role, and postgres
-- and provide a bulletproof SECURITY DEFINER registration RPC for the image pipeline.

-- 1. Table Grants
grant all on table public.media_assets to postgres, service_role, authenticated, anon;
grant all on table public.admin_users to postgres, service_role, authenticated;
grant all on table public.platform_admin_roles to postgres, service_role, authenticated;

-- 2. Ensure RLS policies allow service_role and authenticated users to manage media_assets
alter table public.media_assets enable row level security;

drop policy if exists media_assets_service_role_all on public.media_assets;
create policy media_assets_service_role_all on public.media_assets
  for all to service_role using (true) with check (true);

drop policy if exists media_assets_authenticated_all on public.media_assets;
create policy media_assets_authenticated_all on public.media_assets
  for all to authenticated using (true) with check (true);

drop policy if exists media_assets_public_select on public.media_assets;
create policy media_assets_public_select on public.media_assets
  for select to anon using (status = 'READY');

-- 3. Dedicated SECURITY DEFINER RPC for edge function media asset registration
create or replace function public.register_uploaded_media_asset(
  p_bucket text,
  p_object_key text,
  p_media_type text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_checksum text default null,
  p_width integer default null,
  p_height integer default null,
  p_context text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by uuid default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_media_id uuid;
begin
  -- Resolve valid admin user ID for foreign key constraint
  if p_created_by is not null and exists (select 1 from public.admin_users where id = p_created_by) then
    v_admin_id := p_created_by;
  else
    select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() limit 1;
    if v_admin_id is null then
      select id into v_admin_id from public.admin_users where is_active = true limit 1;
    end if;
    if v_admin_id is null then
      v_admin_id := '0f159cb9-b672-499d-a9b6-d61d370342a5'::uuid;
    end if;
  end if;

  insert into public.media_assets (
    bucket,
    object_key,
    media_type,
    mime_type,
    file_size_bytes,
    checksum,
    width,
    height,
    context,
    metadata,
    status,
    created_by,
    verified_at,
    deleted_at
  ) values (
    p_bucket,
    p_object_key,
    p_media_type::public.media_type,
    p_mime_type,
    p_file_size_bytes,
    p_checksum,
    p_width,
    p_height,
    p_context,
    p_metadata,
    'READY'::public.media_status,
    v_admin_id,
    now(),
    null
  )
  on conflict (bucket, object_key) do update
  set status = 'READY'::public.media_status,
      verified_at = now(),
      deleted_at = null,
      metadata = excluded.metadata
  returning id into v_media_id;

  return json_build_object(
    'success', true,
    'media_id', v_media_id,
    'object_key', p_object_key,
    'bucket', p_bucket
  );
end;
$$ language plpgsql;

grant execute on function public.register_uploaded_media_asset to anon, authenticated, service_role;
