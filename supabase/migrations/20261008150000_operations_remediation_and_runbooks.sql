-- lpu-events-admin/supabase/migrations/20261008150000_operations_remediation_and_runbooks.sql
-- LPU Events — Phase 9: Safe Operational Remediation & Runbooks
-- Controlled runbook registry, allowlisted remediation actions, execution audit trail, and approval state machine.

-- 1. Runbook Registry Table
CREATE TABLE IF NOT EXISTS public.ops_runbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    runbook_key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (
        category IN ('DATABASE', 'TELEMETRY', 'MAINTENANCE', 'NOTIFICATIONS', 'ANALYTICS', 'GENERAL')
    ),
    risk_level TEXT NOT NULL CHECK (
        risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    ),
    execution_mode TEXT NOT NULL CHECK (
        execution_mode IN ('OBSERVE_ONLY', 'AUTOMATIC', 'APPROVAL_REQUIRED')
    ),
    enabled BOOLEAN NOT NULL DEFAULT true,
    version TEXT NOT NULL DEFAULT '1.0.0',
    preconditions_description TEXT NOT NULL,
    postconditions_description TEXT NOT NULL,
    instructions_markdown TEXT NOT NULL,
    supports_rollback BOOLEAN NOT NULL DEFAULT false,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    target_service_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_runbooks_category_risk
    ON public.ops_runbooks (category, risk_level, enabled);

-- 2. Allowlisted Remediation Actions Catalog Table
CREATE TABLE IF NOT EXISTS public.ops_remediation_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_key TEXT UNIQUE NOT NULL,
    runbook_id UUID NOT NULL REFERENCES public.ops_runbooks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    handler_key TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (
        risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    ),
    supports_auto_execution BOOLEAN NOT NULL DEFAULT false,
    supports_rollback BOOLEAN NOT NULL DEFAULT false,
    rollback_action_key TEXT,
    requires_approval BOOLEAN NOT NULL DEFAULT false,
    timeout_ms INTEGER NOT NULL DEFAULT 30000,
    cooldown_minutes INTEGER NOT NULL DEFAULT 15,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    allowed_environments TEXT[] NOT NULL DEFAULT ARRAY['DEVELOPMENT', 'STAGING', 'PRODUCTION'],
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_remediation_actions_runbook
    ON public.ops_remediation_actions (runbook_id, enabled);

-- 3. Remediation Executions History Table
CREATE TABLE IF NOT EXISTS public.ops_remediation_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID REFERENCES public.ops_incidents(id) ON DELETE SET NULL,
    runbook_id UUID REFERENCES public.ops_runbooks(id) ON DELETE SET NULL,
    action_key TEXT NOT NULL,
    execution_mode TEXT NOT NULL CHECK (
        execution_mode IN ('OBSERVE_ONLY', 'AUTOMATIC', 'APPROVAL_REQUIRED', 'DRY_RUN')
    ),
    status TEXT NOT NULL CHECK (
        status IN (
            'PROPOSED',
            'PENDING_APPROVAL',
            'APPROVED',
            'REJECTED',
            'EXECUTING',
            'COMPLETED',
            'FAILED',
            'ROLLED_BACK',
            'ROLLBACK_FAILED',
            'CANCELLED',
            'EXPIRED'
        )
    ),
    is_dry_run BOOLEAN NOT NULL DEFAULT false,
    requested_by TEXT NOT NULL,
    approved_by TEXT,
    executed_by TEXT,
    environment TEXT NOT NULL CHECK (
        environment IN ('DEVELOPMENT', 'STAGING', 'PRODUCTION', 'UNKNOWN')
    ),
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    precondition_check JSONB NOT NULL DEFAULT '{}'::jsonb,
    postcondition_verification JSONB NOT NULL DEFAULT '{}'::jsonb,
    safe_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    safe_error_code TEXT,
    safe_error_message TEXT,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    approval_expires_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE NOT NULL,
    correlation_id TEXT NOT NULL,
    job_run_id UUID REFERENCES public.ops_job_runs(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_remediation_executions_incident
    ON public.ops_remediation_executions (incident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_remediation_executions_status
    ON public.ops_remediation_executions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ops_remediation_executions_action
    ON public.ops_remediation_executions (action_key, created_at DESC);

-- 4. Enable Row Level Security
ALTER TABLE public.ops_runbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_remediation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_remediation_executions ENABLE ROW LEVEL SECURITY;

-- Super Admin and Service Role RLS Policies
-- ops_runbooks
CREATE POLICY ops_runbooks_super_admin_all ON public.ops_runbooks
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_runbooks_service_role ON public.ops_runbooks
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ops_remediation_actions
CREATE POLICY ops_remediation_actions_super_admin_all ON public.ops_remediation_actions
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_remediation_actions_service_role ON public.ops_remediation_actions
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ops_remediation_executions
CREATE POLICY ops_remediation_executions_super_admin_all ON public.ops_remediation_executions
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_remediation_executions_service_role ON public.ops_remediation_executions
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- 5. Stored Procedure for Bounded History Retention Pruning
CREATE OR REPLACE FUNCTION public.prune_stale_operations_remediations(
    p_retention_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_deleted INTEGER := 0;
BEGIN
    -- Verify Super Admin caller if invoked through RPC
    IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access denied. Super Admin privileges required.' USING ERRCODE = '42501';
    END IF;

    v_cutoff := now() - (GREATEST(p_retention_days, 1) || ' days')::INTERVAL;

    -- Prune only terminal executions (strictly protect active PROPOSED, PENDING_APPROVAL, APPROVED, EXECUTING)
    WITH deleted_rows AS (
        DELETE FROM public.ops_remediation_executions
        WHERE created_at < v_cutoff
          AND status IN (
              'COMPLETED',
              'FAILED',
              'ROLLED_BACK',
              'ROLLBACK_FAILED',
              'CANCELLED',
              'EXPIRED',
              'REJECTED'
          )
        RETURNING id
    )
    SELECT count(*) INTO v_deleted FROM deleted_rows;

    RETURN jsonb_build_object(
        'success', true,
        'cutoff', v_cutoff,
        'deleted_remediation_executions', v_deleted
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_stale_operations_remediations(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_stale_operations_remediations(INTEGER) TO authenticated, service_role;

-- 6. Seed Scheduled Jobs into ops_jobs
INSERT INTO public.ops_jobs (
    job_key, display_name, description, job_type, schedule_description, expected_interval_minutes, enabled, criticality, owner, source
) VALUES 
    (
        'remediation_worker',
        'Operational Remediation Execution & Expiry Worker',
        'Reconciles pending approved remediations and expires stale remediation approval requests',
        'MAINTENANCE',
        'Every 5 minutes',
        5,
        true,
        'HIGH',
        'Operations Control Plane',
        'cron'
    ),
    (
        'remediation_history_prune',
        'Remediation Execution History Pruning',
        'Prunes terminal remediation execution history older than retention threshold',
        'MAINTENANCE',
        'Daily at 04:30 UTC',
        1440,
        true,
        'LOW',
        'Operations Control Plane',
        'cron'
    )
ON CONFLICT (job_key) DO NOTHING;

-- 7. Seed Canonical Runbooks & Actions
DO $$
DECLARE
    v_rb_telemetry UUID;
    v_rb_job UUID;
    v_rb_rollup UUID;
    v_rb_notif UUID;
    v_rb_size UUID;
    v_rb_cache UUID;
    v_rb_ext_outage UUID;
    v_rb_pool UUID;
BEGIN
    -- Runbook 1: Refresh Provider Telemetry (Level 1: Safe Automatic)
    INSERT INTO public.ops_runbooks (
        runbook_key, name, description, category, risk_level, execution_mode, enabled, version,
        preconditions_description, postconditions_description, instructions_markdown, supports_rollback, requires_approval
    ) VALUES (
        'RUNBOOK_TELEMETRY_REFRESH',
        'Refresh Provider Infrastructure Telemetry',
        'Re-executes provider telemetry collection when health probes or metric snapshots are stale or missing.',
        'TELEMETRY',
        'LOW',
        'AUTOMATIC',
        true,
        '1.0.0',
        'No active collection run in progress. Target provider credentials configured.',
        'Fresh metric snapshot created within past 2 minutes and valid health probe status.',
        '### Operational Runbook: Refresh Telemetry\n1. Automatically triggered if telemetry probe reports STALE.\n2. Re-runs server-side provider adapters (Supabase, Cloudflare, Resend, Sentry).\n3. Re-evaluates health probe states.',
        false,
        false
    ) ON CONFLICT (runbook_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_rb_telemetry;

    -- Runbook 2: Retry Failed Maintenance Job (Level 1: Safe Automatic)
    INSERT INTO public.ops_runbooks (
        runbook_key, name, description, category, risk_level, execution_mode, enabled, version,
        preconditions_description, postconditions_description, instructions_markdown, supports_rollback, requires_approval
    ) VALUES (
        'RUNBOOK_MAINTENANCE_JOB_RETRY',
        'Retry Failed Operations Maintenance Job',
        'Re-executes a failed or stale idempotent background maintenance job execution.',
        'MAINTENANCE',
        'LOW',
        'AUTOMATIC',
        true,
        '1.0.0',
        'Job is currently enabled. No active execution currently marked RUNNING.',
        'Job execution completes with COMPLETED status and 0 error records.',
        '### Operational Runbook: Retry Maintenance Job\n1. Validates that previous execution failed due to transient network or lease conflict.\n2. Starts single-flight execution lease.\n3. Verifies post-execution job state.',
        false,
        false
    ) ON CONFLICT (runbook_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_rb_job;

    -- Runbook 3: Rebuild Historical Metrics Rollup (Level 1: Safe Automatic)
    INSERT INTO public.ops_runbooks (
        runbook_key, name, description, category, risk_level, execution_mode, enabled, version,
        preconditions_description, postconditions_description, instructions_markdown, supports_rollback, requires_approval
    ) VALUES (
        'RUNBOOK_ANALYTICS_ROLLUP_REBUILD',
        'Rebuild Historical Analytics Metric Rollup',
        'Re-computes hourly and daily statistical rollups into ops_metric_aggregates for gap recovery.',
        'ANALYTICS',
        'LOW',
        'AUTOMATIC',
        true,
        '1.0.0',
        'Historical metric snapshots exist for target window. No concurrent rollup currently running.',
        'Rollup bucket populated in ops_metric_aggregates with valid min, max, avg, and count.',
        '### Operational Runbook: Rebuild Analytics Rollup\n1. Gathers unaggregated metric snapshots from target time window.\n2. Computes aggregations via server-side RPC.\n3. Updates ops_metric_aggregates idempotently.',
        false,
        false
    ) ON CONFLICT (runbook_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_rb_rollup;

    -- Runbook 4: Flush Notification Outbox Queue (Level 1: Safe Automatic)
    INSERT INTO public.ops_runbooks (
        runbook_key, name, description, category, risk_level, execution_mode, enabled, version,
        preconditions_description, postconditions_description, instructions_markdown, supports_rollback, requires_approval
    ) VALUES (
        'RUNBOOK_NOTIFICATION_OUTBOX_FLUSH',
        'Flush Operational Notification Outbox Queue',
        'Triggers immediate single-flight delivery for pending operational notifications.',
        'NOTIFICATIONS',
        'LOW',
        'AUTOMATIC',
        true,
        '1.0.0',
        'Pending outbox records exist with attempt_count < max_attempts. Resend provider configured.',
        'Pending notifications transition to REQUEST_ACCEPTED status with provider_message_id recorded.',
        '### Operational Runbook: Flush Notification Outbox\n1. Claims pending batch with status = PROCESSING.\n2. Dispatches emails via Resend server-side adapter.\n3. Records delivery attempt audit records.',
        false,
        false
    ) ON CONFLICT (runbook_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_rb_notif;

    -- Runbook 5: Database Size Guardrail Reclaim (Level 2: Approval Required)
    INSERT INTO public.ops_runbooks (
        runbook_key, name, description, category, risk_level, execution_mode, enabled, version,
        preconditions_description, postconditions_description, instructions_markdown, supports_rollback, requires_approval
    ) VALUES (
        'RUNBOOK_DATABASE_SIZE_GUARDRAIL',
        'Database Size Guardrail Verification & Prune',
        'Executes bounded cleanup of expired operational telemetry and temporary tables to reclaim storage.',
        'DATABASE',
        'MEDIUM',
        'APPROVAL_REQUIRED',
        true,
        '1.0.0',
        'Database total size exceeds warning threshold (>350MB). Super Admin approval granted.',
        'Stale telemetry pruned and database storage size stabilizes below warning ceiling.',
        '### Operational Runbook: Database Guardrail\n1. Requires explicit Super Admin approval.\n2. Prunes telemetry records older than retention period.\n3. Does NOT truncate or delete business tables.',
        false,
        true
    ) ON CONFLICT (runbook_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_rb_size;

    -- Runbook 6: Refresh Derived Operations Health Cache (Level 1: Safe Automatic)
    INSERT INTO public.ops_runbooks (
        runbook_key, name, description, category, risk_level, execution_mode, enabled, version,
        preconditions_description, postconditions_description, instructions_markdown, supports_rollback, requires_approval
    ) VALUES (
        'RUNBOOK_CACHE_DERIVED_REFRESH',
        'Refresh Derived Operational Health Cache',
        'Forces re-evaluation of service registry health statuses and active incident counts.',
        'GENERAL',
        'LOW',
        'AUTOMATIC',
        true,
        '1.0.0',
        'No preconditions required.',
        'Updated overview health state returned.',
        '### Operational Runbook: Refresh Cache\nRecomputes derived health flags across all registered services.',
        false,
        false
    ) ON CONFLICT (runbook_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_rb_cache;

    -- Runbook 7: External Provider Outage (Level 0: Observe Only)
    INSERT INTO public.ops_runbooks (
        runbook_key, name, description, category, risk_level, execution_mode, enabled, version,
        preconditions_description, postconditions_description, instructions_markdown, supports_rollback, requires_approval
    ) VALUES (
        'RUNBOOK_EXTERNAL_PROVIDER_OUTAGE',
        'External Upstream Provider Outage Response',
        'Operator guidance for third-party upstream outages (Cloudflare, Supabase, Resend, Sentry). Automated remediation is unsafe.',
        'GENERAL',
        'HIGH',
        'OBSERVE_ONLY',
        true,
        '1.0.0',
        'Provider health probe UNAVAILABLE or error rate spike detected.',
        'External status dashboard confirms recovery and health probe returns to HEALTHY.',
        '### Operational Guidance (Observe Only)\n1. Check official provider status pages:\n   - Cloudflare: https://www.cloudflarestatus.com/\n   - Supabase: https://status.supabase.com/\n   - Resend: https://resend-status.com/\n2. Confirm whether outage is regional or global.\n3. Do NOT rotate production secrets or wipe caches during an external outage.\n4. Monitor automatic recovery once provider restores connectivity.',
        false,
        false
    ) ON CONFLICT (runbook_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_rb_ext_outage;

    -- Runbook 8: Database Connection Contention (Level 0: Observe Only)
    INSERT INTO public.ops_runbooks (
        runbook_key, name, description, category, risk_level, execution_mode, enabled, version,
        preconditions_description, postconditions_description, instructions_markdown, supports_rollback, requires_approval
    ) VALUES (
        'RUNBOOK_DATABASE_CONNECTION_CONTENTION',
        'Database Connection Pool Contention Triage',
        'Operator guidance for database connection pool exhaustion or high lock contention.',
        'DATABASE',
        'CRITICAL',
        'OBSERVE_ONLY',
        true,
        '1.0.0',
        'Elevated database latency (>2000ms) or max connections alert active.',
        'Active pool connection count falls below 70% threshold and query latency normalizes.',
        '### Operational Guidance (Observe Only)\n1. Open Supabase Dashboard -> Database -> Connection Pooler.\n2. Inspect active client connections and idle transactions in transaction pool.\n3. Identify slow unindexed queries in pg_stat_statements.\n4. Avoid terminating random backend processes; allow graceful timeout.',
        false,
        false
    ) ON CONFLICT (runbook_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_rb_pool;

    -- Seed Associated Allowlisted Actions
    IF v_rb_telemetry IS NOT NULL THEN
        INSERT INTO public.ops_remediation_actions (
            action_key, runbook_id, name, description, handler_key, risk_level, supports_auto_execution, supports_rollback, requires_approval, cooldown_minutes
        ) VALUES (
            'telemetry.recollect',
            v_rb_telemetry,
            'Recollect Provider Telemetry',
            'Executes provider health probes and updates operational metric snapshots',
            'handler_telemetry_recollect',
            'LOW',
            true,
            false,
            false,
            5
        ) ON CONFLICT (action_key) DO NOTHING;
    END IF;

    IF v_rb_job IS NOT NULL THEN
        INSERT INTO public.ops_remediation_actions (
            action_key, runbook_id, name, description, handler_key, risk_level, supports_auto_execution, supports_rollback, requires_approval, cooldown_minutes
        ) VALUES (
            'job.retry_safe_run',
            v_rb_job,
            'Retry Maintenance Job Run',
            'Retries an idempotent background maintenance job',
            'handler_job_retry',
            'LOW',
            true,
            false,
            false,
            10
        ) ON CONFLICT (action_key) DO NOTHING;
    END IF;

    IF v_rb_rollup IS NOT NULL THEN
        INSERT INTO public.ops_remediation_actions (
            action_key, runbook_id, name, description, handler_key, risk_level, supports_auto_execution, supports_rollback, requires_approval, cooldown_minutes
        ) VALUES (
            'analytics.rebuild_rollup',
            v_rb_rollup,
            'Rebuild Historical Rollup',
            'Rebuilds historical aggregations for the target time bucket',
            'handler_analytics_rebuild_rollup',
            'LOW',
            true,
            false,
            false,
            15
        ) ON CONFLICT (action_key) DO NOTHING;
    END IF;

    IF v_rb_notif IS NOT NULL THEN
        INSERT INTO public.ops_remediation_actions (
            action_key, runbook_id, name, description, handler_key, risk_level, supports_auto_execution, supports_rollback, requires_approval, cooldown_minutes
        ) VALUES (
            'notification.retry_delivery',
            v_rb_notif,
            'Flush Notification Queue',
            'Dispatches pending operational notification outbox records',
            'handler_notification_flush',
            'LOW',
            true,
            false,
            false,
            5
        ) ON CONFLICT (action_key) DO NOTHING;
    END IF;

    IF v_rb_size IS NOT NULL THEN
        INSERT INTO public.ops_remediation_actions (
            action_key, runbook_id, name, description, handler_key, risk_level, supports_auto_execution, supports_rollback, requires_approval, cooldown_minutes
        ) VALUES (
            'database.run_size_guardrail',
            v_rb_size,
            'Execute Database Size Guardrail',
            'Reclaims storage by pruning stale telemetry older than retention limits',
            'handler_database_size_guardrail',
            'MEDIUM',
            false,
            false,
            true,
            30
        ) ON CONFLICT (action_key) DO NOTHING;
    END IF;

    IF v_rb_cache IS NOT NULL THEN
        INSERT INTO public.ops_remediation_actions (
            action_key, runbook_id, name, description, handler_key, risk_level, supports_auto_execution, supports_rollback, requires_approval, cooldown_minutes
        ) VALUES (
            'cache.refresh_derived_operations',
            v_rb_cache,
            'Refresh Operations State Cache',
            'Forces re-evaluation of service registry and health summary cache',
            'handler_cache_refresh',
            'LOW',
            true,
            false,
            false,
            5
        ) ON CONFLICT (action_key) DO NOTHING;
    END IF;
END $$;
