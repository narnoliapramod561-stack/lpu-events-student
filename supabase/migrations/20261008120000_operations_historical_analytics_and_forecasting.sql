-- 20261008120000_operations_historical_analytics_and_forecasting.sql
-- Super Admin Operations Control Plane — Phase 6: Historical Operations Analytics & Forecasting
-- Canonical migration for historical metric aggregation, rollups, and bounded retention.

-- ============================================================================
-- 1. Table: ops_metric_aggregates
-- Stores hourly and daily pre-computed rollups for fast, bounded time-series queries.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ops_metric_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_start timestamptz NOT NULL,
  bucket_end timestamptz NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('HOURLY', 'DAILY')),
  service_id text NOT NULL,
  metric_key text NOT NULL,
  sample_count integer NOT NULL DEFAULT 1 CHECK (sample_count > 0),
  min_value numeric NOT NULL,
  max_value numeric NOT NULL,
  avg_value numeric NOT NULL,
  first_value numeric NOT NULL,
  last_value numeric NOT NULL,
  unit text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_ops_metric_aggregates_bucket UNIQUE (bucket_start, resolution, service_id, metric_key)
);

CREATE INDEX IF NOT EXISTS idx_ops_aggregates_lookup
  ON public.ops_metric_aggregates (service_id, metric_key, resolution, bucket_start DESC);

CREATE INDEX IF NOT EXISTS idx_ops_aggregates_time
  ON public.ops_metric_aggregates (bucket_start DESC);

CREATE INDEX IF NOT EXISTS idx_ops_aggregates_resolution
  ON public.ops_metric_aggregates (resolution, bucket_start DESC);

-- ============================================================================
-- 2. View: ops_metric_history
-- Unified normalized read view over ops_metric_snapshots.
-- Inherits underlying table's security context and provides standard historical schema.
-- ============================================================================
CREATE OR REPLACE VIEW public.ops_metric_history AS
  SELECT
    s.id,
    s.metric_key,
    s.service_id,
    s.source,
    'production'::text AS environment,
    s.metric_value AS value,
    s.metric_limit AS limit_value,
    s.unit,
    s.status,
    s.captured_at AS observed_at,
    s.captured_at AS collected_at,
    s.collection_run_id,
    s.metadata,
    s.created_at
  FROM public.ops_metric_snapshots s;

-- ============================================================================
-- 3. Register Phase 6 Canonical Maintenance Jobs into ops_jobs
-- ============================================================================
INSERT INTO public.ops_jobs (
  job_key, display_name, description, job_type, schedule_description,
  expected_interval_minutes, enabled, criticality, owner, source, metadata
)
VALUES
  (
    'historical_metrics_rollup',
    'Historical Metrics Rollup Aggregator',
    'Pre-computes hourly and daily metric rollups from raw snapshots into ops_metric_aggregates.',
    'MAINTENANCE',
    'Every 1 hour',
    60,
    true,
    'MEDIUM',
    'observability_engine',
    'supabase_rpc',
    '{"rollup_resolutions": ["HOURLY", "DAILY"], "batch_hours": 24}'::jsonb
  ),
  (
    'historical_metrics_prune',
    'Historical Operational Analytics Pruning',
    'Prunes historical raw snapshots and aggregates older than bounded retention windows without deleting active operational records.',
    'MAINTENANCE',
    'Weekly',
    10080,
    true,
    'LOW',
    'observability_engine',
    'supabase_rpc',
    '{"raw_retention_days": 30, "hourly_retention_days": 90, "daily_retention_days": 365}'::jsonb
  )
ON CONFLICT (job_key) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  schedule_description = EXCLUDED.schedule_description,
  expected_interval_minutes = EXCLUDED.expected_interval_minutes,
  metadata = EXCLUDED.metadata;

-- ============================================================================
-- 4. Strict Row-Level Security (RLS) Isolation
-- ============================================================================
ALTER TABLE public.ops_metric_aggregates ENABLE ROW LEVEL SECURITY;

-- Revoke all direct privileges from public and anon
REVOKE ALL ON TABLE public.ops_metric_aggregates FROM PUBLIC, anon;

-- Grant execution to authenticated and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ops_metric_aggregates TO authenticated, service_role;

-- RLS Policy: Authenticated users must satisfy public.is_super_admin()
CREATE POLICY ops_aggregates_superadmin_read_policy ON public.ops_metric_aggregates
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY ops_aggregates_superadmin_mutate_policy ON public.ops_metric_aggregates
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ============================================================================
-- 5. Server-Side Rollup RPC: rollup_operations_metric_aggregates
-- Aggregates raw snapshots into bounded hourly and daily buckets.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rollup_operations_metric_aggregates(
  p_target_hour timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hour_start timestamptz;
  v_hour_end timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_hourly_count integer := 0;
  v_daily_count integer := 0;
BEGIN
  -- Default to previous complete hour
  IF p_target_hour IS NULL THEN
    v_hour_start := date_trunc('hour', clock_timestamp()) - interval '1 hour';
  ELSE
    v_hour_start := date_trunc('hour', p_target_hour);
  END IF;
  v_hour_end := v_hour_start + interval '1 hour';

  -- 1. Compute Hourly Rollup
  INSERT INTO public.ops_metric_aggregates (
    bucket_start, bucket_end, resolution, service_id, metric_key,
    sample_count, min_value, max_value, avg_value, first_value, last_value, unit, metadata
  )
  SELECT
    v_hour_start AS bucket_start,
    v_hour_end AS bucket_end,
    'HOURLY' AS resolution,
    s.service_id,
    s.metric_key,
    COUNT(*)::integer AS sample_count,
    MIN(s.metric_value) AS min_value,
    MAX(s.metric_value) AS max_value,
    ROUND(AVG(s.metric_value), 4) AS avg_value,
    (ARRAY_AGG(s.metric_value ORDER BY s.captured_at ASC))[1] AS first_value,
    (ARRAY_AGG(s.metric_value ORDER BY s.captured_at DESC))[1] AS last_value,
    s.unit,
    jsonb_build_object(
      'source', (ARRAY_AGG(s.source))[1],
      'status_breakdown', jsonb_object_agg(s.status, 1)
    ) AS metadata
  FROM public.ops_metric_snapshots s
  WHERE s.captured_at >= v_hour_start
    AND s.captured_at < v_hour_end
    AND s.metric_value IS NOT NULL
  GROUP BY s.service_id, s.metric_key, s.unit
  ON CONFLICT (bucket_start, resolution, service_id, metric_key)
  DO UPDATE SET
    sample_count = EXCLUDED.sample_count,
    min_value = EXCLUDED.min_value,
    max_value = EXCLUDED.max_value,
    avg_value = EXCLUDED.avg_value,
    first_value = EXCLUDED.first_value,
    last_value = EXCLUDED.last_value,
    unit = EXCLUDED.unit,
    metadata = EXCLUDED.metadata;

  GET DIAGNOSTICS v_hourly_count = ROW_COUNT;

  -- 2. Compute Daily Rollup for the day containing v_hour_start
  v_day_start := date_trunc('day', v_hour_start);
  v_day_end := v_day_start + interval '1 day';

  INSERT INTO public.ops_metric_aggregates (
    bucket_start, bucket_end, resolution, service_id, metric_key,
    sample_count, min_value, max_value, avg_value, first_value, last_value, unit, metadata
  )
  SELECT
    v_day_start AS bucket_start,
    v_day_end AS bucket_end,
    'DAILY' AS resolution,
    s.service_id,
    s.metric_key,
    COUNT(*)::integer AS sample_count,
    MIN(s.metric_value) AS min_value,
    MAX(s.metric_value) AS max_value,
    ROUND(AVG(s.metric_value), 4) AS avg_value,
    (ARRAY_AGG(s.metric_value ORDER BY s.captured_at ASC))[1] AS first_value,
    (ARRAY_AGG(s.metric_value ORDER BY s.captured_at DESC))[1] AS last_value,
    s.unit,
    jsonb_build_object(
      'hourly_rollups_aggregated', COUNT(DISTINCT date_trunc('hour', s.captured_at))
    ) AS metadata
  FROM public.ops_metric_snapshots s
  WHERE s.captured_at >= v_day_start
    AND s.captured_at < v_day_end
    AND s.metric_value IS NOT NULL
  GROUP BY s.service_id, s.metric_key, s.unit
  ON CONFLICT (bucket_start, resolution, service_id, metric_key)
  DO UPDATE SET
    sample_count = EXCLUDED.sample_count,
    min_value = EXCLUDED.min_value,
    max_value = EXCLUDED.max_value,
    avg_value = EXCLUDED.avg_value,
    first_value = EXCLUDED.first_value,
    last_value = EXCLUDED.last_value,
    unit = EXCLUDED.unit,
    metadata = EXCLUDED.metadata;

  GET DIAGNOSTICS v_daily_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'hour_start', v_hour_start,
    'hourly_buckets_upserted', v_hourly_count,
    'daily_buckets_upserted', v_daily_count
  );
END;
$$;

-- ============================================================================
-- 6. Server-Side Retention & Pruning RPC: prune_stale_operations_history
-- Strict rule: NEVER deletes active alerts, incidents, probes, or running jobs.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prune_stale_operations_history(
  p_raw_retention_days integer DEFAULT 30,
  p_hourly_retention_days integer DEFAULT 90,
  p_daily_retention_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_raw_cutoff timestamptz;
  v_hourly_cutoff timestamptz;
  v_daily_cutoff timestamptz;
  v_deleted_raw integer := 0;
  v_deleted_hourly integer := 0;
  v_deleted_daily integer := 0;
BEGIN
  v_raw_cutoff := v_now - (GREATEST(p_raw_retention_days, 7) || ' days')::interval;
  v_hourly_cutoff := v_now - (GREATEST(p_hourly_retention_days, 30) || ' days')::interval;
  v_daily_cutoff := v_now - (GREATEST(p_daily_retention_days, 90) || ' days')::interval;

  -- 1. Prune raw snapshots older than raw cutoff, EXCEPT latest snapshot per metric
  WITH latest_snapshots AS (
    SELECT DISTINCT ON (service_id, metric_key) id
    FROM public.ops_metric_snapshots
    ORDER BY service_id, metric_key, captured_at DESC
  ),
  deleted_raw_rows AS (
    DELETE FROM public.ops_metric_snapshots s
    WHERE s.captured_at < v_raw_cutoff
      AND s.id NOT IN (SELECT id FROM latest_snapshots)
    RETURNING s.id
  )
  SELECT COUNT(*)::integer INTO v_deleted_raw FROM deleted_raw_rows;

  -- 2. Prune hourly aggregates older than hourly cutoff
  WITH deleted_hourly_rows AS (
    DELETE FROM public.ops_metric_aggregates
    WHERE resolution = 'HOURLY'
      AND bucket_start < v_hourly_cutoff
    RETURNING id
  )
  SELECT COUNT(*)::integer INTO v_deleted_hourly FROM deleted_hourly_rows;

  -- 3. Prune daily aggregates older than daily cutoff
  WITH deleted_daily_rows AS (
    DELETE FROM public.ops_metric_aggregates
    WHERE resolution = 'DAILY'
      AND bucket_start < v_daily_cutoff
    RETURNING id
  )
  SELECT COUNT(*)::integer INTO v_deleted_daily FROM deleted_daily_rows;

  RETURN jsonb_build_object(
    'success', true,
    'raw_snapshots_pruned', v_deleted_raw,
    'hourly_aggregates_pruned', v_deleted_hourly,
    'daily_aggregates_pruned', v_deleted_daily,
    'raw_cutoff', v_raw_cutoff,
    'hourly_cutoff', v_hourly_cutoff,
    'daily_cutoff', v_daily_cutoff
  );
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.rollup_operations_metric_aggregates(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prune_stale_operations_history(integer, integer, integer) TO authenticated, service_role;
