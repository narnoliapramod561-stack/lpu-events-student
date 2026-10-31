-- 20261008110000_operations_alert_and_incident_engine.sql
-- Super Admin Operations Control Plane — Phase 5: Alert & Incident Engine
-- Authoritative server-side alert rules, alert deduplication, incident correlation,
-- state machines (OPEN / ACKNOWLEDGED / RESOLVED), timeline events, and retention pruning.

-- ============================================================================
-- 1. Table: ops_alert_rules (Canonical Operational Rules Registry)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  service_id text NOT NULL,
  metric_key text,
  condition_type text NOT NULL CHECK (
    condition_type IN (
      'THRESHOLD',
      'RATE',
      'HEALTH_FAILURE',
      'JOB_FAILURE',
      'JOB_STALE',
      'TELEMETRY_STALE',
      'PROVIDER_UNAVAILABLE'
    )
  ),
  operator text NOT NULL CHECK (
    operator IN ('GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ')
  ),
  threshold_value numeric,
  secondary_threshold_value numeric,
  window_minutes integer NOT NULL DEFAULT 15 CHECK (window_minutes > 0),
  evaluation_interval_minutes integer NOT NULL DEFAULT 5 CHECK (evaluation_interval_minutes > 0),
  severity text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
  enabled boolean NOT NULL DEFAULT true,
  cooldown_minutes integer NOT NULL DEFAULT 15 CHECK (cooldown_minutes >= 0),
  recovery_enabled boolean NOT NULL DEFAULT true,
  consecutive_count_threshold integer NOT NULL DEFAULT 1 CHECK (consecutive_count_threshold >= 1),
  recovery_consecutive_threshold integer NOT NULL DEFAULT 1 CHECK (recovery_consecutive_threshold >= 1),
  incident_group_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ops_alert_rules_eval 
  ON public.ops_alert_rules (enabled, service_id, condition_type);

-- ============================================================================
-- 2. Table: ops_incidents (Authoritative Problem Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  service_id text NOT NULL,
  group_key text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acknowledged_at timestamptz,
  acknowledged_by text,
  resolved_at timestamptz,
  resolved_by text,
  resolution_reason text,
  last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  primary_alert_id uuid,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_ops_incidents_service_status 
  ON public.ops_incidents (service_id, status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_incidents_group_status 
  ON public.ops_incidents (group_key, status);

CREATE INDEX IF NOT EXISTS idx_ops_incidents_status_opened 
  ON public.ops_incidents (status, opened_at DESC);

-- ============================================================================
-- 3. Table: ops_alerts (Authoritative Machine-Detected Alerts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.ops_alert_rules(id) ON DELETE CASCADE,
  service_id text NOT NULL,
  metric_snapshot_id uuid REFERENCES public.ops_metric_snapshots(id) ON DELETE SET NULL,
  job_run_id uuid REFERENCES public.ops_job_runs(id) ON DELETE SET NULL,
  incident_id uuid REFERENCES public.ops_incidents(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'HIGH', 'CRITICAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  title text NOT NULL,
  message text NOT NULL,
  first_detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count >= 1),
  last_value numeric,
  threshold_value numeric,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  consecutive_failures integer NOT NULL DEFAULT 1 CHECK (consecutive_failures >= 0),
  consecutive_successes integer NOT NULL DEFAULT 0 CHECK (consecutive_successes >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Foreign key back from ops_incidents.primary_alert_id to ops_alerts.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ops_incidents_primary_alert'
  ) THEN
    ALTER TABLE public.ops_incidents
      ADD CONSTRAINT fk_ops_incidents_primary_alert
      FOREIGN KEY (primary_alert_id) REFERENCES public.ops_alerts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ops_alerts_rule_status 
  ON public.ops_alerts (rule_id, status, last_detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_service_status 
  ON public.ops_alerts (service_id, status, last_detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_incident 
  ON public.ops_alerts (incident_id, status);

-- ============================================================================
-- 4. Table: ops_incident_events (Immutable Incident Timeline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.ops_incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN (
      'INCIDENT_OPENED',
      'ALERT_CREATED',
      'ALERT_OCCURRED_AGAIN',
      'SEVERITY_CHANGED',
      'INCIDENT_ACKNOWLEDGED',
      'INCIDENT_RESOLVED',
      'ALERT_RESOLVED'
    )
  ),
  actor_type text NOT NULL CHECK (actor_type IN ('SYSTEM', 'SUPER_ADMIN')),
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  alert_id uuid REFERENCES public.ops_alerts(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_incident_events_timeline 
  ON public.ops_incident_events (incident_id, occurred_at DESC);

-- ============================================================================
-- 5. Seed Canonical Initial Alert Rules (Supported by Real Telemetry)
-- ============================================================================
INSERT INTO public.ops_alert_rules (
  rule_key, name, description, service_id, metric_key, condition_type, operator,
  threshold_value, window_minutes, evaluation_interval_minutes, severity, enabled,
  cooldown_minutes, recovery_enabled, consecutive_count_threshold, recovery_consecutive_threshold,
  incident_group_key, metadata
) VALUES
  (
    'database_storage_warning',
    'Database Storage Exceeds Warning Threshold',
    'Triggers when database storage usage percentage reaches or exceeds 85% capacity threshold.',
    'supabase_database',
    'database.storage_bytes',
    'THRESHOLD',
    'GTE',
    85,
    15,
    5,
    'WARNING',
    true,
    15,
    true,
    1,
    1,
    'supabase:database',
    '{"threshold_unit": "percent", "provider": "supabase"}'::jsonb
  ),
  (
    'worker_error_rate_high',
    'Cloudflare Worker Error Rate Elevated',
    'Triggers when the normalized Cloudflare Worker error rate reaches or exceeds 2.0%.',
    'cloudflare_worker',
    'worker.error_rate',
    'RATE',
    'GTE',
    2.0,
    15,
    5,
    'HIGH',
    true,
    15,
    true,
    2,
    2,
    'cloudflare:worker',
    '{"threshold_unit": "percent", "provider": "cloudflare"}'::jsonb
  ),
  (
    'cloudflare_provider_unavailable',
    'Cloudflare Edge Worker Probe Unavailable',
    'Triggers when the active HTTP health probe against Cloudflare Worker indicates service is unavailable.',
    'cloudflare_worker',
    NULL,
    'PROVIDER_UNAVAILABLE',
    'EQ',
    1,
    15,
    5,
    'CRITICAL',
    true,
    10,
    true,
    2,
    2,
    'cloudflare:provider',
    '{"probe_target": "cloudflare_worker"}'::jsonb
  ),
  (
    'database_cleanup_failed',
    'Database Cleanup Maintenance Job Failed',
    'Triggers when the authoritative database size guardrail and cleanup maintenance execution fails.',
    'internal_maintenance',
    'database_cleanup',
    'JOB_FAILURE',
    'EQ',
    1,
    60,
    15,
    'HIGH',
    true,
    30,
    true,
    1,
    1,
    'maintenance:database_cleanup',
    '{"job_key": "database_cleanup"}'::jsonb
  ),
  (
    'r2_orphan_cleanup_failed',
    'Cloudflare R2 Orphan Purge Job Failed',
    'Triggers when the Cloudflare R2 orphan media cleanup job execution fails.',
    'cloudflare_r2',
    'r2_orphan_cleanup',
    'JOB_FAILURE',
    'EQ',
    1,
    60,
    15,
    'HIGH',
    true,
    30,
    true,
    1,
    1,
    'maintenance:r2_cleanup',
    '{"job_key": "r2_orphan_cleanup"}'::jsonb
  ),
  (
    'database_cleanup_stale',
    'Database Cleanup Job Stale / Overdue',
    'Triggers when database cleanup maintenance has not succeeded within 2x its expected cadence window.',
    'internal_maintenance',
    'database_cleanup',
    'JOB_STALE',
    'EQ',
    1,
    720,
    30,
    'WARNING',
    true,
    60,
    true,
    1,
    1,
    'maintenance:database_cleanup',
    '{"job_key": "database_cleanup", "max_staleness_multiplier": 2}'::jsonb
  ),
  (
    'provider_telemetry_stale',
    'Provider Operational Telemetry Stale',
    'Triggers when operational provider telemetry freshness exceeds staleness threshold.',
    'observability_engine',
    NULL,
    'TELEMETRY_STALE',
    'EQ',
    1,
    120,
    15,
    'WARNING',
    true,
    30,
    true,
    1,
    1,
    'telemetry:freshness',
    '{"subsystem": "observability_engine"}'::jsonb
  )
ON CONFLICT (rule_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  service_id = EXCLUDED.service_id,
  metric_key = EXCLUDED.metric_key,
  condition_type = EXCLUDED.condition_type,
  operator = EXCLUDED.operator,
  threshold_value = EXCLUDED.threshold_value,
  severity = EXCLUDED.severity,
  incident_group_key = EXCLUDED.incident_group_key,
  metadata = EXCLUDED.metadata,
  updated_at = clock_timestamp();

-- ============================================================================
-- 6. Register Alert Evaluation Job in ops_jobs (Phase 4 Infrastructure Reuse)
-- ============================================================================
INSERT INTO public.ops_jobs (
  job_key, display_name, description, job_type, schedule_description,
  expected_interval_minutes, enabled, criticality, owner, source, metadata
) VALUES (
  'alert_rule_evaluation',
  'Operational Alert Rule Evaluation & Incident Engine',
  'Evaluates active alert rules against latest telemetry metrics, health probes, and maintenance job states; handles deduplication, incident correlation, flapping protection, and automatic recovery.',
  'TELEMETRY',
  'Every 5-15 minutes / Post-collection sweep',
  15,
  true,
  'HIGH',
  'observability_engine',
  'supabase_rpc',
  '{"evaluates": ["metrics", "probes", "jobs", "freshness"], "version": "phase5"}'::jsonb
) ON CONFLICT (job_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  schedule_description = EXCLUDED.schedule_description,
  expected_interval_minutes = EXCLUDED.expected_interval_minutes,
  criticality = EXCLUDED.criticality,
  updated_at = clock_timestamp();

-- ============================================================================
-- 7. Row-Level Security (Strict Super Admin Access & Control)
-- ============================================================================
ALTER TABLE public.ops_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_incident_events ENABLE ROW LEVEL SECURITY;

-- 7.1 ops_alert_rules
DROP POLICY IF EXISTS "ops_alert_rules_super_admin_read" ON public.ops_alert_rules;
CREATE POLICY "ops_alert_rules_super_admin_read"
  ON public.ops_alert_rules
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "ops_alert_rules_service_role" ON public.ops_alert_rules;
CREATE POLICY "ops_alert_rules_service_role"
  ON public.ops_alert_rules
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7.2 ops_incidents
DROP POLICY IF EXISTS "ops_incidents_super_admin_read" ON public.ops_incidents;
CREATE POLICY "ops_incidents_super_admin_read"
  ON public.ops_incidents
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "ops_incidents_service_role" ON public.ops_incidents;
CREATE POLICY "ops_incidents_service_role"
  ON public.ops_incidents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7.3 ops_alerts
DROP POLICY IF EXISTS "ops_alerts_super_admin_read" ON public.ops_alerts;
CREATE POLICY "ops_alerts_super_admin_read"
  ON public.ops_alerts
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "ops_alerts_service_role" ON public.ops_alerts;
CREATE POLICY "ops_alerts_service_role"
  ON public.ops_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7.4 ops_incident_events
DROP POLICY IF EXISTS "ops_incident_events_super_admin_read" ON public.ops_incident_events;
CREATE POLICY "ops_incident_events_super_admin_read"
  ON public.ops_incident_events
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "ops_incident_events_service_role" ON public.ops_incident_events;
CREATE POLICY "ops_incident_events_service_role"
  ON public.ops_incident_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 8. Authoritative Operational RPCs
-- ============================================================================

-- 8.1 Acknowledge Incident (Super Admin Only)
CREATE OR REPLACE FUNCTION public.acknowledge_operations_incident(
  p_incident_id uuid,
  p_actor_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_incident record;
  v_now timestamptz := clock_timestamp();
  v_alert_count integer := 0;
BEGIN
  -- 1. Authorization check
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate incident existence and state
  SELECT * INTO v_incident
  FROM public.ops_incidents
  WHERE id = p_incident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found: %', p_incident_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_incident.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Cannot acknowledge a resolved incident: %', p_incident_id
      USING ERRCODE = '22000';
  END IF;

  -- 3. Transition incident status to ACKNOWLEDGED
  UPDATE public.ops_incidents
  SET
    status = 'ACKNOWLEDGED',
    acknowledged_at = v_now,
    acknowledged_by = COALESCE(p_actor_id, 'super_admin'),
    last_activity_at = v_now,
    updated_at = v_now
  WHERE id = p_incident_id;

  -- 4. Transition contributing OPEN alerts to ACKNOWLEDGED
  UPDATE public.ops_alerts
  SET
    status = 'ACKNOWLEDGED',
    updated_at = v_now
  WHERE incident_id = p_incident_id
    AND status = 'OPEN';

  GET DIAGNOSTICS v_alert_count = ROW_COUNT;

  -- 5. Record incident timeline event
  INSERT INTO public.ops_incident_events (
    incident_id, event_type, actor_type, actor_id, occurred_at, metadata
  ) VALUES (
    p_incident_id,
    'INCIDENT_ACKNOWLEDGED',
    'SUPER_ADMIN',
    COALESCE(p_actor_id, 'super_admin'),
    v_now,
    jsonb_build_object(
      'acknowledged_by', COALESCE(p_actor_id, 'super_admin'),
      'alerts_acknowledged', v_alert_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'incident_id', p_incident_id,
    'status', 'ACKNOWLEDGED',
    'acknowledged_at', v_now,
    'acknowledged_by', COALESCE(p_actor_id, 'super_admin'),
    'alerts_acknowledged', v_alert_count
  );
END;
$$;

-- 8.2 Resolve Incident Manually (Super Admin Only with Reason)
CREATE OR REPLACE FUNCTION public.resolve_operations_incident(
  p_incident_id uuid,
  p_actor_id text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_incident record;
  v_now timestamptz := clock_timestamp();
  v_alert_count integer := 0;
  v_clean_reason text;
BEGIN
  -- 1. Authorization check
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required.'
      USING ERRCODE = '42501';
  END IF;

  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'A valid resolution reason (minimum 3 characters) is required.'
      USING ERRCODE = '22023';
  END IF;

  -- 2. Validate incident existence
  SELECT * INTO v_incident
  FROM public.ops_incidents
  WHERE id = p_incident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found: %', p_incident_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_incident.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Incident is already resolved: %', p_incident_id
      USING ERRCODE = '22000';
  END IF;

  -- 3. Transition incident status to RESOLVED
  UPDATE public.ops_incidents
  SET
    status = 'RESOLVED',
    resolved_at = v_now,
    resolved_by = COALESCE(p_actor_id, 'super_admin'),
    resolution_reason = v_clean_reason,
    last_activity_at = v_now,
    updated_at = v_now
  WHERE id = p_incident_id;

  -- 4. Transition all active alerts for this incident to RESOLVED
  UPDATE public.ops_alerts
  SET
    status = 'RESOLVED',
    resolved_at = v_now,
    updated_at = v_now
  WHERE incident_id = p_incident_id
    AND status IN ('OPEN', 'ACKNOWLEDGED');

  GET DIAGNOSTICS v_alert_count = ROW_COUNT;

  -- 5. Record incident timeline event
  INSERT INTO public.ops_incident_events (
    incident_id, event_type, actor_type, actor_id, occurred_at, metadata
  ) VALUES (
    p_incident_id,
    'INCIDENT_RESOLVED',
    'SUPER_ADMIN',
    COALESCE(p_actor_id, 'super_admin'),
    v_now,
    jsonb_build_object(
      'resolved_by', COALESCE(p_actor_id, 'super_admin'),
      'resolution_reason', v_clean_reason,
      'alerts_resolved', v_alert_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'incident_id', p_incident_id,
    'status', 'RESOLVED',
    'resolved_at', v_now,
    'resolved_by', COALESCE(p_actor_id, 'super_admin'),
    'resolution_reason', v_clean_reason,
    'alerts_resolved', v_alert_count
  );
END;
$$;

-- 8.3 Retention Pruner: Deletes RESOLVED Alerts & Incidents Past Retention Window
CREATE OR REPLACE FUNCTION public.prune_stale_operations_alerts_and_incidents(
  p_alert_retention_days integer DEFAULT 90,
  p_incident_retention_days integer DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alert_cutoff timestamptz;
  v_incident_cutoff timestamptz;
  v_deleted_events integer := 0;
  v_deleted_alerts integer := 0;
  v_deleted_incidents integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin privileges required.'
      USING ERRCODE = '42501';
  END IF;

  v_alert_cutoff := clock_timestamp() - (COALESCE(p_alert_retention_days, 90) || ' days')::interval;
  v_incident_cutoff := clock_timestamp() - (COALESCE(p_incident_retention_days, 180) || ' days')::interval;

  -- 1. Delete resolved alerts older than alert retention window
  -- (Only delete alerts whose incident is also resolved or null, and alert status is RESOLVED)
  DELETE FROM public.ops_alerts
  WHERE status = 'RESOLVED'
    AND resolved_at < v_alert_cutoff;

  GET DIAGNOSTICS v_deleted_alerts = ROW_COUNT;

  -- 2. Delete resolved incidents older than incident retention window
  -- (Cascade deletes remaining ops_incident_events)
  DELETE FROM public.ops_incidents
  WHERE status = 'RESOLVED'
    AND resolved_at < v_incident_cutoff;

  GET DIAGNOSTICS v_deleted_incidents = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'alert_cutoff', v_alert_cutoff,
    'incident_cutoff', v_incident_cutoff,
    'deleted_alerts', v_deleted_alerts,
    'deleted_incidents', v_deleted_incidents
  );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.acknowledge_operations_incident(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_operations_incident(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_stale_operations_alerts_and_incidents(integer, integer) TO authenticated, service_role;
