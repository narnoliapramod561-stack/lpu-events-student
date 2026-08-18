-- 20260814000006_phase6_1_security_hardening.sql
-- LPU Events Phase 6.1 — Admin Website Security Hardening
--
-- Fixes:
--   CRITICAL-01: Replace direct Super Admin CRUD with audited RPCs
--   CRITICAL-02: Audit log RLS hardened to SELECT-only
--   HIGH-05: URL scheme validation in publish_event() and edit_event()
--   HIGH-06: Advertisement redirect_url CHECK constraint
--   MEDIUM-07: Ad metrics RLS hardened to SELECT-only
--   MEDIUM-08: Subcategory version trigger


-- ============================================================
-- FIX CRITICAL-02: Audit Logs — SELECT-only for Super Admin
-- ============================================================

drop policy if exists audit_logs_super_admin on public.audit_logs;
create policy audit_logs_super_admin_select on public.audit_logs
  for select using (public.is_super_admin());

-- Audit log INSERTs are performed exclusively by SECURITY DEFINER RPCs.
-- No role may UPDATE or DELETE audit records via PostgREST.


-- ============================================================
-- FIX MEDIUM-07: Ad Metrics — SELECT-only for Super Admin
-- ============================================================

drop policy if exists advertisement_metrics_daily_super_admin on public.advertisement_metrics_daily;
create policy advertisement_metrics_daily_super_admin_select on public.advertisement_metrics_daily
  for select using (public.is_super_admin());

-- Ad metric writes must come from trusted infrastructure (edge functions/background jobs).


-- ============================================================
-- FIX HIGH-06: Advertisement redirect_url scheme validation
-- ============================================================

alter table public.advertisements
  add constraint advertisements_url_scheme check (redirect_url ~ '^https?://');


-- ============================================================
-- FIX MEDIUM-08: Subcategory version trigger
-- ============================================================

-- Subcategory changes should increment the 'categories' resource version
create or replace function public.increment_subcategory_version()
returns trigger security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.resource_versions (resource, version, updated_at)
  values ('categories'::public.resource_type, 1, now())
  on conflict (resource) do update
  set version = public.resource_versions.version + 1,
      updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_subcategories_version_inc
after insert or update or delete on public.subcategories
for each row execute function public.increment_subcategory_version();


-- ============================================================
-- FIX HIGH-05: URL scheme validation in publish_event
-- ============================================================

-- We use CREATE OR REPLACE to add the check into the existing function.
-- The full function is re-declared to insert the URL scheme check.

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

  -- 4a. [PHASE 6.1 FIX] Validate URL Scheme — reject javascript:, data:, vbscript:, file: etc.
  if v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    if v_reg_url !~* '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+' then
      return public.set_api_error(400, 'INVALID_URL_FORMAT', 'External registration URL must start with http:// or https:// and be a valid domain format.');
    end if;
  end if;

  -- 5. Validate Pricing
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


-- ============================================================
-- FIX HIGH-05: URL scheme validation in edit_event
-- ============================================================

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
  v_event record;
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
  v_item json;
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

  -- Load existing event
  select * into v_event from public.events where id = p_event_id;
  if v_event is null then
    return public.set_api_error(404, 'EVENT_NOT_FOUND', 'The specified event does not exist.', jsonb_build_object('event_id', p_event_id));
  end if;

  -- Verify ownership
  if not public.is_super_admin() then
    if not exists(
      select 1 from public.organization_members
      where organization_id = v_event.organization_id and admin_user_id = v_admin_id and role = 'ORGANIZER'
    ) then
      return public.set_api_error(403, 'INSUFFICIENT_ORGANIZATION_PERMISSIONS', 'You do not have administrative permissions for this event''s organization.');
    end if;
  end if;


  -- Extract payload fields
  v_org_id := v_event.organization_id;
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

  -- Validate Category-Subcategory Taxonomy
  if v_subcat_id is not null then
    if not exists(
      select 1 from public.subcategories
      where id = v_subcat_id and category_id = v_cat_id
    ) then
      return public.set_api_error(400, 'TAXONOMY_MISMATCH', 'The selected subcategory does not belong to the parent category.');
    end if;
  end if;

  -- Validate Date Boundaries
  if v_end_at <= v_start_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Event end time must occur after the start time.');
  end if;

  if v_reg_opens_at is not null and v_reg_closes_at is not null and v_reg_closes_at <= v_reg_opens_at then
    return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'Registration closes time must occur after the opens time.');
  end if;

  -- Validate Registration Mode
  if v_reg_mode = 'EXTERNAL' and (v_reg_url is null or length(trim(v_reg_url)) = 0) then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must be provided when mode is EXTERNAL.');
  end if;

  if v_reg_mode <> 'EXTERNAL' and v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    return public.set_api_error(400, 'REGISTRATION_MODE_INVARIANT_VIOLATION', 'Registration URL must only be provided when mode is EXTERNAL.');
  end if;

  -- [PHASE 6.1 FIX] Validate URL Scheme
  if v_reg_url is not null and length(trim(v_reg_url)) > 0 then
    if v_reg_url !~* '^https?://[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+' then
      return public.set_api_error(400, 'INVALID_URL_FORMAT', 'External registration URL must start with http:// or https:// and be a valid domain format.');
    end if;
  end if;

  -- Validate Pricing
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

  -- Validate Media Reference
  if v_banner_media_id is not null then
    if not exists(
      select 1 from public.media_assets
      where id = v_banner_media_id and status = 'READY'
    ) then
      return public.set_api_error(400, 'MEDIA_NOT_READY', 'The selected banner media asset is not ready or does not exist.');
    end if;
  end if;

  -- Capture before state
  v_before_data := jsonb_build_object('name', v_event.name, 'status', v_event.status);

  -- Update Event
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

  -- Replace Content Sections
  delete from public.event_content_sections where event_id = p_event_id;

  for v_item in select * from json_array_elements(p_content_sections) loop
    insert into public.event_content_sections (
      event_id, section_type, title, content, sort_order
    ) values (
      p_event_id, v_item->>'section_type', v_item->>'title',
      (v_item->>'content')::jsonb, (v_item->>'sort_order')::integer
    );
  end loop;

  -- Audit log
  insert into public.audit_logs (
    actor_admin_id, actor_role, action, target_type, target_id, reason, before_data, after_data
  ) values (
    v_admin_id,
    coalesce((select role::text from public.platform_admin_roles where admin_user_id = v_admin_id), 'ORGANIZER'),
    'EVENT_UPDATE',
    'event',
    p_event_id,
    'Event edited',
    v_before_data,
    jsonb_build_object('name', p_event_payload->>'name')
  );

  -- Outbox
  insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
  values ('CACHE_INVALIDATION', 'events', p_event_id,
    jsonb_build_object('tags', jsonb_build_array('events', 'event:' || p_event_id::text))
  );

  return json_build_object('status', 'success', 'event_id', p_event_id);
end;
$$ language plpgsql;


-- ============================================================
-- CRITICAL-01: Super Admin Content Management RPCs
-- ============================================================

-- Helper: resolve current admin ID from auth.uid()
create or replace function public.resolve_admin_id()
returns uuid security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.admin_users where auth_user_id = auth.uid() and is_active = true;
  return v_id;
end;
$$ language plpgsql;

grant execute on function public.resolve_admin_id() to authenticated;


-- ---------------------------------------------------------
-- RPC 1: manage_category
-- Actions: 'create', 'update', 'toggle_active'
-- ---------------------------------------------------------
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

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'categories', v_cat_id, jsonb_build_object('tags', jsonb_build_array('categories')));

    return json_build_object('status', 'success', 'id', v_cat_id);

  elsif p_action = 'toggle_active' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Category ID is required.');
    end if;

    select jsonb_build_object('is_active', c.is_active) into v_before from public.categories c where c.id = p_id;
    update public.categories set is_active = not is_active, updated_at = now() where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'CATEGORY_TOGGLE', 'category', p_id, v_before);

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'categories', p_id, jsonb_build_object('tags', jsonb_build_array('categories')));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: create, toggle_active.');
  end if;
end;
$$ language plpgsql;

grant execute on function public.manage_category(text, uuid, text, text, integer, boolean) to authenticated;


-- ---------------------------------------------------------
-- RPC 2: manage_subcategory
-- ---------------------------------------------------------
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
  v_sub_id uuid;
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
    if not exists(select 1 from public.categories where id = p_category_id) then
      return public.set_api_error(404, 'NOT_FOUND', 'Parent category not found.');
    end if;
    if p_key is null or length(trim(p_key)) = 0 then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Subcategory key is required.');
    end if;
    if p_name is null or length(trim(p_name)) = 0 then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Subcategory name is required.');
    end if;

    v_sub_id := gen_random_uuid();
    insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
    values (v_sub_id, p_category_id, lower(trim(p_key)), trim(p_name), p_sort_order, true);

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'SUBCATEGORY_CREATE', 'subcategory', v_sub_id, jsonb_build_object('key', p_key, 'name', p_name, 'category_id', p_category_id));

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'categories', p_category_id, jsonb_build_object('tags', jsonb_build_array('categories')));

    return json_build_object('status', 'success', 'id', v_sub_id);

  elsif p_action = 'toggle_active' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Subcategory ID is required.');
    end if;

    select jsonb_build_object('is_active', s.is_active) into v_before from public.subcategories s where s.id = p_id;
    update public.subcategories set is_active = not is_active, updated_at = now() where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'SUBCATEGORY_TOGGLE', 'subcategory', p_id, v_before);

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'categories', (select category_id from public.subcategories where id = p_id), jsonb_build_object('tags', jsonb_build_array('categories')));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: create, toggle_active.');
  end if;
end;
$$ language plpgsql;

grant execute on function public.manage_subcategory(text, uuid, uuid, text, text, integer) to authenticated;


-- ---------------------------------------------------------
-- RPC 3: manage_advertisement
-- ---------------------------------------------------------
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
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Media asset ID is required.');
    end if;
    if not exists(select 1 from public.media_assets where id = p_media_id and status = 'READY') then
      return public.set_api_error(400, 'MEDIA_NOT_READY', 'Media asset is not ready.');
    end if;
    if p_redirect_url is null or p_redirect_url !~ '^https?://' then
      return public.set_api_error(400, 'INVALID_URL_SCHEME', 'Redirect URL must use https:// or http://.');
    end if;
    if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
      return public.set_api_error(400, 'INVALID_TEMPORAL_BOUNDS', 'End date must be after start date.');
    end if;

    v_ad_id := gen_random_uuid();
    insert into public.advertisements (id, name, media_id, redirect_url, start_at, end_at, created_by, updated_by)
    values (v_ad_id, trim(p_name), p_media_id, trim(p_redirect_url), p_start_at, p_end_at, v_admin_id, v_admin_id);

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'ADVERTISEMENT_CREATE', 'advertisement', v_ad_id, jsonb_build_object('name', p_name));

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'ads', v_ad_id, jsonb_build_object('tags', jsonb_build_array('ads')));

    return json_build_object('status', 'success', 'id', v_ad_id);

  elsif p_action = 'toggle_status' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Advertisement ID is required.');
    end if;

    select jsonb_build_object('status', a.status::text) into v_before from public.advertisements a where a.id = p_id;
    update public.advertisements set
      status = case when status = 'active' then 'inactive'::public.advertisement_status else 'active'::public.advertisement_status end,
      updated_by = v_admin_id, updated_at = now()
    where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'ADVERTISEMENT_TOGGLE', 'advertisement', p_id, v_before);

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'ads', p_id, jsonb_build_object('tags', jsonb_build_array('ads', 'advertisement:' || p_id::text)));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: create, toggle_status.');
  end if;
end;
$$ language plpgsql;

grant execute on function public.manage_advertisement(text, uuid, text, uuid, text, timestamptz, timestamptz, text) to authenticated;


-- ---------------------------------------------------------
-- RPC 4: manage_carousel_item
-- ---------------------------------------------------------
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

    select jsonb_build_object('is_active', c.is_active) into v_before from public.carousel_items c where c.id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Carousel item not found.');
    end if;

    update public.carousel_items set is_active = not is_active, updated_by = v_admin_id, updated_at = now() where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'CAROUSEL_TOGGLE', 'carousel_item', p_id, v_before);

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'carousel', p_id, jsonb_build_object('tags', jsonb_build_array('carousel')));

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

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'carousel', p_id, jsonb_build_object('tags', jsonb_build_array('carousel')));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: toggle_active, delete.');
  end if;
end;
$$ language plpgsql;

grant execute on function public.manage_carousel_item(text, uuid, boolean) to authenticated;


-- ---------------------------------------------------------
-- RPC 5: manage_sponsor
-- ---------------------------------------------------------
create or replace function public.manage_sponsor(
  p_action text,
  p_id uuid default null,
  p_name text default null,
  p_media_id uuid default null,
  p_website_url text default null,
  p_sort_order integer default 0
)
returns json security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_sponsor_id uuid;
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
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Sponsor name is required.');
    end if;
    if p_media_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Logo media asset ID is required.');
    end if;
    if not exists(select 1 from public.media_assets where id = p_media_id and status = 'READY') then
      return public.set_api_error(400, 'MEDIA_NOT_READY', 'Logo media asset is not ready.');
    end if;
    -- Validate website URL scheme if provided
    if p_website_url is not null and length(trim(p_website_url)) > 0 and p_website_url !~ '^https?://' then
      return public.set_api_error(400, 'INVALID_URL_SCHEME', 'Website URL must use https:// or http://.');
    end if;

    v_sponsor_id := gen_random_uuid();
    insert into public.sponsors (id, name, logo_media_id, website_url, sort_order, created_by, updated_by)
    values (v_sponsor_id, trim(p_name), p_media_id, nullif(trim(p_website_url), ''), p_sort_order, v_admin_id, v_admin_id);

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, after_data)
    values (v_admin_id, 'SUPER_ADMIN', 'SPONSOR_CREATE', 'sponsor', v_sponsor_id, jsonb_build_object('name', p_name));

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'sponsors', v_sponsor_id, jsonb_build_object('tags', jsonb_build_array('sponsors')));

    return json_build_object('status', 'success', 'id', v_sponsor_id);

  elsif p_action = 'toggle_status' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Sponsor ID is required.');
    end if;

    select jsonb_build_object('status', s.status::text) into v_before from public.sponsors s where s.id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Sponsor not found.');
    end if;

    update public.sponsors set
      status = case when status = 'PUBLISHED' then 'DRAFT'::public.content_status else 'PUBLISHED'::public.content_status end,
      updated_by = v_admin_id, updated_at = now()
    where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'SPONSOR_TOGGLE', 'sponsor', p_id, v_before);

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'sponsors', p_id, jsonb_build_object('tags', jsonb_build_array('sponsors')));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: create, toggle_status.');
  end if;
end;
$$ language plpgsql;

grant execute on function public.manage_sponsor(text, uuid, text, uuid, text, integer) to authenticated;


-- ---------------------------------------------------------
-- RPC 6: manage_memory
-- ---------------------------------------------------------
create or replace function public.manage_memory(
  p_action text,
  p_id uuid default null,
  p_status text default null
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

  if p_action = 'toggle_status' then
    if p_id is null then
      return public.set_api_error(400, 'VALIDATION_ERROR', 'Memory ID is required.');
    end if;

    select jsonb_build_object('status', m.status::text, 'title', m.title) into v_before from public.event_memories m where m.id = p_id;
    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Memory not found.');
    end if;

    update public.event_memories set
      status = case when status = 'PUBLISHED' then 'DRAFT'::public.content_status else 'PUBLISHED'::public.content_status end,
      updated_by = v_admin_id, updated_at = now()
    where id = p_id;

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data)
    values (v_admin_id, 'SUPER_ADMIN', 'MEMORY_TOGGLE', 'event_memory', p_id, v_before);

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'memories', p_id, jsonb_build_object('tags', jsonb_build_array('memories')));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: toggle_status.');
  end if;
end;
$$ language plpgsql;

grant execute on function public.manage_memory(text, uuid, text) to authenticated;


-- ---------------------------------------------------------
-- RPC 7: manage_global_setting
-- ---------------------------------------------------------
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

    select jsonb_build_object('value', gs.value) into v_before from public.global_settings gs where gs.key = p_key;

    insert into public.global_settings (key, value, description, updated_by)
    values (trim(p_key), p_value, nullif(trim(p_description), ''), v_admin_id)
    on conflict (key) do update set value = p_value, description = coalesce(nullif(trim(p_description), ''), public.global_settings.description), updated_by = v_admin_id, updated_at = now();

    insert into public.audit_logs (actor_admin_id, actor_role, action, target_type, target_id, before_data, after_data)
    values (v_admin_id, 'SUPER_ADMIN',
      case when v_before is null then 'SETTING_CREATE' else 'SETTING_UPDATE' end,
      'global_setting', gen_random_uuid(), v_before, jsonb_build_object('key', p_key, 'value', p_value));

    insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    values ('CACHE_INVALIDATION', 'settings', '00000000-0000-0000-0000-000000000000'::uuid, jsonb_build_object('tags', jsonb_build_array('settings')));

    return json_build_object('status', 'success');

  else
    return public.set_api_error(400, 'INVALID_ACTION', 'Supported actions: upsert.');
  end if;
end;
$$ language plpgsql;

grant execute on function public.manage_global_setting(text, text, jsonb, text) to authenticated;
