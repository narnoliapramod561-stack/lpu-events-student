-- 20260819000001_trending_events_curation.sql
-- Migration: Add trending_events curation table, RLS policies, and default global settings

-- 1. Create public.trending_events table
create table if not exists public.trending_events (
  event_id uuid primary key references public.events(id) on delete cascade,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Enable Row Level Security
alter table public.trending_events enable row level security;

-- Drop existing policies if any
drop policy if exists trending_events_super_admin on public.trending_events;
drop policy if exists trending_events_public_select on public.trending_events;

-- Super Admin has full CRUD access
create policy trending_events_super_admin on public.trending_events
  for all using (public.is_super_admin());

-- Anyone can view curated trending events
create policy trending_events_public_select on public.trending_events
  for select using (true);

-- 3. Grant schema permissions
grant select on public.trending_events to anon, authenticated;
grant insert, update, delete on public.trending_events to authenticated;
grant all on public.trending_events to postgres, service_role;

-- 4. Add default max_trending_events setting to global_settings
insert into public.global_settings (key, value, description, updated_by)
select 
  'max_trending_events', 
  '10'::jsonb, 
  'Maximum number of trending events displayed on the student website', 
  au.id
from public.admin_users au
where au.email = 'subhamkumar86032@gmail.com' or au.is_active = true
order by au.created_at asc
limit 1
on conflict (key) do nothing;

-- 5. Seed initial trending events from top active published events
insert into public.trending_events (event_id, sort_order, created_by)
select 
  e.id as event_id,
  row_number() over (order by e.start_at asc) as sort_order,
  e.created_by
from public.events e
where e.status = 'PUBLISHED' and e.end_at >= now()
order by e.start_at asc
limit 5
on conflict (event_id) do nothing;

-- 6. Notify postgrest to reload schema cache
notify pgrst, 'reload schema';
