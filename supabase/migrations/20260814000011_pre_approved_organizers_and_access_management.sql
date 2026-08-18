-- 20260814000011_pre_approved_organizers_and_access_management.sql
-- Pre-approved organizers & manual organizer management for Super Admin

-- 1. Table for Pre-Approved Organizers by Email
create table if not exists public.pre_approved_organizers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  organization_name text not null,
  created_at timestamp with time zone default now(),
  created_by uuid references public.admin_users(id),
  constraint uq_pre_approved_email_org unique (email, organization_id)
);

create index if not exists idx_pre_approved_organizers_email on public.pre_approved_organizers(lower(email));

-- RLS policies for pre_approved_organizers
alter table public.pre_approved_organizers enable row level security;

create policy "Super admins can manage pre_approved_organizers"
  on public.pre_approved_organizers
  for all
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- 2. Enhanced handle_new_auth_user to auto-link pre-approved organizers
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

  -- Bootstrap initial Super Admin account securely
  if v_clean_email = 'subhamkumar86032@gmail.com' then
    insert into public.platform_admin_roles (admin_user_id, role)
    values (v_admin_id, 'SUPER_ADMIN')
    on conflict (admin_user_id) do nothing;
  end if;

  -- Auto-link pre-approved organizer invitations
  for v_pre_app in 
    select organization_id, organization_name 
    from public.pre_approved_organizers 
    where lower(email) = v_clean_email
  loop
    insert into public.organization_members (organization_id, admin_user_id, role, is_active)
    values (v_pre_app.organization_id, v_admin_id, 'ORGANIZER', true)
    on conflict (organization_id, admin_user_id) do update
    set role = 'ORGANIZER', is_active = true;

    -- Also record approved access request
    insert into public.organizer_access_requests (admin_user_id, organization_name, status, review_reason)
    values (v_admin_id, v_pre_app.organization_name, 'APPROVED', 'Pre-approved manually by Super Administrator')
    on conflict do nothing;
  end loop;

  return new;
end;
$$ language plpgsql;

-- 3. RPC: Add Organizer Manually by Email (Super Admin Only)
create or replace function public.add_organizer_manually(
  p_email text,
  p_organization_name text,
  p_organization_id uuid default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_sa_id uuid;
  v_clean_email text;
  v_org_id uuid;
  v_admin_id uuid;
  v_member_id uuid;
begin
  -- Check Super Admin authorization
  if auth.uid() is null or not public.is_super_admin() then
    return json_build_object('error', 'Unauthorized. Super Admin permissions required.');
  end if;

  select id into v_sa_id from public.admin_users where auth_user_id = auth.uid() limit 1;
  v_clean_email := lower(trim(p_email));

  if v_clean_email = '' or v_clean_email not like '%@%' then
    return json_build_object('error', 'Please provide a valid email address.');
  end if;

  if trim(p_organization_name) = '' then
    return json_build_object('error', 'Please provide an organization name.');
  end if;

  -- Resolve organization ID
  if p_organization_id is not null then
    v_org_id := p_organization_id;
  else
    select id into v_org_id 
    from public.organizations 
    where lower(trim(name)) = lower(trim(p_organization_name))
    limit 1;

    if v_org_id is null then
      insert into public.organizations (name, is_active)
      values (trim(p_organization_name), true)
      returning id into v_org_id;
    else
      update public.organizations set is_active = true where id = v_org_id;
    end if;
  end if;

  -- Register in pre_approved_organizers table
  insert into public.pre_approved_organizers (email, organization_id, organization_name, created_by)
  values (v_clean_email, v_org_id, trim(p_organization_name), v_sa_id)
  on conflict (email, organization_id) do update
  set organization_name = excluded.organization_name;

  -- Check if admin user profile already exists
  select id into v_admin_id from public.admin_users where lower(email) = v_clean_email limit 1;

  if v_admin_id is not null then
    -- Immediately grant organization membership
    insert into public.organization_members (organization_id, admin_user_id, role, is_active)
    values (v_org_id, v_admin_id, 'ORGANIZER', true)
    on conflict (organization_id, admin_user_id) do update
    set role = 'ORGANIZER', is_active = true
    returning id into v_member_id;

    -- Update any pending access requests for this user
    update public.organizer_access_requests
    set status = 'APPROVED',
        reviewed_by = v_sa_id,
        reviewed_at = now(),
        review_reason = 'Manually approved by Super Administrator'
    where admin_user_id = v_admin_id and status = 'PENDING';
  end if;

  return json_build_object(
    'status', 'success',
    'message', 'Organizer pre-approved successfully. When they log in with this email, they will have instant organizer access.',
    'organization_id', v_org_id,
    'email', v_clean_email
  );
end;
$$ language plpgsql;

grant execute on function public.add_organizer_manually(text, text, uuid) to authenticated;

-- 4. RPC: Revoke Organizer Access (Super Admin Only)
create or replace function public.revoke_organizer_access(
  p_member_id uuid default null,
  p_admin_user_id uuid default null,
  p_organization_id uuid default null,
  p_pre_approved_id uuid default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_sa_id uuid;
  v_email text;
begin
  -- Check Super Admin authorization
  if auth.uid() is null or not public.is_super_admin() then
    return json_build_object('error', 'Unauthorized. Super Admin permissions required.');
  end if;

  select id into v_sa_id from public.admin_users where auth_user_id = auth.uid() limit 1;

  -- Revoke via membership id
  if p_member_id is not null then
    select u.email, m.admin_user_id, m.organization_id
    into v_email, p_admin_user_id, p_organization_id
    from public.organization_members m
    join public.admin_users u on m.admin_user_id = u.id
    where m.id = p_member_id;

    delete from public.organization_members where id = p_member_id;
  elsif p_admin_user_id is not null and p_organization_id is not null then
    select email into v_email from public.admin_users where id = p_admin_user_id;
    delete from public.organization_members 
    where admin_user_id = p_admin_user_id and organization_id = p_organization_id;
  end if;

  -- Revoke pre-approved invitation if email exists
  if v_email is not null and p_organization_id is not null then
    delete from public.pre_approved_organizers
    where lower(email) = lower(v_email) and organization_id = p_organization_id;
  end if;

  if p_pre_approved_id is not null then
    delete from public.pre_approved_organizers where id = p_pre_approved_id;
  end if;

  -- Update access requests to rejected
  if p_admin_user_id is not null then
    update public.organizer_access_requests
    set status = 'REJECTED',
        reviewed_by = v_sa_id,
        reviewed_at = now(),
        review_reason = 'Access revoked by Super Administrator'
    where admin_user_id = p_admin_user_id and status = 'APPROVED';
  end if;

  return json_build_object(
    'status', 'success',
    'message', 'Organizer access revoked successfully.'
  );
end;
$$ language plpgsql;

grant execute on function public.revoke_organizer_access(uuid, uuid, uuid, uuid) to authenticated;

-- 5. RPC: Get All Approved Organizers
create or replace function public.get_approved_organizers()
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_result json;
begin
  if auth.uid() is null or not public.is_super_admin() then
    return json_build_object('error', 'Unauthorized. Super Admin permissions required.');
  end if;

  select json_agg(
    json_build_object(
      'member_id', m.id,
      'admin_user_id', u.id,
      'display_name', u.display_name,
      'email', u.email,
      'organization_id', o.id,
      'organization_name', o.name,
      'role', m.role,
      'is_active', m.is_active,
      'granted_at', m.created_at,
      'type', 'ACTIVE_MEMBER'
    )
  ) into v_result
  from public.organization_members m
  join public.admin_users u on m.admin_user_id = u.id
  join public.organizations o on m.organization_id = o.id
  where m.role = 'ORGANIZER';

  return coalesce(v_result, '[]'::json);
end;
$$ language plpgsql;

grant execute on function public.get_approved_organizers() to authenticated;

-- 6. RPC: Get All Pre-Approved Invitations
create or replace function public.get_pre_approved_organizers()
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_result json;
begin
  if auth.uid() is null or not public.is_super_admin() then
    return json_build_object('error', 'Unauthorized. Super Admin permissions required.');
  end if;

  select json_agg(
    json_build_object(
      'id', p.id,
      'email', p.email,
      'organization_id', p.organization_id,
      'organization_name', p.organization_name,
      'created_at', p.created_at,
      'is_registered', exists(select 1 from public.admin_users u where lower(u.email) = lower(p.email))
    )
  ) into v_result
  from public.pre_approved_organizers p
  order by p.created_at desc;

  return coalesce(v_result, '[]'::json);
end;
$$ language plpgsql;

grant execute on function public.get_pre_approved_organizers() to authenticated;
