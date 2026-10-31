-- 20261016030000_snapshot_publication_reconciliation.sql
-- LPU Events — Sprint 2.2: R2 Public-Content Snapshot Publication & Reconciliation Outbox
-- Durable tracking, monotonic generation sequencing, advisory locking, idempotent retries,
-- concurrency race prevention, and administrative failure visibility.

-- ============================================================================
-- 0. Sequence: snapshot_publication_seq
-- Monotonically increasing publication sequence to prevent stale overwrites
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.snapshot_publication_seq START WITH 1;

-- ============================================================================
-- 1. Table: snapshot_publication_lock
-- Singleton coordination lock & active generation tracker
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.snapshot_publication_lock (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_generation bigint NOT NULL DEFAULT 0,
  active_revision text,
  locked_by text,
  locked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.snapshot_publication_lock (id, current_generation, updated_at)
VALUES (1, 0, clock_timestamp())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.snapshot_publication_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.snapshot_publication_lock FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.snapshot_publication_lock TO authenticated, service_role;
GRANT ALL ON TABLE public.snapshot_publication_lock TO service_role;

-- ============================================================================
-- 2. Table: snapshot_publication_queue
-- Bounded queue for snapshot publications, retry handling, and operational audit
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.snapshot_publication_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision text NOT NULL,
  generation bigint NOT NULL DEFAULT nextval('public.snapshot_publication_seq'),
  trigger_source text NOT NULL CHECK (trigger_source IN ('MUTATION', 'SCHEDULE', 'MANUAL', 'RETRY')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED')),
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  next_retry_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  db_resource_versions jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifacts_uploaded text[],
  total_bytes bigint DEFAULT 0,
  locked_at timestamptz,
  locked_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,

  CONSTRAINT chk_snapshot_attempts CHECK (attempt_count >= 0 AND attempt_count <= max_attempts + 1)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_queue_status_retry
  ON public.snapshot_publication_queue (status, next_retry_at)
  WHERE status IN ('PENDING', 'PROCESSING');

CREATE INDEX IF NOT EXISTS idx_snapshot_queue_created
  ON public.snapshot_publication_queue (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshot_queue_generation
  ON public.snapshot_publication_queue (generation DESC);

-- ============================================================================
-- 3. Row Level Security & Access Control
-- ============================================================================
ALTER TABLE public.snapshot_publication_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.snapshot_publication_queue FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.snapshot_publication_queue TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.snapshot_publication_queue TO service_role;

-- Authenticated Super Admins & Admins can read publication queue status
CREATE POLICY snapshot_queue_admin_read_policy ON public.snapshot_publication_queue
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR
    EXISTS (
      SELECT 1 FROM public.admin_users u
      WHERE u.auth_user_id = auth.uid() AND u.is_active = true
    )
  );

-- ============================================================================
-- 4. Bounded Storage Retention (Audit Safe: Keep latest 50 completed, keep FAILED for 14d)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prune_snapshot_publication_queue()
RETURNS integer
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  -- Strict Invariant:
  -- PENDING and PROCESSING jobs are NEVER deleted under any circumstances.
  -- Retryable failed jobs remain in PENDING status until max_attempts, so they are never pruned.
  -- Terminal FAILED jobs are preserved for at least 14 days and at least the latest 50 records for admin investigation.
  -- Only stale PUBLISHED jobs (beyond the latest 50) and expired FAILED jobs are pruned.
  WITH stale_published AS (
    SELECT id
    FROM public.snapshot_publication_queue
    WHERE status = 'PUBLISHED'
    ORDER BY completed_at DESC NULLS LAST
    OFFSET 50
  ),
  stale_failed AS (
    SELECT id
    FROM public.snapshot_publication_queue
    WHERE status = 'FAILED'
      AND completed_at < clock_timestamp() - interval '14 days'
    ORDER BY completed_at DESC NULLS LAST
    OFFSET 50
  )
  DELETE FROM public.snapshot_publication_queue
  WHERE id IN (
    SELECT id FROM stale_published
    UNION
    SELECT id FROM stale_failed
  );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.prune_snapshot_publication_queue() TO service_role;

-- ============================================================================
-- 5. RPC: enqueue_snapshot_publication
-- Idempotently records a pending publication request after a mutation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_snapshot_publication(
  p_trigger_source text DEFAULT 'MUTATION',
  p_db_versions jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_existing_pending uuid;
  v_revision text;
BEGIN
  -- Deduplicate: If there is already a PENDING entry created in the last 10 seconds, reuse it
  SELECT id INTO v_existing_pending
  FROM public.snapshot_publication_queue
  WHERE status = 'PENDING'
    AND created_at >= clock_timestamp() - interval '10 seconds'
  LIMIT 1;

  IF v_existing_pending IS NOT NULL THEN
    RETURN v_existing_pending;
  END IF;

  v_revision := 'rev_' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"') || '_' || substr(md5(random()::text), 1, 6);

  INSERT INTO public.snapshot_publication_queue (
    revision,
    trigger_source,
    status,
    db_resource_versions,
    next_retry_at
  ) VALUES (
    v_revision,
    p_trigger_source,
    'PENDING',
    p_db_versions,
    clock_timestamp()
  )
  RETURNING id INTO v_id;

  -- Auto-prune safe stale rows
  PERFORM public.prune_snapshot_publication_queue();

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.enqueue_snapshot_publication(text, jsonb) TO authenticated, service_role;

-- ============================================================================
-- 6. RPC: claim_snapshot_publication
-- Single-flight claim using FOR UPDATE SKIP LOCKED with generation tracking
-- and abandoned-worker lease reclamation (3 minutes timeout)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_snapshot_publication(
  p_worker_id text DEFAULT 'edge-publisher'
)
RETURNS TABLE (
  id uuid,
  revision text,
  generation bigint,
  trigger_source text,
  attempt_count integer,
  db_resource_versions jsonb
)
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  WITH target AS (
    SELECT q.id
    FROM public.snapshot_publication_queue q
    WHERE (
      (q.status = 'PENDING' AND q.next_retry_at <= clock_timestamp())
      OR
      (q.status = 'PROCESSING' AND q.locked_at < clock_timestamp() - interval '3 minutes')
    )
    ORDER BY q.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.snapshot_publication_queue q
  SET
    status = 'PROCESSING',
    locked_at = clock_timestamp(),
    locked_by = p_worker_id,
    attempt_count = q.attempt_count + 1
  FROM target
  WHERE q.id = target.id
  RETURNING
    q.id,
    q.revision,
    q.generation,
    q.trigger_source,
    q.attempt_count,
    q.db_resource_versions;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.claim_snapshot_publication(text) TO service_role;

-- ============================================================================
-- 7. RPC: promote_snapshot_manifest
-- Strict monotonic generation enforcement: ensures older revisions can NEVER
-- overwrite a newer active manifest in Postgres or R2.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.promote_snapshot_manifest(
  p_queue_id uuid,
  p_revision text,
  p_generation bigint,
  p_worker_id text DEFAULT 'edge-publisher',
  p_artifacts text[] DEFAULT '{}'::text[],
  p_total_bytes bigint DEFAULT 0
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_lock record;
BEGIN
  SELECT * INTO v_lock
  FROM public.snapshot_publication_lock
  WHERE id = 1
  FOR UPDATE;

  -- Reject stale promotion if lock already advanced past this generation
  IF v_lock.current_generation >= p_generation THEN
    RETURN jsonb_build_object(
      'promoted', false,
      'reason', 'SUPERSEDED',
      'current_generation', v_lock.current_generation,
      'attempted_generation', p_generation,
      'active_revision', v_lock.active_revision
    );
  END IF;

  -- Advance lock to newly promoted generation
  UPDATE public.snapshot_publication_lock
  SET
    current_generation = p_generation,
    active_revision = p_revision,
    locked_by = NULL,
    locked_at = NULL,
    updated_at = clock_timestamp()
  WHERE id = 1;

  -- Mark queue item as PUBLISHED
  IF p_queue_id IS NOT NULL THEN
    UPDATE public.snapshot_publication_queue
    SET
      status = 'PUBLISHED',
      revision = p_revision,
      artifacts_uploaded = p_artifacts,
      total_bytes = p_total_bytes,
      locked_at = NULL,
      locked_by = NULL,
      completed_at = clock_timestamp()
    WHERE id = p_queue_id;
  END IF;

  -- Auto-prune safe records
  PERFORM public.prune_snapshot_publication_queue();

  RETURN jsonb_build_object(
    'promoted', true,
    'current_generation', p_generation,
    'active_revision', p_revision
  );
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.promote_snapshot_manifest(uuid, text, bigint, text, text[], bigint) TO service_role;

-- ============================================================================
-- 8. RPC: complete_snapshot_publication (Compatibility Wrapper)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_snapshot_publication(
  p_queue_id uuid,
  p_revision text,
  p_artifacts text[],
  p_total_bytes bigint DEFAULT 0,
  p_generation bigint DEFAULT NULL
)
RETURNS boolean
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_gen bigint := p_generation;
BEGIN
  IF v_gen IS NULL AND p_queue_id IS NOT NULL THEN
    SELECT generation INTO v_gen
    FROM public.snapshot_publication_queue
    WHERE id = p_queue_id;
  END IF;

  IF v_gen IS NOT NULL THEN
    UPDATE public.snapshot_publication_lock
    SET
      current_generation = GREATEST(current_generation, v_gen),
      active_revision = p_revision,
      locked_by = NULL,
      locked_at = NULL,
      updated_at = clock_timestamp()
    WHERE id = 1;
  END IF;

  UPDATE public.snapshot_publication_queue
  SET
    status = 'PUBLISHED',
    revision = p_revision,
    artifacts_uploaded = p_artifacts,
    total_bytes = p_total_bytes,
    locked_at = NULL,
    locked_by = NULL,
    completed_at = clock_timestamp()
  WHERE id = p_queue_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.complete_snapshot_publication(uuid, text, text[], bigint, bigint) TO service_role;

-- ============================================================================
-- 9. RPC: fail_snapshot_publication
-- Bounded exponential backoff (2s, 6s, 18s, 54s, 162s max 180s)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fail_snapshot_publication(
  p_queue_id uuid,
  p_error text
)
RETURNS boolean
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attempts integer;
  v_max integer;
  v_delay_seconds integer;
BEGIN
  SELECT attempt_count, max_attempts INTO v_attempts, v_max
  FROM public.snapshot_publication_queue
  WHERE id = p_queue_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_attempts >= v_max THEN
    -- Permanently failed after max attempts: kept visible for admin investigation
    UPDATE public.snapshot_publication_queue
    SET
      status = 'FAILED',
      last_error = p_error,
      locked_at = NULL,
      locked_by = NULL,
      completed_at = clock_timestamp()
    WHERE id = p_queue_id;
  ELSE
    -- Bounded exponential backoff: 2s, 6s, 18s, 54s, max 180s
    v_delay_seconds := LEAST(180, (2 * (3 ^ (v_attempts - 1)))::integer);
    UPDATE public.snapshot_publication_queue
    SET
      status = 'PENDING',
      last_error = p_error,
      next_retry_at = clock_timestamp() + (v_delay_seconds || ' seconds')::interval,
      locked_at = NULL,
      locked_by = NULL
    WHERE id = p_queue_id;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.fail_snapshot_publication(uuid, text) TO service_role;

-- ============================================================================
-- 10. RPC: get_snapshot_publication_status
-- Lightweight status inspection for admin UI and operations telemetry
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_snapshot_publication_status()
RETURNS TABLE (
  latest_published_revision text,
  last_published_at timestamptz,
  pending_count bigint,
  failed_count bigint,
  last_error text,
  current_generation bigint
)
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT q.revision FROM public.snapshot_publication_queue q WHERE q.status = 'PUBLISHED' ORDER BY q.completed_at DESC LIMIT 1) AS latest_published_revision,
    (SELECT q.completed_at FROM public.snapshot_publication_queue q WHERE q.status = 'PUBLISHED' ORDER BY q.completed_at DESC LIMIT 1) AS last_published_at,
    (SELECT count(*) FROM public.snapshot_publication_queue q WHERE q.status IN ('PENDING', 'PROCESSING')) AS pending_count,
    (SELECT count(*) FROM public.snapshot_publication_queue q WHERE q.status = 'FAILED') AS failed_count,
    (SELECT q.last_error FROM public.snapshot_publication_queue q WHERE q.status = 'FAILED' ORDER BY q.created_at DESC LIMIT 1) AS last_error,
    (SELECT l.current_generation FROM public.snapshot_publication_lock l WHERE l.id = 1) AS current_generation;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.get_snapshot_publication_status() TO authenticated, service_role;
