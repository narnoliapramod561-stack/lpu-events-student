-- 20261008100000_operations_jobs_and_maintenance.sql
-- Super Admin Operations Control Plane — Phase 4: Operations Jobs & Maintenance Telemetry
-- Authoritative background job registry, execution tracking, single-flight locking, and lifecycle RPCs

-- ============================================================================
-- 1. Table: ops_jobs (Canonical Job Registry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  job_type text NOT NULL CHECK (job_type IN ('DATABASE', 'STORAGE', 'TELEMETRY', 'MAINTENANCE', 'SYNC', 'OTHER')),
  schedule_description text NOT NULL,
  expected_interval_minutes integer CHECK (expected_interval_minutes IS NULL OR expected_interval_minutes > 0),
  enabled boolean NOT NULL DEFAULT true,
  criticality text NOT NULL DEFAULT 'MEDIUM' CHECK (criticality IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  owner text NOT NULL DEFAULT 'platform_engine',
  source text NOT NULL DEFAULT 'github_actions',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ops_jobs_type ON public.ops_jobs (job_type, enabled);

-- Seed Canonical Production Maintenance Jobs
INSERT INTO public.ops_jobs (
  job_key, display_name, description, job_type, schedule_description, expected_interval_minutes, enabled, criticality, owner, source, metadata
) VALUES
  (
    'database_cleanup',
    'Database Size Guardrail & Cleanup',
    'Purges expired audit logs, stale access requests, transitions past events to COMPLETED, and flags unreferenced media assets.',
    'DATABASE',
    'Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)',
    360,
    true,
    'HIGH',
    'platform_sre',
    'github_actions',
    '{"workflow": "database_cleanup.yml", "sub_routines": ["cleanup_old_audit_logs", "cleanup_old_access_requests", "cleanup_past_events", "cleanup_orphaned_media_assets"]}'::jsonb
  ),
  (
    'r2_orphan_cleanup',
    'Cloudflare R2 Physical Orphan Purge',
    'Claims PENDING_DELETE media assets with exclusive lease and physically deletes primary, presentation, and responsive WebP variant files from Cloudflare R2.',
    'STORAGE',
    'Periodic / On-demand lifecycle execution',
    360,
    true,
    'HIGH',
    'storage_pipeline',
    'maintenance_worker',
    '{"target_bucket": "lpu-events-images", "provider": "cloudflare_r2"}'::jsonb
  ),
  (
    'operations_telemetry_prune',
    'Operational Telemetry Retention Prune',
    'Maintains bounded database retention by deleting telemetry metric snapshots, health probes, collection runs, and job runs older than retention window.',
    'TELEMETRY',
    'Daily / Periodic administrative retention sweep',
    1440,
    true,
    'MEDIUM',
    'observability_engine',
    'supabase_rpc',
    '{"default_retention_days": 30, "job_run_retention_days": 60}'::jsonb
  ),
  (
    'provider_telemetry_collection',
    'Provider & Infrastructure Telemetry Collection',
    'Orchestrates parallel, fault-isolated collection across Supabase, Cloudflare Workers/R2, Resend, and Sentry for Super Admin Operations Gateway.',
    'TELEMETRY',
    'Hourly / On-demand collection sweep',
    60,
    true,
    'MEDIUM',
    'observability_engine',
    'edge_function',
    '{"providers": ["supabase", "cloudflare", "r2", "resend", "sentry"]}'::jsonb
  )
ON CONFLICT (job_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  job_type = EXCLUDED.job_type,
  schedule_description = EXCLUDED.schedule_description,
  expected_interval_minutes = EXCLUDED.expected_interval_minutes,
  criticality = EXCLUDED.criticality,
  updated_at = clock_timestamp();

-- ============================================================================
-- 2. Table: ops_job_runs (Job Execution History)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.ops_jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  duration_ms integer,
  request_id text,
  correlation_id text,
  trigger_source text NOT NULL DEFAULT 'SCHEDULE' CHECK (trigger_source IN ('SCHEDULE', 'MANUAL', 'DEPLOYMENT', 'RETRY', 'SYSTEM', 'UNKNOWN')),
  records_scanned integer NOT NULL DEFAULT 0,
  records_processed integer NOT NULL DEFAULT 0,
  records_deleted integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  error_code text,
  error_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  heartbeat_at timestamptz DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT chk_job_run_duration CHECK (duration_ms IS NULL OR duration_ms >= 0),
  CONSTRAINT chk_job_run_completion CHECK (status = 'RUNNING' OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ops_job_runs_job_started ON public.ops_job_runs (job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_job_runs_status_started ON public.ops_job_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_job_runs_started ON public.ops_job_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_job_runs_correlation ON public.ops_job_runs (correlation_id) WHERE correlation_id IS NOT NULL;

-- ============================================================================
-- 3. Strict Security & Row Level Security (RLS)
-- ============================================================================
ALTER TABLE public.ops_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_job_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ops_jobs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.ops_job_runs FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.ops_jobs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_jobs TO service_role;

GRANT SELECT ON TABLE public.ops_job_runs TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_job_runs TO service_role;

-- RLS: Authenticated Super Admins have read-only visibility
CREATE POLICY ops_jobs_superadmin_read_policy ON public.ops_jobs
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY ops_job_runs_superadmin_read_policy ON public.ops_job_runs
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Service role bypass policies for server-side maintenance processes
CREATE POLICY ops_jobs_service_role_policy ON public.ops_jobs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY ops_job_runs_service_role_policy ON public.ops_job_runs
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 4. Privileged RPC: Single-Flight Job Run Start
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_operations_job_run(
  p_job_key text,
  p_trigger_source text DEFAULT 'SCHEDULE',
  p_request_id text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_timeout_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job record;
  v_active_run record;
  v_timeout_interval interval;
  v_new_run_id uuid;
BEGIN
  -- Strict Super Admin / Service Role Gate
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Super Administrator or Service Role privilege required.'
      USING errcode = '42501';
  END IF;

  -- 1. Validate Job Existence & Enabled Status
  SELECT id, job_key, enabled INTO v_job
  FROM public.ops_jobs
  WHERE job_key = p_job_key;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'JOB_NOT_FOUND',
      'job_key', p_job_key
    );
  END IF;

  IF NOT v_job.enabled THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'JOB_DISABLED',
      'job_key', p_job_key
    );
  END IF;

  v_timeout_interval := (p_timeout_minutes || ' minutes')::interval;

  -- 2. Concurrency Check (Single-Flight Protection)
  -- Look for active RUNNING execution started recently with active heartbeat
  SELECT id, started_at, heartbeat_at INTO v_active_run
  FROM public.ops_job_runs
  WHERE job_id = v_job.id
    AND status = 'RUNNING'
    AND started_at > (clock_timestamp() - v_timeout_interval)
    AND (heartbeat_at IS NULL OR heartbeat_at > (clock_timestamp() - interval '15 minutes'))
  ORDER BY started_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'acquired', false,
      'reason', 'ACTIVE_RUN_IN_PROGRESS',
      'active_run_id', v_active_run.id,
      'started_at', v_active_run.started_at,
      'job_key', p_job_key
    );
  END IF;

  -- 3. Stale Run Cleanup: Mark expired running runs as FAILED with timeout
  UPDATE public.ops_job_runs
  SET status = 'FAILED',
      completed_at = clock_timestamp(),
      duration_ms = EXTRACT(MILLISECONDS FROM (clock_timestamp() - started_at))::integer,
      error_code = 'JOB_TIMEOUT',
      error_summary = 'Job run exceeded active single-flight execution window.'
  WHERE job_id = v_job.id
    AND status = 'RUNNING'
    AND started_at <= (clock_timestamp() - v_timeout_interval);

  -- 4. Create New Job Run
  INSERT INTO public.ops_job_runs (
    job_id,
    status,
    trigger_source,
    request_id,
    correlation_id,
    metadata,
    started_at,
    heartbeat_at
  ) VALUES (
    v_job.id,
    'RUNNING',
    p_trigger_source,
    p_request_id,
    p_correlation_id,
    p_metadata,
    clock_timestamp(),
    clock_timestamp()
  )
  RETURNING id INTO v_new_run_id;

  RETURN jsonb_build_object(
    'acquired', true,
    'run_id', v_new_run_id,
    'job_id', v_job.id,
    'job_key', p_job_key,
    'started_at', clock_timestamp()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_operations_job_run(text, text, text, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_operations_job_run(text, text, text, text, jsonb, integer) TO authenticated, service_role;

-- ============================================================================
-- 5. Privileged RPC: Complete Job Run (Idempotent Lifecycle Resolution)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.finish_operations_job_run(
  p_run_id uuid,
  p_status text,
  p_records_scanned integer DEFAULT 0,
  p_records_processed integer DEFAULT 0,
  p_records_deleted integer DEFAULT 0,
  p_records_failed integer DEFAULT 0,
  p_error_code text DEFAULT NULL,
  p_error_summary text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_run record;
  v_now timestamptz := clock_timestamp();
  v_duration_ms integer;
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Super Administrator or Service Role privilege required.'
      USING errcode = '42501';
  END IF;

  SELECT id, status, started_at, metadata INTO v_run
  FROM public.ops_job_runs
  WHERE id = p_run_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RUN_NOT_FOUND');
  END IF;

  -- Idempotency: If already finalized, return success without mutating historical record
  IF v_run.status <> 'RUNNING' THEN
    RETURN jsonb_build_object(
      'success', true,
      'run_id', p_run_id,
      'status', v_run.status,
      'already_finalized', true
    );
  END IF;

  -- Validate Target Transition Status
  IF p_status NOT IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid target status: %', p_status;
  END IF;

  v_duration_ms := GREATEST(0, EXTRACT(MILLISECONDS FROM (v_now - v_run.started_at))::integer);

  UPDATE public.ops_job_runs
  SET status = p_status,
      completed_at = v_now,
      duration_ms = v_duration_ms,
      records_scanned = p_records_scanned,
      records_processed = p_records_processed,
      records_deleted = p_records_deleted,
      records_failed = p_records_failed,
      error_code = p_error_code,
      error_summary = p_error_summary,
      metadata = COALESCE(v_run.metadata, '{}'::jsonb) || p_metadata
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', p_run_id,
    'status', p_status,
    'duration_ms', v_duration_ms,
    'completed_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finish_operations_job_run(uuid, text, integer, integer, integer, integer, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_operations_job_run(uuid, text, integer, integer, integer, integer, text, text, jsonb) TO authenticated, service_role;

-- ============================================================================
-- 6. Privileged RPC: Job Heartbeat
-- ============================================================================
CREATE OR REPLACE FUNCTION public.heartbeat_operations_job_run(
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Super Administrator or Service Role privilege required.'
      USING errcode = '42501';
  END IF;

  UPDATE public.ops_job_runs
  SET heartbeat_at = clock_timestamp()
  WHERE id = p_run_id AND status = 'RUNNING';

  RETURN jsonb_build_object(
    'success', FOUND,
    'run_id', p_run_id,
    'heartbeat_at', clock_timestamp()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.heartbeat_operations_job_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_operations_job_run(uuid) TO authenticated, service_role;

-- ============================================================================
-- 7. Privileged RPC: Prune Stale Job Run Records (Retention Management)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prune_stale_operations_job_runs(
  p_retention_days integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_pruned_runs integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND (auth.uid() IS NULL OR NOT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Access denied: Super Administrator or Service Role privilege required.'
      USING errcode = '42501';
  END IF;

  v_cutoff := clock_timestamp() - (p_retention_days || ' days')::interval;

  -- Only prune completed/failed/cancelled runs; NEVER prune active RUNNING runs!
  DELETE FROM public.ops_job_runs
  WHERE started_at < v_cutoff
    AND status IN ('COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');
  GET DIAGNOSTICS v_pruned_runs = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', v_cutoff,
    'pruned_job_runs', v_pruned_runs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_stale_operations_job_runs(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_stale_operations_job_runs(integer) TO authenticated, service_role;
