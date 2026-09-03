/**
 * scripts/database_size_guardrail.mjs
 *
 * LPU Events — Automatic Database Size Guardrail & Immediate Past-Event Deletion
 *
 * Product Policy:
 * - Past Events: Automatically deleted as soon as end_at < now().
 *   Zero historical age threshold required. Cascades cleanly to dependent tables.
 * - Active / Future Events: Strictly preserved (end_at >= now()).
 * - Audit Logs: Rolling 30-day retention window.
 * - Orphan Media: Cleaned safely when unreferenced by any active entity.
 * - Access Requests: Resolved requests (>90 days) cleaned.
 *
 * Multi-Tier Guardrail (500 MB Free-Tier Cap):
 * - Routine: Runs every 6 hours to keep database minimal.
 * - 300 MB (Level 1): Immediate full-sweep cleanup.
 * - 350 MB (Level 2): Elevated storage notification & verification.
 * - 400 MB (Level 3): Full storage diagnostics & secondary batch cleanup.
 * - 450 MB (Emergency): Operator alert (<50 MB remaining).
 * - 475 MB (Critical): High-priority emergency alert (<25 MB remaining).
 */

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Byte Threshold Constants (1 MB = 1024 * 1024 bytes)
const MB = 1024 * 1024;
const THRESHOLDS = {
  LEVEL_1_WARNING: (parseFloat(process.env.THRESHOLD_LEVEL_1_MB || '300')) * MB,
  LEVEL_2_ELEVATED: (parseFloat(process.env.THRESHOLD_LEVEL_2_MB || '350')) * MB,
  LEVEL_3_ANALYSIS: (parseFloat(process.env.THRESHOLD_LEVEL_3_MB || '400')) * MB,
  EMERGENCY: (parseFloat(process.env.THRESHOLD_EMERGENCY_MB || '450')) * MB,
  CRITICAL: (parseFloat(process.env.THRESHOLD_CRITICAL_MB || '475')) * MB,
  FREE_TIER_LIMIT: 500 * MB
};

// Retention Windows
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS || '30', 10);
const ACCESS_REQUEST_RETENTION_DAYS = parseInt(process.env.ACCESS_REQUEST_RETENTION_DAYS || '90', 10);
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

  // 1. Audit Logs Cleanup (30 days retention)
  try {
    const delAudit = await callRpc(cleanUrl, headers, 'cleanup_old_audit_logs', { p_retention_days: AUDIT_RETENTION_DAYS });
    console.log(`  - Audit Logs: Purged ${delAudit} record(s) older than ${AUDIT_RETENTION_DAYS} days.`);
  } catch (err) {
    console.warn(`  ⚠️ Audit cleanup warning: ${err.message}`);
  }

  // 2. Resolved Access Requests Cleanup (90 days retention)
  try {
    const delReq = await callRpc(cleanUrl, headers, 'cleanup_old_access_requests', { p_retention_days: ACCESS_REQUEST_RETENTION_DAYS });
    console.log(`  - Access Requests: Purged ${delReq} resolved request(s) older than ${ACCESS_REQUEST_RETENTION_DAYS} days.`);
  } catch (err) {
    console.warn(`  ⚠️ Access requests cleanup warning: ${err.message}`);
  }

  // 3. Past Events Immediate Cleanup (end_at < now())
  try {
    const delEvents = await callRpc(cleanUrl, headers, 'cleanup_past_events', { p_batch_size: PAST_EVENT_BATCH_SIZE });
    const count = Array.isArray(delEvents) ? delEvents.length : 0;
    console.log(`  - Past Events: Deleted ${count} event(s) whose end_at has passed (end_at < now()).`);
    if (count > 0) {
      delEvents.forEach(e => console.log(`    • Deleted: "${e.event_name}" (Ended: ${e.ended_at})`));
    }
  } catch (err) {
    console.warn(`  ⚠️ Past event cleanup warning: ${err.message}`);
  }

  // 4. Orphan Media Cleanup (unreferenced assets older than threshold)
  try {
    const delMedia = await callRpc(cleanUrl, headers, 'cleanup_orphaned_media_assets', { p_older_than_interval: MEDIA_ORPHAN_INTERVAL });
    const count = Array.isArray(delMedia) ? delMedia.length : 0;
    console.log(`  - Orphan Media: Purged ${count} unreferenced media asset(s).`);
  } catch (err) {
    console.warn(`  ⚠️ Orphan media cleanup warning: ${err.message}`);
  }
}

async function runGuardrail() {
  const startTime = Date.now();
  console.log('='.repeat(70));
  console.log('🛡️  LPU Events — Automated Database Size Guardrail & Storage Monitor');
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  // 1. Validate Environment
  if (!SUPABASE_URL) {
    console.error('❌ FATAL: Missing SUPABASE_URL (or VITE_SUPABASE_URL) environment variable.');
    process.exit(1);
  }

  if (!SERVICE_ROLE_KEY) {
    console.error('❌ FATAL: Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
    process.exit(1);
  }

  const cleanUrl = SUPABASE_URL.replace(/\/$/, '');
  const headers = {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };

  // 2. Initial Measurement
  console.log('\n[Phase 1] Measuring PostgreSQL Database Storage...');
  let stats = await callRpc(cleanUrl, headers, 'get_database_storage_stats');
  let currentBytes = stats.database_size_bytes;

  console.log(`📊 Initial Database Size: ${stats.database_size_pretty} (${currentBytes.toLocaleString()} bytes)`);
  console.log(`🎯 Free Tier Limit: 500 MB (${(THRESHOLDS.FREE_TIER_LIMIT - currentBytes) > 0 ? formatBytes(THRESHOLDS.FREE_TIER_LIMIT - currentBytes) + ' remaining' : 'EXCEEDED'})`);

  const initialBytes = currentBytes;

  // 3. Routine Past Event & Storage Cleanup (Executed on Every Run)
  await executeStandardCleanup(cleanUrl, headers, 'Routine 6-Hour');

  // 4. Re-measure Database Size
  stats = await callRpc(cleanUrl, headers, 'get_database_storage_stats');
  currentBytes = stats.database_size_bytes;

  // 5. Multi-Tier Guardrail Evaluation
  if (currentBytes < THRESHOLDS.LEVEL_1_WARNING) {
    console.log(`\n✅ Guardrail Status: HEALTHY (${formatBytes(currentBytes)} < 300 MB). Normal operations continue.`);
  } else {
    console.log(`\n⚠️  GUARDRAIL TRIGGERED: Database size ${formatBytes(currentBytes)} >= 300 MB!`);

    // --- LEVEL 1 (>= 300 MB) ---
    console.log('\n--- Escalation Level 1 (>= 300 MB) ---');
    await executeStandardCleanup(cleanUrl, headers, 'Level 1 Sweep');

    stats = await callRpc(cleanUrl, headers, 'get_database_storage_stats');
    currentBytes = stats.database_size_bytes;
    console.log(`  Re-measured Size after Level 1: ${stats.database_size_pretty} (${currentBytes.toLocaleString()} bytes)`);

    if (currentBytes < THRESHOLDS.LEVEL_1_WARNING) {
      console.log('  ✅ Size returned below 300 MB. Stopping cleanup escalation.');
    } else if (currentBytes >= THRESHOLDS.LEVEL_2_ELEVATED) {
      // --- LEVEL 2 (>= 350 MB) ---
      console.log('\n--- Escalation Level 2 (>= 350 MB) ---');
      console.log('  Elevated storage detected. Verifying remaining disposable tables...');

      stats = await callRpc(cleanUrl, headers, 'get_database_storage_stats');
      currentBytes = stats.database_size_bytes;

      if (currentBytes < THRESHOLDS.LEVEL_2_ELEVATED) {
        console.log('  ✅ Size returned below 350 MB. Stopping cleanup escalation.');
      } else if (currentBytes >= THRESHOLDS.LEVEL_3_ANALYSIS) {
        // --- LEVEL 3 (>= 400 MB) ---
        console.log('\n--- Escalation Level 3 (>= 400 MB): Storage Consumption Analysis ---');

        console.log('\nTop 10 Largest Tables:');
        console.table(stats.top_tables.map(t => ({
          'Table': t.table_name,
          'Total Size': t.total_size,
          'Table Size': t.table_size,
          'Index Size': t.index_size,
          'Live Rows': t.live_rows_estimate,
          'Dead Tuples': t.dead_rows_estimate
        })));

        console.log('\nTop 10 Largest Indexes:');
        console.table(stats.top_indexes.map(i => ({
          'Index': i.index_name,
          'Table': i.table_name,
          'Size': i.index_size
        })));

        // Run second batch pass for past events in case high volume ended
        console.log('\nRunning secondary batch pass for past events...');
        try {
          const secondaryDel = await callRpc(cleanUrl, headers, 'cleanup_past_events', { p_batch_size: 200 });
          console.log(`  Secondary Pass Result: Deleted ${Array.isArray(secondaryDel) ? secondaryDel.length : 0} past event(s).`);
        } catch (err) {
          console.warn(`  ⚠️ Secondary past event cleanup error: ${err.message}`);
        }

        stats = await callRpc(cleanUrl, headers, 'get_database_storage_stats');
        currentBytes = stats.database_size_bytes;

        if (currentBytes >= THRESHOLDS.EMERGENCY) {
          // --- EMERGENCY LEVEL (>= 450 MB) ---
          console.log('\n🚨🚨🚨 EMERGENCY LEVEL TRIGGERED (>= 450 MB) 🚨🚨🚨');
          console.log(`Current size: ${stats.database_size_pretty}. Headroom to 500 MB: ${formatBytes(THRESHOLDS.FREE_TIER_LIMIT - currentBytes)}!`);
          console.log('CRITICAL: All automated cleanup routines have been exhausted.');
          console.log('Active events (end_at >= now()), published records, and valid media are strictly protected by policy and will NOT be deleted.');
          console.log('ACTION REQUIRED: Inspect largest tables above and consider upgrading to Supabase Pro plan.');

          if (currentBytes >= THRESHOLDS.CRITICAL) {
            // --- CRITICAL ALERT (>= 475 MB) ---
            console.error('\n🔴🔴🔴 CRITICAL STORAGE ALERT (>= 475 MB) 🔴🔴🔴');
            console.error(`DANGER: Database is within ${formatBytes(THRESHOLDS.FREE_TIER_LIMIT - currentBytes)} of the 500 MB Free-tier limit!`);
            console.error('Immediate administrative intervention or plan upgrade required to prevent PostgreSQL write-lockdown.');
          }
        }
      }
    }
  }

  // 6. Final Summary
  const durationMs = Date.now() - startTime;
  console.log('\n' + '='.repeat(70));
  console.log('📊 GUARDRAIL EXECUTION SUMMARY');
  console.log(`- Initial Database Size: ${formatBytes(initialBytes)}`);
  console.log(`- Final Database Size:   ${formatBytes(currentBytes)}`);
  console.log(`- Net Storage Change:    ${(currentBytes - initialBytes) <= 0 ? '-' + formatBytes(initialBytes - currentBytes) : '+' + formatBytes(currentBytes - initialBytes)}`);
  console.log(`- Headroom to 500 MB:    ${formatBytes(THRESHOLDS.FREE_TIER_LIMIT - currentBytes)}`);
  console.log(`- Guardrail Status:      ${currentBytes >= THRESHOLDS.EMERGENCY ? '🚨 EMERGENCY' : currentBytes >= THRESHOLDS.LEVEL_1_WARNING ? '⚠️ WARNING' : '✅ HEALTHY'}`);
  console.log(`- Execution Duration:    ${durationMs}ms`);
  console.log('='.repeat(70));
}

runGuardrail().catch(err => {
  console.error('Unhandled fatal error in guardrail execution:', err);
  process.exit(1);
});
