-- 20261007160000_operations_backend_foundation.sql
-- Super Admin Operations Control Plane — Privileged Database Diagnostics RPC Foundation

CREATE OR REPLACE FUNCTION public.get_operations_database_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_now timestamptz;
  v_latency_ms numeric;
  v_total_events integer := 0;
  v_published_events integer := 0;
  v_total_admins integer := 0;
  v_total_media integer := 0;
  v_total_versions integer := 0;
  v_active_connections integer := 0;
  v_db_size text := 'NOT_AVAILABLE';
  v_is_recovery boolean := false;
  v_result jsonb;
BEGIN
  -- 1. Strict Super Admin, Service Role, or System Caller Authorization Gate
  IF current_user NOT IN ('postgres', 'supabase_admin')
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Super Administrator privilege required.'
      USING errcode = '42501';
  END IF;

  -- 2. Table Counts (Sanitized Application Metadata)
  SELECT count(*) INTO v_total_events FROM public.events;
  SELECT count(*) INTO v_published_events FROM public.events WHERE status = 'PUBLISHED';
  SELECT count(*) INTO v_total_admins FROM public.admin_users WHERE is_active = true;
  SELECT count(*) INTO v_total_media FROM public.media_assets;
  SELECT count(*) INTO v_total_versions FROM public.resource_versions;

  -- 3. Safe Database Recovery / Replication State
  BEGIN
    SELECT pg_is_in_recovery() INTO v_is_recovery;
  EXCEPTION WHEN OTHERS THEN
    v_is_recovery := false;
  END;

  -- 4. Approximate Connection Count (Sanitized count only - no query text, client IPs, or credentials)
  BEGIN
    SELECT count(*)::integer INTO v_active_connections
    FROM pg_stat_activity
    WHERE state = 'active' OR state = 'idle';
  EXCEPTION WHEN OTHERS THEN
    v_active_connections := -1; -- restricted or unavailable
  END;

  -- 5. Safe Database Storage Size Estimate
  BEGIN
    SELECT pg_size_pretty(pg_database_size(current_database())) INTO v_db_size;
  EXCEPTION WHEN OTHERS THEN
    v_db_size := 'NOT_AVAILABLE';
  END;

  -- Calculate query execution latency
  v_now := clock_timestamp();
  v_latency_ms := round((extract(epoch from (v_now - v_start)) * 1000)::numeric, 2);

  v_result := jsonb_build_object(
    'status', 'HEALTHY',
    'connected', true,
    'timestamp', to_jsonb(v_now),
    'latency_ms', v_latency_ms,
    'is_in_recovery', v_is_recovery,
    'database_size_pretty', v_db_size,
    'active_connections', CASE WHEN v_active_connections >= 0 THEN to_jsonb(v_active_connections) ELSE '"NOT_AVAILABLE"'::jsonb END,
    'record_counts', jsonb_build_object(
      'total_events', v_total_events,
      'published_events', v_published_events,
      'active_admins', v_total_admins,
      'media_assets', v_total_media,
      'cache_revision_stamps', v_total_versions
    )
  );

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  -- Safe failure without leaking internal stack trace or schema internals
  RETURN jsonb_build_object(
    'status', 'DEGRADED',
    'connected', false,
    'timestamp', to_jsonb(clock_timestamp()),
    'error', 'Database diagnostic probe failed'
  );
END;
$$;

-- Strict permission boundaries: Revoke from public & anon
REVOKE ALL ON FUNCTION public.get_operations_database_diagnostics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_operations_database_diagnostics() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_operations_database_diagnostics() IS 
  'Privileged database diagnostic probe for Super Admin Operations Control Plane. Enforces public.is_super_admin() security gate.';
