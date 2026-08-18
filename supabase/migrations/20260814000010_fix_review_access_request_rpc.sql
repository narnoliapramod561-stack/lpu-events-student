-- Fix review_access_request RPC to align with table schema and enums
create or replace function public.review_access_request(
  request_id uuid,
  action_status text,
  reason text default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_sa_id uuid;
  v_req_status public.access_request_status;
  v_admin_id uuid;
  v_org_name text;
  v_org_id uuid;
begin
  -- Check Super Admin authorization
  if auth.uid() is null or not public.is_super_admin() then
    return json_build_object('error', 'You do not have active administrative permissions for this action.');
  end if;

  -- Get Super Admin ID
  select id into v_sa_id from public.admin_users where auth_user_id = auth.uid() limit 1;

  -- Validate action_status parameter
  if upper(action_status) not in ('APPROVED', 'REJECTED') then
    return json_build_object('error', 'Action status must be APPROVED or REJECTED.');
  end if;

  -- Lock the request row
  select status, admin_user_id, organization_name
  into v_req_status, v_admin_id, v_org_name
  from public.organizer_access_requests
  where id = request_id
  for update;

  if v_req_status is null then
    return json_build_object('error', 'Access request not found.');
  end if;

  if v_req_status <> 'PENDING' then
    return json_build_object('error', 'Access request is already processed.');
  end if;

  if upper(action_status) = 'APPROVED' then
    -- Find or create organization
    select id into v_org_id 
    from public.organizations 
    where lower(trim(name)) = lower(trim(v_org_name)) 
    limit 1;

    if v_org_id is null then
      insert into public.organizations (name, is_active)
      values (trim(v_org_name), true)
      returning id into v_org_id;
    else
      update public.organizations set is_active = true where id = v_org_id;
    end if;

    -- Add admin user to organization members
    insert into public.organization_members (organization_id, admin_user_id, role, is_active)
    values (v_org_id, v_admin_id, 'ORGANIZER', true)
    on conflict (organization_id, admin_user_id) do update
    set role = 'ORGANIZER', is_active = true;

    -- Update access request
    update public.organizer_access_requests
    set status = 'APPROVED',
        reviewed_by = v_sa_id,
        reviewed_at = now(),
        review_reason = coalesce(nullif(trim(reason), ''), 'Approved by Super Administrator')
    where id = request_id;

    return json_build_object(
      'status', 'success',
      'message', 'Access request approved successfully.'
    );
  else
    -- Reject
    update public.organizer_access_requests
    set status = 'REJECTED',
        reviewed_by = v_sa_id,
        reviewed_at = now(),
        review_reason = coalesce(nullif(trim(reason), ''), 'Rejected by Super Administrator')
    where id = request_id;

    return json_build_object(
      'status', 'success',
      'message', 'Access request rejected.'
    );
  end if;
end;
$$ language plpgsql;

grant execute on function public.review_access_request(uuid, text, text) to authenticated;
