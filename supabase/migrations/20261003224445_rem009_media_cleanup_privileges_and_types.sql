drop function if exists public.claim_media_for_deletion(integer, interval);

create function public.claim_media_for_deletion(
	p_batch_size integer default 25,
	p_lease_interval interval default interval '15 minutes'
)
returns table (
	claimed_media_id uuid,
	bucket text,
	object_key text,
	file_size_bytes bigint,
	metadata jsonb,
	retry_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_batch_size integer := greatest(1, least(coalesce(p_batch_size, 25), 100));
	v_lease interval := least(coalesce(p_lease_interval, interval '15 minutes'), interval '1 hour');
begin
	if auth.uid() is null then
		if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
			return;
		end if;
	elsif public.is_super_admin() is distinct from true then
		return;
	end if;

	return query
	with candidates as (
		select m.id
		from public.media_assets as m
		where (
			m.status = 'PENDING_DELETE'::public.media_status
			or (m.status = 'DELETING'::public.media_status and m.claimed_at < now() - v_lease)
			or (m.status = 'UPLOADING'::public.media_status and m.created_at < now() - interval '24 hours')
		)
		and not exists (select 1 from public.events as e where e.banner_media_id = m.id)
		and not exists (select 1 from public.advertisements as a where a.media_id = m.id)
		and not exists (select 1 from public.carousel_items as c where c.media_id = m.id)
		order by m.created_at
		limit v_batch_size
		for update skip locked
	)
	update public.media_assets as ma
	set status = 'DELETING'::public.media_status,
			claimed_at = now(),
			retry_count = coalesce(ma.retry_count, 0) + 1
	from candidates as c
	where ma.id = c.id
	returning ma.id, ma.bucket, ma.object_key, ma.file_size_bytes, ma.metadata, ma.retry_count;
end;
$$;

revoke all privileges on function public.claim_media_for_deletion(integer, interval) from public, anon, authenticated;
grant execute on function public.claim_media_for_deletion(integer, interval) to authenticated, service_role;

create or replace function public.cleanup_orphaned_media_assets(
	p_older_than_interval interval default interval '24 hours'
)
returns table (cleaned_media_id uuid, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_older_than interval := greatest(coalesce(p_older_than_interval, interval '24 hours'), interval '1 hour');
begin
	if auth.uid() is null then
		if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
			raise exception 'Service role required for media cleanup.';
		end if;
	elsif public.is_super_admin() is distinct from true then
		raise exception 'Super Admin required for media cleanup.';
	end if;

	return query
	with candidates as (
		select m.id
		from public.media_assets as m
		where m.status = 'READY'::public.media_status
			and m.created_at < now() - v_older_than
			and not exists (select 1 from public.events as e where e.banner_media_id = m.id)
			and not exists (select 1 from public.advertisements as a where a.media_id = m.id)
			and not exists (select 1 from public.carousel_items as c where c.media_id = m.id)
		order by m.created_at
		limit 100
		for update skip locked
	), transitioned as (
		update public.media_assets as m
		set status = 'PENDING_DELETE'::public.media_status,
				deleted_at = now()
		from candidates as c
		where m.id = c.id
		returning m.id, m.object_key
	)
	select t.id, t.object_key from transitioned as t;
end;
$$;

revoke all privileges on function public.cleanup_orphaned_media_assets(interval) from public, anon;
grant execute on function public.cleanup_orphaned_media_assets(interval) to authenticated, service_role;
