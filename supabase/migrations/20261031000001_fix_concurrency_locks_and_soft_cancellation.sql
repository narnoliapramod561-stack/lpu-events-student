-- Migration: 20261031000001_fix_concurrency_locks_and_soft_cancellation.sql
-- Description:
-- 1. High-Concurrency Scale Fix: Decouple view counter increments from resource_versions row locking
-- 2. Prevent row write amplification & updated_at churn during anonymous event view tracking
-- 3. Soft-Cancellation & Reason Preservation: Transition events to CANCELLED instead of hard-deleting
-- 4. Enable public read access for CANCELLED events so students see the organizer's cancellation reason

-- ==============================================================================
-- 1. Add cancellation_reason Column to Events
-- ==============================================================================
alter table public.events
  add column if not exists cancellation_reason text;

-- ==============================================================================
-- 2. Decouple trg_events_version_inc from View Counter
-- ==============================================================================
-- Decouple Events Version Increment from View Counter
create or replace function public.increment_events_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Fast path: if substantive fields did not change (e.g. view_count increment only), do not bump version
    if (
      old.name is not distinct from new.name and
      old.description is not distinct from new.description and
      old.start_at is not distinct from new.start_at and
      old.end_at is not distinct from new.end_at and
      old.venue_name is not distinct from new.venue_name and
      old.status is not distinct from new.status and
      (old.banner_media_id is not distinct from new.banner_media_id) and
      (old.category_id is not distinct from new.category_id) and
      (old.subcategory_id is not distinct from new.subcategory_id) and
      (old.pricing_type is not distinct from new.pricing_type) and
      (old.price_amount is not distinct from new.price_amount) and
      (old.registration_mode is not distinct from new.registration_mode) and
      (old.external_registration_url is not distinct from new.external_registration_url) and
      (old.capacity_limit is not distinct from new.capacity_limit) and
      (old.cancellation_reason is not distinct from new.cancellation_reason)
    ) then
      return new;
    end if;
  end if;

  insert into public.resource_versions (resource, version, updated_at)
  values ('events', 1, now())
  on conflict (resource) do update
  set version = public.resource_versions.version + 1,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_events_version_inc on public.events;
create trigger trg_events_version_inc
after insert or update or delete on public.events
for each row
execute function public.increment_events_version();

-- ==============================================================================
-- 3. Update process_event_changes() to Skip updated_at Churn on View Counts
-- ==============================================================================
create or replace function public.process_event_changes()
returns trigger
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_is_sa boolean;
  v_is_view_count_only boolean;
begin
  -- Fast-path detection: Check if this is strictly a view_count increment
  if tg_op = 'UPDATE' then
    v_is_view_count_only := (
      old.id = new.id and
      old.name = new.name and
      old.start_at = new.start_at and
      old.end_at = new.end_at and
      old.status = new.status and
      (old.banner_media_id is not distinct from new.banner_media_id) and
      (old.category_id is not distinct from new.category_id) and
      (old.subcategory_id is not distinct from new.subcategory_id) and
      (old.description is not distinct from new.description) and
      (old.venue_name is not distinct from new.venue_name) and
      (old.registration_mode is not distinct from new.registration_mode) and
      (old.pricing_type is not distinct from new.pricing_type) and
      (old.price_amount is not distinct from new.price_amount) and
      (old.view_count is distinct from new.view_count)
    );

    if v_is_view_count_only then
      -- Zero write amplification: do NOT touch updated_at on view count increments!
      return new;
    end if;
  end if;

  if auth.uid() is not null then
    select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
    if v_admin_id is null then
      raise exception 'Active administrative profile required for event mutations';
    end if;

    if tg_op = 'INSERT' then
      new.created_by := v_admin_id;
      new.updated_by := v_admin_id;
      new.created_at := now();
      new.updated_at := now();
    elsif tg_op = 'UPDATE' then
      v_is_sa := public.is_super_admin();
      if not v_is_sa then
        if new.organization_id <> old.organization_id then
          raise exception 'Cannot change event organization ownership';
        end if;
        if new.created_by <> old.created_by then
          raise exception 'Cannot change event creator (created_by)';
        end if;
        if new.created_at <> old.created_at then
          raise exception 'Cannot change event creation timestamp (created_at)';
        end if;
        if new.status <> old.status and new.status = 'COMPLETED' then
          raise exception 'Only system jobs or Super Admins can transition events to COMPLETED';
        end if;
      end if;
      new.updated_by := v_admin_id;
      new.updated_at := now();
    end if;
  else
    if tg_op = 'UPDATE' then
      new.updated_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

-- ==============================================================================
-- 4. Soft-Cancellation RPC: cancel_event()
-- ==============================================================================
create or replace function public.cancel_event(
  p_event_id uuid,
  p_reason text
)
returns json
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_org_id uuid;
  v_before_data jsonb;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  select organization_id, jsonb_build_object('name', name, 'category_id', category_id, 'subcategory_id', subcategory_id, 'status', status)
  into v_org_id, v_before_data
  from public.events 
  where id = p_event_id
  for update;

  if v_org_id is null then
    return public.set_api_error(404, 'EVENT_NOT_FOUND', 'The selected event was not found.');
  end if;

  if not public.is_super_admin() then
    if not exists(
      select 1 from public.organization_members 
      where organization_id = v_org_id and admin_user_id = v_admin_id and role = 'ORGANIZER'
    ) then
      return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have active administrative permissions for this organization.', jsonb_build_object('organization_id', v_org_id));
    end if;
  end if;

  -- Soft-cancel: preserve the event entity and store the cancellation reason
  update public.events
  set status = 'CANCELLED',
      cancellation_reason = trim(p_reason),
      updated_by = v_admin_id,
      updated_at = now()
  where id = p_event_id;

  -- Remove from active curation tables
  delete from public.featured_events where event_id = p_event_id;
  delete from public.trending_events where event_id = p_event_id;
  delete from public.carousel_items where event_id = p_event_id;

  -- Audit log entry
  insert into public.audit_logs (
    actor_admin_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_data,
    after_data
  ) values (
    v_admin_id,
    coalesce((select role::text from public.platform_admin_roles where admin_user_id = v_admin_id), 'ORGANIZER'),
    'EVENT_CANCEL',
    'event',
    p_event_id,
    p_reason,
    v_before_data,
    jsonb_build_object('status', 'CANCELLED', 'cancellation_reason', trim(p_reason))
  );

  return json_build_object(
    'status', 'success',
    'message', 'Event marked as CANCELLED with cancellation reason recorded.'
  );
end;
$$ language plpgsql;

-- ==============================================================================
-- 5. Updated RLS Policies for Events & Content Sections
-- ==============================================================================
drop policy if exists events_public_select on public.events;
create policy events_public_select on public.events
  for select using (
    (status = 'PUBLISHED' and end_at >= now())
    or status in ('PUBLISHED', 'COMPLETED', 'CANCELLED')
  );

drop policy if exists event_content_sections_public_select on public.event_content_sections;
create policy event_content_sections_public_select on public.event_content_sections
  for select using (
    exists (
      select 1 from public.events e 
      where e.id = event_content_sections.event_id 
        and e.status in ('PUBLISHED', 'COMPLETED', 'CANCELLED')
    )
  );
