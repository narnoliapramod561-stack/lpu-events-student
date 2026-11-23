-- Migration: 20261118000001_ad_system_foundation.sql
-- Description: First-party edge-cached advertising system foundation, tables, triggers, and RLS

-- 1. Create Enums idempotently
do $$
begin
  if not exists (select 1 from pg_type where typname = 'ad_format') then
    create type public.ad_format as enum ('STANDARD_SHOWCASE', 'PANORAMIC_STRIP');
  end if;
  if not exists (select 1 from pg_type where typname = 'ad_placement') then
    create type public.ad_placement as enum (
      'HERO_CAROUSEL',
      'HOMEPAGE_HERO_STRIP',
      'HAPPENING_TODAY',
      'EVENT_GRID_FEED'
    );
  end if;
end $$;

-- 2. Core Advertisements Table
create table if not exists public.advertisements (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  sponsor_name text,
  format public.ad_format not null default 'STANDARD_SHOWCASE',
  media_id uuid references public.media_assets(id) on delete set null,
  image_url text not null check (char_length(btrim(image_url)) > 0),
  variants jsonb not null default '{}'::jsonb,
  redirect_url text not null check (redirect_url ~* '^https?://'),
  cta_text text not null default 'Know More',
  badge_text text not null default 'SPONSORED',
  display_duration_ms int not null default 6000 check (display_duration_ms >= 1000),
  start_at timestamptz,
  end_at timestamptz check (end_at is null or end_at > start_at),
  is_active boolean not null default true,
  impressions_count bigint not null default 0 check (impressions_count >= 0),
  clicks_count bigint not null default 0 check (clicks_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Placement Configuration Table
create table if not exists public.ad_placement_configs (
  placement public.ad_placement primary key,
  is_enabled boolean not null default true,
  frequency int not null default 4 check (frequency >= 0),
  selected_ad_ids uuid[] not null default array[]::uuid[],
  primary_ad_id uuid references public.advertisements(id) on delete set null,
  event_bindings jsonb not null default '[]'::jsonb,
  extra_settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- 4. High-Performance Indexes
create index if not exists idx_advertisements_active_flight
  on public.advertisements (is_active, start_at, end_at);

create index if not exists idx_advertisements_format
  on public.advertisements (format);

create index if not exists idx_advertisements_created_at
  on public.advertisements (created_at desc);

-- 5. Seed Placement Configs
insert into public.ad_placement_configs (placement, is_enabled, frequency, extra_settings)
values
  ('HERO_CAROUSEL', true, 3, '{"slide_duration_ms": 6000}'::jsonb),
  ('HOMEPAGE_HERO_STRIP', true, 1, '{}'::jsonb),
  ('HAPPENING_TODAY', true, 4, '{}'::jsonb),
  ('EVENT_GRID_FEED', true, 6, '{"suppress_on_search": true}'::jsonb)
on conflict (placement) do update
set
  is_enabled = excluded.is_enabled,
  frequency = excluded.frequency,
  extra_settings = coalesce(public.ad_placement_configs.extra_settings, excluded.extra_settings);

-- 6. Ensure 'ads' exists in resource_versions
insert into public.resource_versions (resource, version, updated_at)
values ('ads'::public.resource_type, 1, now())
on conflict (resource) do nothing;

-- 7. Change Data Capture Version Bump Trigger Function
create or replace function public.bump_ads_resource_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.resource_versions
  set version = version + 1,
      updated_at = now()
  where resource = 'ads'::public.resource_type;
  return coalesce(new, old);
end;
$$;

-- Register Triggers
drop trigger if exists trg_bump_ads_version_on_ad on public.advertisements;
create trigger trg_bump_ads_version_on_ad
  after insert or update or delete on public.advertisements
  for each statement execute function public.bump_ads_resource_version();

drop trigger if exists trg_bump_ads_version_on_config on public.ad_placement_configs;
create trigger trg_bump_ads_version_on_config
  after insert or update or delete on public.ad_placement_configs
  for each statement execute function public.bump_ads_resource_version();

-- 8. Row Level Security Policies
alter table public.advertisements enable row level security;
alter table public.ad_placement_configs enable row level security;

-- Drop existing policies if re-running
drop policy if exists ads_super_admin_all on public.advertisements;
drop policy if exists ads_public_read on public.advertisements;
drop policy if exists configs_super_admin_all on public.ad_placement_configs;
drop policy if exists configs_public_read on public.ad_placement_configs;

-- Super Admin Full CRUD
create policy ads_super_admin_all on public.advertisements
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

create policy configs_super_admin_all on public.ad_placement_configs
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Public Read for Snapshot Publisher and Anon clients
create policy ads_public_read on public.advertisements
  for select to anon, authenticated
  using (
    is_active = true and
    (start_at is null or start_at <= now()) and
    (end_at is null or end_at > now())
  );

create policy configs_public_read on public.ad_placement_configs
  for select to anon, authenticated
  using (true);

-- 9. Grants
grant select on public.advertisements to anon, authenticated;
grant select on public.ad_placement_configs to anon, authenticated;
grant all on public.advertisements to service_role;
grant all on public.ad_placement_configs to service_role;
