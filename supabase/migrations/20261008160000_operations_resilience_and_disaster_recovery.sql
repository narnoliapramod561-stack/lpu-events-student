-- lpu-events-admin/supabase/migrations/20261008160000_operations_resilience_and_disaster_recovery.sql
-- LPU Events — Phase 10: Operational Resilience, Failure Injection & Disaster Recovery
-- Controlled resilience scenario catalog, execution audit log, and fail-closed safety constraints.

-- 1. Resilience Scenarios Catalog Table
CREATE TABLE IF NOT EXISTS public.ops_resilience_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (
        category IN (
            'TELEMETRY_FAILURE',
            'PROVIDER_FAILURE',
            'JOB_FAILURE',
            'ALERTING_FAILURE',
            'NOTIFICATION_FAILURE',
            'REMEDIATION_FAILURE',
            'DATABASE_DEGRADATION',
            'NETWORK_FAILURE',
            'RECOVERY_FAILURE',
            'COMBINED_FAILURE',
            'DISASTER_RECOVERY'
        )
    ),
    risk_level TEXT NOT NULL CHECK (
        risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    ),
    allowed_environments TEXT[] NOT NULL DEFAULT ARRAY['DEVELOPMENT', 'STAGING'],
    is_destructive BOOLEAN NOT NULL DEFAULT false,
    enabled BOOLEAN NOT NULL DEFAULT true,
    expected_detection TEXT NOT NULL,
    expected_recovery TEXT NOT NULL,
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_resilience_scenarios_cat_enabled
    ON public.ops_resilience_scenarios (category, enabled);

-- 2. Resilience Scenario Execution History / Runs Table
CREATE TABLE IF NOT EXISTS public.ops_resilience_test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scenario_key TEXT NOT NULL REFERENCES public.ops_resilience_scenarios(scenario_key) ON DELETE CASCADE,
    environment TEXT NOT NULL CHECK (
        environment IN ('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'UNKNOWN')
    ),
    status TEXT NOT NULL CHECK (
        status IN ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'BLOCKED', 'CANCELLED')
    ),
    correlation_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,
    executed_by TEXT,
    is_simulation BOOLEAN NOT NULL DEFAULT true,
    detection_verified BOOLEAN NOT NULL DEFAULT false,
    recovery_verified BOOLEAN NOT NULL DEFAULT false,
    duration_ms INTEGER,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_code TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ops_resilience_runs_scenario_created
    ON public.ops_resilience_test_runs (scenario_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_resilience_runs_status_created
    ON public.ops_resilience_test_runs (status, created_at DESC);

-- 3. Enable Row-Level Security
ALTER TABLE public.ops_resilience_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_resilience_test_runs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: Strictly Restricted to Super Admin and service_role
CREATE POLICY ops_resilience_scenarios_super_admin_all ON public.ops_resilience_scenarios
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_resilience_scenarios_service_role ON public.ops_resilience_scenarios
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY ops_resilience_test_runs_super_admin_all ON public.ops_resilience_test_runs
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_resilience_test_runs_service_role ON public.ops_resilience_test_runs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. Stored Procedure for Retention Pruning
CREATE OR REPLACE FUNCTION public.prune_stale_operations_resilience_runs(p_retention_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_deleted INTEGER := 0;
BEGIN
    IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access denied. Super Admin privileges required.' USING ERRCODE = '42501';
    END IF;

    v_cutoff := now() - (GREATEST(p_retention_days, 1) || ' days')::INTERVAL;

    WITH deleted_rows AS (
        DELETE FROM public.ops_resilience_test_runs
        WHERE created_at < v_cutoff
          AND status IN ('PASSED', 'FAILED', 'BLOCKED', 'CANCELLED')
        RETURNING id
    )
    SELECT count(*) INTO v_deleted FROM deleted_rows;

    RETURN jsonb_build_object(
        'success', true,
        'cutoff', v_cutoff,
        'deleted_resilience_runs', v_deleted
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_stale_operations_resilience_runs(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_stale_operations_resilience_runs(INTEGER) TO authenticated, service_role;

-- 6. Register canonical job in ops_jobs
INSERT INTO public.ops_jobs (
    job_key, display_name, description, job_type, schedule_description, expected_interval_minutes, enabled, criticality, owner, source
) VALUES 
    (
        'resilience_test_prune',
        'Resilience Test Runs History Retention Prune',
        'Prunes historical resilience scenario run executions older than retention window',
        'MAINTENANCE',
        'Daily at 04:30 UTC',
        1440,
        true,
        'LOW',
        'Operations Control Plane',
        'SYSTEM'
    )
ON CONFLICT (job_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    enabled = EXCLUDED.enabled;

-- 7. Seed Canonical 22 Failure Scenarios (Section 50)
INSERT INTO public.ops_resilience_scenarios (
    scenario_key, name, description, category, risk_level, allowed_environments, is_destructive, enabled, expected_detection, expected_recovery, timeout_ms
) VALUES
(
    'provider.unavailable',
    'Provider Outage Simulation',
    'Simulates complete unavailability of external cloud provider adapter (HTTP 503 / connection refused)',
    'PROVIDER_FAILURE',
    'MEDIUM',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Health probe marks provider UNAVAILABLE, alert rule evaluates failure, incident created if policy dictates',
    'Provider returns healthy probe, alert resolves, incident transitions to AUTO_RECOVERY',
    30000
),
(
    'provider.timeout',
    'Provider API Latency Timeout',
    'Simulates gateway/adapter timeout exceeding configured threshold when probing provider endpoints',
    'PROVIDER_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Probe latency spike recorded, probe fails with TIMEOUT status',
    'Subsequent probe completes within latency budget, status returns to HEALTHY',
    30000
),
(
    'telemetry.stale',
    'Telemetry Ingestion Staleness',
    'Simulates collection worker cessation leading to telemetry exceeding freshness thresholds',
    'TELEMETRY_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Stale telemetry detector flags latest collection >5m old, UI surfaces STALE warning indicator',
    'Collection run executes, latest_collection_run updates, STALE indicator clears',
    30000
),
(
    'telemetry.missing',
    'Missing Metric Observations',
    'Simulates absent metric readings from partial collection runs without fabricating zeroes',
    'TELEMETRY_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Data quality evaluator marks metric series INSUFFICIENT_DATA without triggering false positive alerts',
    'Telemetry collection resumes, valid metric points ingested, data quality restored to SUFFICIENT',
    30000
),
(
    'job.failure',
    'Maintenance Job Execution Crash',
    'Simulates unhandled exception in background maintenance job worker',
    'JOB_FAILURE',
    'MEDIUM',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Job run record transitions to FAILED with error summary, JOB_FAILURE alert evaluates and creates incident',
    'Safe runbook job.retry_safe_run succeeds, next scheduled run finishes COMPLETED, incident resolves',
    45000
),
(
    'job.stale',
    'Maintenance Job Cadence Stall',
    'Simulates a scheduled maintenance job that has missed its expected execution window (>2x cadence)',
    'JOB_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Cadence evaluator flags job as STALE, JOB_STALENESS alert triggers',
    'Job executes and completes, last_run_at updates, STALE state clears',
    30000
),
(
    'alert.evaluator_interruption',
    'Alert Evaluator Worker Interruption',
    'Simulates sudden worker termination mid-evaluation, testing single-flight lease recovery and state continuity',
    'ALERTING_FAILURE',
    'MEDIUM',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Active evaluation lock expires without releasing, lease recovery kicks in on next invocation',
    'Next evaluation cycle acquires lock, evaluates all rules, zero duplicate alerts or incidents created',
    30000
),
(
    'notification.provider_outage',
    'Notification Delivery Provider Outage',
    'Simulates Resend / email provider complete outage during critical incident dispatch',
    'NOTIFICATION_FAILURE',
    'MEDIUM',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Delivery attempts transition to FAILED with retry schedule, anti-recursion stops notification alert loop',
    'Provider restores, delivery retry worker processes outbox queue, notification delivers successfully',
    45000
),
(
    'notification.worker_crash',
    'Notification Outbox Worker Crash',
    'Simulates outbox processor termination during batch delivery processing',
    'NOTIFICATION_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Claimed outbox items remain in PROCESSING until lock expiry, item not dropped',
    'Next delivery worker run reclaims stuck outbox items, dispatches cleanly without duplication',
    30000
),
(
    'remediation.worker_crash',
    'Remediation Worker Crash Mid-Flight',
    'Simulates termination while remediation is in EXECUTING state',
    'REMEDIATION_FAILURE',
    'HIGH',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Remediation execution remains in EXECUTING, single-flight protects against concurrent duplicate runs',
    'Authoritative verification determines whether underlying action completed, reconciles to COMPLETED or FAILED',
    60000
),
(
    'remediation.timeout',
    'Remediation Action Timeout',
    'Simulates remediation handler exceeding action timeout budget',
    'REMEDIATION_FAILURE',
    'MEDIUM',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Remediation transitions to FAILED with safe_error_code TIMEOUT, incident remains active',
    'Super Admin notified of remediation failure, runbook cooldown respected',
    45000
),
(
    'remediation.verification_failure',
    'Remediation Post-Action Verification Mismatch',
    'Simulates action execution returning 200/success but authoritative system condition failing verification',
    'REMEDIATION_FAILURE',
    'MEDIUM',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Execution strictly marked FAILED (never false COMPLETED), safe_error_code POST_VERIFICATION_FAILED',
    'Incident remains OPEN, escalation continues, truthfulness preserved',
    30000
),
(
    'rollback.failure',
    'Remediation Rollback Failure',
    'Simulates failure during automated rollback execution',
    'RECOVERY_FAILURE',
    'HIGH',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Rollback transitions to ROLLBACK_FAILED, incident timeline records failure event',
    'Super Admin alerted immediately, incident requires manual operator intervention',
    45000
),
(
    'remediation.duplicate_attempt',
    'Concurrent Duplicate Remediation Flood',
    'Simulates 100 simultaneous remediation execution requests for the same incident and action',
    'REMEDIATION_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Database uniqueness on idempotency_key and single-flight lock rejects 99 requests',
    'Exactly one effective remediation executed, zero duplicate side-effects',
    30000
),
(
    'analytics.rollup_failure',
    'Historical Analytics Rollup Failure',
    'Simulates rollup job timeout or query failure during hourly aggregation',
    'COMBINED_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Rollup job records failure, current operational dashboard and live probes remain 100% operational',
    'Next hourly rollup re-evaluates missed window with idempotent ON CONFLICT updates',
    45000
),
(
    'gateway.timeout',
    'Operations Gateway Endpoint Timeout',
    'Simulates Operations Gateway Edge Function timeout from client SDK perspective',
    'NETWORK_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Client SDK catches TIMEOUT error code, UI preserves last known good state with stale banner',
    'Gateway recovers, client refresh replaces stale data with authoritative fresh state',
    30000
),
(
    'combined.subsystem_failure',
    'Multi-Subsystem Cascading Failure',
    'Simulates simultaneous provider outage, notification delay, and stale telemetry',
    'COMBINED_FAILURE',
    'HIGH',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Subsystems fail independently without cascading crash; incident created, notification queued, telemetry truth preserved',
    'Subsystems recover in isolation, each returning to HEALTHY without cross-subsystem deadlocks',
    60000
),
(
    'recovery.provider_outage',
    'Full Natural Recovery After Provider Outage',
    'Validates complete end-to-end recovery sequence without manual intervention',
    'RECOVERY_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Provider outage creates HIGH incident and dispatches notification',
    'Provider restores, probe succeeds, alert clears, incident automatically transitions to RESOLVED with AUTO_RECOVERY provenance',
    45000
),
(
    'recovery.job_failure',
    'Maintenance Job Natural Recovery',
    'Validates incident resolution when a previously failing maintenance job subsequently succeeds',
    'RECOVERY_FAILURE',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Failing job triggers incident',
    'Subsequent scheduled run finishes COMPLETED, alert evaluator marks alert resolved, incident auto-recovers',
    45000
),
(
    'recovery.remediation_assisted',
    'Remediation-Assisted Recovery Sequence',
    'Validates incident resolution achieved via approved remediation runbook execution',
    'RECOVERY_FAILURE',
    'MEDIUM',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'Incident triggers recommended runbook; runbook executed, verified, and records success event',
    'Authoritative state recovery closes incident, timeline records REMEDIATION_SUCCEEDED alongside resolution',
    60000
),
(
    'disaster_recovery.backup_validation',
    'Production Backup Verification & Integrity Check',
    'Validates existence, recency (<24h), encryption, and structural validity of production database backups',
    'DISASTER_RECOVERY',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING', 'PRODUCTION'],
    false,
    true,
    'Verifies backup catalog records valid timestamp, non-zero byte size, and encryption headers',
    'Restoration test into isolated staging target validates table counts and row integrity within RTO/RPO limits',
    60000
),
(
    'disaster_recovery.migration_replay',
    'Database Migration Sequence Replay',
    'Validates that full 52-migration canonical sequence can be replayed from scratch on fresh database',
    'DISASTER_RECOVERY',
    'LOW',
    ARRAY['DEVELOPMENT', 'STAGING'],
    false,
    true,
    'All migrations execute in strict order without dependency failure or syntax error',
    'Schema parity check confirms complete table, function, index, and RLS constraint alignment',
    60000
)
ON CONFLICT (scenario_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    risk_level = EXCLUDED.risk_level,
    allowed_environments = EXCLUDED.allowed_environments,
    expected_detection = EXCLUDED.expected_detection,
    expected_recovery = EXCLUDED.expected_recovery,
    timeout_ms = EXCLUDED.timeout_ms;
