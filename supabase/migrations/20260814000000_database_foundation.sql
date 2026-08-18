-- 20260814000000_database_foundation.sql
-- LPU Events Canonical Database Migration

-- Enable required extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Create custom enum types
create type public.organization_member_role as enum ('ORGANIZER');
create type public.platform_admin_role as enum ('SUPER_ADMIN');
create type public.access_request_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.event_status as enum ('PUBLISHED', 'COMPLETED');
create type public.registration_mode as enum ('NONE', 'EXTERNAL');
create type public.event_pricing_type as enum ('FREE', 'PAID');
create type public.media_type as enum ('EVENT_BANNER', 'ADVERTISEMENT', 'SPONSOR_LOGO', 'CAROUSEL_IMAGE', 'MEMORY_IMAGE');
create type public.media_status as enum ('UPLOADING', 'READY', 'FAILED', 'PENDING_DELETE', 'DELETED');
create type public.advertisement_status as enum ('active', 'inactive');
create type public.carousel_item_type as enum ('EVENT', 'ADVERTISEMENT', 'MEMORY', 'MEDIA');
create type public.content_status as enum ('PUBLISHED', 'DRAFT', 'ARCHIVED');
create type public.resource_type as enum ('events', 'categories', 'ads', 'featured', 'memories', 'carousel', 'sponsors', 'settings');
create type public.outbox_status as enum ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');
create type public.job_status as enum ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
create type public.archive_status as enum ('PENDING', 'VERIFIED', 'FAILED');
create type public.backup_status as enum ('PENDING', 'VERIFIED', 'FAILED');

-- Create administrative domain tables
create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  email text not null unique check (email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_admin_roles (
  admin_user_id uuid primary key references public.admin_users(id) on delete cascade,
  role public.platform_admin_role not null,
  created_at timestamptz not null default now()
);

-- Index to enforce at most one active Super Admin
create unique index platform_admin_roles_one_super_admin_idx
on public.platform_admin_roles (role)
where (role = 'SUPER_ADMIN');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive active organization name uniqueness
create unique index organizations_normalized_name_idx
on public.organizations (lower(trim(name)))
where (is_active = true);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  role public.organization_member_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, admin_user_id)
);

create table public.organizer_access_requests (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  organization_name text not null check (length(trim(organization_name)) > 0),
  remarks text,
  status public.access_request_status not null default 'PENDING',
  reviewed_by uuid references public.admin_users(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index to enforce one pending request per administrator
create unique index organizer_access_requests_pending_uniq_idx
on public.organizer_access_requests (admin_user_id)
where (status = 'PENDING');

-- Create event taxonomy tables
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (length(trim(key)) > 0),
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  key text not null check (length(trim(key)) > 0),
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, key),
  unique (category_id, id) -- Required to establish composite FK from events
);

-- Create media assets table
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (length(trim(bucket)) > 0),
  object_key text not null check (length(trim(object_key)) > 0),
  media_type public.media_type not null,
  mime_type text not null check (length(trim(mime_type)) > 0),
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  checksum text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  status public.media_status not null default 'UPLOADING',
  created_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  deleted_at timestamptz,
  unique (bucket, object_key)
);

-- Create authoritative events table
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  description text not null check (length(trim(description)) > 0),
  category_id uuid not null,
  subcategory_id uuid,
  banner_media_id uuid references public.media_assets(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  venue_name text not null check (length(trim(venue_name)) > 0),
  registration_mode public.registration_mode not null,
  external_registration_url text,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  pricing_type public.event_pricing_type not null,
  registration_format text check (registration_format in ('INDIVIDUAL', 'TEAM')),
  capacity_limit integer check (capacity_limit is null or capacity_limit > 0),
  capacity_counts_by text check (capacity_counts_by in ('TEAMS', 'STUDENTS')),
  team_pricing_mode text check (team_pricing_mode in ('FIXED_TEAM_PRICE', 'PER_MEMBER_PRICE')),
  price_amount numeric check (price_amount is null or price_amount >= 0),
  status public.event_status not null default 'PUBLISHED',
  view_count bigint not null default 0 check (view_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  -- End date must be after start date
  constraint events_date_order check (end_at > start_at),

  -- Registration mode conditional validation
  constraint events_registration_url_check check (
    (registration_mode = 'EXTERNAL' and external_registration_url is not null) or
    (registration_mode = 'NONE' and external_registration_url is null)
  ),

  -- Registration dates ordering
  constraint events_registration_dates_order check (
    registration_opens_at is null or
    registration_closes_at is null or
    registration_closes_at >= registration_opens_at
  ),

  -- Registration format requirement in external mode
  constraint events_registration_format_required check (
    registration_mode <> 'EXTERNAL' or registration_format is not null
  ),

  -- Capacity count mode requirement in team format
  constraint events_team_capacity_count_mode check (
    registration_format <> 'TEAM' or capacity_counts_by is not null
  ),

  -- Price amount required for paid pricing type
  constraint events_price_required check (
    pricing_type <> 'PAID' or price_amount is not null
  ),

  -- Team pricing mode required for paid team registration
  constraint events_team_pricing_mode_required check (
    (pricing_type = 'PAID' and registration_format = 'TEAM') = (team_pricing_mode is not null)
  ),

  -- Free event price validation
  constraint events_free_pricing_check check (
    pricing_type <> 'FREE' or (price_amount = 0 or price_amount is null)
  ),

  -- Category-subcategory integrity check (composite foreign key constraint)
  foreign key (category_id, subcategory_id) references public.subcategories(category_id, id) on delete restrict
);

create table public.event_content_sections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  section_type text not null check (length(trim(section_type)) > 0),
  title text not null check (length(trim(title)) > 0),
  content jsonb not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, sort_order)
);

-- Create advertisements domain tables
create table public.advertisements (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  media_id uuid not null references public.media_assets(id) on delete restrict,
  redirect_url text not null check (length(trim(redirect_url)) > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.advertisement_status not null default 'active',
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advertisements_date_order check (end_at > start_at)
);

create table public.advertisement_positions (
  advertisement_id uuid not null references public.advertisements(id) on delete cascade,
  position text not null check (position in ('homepage_top', 'homepage_feed', 'event_top', 'event_bottom')),
  created_at timestamptz not null default now(),
  primary key (advertisement_id, position)
);

create table public.advertisement_feed_config (
  id boolean primary key default true,
  event_interval integer not null check (event_interval > 0),
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint singleton_config_row check (id = true)
);

create table public.advertisement_metrics_daily (
  advertisement_id uuid not null references public.advertisements(id) on delete cascade,
  metric_date date not null,
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  updated_at timestamptz not null default now(),
  primary key (advertisement_id, metric_date)
);

-- Create curation & content management tables
create table public.featured_events (
  event_id uuid primary key references public.events(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_memories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text not null check (length(trim(description)) > 0),
  cover_media_id uuid not null references public.media_assets(id) on delete restrict,
  status public.content_status not null default 'DRAFT',
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_memory_media (
  memory_id uuid not null references public.event_memories(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (memory_id, media_id)
);

create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  logo_media_id uuid not null references public.media_assets(id) on delete restrict,
  website_url text,
  status public.content_status not null default 'DRAFT',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.carousel_items (
  id uuid primary key default gen_random_uuid(),
  item_type public.carousel_item_type not null,
  event_id uuid references public.events(id) on delete cascade,
  advertisement_id uuid references public.advertisements(id) on delete cascade,
  memory_id uuid references public.event_memories(id) on delete cascade,
  media_id uuid references public.media_assets(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint carousel_items_date_order check (
    start_at is null or end_at is null or end_at > start_at
  ),

  -- Enforce matching content fields based on item_type
  constraint carousel_items_content_check check (
    (item_type = 'EVENT' and event_id is not null) or
    (item_type = 'ADVERTISEMENT' and advertisement_id is not null) or
    (item_type = 'MEMORY' and memory_id is not null) or
    (item_type = 'MEDIA' and media_id is not null)
  )
);

-- Create configuration, synchronization and operational tables
create table public.global_settings (
  key text primary key check (length(trim(key)) > 0),
  value jsonb not null,
  description text,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.resource_versions (
  resource public.resource_type primary key,
  version bigint not null default 1 check (version >= 0),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references public.admin_users(id) on delete set null,
  actor_role text not null,
  action text not null check (length(trim(action)) > 0),
  target_type text not null check (length(trim(target_type)) > 0),
  target_id uuid not null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (length(trim(event_type)) > 0),
  aggregate_type text not null check (length(trim(aggregate_type)) > 0),
  aggregate_id uuid not null,
  payload jsonb not null,
  status public.outbox_status not null default 'PENDING',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (length(trim(job_type)) > 0),
  status public.job_status not null default 'PENDING',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  started_at timestamptz,
  finished_at timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.archive_records (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (length(trim(entity_type)) > 0),
  entity_id uuid not null,
  archive_bucket text not null check (length(trim(archive_bucket)) > 0),
  object_key text not null check (length(trim(object_key)) > 0),
  checksum text not null,
  status public.archive_status not null default 'PENDING',
  archived_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.backup_records (
  id uuid primary key default gen_random_uuid(),
  backup_date timestamptz not null,
  storage_object_key text not null check (length(trim(storage_object_key)) > 0),
  checksum text not null,
  status public.backup_status not null default 'PENDING',
  verified_at timestamptz,
  created_at timestamptz not null default now()
);


-- Indexes supporting query patterns
create index events_status_idx on public.events (status);
create index events_start_at_idx on public.events (start_at);
create index events_end_at_idx on public.events (end_at);
create index events_category_id_idx on public.events (category_id);
create index events_subcategory_id_idx on public.events (subcategory_id);
create index events_organization_id_idx on public.events (organization_id);
create index events_pricing_type_idx on public.events (pricing_type);
create index events_registration_mode_idx on public.events (registration_mode);

-- Composite indexes
create index events_status_start_at_idx on public.events (status, start_at);
create index events_status_end_at_idx on public.events (status, end_at);
create index events_cat_status_start_idx on public.events (category_id, status, start_at);
create index events_subcat_status_start_idx on public.events (subcategory_id, status, start_at);
create index events_org_status_idx on public.events (organization_id, status);

-- Trigram search index
create index events_name_trgm_idx on public.events using gin (name gin_trgm_ops);

-- Outbox indexes
create index outbox_status_avail_idx on public.outbox_events (status, available_at);
create index outbox_agg_idx on public.outbox_events (aggregate_type, aggregate_id);
create index outbox_created_at_idx on public.outbox_events (created_at);

-- Audit indexes
create index audit_actor_created_idx on public.audit_logs (actor_admin_id, created_at);
create index audit_target_created_idx on public.audit_logs (target_type, target_id, created_at);
create index audit_action_created_idx on public.audit_logs (action, created_at);
create index audit_created_at_idx on public.audit_logs (created_at);

-- Access request indexes
create index access_req_admin_idx on public.organizer_access_requests (admin_user_id);
create index access_req_status_created_idx on public.organizer_access_requests (status, created_at);

-- Memberships
create index org_members_admin_active_idx on public.organization_members (admin_user_id) where is_active = true;
create index org_members_org_active_idx on public.organization_members (organization_id) where is_active = true;


-- Security Definer Functions
create or replace function public.is_super_admin()
returns boolean security definer
set search_path = pg_catalog, public
as $$
begin
  return exists (
    select 1 from public.platform_admin_roles r
    join public.admin_users u on r.admin_user_id = u.id
    where u.auth_user_id = auth.uid()
      and u.is_active = true
      and r.role = 'SUPER_ADMIN'
  );
end;
$$ language plpgsql;

create or replace function public.is_org_member(org_id uuid)
returns boolean security definer
set search_path = pg_catalog, public
as $$
begin
  return exists (
    select 1 from public.organization_members m
    join public.admin_users u on m.admin_user_id = u.id
    where u.auth_user_id = auth.uid()
      and u.is_active = true
      and m.organization_id = org_id
      and m.is_active = true
      and m.role = 'ORGANIZER'
  );
end;
$$ language plpgsql;


-- Row Level Security (RLS) Enablement
alter table public.admin_users enable row level security;
alter table public.platform_admin_roles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organizer_access_requests enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.media_assets enable row level security;
alter table public.events enable row level security;
alter table public.event_content_sections enable row level security;
alter table public.advertisements enable row level security;
alter table public.advertisement_positions enable row level security;
alter table public.advertisement_feed_config enable row level security;
alter table public.advertisement_metrics_daily enable row level security;
alter table public.featured_events enable row level security;
alter table public.carousel_items enable row level security;
alter table public.event_memories enable row level security;
alter table public.event_memory_media enable row level security;
alter table public.sponsors enable row level security;
alter table public.global_settings enable row level security;
alter table public.resource_versions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.outbox_events enable row level security;
alter table public.background_jobs enable row level security;
alter table public.archive_records enable row level security;
alter table public.backup_records enable row level security;


-- RLS Policies Definition

-- 1. admin_users
create policy admin_users_super_admin on public.admin_users
  for all using (public.is_super_admin());

create policy admin_users_self_select on public.admin_users
  for select using (auth_user_id = auth.uid() and is_active = true);
  
create policy admin_users_self_update on public.admin_users
  for update using (auth_user_id = auth.uid() and is_active = true)
  with check (auth_user_id = auth.uid() and is_active = true);

-- 2. platform_admin_roles
create policy platform_admin_roles_super_admin on public.platform_admin_roles
  for all using (public.is_super_admin());

create policy platform_admin_roles_self_select on public.platform_admin_roles
  for select using (
    admin_user_id in (select id from public.admin_users where auth_user_id = auth.uid() and is_active = true)
  );

-- 3. organizations
create policy organizations_super_admin on public.organizations
  for all using (public.is_super_admin());

create policy organizations_public_select on public.organizations
  for select using (is_active = true);

create policy organizations_org_member_update on public.organizations
  for update using (public.is_org_member(id))
  with check (public.is_org_member(id));

-- 4. organization_members
create policy organization_members_super_admin on public.organization_members
  for all using (public.is_super_admin());

create policy organization_members_self_select on public.organization_members
  for select using (
    admin_user_id in (select id from public.admin_users where auth_user_id = auth.uid() and is_active = true)
  );

-- 5. organizer_access_requests
create policy organizer_access_requests_super_admin on public.organizer_access_requests
  for all using (public.is_super_admin());

create policy organizer_access_requests_self_select on public.organizer_access_requests
  for select using (
    admin_user_id in (select id from public.admin_users where auth_user_id = auth.uid() and is_active = true)
  );

create policy organizer_access_requests_self_insert on public.organizer_access_requests
  for insert with check (
    admin_user_id in (select id from public.admin_users where auth_user_id = auth.uid() and is_active = true)
    and status = 'PENDING'
  );

-- 6. categories
create policy categories_super_admin on public.categories
  for all using (public.is_super_admin());

create policy categories_public_select on public.categories
  for select using (is_active = true);

-- 7. subcategories
create policy subcategories_super_admin on public.subcategories
  for all using (public.is_super_admin());

create policy subcategories_public_select on public.subcategories
  for select using (is_active = true);

-- 8. media_assets
create policy media_assets_super_admin on public.media_assets
  for all using (public.is_super_admin());

create policy media_assets_public_select on public.media_assets
  for select using (status = 'READY');

create policy media_assets_org_select on public.media_assets
  for select using (
    created_by in (select id from public.admin_users where auth_user_id = auth.uid() and is_active = true)
  );

create policy media_assets_org_insert on public.media_assets
  for insert with check (
    created_by in (select id from public.admin_users where auth_user_id = auth.uid() and is_active = true)
  );

-- 9. events
create policy events_super_admin on public.events
  for all using (public.is_super_admin());

create policy events_public_select on public.events
  for select using (status in ('PUBLISHED', 'COMPLETED'));

create policy events_org_all on public.events
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- 10. event_content_sections
create policy event_content_sections_super_admin on public.event_content_sections
  for all using (public.is_super_admin());

create policy event_content_sections_public_select on public.event_content_sections
  for select using (
    exists (select 1 from public.events e where e.id = event_id and e.status in ('PUBLISHED', 'COMPLETED'))
  );

create policy event_content_sections_org_all on public.event_content_sections
  for all using (
    exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.organization_id))
  )
  with check (
    exists (select 1 from public.events e where e.id = event_id and public.is_org_member(e.organization_id))
  );

-- 11. advertisements
create policy advertisements_super_admin on public.advertisements
  for all using (public.is_super_admin());

create policy advertisements_public_select on public.advertisements
  for select using (status = 'active');

-- 12. advertisement_positions
create policy advertisement_positions_super_admin on public.advertisement_positions
  for all using (public.is_super_admin());

create policy advertisement_positions_public_select on public.advertisement_positions
  for select using (
    exists (select 1 from public.advertisements a where a.id = advertisement_id and a.status = 'active')
  );

-- 13. advertisement_feed_config
create policy advertisement_feed_config_super_admin on public.advertisement_feed_config
  for all using (public.is_super_admin());

create policy advertisement_feed_config_public_select on public.advertisement_feed_config
  for select using (true);

-- 14. advertisement_metrics_daily
create policy advertisement_metrics_daily_super_admin on public.advertisement_metrics_daily
  for all using (public.is_super_admin());

-- 15. featured_events
create policy featured_events_super_admin on public.featured_events
  for all using (public.is_super_admin());

create policy featured_events_public_select on public.featured_events
  for select using (true);

-- 16. carousel_items
create policy carousel_items_super_admin on public.carousel_items
  for all using (public.is_super_admin());

create policy carousel_items_public_select on public.carousel_items
  for select using (is_active = true);

-- 17. event_memories
create policy event_memories_super_admin on public.event_memories
  for all using (public.is_super_admin());

create policy event_memories_public_select on public.event_memories
  for select using (status = 'PUBLISHED');

-- 18. event_memory_media
create policy event_memory_media_super_admin on public.event_memory_media
  for all using (public.is_super_admin());

create policy event_memory_media_public_select on public.event_memory_media
  for select using (
    exists (select 1 from public.event_memories m where m.id = memory_id and m.status = 'PUBLISHED')
  );

-- 19. sponsors
create policy sponsors_super_admin on public.sponsors
  for all using (public.is_super_admin());

create policy sponsors_public_select on public.sponsors
  for select using (status = 'PUBLISHED');

-- 20. global_settings
create policy global_settings_super_admin on public.global_settings
  for all using (public.is_super_admin());

create policy global_settings_public_select on public.global_settings
  for select using (true);

-- 21. resource_versions
create policy resource_versions_super_admin on public.resource_versions
  for all using (public.is_super_admin());

create policy resource_versions_public_select on public.resource_versions
  for select using (true);

-- 22. Operations (audit_logs, outbox_events, background_jobs, archive_records, backup_records)
create policy audit_logs_super_admin on public.audit_logs for all using (public.is_super_admin());
create policy outbox_events_super_admin on public.outbox_events for all using (public.is_super_admin());
create policy background_jobs_super_admin on public.background_jobs for all using (public.is_super_admin());
create policy archive_records_super_admin on public.archive_records for all using (public.is_super_admin());
create policy backup_records_super_admin on public.backup_records for all using (public.is_super_admin());


-- Transactional Resource Version Synchronization Triggers
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
    when 'event_memories' then v_resource := 'memories';
    when 'carousel_items' then v_resource := 'carousel';
    when 'sponsors' then v_resource := 'sponsors';
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

create trigger trg_events_version_inc
after insert or update or delete on public.events
for each row execute function public.increment_resource_version();

create trigger trg_categories_version_inc
after insert or update or delete on public.categories
for each row execute function public.increment_resource_version();

create trigger trg_advertisements_version_inc
after insert or update or delete on public.advertisements
for each row execute function public.increment_resource_version();

create trigger trg_featured_events_version_inc
after insert or update or delete on public.featured_events
for each row execute function public.increment_resource_version();

create trigger trg_event_memories_version_inc
after insert or update or delete on public.event_memories
for each row execute function public.increment_resource_version();

create trigger trg_carousel_items_version_inc
after insert or update or delete on public.carousel_items
for each row execute function public.increment_resource_version();

create trigger trg_sponsors_version_inc
after insert or update or delete on public.sponsors
for each row execute function public.increment_resource_version();

create trigger trg_global_settings_version_inc
after insert or update or delete on public.global_settings
for each row execute function public.increment_resource_version();

-- Grant usage on public schema to anon and authenticated
grant usage on schema public to anon, authenticated;

-- Grant select on all tables in schema public to anon, authenticated for RLS SELECT policies
grant select on all tables in schema public to anon, authenticated;

-- Grant insert, update, delete on all tables in schema public to authenticated for Organizer actions
grant insert, update, delete on all tables in schema public to authenticated;

-- Grant usage on all sequences in schema public to anon, authenticated
grant usage on all sequences in schema public to anon, authenticated;
