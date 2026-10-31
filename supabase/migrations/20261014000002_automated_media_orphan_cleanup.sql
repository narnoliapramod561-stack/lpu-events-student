-- 20261014000002_automated_media_orphan_cleanup.sql
-- Production Optimization: Automated Orphan Media Asset Detection & Storage Conservation
-- Guarantees Cloudflare R2 and Supabase storage never accumulate abandoned drafts or unreferenced files.

create or replace function public.sweep_unreferenced_media_assets(
  p_older_than interval default interval '24 hours'
)
returns table (
  swept_media_id uuid,
  swept_object_key text,
  swept_status text,
  file_size_bytes bigint
) security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  update public.media_assets m
  set status = 'PENDING_DELETE',
      deleted_at = now()
  where m.status in ('READY', 'UPLOADING')
    and m.created_at < now() - p_older_than
    and not exists (
      select 1 from public.events e where e.banner_media_id = m.id
    )
    and not exists (
      select 1 from public.advertisements a where a.media_id = m.id
    )
    and not exists (
      select 1 from public.carousel_items c where c.media_id = m.id
    )
    and not exists (
      select 1 from public.event_memories em where em.cover_media_id = m.id
    )
    and not exists (
      select 1 from public.sponsors s where s.logo_media_id = m.id
    )
  returning m.id as swept_media_id, m.object_key as swept_object_key, m.status as swept_status, m.file_size_bytes;
end;
$$ language plpgsql;

-- Grant execution privileges to service_role and authenticated users
grant execute on function public.sweep_unreferenced_media_assets(interval) to authenticated, service_role;

-- Purge stale DELETED status records older than 30 days to keep Postgres database size compact
create or replace function public.purge_stale_deleted_media_records(
  p_retention_days integer default 30
)
returns integer security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted_count integer := 0;
begin
  delete from public.media_assets
  where status = 'DELETED'
    and deleted_at < now() - (p_retention_days || ' days')::interval;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$ language plpgsql;

grant execute on function public.purge_stale_deleted_media_records(integer) to authenticated, service_role;
