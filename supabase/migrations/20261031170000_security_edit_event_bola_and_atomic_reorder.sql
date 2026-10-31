-- Migration: Fix BOLA in edit_event and provide atomic curation reorder RPCs
-- Date: 2026-10-31

CREATE OR REPLACE FUNCTION public.edit_event(p_event_id uuid, p_event_payload jsonb, p_content_sections jsonb DEFAULT NULL::jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  -- 1. Validate Organizer Authorization on Existing Event
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

  -- 1a. Validate Organization Reassignment Authorization (BOLA defense)
  if not public.is_super_admin() and v_org_id <> v_existing.organization_id then
    if not exists(
      select 1 from public.organization_members 
      where organization_id = v_org_id and admin_user_id = v_admin_id and role = 'ORGANIZER'
    ) then
      return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You cannot reassign an event to an organization you do not administer.');
    end if;
  end if;

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
    if v_reg_url !~* '^https?://[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+' then
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
    jsonb_build_object('name', v_existing.name, 'organization_id', v_existing.organization_id),
    jsonb_build_object('name', coalesce(p_event_payload->>'name', v_existing.name), 'organization_id', v_org_id)
  );

  return json_build_object('status', 'success', 'event_id', p_event_id);
end;
$function$;

-- Atomic reorder RPC for carousel items
CREATE OR REPLACE FUNCTION public.reorder_carousel_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_item jsonb;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('error', 'Super Admin required');
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    update public.carousel_items
    set sort_order = (v_item->>'sort_order')::int,
        updated_at = now()
    where id = (v_item->>'id')::uuid;
  end loop;
  return jsonb_build_object('success', true);
end;
$$;

-- Atomic reorder RPC for featured events
CREATE OR REPLACE FUNCTION public.reorder_featured_events(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_item jsonb;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('error', 'Super Admin required');
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    update public.featured_events
    set sort_order = (v_item->>'sort_order')::int,
        updated_at = now()
    where event_id = (v_item->>'event_id')::uuid;
  end loop;
  return jsonb_build_object('success', true);
end;
$$;

-- Atomic reorder RPC for trending events
CREATE OR REPLACE FUNCTION public.reorder_trending_events(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_item jsonb;
begin
  if not public.is_super_admin() then
    return jsonb_build_object('error', 'Super Admin required');
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    update public.trending_events
    set sort_order = (v_item->>'sort_order')::int,
        updated_at = now()
    where event_id = (v_item->>'event_id')::uuid;
  end loop;
  return jsonb_build_object('success', true);
end;
$$;
