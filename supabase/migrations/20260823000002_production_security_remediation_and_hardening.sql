-- ==============================================================================
-- Migration: 20260823000002_production_security_remediation_and_hardening.sql
-- Description: Production Security Remediation, Hardening & Vulnerability Patching
--
-- Patches:
--   1. AUTH-RPC-001 [CRITICAL]: Lock Outbox RPCs strictly to service_role / Super Admin; REVOKE from public/anon
--   2. IDOR-001     [HIGH]: Enforce entity ownership validation in replace_entity_media()
--   3. AUTH-002     [MEDIUM]: Remove hardcoded Super Admin email bootstrapping from triggers
--   4. UPLOAD-001   [MEDIUM]: Disallow SVG active content in media storage bucket
-- ==============================================================================

-- ==============================================================================
-- 1. PATCH AUTH-RPC-001: Outbox Worker Privilege Revocation & Service Role Locking
-- ==============================================================================

-- Explicitly revoke public and anonymous execution grants on privileged outbox RPCs
revoke execute on function public.claim_outbox_events(integer) from public, anon, authenticated;
revoke execute on function public.complete_outbox_event(uuid) from public, anon, authenticated;
revoke execute on function public.fail_outbox_event(uuid, text) from public, anon, authenticated;
revoke execute on function public.cleanup_processed_outbox_events(integer) from public, anon, authenticated;

-- Grant execution strictly to service_role (and authenticated for Super Admin retry)
grant execute on function public.claim_outbox_events(integer) to service_role;
grant execute on function public.complete_outbox_event(uuid) to service_role;
grant execute on function public.fail_outbox_event(uuid, text) to service_role;
grant execute on function public.cleanup_processed_outbox_events(integer) to service_role;
grant execute on function public.retry_outbox_event(uuid) to authenticated;

-- 1.1 Patch claim_outbox_events
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
declare
  v_role text;
  v_is_sa boolean;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sa := (auth.uid() is not null and public.is_super_admin());

  -- Require backend service_role or authenticated Super Admin
  if v_role <> 'service_role' and not v_is_sa then
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

-- 1.2 Patch complete_outbox_event
create or replace function public.complete_outbox_event(
  p_event_id uuid
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_is_sa boolean;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sa := (auth.uid() is not null and public.is_super_admin());

  if v_role <> 'service_role' and not v_is_sa then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Service role or Super Admin required.');
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

-- 1.3 Patch fail_outbox_event
create or replace function public.fail_outbox_event(
  p_event_id uuid,
  p_error_message text
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_is_sa boolean;
  v_current_attempts integer;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sa := (auth.uid() is not null and public.is_super_admin());

  if v_role <> 'service_role' and not v_is_sa then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Service role or Super Admin required.');
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

-- 1.4 Patch cleanup_processed_outbox_events
create or replace function public.cleanup_processed_outbox_events(
  p_retention_days integer default 7
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text;
  v_is_sa boolean;
  v_deleted_count integer;
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_sa := (auth.uid() is not null and public.is_super_admin());

  if v_role <> 'service_role' and not v_is_sa then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Service role or Super Admin required.');
  end if;

  delete from public.outbox_events
  where status = 'PROCESSED'::public.outbox_status
    and processed_at < now() - (p_retention_days || ' days')::interval;

  get diagnostics v_deleted_count = row_count;

  return json_build_object(
    'status', 'success',
    'deleted_events', v_deleted_count
  );
end;
$$ language plpgsql;


-- ==============================================================================
-- 2. PATCH IDOR-001: Entity Ownership Validation in replace_entity_media()
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

  -- Validate table and column against whitelist
  if p_entity_table not in ('events', 'advertisements', 'event_memories', 'sponsors', 'carousel_items') then
    return public.set_api_error(400, 'INVALID_TABLE', 'Unsupported entity table.');
  end if;

  if p_media_column not in ('banner_media_id', 'media_id', 'cover_media_id', 'logo_media_id') then
    return public.set_api_error(400, 'INVALID_COLUMN', 'Unsupported media reference column.');
  end if;

  -- 2.1 Enforce Entity Ownership Authorization
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
    -- Advertisements, sponsors, memories, and carousel items require Super Admin authorization
    if not v_is_sa then
      return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin permissions required to modify platform media references.');
    end if;
  end if;

  -- 2.2 Concurrency check: verify new media asset is valid and not undergoing deletion
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

grant execute on function public.replace_entity_media(text, uuid, text, uuid) to authenticated;


-- ==============================================================================
-- 3. PATCH AUTH-002: Remove Hardcoded Super Admin Email in Auth Triggers
-- ==============================================================================

create or replace function public.handle_new_auth_user()
returns trigger security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_clean_email text;
  v_pre_app record;
begin
  v_clean_email := lower(trim(new.email));

  -- Create or sync public.admin_users
  insert into public.admin_users (auth_user_id, display_name, email, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(v_clean_email, '@', 1)),
    v_clean_email,
    true
  )
  on conflict (auth_user_id) do update set email = excluded.email
  returning id into v_admin_id;

  if v_admin_id is null then
    select id into v_admin_id from public.admin_users where auth_user_id = new.id;
  end if;

  -- Auto-link pre-approved organizer invitations if configured
  for v_pre_app in 
    select organization_id, organization_name 
    from public.pre_approved_organizers 
    where lower(email) = v_clean_email
  loop
    insert into public.organization_members (organization_id, admin_user_id, role, is_active)
    values (v_pre_app.organization_id, v_admin_id, 'ORGANIZER', true)
    on conflict (organization_id, admin_user_id) do update
    set role = 'ORGANIZER', is_active = true;

    insert into public.organizer_access_requests (admin_user_id, organization_name, status, review_reason)
    values (v_admin_id, v_pre_app.organization_name, 'APPROVED', 'Pre-approved manually by Super Administrator')
    on conflict do nothing;
  end loop;

  return new;
end;
$$ language plpgsql;


-- ==============================================================================
-- 4. PATCH UPLOAD-001: Storage Media Bucket Allowed MIME Types (No Active SVG)
-- ==============================================================================

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'],
    file_size_limit = 10485760
where id = 'media';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
