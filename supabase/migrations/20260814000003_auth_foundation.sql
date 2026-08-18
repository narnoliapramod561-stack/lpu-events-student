-- 20260814000003_auth_foundation.sql
-- LPU Events Authentication and Authorization Foundation

-- 1. Trigger Function to sync auth.users with public.admin_users
create or replace function public.handle_new_auth_user()
returns trigger security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_clean_email text;
begin
  v_clean_email := lower(trim(new.email));

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

  -- Bootstrap initial Super Admin account securely
  if v_clean_email = 'subhamkumar86032@gmail.com' then
    insert into public.platform_admin_roles (admin_user_id, role)
    values (v_admin_id, 'SUPER_ADMIN')
    on conflict (admin_user_id) do nothing;
  end if;

  return new;
end;
$$ language plpgsql;

create or replace trigger trg_handle_new_auth_user
after insert on auth.users
for each row execute function public.handle_new_auth_user();


-- 2. Unified Admin Profile Fetch RPC
create or replace function public.get_current_admin_profile()
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_display_name text;
  v_email text;
  v_is_active boolean;
  v_is_super_admin boolean;
  v_org_id uuid;
  v_org_name text;
  v_org_role text;
begin
  -- Get active admin user profile matching auth.uid()
  select id, display_name, email, is_active 
  into v_admin_id, v_display_name, v_email, v_is_active
  from public.admin_users 
  where auth_user_id = auth.uid() and is_active = true;

  if v_admin_id is null then
    return null;
  end if;

  -- Check platform super admin role
  select exists(
    select 1 from public.platform_admin_roles 
    where admin_user_id = v_admin_id and role = 'SUPER_ADMIN'
  ) into v_is_super_admin;

  -- Check organization membership
  select o.id, o.name, om.role
  into v_org_id, v_org_name, v_org_role
  from public.organization_members om
  join public.organizations o on om.organization_id = o.id
  where om.admin_user_id = v_admin_id;

  return json_build_object(
    'id', v_admin_id,
    'display_name', v_display_name,
    'email', v_email,
    'is_super_admin', v_is_super_admin,
    'org_id', v_org_id,
    'org_name', v_org_name,
    'org_role', v_org_role
  );
end;
$$ language plpgsql;

grant execute on function public.get_current_admin_profile() to anon, authenticated;


-- 3. Super Admin RPC to Approve Organizer Access Requests
create or replace function public.approve_organizer_access_request(
  p_request_id uuid
)
returns void security definer
set search_path = pg_catalog, public
as $$
declare
  v_req_status access_request_status;
  v_admin_id uuid;
  v_org_name text;
  v_org_id uuid;
  v_sa_id uuid;
begin
  -- Verify the current user is a Super Admin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Unauthorized admin action';
  end if;

  -- Get Super Admin user ID
  select id into v_sa_id from public.admin_users where auth_user_id = auth.uid();

  -- Lock the request row
  select status, admin_user_id, organization_name
  into v_req_status, v_admin_id, v_org_name
  from public.organizer_access_requests
  where id = p_request_id
  for update;

  if v_req_status is null then
    raise exception 'Access request not found';
  end if;

  if v_req_status <> 'PENDING' then
    raise exception 'Access request is already processed';
  end if;

  -- Create organization (if it doesn't already exist)
  select id into v_org_id from public.organizations where lower(trim(name)) = lower(trim(v_org_name)) and is_active = true;
  if v_org_id is null then
    insert into public.organizations (name)
    values (v_org_name)
    returning id into v_org_id;
  end if;

  -- Add admin user to organization members
  insert into public.organization_members (organization_id, admin_user_id, role)
  values (v_org_id, v_admin_id, 'ORGANIZER')
  on conflict (organization_id, admin_user_id) do update
  set role = 'ORGANIZER';

  -- Update access request status
  update public.organizer_access_requests
  set status = 'APPROVED',
      reviewed_by = v_sa_id,
      reviewed_at = now()
  where id = p_request_id;
end;
$$ language plpgsql;

grant execute on function public.approve_organizer_access_request(uuid) to authenticated;


-- 4. Super Admin RPC to Reject Organizer Access Requests
create or replace function public.reject_organizer_access_request(
  p_request_id uuid,
  p_reason text
)
returns void security definer
set search_path = pg_catalog, public
as $$
declare
  v_req_status access_request_status;
  v_sa_id uuid;
begin
  -- Verify the current user is a Super Admin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Unauthorized admin action';
  end if;

  -- Get Super Admin user ID
  select id into v_sa_id from public.admin_users where auth_user_id = auth.uid();

  -- Lock the request row
  select status
  into v_req_status
  from public.organizer_access_requests
  where id = p_request_id
  for update;

  if v_req_status is null then
    raise exception 'Access request not found';
  end if;

  if v_req_status <> 'PENDING' then
    raise exception 'Access request is already processed';
  end if;

  -- Update access request status
  update public.organizer_access_requests
  set status = 'REJECTED',
      reviewed_by = v_sa_id,
      reviewed_at = now(),
      review_reason = p_reason
  where id = p_request_id;
end;
$$ language plpgsql;

grant execute on function public.reject_organizer_access_request(uuid, text) to authenticated;


-- 5. RPC to Log Security Events
create or replace function public.log_security_event(
  p_action text,
  p_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns void security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_role text;
begin
  if auth.uid() is not null then
    select id into v_admin_id from public.admin_users where auth_user_id = auth.uid();
    
    select coalesce(
      (select role::text from public.platform_admin_roles where admin_user_id = v_admin_id),
      (select role::text from public.organization_members where admin_user_id = v_admin_id limit 1),
      'AUTHENTICATED'
    ) into v_role;
  else
    v_role := 'ANONYMOUS';
  end if;

  insert into public.audit_logs (
    actor_admin_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_data,
    after_data
  )
  values (
    v_admin_id,
    v_role,
    p_action,
    'security',
    coalesce(v_admin_id, '00000000-0000-0000-0000-000000000000'::uuid),
    p_status,
    null,
    p_metadata
  );
end;
$$ language plpgsql;

grant execute on function public.log_security_event(text, text, jsonb) to anon, authenticated;
