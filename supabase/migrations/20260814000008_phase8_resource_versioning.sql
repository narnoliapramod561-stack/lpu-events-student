-- LPU Events — Phase 8: Resource Versioning & Cache Synchronization
-- Migration: 20260814000008_phase8_resource_versioning.sql

-- 1. Seed default initial version rows for all 8 canonical resource types if not already present
insert into public.resource_versions (resource, version, updated_at)
values
  ('events'::public.resource_type, 1, now()),
  ('categories'::public.resource_type, 1, now()),
  ('ads'::public.resource_type, 1, now()),
  ('featured'::public.resource_type, 1, now()),
  ('memories'::public.resource_type, 1, now()),
  ('carousel'::public.resource_type, 1, now()),
  ('sponsors'::public.resource_type, 1, now()),
  ('settings'::public.resource_type, 1, now())
on conflict (resource) do nothing;


-- 2. RPC: get_resource_versions
create or replace function public.get_resource_versions()
returns table (
  resource public.resource_type,
  version bigint,
  updated_at timestamptz
) security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  select rv.resource, rv.version, rv.updated_at
  from public.resource_versions rv
  order by rv.resource asc;
end;
$$ language plpgsql;

grant execute on function public.get_resource_versions() to anon, authenticated, service_role;


-- 3. Hardened RLS Policy for resource_versions (Public read-only, direct client mutations blocked)
alter table public.resource_versions enable row level security;

drop policy if exists resource_versions_super_admin on public.resource_versions;
drop policy if exists resource_versions_public_select on public.resource_versions;

create policy resource_versions_public_select on public.resource_versions
  for select using (true);
