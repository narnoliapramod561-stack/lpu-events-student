-- ============================================================================
-- Migration: 20261008140000_operations_notifications_and_escalation.sql
-- Description: Super Admin Operations Control Plane Phase 8:
--              Operational Notifications, Policies, Recipients, Outbox Queue,
--              Delivery Attempts, Escalation & Pruning.
-- ============================================================================

-- 1. Operations Notification Recipients Table
CREATE TABLE IF NOT EXISTS public.ops_notification_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ops_recipients_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_ops_notification_recipients_enabled
    ON public.ops_notification_recipients (enabled);

-- 2. Operations Notification Groups Table
CREATE TABLE IF NOT EXISTS public.ops_notification_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Operations Notification Group Members Join Table
CREATE TABLE IF NOT EXISTS public.ops_notification_group_members (
    group_id UUID NOT NULL REFERENCES public.ops_notification_groups(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES public.ops_notification_recipients(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_ops_notification_group_members_recip
    ON public.ops_notification_group_members (recipient_id);

-- 4. Operations Notification Policies Table
CREATE TABLE IF NOT EXISTS public.ops_notification_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    event_type TEXT NOT NULL,
    min_severity TEXT NOT NULL,
    group_id UUID NOT NULL REFERENCES public.ops_notification_groups(id) ON DELETE RESTRICT,
    channel TEXT NOT NULL DEFAULT 'EMAIL',
    cooldown_minutes INTEGER NOT NULL DEFAULT 30,
    enabled BOOLEAN NOT NULL DEFAULT true,
    escalation_delay_minutes INTEGER,
    escalation_group_id UUID REFERENCES public.ops_notification_groups(id) ON DELETE SET NULL,
    repeat_interval_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ops_notif_policy_event_type CHECK (
        event_type IN ('INCIDENT_CREATED', 'INCIDENT_ESCALATED', 'INCIDENT_RESOLVED', 'INCIDENT_MANUALLY_RESOLVED', 'ALERT_TRIGGERED')
    ),
    CONSTRAINT ops_notif_policy_min_severity CHECK (
        min_severity IN ('CRITICAL', 'HIGH', 'WARNING', 'INFO')
    ),
    CONSTRAINT ops_notif_policy_channel CHECK (
        channel IN ('EMAIL')
    ),
    CONSTRAINT ops_notif_policy_cooldown_positive CHECK (
        cooldown_minutes >= 0
    ),
    CONSTRAINT ops_notif_policy_escalation_positive CHECK (
        escalation_delay_minutes IS NULL OR escalation_delay_minutes > 0
    )
);

CREATE INDEX IF NOT EXISTS idx_ops_notification_policies_lookup
    ON public.ops_notification_policies (event_type, min_severity, enabled);

-- 5. Operations Notification Outbox Queue Table
CREATE TABLE IF NOT EXISTS public.ops_notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID REFERENCES public.ops_notification_policies(id) ON DELETE SET NULL,
    incident_id UUID REFERENCES public.ops_incidents(id) ON DELETE CASCADE,
    alert_id UUID REFERENCES public.ops_alerts(id) ON DELETE SET NULL,
    group_id UUID REFERENCES public.ops_notification_groups(id) ON DELETE SET NULL,
    recipient_id UUID REFERENCES public.ops_notification_recipients(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    channel TEXT NOT NULL DEFAULT 'EMAIL',
    subject TEXT NOT NULL,
    content_text TEXT NOT NULL,
    content_html TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    provider TEXT NOT NULL DEFAULT 'resend',
    provider_message_id TEXT,
    safe_error_code TEXT,
    safe_error_message TEXT,
    idempotency_key TEXT NOT NULL UNIQUE,
    escalation_level INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    CONSTRAINT ops_outbox_status_check CHECK (
        status IN ('PENDING', 'PROCESSING', 'REQUEST_ACCEPTED', 'SENT', 'FAILED', 'CANCELLED')
    ),
    CONSTRAINT ops_outbox_channel_check CHECK (
        channel IN ('EMAIL')
    )
);

CREATE INDEX IF NOT EXISTS idx_ops_notification_outbox_process
    ON public.ops_notification_outbox (status, scheduled_at, next_attempt_at)
    WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_ops_notification_outbox_incident
    ON public.ops_notification_outbox (incident_id, created_at DESC);

-- 6. Operations Notification Delivery Attempts Audit Table
CREATE TABLE IF NOT EXISTS public.ops_notification_delivery_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.ops_notification_outbox(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'resend',
    provider_message_id TEXT,
    safe_error_code TEXT,
    safe_error_message TEXT,
    latency_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ops_attempts_status_check CHECK (
        status IN ('REQUEST_ACCEPTED', 'SENT', 'FAILED', 'CANCELLED')
    )
);

CREATE INDEX IF NOT EXISTS idx_ops_delivery_attempts_notif
    ON public.ops_notification_delivery_attempts (notification_id, created_at DESC);

-- 7. Seed Canonical Groups & Initial Policies
INSERT INTO public.ops_notification_groups (group_key, name, description)
VALUES 
    ('OPERATIONS_PRIMARY', 'Primary Operations Team', 'First-line operational on-call responders'),
    ('OPERATIONS_SECONDARY', 'Secondary Operations Team', 'Backup operational responders'),
    ('CRITICAL_ESCALATION', 'Critical Incident Escalation', 'Senior operational escalation targets for unresolved critical incidents')
ON CONFLICT (group_key) DO NOTHING;

DO $$
DECLARE
    v_primary_group UUID;
    v_esc_group UUID;
BEGIN
    SELECT id INTO v_primary_group FROM public.ops_notification_groups WHERE group_key = 'OPERATIONS_PRIMARY';
    SELECT id INTO v_esc_group FROM public.ops_notification_groups WHERE group_key = 'CRITICAL_ESCALATION';

    IF v_primary_group IS NOT NULL THEN
        -- Critical Incident Immediate Policy
        INSERT INTO public.ops_notification_policies (
            policy_key, name, description, event_type, min_severity, group_id, channel, cooldown_minutes, enabled, escalation_delay_minutes, escalation_group_id
        ) VALUES (
            'CRITICAL_INCIDENT_IMMEDIATE_POLICY',
            'Critical Incident Immediate Notification',
            'Dispatches immediate email notification upon creation of CRITICAL incidents with 15m escalation',
            'INCIDENT_CREATED',
            'CRITICAL',
            v_primary_group,
            'EMAIL',
            15,
            true,
            15,
            v_esc_group
        ) ON CONFLICT (policy_key) DO NOTHING;

        -- High Incident Policy
        INSERT INTO public.ops_notification_policies (
            policy_key, name, description, event_type, min_severity, group_id, channel, cooldown_minutes, enabled, escalation_delay_minutes, escalation_group_id
        ) VALUES (
            'HIGH_INCIDENT_POLICY',
            'High Severity Incident Notification',
            'Dispatches email notification upon creation of HIGH severity incidents with 30m escalation',
            'INCIDENT_CREATED',
            'HIGH',
            v_primary_group,
            'EMAIL',
            30,
            true,
            30,
            v_esc_group
        ) ON CONFLICT (policy_key) DO NOTHING;

        -- Incident Recovery Policy
        INSERT INTO public.ops_notification_policies (
            policy_key, name, description, event_type, min_severity, group_id, channel, cooldown_minutes, enabled
        ) VALUES (
            'INCIDENT_RECOVERY_POLICY',
            'Incident Automatic Recovery Notification',
            'Dispatches email confirmation when a previously notifying incident automatically recovers',
            'INCIDENT_RESOLVED',
            'HIGH',
            v_primary_group,
            'EMAIL',
            0,
            true
        ) ON CONFLICT (policy_key) DO NOTHING;

        -- Incident Manual Resolution Policy
        INSERT INTO public.ops_notification_policies (
            policy_key, name, description, event_type, min_severity, group_id, channel, cooldown_minutes, enabled
        ) VALUES (
            'INCIDENT_MANUAL_RESOLUTION_POLICY',
            'Incident Manual Resolution Notification',
            'Dispatches email confirmation with resolution provenance when a Super Admin manually resolves an incident',
            'INCIDENT_MANUALLY_RESOLVED',
            'HIGH',
            v_primary_group,
            'EMAIL',
            0,
            true
        ) ON CONFLICT (policy_key) DO NOTHING;
    END IF;
END $$;

-- 8. Seed Scheduled Jobs into ops_jobs
INSERT INTO public.ops_jobs (
    job_key, display_name, description, job_type, schedule_description, expected_interval_minutes, enabled, criticality, owner, source
) VALUES 
    (
        'notification_delivery',
        'Notification Outbox Delivery Worker',
        'Processes pending operational notifications from ops_notification_outbox via email provider adapter',
        'TELEMETRY',
        'Every 1 minute',
        1,
        true,
        'HIGH',
        'Operations Control Plane',
        'cron'
    ),
    (
        'notification_outbox_prune',
        'Notification History & Outbox Pruning',
        'Prunes delivered and failed notification history older than retention threshold',
        'MAINTENANCE',
        'Daily at 03:30 UTC',
        1440,
        true,
        'LOW',
        'Operations Control Plane',
        'cron'
    )
ON CONFLICT (job_key) DO NOTHING;

-- 9. Pruning Stored Procedure
CREATE OR REPLACE FUNCTION public.prune_stale_operations_notifications(
    p_retention_days INTEGER DEFAULT 14
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_deleted_attempts INTEGER := 0;
    v_deleted_outbox INTEGER := 0;
BEGIN
    -- Verify Super Admin caller if invoked through RPC
    IF auth.role() <> 'service_role' AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access denied. Super Admin privileges required.' USING ERRCODE = '42501';
    END IF;

    v_cutoff := now() - (GREATEST(p_retention_days, 1) || ' days')::INTERVAL;

    -- Delete delivery attempts associated with old terminal notifications
    WITH deleted_attempts AS (
        DELETE FROM public.ops_notification_delivery_attempts
        WHERE created_at < v_cutoff
          AND notification_id IN (
              SELECT id FROM public.ops_notification_outbox
              WHERE status IN ('REQUEST_ACCEPTED', 'SENT', 'FAILED', 'CANCELLED')
          )
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_attempts FROM deleted_attempts;

    -- Delete terminal outbox records older than cutoff (strictly protect PENDING and PROCESSING!)
    WITH deleted_outbox AS (
        DELETE FROM public.ops_notification_outbox
        WHERE created_at < v_cutoff
          AND status IN ('REQUEST_ACCEPTED', 'SENT', 'FAILED', 'CANCELLED')
        RETURNING id
    )
    SELECT count(*) INTO v_deleted_outbox FROM deleted_outbox;

    RETURN jsonb_build_object(
        'success', true,
        'cutoff', v_cutoff,
        'deleted_outbox_records', v_deleted_outbox,
        'deleted_delivery_attempts', v_deleted_attempts
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_stale_operations_notifications(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_stale_operations_notifications(INTEGER) TO authenticated, service_role;

-- 10. Enable Row Level Security
ALTER TABLE public.ops_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_notification_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_notification_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_notification_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_notification_delivery_attempts ENABLE ROW LEVEL SECURITY;

-- 11. Super Admin Only Policies
-- ops_notification_recipients
CREATE POLICY ops_recipients_super_admin_all ON public.ops_notification_recipients
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_recipients_service_role ON public.ops_notification_recipients
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ops_notification_groups
CREATE POLICY ops_groups_super_admin_all ON public.ops_notification_groups
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_groups_service_role ON public.ops_notification_groups
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ops_notification_group_members
CREATE POLICY ops_group_members_super_admin_all ON public.ops_notification_group_members
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_group_members_service_role ON public.ops_notification_group_members
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ops_notification_policies
CREATE POLICY ops_policies_super_admin_all ON public.ops_notification_policies
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_policies_service_role ON public.ops_notification_policies
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ops_notification_outbox
CREATE POLICY ops_outbox_super_admin_all ON public.ops_notification_outbox
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_outbox_service_role ON public.ops_notification_outbox
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- ops_notification_delivery_attempts
CREATE POLICY ops_delivery_attempts_super_admin_all ON public.ops_notification_delivery_attempts
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY ops_delivery_attempts_service_role ON public.ops_notification_delivery_attempts
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);
