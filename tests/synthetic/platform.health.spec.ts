// lpu-events-student/tests/synthetic/platform.health.spec.ts
// Platform Production Synthetic Health Automation (MON-005 §3 / MON-008 Stage 14)
// Probes public production endpoints for Student Website, Admin Website, Cloudflare Worker, and Supabase Edge Functions.

import { test, expect } from '@playwright/test';

test.describe('Platform Production Synthetic Health', () => {
  test('Student Website mounts React root and renders event content', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('https://lpuevents.live', { waitUntil: 'domcontentloaded' });

    // 1. Verify React root container mounted
    const root = page.locator('#root');
    await expect(root).toBeVisible({ timeout: 6000 });

    // 2. Verify startup shell dismissed cleanly
    const startupShell = page.locator('#lpu-startup-shell');
    await expect(startupShell).not.toBeVisible({ timeout: 4000 });

    // 3. Verify ErrorBoundary did not render fallback
    const errorHeading = page.getByRole('heading', { name: /something went wrong/i });
    await expect(errorHeading).not.toBeVisible();

    // 4. Verify critical navigation bar rendered
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 6000 });

    // 5. Verify zero uncaught JavaScript exceptions (ignoring benign ResizeObserver loop noise)
    const fatalErrors = pageErrors.filter(
      (msg) => !msg.includes('ResizeObserver loop') && !msg.includes('ResizeObserver loop completed')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('Admin Website loads login portal without runtime crashes', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('https://admin.lpuevents.live/login', { waitUntil: 'domcontentloaded' });

    // 1. Verify React root container mounted
    const root = page.locator('#root');
    await expect(root).toBeVisible({ timeout: 6000 });

    // 2. Verify login form / email input interface rendered
    const loginInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    await expect(loginInput.first()).toBeVisible({ timeout: 6000 });

    // 3. Verify zero uncaught JavaScript exceptions on login surface
    const fatalErrors = pageErrors.filter(
      (msg) => !msg.includes('ResizeObserver loop') && !msg.includes('ResizeObserver loop completed')
    );
    expect(fatalErrors).toHaveLength(0);
  });

  test('Cloudflare Worker /health route returns healthy status and correlation ID', async ({ request }) => {
    const res = await request.get('https://lpuevents.live/health');
    expect(res.status()).toBe(200);
    const correlationHeader = res.headers()['x-correlation-id'];
    expect(correlationHeader).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('lpu-events-student-worker');
    expect(body.correlationId).toBe(correlationHeader);
  });

  test('Supabase Edge Health endpoint returns healthy status and service status', async ({ request }) => {
    const res = await request.get('https://nhjphyqiqhmxdhppljap.supabase.co/functions/v1/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.services?.edge_runtime).toBe('healthy');
    expect(body.services?.database).toBe('healthy');
  });
});
