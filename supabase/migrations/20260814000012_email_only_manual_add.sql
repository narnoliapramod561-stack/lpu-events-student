-- Update add_organizer_manually to allow optional organization_name (defaults automatically)
create or replace function public.add_organizer_manually(
  p_email text,
  p_organization_name text default null,
  p_organization_id uuid default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_sa_id uuid;
  v_clean_email text;
  v_org_id uuid;
  v_org_name text;
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

  -- Determine default organization name if not supplied
  if p_organization_name is not null and trim(p_organization_name) <> '' then
    v_org_name := trim(p_organization_name);
  else
    -- Use a clean default derived from username or general organizer entity
    v_org_name := initcap(replace(split_part(v_clean_email, '@', 1), '.', ' ')) || ' Events';
  end if;

  -- Resolve organization ID
  if p_organization_id is not null then
    v_org_id := p_organization_id;
  else
    select id into v_org_id 
    from public.organizations 
    where lower(trim(name)) = lower(trim(v_org_name))
    limit 1;

    if v_org_id is null then
      insert into public.organizations (name, is_active)
      values (v_org_name, true)
      returning id into v_org_id;
    else
      update public.organizations set is_active = true where id = v_org_id;
    end if;
  end if;

  -- Register in pre_approved_organizers table
  insert into public.pre_approved_organizers (email, organization_id, organization_name, created_by)
  values (v_clean_email, v_org_id, v_org_name, v_sa_id)
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
