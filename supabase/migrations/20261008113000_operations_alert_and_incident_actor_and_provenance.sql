-- 20261008113000_operations_alert_and_incident_actor_and_provenance.sql
-- Super Admin Operations Control Plane — Phase 5 Final Certification:
-- Actor Attribution Integrity & Resolution Provenance Hardening.
-- Enforces internal server-side actor resolution (zero client-forged identity)
-- and distinguishes automatic recovery vs manual resolution.

-- ============================================================================
-- 1. Add resolution_type column to ops_incidents
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ops_incidents'
      AND column_name = 'resolution_type'
  ) THEN
    ALTER TABLE public.ops_incidents
      ADD COLUMN resolution_type text CHECK (
        resolution_type IS NULL OR resolution_type IN ('AUTO_RECOVERY', 'MANUAL')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ops_incidents_resolution_provenance
  ON public.ops_incidents (status, resolution_type, resolved_at DESC);

-- ============================================================================
-- 2. Authoritative Incident Acknowledgement RPC with Internal Actor Derivation
-- ============================================================================
DROP FUNCTION IF EXISTS public.acknowledge_operations_incident(uuid, text);
DROP FUNCTION IF EXISTS public.acknowledge_operations_incident(uuid);

CREATE OR REPLACE FUNCTION public.acknowledge_operations_incident(
  p_incident_id uuid,
  p_actor_id text DEFAULT NULL
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
  v_resolved_actor text;
  v_auth_uid uuid := auth.uid();
  v_auth_role text := auth.role();
BEGIN
  -- 1. Strict Actor Resolution & Super Admin Enforcement
  IF v_auth_uid IS NOT NULL THEN
    -- Authenticated session: authoritative actor MUST be derived from session identity
    SELECT u.id::text INTO v_resolved_actor
    FROM public.admin_users u
    JOIN public.platform_admin_roles r ON r.admin_user_id = u.id
    WHERE u.auth_user_id = v_auth_uid
      AND u.is_active = true
      AND r.role = 'SUPER_ADMIN';

    IF v_resolved_actor IS NULL THEN
      RAISE EXCEPTION 'Access denied: Caller is not an authorized Super Admin.'
        USING ERRCODE = '42501';
    END IF;

    -- Reject forged actor identity if client attempted to supply a different actor
    IF p_actor_id IS NOT NULL AND p_actor_id <> v_resolved_actor AND p_actor_id <> v_auth_uid::text THEN
      RAISE EXCEPTION 'Access denied: Forged actor identity rejected. Actor must match authenticated identity.'
        USING ERRCODE = '42501';
    END IF;

  ELSIF v_auth_role = 'service_role' THEN
    -- Trusted service role: validate that supplied actor is a valid Super Admin or internal system
    IF p_actor_id IS NOT NULL AND p_actor_id <> 'system' AND p_actor_id <> 'super_admin' AND p_actor_id <> 'alert_rule_evaluation' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.admin_users u
        JOIN public.platform_admin_roles r ON r.admin_user_id = u.id
        WHERE (u.id::text = p_actor_id OR u.auth_user_id::text = p_actor_id)
          AND u.is_active = true
          AND r.role = 'SUPER_ADMIN'
      ) THEN
        RAISE EXCEPTION 'Access denied: Actor % is not a registered Super Admin.', p_actor_id
          USING ERRCODE = '42501';
      END IF;
      v_resolved_actor := p_actor_id;
    ELSE
      v_resolved_actor := COALESCE(p_actor_id, 'super_admin');
    END IF;

  ELSE
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
    acknowledged_by = v_resolved_actor,
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

  -- 5. Record incident timeline event with authoritative actor
  INSERT INTO public.ops_incident_events (
    incident_id, event_type, actor_type, actor_id, occurred_at, metadata
  ) VALUES (
    p_incident_id,
    'INCIDENT_ACKNOWLEDGED',
    'SUPER_ADMIN',
    v_resolved_actor,
    v_now,
    jsonb_build_object(
      'acknowledged_by', v_resolved_actor,
      'alerts_acknowledged', v_alert_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'incident_id', p_incident_id,
    'status', 'ACKNOWLEDGED',
    'acknowledged_at', v_now,
    'acknowledged_by', v_resolved_actor,
    'alerts_acknowledged', v_alert_count
  );
END;
$$;

-- Overloaded 1-parameter signature for direct client invocation
CREATE OR REPLACE FUNCTION public.acknowledge_operations_incident(
  p_incident_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.acknowledge_operations_incident(p_incident_id, NULL);
END;
$$;

-- ============================================================================
-- 3. Authoritative Manual Resolution RPC with Internal Actor & Provenance
-- ============================================================================
DROP FUNCTION IF EXISTS public.resolve_operations_incident(uuid, text, text);
DROP FUNCTION IF EXISTS public.resolve_operations_incident(uuid, text);

CREATE OR REPLACE FUNCTION public.resolve_operations_incident(
  p_incident_id uuid,
  p_reason text,
  p_actor_id text DEFAULT NULL
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
  v_resolved_actor text;
  v_auth_uid uuid := auth.uid();
  v_auth_role text := auth.role();
BEGIN
  -- 1. Strict Actor Resolution & Super Admin Enforcement
  IF v_auth_uid IS NOT NULL THEN
    -- Authenticated session: authoritative actor MUST be derived from session identity
    SELECT u.id::text INTO v_resolved_actor
    FROM public.admin_users u
    JOIN public.platform_admin_roles r ON r.admin_user_id = u.id
    WHERE u.auth_user_id = v_auth_uid
      AND u.is_active = true
      AND r.role = 'SUPER_ADMIN';

    IF v_resolved_actor IS NULL THEN
      RAISE EXCEPTION 'Access denied: Caller is not an authorized Super Admin.'
        USING ERRCODE = '42501';
    END IF;

    -- Reject forged actor identity if client attempted to supply a different actor
    IF p_actor_id IS NOT NULL AND p_actor_id <> v_resolved_actor AND p_actor_id <> v_auth_uid::text THEN
      RAISE EXCEPTION 'Access denied: Forged actor identity rejected. Actor must match authenticated identity.'
        USING ERRCODE = '42501';
    END IF;

  ELSIF v_auth_role = 'service_role' THEN
    -- Trusted service role: validate that supplied actor is a valid Super Admin or internal system
    IF p_actor_id IS NOT NULL AND p_actor_id <> 'system' AND p_actor_id <> 'super_admin' AND p_actor_id <> 'alert_rule_evaluation' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.admin_users u
        JOIN public.platform_admin_roles r ON r.admin_user_id = u.id
        WHERE (u.id::text = p_actor_id OR u.auth_user_id::text = p_actor_id)
          AND u.is_active = true
          AND r.role = 'SUPER_ADMIN'
      ) THEN
        RAISE EXCEPTION 'Access denied: Actor % is not a registered Super Admin.', p_actor_id
          USING ERRCODE = '42501';
      END IF;
      v_resolved_actor := p_actor_id;
    ELSE
      v_resolved_actor := COALESCE(p_actor_id, 'super_admin');
    END IF;

  ELSE
    RAISE EXCEPTION 'Access denied: Super Admin privileges required.'
      USING ERRCODE = '42501';
  END IF;

  v_clean_reason := trim(COALESCE(p_reason, ''));
  IF length(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'A valid resolution reason (minimum 3 characters) is required.'
      USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Incident is already resolved: %', p_incident_id
      USING ERRCODE = '22000';
  END IF;

  -- 3. Transition incident status to RESOLVED with resolution_type = MANUAL
  UPDATE public.ops_incidents
  SET
    status = 'RESOLVED',
    resolution_type = 'MANUAL',
    resolved_at = v_now,
    resolved_by = v_resolved_actor,
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

  -- 5. Record incident timeline event with MANUAL_RESOLUTION provenance
  INSERT INTO public.ops_incident_events (
    incident_id, event_type, actor_type, actor_id, occurred_at, metadata
  ) VALUES (
    p_incident_id,
    'INCIDENT_RESOLVED',
    'SUPER_ADMIN',
    v_resolved_actor,
    v_now,
    jsonb_build_object(
      'resolution_type', 'MANUAL',
      'resolved_by', v_resolved_actor,
      'resolution_reason', v_clean_reason,
      'alerts_resolved', v_alert_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'incident_id', p_incident_id,
    'status', 'RESOLVED',
    'resolution_type', 'MANUAL',
    'resolved_at', v_now,
    'resolved_by', v_resolved_actor,
    'resolution_reason', v_clean_reason,
    'alerts_resolved', v_alert_count
  );
END;
$$;

-- Overloaded 2-parameter signature (incident_id, reason) for client invocation
CREATE OR REPLACE FUNCTION public.resolve_operations_incident(
  p_incident_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.resolve_operations_incident(p_incident_id, p_reason, NULL);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.acknowledge_operations_incident(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acknowledge_operations_incident(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_operations_incident(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_operations_incident(uuid, text) TO authenticated, service_role;
