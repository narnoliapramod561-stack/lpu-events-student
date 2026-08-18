-- 20260814000002_database_hardening.sql
-- LPU Events Database Hardening and Column-Level Security Triggers

-- 1. Organizations Hardening Trigger Function
create or replace function public.process_organization_changes()
returns trigger security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is not null then
    if not public.is_super_admin() then
      if TG_OP = 'UPDATE' then
        if new.id <> old.id then
          raise exception 'Cannot change organization ID';
        end if;
        if new.is_active <> old.is_active then
          raise exception 'Only Super Admins can activate/deactivate organizations';
        end if;
        if new.created_at <> old.created_at then
          raise exception 'Cannot change organization created_at timestamp';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_organizations_hardening
before update on public.organizations
for each row execute function public.process_organization_changes();


-- 2. Organizer Access Requests Hardening Trigger Function
create or replace function public.process_access_request_changes()
returns trigger security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_is_sa boolean;
begin
  if auth.uid() is not null then
    select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
    if v_admin_id is null then
      raise exception 'Unauthorized administrator profile';
    end if;
    v_is_sa := public.is_super_admin();
    
    if TG_OP = 'INSERT' then
      new.admin_user_id := v_admin_id;
      new.created_at := now();
      new.updated_at := now();
      if not v_is_sa then
        new.status := 'PENDING';
        new.reviewed_by := null;
        new.reviewed_at := null;
        new.review_reason := null;
      end if;
    elsif TG_OP = 'UPDATE' then
      if not v_is_sa then
        raise exception 'Organizers cannot modify access requests';
      end if;
      new.updated_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_access_requests_hardening
before insert or update on public.organizer_access_requests
for each row execute function public.process_access_request_changes();


-- 3. Media Assets Hardening Trigger Function
create or replace function public.process_media_asset_changes()
returns trigger security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_is_sa boolean;
begin
  if auth.uid() is not null then
    select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
    if v_admin_id is null then
      raise exception 'Unauthorized administrator profile';
    end if;
    v_is_sa := public.is_super_admin();
    
    if TG_OP = 'INSERT' then
      new.created_by := v_admin_id;
      new.created_at := now();
      if not v_is_sa then
        new.status := 'UPLOADING';
      end if;
    elsif TG_OP = 'UPDATE' then
      if not v_is_sa then
        if old.created_by = v_admin_id and old.status = 'UPLOADING' and new.status = 'READY' then
          if new.bucket <> old.bucket or
             new.object_key <> old.object_key or
             new.media_type <> old.media_type or
             new.mime_type <> old.mime_type or
             new.file_size_bytes <> old.file_size_bytes or
             new.created_by <> old.created_by or
             new.created_at <> old.created_at then
            raise exception 'Organizers cannot modify media assets properties';
          end if;
        else
          raise exception 'Organizers cannot modify media assets';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_media_assets_hardening
before insert or update on public.media_assets
for each row execute function public.process_media_asset_changes();


-- 4. Events Hardening Trigger Function
create or replace function public.process_event_changes()
returns trigger security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_is_sa boolean;
begin
  if auth.uid() is not null then
    select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
    if v_admin_id is null then
      raise exception 'Unauthorized administrator profile';
    end if;
    v_is_sa := public.is_super_admin();
    
    if TG_OP = 'INSERT' then
      new.created_by := v_admin_id;
      new.updated_by := v_admin_id;
      new.created_at := now();
      new.updated_at := now();
      new.status := 'PUBLISHED';
    elsif TG_OP = 'UPDATE' then
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
    if TG_OP = 'UPDATE' then
      new.updated_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_events_hardening
before insert or update on public.events
for each row execute function public.process_event_changes();


-- 5. Event Content Sections Hardening Trigger Function
create or replace function public.process_content_section_changes()
returns trigger security definer
set search_path = pg_catalog, public
as $$
declare
  v_is_sa boolean;
  v_event_org_id uuid;
begin
  if auth.uid() is not null then
    v_is_sa := public.is_super_admin();
    if not v_is_sa then
      if TG_OP = 'INSERT' then
        select organization_id into v_event_org_id from public.events where id = new.event_id;
        if v_event_org_id is null or not public.is_org_member(v_event_org_id) then
          raise exception 'Unauthorized event content section creation';
        end if;
      elsif TG_OP = 'UPDATE' then
        if new.event_id <> old.event_id then
          raise exception 'Cannot change content section event association';
        end if;
        select organization_id into v_event_org_id from public.events where id = new.event_id;
        if v_event_org_id is null or not public.is_org_member(v_event_org_id) then
          raise exception 'Unauthorized event content section modification';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_content_sections_hardening
before insert or update on public.event_content_sections
for each row execute function public.process_content_section_changes();


-- 6. Advertisement Analytics Interact RPC Function
create or replace function public.track_advertisement_interaction(
  p_advertisement_id uuid,
  p_is_click boolean
)
returns void security definer
set search_path = pg_catalog, public
as $$
declare
  v_exists boolean;
begin
  select exists(select 1 from public.advertisements where id = p_advertisement_id) into v_exists;
  if not v_exists then
    raise exception 'Invalid advertisement ID';
  end if;

  insert into public.advertisement_metrics_daily (advertisement_id, metric_date, impressions, clicks)
  values (
    p_advertisement_id,
    current_date,
    case when not p_is_click then 1 else 0 end,
    case when p_is_click then 1 else 0 end
  )
  on conflict (advertisement_id, metric_date) do update
  set impressions = public.advertisement_metrics_daily.impressions + case when not p_is_click then 1 else 0 end,
      clicks = public.advertisement_metrics_daily.clicks + case when p_is_click then 1 else 0 end,
      updated_at = now();
end;
$$ language plpgsql;

-- Grant EXECUTE permission to anon and authenticated
grant execute on function public.track_advertisement_interaction(uuid, boolean) to anon, authenticated;
