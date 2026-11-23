-- Migration: 20261118000002_ad_system_rpcs_and_audit.sql
-- Description: Audited Security Definer RPCs for Ad System creative management, placement controls, and metrics

-- 1. RPC: save_ad_creative
create or replace function public.save_ad_creative(
  p_payload jsonb
)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_ad_id uuid;
  v_name text;
  v_sponsor_name text;
  v_format public.ad_format;
  v_media_id uuid;
  v_image_url text;
  v_variants jsonb;
  v_redirect_url text;
  v_cta_text text;
  v_badge_text text;
  v_duration int;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_is_active boolean;
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

  -- Validate Name
  v_name := nullif(btrim(p_payload->>'name'), '');
  if v_name is null then
    return public.set_api_error(400, 'VALIDATION_ERROR', 'Ad campaign name is required.');
  end if;

  -- Validate Redirect URL (must be valid http/https)
  v_redirect_url := nullif(btrim(p_payload->>'redirect_url'), '');
  if v_redirect_url is null or v_redirect_url !~* '^https?://' then
    return public.set_api_error(400, 'VALIDATION_ERROR', 'Valid redirect URL (http:// or https://) is required.');
  end if;

  -- Validate Format
  begin
    v_format := (p_payload->>'format')::public.ad_format;
  exception when others then
    v_format := 'STANDARD_SHOWCASE'::public.ad_format;
  end;

  -- Extract and validate fields
  v_sponsor_name := nullif(btrim(p_payload->>'sponsor_name'), '');
  v_image_url := nullif(btrim(p_payload->>'image_url'), '');
  if v_image_url is null then
    return public.set_api_error(400, 'VALIDATION_ERROR', 'Image URL is required.');
  end if;

  if (p_payload->>'media_id') is not null and (p_payload->>'media_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_media_id := (p_payload->>'media_id')::uuid;
  else
    v_media_id := null;
  end if;

  v_variants := coalesce(p_payload->'variants', '{}'::jsonb);
  v_cta_text := coalesce(nullif(btrim(p_payload->>'cta_text'), ''), 'Know More');
  v_badge_text := coalesce(nullif(btrim(p_payload->>'badge_text'), ''), 'SPONSORED');
  v_duration := coalesce((p_payload->>'display_duration_ms')::int, 6000);
  if v_duration < 1000 then v_duration := 6000; end if;

  if (p_payload->>'start_at') is not null and nullif(btrim(p_payload->>'start_at'), '') is not null then
    v_start_at := (p_payload->>'start_at')::timestamptz;
  else
    v_start_at := null;
  end if;

  if (p_payload->>'end_at') is not null and nullif(btrim(p_payload->>'end_at'), '') is not null then
    v_end_at := (p_payload->>'end_at')::timestamptz;
  else
    v_end_at := null;
  end if;

  if v_end_at is not null and v_start_at is not null and v_end_at <= v_start_at then
    return public.set_api_error(400, 'VALIDATION_ERROR', 'End date must be strictly after start date.');
  end if;

  v_is_active := coalesce((p_payload->>'is_active')::boolean, true);

  -- Determine if Update or Insert
  if (p_payload->>'id') is not null and (p_payload->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_ad_id := (p_payload->>'id')::uuid;

    select to_jsonb(a.*) into v_before from public.advertisements a where a.id = v_ad_id;

    if v_before is null then
      return public.set_api_error(404, 'NOT_FOUND', 'Advertisement not found.');
    end if;

    update public.advertisements
    set
      name = v_name,
      sponsor_name = v_sponsor_name,
      format = v_format,
      media_id = v_media_id,
      image_url = v_image_url,
      variants = v_variants,
      redirect_url = v_redirect_url,
      cta_text = v_cta_text,
      badge_text = v_badge_text,
      display_duration_ms = v_duration,
      start_at = v_start_at,
      end_at = v_end_at,
      is_active = v_is_active,
      updated_at = now()
    where id = v_ad_id
    returning to_jsonb(advertisements.*) into v_after;

    insert into public.audit_logs (
      actor_admin_id, actor_role, action, target_type, target_id, before_data, after_data
    )
    values (
      v_admin_id, 'SUPER_ADMIN', 'AD_CREATIVE_UPDATE', 'advertisement', v_ad_id, v_before, v_after
    );
  else
    insert into public.advertisements (
      name, sponsor_name, format, media_id, image_url, variants,
      redirect_url, cta_text, badge_text, display_duration_ms,
      start_at, end_at, is_active
    )
    values (
      v_name, v_sponsor_name, v_format, v_media_id, v_image_url, v_variants,
      v_redirect_url, v_cta_text, v_badge_text, v_duration,
      v_start_at, v_end_at, v_is_active
    )
    returning id, to_jsonb(advertisements.*) into v_ad_id, v_after;

    insert into public.audit_logs (
      actor_admin_id, actor_role, action, target_type, target_id, after_data
    )
    values (
      v_admin_id, 'SUPER_ADMIN', 'AD_CREATIVE_CREATE', 'advertisement', v_ad_id, v_after
    );
  end if;

  return json_build_object(
    'status', 'success',
    'data', json_build_object('id', v_ad_id, 'ad', v_after)
  );
end;
$$;

-- 2. RPC: delete_ad_creative
create or replace function public.delete_ad_creative(
  p_ad_id uuid
)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;

  if public.is_super_admin() is distinct from true then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  select to_jsonb(a.*) into v_before from public.advertisements a where a.id = p_ad_id;
  if v_before is null then
    return public.set_api_error(404, 'NOT_FOUND', 'Advertisement not found.');
  end if;

  -- Clean up references in ad_placement_configs
  update public.ad_placement_configs
  set
    selected_ad_ids = array_remove(selected_ad_ids, p_ad_id),
    primary_ad_id = case when primary_ad_id = p_ad_id then null else primary_ad_id end,
    event_bindings = coalesce((
      select jsonb_agg(binding)
      from jsonb_array_elements(event_bindings) as binding
      where (binding->>'ad_id')::uuid is distinct from p_ad_id
    ), '[]'::jsonb),
    updated_at = now()
  where p_ad_id = any(selected_ad_ids)
     or primary_ad_id = p_ad_id
     or event_bindings @> jsonb_build_array(jsonb_build_object('ad_id', p_ad_id::text));

  -- Delete ad record
  delete from public.advertisements where id = p_ad_id;

  insert into public.audit_logs (
    actor_admin_id, actor_role, action, target_type, target_id, before_data
  )
  values (
    v_admin_id, 'SUPER_ADMIN', 'AD_CREATIVE_DELETE', 'advertisement', p_ad_id, v_before
  );

  return json_build_object('status', 'success', 'data', json_build_object('deleted_id', p_ad_id));
end;
$$;

-- 3. RPC: update_placement_config
create or replace function public.update_placement_config(
  p_placement public.ad_placement,
  p_config jsonb
)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_is_enabled boolean;
  v_frequency int;
  v_selected_ad_ids uuid[];
  v_primary_ad_id uuid;
  v_event_bindings jsonb;
  v_extra_settings jsonb;
begin
  if auth.uid() is null then
    return public.set_api_error(401, 'UNAUTHENTICATED', 'Session required.');
  end if;

  if public.is_super_admin() is distinct from true then
    return public.set_api_error(403, 'UNAUTHORIZED', 'Super Admin required.');
  end if;

  v_admin_id := public.resolve_admin_id();

  select to_jsonb(c.*) into v_before from public.ad_placement_configs c where c.placement = p_placement;

  v_is_enabled := coalesce((p_config->>'is_enabled')::boolean, true);
  v_frequency := coalesce((p_config->>'frequency')::int, 4);
  if v_frequency < 0 then v_frequency := 0; end if;

  -- Extract selected_ad_ids array
  if p_config ? 'selected_ad_ids' and jsonb_typeof(p_config->'selected_ad_ids') = 'array' then
    select coalesce(array_agg(elem::text::uuid), array[]::uuid[])
    into v_selected_ad_ids
    from jsonb_array_elements_text(p_config->'selected_ad_ids') as elem
    where elem ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  else
    v_selected_ad_ids := coalesce(
      (select c.selected_ad_ids from public.ad_placement_configs c where c.placement = p_placement),
      array[]::uuid[]
    );
  end if;

  -- Extract primary_ad_id
  if (p_config->>'primary_ad_id') is not null and (p_config->>'primary_ad_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_primary_ad_id := (p_config->>'primary_ad_id')::uuid;
  else
    v_primary_ad_id := null;
  end if;

  v_event_bindings := coalesce(p_config->'event_bindings', '[]'::jsonb);
  v_extra_settings := coalesce(p_config->'extra_settings', '{}'::jsonb);

  insert into public.ad_placement_configs (
    placement, is_enabled, frequency, selected_ad_ids, primary_ad_id, event_bindings, extra_settings, updated_at, updated_by
  )
  values (
    p_placement, v_is_enabled, v_frequency, v_selected_ad_ids, v_primary_ad_id, v_event_bindings, v_extra_settings, now(), auth.uid()
  )
  on conflict (placement) do update
  set
    is_enabled = excluded.is_enabled,
    frequency = excluded.frequency,
    selected_ad_ids = excluded.selected_ad_ids,
    primary_ad_id = excluded.primary_ad_id,
    event_bindings = excluded.event_bindings,
    extra_settings = excluded.extra_settings,
    updated_at = now(),
    updated_by = auth.uid()
  returning to_jsonb(ad_placement_configs.*) into v_after;

  insert into public.audit_logs (
    actor_admin_id, actor_role, action, target_type, target_id, before_data, after_data
  )
  values (
    v_admin_id, 'SUPER_ADMIN', 'AD_PLACEMENT_CONFIG_UPDATE', 'ad_placement_config', gen_random_uuid(), v_before, v_after
  );

  return json_build_object('status', 'success', 'data', v_after);
end;
$$;

-- 4. RPC: increment_ad_metrics
create or replace function public.increment_ad_metrics(
  p_ad_id uuid,
  p_metric text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_metric = 'impression' then
    update public.advertisements
    set impressions_count = impressions_count + 1
    where id = p_ad_id;
  elsif p_metric = 'click' then
    update public.advertisements
    set clicks_count = clicks_count + 1
    where id = p_ad_id;
  end if;
end;
$$;

-- 5. RPC: get_ads_manifest_bundle (Used by Snapshot Publisher)
create or replace function public.get_ads_manifest_bundle()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ads jsonb;
  v_hero_carousel jsonb;
  v_hero_strip jsonb;
  v_happening_today jsonb;
  v_event_hub jsonb;
begin
  -- Collect all active, schedule-eligible ads into a key-value dictionary { [id]: ad }
  select coalesce(
    jsonb_object_agg(
      a.id::text,
      jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'sponsor_name', a.sponsor_name,
        'format', a.format,
        'media_id', a.media_id,
        'image_url', a.image_url,
        'variants', a.variants,
        'redirect_url', a.redirect_url,
        'cta_text', a.cta_text,
        'badge_text', a.badge_text,
        'display_duration_ms', a.display_duration_ms,
        'start_at', a.start_at,
        'end_at', a.end_at,
        'is_active', a.is_active,
        'created_at', a.created_at,
        'updated_at', a.updated_at
      )
    ),
    '{}'::jsonb
  )
  into v_ads
  from public.advertisements a
  where a.is_active = true
    and (a.start_at is null or a.start_at <= now())
    and (a.end_at is null or a.end_at > now());

  -- Collect Placement Configurations
  select coalesce(
    jsonb_build_object(
      'is_enabled', coalesce(c.is_enabled, false),
      'frequency', coalesce(c.frequency, 3),
      'selected_ad_ids', coalesce(to_jsonb(c.selected_ad_ids), '[]'::jsonb),
      'slide_duration_ms', coalesce((c.extra_settings->>'slide_duration_ms')::int, 6000)
    ),
    '{"is_enabled":false,"frequency":3,"selected_ad_ids":[],"slide_duration_ms":6000}'::jsonb
  )
  into v_hero_carousel
  from public.ad_placement_configs c
  where c.placement = 'HERO_CAROUSEL';

  select coalesce(
    jsonb_build_object(
      'is_enabled', coalesce(c.is_enabled, false),
      'selected_ad_id', c.primary_ad_id,
      'auto_rotate', coalesce((c.extra_settings->>'auto_rotate')::boolean, false)
    ),
    '{"is_enabled":false,"selected_ad_id":null,"auto_rotate":false}'::jsonb
  )
  into v_hero_strip
  from public.ad_placement_configs c
  where c.placement = 'HOMEPAGE_HERO_STRIP';

  select coalesce(
    jsonb_build_object(
      'is_enabled', coalesce(c.is_enabled, false),
      'fallback_frequency', coalesce(c.frequency, 4),
      'bindings', coalesce(c.event_bindings, '[]'::jsonb)
    ),
    '{"is_enabled":false,"fallback_frequency":4,"bindings":[]}'::jsonb
  )
  into v_happening_today
  from public.ad_placement_configs c
  where c.placement = 'HAPPENING_TODAY';

  select coalesce(
    jsonb_build_object(
      'is_enabled', coalesce(c.is_enabled, false),
      'fallback_frequency', coalesce(c.frequency, 6),
      'suppress_on_search', coalesce((c.extra_settings->>'suppress_on_search')::boolean, true),
      'bindings', coalesce(c.event_bindings, '[]'::jsonb)
    ),
    '{"is_enabled":false,"fallback_frequency":6,"suppress_on_search":true,"bindings":[]}'::jsonb
  )
  into v_event_hub
  from public.ad_placement_configs c
  where c.placement = 'EVENT_GRID_FEED';

  return jsonb_build_object(
    'version', '1.0.0',
    'generated_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'hero_carousel', coalesce(v_hero_carousel, '{"is_enabled":false}'::jsonb),
    'hero_strip', coalesce(v_hero_strip, '{"is_enabled":false}'::jsonb),
    'happening_today', coalesce(v_happening_today, '{"is_enabled":false}'::jsonb),
    'event_hub', coalesce(v_event_hub, '{"is_enabled":false}'::jsonb),
    'ads', coalesce(v_ads, '{}'::jsonb)
  );
end;
$$;

-- 6. Grants
grant execute on function public.save_ad_creative(jsonb) to authenticated;
grant execute on function public.delete_ad_creative(uuid) to authenticated;
grant execute on function public.update_placement_config(public.ad_placement, jsonb) to authenticated;
grant execute on function public.increment_ad_metrics(uuid, text) to anon, authenticated, service_role;
grant execute on function public.get_ads_manifest_bundle() to anon, authenticated, service_role;
