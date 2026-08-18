-- LPU Events — Phase 7: Notifications & Transactional Outbox Hardening
-- Migration: 20260814000007_phase7_outbox_notifications.sql

-- 1. RPC: claim_outbox_events
create or replace function public.claim_outbox_events(
  p_batch_size integer default 50
)
returns table (
  id uuid,
  event_type text,
  aggregate_type text,
  aggregate_id uuid,
  payload jsonb,
  attempt_count integer
) security definer
set search_path = pg_catalog, public
as $$
begin
  -- Require authenticated super admin or service role
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized outbox access.';
  end if;

  return query
  with target_events as (
    select oe.id
    from public.outbox_events oe
    where (
      (oe.status = 'PENDING'::public.outbox_status and oe.available_at <= now())
      or
      (oe.status = 'PROCESSING'::public.outbox_status and oe.locked_at < now() - interval '5 minutes')
    )
    order by oe.created_at asc
    limit p_batch_size
    for update skip locked
  )
  update public.outbox_events oe
  set
    status = 'PROCESSING'::public.outbox_status,
    locked_at = now(),
    locked_by = coalesce(auth.uid()::text, 'worker-process')
  from target_events te
  where oe.id = te.id
  returning
    oe.id,
    oe.event_type,
    oe.aggregate_type,
    oe.aggregate_id,
    oe.payload,
    oe.attempt_count;
end;
$$ language plpgsql;

grant execute on function public.claim_outbox_events(integer) to authenticated, service_role;


-- 2. RPC: complete_outbox_event
create or replace function public.complete_outbox_event(
  p_event_id uuid
)
returns json security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null and not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  update public.outbox_events
  set
    status = 'PROCESSED'::public.outbox_status,
    processed_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null
  where id = p_event_id;

  if not found then
    return public.set_api_error(404, 'NOT_FOUND', 'Outbox event not found.');
  end if;

  return json_build_object('status', 'success');
end;
$$ language plpgsql;

grant execute on function public.complete_outbox_event(uuid) to authenticated, service_role;


-- 3. RPC: fail_outbox_event
create or replace function public.fail_outbox_event(
  p_event_id uuid,
  p_error_message text
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_attempts integer;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  select attempt_count into v_current_attempts
  from public.outbox_events
  where id = p_event_id;

  if v_current_attempts is null then
    return public.set_api_error(404, 'NOT_FOUND', 'Outbox event not found.');
  end if;

  v_current_attempts := v_current_attempts + 1;

  if v_current_attempts >= 5 then
    update public.outbox_events
    set
      status = 'FAILED'::public.outbox_status,
      attempt_count = v_current_attempts,
      last_error = p_error_message,
      locked_at = null,
      locked_by = null
    where id = p_event_id;
  else
    update public.outbox_events
    set
      status = 'PENDING'::public.outbox_status,
      attempt_count = v_current_attempts,
      available_at = now() + (v_current_attempts ^ 2 * interval '5 seconds'),
      last_error = p_error_message,
      locked_at = null,
      locked_by = null
    where id = p_event_id;
  end if;

  return json_build_object('status', 'success', 'attempts', v_current_attempts);
end;
$$ language plpgsql;

grant execute on function public.fail_outbox_event(uuid, text) to authenticated, service_role;


-- 4. RPC: retry_outbox_event
create or replace function public.retry_outbox_event(
  p_event_id uuid
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;
  if not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  update public.outbox_events
  set
    status = 'PENDING'::public.outbox_status,
    attempt_count = 0,
    available_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null
  where id = p_event_id;

  if not found then
    return public.set_api_error(404, 'NOT_FOUND', 'Outbox event not found.');
  end if;

  insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
  values (v_admin_id, 'SUPER_ADMIN', 'OUTBOX_RETRY', 'outbox_event', p_event_id, jsonb_build_object('status', 'PENDING'));

  return json_build_object('status', 'success');
end;
$$ language plpgsql;

grant execute on function public.retry_outbox_event(uuid) to authenticated;


-- 5. Update review_access_request to enqueue EMAIL_NOTIFICATION outbox events
create or replace function public.review_access_request(
  request_id uuid,
  action_status text,
  reason text default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_req record;
  v_org_id uuid;
  v_new_status public.access_request_status;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;
  if not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  if upper(action_status) not in ('APPROVED', 'REJECTED') then
    return public.set_api_error(400, 'INVALID_STATUS', 'Action status must be APPROVED or REJECTED.');
  end if;
  v_new_status := upper(action_status)::public.access_request_status;

  select * into v_req from public.organizer_access_requests where id = request_id for update;
  if v_req.id is null then
    return public.set_api_error(404, 'NOT_FOUND', 'Access request not found.');
  end if;
  if v_req.status <> 'PENDING' then
    return public.set_api_error(409, 'INVALID_STATE_TRANSITION', 'Request is no longer PENDING.');
  end if;

  if v_new_status = 'APPROVED' then
    insert into public.organizations (name, slug, is_active)
    values (v_req.organization_name, lower(regexp_replace(v_req.organization_name, '[^a-zA-Z0-9]', '-', 'g')), true)
    returning id into v_org_id;

    insert into public.platform_admin_roles (admin_user_id, role, organization_id, granted_by)
    values (v_req.admin_user_id, 'ORGANIZER'::public.app_role, v_org_id, v_admin_id);

    insert into public.organization_memberships (organization_id, admin_user_id, is_primary)
    values (v_org_id, v_req.admin_user_id, true);
  end if;

  update public.organizer_access_requests set
    status = v_new_status,
    reviewed_by = v_admin_id,
    reviewed_at = now(),
    rejection_reason = case when v_new_status = 'REJECTED' then trim(reason) else null end
  where id = request_id;

  insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
  values (v_admin_id, 'SUPER_ADMIN', 'ACCESS_REQUEST_' || action_status, 'organizer_access_request', request_id, jsonb_build_object('status', action_status, 'applicant_email', v_req.applicant_email));

  -- Enqueue transactional email notification outbox event
  insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
  values (
    'EMAIL_NOTIFICATION',
    'organizer_access_requests',
    request_id,
    jsonb_build_object(
      'template', 'ACCESS_REQUEST_' || action_status,
      'recipient_email', v_req.applicant_email,
      'organization_name', v_req.organization_name,
      'status', action_status,
      'rejection_reason', reason
    )
  );

  return json_build_object('status', 'success');
end;
$$ language plpgsql;

grant execute on function public.review_access_request(uuid, text, text) to authenticated;


-- 6. Hardened RLS policies for outbox_events
alter table public.outbox_events enable row level security;

drop policy if exists outbox_events_super_admin on public.outbox_events;
drop policy if exists outbox_events_super_admin_select on public.outbox_events;

create policy outbox_events_super_admin_select on public.outbox_events
  for select using (public.is_super_admin());


-- 7. RPC: cleanup_processed_outbox_events (Bounded Outbox Table Retention)
create or replace function public.cleanup_processed_outbox_events(
  p_retention_days integer default 7
)
returns integer security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted_count integer;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized outbox cleanup.';
  end if;

  delete from public.outbox_events
  where status = 'PROCESSED'::public.outbox_status
    and processed_at < now() - (p_retention_days || ' days')::interval;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$ language plpgsql;

grant execute on function public.cleanup_processed_outbox_events(integer) to authenticated, service_role;

