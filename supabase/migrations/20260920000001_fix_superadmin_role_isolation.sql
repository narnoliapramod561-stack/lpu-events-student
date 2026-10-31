-- Migration: 20260920000001_fix_superadmin_role_isolation.sql
-- Description: Fix Super Admin role isolation and prevent unauthorized accounts from inheriting SUPER_ADMIN privileges.

-- 1. Bootstrap the designated platform identity by immutable Auth user ID.
insert into public.platform_admin_roles (admin_user_id, role)
select id, 'SUPER_ADMIN'::public.platform_admin_role
from public.admin_users
where auth_user_id = '81fee0bd-ed64-4247-8b2a-862cd549823c'::uuid
on conflict (admin_user_id) do nothing;

-- Enforce at most one Super Admin while preserving any explicit role rows.
create unique index if not exists platform_admin_roles_one_super_admin_idx
on public.platform_admin_roles (role)
where (role = 'SUPER_ADMIN');

-- 2. Harden profile linking and grant the bootstrap role only to the stable Auth user ID.
create or replace function public.handle_new_auth_user()
returns trigger security definer
set search_path = pg_catalog, public
as $$
declare
  v_admin_id uuid;
  v_clean_email text;
  v_pre_app record;
begin
  v_clean_email := lower(trim(new.email));

  -- If user already exists by email (e.g. pre-approved/pre-seeded), link their auth_user_id:
  update public.admin_users
  set auth_user_id = new.id,
      display_name = coalesce(new.raw_user_meta_data->>'display_name', display_name, split_part(v_clean_email, '@', 1)),
      is_active = true
  where lower(email) = v_clean_email
    and (auth_user_id is null or auth_user_id = new.id)
  returning id into v_admin_id;

  -- Otherwise insert new admin_user:
  if v_admin_id is null then
    insert into public.admin_users (auth_user_id, display_name, email, is_active)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'display_name', split_part(v_clean_email, '@', 1)),
      v_clean_email,
      true
    )
    on conflict (auth_user_id) do update set email = excluded.email
    returning id into v_admin_id;
  end if;

  if v_admin_id is null then
    select id into v_admin_id from public.admin_users where auth_user_id = new.id;
  end if;

  if new.id = '81fee0bd-ed64-4247-8b2a-862cd549823c'::uuid then
    insert into public.platform_admin_roles (admin_user_id, role)
    values (v_admin_id, 'SUPER_ADMIN')
    on conflict (admin_user_id) do nothing;
  end if;

  -- Auto-link pre-approved organizer invitations if configured
  for v_pre_app in 
    select organization_id, organization_name 
    from public.pre_approved_organizers 
    where lower(email) = v_clean_email
  loop
    insert into public.organization_members (organization_id, admin_user_id, role, is_active)
    values (v_pre_app.organization_id, v_admin_id, 'ORGANIZER', true)
    on conflict (organization_id, admin_user_id) do update
    set role = 'ORGANIZER', is_active = true;

    insert into public.organizer_access_requests (admin_user_id, organization_name, status, review_reason)
    values (v_admin_id, v_pre_app.organization_name, 'APPROVED', 'Pre-approved manually by Super Administrator')
    on conflict do nothing;
  end loop;

  return new;
end;
$$ language plpgsql;

notify pgrst, 'reload schema';
