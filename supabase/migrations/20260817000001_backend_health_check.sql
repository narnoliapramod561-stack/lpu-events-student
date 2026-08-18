-- 20260817000001_backend_health_check.sql
-- Lightweight, safe backend database health check RPC for LPU Events uptime monitoring (e.g. Better Stack)

CREATE OR REPLACE FUNCTION public.health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_count integer;
  v_event_count integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- Perform lightweight verification of fundamental tables
  SELECT count(*) INTO v_version_count FROM public.resource_versions;
  SELECT count(*) INTO v_event_count FROM public.events;

  RETURN jsonb_build_object(
    'status', 'healthy',
    'database', 'connected',
    'timestamp', to_jsonb(v_now),
    'services', jsonb_build_object(
      'postgresql', 'operational',
      'resource_versions_active', (v_version_count > 0)
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Safe failure without leaking internal stack trace, credentials, or schema details
  RETURN jsonb_build_object(
    'status', 'unhealthy',
    'database', 'error',
    'timestamp', to_jsonb(clock_timestamp())
  );
END;
$$;

-- Grant EXECUTE to public roles (anon and authenticated)
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.health_check() IS 'Production-safe lightweight database health check endpoint for uptime monitoring and liveness probes.';
