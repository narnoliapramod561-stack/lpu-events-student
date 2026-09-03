/**
 * scripts/database_cleanup.mjs
 *
 * LPU Events — Database Growth Prevention Automation
 *
 * Recurring automated maintenance routine:
 * 1. Invokes public.cleanup_old_audit_logs(30) to enforce rolling 30-day retention
 * 2. Invokes public.cleanup_old_access_requests(90) to purge stale resolved requests
 * 3. Invokes public.cleanup_past_events(100) to immediately delete events where end_at < now()
 * 4. Invokes public.cleanup_orphaned_media_assets('24 hours') to purge orphaned media metadata
 *
 * Security & Design:
 * - Pure server-side execution via Node.js native fetch (zero third-party dependencies).
 * - Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * - Idempotent: safe to run repeatedly.
 * - Zero database scheduler tables or cron queues added.
 * - Fails clearly with non-zero exit code if Supabase is unreachable or RPC errors.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '30', 10);
const ACCESS_REQUEST_RETENTION_DAYS = parseInt(process.env.ACCESS_REQUEST_RETENTION_DAYS || '90', 10);
const MEDIA_ORPHAN_INTERVAL = process.env.MEDIA_ORPHAN_INTERVAL || '24 hours';
const PAST_EVENT_BATCH_SIZE = parseInt(process.env.PAST_EVENT_BATCH_SIZE || '100', 10);

async function runCleanup() {
  const startTime = Date.now();
  console.log('='.repeat(65));
  console.log('LPU Events — Automated Database Maintenance Routine');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(65));

  // 1. Validate Environment
  if (!SUPABASE_URL) {
    console.error('❌ FATAL: Missing SUPABASE_URL (or VITE_SUPABASE_URL) environment variable.');
    process.exit(1);
  }

  if (!SERVICE_ROLE_KEY) {
    console.error('❌ FATAL: Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
    console.error('A privileged service_role key is required to execute security-definer cleanup routines.');
    process.exit(1);
  }

  const cleanUrl = SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  let hasError = false;

  // 2. Audit Log 30-Day Rolling Retention Cleanup
  console.log(`\n[1/4] Executing: cleanup_old_audit_logs(${AUDIT_RETENTION_DAYS} days)...`);
  try {
    const auditRes = await fetch(`${cleanUrl}/rest/v1/rpc/cleanup_old_audit_logs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_retention_days: AUDIT_RETENTION_DAYS })
    });

    if (!auditRes.ok) {
      const errText = await auditRes.text();
      throw new Error(`HTTP ${auditRes.status} ${auditRes.statusText}: ${errText}`);
    }

    const deletedLogsCount = await auditRes.json();
    console.log(`✅ Audit Log Cleanup Success: Purged ${deletedLogsCount} record(s) older than ${AUDIT_RETENTION_DAYS} days.`);
  } catch (err) {
    console.error(`❌ Audit Log Cleanup FAILED: ${err.message}`);
    hasError = true;
  }

  // 3. Resolved Access Requests Cleanup
  console.log(`\n[2/4] Executing: cleanup_old_access_requests(${ACCESS_REQUEST_RETENTION_DAYS} days)...`);
  try {
    const reqRes = await fetch(`${cleanUrl}/rest/v1/rpc/cleanup_old_access_requests`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_retention_days: ACCESS_REQUEST_RETENTION_DAYS })
    });

    if (!reqRes.ok) {
      const errText = await reqRes.text();
      throw new Error(`HTTP ${reqRes.status} ${reqRes.statusText}: ${errText}`);
    }

    const deletedReqCount = await reqRes.json();
    console.log(`✅ Access Requests Cleanup Success: Purged ${deletedReqCount} record(s) older than ${ACCESS_REQUEST_RETENTION_DAYS} days.`);
  } catch (err) {
    console.error(`❌ Access Requests Cleanup FAILED: ${err.message}`);
    hasError = true;
  }

  // 4. Immediate Past Events Cleanup (end_at < now())
  console.log(`\n[3/4] Executing: cleanup_past_events(batch_size: ${PAST_EVENT_BATCH_SIZE})...`);
  try {
    const eventRes = await fetch(`${cleanUrl}/rest/v1/rpc/cleanup_past_events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_batch_size: PAST_EVENT_BATCH_SIZE })
    });

    if (!eventRes.ok) {
      const errText = await eventRes.text();
      throw new Error(`HTTP ${eventRes.status} ${eventRes.statusText}: ${errText}`);
    }

    const deletedEvents = await eventRes.json();
    const count = Array.isArray(deletedEvents) ? deletedEvents.length : 0;
    console.log(`✅ Past Events Cleanup Success: Deleted ${count} event(s) where end_at < now().`);
    if (count > 0) {
      deletedEvents.forEach(e => console.log(`   • Removed: "${e.event_name}" (Ended: ${e.ended_at})`));
    }
  } catch (err) {
    console.error(`❌ Past Events Cleanup FAILED: ${err.message}`);
    hasError = true;
  }

  // 5. Orphan Media Assets Cleanup
  console.log(`\n[4/4] Executing: cleanup_orphaned_media_assets('${MEDIA_ORPHAN_INTERVAL}')...`);
  try {
    const mediaRes = await fetch(`${cleanUrl}/rest/v1/rpc/cleanup_orphaned_media_assets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_older_than_interval: MEDIA_ORPHAN_INTERVAL })
    });

    if (!mediaRes.ok) {
      const errText = await mediaRes.text();
      throw new Error(`HTTP ${mediaRes.status} ${mediaRes.statusText}: ${errText}`);
    }

    const cleanedMedia = await mediaRes.json();
    const count = Array.isArray(cleanedMedia) ? cleanedMedia.length : 0;
    console.log(`✅ Media Orphan Cleanup Success: Processed ${count} orphaned media record(s).`);
  } catch (err) {
    console.error(`❌ Media Orphan Cleanup FAILED: ${err.message}`);
    hasError = true;
  }

  // 6. Summary & Exit Code
  const durationMs = Date.now() - startTime;
  console.log('\n' + '-'.repeat(65));
  if (hasError) {
    console.error(`❌ Database maintenance completed with errors in ${durationMs}ms.`);
    process.exit(1);
  } else {
    console.log(`🎉 Database maintenance completed successfully in ${durationMs}ms.`);
    console.log('-'.repeat(65));
    process.exit(0);
  }
}

runCleanup().catch(err => {
  console.error('Unhandled fatal error in cleanup execution:', err);
  process.exit(1);
});
