-- 20260814000015_official_platform_taxonomy.sql
-- Seed official platform categories and subcategories exactly as specified

-- 1. Re-map existing events referencing old categories if needed
-- c1111111-1111-1111-1111-111111111111 -> Innovation
-- c2222222-2222-2222-2222-222222222222 -> Cultural
-- c4444444-4444-4444-4444-444444444444 -> Academics
-- c3333333-3333-3333-3333-333333333333 -> Co-Curricular

-- Delete subcategories that are not in the new specification to avoid duplicates, but preserve referenced subcategories
-- First update categories
insert into public.categories (id, key, name, sort_order, is_active)
values
  ('c4444444-4444-4444-4444-444444444444', 'academics', 'Academics', 1, true),
  ('c2222222-2222-2222-2222-222222222222', 'cultural', 'Cultural', 2, true),
  ('c1111111-1111-1111-1111-111111111111', 'innovation', 'Innovation', 3, true),
  ('c4000000-0000-0000-0000-000000000001', 'entrepreneurship', 'Entrepreneurship', 4, true),
  ('c5000000-0000-0000-0000-000000000001', 'schools', 'Schools', 5, true),
  ('c6000000-0000-0000-0000-000000000001', 'community-services', 'Community Services', 6, true),
  ('c7000000-0000-0000-0000-000000000001', 'day-celebrations', 'Day Celebrations', 7, true),
  ('c3333333-3333-3333-3333-333333333333', 'co-curricular', 'Co-Curricular', 8, true),
  ('c9000000-0000-0000-0000-000000000001', 'student-clubs', 'Student Clubs & Org', 9, true),
  ('ca000000-0000-0000-0000-000000000001', 'ncc', 'NCC', 10, true),
  ('cb000000-0000-0000-0000-000000000001', 'nss', 'NSS', 11, true),
  ('cc000000-0000-0000-0000-000000000001', 'fashion', 'Fashion', 12, true),
  ('cd000000-0000-0000-0000-000000000001', 'others', 'Others', 13, true)
on conflict (id) do update set
  name = excluded.name,
  key = excluded.key,
  sort_order = excluded.sort_order,
  is_active = true;

-- Deactivate other unused category records
update public.categories 
set is_active = false 
where id not in (
  'c4444444-4444-4444-4444-444444444444',
  'c2222222-2222-2222-2222-222222222222',
  'c1111111-1111-1111-1111-111111111111',
  'c4000000-0000-0000-0000-000000000001',
  'c5000000-0000-0000-0000-000000000001',
  'c6000000-0000-0000-0000-000000000001',
  'c7000000-0000-0000-0000-000000000001',
  'c3333333-3333-3333-3333-333333333333',
  'c9000000-0000-0000-0000-000000000001',
  'ca000000-0000-0000-0000-000000000001',
  'cb000000-0000-0000-0000-000000000001',
  'cc000000-0000-0000-0000-000000000001',
  'cd000000-0000-0000-0000-000000000001'
);

-- 2. Insert Official Subcategories

-- 2.1 Academics
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('ba100001-0000-0000-0000-000000000001', 'c4444444-4444-4444-4444-444444444444', 'seminar', 'Seminar', 1, true),
  ('ba100001-0000-0000-0000-000000000002', 'c4444444-4444-4444-4444-444444444444', 'guest-lecture', 'Guest Lecture', 2, true),
  ('b5555555-5555-5555-5555-555555555555', 'c4444444-4444-4444-4444-444444444444', 'workshop', 'Workshop', 3, true),
  ('ba100001-0000-0000-0000-000000000003', 'c4444444-4444-4444-4444-444444444444', 'internship', 'Internship', 4, true),
  ('ba100001-0000-0000-0000-000000000004', 'c4444444-4444-4444-4444-444444444444', 'capstone', 'Capstone', 5, true),
  ('ba100001-0000-0000-0000-000000000005', 'c4444444-4444-4444-4444-444444444444', 'others', 'Others', 6, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.2 Cultural
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b3333333-3333-3333-3333-333333333333', 'c2222222-2222-2222-2222-222222222222', 'music', 'Music', 1, true),
  ('b2020002-0000-0000-0000-000000000001', 'c2222222-2222-2222-2222-222222222222', 'dance', 'Dance', 2, true),
  ('b2020002-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', 'theatre', 'Theatre', 3, true),
  ('ba200002-0000-0000-0000-000000000001', 'c2222222-2222-2222-2222-222222222222', 'social-media', 'Social Media', 4, true),
  ('ba200002-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', 'others', 'Others', 5, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.3 Innovation
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'hackathon', 'Hackathon', 1, true),
  ('b2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'technical-events', 'Technical Events', 2, true),
  ('ba300003-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', 'project-expo', 'Project Expo', 3, true),
  ('ba300003-0000-0000-0000-000000000002', 'c1111111-1111-1111-1111-111111111111', 'workshop', 'Workshop', 4, true),
  ('ba300003-0000-0000-0000-000000000003', 'c1111111-1111-1111-1111-111111111111', 'seminar', 'Seminar', 5, true),
  ('ba300003-0000-0000-0000-000000000004', 'c1111111-1111-1111-1111-111111111111', 'others', 'Others', 6, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.4 Entrepreneurship
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('ba400004-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'b-plan', 'B-Plan Competition', 1, true),
  ('ba400004-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000001', 'pitch-fest', 'Pitch Fest', 2, true),
  ('ba400004-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000001', 'conclave', 'Conclave', 3, true),
  ('ba400004-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000001', 'bootcamp', 'Bootcamp', 4, true),
  ('ba400004-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000001', 'panel-discussion', 'Panel Discussion', 5, true),
  ('ba400004-0000-0000-0000-000000000006', 'c4000000-0000-0000-0000-000000000001', 'expo', 'Expo', 6, true),
  ('ba400004-0000-0000-0000-000000000007', 'c4000000-0000-0000-0000-000000000001', 'seminar', 'Seminar', 7, true),
  ('ba400004-0000-0000-0000-000000000008', 'c4000000-0000-0000-0000-000000000001', 'others', 'Others', 8, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.5 Schools (Comprehensive Departmental Schools)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  -- Engineering & Technology
  ('ba500005-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'school-ai-emerging', 'School of AI and Emerging Technologies', 1, true),
  ('ba500005-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', 'school-bio', 'School of Bio Engineering and Biosciences', 2, true),
  ('ba500005-0000-0000-0000-000000000003', 'c5000000-0000-0000-0000-000000000001', 'school-chemical', 'School of Chemical Engineering and Physical Sciences', 3, true),
  ('ba500005-0000-0000-0000-000000000004', 'c5000000-0000-0000-0000-000000000001', 'school-ca', 'School of Computer Applications', 4, true),
  ('ba500005-0000-0000-0000-000000000005', 'c5000000-0000-0000-0000-000000000001', 'school-cse', 'School of Computer Science and Engineering', 5, true),
  ('ba500005-0000-0000-0000-000000000006', 'c5000000-0000-0000-0000-000000000001', 'school-cai', 'School of Computing and Artificial Intelligence', 6, true),
  ('ba500005-0000-0000-0000-000000000007', 'c5000000-0000-0000-0000-000000000001', 'school-eee', 'School of Electronics and Electrical Engineering', 7, true),
  ('ba500005-0000-0000-0000-000000000008', 'c5000000-0000-0000-0000-000000000001', 'school-me', 'School of Mechanical Engineering', 8, true),
  
  -- Arts, Design & Architecture
  ('ba500005-0000-0000-0000-000000000009', 'c5000000-0000-0000-0000-000000000001', 'school-arch', 'Lovely School of Architecture and Design', 9, true),
  ('ba500005-0000-0000-0000-000000000010', 'c5000000-0000-0000-0000-000000000001', 'school-design-fashion', 'School of Design (Fashion Design & Technology)', 10, true),
  ('ba500005-0000-0000-0000-000000000011', 'c5000000-0000-0000-0000-000000000001', 'school-design-interior', 'School of Design (Interior & Product Design)', 11, true),
  ('ba500005-0000-0000-0000-000000000012', 'c5000000-0000-0000-0000-000000000001', 'school-design-multimedia', 'School of Design (Multimedia)', 12, true),
  ('ba500005-0000-0000-0000-000000000013', 'c5000000-0000-0000-0000-000000000001', 'school-arts-films', 'School of Liberal and Creative Arts (Films, Theatre and Music)', 13, true),
  ('ba500005-0000-0000-0000-000000000014', 'c5000000-0000-0000-0000-000000000001', 'school-arts-fine', 'School of Liberal and Creative Arts (Fine Arts)', 14, true),
  ('ba500005-0000-0000-0000-000000000015', 'c5000000-0000-0000-0000-000000000001', 'school-arts-journalism', 'School of Liberal and Creative Arts (Journalism and Mass Communication)', 15, true),
  ('ba500005-0000-0000-0000-000000000016', 'c5000000-0000-0000-0000-000000000001', 'school-arts-social', 'School of Liberal and Creative Arts (Social Sciences and Languages)', 16, true),

  -- Business, Law & Management
  ('ba500005-0000-0000-0000-000000000017', 'c5000000-0000-0000-0000-000000000001', 'school-business', 'Mittal School of Business', 17, true),
  ('ba500005-0000-0000-0000-000000000018', 'c5000000-0000-0000-0000-000000000001', 'school-agriculture', 'School of Agriculture', 18, true),
  ('ba500005-0000-0000-0000-000000000019', 'c5000000-0000-0000-0000-000000000001', 'school-hotel-tourism', 'School of Hotel Management and Tourism', 19, true),
  ('ba500005-0000-0000-0000-000000000020', 'c5000000-0000-0000-0000-000000000001', 'school-law', 'School of Law', 20, true),

  -- Health, Education & Professional
  ('ba500005-0000-0000-0000-000000000021', 'c5000000-0000-0000-0000-000000000001', 'school-medical', 'School of Allied Medical Sciences', 21, true),
  ('ba500005-0000-0000-0000-000000000022', 'c5000000-0000-0000-0000-000000000001', 'school-education', 'School of Education', 22, true),
  ('ba500005-0000-0000-0000-000000000023', 'c5000000-0000-0000-0000-000000000001', 'school-phys-ed', 'School of Education (Physical Education)', 23, true),
  ('ba500005-0000-0000-0000-000000000024', 'c5000000-0000-0000-0000-000000000001', 'school-pharma', 'School of Pharmaceutical Sciences', 24, true),
  ('ba500005-0000-0000-0000-000000000025', 'c5000000-0000-0000-0000-000000000001', 'school-polytechnic', 'School of Polytechnic', 25, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.6 Community Services
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('ba600006-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'donation-drives', 'Donation Drives', 1, true),
  ('ba600006-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000001', 'environment', 'Environment', 2, true),
  ('ba600006-0000-0000-0000-000000000003', 'c6000000-0000-0000-0000-000000000001', 'healthcare', 'Healthcare', 3, true),
  ('ba600006-0000-0000-0000-000000000004', 'c6000000-0000-0000-0000-000000000001', 'others', 'Others', 4, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.7 Day Celebrations
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('ba700007-0000-0000-0000-000000000001', 'c7000000-0000-0000-0000-000000000001', 'national-days', 'National Days', 1, true),
  ('ba700007-0000-0000-0000-000000000002', 'c7000000-0000-0000-0000-000000000001', 'cultural-days', 'Cultural Days', 2, true),
  ('ba700007-0000-0000-0000-000000000003', 'c7000000-0000-0000-0000-000000000001', 'fest-days', 'Fest Days', 3, true),
  ('ba700007-0000-0000-0000-000000000004', 'c7000000-0000-0000-0000-000000000001', 'awareness-days', 'Awareness Days', 4, true),
  ('ba700007-0000-0000-0000-000000000005', 'c7000000-0000-0000-0000-000000000001', 'others', 'Others', 5, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.8 Co-Curricular
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333', 'competitions', 'Competitions', 1, true),
  ('ba800008-0000-0000-0000-000000000001', 'c3333333-3333-3333-3333-333333333333', 'skill-dev', 'Skill Development', 2, true),
  ('ba800008-0000-0000-0000-000000000002', 'c3333333-3333-3333-3333-333333333333', 'certifications', 'Certifications', 3, true),
  ('ba800008-0000-0000-0000-000000000003', 'c3333333-3333-3333-3333-333333333333', 'training', 'Training Programs', 4, true),
  ('ba800008-0000-0000-0000-000000000004', 'c3333333-3333-3333-3333-333333333333', 'others', 'Others', 5, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.9 Student Clubs & Org
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('ba900009-0000-0000-0000-000000000001', 'c9000000-0000-0000-0000-000000000001', 'tech-clubs', 'Technical Clubs', 1, true),
  ('ba900009-0000-0000-0000-000000000002', 'c9000000-0000-0000-0000-000000000001', 'cultural-clubs', 'Cultural Clubs', 2, true),
  ('ba900009-0000-0000-0000-000000000003', 'c9000000-0000-0000-0000-000000000001', 'startup-clubs', 'Startup Clubs', 3, true),
  ('ba900009-0000-0000-0000-000000000004', 'c9000000-0000-0000-0000-000000000001', 'literary-clubs', 'Literary Clubs', 4, true),
  ('ba900009-0000-0000-0000-000000000005', 'c9000000-0000-0000-0000-000000000001', 'others', 'Others', 5, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.10 NCC
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('baa0000a-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'camps', 'Camps', 1, true),
  ('baa0000a-0000-0000-0000-000000000002', 'ca000000-0000-0000-0000-000000000001', 'training', 'Training', 2, true),
  ('baa0000a-0000-0000-0000-000000000003', 'ca000000-0000-0000-0000-000000000001', 'parades', 'Parades', 3, true),
  ('baa0000a-0000-0000-0000-000000000004', 'ca000000-0000-0000-0000-000000000001', 'others', 'Others', 4, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.11 NSS
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('bab0000b-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'social-work', 'Social Work', 1, true),
  ('bab0000b-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-000000000001', 'campaigns', 'Campaigns', 2, true),
  ('bab0000b-0000-0000-0000-000000000003', 'cb000000-0000-0000-0000-000000000001', 'awareness-drives', 'Awareness Drives', 3, true),
  ('bab0000b-0000-0000-0000-000000000004', 'cb000000-0000-0000-0000-000000000001', 'others', 'Others', 4, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.12 Fashion
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('bac0000c-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'shows', 'Shows', 1, true),
  ('bac0000c-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000001', 'exhibitions', 'Exhibitions', 2, true),
  ('bac0000c-0000-0000-0000-000000000003', 'cc000000-0000-0000-0000-000000000001', 'others', 'Others', 3, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.13 Others
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('bad0000d-0000-0000-0000-000000000001', 'cd000000-0000-0000-0000-000000000001', 'miscellaneous', 'Miscellaneous Events', 1, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;
