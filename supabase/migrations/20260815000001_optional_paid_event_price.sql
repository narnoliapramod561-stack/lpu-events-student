-- Migration: Make price_amount optional for PAID events & remove overloaded function signatures
-- Allows external ticket booking URLs without requiring a fixed in-app price amount.

drop function if exists public.publish_event(json, json);
drop function if exists public.publish_event(jsonb, jsonb);
drop function if exists public.edit_event(uuid, json, json);
drop function if exists public.edit_event(uuid, jsonb, jsonb);

create or replace function public.publish_event(
  p_event_payload jsonb,
  p_content_sections jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
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
  v_item jsonb;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- Extract payload fields
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

  -- 1a. Concurrency: Prevent duplicate publish requests (same name, org, and start time)
  if exists (
    select 1 from public.events
    where organization_id = v_org_id 
      and lower(trim(name)) = lower(trim(p_event_payload->>'name'))
      and start_at = v_start_at
  ) then
    return public.set_api_error(409, 'DUPLICATE_EVENT', 'An event with this name, organization, and start time is already published.');
  end if;

  -- 2. Validate Category-Subcategory Taxonomy
  if v_subcat_id is not null then
    if not exists(
      select 1 from public.subcategories 
      where id = v_subcat_id and category_id = v_cat_id
    ) then
      return public.set_api_error(400, 'TAXONOMY_MISMATCH', 'The selected subcategory does not belong to the parent category.', jsonb_build_object('category_id', v_cat_id, 'subcategory_id', v_subcat_id));
    end if;
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

  -- 4a. Validate URL Scheme — reject javascript:, data:, vbscript:, file: etc.
  if v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    if v_reg_url !~* '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+' then
      return public.set_api_error(400, 'INVALID_URL_FORMAT', 'External registration URL must start with http:// or https:// and be a valid domain format.');
    end if;
  end if;

  -- 5. Validate Pricing (Price is optional for PAID events, defaults to 0 if not specified)
  if v_pricing_type = 'FREE' and v_price_amount is not null and v_price_amount > 0 then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Free events cannot have a positive price amount.');
  end if;

  if v_pricing_type = 'PAID' and v_price_amount is not null and v_price_amount < 0 then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Price amount cannot be negative.');
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
    case when (v_pricing_type = 'PAID' and (p_event_payload->>'registration_format') = 'TEAM') 
         then (p_event_payload->>'team_pricing_mode') 
         else null 
    end,
    coalesce(v_price_amount, 0),
    'PUBLISHED',
    v_admin_id,
    v_admin_id
  );

  -- Insert Content Sections
  if p_content_sections is not null and jsonb_typeof(p_content_sections) = 'array' then
    for v_item in select * from jsonb_array_elements(p_content_sections) loop
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
        coalesce(v_item->'content', to_jsonb(v_item->>'content'), '""'::jsonb),
        (v_item->>'sort_order')::integer
      );
    end loop;
  end if;

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
$$;


create or replace function public.edit_event(
  p_event_id uuid,
  p_event_payload jsonb,
  p_content_sections jsonb default null
)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_existing record;
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
  v_item jsonb;
begin
  -- Resolve authenticated user
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  -- Load existing event
  select * into v_existing from public.events where id = p_event_id;
  if v_existing.id is null then
    return public.set_api_error(404, 'EVENT_NOT_FOUND', 'The specified event could not be found.');
  end if;

  if v_existing.status = 'COMPLETED' then
    return public.set_api_error(400, 'EVENT_COMPLETED', 'Completed events cannot be modified.');
  end if;

  -- 1. Validate Organizer Authorization
  if not public.is_super_admin() then
    if not exists(
      select 1 from public.organization_members 
      where organization_id = v_existing.organization_id and admin_user_id = v_admin_id and role = 'ORGANIZER'
    ) then
      return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have active administrative permissions for this organization.');
    end if;
  end if;

  -- Extract payload fields
  v_org_id := coalesce((p_event_payload->>'organization_id')::uuid, v_existing.organization_id);
  v_cat_id := coalesce((p_event_payload->>'category_id')::uuid, v_existing.category_id);
  v_subcat_id := case when p_event_payload ? 'subcategory_id' then (p_event_payload->>'subcategory_id')::uuid else v_existing.subcategory_id end;
  v_start_at := coalesce((p_event_payload->>'start_at')::timestamptz, v_existing.start_at);
  v_end_at := coalesce((p_event_payload->>'end_at')::timestamptz, v_existing.end_at);
  v_reg_opens_at := case when p_event_payload ? 'registration_opens_at' then (p_event_payload->>'registration_opens_at')::timestamptz else v_existing.registration_opens_at end;
  v_reg_closes_at := case when p_event_payload ? 'registration_closes_at' then (p_event_payload->>'registration_closes_at')::timestamptz else v_existing.registration_closes_at end;
  v_reg_mode := coalesce(p_event_payload->>'registration_mode', v_existing.registration_mode::text);
  v_reg_url := case when p_event_payload ? 'external_registration_url' then p_event_payload->>'external_registration_url' else v_existing.external_registration_url end;
  v_pricing_type := coalesce(p_event_payload->>'pricing_type', v_existing.pricing_type::text);
  v_price_amount := case when p_event_payload ? 'price_amount' then (p_event_payload->>'price_amount')::numeric else v_existing.price_amount end;
  v_banner_media_id := case when p_event_payload ? 'banner_media_id' then (p_event_payload->>'banner_media_id')::uuid else v_existing.banner_media_id end;

  -- 2. Validate Category-Subcategory Taxonomy
  if v_subcat_id is not null then
    if not exists(
      select 1 from public.subcategories 
      where id = v_subcat_id and category_id = v_cat_id
    ) then
      return public.set_api_error(400, 'TAXONOMY_MISMATCH', 'The selected subcategory does not belong to the parent category.');
    end if;
  end if;

  -- 3. Validate Date Boundaries
  if v_end_at <= v_start_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Event end time must occur after the start time.');
  end if;

  if v_reg_opens_at is not null and v_reg_closes_at is not null and v_reg_closes_at <= v_reg_opens_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Registration closes time must occur after the opens time.');
  end if;

  -- 4. Validate Registration Mode State
  if v_reg_mode = 'EXTERNAL' and (v_reg_url is null or length(trim(v_reg_url)) = 0) then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
  end if;

  if v_reg_mode <> 'EXTERNAL' and v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
  end if;

  -- 4a. Validate URL Scheme — reject javascript:, data:, vbscript:, file: etc.
  if v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    if v_reg_url !~* '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+' then
      return public.set_api_error(400, 'INVALID_URL_FORMAT', 'External registration URL must start with http:// or https:// and be a valid domain format.');
    end if;
  end if;

  -- 5. Validate Pricing (Optional price for PAID events)
  if v_pricing_type = 'FREE' and v_price_amount is not null and v_price_amount > 0 then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Free events cannot have a positive price amount.');
  end if;

  if v_pricing_type = 'PAID' and v_price_amount is not null and v_price_amount < 0 then
    return public.set_api_error(400, 'PRICING_INVARIANT_VIOLATION', 'Price amount cannot be negative.');
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

  -- Update Event record
  update public.events set
    organization_id = v_org_id,
    name = coalesce(p_event_payload->>'name', name),
    description = coalesce(p_event_payload->>'description', description),
    category_id = v_cat_id,
    subcategory_id = v_subcat_id,
    banner_media_id = v_banner_media_id,
    start_at = v_start_at,
    end_at = v_end_at,
    venue_name = coalesce(p_event_payload->>'venue_name', venue_name),
    registration_mode = (v_reg_mode)::public.registration_mode,
    external_registration_url = v_reg_url,
    registration_opens_at = v_reg_opens_at,
    registration_closes_at = v_reg_closes_at,
    pricing_type = (v_pricing_type)::public.event_pricing_type,
    registration_format = coalesce(p_event_payload->>'registration_format', registration_format),
    capacity_limit = case when p_event_payload ? 'capacity_limit' then (p_event_payload->>'capacity_limit')::integer else capacity_limit end,
    capacity_counts_by = coalesce(p_event_payload->>'capacity_counts_by', capacity_counts_by),
    team_pricing_mode = case 
      when (v_pricing_type = 'PAID' and coalesce(p_event_payload->>'registration_format', v_existing.registration_format) = 'TEAM')
      then coalesce(p_event_payload->>'team_pricing_mode', v_existing.team_pricing_mode)
      else null
    end,
    price_amount = coalesce(v_price_amount, 0),
    updated_by = v_admin_id,
    updated_at = now()
  where id = p_event_id;

  -- Replace Content Sections if provided
  if p_content_sections is not null and jsonb_typeof(p_content_sections) = 'array' then
    delete from public.event_content_sections where event_id = p_event_id;
    for v_item in select * from jsonb_array_elements(p_content_sections) loop
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
        coalesce(v_item->'content', to_jsonb(v_item->>'content'), '""'::jsonb),
        (v_item->>'sort_order')::integer
      );
    end loop;
  end if;

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
    'EVENT_UPDATE',
    'event',
    p_event_id,
    'Event updated directly',
    jsonb_build_object('name', v_existing.name),
    jsonb_build_object('name', coalesce(p_event_payload->>'name', v_existing.name))
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
    jsonb_build_object('tags', jsonb_build_array('events', 'event:' || p_event_id::text))
  );

  return json_build_object('status', 'success', 'event_id', p_event_id);
end;
$$;

grant execute on function public.publish_event(jsonb, jsonb) to authenticated;
grant execute on function public.edit_event(uuid, jsonb, jsonb) to authenticated;
