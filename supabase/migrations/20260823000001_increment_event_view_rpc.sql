-- Migration: 20260823000001_increment_event_view_rpc.sql
-- Description: High-performance, low-overhead atomic event view counter with zero table lock contention.

create or replace function public.increment_event_view(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.events
  set view_count = coalesce(view_count, 0) + 1
  where id = target_event_id
    and status in ('PUBLISHED', 'COMPLETED');
end;
$$;

-- Revoke from public and explicitly grant execution to anon, authenticated, service_role
revoke all on function public.increment_event_view(uuid) from public;
grant execute on function public.increment_event_view(uuid) to anon, authenticated, service_role;
