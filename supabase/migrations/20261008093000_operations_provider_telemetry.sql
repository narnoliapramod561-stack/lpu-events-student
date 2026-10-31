-- 20261008093000_operations_provider_telemetry.sql
-- Super Admin Operations Control Plane — Phase 3: Provider & Infrastructure Operational Telemetry
-- Operational telemetry tables: ops_collection_runs, ops_metric_snapshots, ops_health_probes

-- ============================================================================
-- 1. Table: ops_collection_runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_type text NOT NULL, -- 'all', 'health_probes', 'provider_usage', 'quota_snapshot'
  provider text NOT NULL,        -- 'all', 'supabase', 'cloudflare', 'r2', 'resend', 'sentry'
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED')),
  metrics_collected integer NOT NULL DEFAULT 0,
  errors_count integer NOT NULL DEFAULT 0,
  error_code text,
  error_summary text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ops_runs_started_status ON public.ops_collection_runs (started_at DESC, status);
CREATE INDEX IF NOT EXISTS idx_ops_runs_provider ON public.ops_collection_runs (provider, started_at DESC);

-- ============================================================================
-- 2. Table: ops_metric_snapshots
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id text NOT NULL,
  metric_key text NOT NULL,
  metric_value numeric,
  metric_limit numeric,
  unit text NOT NULL, -- 'bytes', 'milliseconds', 'count', 'ratio', 'percent'
  status text NOT NULL DEFAULT 'HEALTHY' CHECK (status IN (
    'HEALTHY', 'WARNING', 'CRITICAL', 'DEGRADED', 'STALE', 'NOT_CONFIGURED', 'UNAVAILABLE', 'INVALID'
  )),
  source text NOT NULL CHECK (source IN (
    'supabase_sql', 'supabase_management_api', 'cloudflare_graphql', 'cloudflare_http_probe',
    'r2_s3', 'resend_usage_api', 'sentry_stats_api', 'internal_probe'
  )),
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  observed_from timestamptz,
  observed_to timestamptz,
  collection_run_id uuid REFERENCES public.ops_collection_runs(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ops_metrics_lookup ON public.ops_metric_snapshots (service_id, metric_key, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_captured ON public.ops_metric_snapshots (captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_metrics_run ON public.ops_metric_snapshots (collection_run_id);

-- ============================================================================
-- 3. Table: ops_health_probes
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_health_probes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id text NOT NULL,
  probe_key text NOT NULL,
  success boolean NOT NULL,
  status text NOT NULL CHECK (status IN (
    'HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'NOT_CONFIGURED', 'AUTHENTICATION_FAILED', 'RATE_LIMITED'
  )),
  latency_ms numeric NOT NULL DEFAULT 0,
  status_code integer,
  error_code text,
  error_message text,
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  collection_run_id uuid REFERENCES public.ops_collection_runs(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ops_probes_lookup ON public.ops_health_probes (service_id, probe_key, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_probes_checked ON public.ops_health_probes (checked_at DESC);

-- ============================================================================
-- 4. Strict Super Admin & Service Role Security Isolation (RLS)
-- ============================================================================
ALTER TABLE public.ops_collection_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_health_probes ENABLE ROW LEVEL SECURITY;

-- Revoke all direct privileges from public and anon
REVOKE ALL ON TABLE public.ops_collection_runs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ops_metric_snapshots FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ops_health_probes FROM PUBLIC, anon;

-- Grant execution to authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_collection_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_metric_snapshots TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_health_probes TO authenticated, service_role;

-- RLS Policies: Authenticated users must satisfy public.is_super_admin()
CREATE POLICY ops_runs_superadmin_policy ON public.ops_collection_runs
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY ops_metrics_superadmin_policy ON public.ops_metric_snapshots
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY ops_probes_superadmin_policy ON public.ops_health_probes
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Service role bypass policies for edge function orchestrator
CREATE POLICY ops_runs_service_role_policy ON public.ops_collection_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY ops_metrics_service_role_policy ON public.ops_metric_snapshots
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY ops_probes_service_role_policy ON public.ops_health_probes
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 5. Privileged RPC: Single-Flight Collection Lock Manager
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_operations_collection_run(
  p_collection_type text,
  p_provider text,
  p_request_id text,
  p_timeout_minutes integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing_run record;
  v_new_run_id uuid;
  v_timeout_interval interval;
BEGIN
  -- Strict Super Admin Gate (allow authenticated super admins or service role)
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Super Administrator privilege required.'
      USING errcode = '42501';
  END IF;

  v_timeout_interval := (p_timeout_minutes || ' minutes')::interval;

  -- 1. Check for active single-flight collection run
  SELECT id, started_at, provider, collection_type INTO v_existing_run
  FROM public.ops_collection_runs
  WHERE status = 'RUNNING'
    AND started_at > (clock_timestamp() - v_timeout_interval)
    AND (provider = p_provider OR p_provider = 'all' OR provider = 'all')
  ORDER BY started_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'ACTIVE_RUN_IN_PROGRESS',
      'active_run_id', v_existing_run.id,
      'started_at', v_existing_run.started_at,
      'provider', v_existing_run.provider
    );
  END IF;

  -- 2. Mark any expired stale runs as TIMEOUT/FAILED
  UPDATE public.ops_collection_runs
  SET status = 'FAILED',
      completed_at = clock_timestamp(),
      error_code = 'COLLECTION_TIMEOUT',
      error_summary = 'Collection run exceeded active timeout threshold.'
  WHERE status = 'RUNNING'
    AND started_at <= (clock_timestamp() - v_timeout_interval);

  -- 3. Insert and acquire lock for new collection run
  INSERT INTO public.ops_collection_runs (
    collection_type,
    provider,
    request_id,
    status,
    started_at
  ) VALUES (
    p_collection_type,
    p_provider,
    p_request_id,
    'RUNNING',
    clock_timestamp()
  )
  RETURNING id INTO v_new_run_id;

  RETURN jsonb_build_object(
    'acquired', true,
    'run_id', v_new_run_id,
    'started_at', clock_timestamp()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_operations_collection_run(text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_operations_collection_run(text, text, text, integer) TO authenticated, service_role;

-- ============================================================================
-- 6. Privileged RPC: Complete Collection Run
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finish_operations_collection_run(
  p_run_id uuid,
  p_status text,
  p_metrics_count integer DEFAULT 0,
  p_errors_count integer DEFAULT 0,
  p_error_code text DEFAULT NULL,
  p_error_summary text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Super Administrator privilege required.'
      USING errcode = '42501';
  END IF;

  UPDATE public.ops_collection_runs
  SET completed_at = clock_timestamp(),
      status = p_status,
      metrics_collected = p_metrics_count,
      errors_count = p_errors_count,
      error_code = p_error_code,
      error_summary = p_error_summary,
      metadata = p_metadata
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', p_run_id,
    'completed_at', clock_timestamp()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_operations_collection_run(uuid, text, integer, integer, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_operations_collection_run(uuid, text, integer, integer, text, text, jsonb) TO authenticated, service_role;

-- ============================================================================
-- 7. Privileged RPC: Prune Stale Telemetry Snapshots
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prune_stale_operations_telemetry(
  p_retention_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_pruned_metrics integer := 0;
  v_pruned_probes integer := 0;
  v_pruned_runs integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Super Administrator privilege required.'
      USING errcode = '42501';
  END IF;

  v_cutoff := clock_timestamp() - (p_retention_days || ' days')::interval;

  DELETE FROM public.ops_metric_snapshots WHERE captured_at < v_cutoff;
  GET DIAGNOSTICS v_pruned_metrics = ROW_COUNT;

  DELETE FROM public.ops_health_probes WHERE checked_at < v_cutoff;
  GET DIAGNOSTICS v_pruned_probes = ROW_COUNT;

  DELETE FROM public.ops_collection_runs WHERE started_at < v_cutoff;
  GET DIAGNOSTICS v_pruned_runs = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', v_cutoff,
    'pruned_metrics', v_pruned_metrics,
    'pruned_probes', v_pruned_probes,
    'pruned_runs', v_pruned_runs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_stale_operations_telemetry(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_stale_operations_telemetry(integer) TO authenticated, service_role;
