-- Migration: 20261031180000_security_fail_closed_retention_cleanup.sql
-- Description: Security Hardening: Fail-closed authorization checks for automated cleanup and retention routines
-- Closes auth.uid() IS NULL logic bypass.

-- 1. Fail-closed cleanup_past_events
create or replace function public.cleanup_past_events(
  p_batch_size integer default 100
)
returns table (
  transitioned_event_id uuid,
  event_name text,
  ended_at timestamptz
) security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer;
begin
  if current_user not in ('postgres', 'service_role') then
    if auth.uid() is null or not public.is_super_admin() then
      raise exception 'Unauthorized past events cleanup.';
    end if;
  end if;

  v_limit := coalesce(p_batch_size, 100);
  if v_limit <= 0 then v_limit := 100; end if;
  if v_limit > 500 then v_limit := 500; end if;

  -- Create temp table to hold transitioned event details
  create temp table _transitioned_events (
    id uuid,
    name text,
    end_at timestamptz
  ) on commit drop;

  -- Lock candidate events where end_at < now() and status = 'PUBLISHED'
  with candidate_events as (
    select e.id, e.name, e.end_at
    from public.events e
    where e.end_at < now() 
      and e.status = 'PUBLISHED'
    order by e.end_at asc
    limit v_limit
    for update skip locked
  ),
  updated as (
    update public.events e
    set status = 'COMPLETED',
        updated_at = now()
    from candidate_events c
    where e.id = c.id
    returning e.id, e.name, e.end_at
  )
  insert into _transitioned_events (id, name, end_at)
  select u.id, u.name, u.end_at from updated u;

  return query
  select t.id, t.name, t.end_at
  from _transitioned_events t;
end;
$$ language plpgsql;

-- 2. Fail-closed cleanup_old_audit_logs
create or replace function public.cleanup_old_audit_logs(
  p_retention_days integer default 15
)
returns integer
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted_count integer := 0;
  v_cutoff timestamptz;
  v_days integer;
begin
  if current_user not in ('postgres', 'service_role') then
    if auth.uid() is null or not public.is_super_admin() then
      raise exception 'Unauthorized audit log cleanup.';
    end if;
  end if;

  v_days := coalesce(p_retention_days, 15);
  if v_days < 7 then v_days := 7; end if; -- Absolute minimum safety floor
  v_cutoff := now() - (v_days || ' days')::interval;

  delete from public.audit_logs
  where created_at < v_cutoff;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$ language plpgsql;

-- 3. Fail-closed cleanup_old_access_requests
create or replace function public.cleanup_old_access_requests(
  p_retention_days integer default 30
)
returns integer
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted_count integer := 0;
  v_cutoff timestamptz;
  v_days integer;
begin
  if current_user not in ('postgres', 'service_role') then
    if auth.uid() is null or not public.is_super_admin() then
      raise exception 'Unauthorized access requests cleanup.';
    end if;
  end if;

  v_days := coalesce(p_retention_days, 30);
  if v_days < 7 then v_days := 7; end if;
  v_cutoff := now() - (v_days || ' days')::interval;

  delete from public.organizer_access_requests
  where status in ('APPROVED', 'REJECTED')
    and resolved_at is not null
    and resolved_at < v_cutoff;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$ language plpgsql;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
