-- 20260816000001_image_pipeline_metadata.sql
-- Database Migration: Centralized Image Pipeline Metadata & Optimization Derivatives

-- 1. Extend media_assets with image context, metadata, and optimization tracking
alter table public.media_assets
add column if not exists context text,
add column if not exists metadata jsonb default '{}'::jsonb;

-- 2. Add comment for documentation
comment on column public.media_assets.context is 'UI usage context (hero, event-banner, event-card, advertisement, thumbnail, sponsor-logo, memory)';
comment on column public.media_assets.metadata is 'Image optimization metadata including compression ratio, savings percentage, responsive variant keys, and enhancement parameters';

-- 3. Enhance request_media_upload RPC with context and metadata support
create or replace function public.request_media_upload(
  p_media_type text,
  p_mime_type text,
  p_file_size_bytes integer,
  p_width integer default null,
  p_height integer default null,
  p_context text default null,
  p_checksum text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_media_id uuid;
  v_bucket text;
  v_object_key text;
  v_upload_url text;
  v_hash_prefix text;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- 1. Validate file size (max 10MB)
  if p_file_size_bytes > 10485760 then
    return public.set_api_error(400, 'FILE_TOO_LARGE', 'The file size exceeds the maximum allowed limit of 10MB.');
  end if;

  -- 2. Validate media type
  if p_media_type not in ('EVENT_BANNER', 'SPONSOR_LOGO', 'CAROUSEL_IMAGE', 'MEMORY_IMAGE', 'ADVERTISEMENT') then
    return public.set_api_error(400, 'INVALID_MEDIA_TYPE', 'Invalid media type.');
  end if;

  -- Map bucket name based on type
  case p_media_type
    when 'EVENT_BANNER' then v_bucket := 'media';
    when 'SPONSOR_LOGO' then v_bucket := 'media';
    when 'CAROUSEL_IMAGE' then v_bucket := 'media';
    when 'MEMORY_IMAGE' then v_bucket := 'media';
    when 'ADVERTISEMENT' then v_bucket := 'media';
    else v_bucket := 'media';
  end case;

  -- Generate deterministic or unique object key
  v_media_id := gen_random_uuid();
  if p_checksum is not null and length(trim(p_checksum)) >= 8 then
    v_hash_prefix := substring(p_checksum from 1 for 4);
    v_object_key := 'optimized/' || coalesce(p_context, 'general') || '/' || v_hash_prefix || '/' || p_checksum || '_desktop.webp';
  else
    v_object_key := 'uploads/' || coalesce(p_context, 'media') || '/' || v_media_id::text || '.webp';
  end if;

  -- Insert or resolve media asset ticket
  insert into public.media_assets (
    id,
    bucket,
    object_key,
    media_type,
    mime_type,
    file_size_bytes,
    width,
    height,
    checksum,
    context,
    metadata,
    status,
    created_by
  ) values (
    v_media_id,
    v_bucket,
    v_object_key,
    p_media_type::public.media_type,
    p_mime_type,
    p_file_size_bytes,
    p_width,
    p_height,
    p_checksum,
    p_context,
    coalesce(p_metadata, '{}'::jsonb),
    'UPLOADING',
    v_admin_id
  )
  on conflict (bucket, object_key) do update
  set updated_at = now()
  returning id, object_key into v_media_id, v_object_key;

  v_upload_url := 'https://media.lpu-events.in/' || v_bucket || '/' || v_object_key;

  return json_build_object(
    'media_id', v_media_id,
    'object_key', v_object_key,
    'upload_url', v_upload_url,
    'method', 'PUT',
    'headers', jsonb_build_object(
      'Content-Type', p_mime_type,
      'Cache-Control', 'public, max-age=31536000, immutable'
    )
  );
end;
$$ language plpgsql;

grant execute on function public.request_media_upload(text, text, integer, integer, integer, text, text, jsonb) to authenticated;
