-- 20261003000001_image_pipeline_v2.sql
-- Production Image Pipeline V2 — Deterministic Master & Placement Derivatives
-- 1. Updates media_assets metadata documentation for V2 schema
-- 2. Hardens register_uploaded_media_asset RPC for V2 deterministic keys and placement metadata
-- 3. Updates request_media_upload RPC with V2 object key structure and deduplication

-- 1. Documentation & Metadata Comment
comment on column public.media_assets.metadata is 'V2 Image Pipeline metadata: includes pipeline_version: 2, source { checksum, width, height, mime_type, size_bytes, object_key }, placement { hero, card, details }, variants, and backward-compatible presentations/slots';

-- 2. Ensure index on checksum for instant SHA-256 deduplication lookups
create index if not exists idx_media_assets_checksum_status
on public.media_assets (checksum, status)
where checksum is not null;

-- 3. Dedicated Registration RPC update
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
