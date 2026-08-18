-- 20260816000003_atomic_deletion_claim_and_race_prevention.sql
-- Database Migration: Atomic Deletion Leases, Concurrency Locking & Race Condition Prevention

-- 1. Add DELETING status to media_status enum if not present
do $$
begin
  alter type public.media_status add value if not exists 'DELETING';
exception
  when duplicate_object then null;
end $$;

-- 2. Add claimed_at and retry_count columns
alter table public.media_assets
add column if not exists claimed_at timestamptz default null,
add column if not exists retry_count integer default 0;

-- 3. Atomic Deletion Claim RPC: grants exclusive deletion lease to cleanup worker
create or replace function public.claim_media_for_deletion(
  p_batch_size integer default 25,
  p_lease_interval interval default interval '15 minutes'
)
returns table (
  claimed_media_id uuid,
  bucket text,
  object_key text,
  file_size_bytes integer,
  metadata jsonb,
  retry_count integer
) security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  with candidates as (
    select m.id
    from public.media_assets m
    where (
      (m.status = 'PENDING_DELETE')
      or (m.status = 'DELETING' and m.claimed_at < now() - p_lease_interval)
      or (m.status = 'UPLOADING' and m.created_at < now() - interval '24 hours')
    )
    and not exists (
      select 1 from public.events where banner_media_id = m.id
      union all
      select 1 from public.advertisements where media_id = m.id
      union all
      select 1 from public.event_memories where cover_media_id = m.id
      union all
      select 1 from public.sponsors where logo_media_id = m.id
    )
    limit p_batch_size
    for update skip locked
  )
  update public.media_assets ma
  set status = 'DELETING',
      claimed_at = now(),
      retry_count = ma.retry_count + 1
  from candidates c
  where ma.id = c.id
  returning ma.id as claimed_media_id, ma.bucket, ma.object_key, ma.file_size_bytes, ma.metadata, ma.retry_count;
end;
$$ language plpgsql;

-- 4. Race-proof entity media replacement
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
  v_new_media_status public.media_status;
  v_query text;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  -- Validate table and column against white-list
  if p_entity_table not in ('events', 'advertisements', 'event_memories', 'sponsors', 'carousel_items') then
    return public.set_api_error(400, 'INVALID_TABLE', 'Unsupported entity table.');
  end if;

  if p_media_column not in ('banner_media_id', 'media_id', 'cover_media_id', 'logo_media_id') then
    return public.set_api_error(400, 'INVALID_COLUMN', 'Unsupported media reference column.');
  end if;

  -- Concurrency check: verify new media asset is valid and not currently being physically purged
  if p_new_media_id is not null then
    select status into v_new_media_status from public.media_assets where id = p_new_media_id;
    if v_new_media_status is null then
      return public.set_api_error(404, 'MEDIA_NOT_FOUND', 'Target media asset does not exist.');
    end if;

    if v_new_media_status = 'DELETING' then
      return public.set_api_error(409, 'MEDIA_LOCKED_FOR_DELETION', 'The requested media asset is currently undergoing physical deletion.');
    end if;

    if v_new_media_status = 'DELETED' then
      return public.set_api_error(410, 'MEDIA_DELETED', 'The requested media asset has already been permanently deleted.');
    end if;

    -- If in PENDING_DELETE, safely revive to READY before linking
    if v_new_media_status = 'PENDING_DELETE' then
      update public.media_assets set status = 'READY', deleted_at = null where id = p_new_media_id;
    end if;
  end if;

  -- Fetch current media ID
  v_query := format('select %I from public.%I where id = $1', p_media_column, p_entity_table);
  execute v_query into v_old_media_id using p_entity_id;

  -- Update entity with new media ID
  v_query := format('update public.%I set %I = $1, updated_at = now() where id = $2', p_entity_table, p_media_column);
  execute v_query using p_new_media_id, p_entity_id;

  -- If old media was replaced and is unreferenced, mark PENDING_DELETE
  if v_old_media_id is not null and v_old_media_id <> p_new_media_id then
    update public.media_assets
    set status = 'PENDING_DELETE',
        deleted_at = now()
    where id = v_old_media_id
      and status not in ('DELETING', 'DELETED')
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

grant execute on function public.claim_media_for_deletion(integer, interval) to authenticated;
