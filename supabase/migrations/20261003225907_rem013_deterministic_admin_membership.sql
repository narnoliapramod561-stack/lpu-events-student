create or replace function public.get_current_admin_profile()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_admin_id uuid;
	v_display_name text;
	v_email text;
	v_is_super_admin boolean;
	v_org_id uuid;
	v_org_name text;
	v_org_role text;
begin
	if auth.uid() is null then
		return null;
	end if;

	select au.id, au.display_name, au.email
	into v_admin_id, v_display_name, v_email
	from public.admin_users as au
	where au.auth_user_id = auth.uid()
		and au.is_active = true;

	if v_admin_id is null then
		return null;
	end if;

	select public.is_super_admin() is true into v_is_super_admin;

	if not v_is_super_admin then
		select o.id, o.name, om.role::text
		into v_org_id, v_org_name, v_org_role
		from public.organization_members as om
		join public.organizations as o on o.id = om.organization_id
		where om.admin_user_id = v_admin_id
			and om.role = 'ORGANIZER'
			and om.is_active = true
			and o.is_active = true
		order by om.created_at asc, om.organization_id asc
		limit 1;

		if v_org_id is null then
			return null;
		end if;
	end if;

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
$$;

revoke all privileges on function public.get_current_admin_profile() from public, anon;
grant execute on function public.get_current_admin_profile() to authenticated;
