-- Migration: 20260905000001_fail_closed_prelaunch_hardening.sql
-- Description: Enforce strict temporal isolation for public events, non-destructive past-event completion,
--               hardened RLS policies on events and event_content_sections, and aggressive retention windows.

-- ==============================================================================
-- 1. INDEXES FOR HIGH-PERFORMANCE TEMPORAL & LIFECYCLE QUERIES
-- ==============================================================================

create index if not exists idx_events_status_end_at on public.events (status, end_at desc);
create index if not exists idx_events_public_active on public.events (end_at asc) where status = 'PUBLISHED';
create index if not exists idx_event_content_sections_event_id on public.event_content_sections (event_id, sort_order asc);

-- ==============================================================================
-- 2. HARDEN PUBLIC RLS POLICIES (FAIL-CLOSED TEMPORAL VISIBILITY)
-- ==============================================================================

-- 2.1 Events Table: Public can ONLY select active PUBLISHED events where end_at >= now()
drop policy if exists events_public_select on public.events;
create policy events_public_select on public.events
  for select using (
    status = 'PUBLISHED' and end_at >= now()
  );

-- Ensure organizer and super admin policies remain intact and comprehensive
-- (events_org_all allows organizers to select their own COMPLETED, DRAFT, PENDING_APPROVAL, and PUBLISHED events)
drop policy if exists events_org_all on public.events;
create policy events_org_all on public.events
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists events_super_admin on public.events;
create policy events_super_admin on public.events
  for all using (public.is_super_admin());

-- 2.2 Event Content Sections Table: Public can ONLY select sections for currently active PUBLISHED events
drop policy if exists event_content_sections_public_select on public.event_content_sections;
create policy event_content_sections_public_select on public.event_content_sections
  for select using (
    exists (
      select 1 from public.events e 
      where e.id = event_content_sections.event_id 
        and e.status = 'PUBLISHED' 
        and e.end_at >= now()
    )
  );

drop policy if exists event_content_sections_org_all on public.event_content_sections;
create policy event_content_sections_org_all on public.event_content_sections
  for all using (
    exists (
      select 1 from public.events e 
      where e.id = event_content_sections.event_id 
        and public.is_org_member(e.organization_id)
    )
  )
  with check (
    exists (
      select 1 from public.events e 
      where e.id = event_content_sections.event_id 
        and public.is_org_member(e.organization_id)
    )
  );

drop policy if exists event_content_sections_super_admin on public.event_content_sections;
create policy event_content_sections_super_admin on public.event_content_sections
  for all using (public.is_super_admin());

-- ==============================================================================
-- 3. NON-DESTRUCTIVE PAST-EVENT COMPLETION RPC
-- ==============================================================================

-- Replaces hard DELETE with controlled status transition: PUBLISHED -> COMPLETED
drop function if exists public.cleanup_past_events();
drop function if exists public.cleanup_past_events(integer);

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
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized past events cleanup.';
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

grant execute on function public.cleanup_past_events(integer) to authenticated, service_role;

-- ==============================================================================
-- 4. AGGRESSIVE RETENTION ROUTINES (15-DAY AUDIT, 30-DAY ACCESS REQUESTS)
-- ==============================================================================

-- 4.1 Audit Logs Retention (Default 15 days)
drop function if exists public.cleanup_old_audit_logs();
drop function if exists public.cleanup_old_audit_logs(integer);

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
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized audit log cleanup.';
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

grant execute on function public.cleanup_old_audit_logs(integer) to authenticated, service_role;

-- 4.2 Resolved Access Requests Retention (Default 30 days)
drop function if exists public.cleanup_old_access_requests();
drop function if exists public.cleanup_old_access_requests(integer);

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
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized access requests cleanup.';
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

grant execute on function public.cleanup_old_access_requests(integer) to authenticated, service_role;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
