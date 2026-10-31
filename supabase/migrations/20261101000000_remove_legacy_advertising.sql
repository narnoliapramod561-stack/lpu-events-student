-- Remove the retired direct-advertising subsystem.
-- Preserve Google AdSense configuration files/disclosures and sponsor media/features.
begin;

do $cleanup$
declare
  v_definition text;
  v_signature text;
begin
  -- Do not silently discard unexpected data: production was audited and has none.
  if exists (
    select 1 from public.media_assets
    where media_type::text = 'ADVERTISEMENT' or context = 'advertisement'
  ) then
    raise exception 'Legacy advertisement media rows remain; review references before cleanup.';
  end if;

  if exists (
    select 1 from public.carousel_items
    where item_type::text = 'ADVERTISEMENT'
  ) then
    raise exception 'Legacy advertisement carousel rows remain; review references before cleanup.';
  end if;

  -- Remove only the retired resource-version record.
  delete from public.resource_versions where resource::text = 'ads';

  -- Remove old placement controls while retaining valid Happening Today timing.
  update public.global_settings
  set value = value - 'ad_injection',
      description = 'Happening Today carousel timing settings'
  where key = 'happening_today_config'
    and jsonb_typeof(value) = 'object'
    and value ? 'ad_injection';

  delete from public.global_settings
  where key in ('ad_system_config', 'ad_placement_interval');

  -- Old standalone test/management RPCs are no longer part of the platform API.
  drop function if exists public.test_rls_policies(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid);

  for v_signature in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in ('manage_advertisement', 'track_advertisement_interaction')
  loop
    execute 'drop function ' || v_signature;
  end loop;

  -- Rebuild the homepage bundle RPC response without the retired field.
  if to_regprocedure('public.get_homepage_bundle()') is not null then
    v_definition := pg_get_functiondef('public.get_homepage_bundle()'::regprocedure);
    v_definition := replace(v_definition, E'    ''advertisements'', ''[]''::jsonb,\n', '');
    if position('advertisements' in v_definition) > 0 then
      raise exception 'Could not fully remove legacy advertisement output from get_homepage_bundle().';
    end if;
    execute v_definition;
  end if;

  -- Remove the stale table lookup from the live orphan-media claim function.
  v_definition := pg_get_functiondef('public.claim_media_for_deletion(integer,interval)'::regprocedure);
  v_definition := regexp_replace(
    v_definition,
    E'\n[[:space:]]*and not exists \\(select 1 from public\\.advertisements as a where a\\.media_id = m\\.id\\)',
    '',
    'g'
  );
  if position('public.advertisements' in v_definition) > 0 then
    raise exception 'Could not remove the stale advertisements lookup from claim_media_for_deletion().';
  end if;
  execute v_definition;

  -- Remove the retired media-upload context and its role/type mapping.
  v_definition := pg_get_functiondef(
    'public.register_uploaded_media_asset(text,text,text,text,bigint,text,integer,integer,text,jsonb)'::regprocedure
  );
  v_definition := replace(v_definition, '''advertisement'', ', '');
  v_definition := replace(
    v_definition,
    'if p_context in (''hero'', ''advertisement'')',
    'if p_context = ''hero'''
  );
  v_definition := regexp_replace(
    v_definition,
    E'\n[[:space:]]*when p_context = ''advertisement'' then ''ADVERTISEMENT''::public\\.media_type',
    '',
    'g'
  );
  if position('advertisement' in v_definition) > 0 then
    raise exception 'Could not fully remove advertisement context from register_uploaded_media_asset().';
  end if;

  -- Enum columns are temporarily converted to text so only retired enum labels are removed.
  alter table public.carousel_items
    alter column item_type type text using item_type::text;
  drop type public.carousel_item_type;
  create type public.carousel_item_type as enum ('EVENT', 'MEMORY', 'MEDIA');
  alter table public.carousel_items
    alter column item_type type public.carousel_item_type
    using item_type::public.carousel_item_type;

  alter table public.media_assets
    alter column media_type type text using media_type::text;
  drop type public.media_type;
  create type public.media_type as enum ('EVENT_BANNER', 'SPONSOR_LOGO', 'CAROUSEL_IMAGE', 'MEMORY_IMAGE');
  alter table public.media_assets
    alter column media_type type public.media_type
    using media_type::public.media_type;

  alter table public.resource_versions
    alter column resource type text using resource::text;
  drop function public.get_resource_versions();
  drop type public.resource_type;
  create type public.resource_type as enum (
    'events', 'categories', 'featured', 'memories', 'carousel', 'sponsors', 'settings'
  );
  alter table public.resource_versions
    alter column resource type public.resource_type
    using resource::public.resource_type;

  drop type public.advertisement_status;

  -- Recreate the resource version RPC with its original security posture.
  create function public.get_resource_versions()
  returns table(resource public.resource_type, version bigint, updated_at timestamptz)
  language plpgsql
  security definer
  set search_path to 'pg_catalog', 'public'
  as $function$
  begin
    return query
    select rv.resource, rv.version, rv.updated_at
    from public.resource_versions rv
    order by rv.resource asc;
  end;
  $function$;

  grant execute on function public.get_resource_versions() to public;
  grant execute on function public.get_resource_versions() to anon, authenticated, service_role;
  grant all on function public.get_resource_versions() to postgres;

  -- Remove the retired trigger mapping while retaining all other cache resources.
  v_definition := pg_get_functiondef('public.increment_resource_version()'::regprocedure);
  v_definition := regexp_replace(
    v_definition,
    E'\n[[:space:]]*when ''advertisements'' then v_resource := ''ads'';',
    '',
    'g'
  );
  if position('advertisements' in v_definition) > 0 or position('''ads''' in v_definition) > 0 then
    raise exception 'Could not remove the obsolete ads resource mapping from increment_resource_version().';
  end if;
  execute v_definition;

  -- This comment documents only supported upload contexts.
  comment on column public.media_assets.context is
    'UI usage context (hero, event-banner, event-card, thumbnail, admin-preview, memory, sponsor-logo)';
end
$cleanup$;

commit;
