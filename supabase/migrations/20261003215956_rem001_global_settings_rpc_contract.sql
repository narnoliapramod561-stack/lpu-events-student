create or replace function public.manage_global_setting(
	p_action text,
	p_key text default null,
	p_value jsonb default null,
	p_description text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_admin_id uuid;
	v_key text;
	v_before jsonb;
	v_after jsonb;
begin
	if auth.uid() is null then
		return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
	end if;

	if public.is_super_admin() is distinct from true then
		return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
	end if;

	v_admin_id := public.resolve_admin_id();
	if v_admin_id is null then
		return public.set_api_error(403, 'UNAUTHORIZED', 'Active admin profile required.');
	end if;

	if p_action is distinct from 'upsert' then
		return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: upsert.');
	end if;

	v_key := nullif(btrim(p_key), '');
	if v_key is null then
		return public.set_api_error(400, 'VALIDATION_ERROR', 'Setting key is required.');
	end if;
	if p_value is null then
		return public.set_api_error(400, 'VALIDATION_ERROR', 'Setting value is required.');
	end if;

	select jsonb_build_object('value', gs.value, 'description', gs.description)
		into v_before
	from public.global_settings as gs
	where gs.key = v_key;

	insert into public.global_settings (key, value, description, updated_by, updated_at)
	values (v_key, p_value, nullif(btrim(p_description), ''), v_admin_id, now())
	on conflict (key) do update
	set value = excluded.value,
			description = coalesce(excluded.description, public.global_settings.description),
			updated_by = v_admin_id,
			updated_at = now()
	returning jsonb_build_object('key', key, 'value', value, 'description', description)
		into v_after;

	insert into public.audit_logs (
		actor_admin_id,
		actor_role,
		action,
		target_type,
		target_id,
		before_data,
		after_data
	)
	values (
		v_admin_id,
		'SUPER_ADMIN',
		case when v_before is null then 'SETTING_CREATE' else 'SETTING_UPDATE' end,
		'global_setting',
		gen_random_uuid(),
		v_before,
		v_after
	);

	return json_build_object('status', 'success', 'key', v_key);
end;
$$;

revoke all privileges on function public.manage_global_setting(text, text, jsonb, text) from public, anon;
grant execute on function public.manage_global_setting(text, text, jsonb, text) to authenticated;
