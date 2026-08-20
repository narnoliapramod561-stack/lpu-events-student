-- ==============================================================================
-- LPU Events — Canonical Production Database Seed Migration
-- Migration ID: 20260821000001_seed_canonical_production_data.sql
-- Idempotent & Safe for Repeated Execution
-- ==============================================================================

-- 1. Ensure Super Admin user in auth.users and admin_users
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  phone_change, phone_change_token, email_change_token_current, reauthentication_token
)
values (
  '81fee0bd-ed64-4247-8b2a-862cd549823c', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'subhamkumar86032@gmail.com',
  '$2a$10$w0998c08w898w098w898w098w898w098w898w098w898w098w898w',
  now(), now(), now(), '{"provider":"email","providers":["email"]}',
  '{"email":"subhamkumar86032@gmail.com","display_name":"Super Admin"}',
  false, '', '', '', '', '', '', '', ''
) on conflict (id) do update set
  email_confirmed_at = now(),
  confirmation_token = coalesce(auth.users.confirmation_token, ''),
  recovery_token = coalesce(auth.users.recovery_token, ''),
  email_change_token_new = coalesce(auth.users.email_change_token_new, ''),
  email_change = coalesce(auth.users.email_change, '');

-- Ensure Super Admin profile in admin_users
insert into public.admin_users (id, auth_user_id, display_name, email, is_active)
values (
  '81fee0bd-ed64-4247-8b2a-862cd549823c',
  '81fee0bd-ed64-4247-8b2a-862cd549823c',
  'Super Admin',
  'subhamkumar86032@gmail.com',
  true
)
on conflict (auth_user_id) do update set
  is_active = true,
  email = excluded.email;

-- Ensure SUPER_ADMIN platform role
insert into public.platform_admin_roles (admin_user_id, role)
select id, 'SUPER_ADMIN'::public.platform_admin_role
from public.admin_users where email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

-- 2. Seed Organizations
insert into public.organizations (id, name, is_active)
values
  ('11111111-1111-1111-1111-111111111111', 'Coding & Robotics Club LPU', true),
  ('22222222-2222-2222-2222-222222222222', 'Cultural & Youth Welfare Society', true),
  ('33333333-3333-3333-3333-333333333333', 'LPU Sports Authority & Esports Cell', true),
  ('44444444-4444-4444-4444-444444444444', 'Google Developer Student Club LPU', true),
  ('55555555-5555-5555-5555-555555555555', 'Society of Fine Arts & Design LPU', true),
  ('66666666-6666-6666-6666-666666666666', 'Literary & Debating Society LPU', true),
  ('77777777-7777-7777-7777-777777777777', 'Mittal School of Business E-Cell', true)
on conflict (id) do update set name = excluded.name, is_active = true;

-- 3. Seed Media Assets for Events (1 to 60)
insert into public.media_assets (
  id, bucket, object_key, media_type, mime_type, file_size_bytes, checksum, status, created_by
)
select
  ('de000000-0000-0000-0000-' || lpad(s.i::text, 12, '0'))::uuid,
  'public',
  ('events/event_banner_' || lpad(s.i::text, 2, '0') || '.jpg'),
  'EVENT_BANNER'::public.media_type,
  'image/jpeg',
  128000 + (s.i * 1024),
  ('chk_banner_' || lpad(s.i::text, 2, '0')),
  'READY'::public.media_status,
  au.id
from generate_series(1, 60) as s(i)
cross join (select id from public.admin_users where email = 'subhamkumar86032@gmail.com' limit 1) au
on conflict (id) do update set object_key = excluded.object_key, status = excluded.status;

-- Additional Media Assets for Ads, Sponsors, and Memories
insert into public.media_assets (
  id, bucket, object_key, media_type, mime_type, file_size_bytes, checksum, status, created_by
)
select
  'd1111111-1111-1111-1111-111111111111', 'public', 'events/cyberhack2026.png', 'EVENT_BANNER'::public.media_type, 'image/png', 102400, 'chk_banner1', 'READY'::public.media_status, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com' limit 1
on conflict (id) do update set status = excluded.status;

insert into public.media_assets (
  id, bucket, object_key, media_type, mime_type, file_size_bytes, checksum, status, created_by
)
select
  'd2222222-2222-2222-2222-222222222222', 'public', 'ads/placement_drive.png', 'ADVERTISEMENT'::public.media_type, 'image/png', 81920, 'chk_ad1', 'READY'::public.media_status, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com' limit 1
on conflict (id) do update set status = excluded.status;

insert into public.media_assets (
  id, bucket, object_key, media_type, mime_type, file_size_bytes, checksum, status, created_by
)
select
  'd3333333-3333-3333-3333-333333333333', 'public', 'sponsors/google_cloud.png', 'SPONSOR_LOGO'::public.media_type, 'image/png', 40960, 'chk_sp1', 'READY'::public.media_status, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com' limit 1
on conflict (id) do update set status = excluded.status;

insert into public.media_assets (
  id, bucket, object_key, media_type, mime_type, file_size_bytes, checksum, status, created_by
)
select
  'd4444444-4444-4444-4444-444444444444', 'public', 'memories/one_india_2025.png', 'MEMORY_IMAGE'::public.media_type, 'image/png', 120000, 'chk_mem1', 'READY'::public.media_status, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com' limit 1
on conflict (id) do update set status = excluded.status;

-- ==============================================================================
-- 8. SEED ALL 60 EVENTS (40 UPCOMING/CURRENT + 20 PAST)
-- ==============================================================================
-- Event 1: LPU RoboWars 2026: Heavyweight Battlebots Championship
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'LPU RoboWars 2026: Heavyweight Battlebots Championship',
  'HAPPENING TODAY: Live combat robotics tournament featuring 30kg heavyweight arena battles, radio-controlled flippers, spinners, and arena hazards.',
  'c1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222',
  'de000000-0000-0000-0000-000000000001',
  now() - interval '2 hours', now() + interval '6 hours',
  'LPU Indoor Sports Complex Arena Ring 1', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 4250, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 2: One India Inter-State Folk Dance Faceoff
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'One India Inter-State Folk Dance Faceoff',
  'HAPPENING TODAY: Live high-energy traditional dance battle featuring Bhangra, Garba, Lavani, and Bihu performances by state student squads.',
  'c2222222-2222-2222-2222-222222222222', 'b2020002-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000002',
  now() - interval '1 hour', now() + interval '5 hours',
  'LPU Open Air Theatre (OAT)', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 3890, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 3: Inter-Hostel Valorant & BGMI Esports Championship
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Inter-Hostel Valorant & BGMI Esports Championship',
  'HAPPENING TODAY: Live LAN gaming tournament with shoutcasting, 5v5 tactical shooter showdowns, and custom room battle royale action.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000003',
  now() - interval '3 hours', now() + interval '4 hours',
  'Student Center Esports Lounge', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 3120, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 4: GenAI & Prompt Engineering Hands-on Bootcamp
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'GenAI & Prompt Engineering Hands-on Bootcamp',
  'HAPPENING TODAY: Live interactive workshop on building custom AI agents, RAG pipelines, and LLM fine-tuning using Google Cloud & Gemini.',
  'c4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555',
  'de000000-0000-0000-0000-000000000004',
  now() - interval '30 minutes', now() + interval '4 hours',
  'Block 32 Auditorium 1', 'EXTERNAL'::public.registration_mode, 'https://gdg.lpu.in/genai-bootcamp',
  'FREE'::public.event_pricing_type, null, 'INDIVIDUAL', 250, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 2870, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 5: LPU Startup Pitch Tank 2026
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000005', '77777777-7777-7777-7777-777777777777', au.id, au.id,
  'LPU Startup Pitch Tank 2026',
  'Top student entrepreneurs pitch revolutionary startup ideas to angel investors and seed fund partners for ₹10 Lakhs equity-free grant.',
  'c4000000-0000-0000-0000-000000000001', 'ba400004-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000005',
  now() + interval '1 day 2 hours', now() + interval '1 day 6 hours',
  'Mittal School of Business Conclave Hall', 'EXTERNAL'::public.registration_mode, 'https://ecell.lpu.in/pitch-tank',
  'FREE'::public.event_pricing_type, null, 'TEAM', 50, 'TEAMS', null, 'PUBLISHED'::public.event_status, 1940, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 6: Classical Hindustani Sitar & Tabla Evening
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Classical Hindustani Sitar & Tabla Evening',
  'An enchanting classical music concert featuring maestro jugalbandi performances and university classical orchestra.',
  'c2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333',
  'de000000-0000-0000-0000-000000000006',
  now() + interval '1 day 4 hours', now() + interval '1 day 8 hours',
  'Shanti Devi Mittal Auditorium', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1680, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 7: Inter-School Cricket Derby: Super Over League
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Inter-School Cricket Derby: Super Over League',
  'Fast-paced T10 inter-school knockout cricket cup with live big-screen scores and cheer squads.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000007',
  now() + interval '1 day 1 hour', now() + interval '1 day 7 hours',
  'LPU Main Sports Stadium Oval 1', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 2150, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 8: Figma UI/UX & Design Systems Sprint
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000008', '55555555-5555-5555-5555-555555555555', au.id, au.id,
  'Figma UI/UX & Design Systems Sprint',
  'Hands-on UI/UX design masterclass focusing on auto-layout, tokenized design systems, and micro-interaction prototypes.',
  'c4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555',
  'de000000-0000-0000-0000-000000000008',
  now() + interval '1 day 3 hours', now() + interval '1 day 7 hours',
  'Block 32 Design Studio 4', 'EXTERNAL'::public.registration_mode, 'https://design.lpu.in/figma-sprint',
  'PAID'::public.event_pricing_type, 199.0, 'INDIVIDUAL', 100, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 1420, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 9: CyberSec CTF Ethical Hacking Arena
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'CyberSec CTF Ethical Hacking Arena',
  'Defend and attack simulated networks in a 12-hour Capture the Flag tournament with crypto, web exploit, and reverse engineering challenges.',
  'c1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222',
  'de000000-0000-0000-0000-000000000009',
  now() + interval '2 days 2 hours', now() + interval '2 days 10 hours',
  'Block 34 Cyber Security Lab', 'EXTERNAL'::public.registration_mode, 'https://cybersec.lpu.in/ctf-2026',
  'FREE'::public.event_pricing_type, null, 'TEAM', 100, 'TEAMS', null, 'PUBLISHED'::public.event_status, 2310, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 10: Western Band Jam & Battle of Vocals
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Western Band Jam & Battle of Vocals',
  'High-voltage live rock, pop, and acoustic battles between collegiate bands with guest celebrity jury.',
  'c2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333',
  'de000000-0000-0000-0000-000000000010',
  now() + interval '2 days 4 hours', now() + interval '2 days 8 hours',
  'Unipolis Open Stage', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 2760, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 11: 3v3 Basketball Knockout League
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000011', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  '3v3 Basketball Knockout League',
  'Fast-paced half-court 3v3 basketball tournament under floodlights with buzzer beaters and slam dunk showdown.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000011',
  now() + interval '2 days 1 hour', now() + interval '2 days 6 hours',
  'Outdoor Basketball Arena Court 2', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1850, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 12: Blockchain & Solidity Web3 Workshop
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000012', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'Blockchain & Solidity Web3 Workshop',
  'Build and deploy smart contracts on Ethereum and Solana with hands-on gas optimization and decentralized apps.',
  'c4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555',
  'de000000-0000-0000-0000-000000000012',
  now() + interval '2 days 3 hours', now() + interval '2 days 7 hours',
  'Block 32 Computer Lab 2', 'EXTERNAL'::public.registration_mode, 'https://web3.lpu.in/solidity-bootcamp',
  'PAID'::public.event_pricing_type, 149.0, 'INDIVIDUAL', 150, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 1540, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 13: LPU CyberHack 2026: 48-Hour National Hackathon
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'LPU CyberHack 2026: 48-Hour National Hackathon',
  'Join North India largest 48-hour hackathon. Build innovative web, AI, and robotics solutions with cash prizes, cloud credits, and placement opportunities.',
  'c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
  'de000000-0000-0000-0000-000000000013',
  now() + interval '3 days', now() + interval '5 days',
  'Unipolis Auditorium & Block 34 Labs', 'EXTERNAL'::public.registration_mode, 'https://cyberhack.lpu.in',
  'FREE'::public.event_pricing_type, null, 'TEAM', 500, 'TEAMS', null, 'PUBLISHED'::public.event_status, 5420, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 14: Street Play & Nukkad Natak Drama Fest
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Street Play & Nukkad Natak Drama Fest',
  'Powerful social awareness street plays, satirical comedy, and mime acts performed across campus plazas.',
  'c2222222-2222-2222-2222-222222222222', 'b2020002-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000014',
  now() + interval '3 days 2 hours', now() + interval '3 days 6 hours',
  'Central Plaza Roundabout', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1980, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 15: All-India Inter-University Table Tennis Cup
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000015', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'All-India Inter-University Table Tennis Cup',
  'Singles and doubles table tennis championship featuring top seeded collegiate paddlers.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000015',
  now() + interval '3 days 1 hour', now() + interval '3 days 7 hours',
  'Indoor Sports Complex Hall 3', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1630, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 16: Cloud Native DevOps & Kubernetes Masterclass
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000016', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'Cloud Native DevOps & Kubernetes Masterclass',
  'Hands-on session on CI/CD pipelines, Docker containers, Kubernetes cluster management, and Helm chart deployments.',
  'c4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555',
  'de000000-0000-0000-0000-000000000016',
  now() + interval '3 days 3 hours', now() + interval '3 days 7 hours',
  'Block 32 Auditorium 2', 'EXTERNAL'::public.registration_mode, 'https://cloud.lpu.in/devops-masterclass',
  'FREE'::public.event_pricing_type, null, 'INDIVIDUAL', 200, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 1790, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 17: Robo-Soccer & Autonomous Drone Derby
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000017', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Robo-Soccer & Autonomous Drone Derby',
  'Custom autonomous micro-bots battle in 3v3 soccer matches alongside high-speed FPV drone obstacle courses.',
  'c1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222',
  'de000000-0000-0000-0000-000000000017',
  now() + interval '4 days 2 hours', now() + interval '4 days 6 hours',
  'Robotics Innovation Lab Arena', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 2140, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 18: K-Pop & Urban Street Dance Showdown
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000018', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'K-Pop & Urban Street Dance Showdown',
  'Dynamic crew battles, popping, locking, and synchronization faceoffs with cash prizes and studio contracts.',
  'c2222222-2222-2222-2222-222222222222', 'b2020002-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000018',
  now() + interval '4 days 4 hours', now() + interval '4 days 8 hours',
  'LPU Open Air Theatre', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 3100, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 19: Inter-Hostel Badminton Super Cup
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000019', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Inter-Hostel Badminton Super Cup',
  'Smash-packed men and women doubles badminton championship with hostel pride on the line.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000019',
  now() + interval '4 days 1 hour', now() + interval '4 days 7 hours',
  'Indoor Badminton Courts 1-4', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1590, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 20: FinTech & Algorithmic Trading Conclave
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000020', '77777777-7777-7777-7777-777777777777', au.id, au.id,
  'FinTech & Algorithmic Trading Conclave',
  'Learn quantitative trading strategies, Python financial backtesting, and automated risk models from Wall Street veterans.',
  'c4000000-0000-0000-0000-000000000001', 'ba400004-0000-0000-0000-000000000003',
  'de000000-0000-0000-0000-000000000020',
  now() + interval '4 days 3 hours', now() + interval '4 days 7 hours',
  'Mittal School of Business Hall 2', 'EXTERNAL'::public.registration_mode, 'https://fintech.lpu.in/conclave-2026',
  'PAID'::public.event_pricing_type, 249.0, 'INDIVIDUAL', 120, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 1870, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 21: Full-Stack React & Next.js Hack Jam
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000021', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Full-Stack React & Next.js Hack Jam',
  'Intensive coding sprint building high-performance modern web apps with server components, Supabase, and TailwindCSS.',
  'c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
  'de000000-0000-0000-0000-000000000021',
  now() + interval '5 days 2 hours', now() + interval '5 days 8 hours',
  'Block 34 Computer Labs 5-6', 'EXTERNAL'::public.registration_mode, 'https://dev.lpu.in/nextjs-hackjam',
  'FREE'::public.event_pricing_type, null, 'INDIVIDUAL', 150, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 2450, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 22: Stand-up Comedy & Campus Open Mic Showcase
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000022', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Stand-up Comedy & Campus Open Mic Showcase',
  'An evening of non-stop laughs featuring top campus comedians, improv games, and witty storytelling.',
  'c2222222-2222-2222-2222-222222222222', 'ba200002-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000022',
  now() + interval '5 days 4 hours', now() + interval '5 days 7 hours',
  'Shanti Devi Mittal Auditorium', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 2890, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 23: Lawn Tennis Summer Open Championship
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000023', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Lawn Tennis Summer Open Championship',
  'Annual university lawn tennis tournament on synthetic grass courts with trophy and kit sponsors.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000023',
  now() + interval '5 days 1 hour', now() + interval '5 days 6 hours',
  'Tennis Complex Courts 1-2', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1420, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 24: Renewable Energy & EV Mobility Symposium
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000024', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'Renewable Energy & EV Mobility Symposium',
  'Keynote addresses and research papers on solid-state batteries, solar grids, and smart electric powertrains.',
  'c4444444-4444-4444-4444-444444444444', 'ba100001-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000024',
  now() + interval '5 days 3 hours', now() + interval '5 days 7 hours',
  'Block 32 Auditorium 3', 'EXTERNAL'::public.registration_mode, 'https://ev.lpu.in/symposium-2026',
  'FREE'::public.event_pricing_type, null, 'INDIVIDUAL', 300, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 1680, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 25: Data Science & Kaggle Predictathon
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000025', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Data Science & Kaggle Predictathon',
  '24-hour machine learning competition analyzing real-world multimodal datasets to build accurate prediction models.',
  'c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
  'de000000-0000-0000-0000-000000000025',
  now() + interval '6 days 2 hours', now() + interval '6 days 10 hours',
  'Block 34 Data Analytics Lab', 'EXTERNAL'::public.registration_mode, 'https://ds.lpu.in/predictathon',
  'FREE'::public.event_pricing_type, null, 'TEAM', 100, 'TEAMS', null, 'PUBLISHED'::public.event_status, 2190, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 26: National Theatre & Dramatic Play Gala
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000026', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'National Theatre & Dramatic Play Gala',
  'Grand stage adaptations of classic and contemporary plays featuring award-winning collegiate drama troupes.',
  'c2222222-2222-2222-2222-222222222222', 'b2020002-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000026',
  now() + interval '6 days 4 hours', now() + interval '6 days 9 hours',
  'Shanti Devi Mittal Auditorium', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 2630, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 27: Campus Powerlifting & Fitness Expo
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000027', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Campus Powerlifting & Fitness Expo',
  'Squat, bench press, and deadlift competition with raw and equipped categories alongside nutrition workshops.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000027',
  now() + interval '6 days 1 hour', now() + interval '6 days 6 hours',
  'University Fitness & Conditioning Arena', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1920, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 28: BioTech & CRISPR Gene Therapy Summit
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000028', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'BioTech & CRISPR Gene Therapy Summit',
  'Expert symposium exploring molecular biology breakthroughs, synthetic enzymes, and genome editing ethics.',
  'c4444444-4444-4444-4444-444444444444', 'ba100001-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000028',
  now() + interval '6 days 3 hours', now() + interval '6 days 7 hours',
  'School of Bio-Engineering Seminar Hall', 'EXTERNAL'::public.registration_mode, 'https://biotech.lpu.in/summit-2026',
  'FREE'::public.event_pricing_type, null, 'INDIVIDUAL', 200, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 1510, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 29: AR/VR Metaverse Creation Sprint
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000029', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'AR/VR Metaverse Creation Sprint',
  'Build immersive spatial experiences using Unity, Unreal Engine 5, and Apple Vision Pro SDKs with industry mentorship.',
  'c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
  'de000000-0000-0000-0000-000000000029',
  now() + interval '7 days 2 hours', now() + interval '7 days 8 hours',
  'Virtual Reality & Immersive Media Studio', 'EXTERNAL'::public.registration_mode, 'https://vr.lpu.in/metaverse-sprint',
  'FREE'::public.event_pricing_type, null, 'TEAM', 80, 'TEAMS', null, 'PUBLISHED'::public.event_status, 2380, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 30: Fashion Runway: Ethnic Fusion 2026
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000030', '55555555-5555-5555-5555-555555555555', au.id, au.id,
  'Fashion Runway: Ethnic Fusion 2026',
  'Annual high-fashion runway showcasing handwoven Indian textiles, avant-garde silhouettes, and student design collections.',
  'cc000000-0000-0000-0000-000000000001', 'bac0000c-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000030',
  now() + interval '7 days 4 hours', now() + interval '7 days 8 hours',
  'Unipolis Fashion Pavilion', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 3420, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 31: Inter-College Volleyball Clash
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000031', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Inter-College Volleyball Clash',
  'Thrilling volleyball spikes, blocks, and rallies between top regional universities with cash prizes.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000031',
  now() + interval '7 days 1 hour', now() + interval '7 days 6 hours',
  'Outdoor Volleyball Courts 1-3', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1720, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 32: Product Management Case Crackathon
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000032', '77777777-7777-7777-7777-777777777777', au.id, au.id,
  'Product Management Case Crackathon',
  'Solve complex user acquisition, market expansion, and monetization case studies judged by senior PMs from tech giants.',
  'c4000000-0000-0000-0000-000000000001', 'ba400004-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000032',
  now() + interval '7 days 3 hours', now() + interval '7 days 7 hours',
  'Mittal School of Business Conclave Hall', 'EXTERNAL'::public.registration_mode, 'https://pm.lpu.in/crackathon-2026',
  'PAID'::public.event_pricing_type, 299.0, 'TEAM', 60, 'TEAMS', 'FIXED_TEAM_PRICE', 'PUBLISHED'::public.event_status, 1840, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 33: Formula Student Electric Vehicle Expo
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000033', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Formula Student Electric Vehicle Expo',
  'Exhibition and track testing of custom student-designed open-wheel formula electric race cars, telemetry systems, and carbon fiber chassis.',
  'c1111111-1111-1111-1111-111111111111', 'ba300003-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000033',
  now() + interval '8 days 2 hours', now() + interval '8 days 7 hours',
  'Mechanical Engineering Proving Grounds', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 2740, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 34: Campus Acoustic Night & Unplugged Live
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000034', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Campus Acoustic Night & Unplugged Live',
  'Cozy acoustic evening featuring indie singer-songwriters, guitar solos, and soulful melodic sets under fairy lights.',
  'c2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333',
  'de000000-0000-0000-0000-000000000034',
  now() + interval '8 days 4 hours', now() + interval '8 days 8 hours',
  'Student Center Garden Amphitheatre', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 3180, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 35: Chess Grandmaster Blitz Invitational
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000035', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Chess Grandmaster Blitz Invitational',
  'FIDE-rated speed chess championship with simultaneous grandmaster exhibition matches and digital clocks.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000035',
  now() + interval '8 days 1 hour', now() + interval '8 days 6 hours',
  'Central Library Grand Reading Hall', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1690, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 36: Placement Readiness & FAANG Mock Interviews
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000036', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'Placement Readiness & FAANG Mock Interviews',
  '1-on-1 resume reviews, system design drills, and mock technical coding rounds conducted by alumni software engineers.',
  'c4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555',
  'de000000-0000-0000-0000-000000000036',
  now() + interval '8 days 3 hours', now() + interval '8 days 7 hours',
  'Division of Career Services Hall 1', 'EXTERNAL'::public.registration_mode, 'https://careers.lpu.in/mock-drills',
  'FREE'::public.event_pricing_type, null, 'INDIVIDUAL', 250, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 2890, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 37: Quantum Computing Research Conclave
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000037', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Quantum Computing Research Conclave',
  'International researchers present quantum circuit simulation, qubit stability benchmarks, and post-quantum encryption algorithms.',
  'c1111111-1111-1111-1111-111111111111', 'ba300003-0000-0000-0000-000000000003',
  'de000000-0000-0000-0000-000000000037',
  now() + interval '9 days 2 hours', now() + interval '9 days 7 hours',
  'Block 32 International Auditorium', 'EXTERNAL'::public.registration_mode, 'https://quantum.lpu.in/conclave-2026',
  'FREE'::public.event_pricing_type, null, 'INDIVIDUAL', 300, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 1980, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 38: Mega Bollywood DJ Night & Laser Fiesta
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000038', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Mega Bollywood DJ Night & Laser Fiesta',
  'High-energy EDM and Bollywood remix concert with 50,000-watt sound systems, moving heads, and synchronized laser show.',
  'c2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333',
  'de000000-0000-0000-0000-000000000038',
  now() + interval '9 days 4 hours', now() + interval '9 days 9 hours',
  'Unipolis Main Grounds', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 6150, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 39: Inter-University Swimming & Water Polo Gala
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000039', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Inter-University Swimming & Water Polo Gala',
  'Olympic-sized 50m pool competition featuring freestyle, breaststroke, butterfly relays, and varsity water polo.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000039',
  now() + interval '9 days 1 hour', now() + interval '9 days 6 hours',
  'Olympic Aquatic Center Pool 1', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'PUBLISHED'::public.event_status, 1780, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 40: Space Exploration & CubeSat Satellite Seminar
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'e0000000-0000-0000-0000-000000000040', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'Space Exploration & CubeSat Satellite Seminar',
  'Distinguished aerospace engineers discuss low Earth orbit smallsats, payload telemetry, and lunar rover mechanics.',
  'c4444444-4444-4444-4444-444444444444', 'ba100001-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000040',
  now() + interval '9 days 3 hours', now() + interval '9 days 7 hours',
  'Aerospace Engineering Auditorium', 'EXTERNAL'::public.registration_mode, 'https://space.lpu.in/cubesat-seminar',
  'FREE'::public.event_pricing_type, null, 'INDIVIDUAL', 350, 'STUDENTS', null, 'PUBLISHED'::public.event_status, 2120, null
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 41: Competitive Programming CodeSprint 2026
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Competitive Programming CodeSprint 2026',
  'PAST EVENT: Fast-paced algorithmic contest featuring complex data structures, trees, and dynamic programming challenges.',
  'c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
  'de000000-0000-0000-0000-000000000041',
  now() - interval '1 day 6 hours', now() - interval '1 day',
  'Block 34 Computer Labs 1-4', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 3140, now() - interval '1 day'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 42: Kavi Sammelan & Hindi Poetry Fest
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Kavi Sammelan & Hindi Poetry Fest',
  'PAST EVENT: Soul-stirring poetry recitations and shayaris by renowned national poets and university literary enthusiasts.',
  'c2222222-2222-2222-2222-222222222222', 'ba200002-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000042',
  now() - interval '1 day 5 hours', now() - interval '1 day 1 hour',
  'Shanti Devi Mittal Auditorium', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2420, now() - interval '1 day 1 hour'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 43: Inter-Department Football Derby
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Inter-Department Football Derby',
  'PAST EVENT: Electric 90-minute clash between School of Computer Science and Mittal School of Business football squads.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000043',
  now() - interval '1 day 7 hours', now() - interval '1 day 2 hours',
  'LPU Main Football Stadium', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 4120, now() - interval '1 day 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 44: UI/UX Micro-Interactions Studio
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555', au.id, au.id,
  'UI/UX Micro-Interactions Studio',
  'PAST EVENT: Deep dive practical lab crafting fluid micro-interactions, Lottie animations, and spring physics in web apps.',
  'c4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555',
  'de000000-0000-0000-0000-000000000044',
  now() - interval '1 day 6 hours', now() - interval '1 day 3 hours',
  'Block 32 Design Studio 2', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 1980, now() - interval '1 day 3 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 45: Smart Hardware & IoT Hackathon
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Smart Hardware & IoT Hackathon',
  'PAST EVENT: 24-hour hardware innovation sprint with Raspberry Pi, ESP32 microcontrollers, and edge sensor automation.',
  'c1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
  'de000000-0000-0000-0000-000000000045',
  now() - interval '2 days 8 hours', now() - interval '2 days',
  'Embedded Systems & IoT Lab', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2890, now() - interval '2 days'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 46: Western Solo Dance Championship
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Western Solo Dance Championship',
  'PAST EVENT: Acrobatic, contemporary, and hip-hop solo dance competition judged by national choreographers.',
  'c2222222-2222-2222-2222-222222222222', 'b2020002-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000046',
  now() - interval '2 days 6 hours', now() - interval '2 days 2 hours',
  'LPU Open Air Theatre', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 3560, now() - interval '2 days 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 47: North Zone Collegiate Athletics Meet
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'North Zone Collegiate Athletics Meet',
  'PAST EVENT: 100m sprint, 4x400m relay, javelin throw, and long jump qualifiers with varsity teams across 5 states.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000047',
  now() - interval '2 days 7 hours', now() - interval '2 days 1 hour',
  'LPU Main Athletics Track', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 3940, now() - interval '2 days 1 hour'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 48: Angel Investors & Venture Pitch Summit
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000008', '77777777-7777-7777-7777-777777777777', au.id, au.id,
  'Angel Investors & Venture Pitch Summit',
  'PAST EVENT: 15 incubated student startups pitched to venture capital funds resulting in 3 term sheets.',
  'c4000000-0000-0000-0000-000000000001', 'ba400004-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000048',
  now() - interval '2 days 6 hours', now() - interval '2 days 2 hours',
  'Incubation Center Executive Hall', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2180, now() - interval '2 days 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 49: Ethical Hacking & Bug Bounty Workshop
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Ethical Hacking & Bug Bounty Workshop',
  'PAST EVENT: Hands-on exploration of OWASP Top 10 vulnerabilities, API security flaws, and bounty hunting methodology.',
  'c1111111-1111-1111-1111-111111111111', 'ba300003-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000049',
  now() - interval '3 days 6 hours', now() - interval '3 days 1 hour',
  'Block 34 Cyber Lab 3', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2870, now() - interval '3 days 1 hour'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 50: Battle of the Rock Bands 2026
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000010', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Battle of the Rock Bands 2026',
  'PAST EVENT: Live rock showdown with distorted guitars, drum solos, and original headbanging anthems.',
  'c2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333',
  'de000000-0000-0000-0000-000000000050',
  now() - interval '3 days 5 hours', now() - interval '3 days 1 hour',
  'Unipolis Open Stage', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 4780, now() - interval '3 days 1 hour'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 51: 5v5 Campus Futsal Tournament
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000011', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  '5v5 Campus Futsal Tournament',
  'PAST EVENT: Fast-paced turf soccer championship with quick touches, nutmegs, and nail-biting penalty shootouts.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000051',
  now() - interval '3 days 7 hours', now() - interval '3 days 2 hours',
  'Outdoor Turf Arena 1', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2340, now() - interval '3 days 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 52: Mobile App Development with Flutter
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000012', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'Mobile App Development with Flutter',
  'PAST EVENT: Comprehensive masterclass building cross-platform iOS and Android apps with state management and Firebase backend.',
  'c4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555',
  'de000000-0000-0000-0000-000000000052',
  now() - interval '3 days 6 hours', now() - interval '3 days 2 hours',
  'Block 32 Computer Lab 4', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 1920, now() - interval '3 days 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 53: TEDx LPU: Beyond Boundaries
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000013', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'TEDx LPU: Beyond Boundaries',
  'PAST EVENT: Inspiring TEDx talk featuring 8 visionaries discussing exponential tech, grassroots social impact, and leadership.',
  'c2222222-2222-2222-2222-222222222222', 'ba200002-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000053',
  now() - interval '4 days 6 hours', now() - interval '4 days 1 hour',
  'Shanti Devi Mittal Auditorium', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 5120, now() - interval '4 days 1 hour'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 54: Classical Bharatanatyam Solo Recital
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000014', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'Classical Bharatanatyam Solo Recital',
  'PAST EVENT: Graceful classical Indian mudras, rhythm, and expressive abhinaya by senior arts division dancers.',
  'c2222222-2222-2222-2222-222222222222', 'b2020002-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000054',
  now() - interval '4 days 5 hours', now() - interval '4 days 2 hours',
  'Block 14 Fine Arts Auditorium', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2350, now() - interval '4 days 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 55: Inter-Hostel Carrom & Billiards Cup
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000015', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  'Inter-Hostel Carrom & Billiards Cup',
  'PAST EVENT: Precision board control, cue potting accuracy, and white carrom slams in collegiate knockout rounds.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000055',
  now() - interval '4 days 7 hours', now() - interval '4 days 3 hours',
  'Indoor Recreation Center Lounge', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 1480, now() - interval '4 days 3 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 56: AI in Medical Sciences & Genomics Symposium
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000016', '44444444-4444-4444-4444-444444444444', au.id, au.id,
  'AI in Medical Sciences & Genomics Symposium',
  'PAST EVENT: Research talks on computer vision in radiology diagnostics and deep learning models for genomic sequencing.',
  'c4444444-4444-4444-4444-444444444444', 'ba100001-0000-0000-0000-000000000001',
  'de000000-0000-0000-0000-000000000056',
  now() - interval '4 days 6 hours', now() - interval '4 days 2 hours',
  'Medical Sciences Lecture Hall 1', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2190, now() - interval '4 days 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 57: One World International Culture Carnival
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000017', '22222222-2222-2222-2222-222222222222', au.id, au.id,
  'One World International Culture Carnival',
  'PAST EVENT: Flagship international parade celebrating 40+ countries with global cuisines, ethnic costumes, and musical troupes.',
  'c2222222-2222-2222-2222-222222222222', 'b3333333-3333-3333-3333-333333333333',
  'de000000-0000-0000-0000-000000000057',
  now() - interval '5 days 8 hours', now() - interval '5 days 1 hour',
  'Unipolis Main Grounds & Stage', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 7420, now() - interval '5 days 1 hour'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 58: Campus Photography & Short Film Expo
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000018', '55555555-5555-5555-5555-555555555555', au.id, au.id,
  'Campus Photography & Short Film Expo',
  'PAST EVENT: Fine art photo gallery screening award-winning documentary clips and cinematic landscape portfolios.',
  'c2222222-2222-2222-2222-222222222222', 'ba200002-0000-0000-0000-000000000002',
  'de000000-0000-0000-0000-000000000058',
  now() - interval '5 days 6 hours', now() - interval '5 days 2 hours',
  'Block 14 Fine Arts Gallery', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2810, now() - interval '5 days 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 59: 10k Campus Marathon & Health Run
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000019', '33333333-3333-3333-3333-333333333333', au.id, au.id,
  '10k Campus Marathon & Health Run',
  'PAST EVENT: Campus-wide 10k cross-country run promoting cardiovascular health and athletic endurance with 1,500 runners.',
  'c3333333-3333-3333-3333-333333333333', 'b4444444-4444-4444-4444-444444444444',
  'de000000-0000-0000-0000-000000000059',
  now() - interval '5 days 7 hours', now() - interval '5 days 4 hours',
  'LPU Campus Perimeter Course', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 4890, now() - interval '5 days 4 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- Event 60: Drone Cinematography Masterclass
insert into public.events (
  id, organization_id, created_by, updated_by, name, description, category_id, subcategory_id,
  banner_media_id, start_at, end_at, venue_name, registration_mode, external_registration_url,
  pricing_type, price_amount, registration_format, capacity_limit, capacity_counts_by, team_pricing_mode, status, view_count, completed_at
)
select
  'ea000000-0000-0000-0000-000000000020', '11111111-1111-1111-1111-111111111111', au.id, au.id,
  'Drone Cinematography Masterclass',
  'PAST EVENT: Aerial filming techniques, gimbal control, color grading, and regulatory DGCA compliance workshop.',
  'c4444444-4444-4444-4444-444444444444', 'b5555555-5555-5555-5555-555555555555',
  'de000000-0000-0000-0000-000000000060',
  now() - interval '5 days 5 hours', now() - interval '5 days 2 hours',
  'Aviation Ground Flight Zone', 'NONE'::public.registration_mode, null,
  'FREE'::public.event_pricing_type, null, null, null, null, null, 'COMPLETED'::public.event_status, 2340, now() - interval '5 days 2 hours'
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  subcategory_id = excluded.subcategory_id,
  banner_media_id = excluded.banner_media_id,
  start_at = excluded.start_at,
  end_at = excluded.end_at,
  venue_name = excluded.venue_name,
  registration_mode = excluded.registration_mode,
  external_registration_url = excluded.external_registration_url,
  pricing_type = excluded.pricing_type,
  price_amount = excluded.price_amount,
  registration_format = excluded.registration_format,
  capacity_limit = excluded.capacity_limit,
  capacity_counts_by = excluded.capacity_counts_by,
  team_pricing_mode = excluded.team_pricing_mode,
  status = excluded.status,
  view_count = excluded.view_count,
  completed_at = excluded.completed_at;

-- ==============================================================================

-- ==============================================================================
-- 10. SEED FEATURED EVENTS CURATION
-- ==============================================================================
insert into public.featured_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000001', 1, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

insert into public.featured_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000002', 2, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

insert into public.featured_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000013', 3, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

insert into public.featured_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000005', 4, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

insert into public.featured_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000038', 5, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

-- ==============================================================================
-- 10B. SEED TRENDING EVENTS (CURATED BY SUPER ADMIN)
-- ==============================================================================
insert into public.trending_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000001', 1, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

insert into public.trending_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000003', 2, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

insert into public.trending_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000013', 3, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

insert into public.trending_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000002', 4, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;

insert into public.trending_events (event_id, sort_order, created_by)
select 'e0000000-0000-0000-0000-000000000020', 5, au.id from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict do nothing;


-- ==============================================================================
-- 11. SEED ADVERTISEMENTS & POSITIONS
-- ==============================================================================
insert into public.advertisements (
  id, name, media_id, redirect_url, start_at, end_at, status, created_by, updated_by
)
select
  'a1111111-1111-1111-1111-111111111111',
  'Campus Placement & Internship Drive 2026',
  'd2222222-2222-2222-2222-222222222222',
  'https://placements.lpu.in',
  now() - interval '1 day',
  now() + interval '30 days',
  'active'::public.advertisement_status,
  au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set status = excluded.status;

insert into public.advertisements (
  id, name, media_id, redirect_url, start_at, end_at, status, created_by, updated_by
)
select
  'a2222222-2222-2222-2222-222222222222',
  'Google Cloud Career Readiness Program',
  'd3333333-3333-3333-3333-333333333333',
  'https://cloud.google.com/edu',
  now() - interval '1 day',
  now() + interval '30 days',
  'active'::public.advertisement_status,
  au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set status = excluded.status;

insert into public.advertisement_positions (advertisement_id, position)
values
  ('a1111111-1111-1111-1111-111111111111', 'homepage_top'),
  ('a1111111-1111-1111-1111-111111111111', 'homepage_feed'),
  ('a2222222-2222-2222-2222-222222222222', 'homepage_feed')
on conflict do nothing;


-- ==============================================================================
-- 12. SEED SPONSORS & PARTNERS
-- ==============================================================================
insert into public.sponsors (
  id, name, logo_media_id, website_url, status, sort_order, created_by, updated_by
)
select
  'f1111111-1111-1111-1111-111111111111', 'Google Cloud',
  'd3333333-3333-3333-3333-333333333333', 'https://cloud.google.com',
  'PUBLISHED'::public.content_status, 1, au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set status = excluded.status;

insert into public.sponsors (
  id, name, logo_media_id, website_url, status, sort_order, created_by, updated_by
)
select
  'f2222222-2222-2222-2222-222222222222', 'GitHub Campus Program',
  'd3333333-3333-3333-3333-333333333333', 'https://github.com',
  'PUBLISHED'::public.content_status, 2, au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set status = excluded.status;


-- ==============================================================================
-- 13. SEED EVENT MEMORIES
-- ==============================================================================
insert into public.event_memories (
  id, event_id, title, description, cover_media_id, status, created_by, updated_by
)
select
  'f5555555-5555-5555-5555-555555555555',
  'ea000000-0000-0000-0000-000000000017',
  'One World International Culture Carnival 2026 Memories',
  'Relive the grand cultural performances, international traditional dances, and state pavilions.',
  'de000000-0000-0000-0000-000000000057',
  'PUBLISHED'::public.content_status, au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set status = excluded.status;

-- 13B. Seed Event Memory Media Gallery
insert into public.event_memory_media (memory_id, media_id, sort_order)
values
  ('f5555555-5555-5555-5555-555555555555', 'de000000-0000-0000-0000-000000000057', 1),
  ('f5555555-5555-5555-5555-555555555555', 'de000000-0000-0000-0000-000000000058', 2),
  ('f5555555-5555-5555-5555-555555555555', 'de000000-0000-0000-0000-000000000059', 3)
on conflict do nothing;

-- 13C. Seed Event Content Sections for all Events
insert into public.event_content_sections (event_id, section_type, title, content, sort_order)
select
  e.id,
  'SCHEDULE',
  'Schedule & Timeline',
  to_jsonb('• 09:00 AM — Check-in & Team Registration
• 10:00 AM — Opening Ceremony & Briefing
• 11:00 AM — Main Event / Competitive Rounds
• 02:00 PM — Break & Networking
• 03:30 PM — Final Evaluation & Showcase
• 05:00 PM — Prize Distribution & Closing Ceremony'::text),
  1
from public.events e
on conflict (event_id, sort_order) do update set content = excluded.content;

insert into public.event_content_sections (event_id, section_type, title, content, sort_order)
select
  e.id,
  'RULES',
  'Rules & Guidelines',
  to_jsonb('• Open to all registered LPU students with valid Student ID.
• Participants must report at least 15 minutes before scheduled start time.
• Strict adherence to university decorum and safety standards.
• Any form of malpractice or plagiarism will result in immediate disqualification.
• The judges and organizing committee decision is final.'::text),
  2
from public.events e
on conflict (event_id, sort_order) do update set content = excluded.content;

insert into public.event_content_sections (event_id, section_type, title, content, sort_order)
select
  e.id,
  'PRIZES',
  'Prizes & Recognition',
  to_jsonb('• 🥇 1st Place: Winner Trophy, Cash Prize & Merit Certificate
• 🥈 2nd Place: Runner-Up Plaque & Merit Certificate
• 🥉 3rd Place: Certificate of Excellence & Swag Kit
• 🎖️ All Participants: Official University Digital Participation Certificate'::text),
  3
from public.events e
on conflict (event_id, sort_order) do update set content = excluded.content;

insert into public.event_content_sections (event_id, section_type, title, content, sort_order)
select
  e.id,
  'CONTACT',
  'Contact & Support',
  to_jsonb('• Organizer: LPU Division of Student Welfare (DSW)
• Email: student-events@lpu.in
• Phone / Helpline: +91 1824 517000
• Venue Coordinator Desk: Room 102, Student Centre'::text),
  4
from public.events e
on conflict (event_id, sort_order) do update set content = excluded.content;



-- ==============================================================================
-- 14. SEED HERO CAROUSEL ITEMS
-- ==============================================================================
insert into public.carousel_items (
  id, item_type, event_id, sort_order, is_active, created_by, updated_by
)
select
  'c0000000-0000-0000-0000-000000000001', 'EVENT'::public.carousel_item_type,
  'e0000000-0000-0000-0000-000000000001', 1, true, au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set is_active = true, sort_order = 1;

insert into public.carousel_items (
  id, item_type, event_id, sort_order, is_active, created_by, updated_by
)
select
  'c0000000-0000-0000-0000-000000000002', 'EVENT'::public.carousel_item_type,
  'e0000000-0000-0000-0000-000000000002', 2, true, au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set is_active = true, sort_order = 2;

insert into public.carousel_items (
  id, item_type, event_id, sort_order, is_active, created_by, updated_by
)
select
  'c0000000-0000-0000-0000-000000000003', 'EVENT'::public.carousel_item_type,
  'e0000000-0000-0000-0000-000000000013', 3, true, au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set is_active = true, sort_order = 3;

insert into public.carousel_items (
  id, item_type, memory_id, sort_order, is_active, created_by, updated_by
)
select
  'c0000000-0000-0000-0000-000000000004', 'MEMORY'::public.carousel_item_type,
  'f5555555-5555-5555-5555-555555555555', 4, true, au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set is_active = true, sort_order = 4;

insert into public.carousel_items (
  id, item_type, advertisement_id, sort_order, is_active, created_by, updated_by
)
select
  'c0000000-0000-0000-0000-000000000005', 'ADVERTISEMENT'::public.carousel_item_type,
  'a1111111-1111-1111-1111-111111111111', 5, true, au.id, au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (id) do update set is_active = true, sort_order = 5;


-- ==============================================================================
-- 15. SEED GLOBAL SETTINGS
-- ==============================================================================
insert into public.global_settings (key, value, description, updated_by)
select
  'site_notice_banner',
  '"🎉 Welcome to LPU Events 2026! Discover 60+ live, upcoming & past hackathons, cultural fests, workshops, esports, and sports tournaments across the campus."'::jsonb,
  'Site header announcement banner text', au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (key) do update set value = excluded.value;

insert into public.global_settings (key, value, description, updated_by)
select
  'platform_maintenance_mode', 'false'::jsonb, 'Global platform maintenance flag', au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (key) do update set value = excluded.value;

insert into public.global_settings (key, value, description, updated_by)
select
  'max_featured_events', '6'::jsonb, 'Maximum number of featured events displayed on homepage', au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (key) do update set value = excluded.value;

insert into public.global_settings (key, value, description, updated_by)
select
  'happening_today_config',
  '{"slide_duration_ms": 4500, "auto_advance": true, "ad_injection": {"enabled": true, "advertisement_id": "a1111111-1111-1111-1111-111111111111", "insert_after_slide": 2, "custom_badge": "SPONSORED", "custom_cta_text": "Explore More"}}'::jsonb,
  'Happening Today carousel timing and ad injection settings', au.id
from public.admin_users au where au.email = 'subhamkumar86032@gmail.com'
on conflict (key) do update set value = excluded.value;


-- ==============================================================================
-- 16. ENSURE RESOURCE VERSIONS INITIALIZED
-- ==============================================================================
insert into public.resource_versions (resource, version)
values
  ('events', 1),
  ('categories', 1),
  ('ads', 1),
  ('featured', 1),
  ('memories', 1),
  ('carousel', 1),
  ('sponsors', 1),
  ('settings', 1)
on conflict (resource) do update set version = public.resource_versions.version + 1;
