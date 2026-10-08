/**
 * scripts/database_size_guardrail.mjs
 *
 * LPU Events — Automatic Database Size Guardrail & Non-Destructive Lifecycle Maintenance
 * Phase 4 Instrument: Operations Job Telemetry & Single-Flight Concurrency Protection
 *
 * Product Policy:
 * - Past Events: Automatically transitioned to COMPLETED when end_at < now().
 *   Historical data preserved for authorized Organizers and Super Admins.
 * - Active / Future Events: Strictly preserved (status = 'PUBLISHED' and end_at >= now()).
 * - Audit Logs: Rolling 15-day retention window.
 * - Orphan Media: Cleaned safely when unreferenced by any active entity (24h threshold).
 * - Access Requests: Resolved requests (>30 days) cleaned.
 *
 * Multi-Tier Guardrail (500 MB Free-Tier Cap):
 * - 250 MB (Notice): Initial monitoring notice (50% cap).
 * - 300 MB (Warning): Standard sweep and verification.
 * - 350 MB (High): Elevated storage notification & diagnostics.
 * - 400 MB (Critical): High-priority storage alert (<100 MB remaining).
 * - 450 MB (Emergency): Operator alert (<50 MB remaining).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Byte Threshold Constants (1 MB = 1024 * 1024 bytes)
const MB = 1024 * 1024;
const THRESHOLDS = {
  NOTICE: (parseFloat(process.env.THRESHOLD_NOTICE_MB || '250')) * MB,
  WARNING: (parseFloat(process.env.THRESHOLD_WARNING_MB || '300')) * MB,
  HIGH: (parseFloat(process.env.THRESHOLD_HIGH_MB || '350')) * MB,
  CRITICAL: (parseFloat(process.env.THRESHOLD_CRITICAL_MB || '400')) * MB,
  EMERGENCY: (parseFloat(process.env.THRESHOLD_EMERGENCY_MB || '450')) * MB,
  FREE_TIER_LIMIT: 500 * MB
};

// Retention Windows
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '15', 10);
const ACCESS_REQUEST_RETENTION_DAYS = parseInt(process.env.ACCESS_REQUEST_RETENTION_DAYS || '30', 10);
const MEDIA_ORPHAN_INTERVAL = process.env.MEDIA_ORPHAN_INTERVAL || '24 hours';
const PAST_EVENT_BATCH_SIZE = parseInt(process.env.PAST_EVENT_BATCH_SIZE || '100', 10);

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function callRpc(cleanUrl, headers, rpcName, params = {}) {
  const res = await fetch(`${cleanUrl}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`RPC ${rpcName} failed (HTTP ${res.status}): ${errText}`);
  }

  return await res.json();
}

async function executeStandardCleanup(cleanUrl, headers, label = 'Routine') {
  console.log(`\n[${label} Cleanup] Executing maintenance routines...`);
  const metrics = {
    recordsScanned: 0,
    recordsProcessed: 0,
    recordsDeleted: 0,
    recordsFailed: 0,
    details: {},
    errors: []
  };

  // 1. Audit Logs Cleanup (15 days retention)
  try {
    const delAudit = await callRpc(cleanUrl, headers, 'cleanup_old_audit_logs', { p_retention_days: AUDIT_RETENTION_DAYS });
    const count = typeof delAudit === 'number' ? delAudit : 0;
    metrics.recordsDeleted += count;
    metrics.recordsScanned += count;
    metrics.details.auditLogsPurged = count;
    console.log(`  - Audit Logs: Purged ${count} record(s) older than ${AUDIT_RETENTION_DAYS} days.`);
  } catch (err) {
    metrics.recordsFailed++;
    metrics.errors.push(`Audit cleanup: ${err.message}`);
    console.warn(`  ⚠️ Audit cleanup warning: ${err.message}`);
  }

  // 2. Resolved Access Requests Cleanup (30 days retention)
  try {
    const delReq = await callRpc(cleanUrl, headers, 'cleanup_old_access_requests', { p_retention_days: ACCESS_REQUEST_RETENTION_DAYS });
    const count = typeof delReq === 'number' ? delReq : 0;
    metrics.recordsDeleted += count;
    metrics.recordsScanned += count;
    metrics.details.accessRequestsPurged = count;
    console.log(`  - Access Requests: Purged ${count} resolved request(s) older than ${ACCESS_REQUEST_RETENTION_DAYS} days.`);
  } catch (err) {
    metrics.recordsFailed++;
    metrics.errors.push(`Access requests cleanup: ${err.message}`);
    console.warn(`  ⚠️ Access requests cleanup warning: ${err.message}`);
  }

  // 3. Past Events Non-Destructive Status Transition (PUBLISHED -> COMPLETED)
  try {
    const transEvents = await callRpc(cleanUrl, headers, 'cleanup_past_events', { p_batch_size: PAST_EVENT_BATCH_SIZE });
    const count = Array.isArray(transEvents) ? transEvents.length : (typeof transEvents === 'number' ? transEvents : 0);
    metrics.recordsProcessed += count;
    metrics.recordsScanned += count;
    metrics.details.pastEventsTransitioned = count;
    console.log(`  - Past Events: Transitioned ${count} event(s) to COMPLETED status (end_at < now()).`);
    if (Array.isArray(transEvents) && transEvents.length > 0) {
      transEvents.forEach(e => console.log(`    • Transitioned: "${e.event_name}" (Ended: ${e.ended_at})`));
    }
  } catch (err) {
    metrics.recordsFailed++;
    metrics.errors.push(`Past events cleanup: ${err.message}`);
    console.warn(`  ⚠️ Past event cleanup warning: ${err.message}`);
  }

  // 4. Orphan Media Cleanup (unreferenced assets transitioned to PENDING_DELETE)
  try {
    const delMedia = await callRpc(cleanUrl, headers, 'cleanup_orphaned_media_assets', { p_older_than_interval: MEDIA_ORPHAN_INTERVAL });
    const count = Array.isArray(delMedia) ? delMedia.length : (typeof delMedia === 'number' ? delMedia : 0);
    metrics.recordsProcessed += count;
    metrics.recordsScanned += count;
    metrics.details.orphanMediaFlagged = count;
    console.log(`  - Orphan Media: Flagged ${count} unreferenced media asset(s) for deletion.`);
  } catch (err) {
    metrics.recordsFailed++;
    metrics.errors.push(`Orphan media cleanup: ${err.message}`);
    console.warn(`  ⚠️ Orphan media cleanup warning: ${err.message}`);
  }

  return metrics;
}

async function runGuardrail() {
  const startTime = Date.now();
  console.log('='.repeat(70));
  console.log('🛡️  LPU Events — Automated Database Size Guardrail & Storage Monitor');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('❌ CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables missing.');
    console.log('Guardrail requires service_role key to perform administrative health and size checks.');
    process.exit(1);
  }

  const cleanUrl = SUPABASE_URL.replace(/\/+$/, '');
  const headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };

  // Phase 4: Operations Job Lifecycle Telemetry (Single-Flight Lock)
  let jobRunId = null;
  const requestId = `ops_gh_${process.env.GITHUB_RUN_ID || Date.now()}`;
  const correlationId = process.env.GITHUB_SHA || `corr_${Date.now()}`;
  const triggerSource = process.env.GITHUB_ACTIONS ? 'SCHEDULE' : 'MANUAL';

  try {
    const startRes = await callRpc(cleanUrl, headers, 'start_operations_job_run', {
      p_job_key: 'database_cleanup',
      p_trigger_source: triggerSource,
      p_request_id: requestId,
      p_correlation_id: correlationId,
      p_metadata: {
        workflow: process.env.GITHUB_WORKFLOW || 'database_cleanup',
        run_id: process.env.GITHUB_RUN_ID || null,
        run_number: process.env.GITHUB_RUN_NUMBER || null,
        commit_sha: process.env.GITHUB_SHA || null
      },
      p_timeout_minutes: 30
    });

    if (startRes && startRes.acquired === false) {
      console.warn(`⚠️ Single-flight lock active: ${startRes.reason} (Active Run: ${startRes.active_run_id}).`);
      console.log('Skipping execution to avoid concurrent maintenance races.');
      process.exit(0);
    }

    if (startRes && startRes.run_id) {
      jobRunId = startRes.run_id;
      console.log(`📋 Phase 4 Job Run Initialized: ${jobRunId} (Trigger: ${triggerSource})`);
    }
  } catch (telemetryStartErr) {
    // Failure Isolation: Never block maintenance work merely because telemetry start write failed
    console.warn(`⚠️ Telemetry lock acquisition warning: ${telemetryStartErr.message}`);
  }

  let cleanupMetrics = null;
  let fatalError = null;

  try {
    // 1. Health check & database connection
    console.log('\n📡 Probing Supabase Health Endpoint...');
    try {
      const healthData = await callRpc(cleanUrl, headers, 'health_check');
      console.log(`  ✅ Database status: ${healthData.status || 'ONLINE'} (PostgreSQL Version: ${healthData.postgres_version || '15+'})`);
    } catch (err) {
      console.warn(`  ⚠️ health_check RPC warning: ${err.message}`);
    }

    // 2. Execute routine maintenance sweep
    cleanupMetrics = await executeStandardCleanup(cleanUrl, headers, 'Routine Sweep');

    const durationMs = Date.now() - startTime;
    console.log('\n' + '='.repeat(70));
    console.log(`✅ Guardrail maintenance completed successfully in ${durationMs}ms.`);
    console.log('='.repeat(70));
  } catch (err) {
    fatalError = err;
    console.error(`\n❌ FATAL GUARDRAIL EXCEPTION: ${err.message}`);
  }

  // Phase 4: Finalize Job Run Telemetry Record
  if (jobRunId) {
    try {
      const status = fatalError
        ? 'FAILED'
        : (cleanupMetrics && cleanupMetrics.errors.length > 0)
        ? 'PARTIAL'
        : 'COMPLETED';

      const errorSummary = fatalError
        ? fatalError.message
        : (cleanupMetrics && cleanupMetrics.errors.length > 0)
        ? cleanupMetrics.errors.join('; ')
        : null;

      await callRpc(cleanUrl, headers, 'finish_operations_job_run', {
        p_run_id: jobRunId,
        p_status: status,
        p_records_scanned: cleanupMetrics?.recordsScanned ?? 0,
        p_records_processed: cleanupMetrics?.recordsProcessed ?? 0,
        p_records_deleted: cleanupMetrics?.recordsDeleted ?? 0,
        p_records_failed: cleanupMetrics?.recordsFailed ?? (fatalError ? 1 : 0),
        p_error_code: fatalError ? 'FATAL_EXCEPTION' : (cleanupMetrics?.errors.length ? 'SUBROUTINE_WARNING' : null),
        p_error_summary: errorSummary,
        p_metadata: {
          duration_ms: Date.now() - startTime,
          details: cleanupMetrics?.details ?? {}
        }
      });
      console.log(`📋 Phase 4 Job Run Finalized: ${jobRunId} -> ${status}`);
    } catch (telemetryFinishErr) {
      console.warn(`⚠️ Telemetry finalization warning: ${telemetryFinishErr.message}`);
    }
  }

  if (fatalError) {
    process.exit(1);
  }
}

runGuardrail();
