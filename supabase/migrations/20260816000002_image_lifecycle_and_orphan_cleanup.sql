-- 20260816000002_image_lifecycle_and_orphan_cleanup.sql
-- Database Migration: Image Lifecycle Management, Replacement Triggers, and Orphan Cleanup

-- 1. Extend media_assets with pipeline_version and reference_count
alter table public.media_assets
add column if not exists pipeline_version integer default 1,
add column if not exists reference_count integer default 1;

-- 2. Atomically replace media reference on any entity table and manage lifecycle
create or replace function public.replace_entity_media(
  p_entity_table text,
  p_entity_id uuid,
  p_media_column text,
  p_new_media_id uuid
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_media_id uuid;
  v_query text;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  -- Validate table and column against allowed white-list to prevent SQL injection
  if p_entity_table not in ('events', 'advertisements', 'event_memories', 'sponsors', 'carousel_items') then
    return public.set_api_error(400, 'INVALID_TABLE', 'Unsupported entity table.');
  end if;

  if p_media_column not in ('banner_media_id', 'media_id', 'cover_media_id', 'logo_media_id') then
    return public.set_api_error(400, 'INVALID_COLUMN', 'Unsupported media reference column.');
  end if;

  -- Get current media ID
  v_query := format('select %I from public.%I where id = $1', p_media_column, p_entity_table);
  execute v_query into v_old_media_id using p_entity_id;

  -- Update entity with new media ID
  v_query := format('update public.%I set %I = $1, updated_at = now() where id = $2', p_entity_table, p_media_column);
  execute v_query using p_new_media_id, p_entity_id;

  -- If old media was replaced, decrement reference count or mark PENDING_DELETE
  if v_old_media_id is not null and v_old_media_id <> p_new_media_id then
    update public.media_assets
    set status = 'PENDING_DELETE',
        deleted_at = now()
    where id = v_old_media_id
      and not exists (
        select 1 from public.events where banner_media_id = v_old_media_id and id <> p_entity_id
        union all
        select 1 from public.advertisements where media_id = v_old_media_id and id <> p_entity_id
        union all
        select 1 from public.event_memories where cover_media_id = v_old_media_id and id <> p_entity_id
        union all
        select 1 from public.sponsors where logo_media_id = v_old_media_id and id <> p_entity_id
      );
  end if;

  return json_build_object(
    'success', true,
    'old_media_id', v_old_media_id,
    'new_media_id', p_new_media_id
  );
end;
$$ language plpgsql;

-- 3. Garbage collect orphaned or abandoned uploads
create or replace function public.cleanup_orphaned_media_assets(
  p_older_than_interval interval default interval '24 hours'
)
returns table (cleaned_media_id uuid, object_key text) security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  update public.media_assets m
  set status = 'DELETED',
      deleted_at = now()
  where (m.status = 'UPLOADING' and m.created_at < now() - p_older_than_interval)
     or (m.status = 'PENDING_DELETE' and m.deleted_at < now() - interval '1 hour')
  returning m.id as cleaned_media_id, m.object_key;
end;
$$ language plpgsql;

grant execute on function public.replace_entity_media(text, uuid, text, uuid) to authenticated;
grant execute on function public.cleanup_orphaned_media_assets(interval) to authenticated;
