-- 20260814000014_expand_categories_and_subcategories.sql
-- Expand comprehensive category and subcategory taxonomy for LPU Events

-- 1. Upsert All Primary Categories
insert into public.categories (id, key, name, sort_order, is_active)
values
  ('c1111111-1111-1111-1111-111111111111', 'tech', 'Technical & Coding', 1, true),
  ('c2222222-2222-2222-2222-222222222222', 'cultural', 'Cultural & Fests', 2, true),
  ('c4444444-4444-4444-4444-444444444444', 'workshops', 'Workshops & Seminars', 3, true),
  ('c3333333-3333-3333-3333-333333333333', 'sports', 'Sports & Athletics', 4, true),
  ('c5555555-5555-5555-5555-555555555555', 'esports', 'Gaming & Esports', 5, true),
  ('c6666666-6666-6666-6666-666666666666', 'business', 'Management & Entrepreneurship', 6, true),
  ('c7777777-7777-7777-7777-777777777777', 'academic', 'Academic, Conferences & Research', 7, true),
  ('c8888888-8888-8888-8888-888888888888', 'social', 'Social Welfare & Community', 8, true),
  ('c9999999-9999-9999-9999-999999999999', 'career', 'Career & Placements', 9, true),
  ('caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'health', 'Health, Fitness & Yoga', 10, true)
on conflict (id) do update set
  name = excluded.name,
  key = excluded.key,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2. Upsert Comprehensive Subcategories

-- 2.1 Technical & Coding (c1111111-1111-1111-1111-111111111111)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'hackathons', 'Hackathons & Datathons', 1, true),
  ('b2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'robotics', 'Robotics & AI / IoT', 2, true),
  ('b1010001-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', 'web-app', 'Web & App Development', 3, true),
  ('b1010001-0000-0000-0000-000000000002', 'c1111111-1111-1111-1111-111111111111', 'cybersecurity', 'Cybersecurity & CTF', 4, true),
  ('b1010001-0000-0000-0000-000000000003', 'c1111111-1111-1111-1111-111111111111', 'competitive-coding', 'Competitive Programming', 5, true),
  ('b1010001-0000-0000-0000-000000000004', 'c1111111-1111-1111-1111-111111111111', 'cloud-devops', 'Cloud Computing & DevOps', 6, true),
  ('b1010001-0000-0000-0000-000000000005', 'c1111111-1111-1111-1111-111111111111', 'blockchain', 'Blockchain & Web3', 7, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.2 Cultural & Fests (c2222222-2222-2222-2222-222222222222)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b3333333-3333-3333-3333-333333333333', 'c2222222-2222-2222-2222-222222222222', 'music-singing', 'Music, Bands & Singing', 1, true),
  ('b2020002-0000-0000-0000-000000000001', 'c2222222-2222-2222-2222-222222222222', 'dance', 'Dance (Classical, Western & Folk)', 2, true),
  ('b2020002-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', 'theatre', 'Theatre, Drama & Skit', 3, true),
  ('b2020002-0000-0000-0000-000000000003', 'c2222222-2222-2222-2222-222222222222', 'fashion', 'Fashion Shows & Pageants', 4, true),
  ('b2020002-0000-0000-0000-000000000004', 'c2222222-2222-2222-2222-222222222222', 'fine-arts', 'Fine Arts, Painting & Photography', 5, true),
  ('b2020002-0000-0000-0000-000000000005', 'c2222222-2222-2222-2222-222222222222', 'debate-mun', 'Literary, Debate & Model UN', 6, true),
  ('b2020002-0000-0000-0000-000000000006', 'c2222222-2222-2222-2222-222222222222', 'standup-comedy', 'Standup Comedy & Open Mic', 7, true),
  ('b2020002-0000-0000-0000-000000000007', 'c2222222-2222-2222-2222-222222222222', 'carnivals', 'Campus Carnivals & DJ Nights', 8, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.3 Workshops & Seminars (c4444444-4444-4444-4444-444444444444)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b5555555-5555-5555-5555-555555555555', 'c4444444-4444-4444-4444-444444444444', 'ai-ml', 'AI, ML & Generative AI Labs', 1, true),
  ('b4040004-0000-0000-0000-000000000001', 'c4444444-4444-4444-4444-444444444444', 'fullstack', 'Full-Stack Web & Mobile Dev', 2, true),
  ('b4040004-0000-0000-0000-000000000002', 'c4444444-4444-4444-4444-444444444444', 'ui-ux', 'UI/UX & Product Design', 3, true),
  ('b4040004-0000-0000-0000-000000000003', 'c4444444-4444-4444-4444-444444444444', 'embedded-iot', 'Embedded Systems & Hardware IoT', 4, true),
  ('b4040004-0000-0000-0000-000000000004', 'c4444444-4444-4444-4444-444444444444', 'finance-trading', 'Stock Market, Trading & Fintech', 5, true),
  ('b4040004-0000-0000-0000-000000000005', 'c4444444-4444-4444-4444-444444444444', 'content-writing', 'Creative Content & Digital Marketing', 6, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.4 Sports & Athletics (c3333333-3333-3333-3333-333333333333)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333', 'indoor', 'Chess, Table Tennis & Carrom', 1, true),
  ('b3030003-0000-0000-0000-000000000001', 'c3333333-3333-3333-3333-333333333333', 'cricket', 'Cricket Tournaments', 2, true),
  ('b3030003-0000-0000-0000-000000000002', 'c3333333-3333-3333-3333-333333333333', 'football-futsal', 'Football & Futsal League', 3, true),
  ('b3030003-0000-0000-0000-000000000003', 'c3333333-3333-3333-3333-333333333333', 'court-sports', 'Basketball, Volleyball & Badminton', 4, true),
  ('b3030003-0000-0000-0000-000000000004', 'c3333333-3333-3333-3333-333333333333', 'athletics', 'Athletics & Track Events', 5, true),
  ('b3030003-0000-0000-0000-000000000005', 'c3333333-3333-3333-3333-333333333333', 'martial-arts', 'Martial Arts, Boxing & Taekwondo', 6, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.5 Gaming & Esports (c5555555-5555-5555-5555-555555555555)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b5050005-0000-0000-0000-000000000001', 'c5555555-5555-5555-5555-555555555555', 'pc-esports', 'PC Esports (Valorant, CS2, DOTA 2)', 1, true),
  ('b5050005-0000-0000-0000-000000000002', 'c5555555-5555-5555-5555-555555555555', 'mobile-esports', 'Mobile Gaming (BGMI, Free Fire, CODM)', 2, true),
  ('b5050005-0000-0000-0000-000000000003', 'c5555555-5555-5555-5555-555555555555', 'console-gaming', 'Console & Fighting Games (FIFA, Tekken)', 3, true),
  ('b5050005-0000-0000-0000-000000000004', 'c5555555-5555-5555-5555-555555555555', 'sim-racing', 'Sim Racing & VR Arenas', 4, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.6 Management & Entrepreneurship (c6666666-6666-6666-6666-666666666666)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b6060006-0000-0000-0000-000000000001', 'c6666666-6666-6666-6666-666666666666', 'startup-pitch', 'Shark Tank & Startup Pitches', 1, true),
  ('b6060006-0000-0000-0000-000000000002', 'c6666666-6666-6666-6666-666666666666', 'case-study', 'Case Study Competitions', 2, true),
  ('b6060006-0000-0000-0000-000000000003', 'c6666666-6666-6666-6666-666666666666', 'b-plan', 'Business Plan Expos', 3, true),
  ('b6060006-0000-0000-0000-000000000004', 'c6666666-6666-6666-6666-666666666666', 'leadership-summit', 'Leadership & Executive Summits', 4, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.7 Academic, Conferences & Research (c7777777-7777-7777-7777-777777777777)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b7070007-0000-0000-0000-000000000001', 'c7777777-7777-7777-7777-777777777777', 'conferences', 'International Research Conferences', 1, true),
  ('b7070007-0000-0000-0000-000000000002', 'c7777777-7777-7777-7777-777777777777', 'guest-lectures', 'Distinguished Guest Lectures', 2, true),
  ('b7070007-0000-0000-0000-000000000003', 'c7777777-7777-7777-7777-777777777777', 'project-expo', 'Capstone & Research Project Expos', 3, true),
  ('b7070007-0000-0000-0000-000000000004', 'c7777777-7777-7777-7777-777777777777', 'olympiads', 'Academic Olympiads & Quizzes', 4, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.8 Social Welfare & Community (c8888888-8888-8888-8888-888888888888)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b8080008-0000-0000-0000-000000000001', 'c8888888-8888-8888-8888-888888888888', 'blood-donation', 'Blood Donation & Health Drives', 1, true),
  ('b8080008-0000-0000-0000-000000000002', 'c8888888-8888-8888-8888-888888888888', 'green-campus', 'Tree Plantation & Cleanliness Drives', 2, true),
  ('b8080008-0000-0000-0000-000000000003', 'c8888888-8888-8888-8888-888888888888', 'ngo-outreach', 'NGO & Rural Outreach Initiatives', 3, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.9 Career & Placements (c9999999-9999-9999-9999-999999999999)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('b9090009-0000-0000-0000-000000000001', 'c9999999-9999-9999-9999-999999999999', 'mock-interviews', 'Placement Prep & Mock Interviews', 1, true),
  ('b9090009-0000-0000-0000-000000000002', 'c9999999-9999-9999-9999-999999999999', 'resume-linkedin', 'Resume & LinkedIn Optimization', 2, true),
  ('b9090009-0000-0000-0000-000000000003', 'c9999999-9999-9999-9999-999999999999', 'alumni-talks', 'Alumni Mentorship & Talks', 3, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;

-- 2.10 Health, Fitness & Yoga (caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)
insert into public.subcategories (id, category_id, key, name, sort_order, is_active)
values
  ('ba0a000a-0000-0000-0000-000000000001', 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'yoga', 'Yoga & Meditation Camps', 1, true),
  ('ba0a000a-0000-0000-0000-000000000002', 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'marathons', 'Marathons, Cyclothons & Crossfit', 2, true),
  ('ba0a000a-0000-0000-0000-000000000003', 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mental-health', 'Mental Health & Stress Relief', 3, true)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  is_active = true;
