drop function if exists public.register_uploaded_media_asset(text, text, text, text, bigint, text, integer, integer, text, jsonb);
drop function if exists public.register_uploaded_media_asset(text, text, text, text, bigint, text, integer, integer, text, jsonb, uuid);
drop function if exists public.confirm_media_upload(uuid);
drop function if exists public.request_media_upload(text, text, integer, integer, integer);
drop function if exists public.request_media_upload(text, text, integer, integer, integer, text, text, jsonb);
drop function if exists public.request_media_upload(text, text, integer, integer, integer, text, text, jsonb, uuid);

create function public.register_uploaded_media_asset(
	p_bucket text,
	p_object_key text,
	p_media_type text,
	p_mime_type text,
	p_file_size_bytes bigint,
	p_checksum text,
	p_width integer,
	p_height integer,
	p_context text,
	p_metadata jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_admin_id uuid;
	v_media_type public.media_type;
	v_is_super_admin boolean;
	v_media_id uuid;
	v_media_status public.media_status;
begin
	if auth.uid() is null then
		return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
	end if;

	select au.id into v_admin_id
	from public.admin_users as au
	where au.auth_user_id = auth.uid()
		and au.is_active = true;

	if v_admin_id is null then
		return public.set_api_error(403, 'UNAUTHORIZED', 'Active admin profile required.');
	end if;

	v_is_super_admin := public.is_super_admin() is true;

	if p_context is null or p_context not in (
		'hero', 'event-banner', 'event-card', 'advertisement', 'thumbnail', 'admin-preview'
	) then
		return public.set_api_error(400, 'INVALID_CONTEXT', 'Unsupported media context.');
	end if;

	if p_context in ('hero', 'advertisement') and not v_is_super_admin then
		return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required for platform media.');
	end if;

	if p_context in ('event-banner', 'event-card', 'thumbnail', 'admin-preview')
		and not v_is_super_admin
		and not exists (
			select 1
			from public.organization_members as om
			where om.admin_user_id = v_admin_id
				and om.role = 'ORGANIZER'
				and om.is_active = true
		) then
		return public.set_api_error(403, 'UNAUTHORIZED', 'Active organizer membership required.');
	end if;

	v_media_type := case
		when p_context = 'hero' then 'CAROUSEL_IMAGE'::public.media_type
		when p_context = 'advertisement' then 'ADVERTISEMENT'::public.media_type
		else 'EVENT_BANNER'::public.media_type
	end;

	if p_media_type is distinct from v_media_type::text then
		return public.set_api_error(400, 'INVALID_MEDIA_TYPE', 'Media type does not match context.');
	end if;
	if p_mime_type is distinct from 'image/webp' then
		return public.set_api_error(400, 'INVALID_MIME_TYPE', 'Optimized media must be WebP.');
	end if;
	if p_file_size_bytes is null or p_file_size_bytes <= 0 or p_file_size_bytes > 10485760 then
		return public.set_api_error(400, 'INVALID_FILE_SIZE', 'Media size must be between 1 byte and 10 MiB.');
	end if;
	if p_width is null or p_height is null or p_width <= 0 or p_height <= 0 or p_width > 30000 or p_height > 30000 then
		return public.set_api_error(400, 'INVALID_DIMENSIONS', 'Media dimensions are invalid.');
	end if;
	if p_checksum is null or p_checksum !~ '^[a-f0-9]{64}$' then
		return public.set_api_error(400, 'INVALID_CHECKSUM', 'A SHA-256 checksum is required.');
	end if;
	if p_bucket is null or p_bucket !~ '^[A-Za-z0-9._-]{1,128}$' then
		return public.set_api_error(400, 'INVALID_BUCKET', 'Bucket name is invalid.');
	end if;
	if p_object_key is null
		or length(p_object_key) > 512
		or p_object_key like '/%'
		or position('..' in p_object_key) > 0
		or p_object_key ~ '[^A-Za-z0-9._/-]'
		or position(p_checksum in p_object_key) = 0 then
		return public.set_api_error(400, 'INVALID_OBJECT_KEY', 'Object key must be a safe, content-addressed key.');
	end if;
	if p_metadata is not null and jsonb_typeof(p_metadata) is distinct from 'object' then
		return public.set_api_error(400, 'INVALID_METADATA', 'Metadata must be a JSON object.');
	end if;

	insert into public.media_assets as existing_media (
		bucket,
		object_key,
		media_type,
		mime_type,
		file_size_bytes,
		checksum,
		width,
		height,
		context,
		metadata,
		status,
		created_by,
		verified_at,
		deleted_at
	) values (
		p_bucket,
		p_object_key,
		v_media_type,
		p_mime_type,
		p_file_size_bytes,
		p_checksum,
		p_width,
		p_height,
		p_context,
		coalesce(p_metadata, '{}'::jsonb),
		'UPLOADING'::public.media_status,
		v_admin_id,
		null,
		null
	)
	on conflict (bucket, object_key) do update
	set media_type = excluded.media_type,
			mime_type = excluded.mime_type,
			file_size_bytes = excluded.file_size_bytes,
			width = excluded.width,
			height = excluded.height,
			context = excluded.context,
			metadata = excluded.metadata,
			status = case when existing_media.status = 'READY'::public.media_status
				then existing_media.status else 'UPLOADING'::public.media_status end,
			verified_at = case when existing_media.status = 'READY'::public.media_status
				then existing_media.verified_at else null end,
			deleted_at = null
	where existing_media.created_by = v_admin_id
		and existing_media.checksum = excluded.checksum
		and existing_media.status in ('UPLOADING', 'READY', 'FAILED')
	returning id, status into v_media_id, v_media_status;

	if v_media_id is null then
		return public.set_api_error(409, 'MEDIA_CONFLICT', 'Object key belongs to another asset or upload is being deleted.');
	end if;

	return json_build_object(
		'success', true,
		'media_id', v_media_id,
		'object_key', p_object_key,
		'bucket', p_bucket,
		'status', v_media_status
	);
end;
$$;

revoke all privileges on function public.register_uploaded_media_asset(text, text, text, text, bigint, text, integer, integer, text, jsonb) from public, anon;
grant execute on function public.register_uploaded_media_asset(text, text, text, text, bigint, text, integer, integer, text, jsonb) to authenticated;

