-- lpu-events-admin/supabase/migrations/20261008170000_operations_slo_capacity_and_production_readiness.sql
-- LPU Events — Phase 11: SLO, Capacity & Production Readiness Governance
-- Controlled SLI/SLO registry, Error Budget tracking, Capacity analysis, and Production Readiness models.

-- 1. SLI Definitions Table
CREATE TABLE IF NOT EXISTS public.ops_sli_definitions (
    sli_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    service_id TEXT NOT NULL,
    metric_source TEXT NOT NULL,
    calculation_type TEXT NOT NULL CHECK (
        calculation_type IN (
            'AVAILABILITY',
            'ERROR_RATE',
            'SUCCESS_RATE',
            'LATENCY',
            'FRESHNESS',
            'DURATION',
            'RECOVERY_TIME'
        )
    ),
    unit TEXT NOT NULL CHECK (
        unit IN ('PERCENT', 'MILLISECONDS', 'SECONDS', 'COUNT', 'RATIO')
    ),
    aggregation TEXT NOT NULL CHECK (
        aggregation IN ('RATIO', 'P95', 'P99', 'AVERAGE', 'DELTA', 'LATEST')
    ),
    description TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_sli_service
    ON public.ops_sli_definitions (service_id, is_enabled);

-- 2. SLO Definitions Table with Versioning & Effective Dates
CREATE TABLE IF NOT EXISTS public.ops_slo_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slo_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    service_id TEXT NOT NULL,
    sli_key TEXT NOT NULL REFERENCES public.ops_sli_definitions(sli_key) ON DELETE RESTRICT,
    target NUMERIC NOT NULL,
    "window" TEXT NOT NULL CHECK (
        "window" IN ('24h', '7d', '30d', '90d')
    ),
    direction TEXT NOT NULL CHECK (
        direction IN ('GREATER_EQUAL', 'LESS_EQUAL')
    ),
    warning_threshold NUMERIC,
    enabled BOOLEAN NOT NULL DEFAULT true,
    description TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_slo_service_enabled
    ON public.ops_slo_definitions (service_id, enabled);

-- 3. Historical SLO Evaluations Table
CREATE TABLE IF NOT EXISTS public.ops_slo_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slo_key TEXT NOT NULL REFERENCES public.ops_slo_definitions(slo_key) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    "window" TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    actual_value NUMERIC,
    target NUMERIC NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('MEETING', 'AT_RISK', 'BREACHED', 'INSUFFICIENT_DATA', 'NOT_CONFIGURED')
    ),
    error_budget_total NUMERIC,
    error_budget_consumed NUMERIC,
    error_budget_remaining NUMERIC,
    error_budget_percent NUMERIC,
    error_budget_status TEXT CHECK (
        error_budget_status IN ('SAFE', 'WARNING', 'CRITICAL', 'EXHAUSTED')
    ),
    burn_rate NUMERIC,
    data_quality TEXT NOT NULL CHECK (
        data_quality IN ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT', 'NOT_CONFIGURED', 'NOT_AVAILABLE')
    ),
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_slo_eval_lookup
    ON public.ops_slo_evaluations (slo_key, evaluated_at DESC);

-- 4. Capacity Definitions Table
CREATE TABLE IF NOT EXISTS public.ops_capacity_definitions (
    resource_key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (
        category IN ('DATABASE', 'STORAGE', 'WORKER', 'QUEUE', 'EMAIL')
    ),
    unit TEXT NOT NULL CHECK (
        unit IN ('BYTES', 'COUNT', 'PERCENT', 'MILLISECONDS')
    ),
    hard_limit NUMERIC,
    soft_threshold_percent NUMERIC NOT NULL DEFAULT 80.0,
    critical_threshold_percent NUMERIC NOT NULL DEFAULT 90.0,
    source TEXT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_capacity_category
    ON public.ops_capacity_definitions (category, is_enabled);

-- 5. Production Readiness Evaluations Table
CREATE TABLE IF NOT EXISTS public.ops_readiness_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment TEXT NOT NULL CHECK (
        environment IN ('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'UNKNOWN')
    ),
    overall_status TEXT NOT NULL CHECK (
        overall_status IN ('READY', 'READY_WITH_WARNINGS', 'NOT_READY', 'UNKNOWN')
    ),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    evaluated_by TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    checks JSONB NOT NULL DEFAULT '[]'::jsonb,
    blocking_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_readiness_env_eval
    ON public.ops_readiness_evaluations (environment, evaluated_at DESC);

-- 6. Governance Audit Logs Table
CREATE TABLE IF NOT EXISTS public.ops_governance_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (
        entity_type IN ('SLO', 'CAPACITY', 'READINESS')
    ),
    entity_key TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    version INTEGER,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_gov_audit_entity
    ON public.ops_governance_audit_logs (entity_type, entity_key, created_at DESC);

-- 7. Row Level Security Policies
ALTER TABLE public.ops_sli_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_slo_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_slo_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_capacity_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_readiness_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_governance_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow Super Admin and Service Role access
DO $$
BEGIN
    DROP POLICY IF EXISTS "Super admins can view and manage ops_sli_definitions" ON public.ops_sli_definitions;
    CREATE POLICY "Super admins can view and manage ops_sli_definitions"
        ON public.ops_sli_definitions
        FOR ALL
        TO authenticated
        USING (public.is_super_admin())
        WITH CHECK (public.is_super_admin());

    DROP POLICY IF EXISTS "Super admins can view and manage ops_slo_definitions" ON public.ops_slo_definitions;
    CREATE POLICY "Super admins can view and manage ops_slo_definitions"
        ON public.ops_slo_definitions
        FOR ALL
        TO authenticated
        USING (public.is_super_admin())
        WITH CHECK (public.is_super_admin());

    DROP POLICY IF EXISTS "Super admins can view and manage ops_slo_evaluations" ON public.ops_slo_evaluations;
    CREATE POLICY "Super admins can view and manage ops_slo_evaluations"
        ON public.ops_slo_evaluations
        FOR ALL
        TO authenticated
        USING (public.is_super_admin())
        WITH CHECK (public.is_super_admin());

    DROP POLICY IF EXISTS "Super admins can view and manage ops_capacity_definitions" ON public.ops_capacity_definitions;
    CREATE POLICY "Super admins can view and manage ops_capacity_definitions"
        ON public.ops_capacity_definitions
        FOR ALL
        TO authenticated
        USING (public.is_super_admin())
        WITH CHECK (public.is_super_admin());

    DROP POLICY IF EXISTS "Super admins can view and manage ops_readiness_evaluations" ON public.ops_readiness_evaluations;
    CREATE POLICY "Super admins can view and manage ops_readiness_evaluations"
        ON public.ops_readiness_evaluations
        FOR ALL
        TO authenticated
        USING (public.is_super_admin())
        WITH CHECK (public.is_super_admin());

    DROP POLICY IF EXISTS "Super admins can view and manage ops_governance_audit_logs" ON public.ops_governance_audit_logs;
    CREATE POLICY "Super admins can view and manage ops_governance_audit_logs"
        ON public.ops_governance_audit_logs
        FOR ALL
        TO authenticated
        USING (public.is_super_admin())
        WITH CHECK (public.is_super_admin());
END $$;

-- 8. Stored Procedure for Pruning Stale Governance Data
CREATE OR REPLACE FUNCTION public.prune_stale_operations_governance(
    p_retention_days INTEGER DEFAULT 90
)
RETURNS TABLE (
    deleted_evaluations_count INTEGER,
    deleted_readiness_count INTEGER,
    deleted_audit_logs_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_eval_count INTEGER := 0;
    v_ready_count INTEGER := 0;
    v_audit_count INTEGER := 0;
BEGIN
    -- Enforce Super Admin or Service Role
    IF NOT (public.is_super_admin() OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Access denied. Super Admin or service role required.'
            USING ERRCODE = '42501';
    END IF;

    v_cutoff := now() - (GREATER(p_retention_days, 14) || ' days')::INTERVAL;

    -- Delete old SLO evaluations
    WITH deleted_evals AS (
        DELETE FROM public.ops_slo_evaluations
        WHERE evaluated_at < v_cutoff
        RETURNING id
    )
    SELECT count(*)::INTEGER INTO v_eval_count FROM deleted_evals;

    -- Delete old readiness evaluations
    WITH deleted_ready AS (
        DELETE FROM public.ops_readiness_evaluations
        WHERE evaluated_at < v_cutoff
        RETURNING id
    )
    SELECT count(*)::INTEGER INTO v_ready_count FROM deleted_ready;

    -- Delete old governance audit logs (older than 180 days)
    WITH deleted_audits AS (
        DELETE FROM public.ops_governance_audit_logs
        WHERE created_at < (now() - INTERVAL '180 days')
        RETURNING id
    )
    SELECT count(*)::INTEGER INTO v_audit_count FROM deleted_audits;

    RETURN QUERY SELECT v_eval_count, v_ready_count, v_audit_count;
END;
$$;

-- 9. Register Canonical Maintenance Job in ops_jobs
INSERT INTO public.ops_jobs (
    job_key,
    display_name,
    description,
    job_type,
    schedule_description,
    expected_interval_minutes,
    enabled,
    criticality,
    owner,
    source
)
VALUES (
    'governance_eval_prune',
    'Governance History & Readiness Pruning',
    'Prunes historical SLO evaluations and production readiness audit logs older than the retention threshold',
    'MAINTENANCE',
    'Weekly Sunday at 04:00 UTC (0 4 * * 0)',
    10080,
    true,
    'LOW',
    'governance_engine',
    'cron'
)
ON CONFLICT (job_key) DO UPDATE
SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    schedule_description = EXCLUDED.schedule_description,
    expected_interval_minutes = EXCLUDED.expected_interval_minutes,
    updated_at = now();

-- 10. Seed Canonical SLIs
INSERT INTO public.ops_sli_definitions (
    sli_key,
    name,
    service_id,
    metric_source,
    calculation_type,
    unit,
    aggregation,
    description
)
VALUES
(
    'platform.availability',
    'Platform Services Availability',
    'platform',
    'ops_health_probes',
    'AVAILABILITY',
    'PERCENT',
    'RATIO',
    'Ratio of successful health probes to total eligible probe evaluations'
),
(
    'worker.error_rate',
    'Edge Function & Worker Error Rate',
    'cloudflare',
    'ops_metric_snapshots',
    'ERROR_RATE',
    'PERCENT',
    'RATIO',
    'Ratio of worker HTTP 5xx errors to total worker request volume'
),
(
    'maintenance_jobs.success_rate',
    'Maintenance Jobs Success Rate',
    'supabase',
    'ops_job_runs',
    'SUCCESS_RATE',
    'PERCENT',
    'RATIO',
    'Ratio of COMPLETED job executions to total eligible terminal runs'
),
(
    'telemetry.freshness',
    'Operational Telemetry Freshness',
    'telemetry',
    'ops_collection_runs',
    'FRESHNESS',
    'SECONDS',
    'LATEST',
    'Elapsed time in seconds since the most recent telemetry collection run'
),
(
    'incidents.mttr',
    'Mean Time to Recovery (MTTR)',
    'platform',
    'ops_incidents',
    'RECOVERY_TIME',
    'SECONDS',
    'AVERAGE',
    'Average duration in seconds from incident open to verified resolution'
),
(
    'database.query_latency',
    'Database Diagnostics Query Latency',
    'database',
    'ops_health_probes',
    'LATENCY',
    'MILLISECONDS',
    'P95',
    'P95 latency of database diagnostics checks in milliseconds'
)
ON CONFLICT (sli_key) DO UPDATE
SET
    name = EXCLUDED.name,
    service_id = EXCLUDED.service_id,
    calculation_type = EXCLUDED.calculation_type,
    unit = EXCLUDED.unit,
    aggregation = EXCLUDED.aggregation,
    description = EXCLUDED.description,
    updated_at = now();

-- 11. Seed Canonical SLOs
INSERT INTO public.ops_slo_definitions (
    slo_key,
    name,
    service_id,
    sli_key,
    target,
    "window",
    direction,
    warning_threshold,
    description,
    version,
    effective_from
)
VALUES
(
    'slo.platform.availability',
    'Core Platform 99.9% Availability Target',
    'platform',
    'platform.availability',
    99.90,
    '30d',
    'GREATER_EQUAL',
    99.95,
    'Maintains >= 99.9% health probe availability over a rolling 30-day window',
    1,
    now()
),
(
    'slo.worker.error_rate',
    'Edge Worker Sub-1% Error Rate Target',
    'cloudflare',
    'worker.error_rate',
    1.00,
    '24h',
    'LESS_EQUAL',
    0.50,
    'Maintains worker error rate <= 1.0% over rolling 24 hours',
    1,
    now()
),
(
    'slo.maintenance.success_rate',
    'Maintenance Jobs 95% Success Target',
    'supabase',
    'maintenance_jobs.success_rate',
    95.00,
    '7d',
    'GREATER_EQUAL',
    97.00,
    'Maintains >= 95.0% completion rate for scheduled maintenance jobs over 7 days',
    1,
    now()
),
(
    'slo.telemetry.freshness',
    'Operational Telemetry 5-Minute Freshness Target',
    'telemetry',
    'telemetry.freshness',
    300.0,
    '24h',
    'LESS_EQUAL',
    240.0,
    'Ensures telemetry collection latency stays under 300 seconds (5 minutes)',
    1,
    now()
),
(
    'slo.incidents.mttr',
    'Incident Recovery Time Under 1 Hour Target',
    'platform',
    'incidents.mttr',
    3600.0,
    '30d',
    'LESS_EQUAL',
    2700.0,
    'Maintains MTTR under 3600 seconds (1 hour) for operational incidents',
    1,
    now()
)
ON CONFLICT (slo_key) DO UPDATE
SET
    name = EXCLUDED.name,
    target = EXCLUDED.target,
    "window" = EXCLUDED."window",
    direction = EXCLUDED.direction,
    warning_threshold = EXCLUDED.warning_threshold,
    description = EXCLUDED.description,
    updated_at = now();

-- 12. Seed Canonical Capacity Definitions
INSERT INTO public.ops_capacity_definitions (
    resource_key,
    name,
    category,
    unit,
    hard_limit,
    soft_threshold_percent,
    critical_threshold_percent,
    source
)
VALUES
(
    'capacity.database.storage',
    'Database Storage Footprint',
    'DATABASE',
    'BYTES',
    536870912, -- 512 MB Free-tier boundary / Soft quota
    80.0,
    90.0,
    'ops_metric_snapshots:database_size_bytes'
),
(
    'capacity.r2.storage',
    'Cloudflare R2 Media Storage Footprint',
    'STORAGE',
    'BYTES',
    10737418240, -- 10 GB Included Plan Tier
    80.0,
    90.0,
    'ops_metric_snapshots:r2_storage_bytes'
),
(
    'capacity.r2.objects',
    'Cloudflare R2 Media Object Count',
    'STORAGE',
    'COUNT',
    100000, -- 100,000 Objects Tier
    80.0,
    90.0,
    'ops_metric_snapshots:r2_object_count'
),
(
    'capacity.notifications.outbox_queue',
    'Operational Notification Outbox Backlog',
    'QUEUE',
    'COUNT',
    1000, -- 1,000 Pending Messages Safety Limit
    70.0,
    90.0,
    'ops_notification_outbox:pending_count'
),
(
    'capacity.remediation.queue',
    'Remediation Active Execution Backlog',
    'QUEUE',
    'COUNT',
    50, -- 50 Concurrent Active Executions Limit
    60.0,
    80.0,
    'ops_remediation_executions:executing_count'
),
(
    'capacity.resend.daily_emails',
    'Resend Daily Outbound Email Volume',
    'EMAIL',
    'COUNT',
    3000, -- 3,000 Monthly or Daily Quota
    80.0,
    95.0,
    'ops_metric_snapshots:resend_emails_sent'
)
ON CONFLICT (resource_key) DO UPDATE
SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    unit = EXCLUDED.unit,
    hard_limit = EXCLUDED.hard_limit,
    soft_threshold_percent = EXCLUDED.soft_threshold_percent,
    critical_threshold_percent = EXCLUDED.critical_threshold_percent,
    source = EXCLUDED.source,
    updated_at = now();
