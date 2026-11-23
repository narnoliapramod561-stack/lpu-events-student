-- Migration: 20261124000001_hero_carousel_ad_bindings.sql
-- Description: Update get_ads_manifest_bundle to return bindings for HERO_CAROUSEL for fine-grained slotting between carousel event slides

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
  v_strip_slot record;
  v_carousel_freq int;
begin
  -- Resolve configured carousel frequency (default to 1)
  select coalesce(frequency, 1) into v_carousel_freq
  from public.ad_placement_configs
  where placement = 'HERO_CAROUSEL';
  
  if v_carousel_freq is null or v_carousel_freq <= 0 then
    v_carousel_freq := 1;
  end if;

  -- Build dictionary of all active slots with non-empty image_url
  select coalesce(
    jsonb_object_agg(
      s.id::text,
      jsonb_build_object(
        'id', s.id,
        'name', coalesce(nullif(btrim(s.title), ''), coalesce(s.sponsor_name, 'Ad')),
        'sponsor_name', s.sponsor_name,
        'format', case when s.placement = 'HOMEPAGE_HERO_STRIP' then 'PANORAMIC_STRIP' else 'STANDARD_SHOWCASE' end,
        'media_id', s.media_id,
        'image_url', s.image_url,
        'variants', jsonb_build_object('desktop', s.image_url, 'mobile', coalesce(s.mobile_image_url, s.image_url)),
        'redirect_url', s.redirect_url,
        'cta_text', s.cta_text,
        'badge_text', s.badge_text,
        'display_duration_ms', s.display_duration_ms,
        'start_at', s.start_at,
        'end_at', s.end_at,
        'is_active', s.is_active,
        'created_at', s.created_at,
        'updated_at', s.updated_at
      )
    ),
    '{}'::jsonb
  )
  into v_ads
  from public.ad_placement_slots s
  where s.is_active = true
    and char_length(btrim(s.image_url)) > 0
    and (s.start_at is null or s.start_at <= now())
    and (s.end_at is null or s.end_at > now());

  -- Hero Strip
  select * into v_strip_slot
  from public.ad_placement_slots
  where placement = 'HOMEPAGE_HERO_STRIP'
    and is_active = true
    and char_length(btrim(image_url)) > 0
    and (start_at is null or start_at <= now())
    and (end_at is null or end_at > now())
  order by slot_order asc, updated_at desc
  limit 1;

  if found then
    v_hero_strip := jsonb_build_object(
      'is_enabled', true,
      'selected_ad_id', v_strip_slot.id,
      'auto_rotate', false
    );
  else
    v_hero_strip := '{"is_enabled":false,"selected_ad_id":null,"auto_rotate":false}'::jsonb;
  end if;

  -- Hero Carousel (With fine-grained bindings support for positioning between events)
  select jsonb_build_object(
    'is_enabled', coalesce(count(s.id) > 0, false),
    'frequency', v_carousel_freq,
    'selected_ad_ids', coalesce(jsonb_agg(s.id::text order by s.slot_order asc, s.created_at asc), '[]'::jsonb),
    'slide_duration_ms', coalesce(max(s.display_duration_ms), 6000),
    'bindings', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id::text,
          'ad_id', s.id::text,
          'after_event_index', s.after_index,
          'after_event_id', s.target_event_id,
          'is_active', s.is_active
        )
        order by coalesce(s.after_index, s.slot_order) asc
      ) filter (where s.after_index is not null or s.target_event_id is not null),
      '[]'::jsonb
    )
  )
  into v_hero_carousel
  from public.ad_placement_slots s
  where s.placement = 'HERO_CAROUSEL'
    and s.is_active = true
    and char_length(btrim(s.image_url)) > 0
    and (s.start_at is null or s.start_at <= now())
    and (s.end_at is null or s.end_at > now());

  -- Happening Today
  select jsonb_build_object(
    'is_enabled', coalesce(count(s.id) > 0, false),
    'fallback_frequency', 4,
    'bindings', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id::text,
          'ad_id', s.id::text,
          'after_event_index', coalesce(s.after_index, 2),
          'is_active', s.is_active
        )
        order by s.slot_order asc
      ),
      '[]'::jsonb
    )
  )
  into v_happening_today
  from public.ad_placement_slots s
  where s.placement = 'HAPPENING_TODAY'
    and s.is_active = true
    and char_length(btrim(s.image_url)) > 0
    and (s.start_at is null or s.start_at <= now())
    and (s.end_at is null or s.end_at > now());

  -- Event Hub Grid
  select jsonb_build_object(
    'is_enabled', coalesce(count(s.id) > 0, false),
    'fallback_frequency', 6,
    'suppress_on_search', true,
    'bindings', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id::text,
          'ad_id', s.id::text,
          'after_event_index', coalesce(s.after_index, 6),
          'is_active', s.is_active
        )
        order by s.slot_order asc
      ),
      '[]'::jsonb
    )
  )
  into v_event_hub
  from public.ad_placement_slots s
  where s.placement = 'EVENT_GRID_FEED'
    and s.is_active = true
    and char_length(btrim(s.image_url)) > 0
    and (s.start_at is null or s.start_at <= now())
    and (s.end_at is null or s.end_at > now());

  return jsonb_build_object(
    'version', '1.2.0',
    'generated_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'hero_carousel', coalesce(v_hero_carousel, jsonb_build_object('is_enabled', false, 'frequency', v_carousel_freq, 'selected_ad_ids', '[]'::jsonb, 'slide_duration_ms', 6000, 'bindings', '[]'::jsonb)),
    'hero_strip', coalesce(v_hero_strip, '{"is_enabled":false,"selected_ad_id":null,"auto_rotate":false}'::jsonb),
    'happening_today', coalesce(v_happening_today, '{"is_enabled":false,"fallback_frequency":4,"bindings":[]}'::jsonb),
    'event_hub', coalesce(v_event_hub, '{"is_enabled":false,"fallback_frequency":6,"suppress_on_search":true,"bindings":[]}'::jsonb),
    'ads', coalesce(v_ads, '{}'::jsonb)
  );
end;
$$;
