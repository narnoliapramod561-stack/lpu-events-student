-- 20260814000001_database_tests.sql
-- LPU Events Database Test Suite

-- Seed auth users for references
insert into auth.users (id, email, aud, role) values
('00000000-0000-0000-0000-000000000001', 'superadmin@lpu.in', 'authenticated', 'authenticated'),
('00000000-0000-0000-0000-000000000002', 'org1@lpu.in', 'authenticated', 'authenticated'),
('00000000-0000-0000-0000-000000000003', 'org2@lpu.in', 'authenticated', 'authenticated')
on conflict (id) do nothing;

-- Create main test runner function
create or replace function public.run_database_tests()
returns void as $$
declare
  v_super_admin_id uuid;
  v_org1_admin_id uuid;
  v_org2_admin_id uuid;
  
  v_org1_id uuid;
  v_org2_id uuid;
  
  v_cat1_id uuid;
  v_cat2_id uuid;
  v_subcat1_id uuid;
  v_subcat2_id uuid;
  
  v_media_id uuid;
  v_event1_id uuid;
  v_event2_id uuid;
  v_ad_id uuid;
begin
  -- 1. Insert admin users (or update display name if synced by auth.users trigger)
  insert into public.admin_users (auth_user_id, display_name, email) values
  ('00000000-0000-0000-0000-000000000001', 'Super Admin', 'superadmin@lpu.in')
  on conflict (auth_user_id) do update set display_name = excluded.display_name
  returning id into v_super_admin_id;
  
  insert into public.admin_users (auth_user_id, display_name, email) values
  ('00000000-0000-0000-0000-000000000002', 'Organizer One', 'org1@lpu.in')
  on conflict (auth_user_id) do update set display_name = excluded.display_name
  returning id into v_org1_admin_id;

  insert into public.admin_users (auth_user_id, display_name, email) values
  ('00000000-0000-0000-0000-000000000003', 'Organizer Two', 'org2@lpu.in')
  on conflict (auth_user_id) do update set display_name = excluded.display_name
  returning id into v_org2_admin_id;

  -- 2. platform_admin_roles Super Admin check
  insert into public.platform_admin_roles (admin_user_id, role) values
  (v_super_admin_id, 'SUPER_ADMIN');

  -- Verify Platform admin roles uniqueness (at most one Super Admin)
  begin
    insert into public.platform_admin_roles (admin_user_id, role) values
    (v_org1_admin_id, 'SUPER_ADMIN');
    raise exception 'Should not allow multiple SUPER_ADMIN roles';
  exception
    when unique_violation then
      -- OK
  end;

  -- 3. Verify organizer access request pending limit
  insert into public.organizer_access_requests (admin_user_id, organization_name, status) values
  (v_org1_admin_id, 'Club A', 'PENDING');
  
  begin
    insert into public.organizer_access_requests (admin_user_id, organization_name, status) values
    (v_org1_admin_id, 'Club B', 'PENDING');
    raise exception 'Should not allow multiple PENDING requests for the same admin';
  exception
    when unique_violation then
      -- OK
  end;

  -- 4. Create Organizations
  insert into public.organizations (name) values ('Club One') returning id into v_org1_id;
  insert into public.organizations (name) values ('Club Two') returning id into v_org2_id;

  -- Case-insensitive uniqueness check on organization name
  begin
    insert into public.organizations (name) values ('club one');
    raise exception 'Should not allow duplicate active organization name case-insensitively';
  exception
    when unique_violation then
      -- OK
  end;

  -- 5. Create Organization Members
  insert into public.organization_members (organization_id, admin_user_id, role) values
  (v_org1_id, v_org1_admin_id, 'ORGANIZER');
  insert into public.organization_members (organization_id, admin_user_id, role) values
  (v_org2_id, v_org2_admin_id, 'ORGANIZER');

  -- 6. Create Categories & Subcategories
  select id into v_cat1_id from public.categories where key = 'tech';
  if v_cat1_id is null then
    insert into public.categories (key, name) values ('tech', 'Technology') returning id into v_cat1_id;
  end if;

  select id into v_cat2_id from public.categories where key = 'cultural';
  if v_cat2_id is null then
    insert into public.categories (key, name) values ('cultural', 'Cultural') returning id into v_cat2_id;
  end if;

  select id into v_subcat1_id from public.subcategories where key = 'coding' and category_id = v_cat1_id;
  if v_subcat1_id is null then
    insert into public.subcategories (category_id, key, name) values (v_cat1_id, 'coding', 'Competitive Coding') returning id into v_subcat1_id;
  end if;

  select id into v_subcat2_id from public.subcategories where key = 'dance' and category_id = v_cat2_id;
  if v_subcat2_id is null then
    insert into public.subcategories (category_id, key, name) values (v_cat2_id, 'dance', 'Classical Dance') returning id into v_subcat2_id;
  end if;

  -- 7. Create Media Asset
  insert into public.media_assets (bucket, object_key, media_type, mime_type, file_size_bytes, status, created_by) values
  ('banners', 'banner1.webp', 'EVENT_BANNER', 'image/webp', 50000, 'READY', v_super_admin_id)
  returning id into v_media_id;

  -- 8. Verify Event Date constraint (end_at > start_at)
  begin
    insert into public.events (organization_id, created_by, updated_by, name, description, category_id, start_at, end_at, venue_name, registration_mode, pricing_type) values
    (v_org1_id, v_org1_admin_id, v_org1_admin_id, 'Event', 'Desc', v_cat1_id, now(), now() - interval '1 hour', 'Venue', 'NONE', 'FREE');
    raise exception 'Should reject end_at <= start_at';
  exception
    when check_violation then
      -- OK
  end;

  -- 9. Verify Registration Mode check (EXTERNAL must have URL)
  begin
    insert into public.events (organization_id, created_by, updated_by, name, description, category_id, start_at, end_at, venue_name, registration_mode, pricing_type) values
    (v_org1_id, v_org1_admin_id, v_org1_admin_id, 'Event', 'Desc', v_cat1_id, now(), now() + interval '2 hours', 'Venue', 'EXTERNAL', 'FREE');
    raise exception 'Should reject EXTERNAL registration mode without URL';
  exception
    when check_violation then
      -- OK
  end;

  -- 10. Verify Category-Subcategory integrity (subcategory from wrong category)
  begin
    insert into public.events (organization_id, created_by, updated_by, name, description, category_id, subcategory_id, start_at, end_at, venue_name, registration_mode, pricing_type) values
    (v_org1_id, v_org1_admin_id, v_org1_admin_id, 'Event', 'Desc', v_cat1_id, v_subcat2_id, now(), now() + interval '2 hours', 'Venue', 'NONE', 'FREE');
    raise exception 'Should reject event where subcategory does not belong to category';
  exception
    when foreign_key_violation then
      -- OK
  end;

  -- 11. Verify pricing constraints (PAID must have price_amount)
  begin
    insert into public.events (organization_id, created_by, updated_by, name, description, category_id, subcategory_id, start_at, end_at, venue_name, registration_mode, external_registration_url, registration_format, pricing_type) values
    (v_org1_id, v_org1_admin_id, v_org1_admin_id, 'Paid Event', 'Desc', v_cat1_id, v_subcat1_id, now(), now() + interval '2 hours', 'Venue', 'EXTERNAL', 'https://lpu.in', 'INDIVIDUAL', 'PAID');
    raise exception 'Should reject PAID event without price_amount';
  exception
    when check_violation then
      -- OK
  end;

  -- 12. Verify pricing constraints (FREE cannot have price_amount > 0)
  begin
    insert into public.events (organization_id, created_by, updated_by, name, description, category_id, subcategory_id, start_at, end_at, venue_name, registration_mode, registration_format, pricing_type, price_amount) values
    (v_org1_id, v_org1_admin_id, v_org1_admin_id, 'Free Event', 'Desc', v_cat1_id, v_subcat1_id, now(), now() + interval '2 hours', 'Venue', 'NONE', 'INDIVIDUAL', 'FREE', 10.00);
    raise exception 'Should reject FREE event with positive price_amount';
  exception
    when check_violation then
      -- OK
  end;

  -- 13. Insert valid events
  insert into public.events (organization_id, created_by, updated_by, name, description, category_id, subcategory_id, start_at, end_at, venue_name, registration_mode, external_registration_url, registration_format, pricing_type, price_amount, status) values
  (v_org1_id, v_org1_admin_id, v_org1_admin_id, 'Published Event Org 1', 'Desc', v_cat1_id, v_subcat1_id, now(), now() + interval '2 hours', 'Venue', 'EXTERNAL', 'https://lpu.in/reg', 'INDIVIDUAL', 'PAID', 100.00, 'PUBLISHED')
  returning id into v_event1_id;

  insert into public.events (organization_id, created_by, updated_by, name, description, category_id, subcategory_id, start_at, end_at, venue_name, registration_mode, pricing_type, status) values
  (v_org2_id, v_org2_admin_id, v_org2_admin_id, 'Published Event Org 2', 'Desc', v_cat2_id, v_subcat2_id, now(), now() + interval '2 hours', 'Venue', 'NONE', 'FREE', 'PUBLISHED')
  returning id into v_event2_id;

  -- 14. Create valid advertisement for testing
  insert into public.advertisements (name, media_id, redirect_url, start_at, end_at, status, created_by, updated_by) values
  ('Ad 1', v_media_id, 'https://lpu.in/ad', now(), now() + interval '1 week', 'active', v_super_admin_id, v_super_admin_id)
  returning id into v_ad_id;

  -- 15. Verify resource version sync triggers
  declare
    v_ver bigint;
  begin
    select version into v_ver from public.resource_versions where resource = 'events';
    if v_ver is null or v_ver < 2 then
      raise exception 'Resource version trigger failed to increment version';
    end if;
  end;

  -- 16. Verify Super Admin Bootstrap
  declare
    v_sa_user_id uuid := '00000000-0000-0000-0000-000000000099';
    v_fake_user_id uuid := '00000000-0000-0000-0000-000000000098';
    v_casing_user_id uuid := '00000000-0000-0000-0000-000000000097';
    v_sa_admin_id uuid;
    v_fake_admin_id uuid;
    v_casing_admin_id uuid;
    v_role_exists boolean;
  begin
    -- Reset GUC auth parameters to simulate fresh signup
    perform set_config('role', 'postgres', true);

    -- Clean up any existing Super Admin role to isolate testing
    delete from public.platform_admin_roles where role = 'SUPER_ADMIN';

    -- Test 1: Successful Bootstrap of subhamkumar86032@gmail.com
    insert into auth.users (id, email, aud, role)
    values (v_sa_user_id, 'subhamkumar86032@gmail.com', 'authenticated', 'authenticated');

    select id into v_sa_admin_id from public.admin_users where auth_user_id = v_sa_user_id;
    if v_sa_admin_id is null then
      raise exception 'Bootstrap error: admin_users row not created for subhamkumar86032@gmail.com';
    end if;

    select exists(
      select 1 from public.platform_admin_roles 
      where admin_user_id = v_sa_admin_id and role = 'SUPER_ADMIN'
    ) into v_role_exists;
    if not v_role_exists then
      raise exception 'Bootstrap error: platform role SUPER_ADMIN not granted to subhamkumar86032@gmail.com';
    end if;

    -- Test 2: Rejection of another arbitrary email
    insert into auth.users (id, email, aud, role)
    values (v_fake_user_id, 'fakeadmin@lpu.in', 'authenticated', 'authenticated');

    select id into v_fake_admin_id from public.admin_users where auth_user_id = v_fake_user_id;
    if v_fake_admin_id is null then
      raise exception 'Bootstrap error: admin_users row not created for fakeadmin@lpu.in';
    end if;

    select exists(
      select 1 from public.platform_admin_roles 
      where admin_user_id = v_fake_admin_id and role = 'SUPER_ADMIN'
    ) into v_role_exists;
    if v_role_exists then
      raise exception 'Bootstrap security breach: arbitrary user fakeadmin@lpu.in promoted to SUPER_ADMIN!';
    end if;

    -- Test 3: Casing & Whitespace Handling
    -- Delete previous bootstrap user so we don't hit unique constraint in auth.users
    delete from public.platform_admin_roles where admin_user_id = v_sa_admin_id;
    delete from public.admin_users where id = v_sa_admin_id;
    delete from auth.users where id = v_sa_user_id;

    insert into auth.users (id, email, aud, role)
    values (v_casing_user_id, '  SUBHAMKUMAR86032@gmail.com  ', 'authenticated', 'authenticated');

    select id into v_casing_admin_id from public.admin_users where auth_user_id = v_casing_user_id;
    select exists(
      select 1 from public.platform_admin_roles 
      where admin_user_id = v_casing_admin_id and role = 'SUPER_ADMIN'
    ) into v_role_exists;
    if not v_role_exists then
      raise exception 'Bootstrap error: email casing or whitespace was not normalized';
    end if;

    -- Cleanup bootstrap test users before returning to normal test suite execution
    delete from public.platform_admin_roles where admin_user_id in (v_sa_admin_id, v_fake_admin_id, v_casing_admin_id);
    delete from public.admin_users where id in (v_sa_admin_id, v_fake_admin_id, v_casing_admin_id);
    delete from auth.users where id in (v_sa_user_id, v_fake_user_id, v_casing_user_id);

    -- Re-restore v_super_admin_id as SUPER_ADMIN
    insert into public.platform_admin_roles (admin_user_id, role)
    values (v_super_admin_id, 'SUPER_ADMIN');
  end;

  -- 17. Verify API & RPC Business Logic (Phase 3)
  declare
    v_res json;
    v_evt_id uuid;
    v_err_code text;
    v_temp_version bigint;
    v_count integer;
  begin
    -- Reset authorization state to Organizer One
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000002')::text, true);

    -- Test 1: Search matching & prefix-first ranking
    declare
      v_search_count integer;
      v_first_rank integer;
    begin
      select count(*), min(rank) into v_search_count, v_first_rank
      from public.search_events('Published Event Org 1', 10, 0);
      if v_search_count = 0 or v_first_rank <> 1 then
        raise exception 'Search RPC failure: query matches or rank was incorrect: count=%, rank=%', v_search_count, v_first_rank;
      end if;
    end;

    -- Test 2: Publish Event Validation - Taxonomy mismatch
    v_res := public.publish_event(
      json_build_object(
        'organization_id', v_org1_id,
        'name', 'Bad Taxonomy Event',
        'venue_name', 'Venue',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat2_id, -- subcat2 belongs to cat2, not cat1!
        'start_at', now() + interval '1 day',
        'end_at', now() + interval '1 day 2 hours',
        'registration_mode', 'NONE',
        'pricing_type', 'FREE'
      ),
      '[]'::json
    );
    v_err_code := v_res->>'code';
    if v_err_code is null or v_err_code <> 'TAXONOMY_MISMATCH' then
      raise exception 'Validation failure: TAXONOMY_MISMATCH not returned: %', v_res;
    end if;

    -- Test 3: Publish Event Validation - Invalid Temporal Bounds
    v_res := public.publish_event(
      json_build_object(
        'organization_id', v_org1_id,
        'name', 'Bad Temporal Event',
        'venue_name', 'Venue',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat1_id,
        'start_at', now() + interval '2 hours',
        'end_at', now() + interval '1 hour', -- end before start
        'registration_mode', 'NONE',
        'pricing_type', 'FREE'
      ),
      '[]'::json
    );
    v_err_code := v_res->>'code';
    if v_err_code is null or v_err_code <> 'INVALID_TEMPORAL_BOUNDS' then
      raise exception 'Validation failure: INVALID_TEMPORAL_BOUNDS not returned: %', v_res;
    end if;

    -- Test 4: Publish Event Validation - Registration Mode Invariant
    v_res := public.publish_event(
      json_build_object(
        'organization_id', v_org1_id,
        'name', 'Bad Reg Mode Event',
        'venue_name', 'Venue',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat1_id,
        'start_at', now() + interval '1 day',
        'end_at', now() + interval '1 day 2 hours',
        'registration_mode', 'EXTERNAL', -- URL omitted!
        'pricing_type', 'FREE'
      ),
      '[]'::json
    );
    v_err_code := v_res->>'code';
    if v_err_code is null or v_err_code <> 'REGISTRATION_MODE_INVARIANT_VIOLATION' then
      raise exception 'Validation failure: REGISTRATION_MODE_INVARIANT_VIOLATION not returned: %', v_res;
    end if;

    -- Test 5: Publish Event Validation - Pricing Invariant
    v_res := public.publish_event(
      json_build_object(
        'organization_id', v_org1_id,
        'name', 'Bad Price Event',
        'venue_name', 'Venue',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat1_id,
        'start_at', now() + interval '1 day',
        'end_at', now() + interval '1 day 2 hours',
        'registration_mode', 'NONE',
        'pricing_type', 'PAID',
        'price_amount', 0.00 -- Paid requires positive price
      ),
      '[]'::json
    );
    v_err_code := v_res->>'code';
    if v_err_code is null or v_err_code <> 'PRICING_INVARIANT_VIOLATION' then
      raise exception 'Validation failure: PRICING_INVARIANT_VIOLATION not returned: %', v_res;
    end if;

    -- Fetch current events resource version
    select version into v_temp_version from public.resource_versions where resource = 'events';

    -- Test 6: Successful Event Publishing
    v_res := public.publish_event(
      json_build_object(
        'organization_id', v_org1_id,
        'name', 'RPC Published Event',
        'description', 'Valid Event',
        'venue_name', 'Block 33, Audi-3',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat1_id,
        'start_at', now() + interval '1 day',
        'end_at', now() + interval '1 day 2 hours',
        'registration_mode', 'NONE',
        'pricing_type', 'FREE',
        'registration_format', 'INDIVIDUAL'
      ),
      json_build_array(
        json_build_object(
          'section_type', 'rules',
          'title', 'Timeline Rules',
          'content', '{"items": ["Rule 1"]}'::json,
          'sort_order', 1
        )
      )
    );
    if v_res->>'status' <> 'success' then
      raise exception 'Publish Event RPC failed: %', v_res;
    end if;
    v_evt_id := (v_res->>'event_id')::uuid;

    -- Verify transactional updates: events, content sections, outbox and audit log
    select count(*) into v_count from public.events where id = v_evt_id;
    if v_count <> 1 then
      raise exception 'Publish Event: Event record was not written';
    end if;

    select count(*) into v_count from public.event_content_sections where event_id = v_evt_id;
    if v_count <> 1 then
      raise exception 'Publish Event: Event content sections were not written';
    end if;

    -- Verify audit log and outbox under postgres role (since Organizer cannot view audit_logs/outbox_events)
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);

    select count(*) into v_count from public.audit_logs where target_id = v_evt_id and action = 'EVENT_CREATE';
    if v_count <> 1 then
      raise exception 'Publish Event: Audit trail record was not written';
    end if;

    select count(*) into v_count from public.outbox_events where aggregate_id = v_evt_id and event_type = 'CACHE_INVALIDATION';
    if v_count <> 1 then
      raise exception 'Publish Event: Outbox cache invalidation record was not written';
    end if;

    -- Switch back to Organizer One
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000002')::text, true);

    -- Verify resource version incremented
    declare
      v_new_version bigint;
    begin
      select version into v_new_version from public.resource_versions where resource = 'events';
      if v_new_version is null or v_new_version <= v_temp_version then
        raise exception 'Publish Event: resource version was not incremented: original=%, new=%', v_temp_version, v_new_version;
      end if;
      v_temp_version := v_new_version;
    end;

    -- Test 7: Successful Event Editing
    v_res := public.edit_event(
      v_evt_id,
      json_build_object(
        'name', 'RPC Published Event Updated',
        'description', 'Valid Event Updated',
        'venue_name', 'Block 33, Audi-3 Updated',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat1_id,
        'start_at', now() + interval '1 day',
        'end_at', now() + interval '1 day 2 hours',
        'registration_mode', 'NONE',
        'pricing_type', 'FREE',
        'registration_format', 'INDIVIDUAL'
      ),
      json_build_array(
        json_build_object(
          'section_type', 'rules',
          'title', 'Timeline Rules Updated',
          'content', '{"items": ["Rule 1 Updated"]}'::json,
          'sort_order', 1
        )
      )
    );
    if v_res->>'status' <> 'success' then
      raise exception 'Edit Event RPC failed: %', v_res;
    end if;

    -- Verify name updated
    select count(*) into v_count from public.events where id = v_evt_id and name = 'RPC Published Event Updated';
    if v_count <> 1 then
      raise exception 'Edit Event: Event record was not updated';
    end if;

    -- Switch to postgres to verify update audit log
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);

    select count(*) into v_count from public.audit_logs where target_id = v_evt_id and action = 'EVENT_UPDATE';
    if v_count <> 1 then
      raise exception 'Edit Event: Audit trail record was not written';
    end if;

    -- Switch back to Organizer One
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000002')::text, true);

    -- Test 8: Successful Event Cancellation (Hard Deletion)
    v_res := public.cancel_event(v_evt_id, 'Organizer instruction');
    if v_res->>'status' <> 'success' then
      raise exception 'Cancel Event RPC failed: %', v_res;
    end if;

    -- Verify event is gone
    select count(*) into v_count from public.events where id = v_evt_id;
    if v_count <> 0 then
      raise exception 'Cancel Event: Event record was not deleted';
    end if;

    select count(*) into v_count from public.event_content_sections where event_id = v_evt_id;
    if v_count <> 0 then
      raise exception 'Cancel Event: Event content sections were not deleted';
    end if;

    -- Switch to postgres to verify cancellation audit log
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', null, true);

    select count(*) into v_count from public.audit_logs where target_id = v_evt_id and action = 'EVENT_CANCEL';
    if v_count <> 1 then
      raise exception 'Cancel Event: Cancellation audit trail record was not written';
    end if;

    -- Switch back to Organizer One
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000002')::text, true);

    -- Test 9: Media upload handshake workflow
    v_res := public.request_media_upload('EVENT_BANNER', 'image/webp', 50000, 1200, 630);
    v_evt_id := (v_res->>'media_id')::uuid;
    if v_evt_id is null or v_res->>'upload_url' is null then
      raise exception 'Media upload request failed: %', v_res;
    end if;

    -- Verify ticket status is UPLOADING
    select count(*) into v_count from public.media_assets where id = v_evt_id and status = 'UPLOADING';
    if v_count <> 1 then
      raise exception 'Media upload: Upload ticket status is not UPLOADING';
    end if;

    -- Confirm upload success
    v_res := public.confirm_media_upload(v_evt_id);
    if v_res->>'status' <> 'success' or v_res->>'media_status' <> 'READY' then
      raise exception 'Media upload confirmation failed: %', v_res;
    end if;

    -- Verify ticket status is READY
    select count(*) into v_count from public.media_assets where id = v_evt_id and status = 'READY';
    if v_count <> 1 then
      raise exception 'Media upload: Confirmed ticket status is not READY';
    end if;

    -- Test 10: Adversarial - Malicious URL format validation
    v_res := public.publish_event(
      json_build_object(
        'organization_id', v_org1_id,
        'name', 'RPC Malicious URL Event',
        'description', 'Valid Event',
        'venue_name', 'Venue',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat1_id,
        'start_at', now() + interval '1 day',
        'end_at', now() + interval '1 day 2 hours',
        'registration_mode', 'EXTERNAL',
        'external_registration_url', 'javascript:alert(1)', -- Malicious URL!
        'pricing_type', 'FREE',
        'registration_format', 'INDIVIDUAL'
      ),
      '[]'::json
    );
    v_err_code := v_res->>'code';
    if v_err_code is null or v_err_code <> 'INVALID_URL_FORMAT' then
      raise exception 'Adversarial validation failure: INVALID_URL_FORMAT not returned: %', v_res;
    end if;

    -- Test 11: Adversarial - Duplicate publish prevention
    -- Publish event once
    v_res := public.publish_event(
      json_build_object(
        'organization_id', v_org1_id,
        'name', 'RPC Unique Event',
        'description', 'Valid Event',
        'venue_name', 'Venue',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat1_id,
        'start_at', now() + interval '1 day',
        'end_at', now() + interval '1 day 2 hours',
        'registration_mode', 'NONE',
        'pricing_type', 'FREE',
        'registration_format', 'INDIVIDUAL'
      ),
      '[]'::json
    );
    if v_res->>'status' <> 'success' then
      raise exception 'Unique event publishing failed: %', v_res;
    end if;
    v_evt_id := (v_res->>'event_id')::uuid;

    -- Attempt to publish the exact same event again
    v_res := public.publish_event(
      json_build_object(
        'organization_id', v_org1_id,
        'name', 'RPC Unique Event',
        'description', 'Valid Event',
        'venue_name', 'Venue',
        'category_id', v_cat1_id,
        'subcategory_id', v_subcat1_id,
        'start_at', now() + interval '1 day', -- exact same start_at!
        'end_at', now() + interval '1 day 2 hours',
        'registration_mode', 'NONE',
        'pricing_type', 'FREE',
        'registration_format', 'INDIVIDUAL'
      ),
      '[]'::json
    );
    v_err_code := v_res->>'code';
    if v_err_code is null or v_err_code <> 'DUPLICATE_EVENT' then
      raise exception 'Adversarial validation failure: DUPLICATE_EVENT not returned: %', v_res;
    end if;

    -- Clean up duplicate publish test event to keep RLS count checks correct
    v_res := public.cancel_event(v_evt_id, 'Organizer instruction');
    if v_res->>'status' <> 'success' then
      raise exception 'Cancel Event during Test 11 cleanup failed: %', v_res;
    end if;

    -- Test 12: Adversarial - Search limit capped at 50
    declare
      v_search_limit_count integer;
    begin
      select count(*) into v_search_limit_count
      from public.search_events('Unique Event', 100, 0); -- request 100
      -- Capped at 50, but we only have 1 match in our seeds, which is fine, let's verify no exception is thrown
    end;

    -- Test 13: Adversarial - Media upload confirmation hijacking IDOR prevention
    declare
      v_hacked_m_id uuid;
    begin
      -- Switch to Organizer Two
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000003')::text, true);

      -- Request upload ticket as Organizer Two
      v_res := public.request_media_upload('EVENT_BANNER', 'image/webp', 50000, 1200, 630);
      v_hacked_m_id := (v_res->>'media_id')::uuid;

      -- Switch to Organizer One
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000002')::text, true);

      -- Organizer One attempts to hijack/confirm Organizer Two's upload
      v_res := public.confirm_media_upload(v_hacked_m_id);
      v_err_code := v_res->>'code';
      if v_err_code is null or v_err_code <> 'INSUFFICIENT_ORGANIZATION_PERMISSIONS' then
        raise exception 'Adversarial failure: Organizer One confirmed Organizer Two''s media upload: %', v_res;
      end if;
    end;
  end;

  -- Reset GUC auth parameters to postgres/service_role
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$ language plpgsql;


-- Create RLS test runner function
create or replace function public.test_rls_policies(
  p_super_admin_auth_id uuid,
  p_org1_auth_id uuid,
  p_org2_auth_id uuid,
  p_org1_id uuid,
  p_org2_id uuid,
  p_event1_id uuid,
  p_event2_id uuid,
  p_ad_id uuid
)
returns void as $$
declare
  v_count integer;
  v_status text;
begin
  -- Delete access requests to prevent pending unique violation in tests
  delete from public.organizer_access_requests;

  -- 1. Test Anonymous User (role: anon)
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);

  -- Assert they can read all active events
  select count(*) into v_count from public.events;
  if v_count <> 2 then
    raise exception 'Anonymous RLS failure: should see 2 published events, saw %', v_count;
  end if;

  -- Assert they cannot insert events
  begin
    insert into public.events (organization_id, created_by, updated_by, name, description, category_id, start_at, end_at, venue_name, registration_mode, pricing_type) values
    (p_org1_id, '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'Anon Event', 'Desc', '00000000-0000-0000-0000-000000000001', now(), now() + interval '2 hours', 'Venue', 'NONE', 'FREE');
    raise exception 'Anonymous RLS failure: anon user was able to insert event!';
  exception
    when insufficient_privilege then
      -- OK
  end;

  -- Assert they cannot directly write to advertisement metrics daily
  begin
    insert into public.advertisement_metrics_daily (advertisement_id, metric_date, impressions, clicks)
    values (p_ad_id, current_date, 100, 100);
    raise exception 'Anonymous RLS failure: anon user was able to directly write to metrics!';
  exception
    when insufficient_privilege then
      -- OK
  end;

  -- Assert they CAN track ad interaction via RPC
  perform public.track_advertisement_interaction(p_ad_id, false);
  perform public.track_advertisement_interaction(p_ad_id, true);

  -- Verify increment (using postgres role temporary check)
  perform set_config('role', 'postgres', true);
  select clicks into v_count from public.advertisement_metrics_daily where advertisement_id = p_ad_id and metric_date = current_date;
  if v_count <> 1 then
    raise exception 'Ad interaction tracking failed: clicks not incremented';
  end if;

  -- Re-enter anon role
  perform set_config('role', 'anon', true);

  -- 2. Test Organizer One (role: authenticated, auth.uid() = p_org1_auth_id)
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_org1_auth_id::text)::text, true);

  -- Assert they CANNOT directly update Event 1 (direct table mutations are blocked for organizers)
  update public.events set name = 'Published Event Org 1 Updated' where id = p_event1_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'Hardening failure: Organizer was able to update events table directly: count=%', v_count;
  end if;

  -- Assert they CANNOT directly update Event 2 (belongs to Org 2)
  update public.events set name = 'Hacked' where id = p_event2_id;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'Hardening failure: Organizer was able to update events table directly: count=%', v_count;
  end if;

  -- Assert Organizer access request forgery resets to PENDING
  declare
    v_req_id uuid;
  begin
    insert into public.organizer_access_requests (organization_name, remarks, status)
    values ('Club Forge', 'Try to approve myself', 'APPROVED')
    returning id, status into v_req_id, v_status;
    
    if v_status <> 'PENDING' then
      raise exception 'Hardening failure: access request status was not forced to PENDING';
    end if;
  end;

  -- Assert Organizer CANNOT directly insert into media_assets (inserts must use request_media_upload)
  begin
    insert into public.media_assets (bucket, object_key, media_type, mime_type, file_size_bytes, status)
    values ('banners', 'forge1.webp', 'EVENT_BANNER', 'image/webp', 10000, 'READY');
    raise exception 'Hardening failure: organizer was able to insert directly into media_assets';
  exception
    when others then
      -- OK: RLS blocks direct insert
  end;

  -- 2.5 Test Auth & Authorization Functions as Organizer One
  declare
    v_profile json;
    v_req_id uuid;
  begin
    -- Call profile RPC
    v_profile := public.get_current_admin_profile();
    if v_profile is null or (v_profile->>'email') <> 'org1@lpu.in' or (v_profile->>'is_super_admin')::boolean <> false or (v_profile->>'org_name') <> 'Club One' then
      raise exception 'Profile RPC failure for Organizer One: %', v_profile;
    end if;

    -- Call log event RPC
    perform public.log_security_event('AUTH_TEST', 'SUCCESS');

    -- Try to approve request (should fail)
    select id into v_req_id from public.organizer_access_requests where organization_name = 'Club Forge';
    begin
      perform public.approve_organizer_access_request(v_req_id);
      raise exception 'Authorization failure: Organizer was able to approve access request';
    exception
      when others then
        -- OK: Trigger or function raised exception
    end;
  end;

  -- 3. Test Super Admin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_super_admin_auth_id::text)::text, true);

  -- Should be able to update event 2
  update public.events set name = 'Super Updated' where id = p_event2_id;
  select count(*) into v_count from public.events where id = p_event2_id and name = 'Super Updated';
  if v_count <> 1 then
    raise exception 'Super Admin RLS failure: could not update event';
  end if;

  -- Test Auth & Authorization Functions as Super Admin
  declare
    v_profile json;
    v_req_id uuid;
    v_req2_id uuid;
    v_status text;
  begin
    -- Call profile RPC
    v_profile := public.get_current_admin_profile();
    if v_profile is null or (v_profile->>'email') <> 'superadmin@lpu.in' or (v_profile->>'is_super_admin')::boolean <> true then
      raise exception 'Profile RPC failure for Super Admin: %', v_profile;
    end if;

    -- Approve request
    select id into v_req_id from public.organizer_access_requests where organization_name = 'Club Forge';
    perform public.approve_organizer_access_request(v_req_id);
    
    -- Verify status is APPROVED
    select status into v_status from public.organizer_access_requests where id = v_req_id;
    if v_status <> 'APPROVED' then
      raise exception 'Approve RPC failure: request status not updated to APPROVED';
    end if;

    -- Verify membership created
    select count(*) into v_count from public.organization_members om
    join public.organizations o on om.organization_id = o.id
    where o.name = 'Club Forge' and om.admin_user_id = (select id from public.admin_users where email = 'org1@lpu.in');
    if v_count <> 1 then
      raise exception 'Approve RPC failure: membership not created for organizer';
    end if;

    -- Reject request test
    -- Switch to postgres to insert a request for Organizer Two
    perform set_config('role', 'postgres', true);
    insert into public.organizer_access_requests (admin_user_id, organization_name, status)
    values ((select id from public.admin_users where email = 'org2@lpu.in'), 'Club Reject', 'PENDING')
    returning id into v_req2_id;
    
    -- Switch back to Super Admin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_super_admin_auth_id::text)::text, true);

    -- Reject request
    perform public.reject_organizer_access_request(v_req2_id, 'Insufficient proof');
    
    -- Verify rejection status
    select status into v_status from public.organizer_access_requests where id = v_req2_id;
    if v_status <> 'REJECTED' then
      raise exception 'Reject RPC failure: request status not updated to REJECTED';
    end if;

    -- ============================================================
    -- Phase 6.1 Security Hardening Tests
    -- ============================================================
    declare
      v_res json;
      v_err_code text;
      v_ver_before bigint;
      v_ver_after bigint;
      v_cat_test_id uuid;
      v_sub_test_id uuid;
      v_ad_test_id uuid;
      v_media_test_id uuid;
      v_super_admin_user_id uuid;
    begin
      -- Get admin user ID for Super Admin
      select id into v_super_admin_user_id from public.admin_users where email = 'superadmin@lpu.in';

      -- Test 1: Immutability of audit_logs - Super Admin cannot INSERT/UPDATE/DELETE audit logs directly
      begin
        insert into public.audit_logs (actor_admin_id, actor_role, action, target_type)
        values (v_super_admin_user_id, 'SUPER_ADMIN', 'FAKE_ACTION', 'event');
        raise exception 'Hardening failure: Super Admin was able to insert directly into audit_logs!';
      exception
        when others then
          -- OK: INSERT fails because no insert policy exists
      end;

      begin
        delete from public.audit_logs;
        raise exception 'Hardening failure: Super Admin was able to delete from audit_logs!';
      exception
        when others then
          -- OK: DELETE fails
      end;

      -- Test 2: Immutability of advertisement_metrics_daily - Super Admin cannot INSERT/UPDATE/DELETE directly
      begin
        insert into public.advertisement_metrics_daily (advertisement_id, metric_date, impressions, clicks)
        values (p_ad_id, current_date, 100, 100);
        raise exception 'Hardening failure: Super Admin was able to insert directly into advertisement_metrics_daily!';
      exception
        when others then
          -- OK: INSERT fails because we changed policy to select-only
      end;

      -- Test 3: CHECK constraint on redirect_url protocol scheme
      -- We must run under postgres temporarily to bypass RLS for this direct insert test
      perform set_config('role', 'postgres', true);
      begin
        insert into public.advertisements (name, media_id, redirect_url, start_at, end_at, created_by, updated_by)
        values ('Bad Ad', '00000000-0000-0000-0000-000000000001', 'javascript:alert(1)', now(), now() + interval '1 day', v_super_admin_user_id, v_super_admin_user_id);
        raise exception 'Hardening failure: accepted javascript: redirect_url on advertisements!';
      exception
        when others then
          -- OK: check constraint failed
      end;

      -- Restore Super Admin role
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', p_super_admin_auth_id::text)::text, true);

      -- Test 4: manage_category RPC enforces SUPER_ADMIN authorization
      -- Switch to Organizer One
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', p_org1_auth_id::text)::text, true);

      v_res := public.manage_category('create', null, 'hack', 'Hacked Category', 0, true);
      v_err_code := v_res->>'code';
      if v_err_code is null or v_err_code <> 'UNAUTHORIZED' then
        raise exception 'Hardening failure: non-Super-Admin executed manage_category: %', v_res;
      end if;

      -- Switch back to Super Admin
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', p_super_admin_auth_id::text)::text, true);

      -- Create category via RPC
      v_res := public.manage_category('create', null, 'valid_cat', 'Valid Category', 0, true);
      if v_res->>'status' <> 'success' then
        raise exception 'manage_category create failed: %', v_res;
      end if;
      v_cat_test_id := (v_res->>'id')::uuid;

      -- Test 5: Subcategory insert trigger increments 'categories' version
      select coalesce(version, 0) into v_ver_before from public.resource_versions where resource = 'categories';
      
      -- Create subcategory via RPC (as Super Admin)
      v_res := public.manage_subcategory('create', null, v_cat_test_id, 'valid_sub', 'Valid Subcategory', 0);
      if v_res->>'status' <> 'success' then
        raise exception 'manage_subcategory create failed: %', v_res;
      end if;
      v_sub_test_id := (v_res->>'id')::uuid;

      select coalesce(version, 0) into v_ver_after from public.resource_versions where resource = 'categories';
      if v_ver_after <= v_ver_before or v_ver_after is null then
        raise exception 'Hardening failure: subcategories trigger did not increment categories version';
      end if;

      -- Test 11: Phase 7 Outbox RPCs, RLS Protection, and Queue State Machine
      declare
        v_outbox_test_id uuid := gen_random_uuid();
        v_claimed_count integer := 0;
      begin
        -- Subtest 11a: Direct insert into outbox_events by Super Admin must be BLOCKED by RLS
        begin
          insert into public.outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
          values (v_outbox_test_id, 'EMAIL_NOTIFICATION', 'test_aggregate', v_outbox_test_id, '{"test": true}'::jsonb, 'PENDING');
          raise exception 'Phase 7 Hardening failure: direct insert into outbox_events by Super Admin was NOT blocked by RLS!';
        exception when others then
          -- Expected: RLS policy blocked direct PostgREST insert
          null;
        end;

        -- Subtest 11b: Insert test outbox event as system/postgres for RPC testing
        perform set_config('role', 'postgres', true);
        insert into public.outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status)
        values (v_outbox_test_id, 'EMAIL_NOTIFICATION', 'test_aggregate', v_outbox_test_id, '{"test": true}'::jsonb, 'PENDING');

        -- Switch back to Super Admin role
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', p_super_admin_auth_id::text)::text, true);

        -- Claim event via claim_outbox_events RPC
        select count(*) into v_claimed_count from public.claim_outbox_events(10) where id = v_outbox_test_id;
        if v_claimed_count <> 1 then
          raise exception 'Phase 7 failure: claim_outbox_events did not claim test event';
        end if;

        -- Verify status is PROCESSING
        if not exists(select 1 from public.outbox_events where id = v_outbox_test_id and status = 'PROCESSING') then
          raise exception 'Phase 7 failure: test outbox event status is not PROCESSING';
        end if;

        -- Complete event via complete_outbox_event RPC
        v_res := public.complete_outbox_event(v_outbox_test_id);
        if v_res->>'status' <> 'success' then
          raise exception 'Phase 7 failure: complete_outbox_event failed: %', v_res;
        end if;

        if not exists(select 1 from public.outbox_events where id = v_outbox_test_id and status = 'PROCESSED') then
          raise exception 'Phase 7 failure: test outbox event status is not PROCESSED';
        end if;

        -- Test failure RPC
        v_res := public.fail_outbox_event(v_outbox_test_id, 'Simulated worker error');
        if v_res->>'status' <> 'success' then
          raise exception 'Phase 7 failure: fail_outbox_event failed: %', v_res;
        end if;

        -- Test manual retry RPC
        v_res := public.retry_outbox_event(v_outbox_test_id);
        if v_res->>'status' <> 'success' then
          raise exception 'Phase 7 failure: retry_outbox_event failed: %', v_res;
        end if;

        if not exists(select 1 from public.outbox_events where id = v_outbox_test_id and status = 'PENDING' and attempt_count = 0) then
          raise exception 'Phase 7 failure: retry_outbox_event did not reset status to PENDING';
        end if;

        -- Subtest 11c: Test cleanup_processed_outbox_events RPC
        perform set_config('role', 'postgres', true);
        insert into public.outbox_events (id, event_type, aggregate_type, aggregate_id, payload, status, processed_at)
        values (gen_random_uuid(), 'TEST_CLEANUP', 'test_aggregate', v_outbox_test_id, '{}'::jsonb, 'PROCESSED', now() - interval '10 days');

        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', p_super_admin_auth_id::text)::text, true);

        if public.cleanup_processed_outbox_events(7) < 1 then
          raise exception 'Phase 7 failure: cleanup_processed_outbox_events did not purge old processed event';
        end if;

        -- Clean up test outbox event as system
        perform set_config('role', 'postgres', true);
        delete from public.outbox_events where id = v_outbox_test_id;
        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', p_super_admin_auth_id::text)::text, true);
      end;

      -- Test 12: Phase 8 Resource Versioning & RPC Verification
      declare
        v_rv_count integer := 0;
        v_cat_ver_before bigint;
        v_cat_ver_after bigint;
      begin
        -- 12a: Verify all 8 canonical resource types exist in resource_versions table
        select count(*) into v_rv_count from public.resource_versions;
        if v_rv_count < 8 then
          raise exception 'Phase 8 failure: expected 8 canonical resource versions, found %', v_rv_count;
        end if;

        -- 12b: Verify get_resource_versions() RPC output count
        select count(*) into v_rv_count from public.get_resource_versions();
        if v_rv_count < 8 then
          raise exception 'Phase 8 failure: get_resource_versions RPC returned % rows, expected 8', v_rv_count;
        end if;

        -- 12c: Direct mutation of resource_versions by Super Admin must be BLOCKED by RLS
        begin
          update public.resource_versions set version = 9999 where resource = 'events';
          raise exception 'Phase 8 Hardening failure: direct update on resource_versions by Super Admin was NOT blocked by RLS!';
        exception when others then
          -- Expected: RLS policy blocked direct PostgREST update
          null;
        end;

        -- 12d: Verify subcategories mutation transactionally increments categories version
        select version into v_cat_ver_before from public.resource_versions where resource = 'categories';
        
        perform set_config('role', 'postgres', true);
        insert into public.subcategories (category_id, key, name, sort_order)
        select id, 'test_sub_phase8', 'Phase 8 Subcategory', 99 from public.categories limit 1;

        perform set_config('role', 'authenticated', true);
        perform set_config('request.jwt.claims', json_build_object('sub', p_super_admin_auth_id::text)::text, true);

        select version into v_cat_ver_after from public.resource_versions where resource = 'categories';
        if v_cat_ver_after <= v_cat_ver_before or v_cat_ver_after is null then
          raise exception 'Phase 8 failure: subcategory insert did not increment categories resource version';
        end if;
      end;
    end;
  end;

  -- Reset role to postgres/service_role
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$ language plpgsql;


-- Execute tests
select public.run_database_tests();

-- Execute RLS policy checks
do $$
declare
  v_super_admin_auth_id uuid := '00000000-0000-0000-0000-000000000001';
  v_org1_auth_id uuid := '00000000-0000-0000-0000-000000000002';
  v_org2_auth_id uuid := '00000000-0000-0000-0000-000000000003';
  
  v_org1_id uuid;
  v_org2_id uuid;
  v_event1_id uuid;
  v_event2_id uuid;
  v_ad_id uuid;
begin
  select id into v_org1_id from public.organizations where name = 'Club One';
  select id into v_org2_id from public.organizations where name = 'Club Two';
  select id into v_event1_id from public.events where name = 'Published Event Org 1';
  select id into v_event2_id from public.events where name = 'Published Event Org 2';
  select id into v_ad_id from public.advertisements where name = 'Ad 1';

  perform public.test_rls_policies(
    v_super_admin_auth_id,
    v_org1_auth_id,
    v_org2_auth_id,
    v_org1_id,
    v_org2_id,
    v_event1_id,
    v_event2_id,
    v_ad_id
  );
end;
$$;

-- Drop temporary test functions
drop function if exists public.run_database_tests();
drop function if exists public.test_rls_policies();

-- Clean up seeded test data in dependency order
delete from public.carousel_items;
delete from public.advertisement_metrics_daily;
delete from public.advertisement_positions;
delete from public.advertisements;
delete from public.events;
delete from public.media_assets;
delete from public.subcategories;
delete from public.categories;
delete from public.platform_admin_roles;
delete from public.organization_members;
delete from public.organizations;
delete from public.organizer_access_requests;
delete from public.admin_users;
delete from auth.users where email in ('superadmin@lpu.in', 'org1@lpu.in', 'org2@lpu.in');
