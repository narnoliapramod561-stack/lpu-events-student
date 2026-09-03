-- Migration: 20260902000002_database_simplification_and_growth_prevention.sql
-- Description: Reproducible simplification of LPU Events database schema:
-- 1. Redefines RPCs (publish_event, edit_event, cancel_event, manage_category, etc.) to remove outbox writes and dropped columns.
-- 2. Drops obsolete outbox functions and public.outbox_events table.
-- 3. Drops dead tables (backup_records, archive_records, background_jobs, advertisement_feed_config, advertisement_metrics_daily, sponsors).
-- 4. Removes Event Memories (event_memories, event_memory_media, carousel_items.memory_id, manage_memory).
-- 5. Simplifies events table by dropping 5 unneeded columns (completed_at, team_pricing_mode, capacity_counts_by, registration_opens_at, registration_closes_at) and their constraints.
-- 6. Drops confirmed redundant indexes.
-- 7. Adds rolling 30-day audit log cleanup routine and hardened media orphan cleanup.

-- ==============================================================================
-- PHASE 1: REDEFINE APPLICATION RPCS TO DECOUPLE OUTBOX & DROPPED COLUMNS
-- ==============================================================================

-- 1.1 Redefine publish_event without outbox events and without dropped columns
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

  -- 5. Validate Pricing
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

  -- Insert Event record (simplified columns)
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
    pricing_type,
    registration_format,
    capacity_limit,
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
    (v_pricing_type)::public.event_pricing_type,
    coalesce(p_event_payload->>'registration_format', 'INDIVIDUAL'),
    (p_event_payload->>'capacity_limit')::integer,
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

  return json_build_object(
    'status', 'success',
    'event_id', v_event_id
  );
end;
$$;

-- 1.2 Redefine edit_event without outbox events and without dropped columns
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

  -- 4. Validate Registration Mode State
  if v_reg_mode = 'EXTERNAL' and (v_reg_url is null or length(trim(v_reg_url)) = 0) then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
  end if;

  if v_reg_mode <> 'EXTERNAL' and v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided if and only if mode is set to EXTERNAL.');
  end if;

  -- 4a. Validate URL Scheme
  if v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    if v_reg_url !~* '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+' then
      return public.set_api_error(400, 'INVALID_URL_FORMAT', 'External registration URL must start with http:// or https:// and be a valid domain format.');
    end if;
  end if;

  -- 5. Validate Pricing
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

  -- Update Event record (simplified columns)
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
    pricing_type = (v_pricing_type)::public.event_pricing_type,
    registration_format = coalesce(p_event_payload->>'registration_format', registration_format),
    capacity_limit = case when p_event_payload ? 'capacity_limit' then (p_event_payload->>'capacity_limit')::integer else capacity_limit end,
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

  return json_build_object('status', 'success', 'event_id', p_event_id);
end;
$$;

-- 1.3 Redefine cancel_event without outbox events
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
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;

  select id into v_admin_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  if v_admin_id is null then
    return public.set_api_error(403, 'UNAUTHORIZED', 'No active administrative profile found.');
  end if;

  select organization_id, jsonb_build_object('name', name, 'category_id', category_id, 'subcategory_id', subcategory_id)
  into v_org_id, v_before_data
  from public.events 
  where id = p_event_id
  for update;

  if v_org_id is null then
    return public.set_api_error(404, 'EVENT_NOT_FOUND', 'The selected event was not found.');
  end if;

  if not public.is_super_admin() then
    if not exists(
      select 1 from public.organization_members 
      where organization_id = v_org_id and admin_user_id = v_admin_id and role = 'ORGANIZER'
    ) then
      return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have active administrative permissions for this organization.', jsonb_build_object('organization_id', v_org_id));
    end if;
  end if;

  delete from public.event_content_sections where event_id = p_event_id;
  delete from public.events where id = p_event_id;

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

  return json_build_object(
    'status', 'success',
    'message', 'Event deleted and cancellation audit finalized.'
  );
end;
$$ language plpgsql;

-- 1.4 Redefine manage_category without outbox events
create or replace function public.manage_category(
  p_action text,
  p_id uuid default null,
  p_key text default null,
  p_name text default null,
  p_sort_order integer default 0,
  p_is_active boolean default true
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_cat_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;
  if not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  if p_action = 'create' then
    if p_key is null or length(trim(p_key)) = 0 then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Category key is required.');
    end if;
    if p_name is null or length(trim(p_name)) = 0 then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Category name is required.');
    end if;

    v_cat_id := gen_random_uuid();
    insert into public.categories (id, key, name, sort_order, is_active)
    values (v_cat_id, lower(trim(p_key)), trim(p_name), p_sort_order, true);

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'CATEGORY_CREATE', 'category', v_cat_id, jsonb_build_object('key', p_key, 'name', p_name));

    return json_build_object('status', 'success', 'id', v_cat_id);

  elsif p_action = 'toggle_active' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Category ID is required.');
    end if;

    select jsonb_build_object('is_active', is_active, 'key', key) into v_before from public.categories where id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Category not found.');
    end if;

    update public.categories set is_active = not is_active, updated_at = now() where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'CATEGORY_TOGGLE', 'category', p_id, v_before);

    return json_build_object('status', 'success');

  elsif p_action = 'update' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Category ID is required.');
    end if;

    select jsonb_build_object('name', name, 'sort_order', sort_order) into v_before from public.categories where id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Category not found.');
    end if;

    update public.categories
    set name = coalesce(nullif(trim(p_name), ''), name),
        sort_order = coalesce(p_sort_order, sort_order),
        updated_at = now()
    where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'CATEGORY_UPDATE', 'category', p_id, v_before, jsonb_build_object('name', p_name, 'sort_order', p_sort_order));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: create, toggle_active, update.');
  end if;
end;
$$ language plpgsql;

-- 1.5 Redefine manage_subcategory without outbox events
create or replace function public.manage_subcategory(
  p_action text,
  p_id uuid default null,
  p_category_id uuid default null,
  p_key text default null,
  p_name text default null,
  p_sort_order integer default 0
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_subcat_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;
  if not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  if p_action = 'create' then
    if p_category_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Parent category_id is required.');
    end if;
    if p_key is null or length(trim(p_key)) = 0 then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Subcategory key is required.');
    end if;
    if p_name is null or length(trim(p_name)) = 0 then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Subcategory name is required.');
    end if;

    if not exists (select 1 from public.categories where id = p_category_id) then
      return public.set_api_error(404, 'NOT_FOUND', 'Parent category does not exist.');
    end if;

    v_subcat_id := gen_random_uuid();
    insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
    values (v_subcat_id, p_category_id, lower(trim(p_key)), trim(p_name), p_sort_order, true);

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'SUBCATEGORY_CREATE', 'subcategory', v_subcat_id, jsonb_build_object('key', p_key, 'name', p_name, 'category_id', p_category_id));

    return json_build_object('status', 'success', 'id', v_subcat_id);

  elsif p_action = 'toggle_active' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Subcategory ID is required.');
    end if;

    select jsonb_build_object('is_active', is_active, 'key', key) into v_before from public.subcategories where id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Subcategory not found.');
    end if;

    update public.subcategories set is_active = not is_active, updated_at = now() where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'SUBCATEGORY_TOGGLE', 'subcategory', p_id, v_before);

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: create, toggle_active.');
  end if;
end;
$$ language plpgsql;

-- 1.6 Redefine manage_advertisement without outbox events
create or replace function public.manage_advertisement(
  p_action text,
  p_id uuid default null,
  p_name text default null,
  p_media_id uuid default null,
  p_redirect_url text default null,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_status text default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_ad_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;
  if not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  if p_action = 'create' then
    if p_name is null or length(trim(p_name)) = 0 then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Advertisement name is required.');
    end if;
    if p_media_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Advertisement media_id is required.');
    end if;

    v_ad_id := gen_random_uuid();
    insert into public.advertisements (
      id, name, media_id, redirect_url, start_at, end_at, status, created_by, updated_by
    ) values (
      v_ad_id, trim(p_name), p_media_id, trim(p_redirect_url),
      coalesce(p_start_at, now()), coalesce(p_end_at, now() + interval '30 days'),
      coalesce(p_status::public.advertisement_status, 'ACTIVE'::public.advertisement_status),
      v_admin_id, v_admin_id
    );

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'AD_CREATE', 'advertisement', v_ad_id, jsonb_build_object('name', p_name, 'media_id', p_media_id));

    return json_build_object('status', 'success', 'id', v_ad_id);

  elsif p_action = 'update_status' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Advertisement ID is required.');
    end if;

    select jsonb_build_object('status', a.status::text, 'name', a.name) into v_before from public.advertisements a where a.id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Advertisement not found.');
    end if;

    update public.advertisements
    set status = p_status::public.advertisement_status,
        updated_by = v_admin_id,
        updated_at = now()
    where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'AD_STATUS_UPDATE', 'advertisement', p_id, v_before, jsonb_build_object('status', p_status));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: create, update_status.');
  end if;
end;
$$ language plpgsql;

-- 1.7 Redefine manage_carousel_item without outbox events
create or replace function public.manage_carousel_item(
  p_action text,
  p_id uuid default null,
  p_is_active boolean default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;
  if not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  if p_action = 'toggle_active' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Carousel item ID is required.');
    end if;

    select jsonb_build_object('is_active', c.is_active, 'sort_order', c.sort_order) into v_before from public.carousel_items c where c.id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Carousel item not found.');
    end if;

    update public.carousel_items set is_active = not is_active, updated_by = v_admin_id, updated_at = now() where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'CAROUSEL_TOGGLE', 'carousel_item', p_id, v_before);

    return json_build_object('status', 'success');

  elsif p_action = 'delete' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Carousel item ID is required.');
    end if;

    select jsonb_build_object('item_type', c.item_type::text, 'sort_order', c.sort_order) into v_before from public.carousel_items c where c.id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Carousel item not found.');
    end if;

    delete from public.carousel_items where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'CAROUSEL_DELETE', 'carousel_item', p_id, v_before);

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: toggle_active, delete.');
  end if;
end;
$$ language plpgsql;

-- 1.8 Redefine manage_global_setting without outbox events
create or replace function public.manage_global_setting(
  p_action text,
  p_key text default null,
  p_value jsonb default null,
  p_description text default null
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;
  if not public.is_super_admin() then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  if p_action = 'upsert' then
    if p_key is null or length(trim(p_key)) = 0 then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Setting key is required.');
    end if;
    if p_value is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Setting value is required.');
    end if;

    select jsonb_build_object('value', value_json, 'description', description) into v_before from public.global_settings where key = trim(p_key);

    insert into public.global_settings (key, value_json, description, updated_by, updated_at)
    values (trim(p_key), p_value, p_description, v_admin_id, now())
    on conflict (key) do update
    set value_json = excluded.value_json,
        description = coalesce(excluded.description, public.global_settings.description),
        updated_by = v_admin_id,
        updated_at = now();

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'SETTING_UPSERT', 'global_setting', null, v_before, jsonb_build_object('key', p_key, 'value', p_value));

    return json_build_object('status', 'success', 'key', trim(p_key));

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: upsert.');
  end if;
end;
$$ language plpgsql;

-- 1.9 Redefine search_events without dropped columns
drop function if exists public.search_events(text, integer, integer);
drop function if exists public.search_events(text, integer, integer, uuid, uuid, public.event_pricing_type, text, date, boolean, boolean);

create or replace function public.search_events(
  query_text text,
  limit_count integer default 20,
  offset_count integer default 0,
  p_category_id uuid default null,
  p_subcategory_id uuid default null,
  p_pricing_type public.event_pricing_type default null,
  p_timeline text default null,
  p_target_date date default null,
  p_show_past boolean default false,
  p_event_name_only boolean default false
)
returns table (
  id uuid,
  organization_id uuid,
  created_by uuid,
  updated_by uuid,
  name text,
  description text,
  category_id uuid,
  subcategory_id uuid,
  banner_media_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  venue_name text,
  registration_mode public.registration_mode,
  external_registration_url text,
  pricing_type public.event_pricing_type,
  registration_format text,
  capacity_limit integer,
  price_amount numeric,
  status public.event_status,
  view_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  organizations jsonb,
  categories jsonb,
  subcategories jsonb,
  relevance_score integer
) language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_raw text;
  v_lower text;
  v_clean text;
  v_tokens text[];
  v_token_count integer;
  v_limit integer;
  v_offset integer;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'UTC')::date;
  v_tomorrow date := ((now() + interval '1 day') at time zone 'UTC')::date;
  v_next_week date := ((now() + interval '7 days') at time zone 'UTC')::date;
begin
  v_limit := coalesce(limit_count, 20);
  if v_limit <= 0 then v_limit := 20; end if;
  if v_limit > 100 then v_limit := 100; end if;

  v_offset := coalesce(offset_count, 0);
  if v_offset < 0 then v_offset := 0; end if;

  v_raw := trim(coalesce(query_text, ''));

  if length(v_raw) > 0 then
    v_clean := regexp_replace(v_raw, '[^a-zA-Z0-9\s]+', ' ', 'g');
    v_clean := lower(trim(regexp_replace(v_clean, '\s+', ' ', 'g')));
    
    select array_agg(t) into v_tokens
    from (
      select distinct word as t
      from regexp_split_to_table(v_clean, '\s+') as word
      where length(word) >= 2
    ) s;

    v_token_count := coalesce(cardinality(v_tokens), 0);
  else
    v_tokens := array[]::text[];
    v_token_count := 0;
  end if;

  return query
  with scored_events as (
    select
      e.id,
      e.organization_id,
      e.created_by,
      e.updated_by,
      e.name,
      e.description,
      e.category_id,
      e.subcategory_id,
      e.banner_media_id,
      e.start_at,
      e.end_at,
      e.venue_name,
      e.registration_mode,
      e.external_registration_url,
      e.pricing_type,
      e.registration_format,
      e.capacity_limit,
      e.price_amount,
      e.status,
      e.view_count,
      e.created_at,
      e.updated_at,
      jsonb_build_object('name', o.name) as organizations,
      jsonb_build_object('id', c.id, 'name', c.name, 'key', c.key) as categories,
      case when s.id is not null 
        then jsonb_build_object('id', s.id, 'name', s.name, 'key', s.key)
        else null 
      end as subcategories,
      (
        case 
          when v_token_count = 0 then 100
          else coalesce((
            select sum(
              (case 
                when lower(trim(e.name)) = v_clean then 500
                when (' ' || lower(regexp_replace(e.name, '[^a-zA-Z0-9]+', ' ', 'g')) || ' ') like '% ' || t || ' %' then 250
                when lower(e.name) like '%' || t || '%' then 150
                else 0
              end)
              +
              (case 
                when p_event_name_only then 0
                when lower(trim(c.name)) = t or lower(trim(c.key)) = t then 80
                when lower(c.name) like '%' || t || '%' or lower(c.key) like '%' || t || '%' then 50
                else 0
              end)
              +
              (case 
                when p_event_name_only then 0
                when s.id is not null and (lower(trim(s.name)) = t or lower(trim(s.key)) = t) then 60
                when s.id is not null and (lower(s.name) like '%' || t || '%' or lower(s.key) like '%' || t || '%') then 40
                else 0
              end)
              +
              (case 
                when p_event_name_only then 0
                when lower(trim(o.name)) = t then 30
                when lower(o.name) like '%' || t || '%' then 15
                else 0
              end)
            )
            from unnest(v_tokens) t
            where length(t) >= 2
          ), 0)
        end
      )::integer as score
    from public.events e
    join public.organizations o on e.organization_id = o.id
    join public.categories c on e.category_id = c.id
    left join public.subcategories s on e.subcategory_id = s.id
    where 
      (
        case 
          when p_show_past then (e.status = 'COMPLETED' or e.end_at < v_now)
          else (e.status = 'PUBLISHED' and e.end_at >= v_now)
        end
      )
      and (p_category_id is null or e.category_id = p_category_id)
      and (p_subcategory_id is null or e.subcategory_id = p_subcategory_id)
      and (p_pricing_type is null or e.pricing_type = p_pricing_type)
      and (
        p_target_date is null 
        or (p_target_date >= (e.start_at at time zone 'UTC')::date and p_target_date <= (e.end_at at time zone 'UTC')::date)
      )
      and (
        p_timeline is null 
        or p_timeline = 'all'
        or (p_timeline = 'today' and v_today >= (e.start_at at time zone 'UTC')::date and v_today <= (e.end_at at time zone 'UTC')::date)
        or (p_timeline = 'tomorrow' and v_tomorrow >= (e.start_at at time zone 'UTC')::date and v_tomorrow <= (e.end_at at time zone 'UTC')::date)
        or (p_timeline = 'this_week' and (e.start_at at time zone 'UTC')::date >= v_today and (e.start_at at time zone 'UTC')::date <= v_next_week)
        or (p_timeline = 'upcoming' and (e.start_at at time zone 'UTC')::date > v_today)
      )
  )
  select 
    s.id,
    s.organization_id,
    s.created_by,
    s.updated_by,
    s.name,
    s.description,
    s.category_id,
    s.subcategory_id,
    s.banner_media_id,
    s.start_at,
    s.end_at,
    s.venue_name,
    s.registration_mode,
    s.external_registration_url,
    s.pricing_type,
    s.registration_format,
    s.capacity_limit,
    s.price_amount,
    s.status,
    s.view_count,
    s.created_at,
    s.updated_at,
    s.organizations,
    s.categories,
    s.subcategories,
    s.score as relevance_score
  from scored_events s
  where (v_token_count = 0 or s.score > 0)
  order by 
    case when v_token_count > 0 then s.score else 0 end desc,
    s.start_at asc,
    s.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.search_events(text, integer, integer, uuid, uuid, public.event_pricing_type, text, date, boolean, boolean) to anon, authenticated, service_role;

-- 1.10 Redefine replace_entity_media without event_memories and sponsors
create or replace function public.replace_entity_media(
  p_entity_table text,
  p_entity_id uuid,
  p_media_column text,
  p_new_media_id uuid
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_media_id uuid;
  v_new_media_status public.media_status;
  v_is_sa boolean;
  v_event_org_id uuid;
  v_media_authorized boolean;
  v_query text;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Administrative session required.');
  end if;
  v_is_sa := public.is_super_admin();

  -- Whitelist validation on table and column
  if p_entity_table not in ('events', 'advertisements', 'carousel_items') then
    return public.set_api_error(400, 'INVALID_TABLE', 'Unsupported entity table.');
  end if;

  if p_media_column not in ('banner_media_id', 'media_id') then
    return public.set_api_error(400, 'INVALID_COLUMN', 'Unsupported media reference column.');
  end if;

  -- 2.1 Entity Ownership Authorization
  if p_entity_table = 'events' then
    if not v_is_sa then
      select organization_id into v_event_org_id from public.events where id = p_entity_id;
      if v_event_org_id is null then
        return public.set_api_error(404, 'EVENT_NOT_FOUND', 'Target event does not exist.');
      end if;
      if not public.is_org_member(v_event_org_id) then
        return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have administrative permissions for this event''s organization.');
      end if;
    end if;
  else
    if not v_is_sa then
      return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin permissions required to modify platform media references.');
    end if;
  end if;

  -- 2.2 New Media Asset Ownership & State Authorization
  if p_new_media_id is not null then
    select status into v_new_media_status from public.media_assets where id = p_new_media_id;
    if v_new_media_status is null then
      return public.set_api_error(404, 'MEDIA_NOT_FOUND', 'Target media asset does not exist.');
    end if;

    if v_new_media_status <> 'READY'::public.media_status then
      return public.set_api_error(409, 'MEDIA_NOT_READY', 'Only media assets in READY status can be attached to entities.');
    end if;

    if not v_is_sa and p_entity_table = 'events' then
      select exists (
        select 1 from public.media_assets ma
        join public.organization_members om on ma.created_by = om.admin_user_id
        where ma.id = p_new_media_id
          and om.organization_id = v_event_org_id
          and om.is_active = true
      ) into v_media_authorized;

      if not v_media_authorized then
        return public.set_api_error(403, 'INSUFFICIENT_MEDIA_PERMISSIONS', 'Target media asset does not belong to the authorized organization.');
      end if;
    end if;
  end if;

  v_query := format('select %I from public.%I where id = $1', p_media_column, p_entity_table);
  execute v_query into v_old_media_id using p_entity_id;

  v_query := format('update public.%I set %I = $1, updated_at = now() where id = $2', p_entity_table, p_media_column);
  execute v_query using p_new_media_id, p_entity_id;

  if v_old_media_id is not null and v_old_media_id <> p_new_media_id then
    update public.media_assets
    set status = 'PENDING_DELETE',
        deleted_at = now()
    where id = v_old_media_id
      and status not in ('DELETING', 'DELETED')
      and not exists (
        select 1 from public.events where banner_media_id = v_old_media_id and id <> p_entity_id
        union all
        select 1 from public.advertisements where media_id = v_old_media_id and id <> p_entity_id
        union all
        select 1 from public.carousel_items where media_id = v_old_media_id and id <> p_entity_id
      );
  end if;

  return json_build_object(
    'success', true,
    'old_media_id', v_old_media_id,
    'new_media_id', p_new_media_id
  );
end;
$$ language plpgsql;

grant execute on function public.replace_entity_media(text, uuid, text, uuid) to authenticated;

-- 1.11 Redefine claim_media_for_deletion without event_memories and sponsors
create or replace function public.claim_media_for_deletion(
  p_batch_size integer default 20,
  p_lease_interval interval default interval '10 minutes'
)
returns table (
  claimed_media_id uuid,
  bucket text,
  object_key text,
  file_size_bytes integer,
  metadata jsonb,
  retry_count integer
) security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  with candidates as (
    select m.id
    from public.media_assets m
    where (
      (m.status = 'PENDING_DELETE')
      or (m.status = 'DELETING' and m.claimed_at < now() - p_lease_interval)
      or (m.status = 'UPLOADING' and m.created_at < now() - interval '24 hours')
    )
    and not exists (
      select 1 from public.events where banner_media_id = m.id
      union all
      select 1 from public.advertisements where media_id = m.id
      union all
      select 1 from public.carousel_items where media_id = m.id
    )
    limit p_batch_size
    for update skip locked
  )
  update public.media_assets ma
  set status = 'DELETING',
      claimed_at = now(),
      retry_count = ma.retry_count + 1
  from candidates c
  where ma.id = c.id
  returning ma.id as claimed_media_id, ma.bucket, ma.object_key, ma.file_size_bytes, ma.metadata, ma.retry_count;
end;
$$ language plpgsql;

grant execute on function public.claim_media_for_deletion(integer, interval) to authenticated, service_role;

-- 1.12 Update increment_resource_version to remove memories and sponsors
create or replace function public.increment_resource_version()
returns trigger security definer
set search_path = pg_catalog, public
as $$
declare
  v_resource public.resource_type;
begin
  case TG_TABLE_NAME
    when 'events' then v_resource := 'events';
    when 'categories' then v_resource := 'categories';
    when 'advertisements' then v_resource := 'ads';
    when 'featured_events' then v_resource := 'featured';
    when 'carousel_items' then v_resource := 'carousel';
    when 'global_settings' then v_resource := 'settings';
    else null;
  end case;

  if v_resource is not null then
    insert into public.resource_versions (resource, version, updated_at)
    values (v_resource, 1, now())
    on conflict (resource) do update
    set version = public.resource_versions.version + 1,
        updated_at = now();
  end if;
  
  return new;
end;
$$ language plpgsql;

delete from public.resource_versions where resource in ('memories', 'sponsors');


-- ==============================================================================
-- PHASE 2: DROP OBSOLETE RPCS & FUNCTIONS
-- ==============================================================================

-- Outbox functions
drop function if exists public.claim_outbox_events(integer);
drop function if exists public.complete_outbox_event(uuid);
drop function if exists public.fail_outbox_event(uuid, text);
drop function if exists public.retry_outbox_event(uuid);
drop function if exists public.cleanup_processed_outbox_events(integer);

-- Ad interaction & metrics
drop function if exists public.track_advertisement_interaction(uuid, text, text, text, jsonb);

-- Sponsor & memory functions
drop function if exists public.manage_sponsor(text, uuid, text, uuid, text, integer);
drop function if exists public.manage_sponsor(text, uuid, text, text, uuid, text, integer, boolean);
drop function if exists public.manage_memory(text, uuid, text);
drop function if exists public.manage_memory(text, uuid, text, text, uuid, uuid, text);

-- Test suite fixtures left in public schema
drop function if exists public.run_database_tests();
drop function if exists public.test_rls_policies();


-- ==============================================================================
-- PHASE 3: DROP CONFIRMED DEAD TABLES & RELATED FOREIGN KEYS
-- ==============================================================================

-- 3.1 Drop outbox table
drop table if exists public.outbox_events cascade;
drop type if exists public.outbox_status cascade;

-- 3.2 Drop backup, archive, background_job, and ad config tables
drop table if exists public.backup_records cascade;
drop table if exists public.archive_records cascade;
drop table if exists public.background_jobs cascade;
drop table if exists public.advertisement_feed_config cascade;
drop table if exists public.advertisement_metrics_daily cascade;

-- 3.3 Drop sponsors table
drop table if exists public.sponsors cascade;

-- 3.4 Drop event memories infrastructure
alter table public.carousel_items drop constraint if exists carousel_items_memory_id_fkey;
alter table public.carousel_items drop column if exists memory_id;
drop table if exists public.event_memory_media cascade;
drop table if exists public.event_memories cascade;


-- ==============================================================================
-- PHASE 4: SIMPLIFY EVENTS SCHEMA (DROP 5 DEAD COLUMNS & CONSTRAINTS)
-- ==============================================================================

-- 4.1 Drop check constraints
alter table public.events drop constraint if exists events_team_pricing_mode_required;
alter table public.events drop constraint if exists events_team_pricing_mode_check;
alter table public.events drop constraint if exists events_team_capacity_count_mode;
alter table public.events drop constraint if exists events_capacity_counts_by_check;
alter table public.events drop constraint if exists events_registration_dates_order;

-- 4.2 Drop columns
alter table public.events drop column if exists completed_at;
alter table public.events drop column if exists team_pricing_mode;
alter table public.events drop column if exists capacity_counts_by;
alter table public.events drop column if exists registration_opens_at;
alter table public.events drop column if exists registration_closes_at;


-- ==============================================================================
-- PHASE 5: DROP CONFIRMED REDUNDANT INDEXES
-- ==============================================================================

drop index if exists public.subcategories_name_trgm_idx;
drop index if exists public.categories_name_trgm_idx;
drop index if exists public.organizations_name_trgm_idx;
drop index if exists public.events_status_idx;
drop index if exists public.events_pricing_type_idx;
drop index if exists public.events_registration_mode_idx;
drop index if exists public.audit_target_created_idx;


-- ==============================================================================
-- PHASE 6: AUDIT LOG 30-DAY ROLLING RETENTION CLEANUP
-- ==============================================================================

create or replace function public.cleanup_old_audit_logs(
  p_retention_days integer default 30
)
returns integer security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted_count integer;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized audit log cleanup.';
  end if;

  delete from public.audit_logs
  where created_at < now() - (p_retention_days || ' days')::interval;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$ language plpgsql;

grant execute on function public.cleanup_old_audit_logs(integer) to authenticated, service_role;


-- ==============================================================================
-- PHASE 7: ENHANCED MEDIA ASSET ORPHAN CLEANUP
-- ==============================================================================

create or replace function public.cleanup_orphaned_media_assets(
  p_older_than_interval interval default interval '24 hours'
)
returns table (cleaned_media_id uuid, object_key text) security definer
set search_path = pg_catalog, public
as $$
begin
  -- First, mark READY assets that have no entity references as PENDING_DELETE if older than threshold
  update public.media_assets m
  set status = 'PENDING_DELETE',
      deleted_at = now()
  where m.status = 'READY'
    and m.created_at < now() - p_older_than_interval
    and not exists (
      select 1 from public.events where banner_media_id = m.id
      union all
      select 1 from public.advertisements where media_id = m.id
      union all
      select 1 from public.carousel_items where media_id = m.id
    );

  -- Then mark stale uploading or deleted records as DELETED
  return query
  update public.media_assets m
  set status = 'DELETED',
      deleted_at = now()
  where (m.status = 'UPLOADING' and m.created_at < now() - p_older_than_interval)
     or (m.status = 'PENDING_DELETE' and m.deleted_at < now() - interval '1 hour')
  returning m.id as cleaned_media_id, m.object_key;
end;
$$ language plpgsql;

grant execute on function public.cleanup_orphaned_media_assets(interval) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1.15 Database Size Guardrail Functions
-- -----------------------------------------------------------------------------

create or replace function public.get_database_storage_stats()
returns jsonb security definer
set search_path = pg_catalog, public
as $$
declare
  v_db_size bigint;
  v_tables jsonb;
  v_indexes jsonb;
  v_result jsonb;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized storage stats check.';
  end if;

  v_db_size := pg_database_size(current_database());

  select jsonb_agg(t) into v_tables
  from (
    select 
      schemaname || '.' || relname as table_name,
      n_live_tup as live_rows_estimate,
      n_dead_tup as dead_rows_estimate,
      pg_total_relation_size(relid) as total_bytes,
      pg_size_pretty(pg_total_relation_size(relid)) as total_size,
      pg_relation_size(relid) as table_bytes,
      pg_size_pretty(pg_relation_size(relid)) as table_size,
      pg_indexes_size(relid) as index_bytes,
      pg_size_pretty(pg_indexes_size(relid)) as index_size
    from pg_stat_user_tables
    where schemaname = 'public'
    order by pg_total_relation_size(relid) desc
    limit 10
  ) t;

  select jsonb_agg(i) into v_indexes
  from (
    select 
      schemaname || '.' || indexrelname as index_name,
      schemaname || '.' || relname as table_name,
      pg_relation_size(indexrelid) as index_bytes,
      pg_size_pretty(pg_relation_size(indexrelid)) as index_size
    from pg_stat_user_indexes
    where schemaname = 'public'
    order by pg_relation_size(indexrelid) desc
    limit 10
  ) i;

  v_result := jsonb_build_object(
    'database_size_bytes', v_db_size,
    'database_size_pretty', pg_size_pretty(v_db_size),
    'top_tables', coalesce(v_tables, '[]'::jsonb),
    'top_indexes', coalesce(v_indexes, '[]'::jsonb)
  );

  return v_result;
end;
$$ language plpgsql;

grant execute on function public.get_database_storage_stats() to authenticated, service_role;

create or replace function public.cleanup_old_access_requests(
  p_retention_days integer default 90
)
returns integer security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized access requests cleanup.';
  end if;

  delete from public.organizer_access_requests
  where status in ('APPROVED', 'REJECTED')
    and updated_at < now() - (p_retention_days || ' days')::interval;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$ language plpgsql;

grant execute on function public.cleanup_old_access_requests(integer) to authenticated, service_role;

create or replace function public.cleanup_past_events(
  p_batch_size integer default 100
)
returns table (
  deleted_event_id uuid,
  event_name text,
  ended_at timestamptz
) security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer;
  v_banner_media_ids uuid[];
begin
  if auth.uid() is not null and not public.is_super_admin() then
    raise exception 'Unauthorized past events cleanup.';
  end if;

  v_limit := coalesce(p_batch_size, 100);
  if v_limit <= 0 then v_limit := 100; end if;
  if v_limit > 500 then v_limit := 500; end if;

  -- Create temp table to hold deleted event details
  create temp table _cleaned_events (
    id uuid,
    name text,
    end_at timestamptz,
    banner_media_id uuid
  ) on commit drop;

  -- 1. Lock and delete past events
  with candidate_events as (
    select e.id, e.name, e.end_at, e.banner_media_id
    from public.events e
    where e.end_at < now()
    order by e.end_at asc
    limit v_limit
    for update skip locked
  ),
  deleted as (
    delete from public.events e
    using candidate_events c
    where e.id = c.id
    returning e.id, e.name, e.end_at, e.banner_media_id
  )
  insert into _cleaned_events (id, name, end_at, banner_media_id)
  select d.id, d.name, d.end_at, d.banner_media_id from deleted d;

  -- 2. Extract dereferenced banner media IDs
  select array_agg(distinct c.banner_media_id)
  into v_banner_media_ids
  from _cleaned_events c
  where c.banner_media_id is not null;

  -- 3. Transition unreferenced media to PENDING_DELETE
  if v_banner_media_ids is not null and cardinality(v_banner_media_ids) > 0 then
    update public.media_assets m
    set status = 'PENDING_DELETE',
        deleted_at = now()
    where m.id = any(v_banner_media_ids)
      and m.status = 'READY'
      and not exists (
        select 1 from public.events where banner_media_id = m.id
        union all
        select 1 from public.advertisements where media_id = m.id
        union all
        select 1 from public.carousel_items where media_id = m.id
      );
  end if;

  -- 4. Return deleted event summaries
  return query
  select c.id, c.name, c.end_at
  from _cleaned_events c;
end;
$$ language plpgsql;

grant execute on function public.cleanup_past_events(integer) to authenticated, service_role;

