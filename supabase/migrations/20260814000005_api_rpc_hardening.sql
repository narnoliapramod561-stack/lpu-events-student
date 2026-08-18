-- 20260814000005_api_rpc_hardening.sql
-- LPU Events API / RPC Security Hardening

-- 1. Direct PostgREST write blocks on events & event_content_sections
-- Drop permissive "for all" policies
drop policy if exists events_org_all on public.events;
drop policy if exists event_content_sections_org_all on public.event_content_sections;
drop policy if exists media_assets_org_insert on public.media_assets;

-- Recreate as "for select" only to prevent direct client table mutations
create policy events_org_select on public.events
  for select using (public.is_org_member(organization_id));

create policy event_content_sections_org_select on public.event_content_sections
  for select using (
    exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.organization_id))
  );


-- 2. Enforce limits on search_events to prevent denial of service resource exhaustion
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
declare
  v_limit integer;
begin
  -- Enforce a maximum page size limit of 50
  v_limit := least(coalesce(limit_count, 10), 50);
  
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
  limit v_limit
  offset coalesce(offset_count, 0);
end;
$$ language plpgsql;

grant execute on function public.search_events(text, integer, integer) to anon, authenticated;


-- 3. Prevent unauthorized media confirmations (IDOR upload verification hijacking)
create or replace function public.confirm_media_upload(
  p_media_id uuid
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_media_status text;
  v_created_by uuid;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- Lock media asset and retrieve status/creator
  select status, created_by 
  into v_media_status, v_created_by 
  from public.media_assets 
  where id = p_media_id 
  for update;

  if v_media_status is null then
    return public.set_api_error(404, 'MEDIA_NOT_FOUND', 'The selected media asset was not found.');
  end if;

  -- Verify media asset ownership: Creator must match caller, or caller must be Super Admin
  if v_created_by <> v_admin_id and not public.is_super_admin() then
    return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have permission to modify this media asset.');
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


-- 4. Publish Event with adversarial URL checks, pricing/team configs, and duplicate publish prevention
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

  -- 2. Concurrency: Prevent duplicate publish requests (same name, org, and start time)
  if exists (
    select 1 from public.events
    where organization_id = v_org_id 
      and lower(trim(name)) = lower(trim(p_event_payload->>'name'))
      and start_at = v_start_at
  ) then
    return public.set_api_error(409, 'DUPLICATE_EVENT', 'An event with this name, organization, and start time is already published.');
  end if;

  -- 3. Validate Category-Subcategory Taxonomy
  if not exists(
    select 1 from public.subcategories 
    where id = v_subcat_id and category_id = v_cat_id
  ) then
    return public.set_api_error(400, 'TAXONOMY_MISMATCH', 'The selected subcategory does not belong to the parent category.', jsonb_build_object('category_id', v_cat_id, 'subcategory_id', v_subcat_id));
  end if;

  -- 4. Validate Date Boundaries
  if v_end_at <= v_start_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Event end time must occur after the start time.', jsonb_build_object('start_at', v_start_at, 'end_at', v_end_at));
  end if;

  if v_reg_opens_at is not null and v_reg_closes_at is not null and v_reg_closes_at <= v_reg_opens_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Registration closes time must occur after the opens time.', jsonb_build_object('registration_opens_at', v_reg_opens_at, 'registration_closes_at', v_reg_closes_at));
  end if;

  -- 5. Validate Registration Mode State & Malicious URL injection checks
  if v_reg_mode = 'EXTERNAL' then
    if v_reg_url is null or length(trim(v_reg_url)) = 0 then
      return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
    end if;
    if v_reg_url !~* '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+' then
      return public.set_api_error(400, 'INVALID_URL_FORMAT', 'External registration URL must start with http:// or https:// and be a valid domain format.');
    end if;
  else
    if v_reg_url is not null and length(trim(v_reg_url)) > 0 then
      return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
    end if;
  end if;

  -- 6. Validate Pricing & Team capacities
  if v_pricing_type = 'FREE' and v_price_amount is not null and v_price_amount > 0 then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Free events cannot have a positive price amount.');
  end if;

  if v_pricing_type = 'PAID' then
    if v_price_amount is null or v_price_amount <= 0 then
      return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Paid events must have a positive price amount.');
    end if;
    if (p_event_payload->>'registration_format') = 'TEAM' and (p_event_payload->>'team_pricing_mode') is null then
      return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Paid team events must specify a team pricing mode.');
    end if;
  end if;

  -- 7. Validate Media Reference (if provided)
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


-- 5. Edit Event with adversarial URL checks and pricing/team configs
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

  -- Check event existence (locks the row for update to prevent concurrent race edits)
  select organization_id, jsonb_build_object('name', name, 'category_id', category_id, 'subcategory_id', subcategory_id)
  into v_event_org_id, v_before_data
  from public.events 
  where id = p_event_id
  for update;

  if v_event_org_id is null then
    return public.set_api_error(404, 'EVENT_NOT_FOUND', 'The selected event was not found.');
  end if;

  -- Force organization_id to remain unchanged (forged organization_id block)
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

  -- 4. Validate Registration Mode State & Malicious URL injection checks
  if v_reg_mode = 'EXTERNAL' then
    if v_reg_url is null or length(trim(v_reg_url)) = 0 then
      return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
    end if;
    if v_reg_url !~* '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+' then
      return public.set_api_error(400, 'INVALID_URL_FORMAT', 'External registration URL must start with http:// or https:// and be a valid domain format.');
    end if;
  else
    if v_reg_url is not null and length(trim(v_reg_url)) > 0 then
      return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
    end if;
  end if;

  -- 5. Validate Pricing & Team capacities
  if v_pricing_type = 'FREE' and v_price_amount is not null and v_price_amount > 0 then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Free events cannot have a positive price amount.');
  end if;

  if v_pricing_type = 'PAID' then
    if v_price_amount is null or v_price_amount <= 0 then
      return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Paid events must have a positive price amount.');
    end if;
    if (p_event_payload->>'registration_format') = 'TEAM' and (p_event_payload->>'team_pricing_mode') is null then
      return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Paid team events must specify a team pricing mode.');
    end if;
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
