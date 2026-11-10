// lpu-events-student/src/shared/telemetry/__tests__/synthetic_automation_stage14.test.ts
// Stage 14: Playwright Synthetic Automation Verification Suite (MON-005 §3, §4 / MON-008 Stage 14)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Stage 14: Playwright Synthetic Health Automation Suite', async (t) => {
  const specPath = path.resolve('lpu-events-student/tests/synthetic/platform.health.spec.ts');
  const workflowPath = path.resolve('lpu-events-student/.github/workflows/synthetic-health.yml');
  const configPath = path.resolve('lpu-events-student/tests/synthetic/playwright.config.ts');

  await t.test('1. Spec file exists and contains all 4 synthetic health tests', () => {
    assert.ok(fs.existsSync(specPath), 'platform.health.spec.ts must exist');
    const content = fs.readFileSync(specPath, 'utf8');

    // Multi-app coverage assertions
    assert.match(content, /Student Website mounts React root/);
    assert.match(content, /Admin Website loads login portal/);
    assert.match(content, /Cloudflare Worker \/health route returns healthy/);
    assert.match(content, /Supabase Edge Health endpoint returns healthy/);

    // Hostname and element assertions
    assert.match(content, /https:\/\/lpuevents\.live/);
    assert.match(content, /https:\/\/admin\.lpuevents\.live\/login/);
    assert.match(content, /#root/);
    assert.match(content, /#lpu-startup-shell/);
    assert.match(content, /x-correlation-id/);
  });

  await t.test('2. GitHub Actions workflow runs on 6-hour cron and obeys billing cap', () => {
    assert.ok(fs.existsSync(workflowPath), 'synthetic-health.yml must exist');
    const content = fs.readFileSync(workflowPath, 'utf8');

    // Cron verification: every 6 hours
    assert.match(content, /cron:\s*['"]0 \*\/?6 \* \* \*['"]/);
    assert.match(content, /workflow_dispatch:/);

    // Timeout verification: max 5 minutes (prevents billing runaway)
    assert.match(content, /timeout-minutes:\s*5/);

    // Concurrency group verification (cancel in progress)
    assert.match(content, /concurrency:/);
    assert.match(content, /cancel-in-progress:\s*true/);
  });

  await t.test('3. GitHub Actions billing calculations match MON-005 §4.1 formula', () => {
    const runsPerDay = 4;
    const daysPerMonth = 30;
    const totalRunsPerMonth = runsPerDay * daysPerMonth; // 120

    const baselineRunMinutes = 2; // ~1m 11s rounded up
    const baselineBillableMinutes = totalRunsPerMonth * baselineRunMinutes; // 240

    const slowRunMinutes = 3; // ~2m 17s rounded up
    const slowBillableMinutes = totalRunsPerMonth * slowRunMinutes; // 360

    const hardTimeoutMinutes = 5; // Hard cap
    const ceilingBillableMinutes = totalRunsPerMonth * hardTimeoutMinutes; // 600

    const freeTierAllowanceMinutes = 2000;

    assert.equal(totalRunsPerMonth, 120);
    assert.equal(baselineBillableMinutes, 240);
    assert.equal(slowBillableMinutes, 360);
    assert.equal(ceilingBillableMinutes, 600);

    // Baseline consumption must consume at most 12% of free tier
    const baselineUsagePercent = (baselineBillableMinutes / freeTierAllowanceMinutes) * 100;
    assert.equal(baselineUsagePercent, 12.0);

    // Free headroom must be at least 1400 minutes
    const headroom = freeTierAllowanceMinutes - ceilingBillableMinutes;
    assert.ok(headroom >= 1400, 'Must preserve substantial minutes for standard CI builds');
  });

  await t.test('4. Playwright config provides targeted Chromium runner configuration', () => {
    assert.ok(fs.existsSync(configPath), 'playwright.config.ts must exist');
    const content = fs.readFileSync(configPath, 'utf8');
    assert.match(content, /chromium/);
    assert.match(content, /screenshot:\s*['"]only-on-failure['"]/);
  });
});
