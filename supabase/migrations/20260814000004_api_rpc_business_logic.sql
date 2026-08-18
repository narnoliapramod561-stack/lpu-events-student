-- 20260814000004_api_rpc_business_logic.sql
-- LPU Events API and RPC Business Logic Foundation

-- 1. Helper to format PostgREST API errors with custom HTTP status codes
create or replace function public.set_api_error(
  p_status integer,
  p_code text,
  p_message text,
  p_details jsonb default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
begin
  perform set_config('response.status', p_status::text, true);
  return json_build_object(
    'code', p_code,
    'message', p_message,
    'details', p_details
  );
end;
$$ language plpgsql;

grant execute on function public.set_api_error(integer, text, text, jsonb) to anon, authenticated;


-- 2. Search RPC matching title casing and prefix-first ranking
create or replace function public.search_events(
  query_text text,
  limit_count integer,
  offset_count integer
)
returns table (
  id uuid,
  name text,
  start_at timestamptz,
  end_at timestamptz,
  venue_name text,
  pricing_type public.event_pricing_type,
  rank integer
) security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select 
    e.id,
    e.name,
    e.start_at,
    e.end_at,
    e.venue_name,
    e.pricing_type,
    case 
      when lower(e.name) = lower(trim(query_text)) then 1
      when lower(e.name) ilike lower(trim(query_text)) || '%' then 2
      when lower(e.name) ilike '%' || lower(trim(query_text)) || '%' then 3
      else 4
    end as rank
  from public.events e
  where e.status = 'PUBLISHED'
    and (lower(e.name) ilike '%' || lower(trim(query_text)) || '%')
  order by rank asc, e.start_at asc
  limit limit_count
  offset offset_count;
end;
$$ language plpgsql;

grant execute on function public.search_events(text, integer, integer) to anon, authenticated;


-- 3. Access Request Review RPC conforming to review_access_request API contract
create or replace function public.review_access_request(
  request_id uuid,
  action_status text,
  reason text
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_sa_id uuid;
begin
  -- Check Super Admin authorization
  if auth.uid() is null or not public.is_super_admin() then
    return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have active administrative permissions for this organization.');
  end if;

  -- Validate action_status parameter
  if action_status not in ('APPROVED', 'REJECTED') then
    return public.set_api_error(400, 'INVALID_ACTION_STATUS', 'Action status must be APPROVED or REJECTED.');
  end if;

  if action_status = 'APPROVED' then
    perform public.approve_organizer_access_request(request_id);
    
    update public.organizer_access_requests
    set review_reason = reason
    where id = request_id;

    return json_build_object(
      'status', 'success',
      'message', 'Access request approved, organization and membership created.'
    );
  else
    perform public.reject_organizer_access_request(request_id, reason);

    return json_build_object(
      'status', 'success',
      'message', 'Access request rejected.'
    );
  end if;
end;
$$ language plpgsql;

grant execute on function public.review_access_request(uuid, text, text) to authenticated;


-- 4. Publish Event RPC implementing validation invariants, audit logging, and outbox insertion
create or replace function public.publish_event(
  p_event_payload json,
  p_content_sections json default '[]'::json
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_org_id uuid;
  v_cat_id uuid;
  v_subcat_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_reg_opens_at timestamptz;
  v_reg_closes_at timestamptz;
  v_reg_mode text;
  v_reg_url text;
  v_pricing_type text;
  v_price_amount numeric;
  v_banner_media_id uuid;
  
  v_event_id uuid;
  v_item json;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- Parse values from event_payload
  v_org_id := (p_event_payload->>'organization_id')::uuid;
  v_cat_id := (p_event_payload->>'category_id')::uuid;
  v_subcat_id := (p_event_payload->>'subcategory_id')::uuid;
  v_start_at := (p_event_payload->>'start_at')::timestamptz;
  v_end_at := (p_event_payload->>'end_at')::timestamptz;
  v_reg_opens_at := (p_event_payload->>'registration_opens_at')::timestamptz;
  v_reg_closes_at := (p_event_payload->>'registration_closes_at')::timestamptz;
  v_reg_mode := p_event_payload->>'registration_mode';
  v_reg_url := p_event_payload->>'external_registration_url';
  v_pricing_type := p_event_payload->>'pricing_type';
  v_price_amount := (p_event_payload->>'price_amount')::numeric;
  v_banner_media_id := (p_event_payload->>'banner_media_id')::uuid;

  -- 1. Validate Organizer Authorization
  if not public.is_super_admin() then
    if not exists(
      select 1 from public.organization_members 
      where organization_id = v_org_id and admin_user_id = v_admin_id and role = 'ORGANIZER'
    ) then
      return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have active administrative permissions for this organization.', jsonb_build_object('organization_id', v_org_id));
    end if;
  end if;

  -- 2. Validate Category-Subcategory Taxonomy
  if not exists(
    select 1 from public.subcategories 
    where id = v_subcat_id and category_id = v_cat_id
  ) then
    return public.set_api_error(400, 'TAXONOMY_MISMATCH', 'The selected subcategory does not belong to the parent category.', jsonb_build_object('category_id', v_cat_id, 'subcategory_id', v_subcat_id));
  end if;

  -- 3. Validate Date Boundaries
  if v_end_at <= v_start_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Event end time must occur after the start time.', jsonb_build_object('start_at', v_start_at, 'end_at', v_end_at));
  end if;

  if v_reg_opens_at is not null and v_reg_closes_at is not null and v_reg_closes_at <= v_reg_opens_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Registration closes time must occur after the opens time.', jsonb_build_object('registration_opens_at', v_reg_opens_at, 'registration_closes_at', v_reg_closes_at));
  end if;

  -- 4. Validate Registration Mode State
  if v_reg_mode = 'EXTERNAL' and (v_reg_url is null or length(trim(v_reg_url)) = 0) then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
  end if;

  if v_reg_mode <> 'EXTERNAL' and v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
  end if;

  -- 5. Validate Pricing
  if v_pricing_type = 'FREE' and v_price_amount is not null and v_price_amount > 0 then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Free events cannot have a positive price amount.');
  end if;

  if v_pricing_type = 'PAID' and (v_price_amount is null or v_price_amount <= 0) then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Paid events must have a positive price amount.');
  end if;

  -- 6. Validate Media Reference (if provided)
  if v_banner_media_id is not null then
    if not exists(
      select 1 from public.media_assets 
      where id = v_banner_media_id and status = 'READY'
    ) then
      return public.set_api_error(400, 'MEDIA_NOT_READY', 'The selected banner media asset is not ready or does not exist.');
    end if;
  end if;

  -- Generate random event ID
  v_event_id := gen_random_uuid();

  -- Insert Event record
  insert into public.events (
    id,
    organization_id,
    name,
    description,
    category_id,
    subcategory_id,
    banner_media_id,
    start_at,
    end_at,
    venue_name,
    registration_mode,
    external_registration_url,
    registration_opens_at,
    registration_closes_at,
    pricing_type,
    registration_format,
    capacity_limit,
    capacity_counts_by,
    team_pricing_mode,
    price_amount,
    status,
    created_by,
    updated_by
  ) values (
    v_event_id,
    v_org_id,
    p_event_payload->>'name',
    p_event_payload->>'description',
    v_cat_id,
    v_subcat_id,
    v_banner_media_id,
    v_start_at,
    v_end_at,
    p_event_payload->>'venue_name',
    (p_event_payload->>'registration_mode')::public.registration_mode,
    v_reg_url,
    v_reg_opens_at,
    v_reg_closes_at,
    (v_pricing_type)::public.event_pricing_type,
    (p_event_payload->>'registration_format'),
    (p_event_payload->>'capacity_limit')::integer,
    (p_event_payload->>'capacity_counts_by'),
    (p_event_payload->>'team_pricing_mode'),
    coalesce(v_price_amount, 0),
    'PUBLISHED',
    v_admin_id,
    v_admin_id
  );

  -- Insert Content Sections
  for v_item in select * from json_array_elements(p_content_sections) loop
    insert into public.event_content_sections (
      event_id,
      section_type,
      title,
      content,
      sort_order
    ) values (
      v_event_id,
      v_item->>'section_type',
      v_item->>'title',
      (v_item->>'content')::jsonb,
      (v_item->>'sort_order')::integer
    );
  end loop;

  -- Insert transactional audit log
  insert into public.audit_logs (
    actor_admin_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_data,
    after_data
  ) values (
    v_admin_id,
    coalesce((select role::text from public.platform_admin_roles where admin_user_id = v_admin_id), 'ORGANIZER'),
    'EVENT_CREATE',
    'event',
    v_event_id,
    'Event published directly',
    null,
    jsonb_build_object('name', p_event_payload->>'name')
  );

  -- Insert outbox cache-invalidation event
  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    'CACHE_INVALIDATION',
    'events',
    v_event_id,
    jsonb_build_object('tags', jsonb_build_array('events', 'event:' || v_event_id::text, 'category:' || v_cat_id::text, 'subcategory:' || v_subcat_id::text))
  );

  return json_build_object(
    'status', 'success',
    'event_id', v_event_id
  );
end;
$$ language plpgsql;

grant execute on function public.publish_event(json, json) to authenticated;


-- 5. Edit Event RPC validating organization ownership boundaries, invariants and updating content sections
create or replace function public.edit_event(
  p_event_id uuid,
  p_event_payload json,
  p_content_sections json default '[]'::json
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_org_id uuid;
  v_cat_id uuid;
  v_subcat_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_reg_opens_at timestamptz;
  v_reg_closes_at timestamptz;
  v_reg_mode text;
  v_reg_url text;
  v_pricing_type text;
  v_price_amount numeric;
  v_banner_media_id uuid;
  
  v_event_org_id uuid;
  v_before_data jsonb;
  v_item json;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- Check event existence
  select organization_id, jsonb_build_object('name', name, 'category_id', category_id, 'subcategory_id', subcategory_id)
  into v_event_org_id, v_before_data
  from public.events 
  where id = p_event_id
  for update;

  if v_event_org_id is null then
    return public.set_api_error(404, 'EVENT_NOT_FOUND', 'The selected event was not found.');
  end if;

  -- Force organization_id to remain unchanged
  v_org_id := v_event_org_id;
  v_cat_id := (p_event_payload->>'category_id')::uuid;
  v_subcat_id := (p_event_payload->>'subcategory_id')::uuid;
  v_start_at := (p_event_payload->>'start_at')::timestamptz;
  v_end_at := (p_event_payload->>'end_at')::timestamptz;
  v_reg_opens_at := (p_event_payload->>'registration_opens_at')::timestamptz;
  v_reg_closes_at := (p_event_payload->>'registration_closes_at')::timestamptz;
  v_reg_mode := p_event_payload->>'registration_mode';
  v_reg_url := p_event_payload->>'external_registration_url';
  v_pricing_type := p_event_payload->>'pricing_type';
  v_price_amount := (p_event_payload->>'price_amount')::numeric;
  v_banner_media_id := (p_event_payload->>'banner_media_id')::uuid;

  -- 1. Validate Organizer Authorization
  if not public.is_super_admin() then
    if not exists(
      select 1 from public.organization_members 
      where organization_id = v_org_id and admin_user_id = v_admin_id and role = 'ORGANIZER'
    ) then
      return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have active administrative permissions for this organization.', jsonb_build_object('organization_id', v_org_id));
    end if;
  end if;

  -- 2. Validate Category-Subcategory Taxonomy
  if not exists(
    select 1 from public.subcategories 
    where id = v_subcat_id and category_id = v_cat_id
  ) then
    return public.set_api_error(400, 'TAXONOMY_MISMATCH', 'The selected subcategory does not belong to the parent category.', jsonb_build_object('category_id', v_cat_id, 'subcategory_id', v_subcat_id));
  end if;

  -- 3. Validate Date Boundaries
  if v_end_at <= v_start_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Event end time must occur after the start time.', jsonb_build_object('start_at', v_start_at, 'end_at', v_end_at));
  end if;

  if v_reg_opens_at is not null and v_reg_closes_at is not null and v_reg_closes_at <= v_reg_opens_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Registration closes time must occur after the opens time.', jsonb_build_object('registration_opens_at', v_reg_opens_at, 'registration_closes_at', v_reg_closes_at));
  end if;

  -- 4. Validate Registration Mode State
  if v_reg_mode = 'EXTERNAL' and (v_reg_url is null or length(trim(v_reg_url)) = 0) then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
  end if;

  if v_reg_mode <> 'EXTERNAL' and v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
  end if;

  -- 5. Validate Pricing
  if v_pricing_type = 'FREE' and v_price_amount is not null and v_price_amount > 0 then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Free events cannot have a positive price amount.');
  end if;

  if v_pricing_type = 'PAID' and (v_price_amount is null or v_price_amount <= 0) then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Paid events must have a positive price amount.');
  end if;

  -- 6. Validate Media Reference (if provided)
  if v_banner_media_id is not null then
    if not exists(
      select 1 from public.media_assets 
      where id = v_banner_media_id and status = 'READY'
    ) then
      return public.set_api_error(400, 'MEDIA_NOT_READY', 'The selected banner media asset is not ready or does not exist.');
    end if;
  end if;

  -- Update event record
  update public.events set
    name = p_event_payload->>'name',
    description = p_event_payload->>'description',
    category_id = v_cat_id,
    subcategory_id = v_subcat_id,
    banner_media_id = v_banner_media_id,
    start_at = v_start_at,
    end_at = v_end_at,
    venue_name = p_event_payload->>'venue_name',
    registration_mode = (p_event_payload->>'registration_mode')::public.registration_mode,
    external_registration_url = v_reg_url,
    registration_opens_at = v_reg_opens_at,
    registration_closes_at = v_reg_closes_at,
    pricing_type = (v_pricing_type)::public.event_pricing_type,
    registration_format = (p_event_payload->>'registration_format'),
    capacity_limit = (p_event_payload->>'capacity_limit')::integer,
    capacity_counts_by = (p_event_payload->>'capacity_counts_by'),
    team_pricing_mode = (p_event_payload->>'team_pricing_mode'),
    price_amount = coalesce(v_price_amount, 0),
    updated_by = v_admin_id,
    updated_at = now()
  where id = p_event_id;

  -- Recreate content sections
  delete from public.event_content_sections where event_id = p_event_id;

  for v_item in select * from json_array_elements(p_content_sections) loop
    insert into public.event_content_sections (
      event_id,
      section_type,
      title,
      content,
      sort_order
    ) values (
      p_event_id,
      v_item->>'section_type',
      v_item->>'title',
      (v_item->>'content')::jsonb,
      (v_item->>'sort_order')::integer
    );
  end loop;

  -- Insert audit log entry
  insert into public.audit_logs (
    actor_admin_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_data,
    after_data
  ) values (
    v_admin_id,
    coalesce((select role::text from public.platform_admin_roles where admin_user_id = v_admin_id), 'ORGANIZER'),
    'EVENT_UPDATE',
    'event',
    p_event_id,
    'Event updated by Organizer',
    v_before_data,
    jsonb_build_object('name', p_event_payload->>'name')
  );

  -- Insert outbox cache-invalidation event
  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    'CACHE_INVALIDATION',
    'events',
    p_event_id,
    jsonb_build_object('tags', jsonb_build_array('events', 'event:' || p_event_id::text, 'category:' || v_cat_id::text, 'subcategory:' || v_subcat_id::text))
  );

  return json_build_object(
    'status', 'success',
    'event_id', p_event_id
  );
end;
$$ language plpgsql;

grant execute on function public.edit_event(uuid, json, json) to authenticated;


-- 6. Cancel Event RPC implementing hard deletion, audit trailing, and outbox validation
create or replace function public.cancel_event(
  p_event_id uuid,
  p_reason text
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_org_id uuid;
  v_before_data jsonb;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- Lock event and fetch original details
  select organization_id, jsonb_build_object('name', name, 'category_id', category_id, 'subcategory_id', subcategory_id)
  into v_org_id, v_before_data
  from public.events 
  where id = p_event_id
  for update;

  if v_org_id is null then
    return public.set_api_error(404, 'EVENT_NOT_FOUND', 'The selected event was not found.');
  end if;

  -- 1. Validate Organizer Authorization
  if not public.is_super_admin() then
    if not exists(
      select 1 from public.organization_members 
      where organization_id = v_org_id and admin_user_id = v_admin_id and role = 'ORGANIZER'
    ) then
      return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have active administrative permissions for this organization.', jsonb_build_object('organization_id', v_org_id));
    end if;
  end if;

  -- Hard delete event and its content sections (cancelling events removes them from view)
  delete from public.event_content_sections where event_id = p_event_id;
  delete from public.events where id = p_event_id;

  -- Audit log insert
  insert into public.audit_logs (
    actor_admin_id,
    actor_role,
    action,
    target_type,
    target_id,
    reason,
    before_data,
    after_data
  ) values (
    v_admin_id,
    coalesce((select role::text from public.platform_admin_roles where admin_user_id = v_admin_id), 'ORGANIZER'),
    'EVENT_CANCEL',
    'event',
    p_event_id,
    p_reason,
    v_before_data,
    null
  );

  -- Outbox cache invalidation insert
  insert into public.outbox_events (
    event_type,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    'CACHE_INVALIDATION',
    'events',
    p_event_id,
    jsonb_build_object('tags', jsonb_build_array('events', 'event:' || p_event_id::text, 'category:' || (v_before_data->>'category_id')::text, 'subcategory:' || (v_before_data->>'subcategory_id')::text))
  );

  return json_build_object(
    'status', 'success',
    'message', 'Event deleted and cancellation audit finalized.'
  );
end;
$$ language plpgsql;

grant execute on function public.cancel_event(uuid, text) to authenticated;


-- 7. Generate secure mock Cloudflare R2 upload credentials
create or replace function public.request_media_upload(
  p_media_type text,
  p_mime_type text,
  p_file_size_bytes integer,
  p_width integer default null,
  p_height integer default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_media_id uuid;
  v_bucket text;
  v_object_key text;
  v_upload_url text;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- 1. Validate file size (max 10MB)
  if p_file_size_bytes > 10485760 then
    return public.set_api_error(400, 'FILE_TOO_LARGE', 'The file size exceeds the maximum allowed limit of 10MB.');
  end if;

  -- 2. Validate media type
  if p_media_type not in ('EVENT_BANNER', 'SPONSOR_LOGO', 'CAROUSEL_IMAGE', 'MEMORY_IMAGE') then
    return public.set_api_error(400, 'INVALID_MEDIA_TYPE', 'Media type must be EVENT_BANNER, SPONSOR_LOGO, CAROUSEL_IMAGE, or MEMORY_IMAGE.');
  end if;

  -- Map bucket name based on type
  case p_media_type
    when 'EVENT_BANNER' then v_bucket := 'banners';
    when 'SPONSOR_LOGO' then v_bucket := 'sponsors';
    when 'CAROUSEL_IMAGE' then v_bucket := 'carousel';
    when 'MEMORY_IMAGE' then v_bucket := 'memories';
  end case;

  -- Generate media credentials keys
  v_media_id := gen_random_uuid();
  v_object_key := 'uploads/' || v_media_id::text || '.' || split_part(p_mime_type, '/', 2);

  -- Insert media asset ticket
  insert into public.media_assets (
    id,
    bucket,
    object_key,
    media_type,
    mime_type,
    file_size_bytes,
    status,
    created_by
  ) values (
    v_media_id,
    v_bucket,
    v_object_key,
    p_media_type::public.media_type,
    p_mime_type,
    p_file_size_bytes,
    'UPLOADING',
    v_admin_id
  );

  v_upload_url := 'https://media.lpu-events.in/upload/' || v_bucket || '/' || v_object_key || '?signature=mock_sig_' || encode(sha256(v_media_id::text::bytea), 'hex');

  return json_build_object(
    'media_id', v_media_id,
    'upload_url', v_upload_url,
    'method', 'PUT',
    'headers', jsonb_build_object('Content-Type', p_mime_type)
  );
end;
$$ language plpgsql;

grant execute on function public.request_media_upload(text, text, integer, integer, integer) to authenticated;


-- 8. Confirm Successful Upload RPC setting media status to READY
create or replace function public.confirm_media_upload(
  p_media_id uuid
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_media_status text;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- Lock media asset
  select status into v_media_status from public.media_assets where id = p_media_id for update;

  if v_media_status is null then
    return public.set_api_error(404, 'MEDIA_NOT_FOUND', 'The selected media asset was not found.');
  end if;

  -- Update status to READY (simulate Cloudflare R2 verification success)
  update public.media_assets
  set status = 'READY',
      verified_at = now()
  where id = p_media_id;

  return json_build_object(
    'status', 'success',
    'media_id', p_media_id,
    'media_status', 'READY'
  );
end;
$$ language plpgsql;

grant execute on function public.confirm_media_upload(uuid) to authenticated;
