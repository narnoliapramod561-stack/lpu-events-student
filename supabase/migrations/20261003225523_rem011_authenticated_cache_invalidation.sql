create or replace function public.authorize_cache_invalidation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_admin_id uuid;
	v_is_super_admin boolean;
	v_is_organizer boolean;
begin
	if auth.uid() is null then
		return jsonb_build_object('authorized', false, 'is_super_admin', false);
	end if;

	select au.id into v_admin_id
	from public.admin_users as au
	where au.auth_user_id = auth.uid()
		and au.is_active = true;

	if v_admin_id is null then
		return jsonb_build_object('authorized', false, 'is_super_admin', false);
	end if;

	v_is_super_admin := public.is_super_admin() is true;
	select exists (
		select 1
		from public.organization_members as om
		where om.admin_user_id = v_admin_id
			and om.role = 'ORGANIZER'
			and om.is_active = true
	) into v_is_organizer;

	return jsonb_build_object(
		'authorized', v_is_super_admin or v_is_organizer,
		'is_super_admin', v_is_super_admin
	);
end;
$$;

revoke all privileges on function public.authorize_cache_invalidation() from public, anon;
grant execute on function public.authorize_cache_invalidation() to authenticated;
