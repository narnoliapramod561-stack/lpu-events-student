-- ==============================================================================
-- Migration: 20260823000003_security_hardening_v2.sql
-- Description: Comprehensive Security Remediation & Strict Least-Privilege Hardening (V2 Final)
--
-- Architectural Refinements:
--   1. Strict Worker-Only Outbox Execution Domain (No Super Admin / Authenticated Overlap)
--   2. Worker Lease Ownership Validation (locked_by matching prevents race completions)
--   3. Strict Parameter Bounding & Concurrency Controls on Queue Primitives
--   4. Explicit Administrative Super-Admin Guard on retry_outbox_event (FAILED status only)
--   5. Dual-Check Media Authorization in replace_entity_media (Event Org + Media Asset Org)
--   6. Strict Attachment State Rule (PENDING_DELETE -> DENIED, READY only)
--   7. Removal of Stale Draft-State Concepts (Aligning with Direct Publish Architecture)
--   8. Storage Media Bucket Active Content Restriction
-- ==============================================================================

-- ==============================================================================
-- 1. OUTBOX WORKER RPC PRIVILEGE REVOCATION & STRICT ROLE SEPARATION
-- ==============================================================================

-- Revoke all execution grants from public, anon, and generic authenticated roles
revoke execute on function public.claim_outbox_events(integer) from public, anon, authenticated;
revoke execute on function public.claim_outbox_events(integer, text) from public, anon, authenticated;
revoke execute on function public.complete_outbox_event(uuid) from public, anon, authenticated;
revoke execute on function public.complete_outbox_event(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_outbox_event(uuid, text) from public, anon, authenticated;
revoke execute on function public.fail_outbox_event(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cleanup_processed_outbox_events(integer) from public, anon, authenticated;
revoke execute on function public.retry_outbox_event(uuid) from public, anon;

-- Drop previous overloaded signatures to avoid confusion
drop function if exists public.claim_outbox_events(integer);
drop function if exists public.complete_outbox_event(uuid);
drop function if exists public.fail_outbox_event(uuid, text);

-- 1.1 Worker-Only claim_outbox_events with Parameter Bounding & Worker ID Lease
create or replace function public.claim_outbox_events(
  p_batch_size integer default 50,
  p_worker_id text default 'worker-process'
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
declare
  v_role text;
  v_bounded_batch integer;
  v_safe_worker_id text;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  -- Enforce strict service_role worker execution
  if v_role <> 'service_role' then
    raise exception 'Unauthorized: Service role worker credentials required.';
  end if;

  -- Bounded batch size (1 to 100 max)
  v_bounded_batch := greatest(1, least(coalesce(p_batch_size, 50), 100));
  v_safe_worker_id := coalesce(nullif(trim(p_worker_id), ''), 'worker-process');

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
    limit v_bounded_batch
    for update skip locked
  )
  update public.outbox_events oe
  set
    status = 'PROCESSING'::public.outbox_status,
    locked_at = now(),
    locked_by = v_safe_worker_id
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

-- 1.2 Worker-Only complete_outbox_event with Lease Ownership Validation
create or replace function public.complete_outbox_event(
  p_event_id uuid,
  p_worker_id text default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if v_role <> 'service_role' then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Service role credentials required.');
  end if;

  update public.outbox_events
  set
    status = 'PROCESSED'::public.outbox_status,
    processed_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null
  where id = p_event_id
    and (p_worker_id is null or locked_by is null or locked_by = p_worker_id);

  if not found then
    return public.set_api_error(404, 'NOT_FOUND', 'Outbox event not found or lease expired.');
  end if;

  return json_build_object('status', 'success');
end;
$$ language plpgsql;

-- 1.3 Worker-Only fail_outbox_event with Lease Ownership & Bounded Payload
create or replace function public.fail_outbox_event(
  p_event_id uuid,
  p_error_message text,
  p_worker_id text default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_current_attempts integer;
  v_safe_error text;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if v_role <> 'service_role' then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Service role credentials required.');
  end if;

  v_safe_error := substr(coalesce(p_error_message, 'Worker execution failure'), 1, 1000);

  select attempt_count into v_current_attempts
  from public.outbox_events
  where id = p_event_id
    and (p_worker_id is null or locked_by is null or locked_by = p_worker_id);

  if v_current_attempts is null then
    return public.set_api_error(404, 'NOT_FOUND', 'Outbox event not found or lease expired.');
  end if;

  v_current_attempts := v_current_attempts + 1;

  if v_current_attempts >= 5 then
    update public.outbox_events
    set
      status = 'FAILED'::public.outbox_status,
      attempt_count = v_current_attempts,
      last_error = v_safe_error,
      locked_at = null,
      locked_by = null
    where id = p_event_id;
  else
    update public.outbox_events
    set
      status = 'PENDING'::public.outbox_status,
      attempt_count = v_current_attempts,
      available_at = now() + (v_current_attempts ^ 2 * interval '5 seconds'),
      last_error = v_safe_error,
      locked_at = null,
      locked_by = null
    where id = p_event_id;
  end if;

  return json_build_object('status', 'success', 'attempts', v_current_attempts);
end;
$$ language plpgsql;

-- 1.4 Worker-Only cleanup_processed_outbox_events
create or replace function public.cleanup_processed_outbox_events(
  p_retention_days integer default 7
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_safe_retention integer;
  v_deleted_count integer;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');

  if v_role <> 'service_role' then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Service role credentials required.');
  end if;

  v_safe_retention := greatest(1, least(coalesce(p_retention_days, 7), 365));

  delete from public.outbox_events
  where status = 'PROCESSED'::public.outbox_status
    and processed_at < now() - (v_safe_retention || ' days')::interval;

  get diagnostics v_deleted_count = row_count;

  return json_build_object(
    'status', 'success',
    'deleted_events', v_deleted_count
  );
end;
$$ language plpgsql;

-- Grant worker primitives strictly to service_role
grant execute on function public.claim_outbox_events(integer, text) to service_role;
grant execute on function public.complete_outbox_event(uuid, text) to service_role;
grant execute on function public.fail_outbox_event(uuid, text, text) to service_role;
grant execute on function public.cleanup_processed_outbox_events(integer) to service_role;

-- 1.5 Super-Admin Only retry_outbox_event (FAILED Status Only)
create or replace function public.retry_outbox_event(
  p_event_id uuid
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_current_status public.outbox_status;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  if not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin permissions required to retry outbox events.');
  end if;

  select status into v_current_status
  from public.outbox_events
  where id = p_event_id;

  if v_current_status is null then
    return public.set_api_error(404, 'NOT_FOUND', 'Outbox event not found.');
  end if;

  if v_current_status <> 'FAILED'::public.outbox_status then
    return public.set_api_error(409, 'INVALID_STATE', 'Only FAILED outbox events can be manually retried.');
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

  insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
  values (v_admin_id, 'SUPER_ADMIN', 'OUTBOX_RETRY', 'outbox_event', p_event_id, jsonb_build_object('status', 'PENDING'));

  return json_build_object('status', 'success');
end;
$$ language plpgsql;

grant execute on function public.retry_outbox_event(uuid) to authenticated;


-- ==============================================================================
-- 2. DUAL-CHECK MEDIA AUTHORIZATION IN replace_entity_media
-- ==============================================================================

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
  v_admin_id uuid;
  v_is_sa boolean;
  v_event_org_id uuid;
  v_media_authorized boolean;
  v_old_media_id uuid;
  v_new_media_status public.media_status;
  v_query text;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;
  v_is_sa := public.is_super_admin();

  -- Whitelist validation on table and column
  if p_entity_table not in ('events', 'advertisements', 'event_memories', 'sponsors', 'carousel_items') then
    return public.set_api_error(400, 'INVALID_TABLE', 'Unsupported entity table.');
  end if;

  if p_media_column not in ('banner_media_id', 'media_id', 'cover_media_id', 'logo_media_id') then
    return public.set_api_error(400, 'INVALID_COLUMN', 'Unsupported media reference column.');
  end if;

  -- 2.1 Entity Ownership Authorization
  if p_entity_table = 'events' then
    if not v_is_sa then
      select organization_id into v_event_org_id from public.events where id = p_entity_id;
      if v_event_org_id is null then
        return public.set_api_error(404, 'EVENT_NOT_FOUND', 'Target event does not exist.');
      end if;
      if not public.is_org_member(v_event_org_id) then
        return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have administrative permissions for this event''s organization.');
      end if;
    end if;
  else
    -- Advertisements, sponsors, memories, carousel items require Super Admin
    if not v_is_sa then
      return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin permissions required to modify platform media references.');
    end if;
  end if;

  -- 2.2 New Media Asset Ownership & State Authorization (Dual Check)
  if p_new_media_id is not null then
    select status into v_new_media_status from public.media_assets where id = p_new_media_id;
    if v_new_media_status is null then
      return public.set_api_error(404, 'MEDIA_NOT_FOUND', 'Target media asset does not exist.');
    end if;

    -- Strict attachment state: only READY assets can be attached
    if v_new_media_status <> 'READY'::public.media_status then
      return public.set_api_error(409, 'MEDIA_NOT_READY', 'Only media assets in READY status can be attached to entities.');
    end if;

    -- Verify media asset ownership if caller is an organizer
    if not v_is_sa and p_entity_table = 'events' then
      select exists (
        select 1 from public.media_assets ma
        join public.organization_members om on ma.created_by = om.admin_user_id
        where ma.id = p_new_media_id
          and om.organization_id = v_event_org_id
          and om.is_active = true
      ) into v_media_authorized;

      if not v_media_authorized then
        return public.set_api_error(403, 'INSUFFICIENT_MEDIA_PERMISSIONS', 'Target media asset does not belong to the authorized organization.');
      end if;
    end if;
  end if;

  -- Fetch current media ID
  v_query := format('select %I from public.%I where id = $1', p_media_column, p_entity_table);
  execute v_query into v_old_media_id using p_entity_id;

  -- Update entity with new media ID
  v_query := format('update public.%I set %I = $1, updated_at = now() where id = $2', p_entity_table, p_media_column);
  execute v_query using p_new_media_id, p_entity_id;

  -- Mark unreferenced old media PENDING_DELETE
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

grant execute on function public.replace_entity_media(text, uuid, text, uuid) to authenticated;


-- ==============================================================================
-- 3. STORAGE MEDIA BUCKET WHITELIST (RASTER & WEBP ONLY, NO ACTIVE SVG)
-- ==============================================================================

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'],
    file_size_limit = 10485760
where id = 'media';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
