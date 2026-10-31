create or replace function public.get_pre_approved_organizers()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_result json;
begin
	if auth.uid() is null or public.is_super_admin() is distinct from true then
		return json_build_object('error', 'Unauthorized. Super Admin permissions required.');
	end if;

	select json_agg(
		json_build_object(
			'id', p.id,
			'email', p.email,
			'organization_id', p.organization_id,
			'organization_name', p.organization_name,
			'created_at', p.created_at,
			'is_registered', exists (
				select 1
				from public.admin_users as u
				where lower(u.email) = lower(p.email)
			)
		) order by p.created_at desc nulls last
	)
	into v_result
	from public.pre_approved_organizers as p;

	return coalesce(v_result, '[]'::json);
end;
$$;

revoke all privileges on function public.get_pre_approved_organizers() from public, anon;
grant execute on function public.get_pre_approved_organizers() to authenticated;
