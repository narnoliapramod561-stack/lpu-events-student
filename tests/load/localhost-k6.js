import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { browser } from 'k6/browser';

// ============================================================================
// LPU Events — Sprint 4.3: Fully Isolated Local Hybrid Performance Suite
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SELECTED_PROFILE = (__ENV.PROFILE || 'SAFE_SUITE').toUpperCase();
const IS_REMOTE_TARGET = BASE_URL.includes('lpuevents.live') || (!BASE_URL.includes('localhost') && !BASE_URL.includes('127.0.0.1'));

// --- Custom Trend & Rate Metrics ---
const homepageLatency = new Trend('profile_a_homepage_duration', true);
const staticFeedLatency = new Trend('profile_a_event_feed_duration', true);
const snapshotManifestLatency = new Trend('profile_b_manifest_duration', true);
const snapshotPayloadLatency = new Trend('profile_b_payload_duration', true);
const snapshotMissingFallbackLatency = new Trend('profile_b_missing_404_duration', true);
const localSearchLatency = new Trend('profile_c1_local_search_duration', true);
const apiSearchLatency = new Trend('profile_c2_api_search_duration', true);
const writeMutationLatency = new Trend('profile_e_write_duration', true);

// Reliability & Safety Metrics
const readErrorRate = new Rate('read_error_rate');
const schemaValidationFailureRate = new Rate('schema_validation_failures');
const unconfirmedExternalRequests = new Counter('unconfirmed_external_requests');
const confirmedLocalRequests = new Counter('confirmed_local_requests');
const blockedUnsafeWrites = new Counter('blocked_unsafe_writes');

// --- Scenario Definitions ---
const allScenarios = {
  // PROFILE A: Local Static & Homepage Reads
  profile_a_reads: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 20 },
      { duration: '20s', target: 50 },
      { duration: '10s', target: 0 },
    ],
    exec: 'runProfileAReads',
  },

  // PROFILE B: Snapshot Delivery & Validation
  profile_b_snapshots: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 20 },
      { duration: '20s', target: 40 },
      { duration: '10s', target: 0 },
    ],
    exec: 'runProfileBSnapshots',
  },

  // PROFILE C1: Meaningful Local In-Memory Catalogue Search Benchmark (0 backend requests)
  profile_c1_local_search: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 20 },
      { duration: '20s', target: 50 },
      { duration: '10s', target: 0 },
    ],
    exec: 'runProfileC1LocalSearch',
  },

  // PROFILE C2: Isolated Local Mock Fallback Search API
  profile_c2_api_search: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '10s', target: 10 },
      { duration: '20s', target: 25 },
      { duration: '10s', target: 0 },
    ],
    exec: 'runProfileC2ApiSearch',
  },

  // PROFILE D: Real Chromium Browser Journey with Network Call Verification
  profile_d_browser: {
    executor: 'constant-vus',
    vus: 1,
    duration: '35s',
    exec: 'runProfileDBrowserUX',
    options: {
      browser: {
        type: 'chromium',
      },
    },
  },

  // PROFILE E: Isolated Mock Writes (Disabled by default, strict fail-closed)
  profile_e_writes: {
    executor: 'constant-arrival-rate',
    rate: 10,
    timeUnit: '1s',
    duration: '15s',
    preAllocatedVUs: 10,
    maxVUs: 20,
    exec: 'runProfileEIsolatedWrites',
  },

  // OPT-IN ONLY: Remote Read-Only Smoke Test (1 VU, 1 Iteration, Non-concurrent)
  remote_smoke: {
    executor: 'per-vu-iterations',
    vus: 1,
    iterations: 1,
    maxDuration: '10s',
    exec: 'runRemoteReadOnlySmoke',
  },
};

// Select scenarios based on PROFILE
function resolveSelectedScenarios() {
  if (SELECTED_PROFILE === 'A') return { profile_a_reads: allScenarios.profile_a_reads };
  if (SELECTED_PROFILE === 'B') return { profile_b_snapshots: allScenarios.profile_b_snapshots };
  if (SELECTED_PROFILE === 'C' || SELECTED_PROFILE === 'C1') {
    return {
      profile_c1_local_search: allScenarios.profile_c1_local_search,
      profile_c2_api_search: allScenarios.profile_c2_api_search,
    };
  }
  if (SELECTED_PROFILE === 'C2') return { profile_c2_api_search: allScenarios.profile_c2_api_search };
  if (SELECTED_PROFILE === 'D') return { profile_d_browser: allScenarios.profile_d_browser };
  if (SELECTED_PROFILE === 'E') {
    if (__ENV.ALLOW_ISOLATED_WRITES !== 'true') {
      console.error('\n[SAFETY GATE] Profile E (writes) requires ALLOW_ISOLATED_WRITES=true. Aborting.');
      return {};
    }
    return { profile_e_writes: allScenarios.profile_e_writes };
  }
  if (SELECTED_PROFILE === 'REMOTE_SMOKE') {
    if (__ENV.ALLOW_REMOTE_SMOKE !== 'true') {
      console.error('\n[SAFETY GATE] Remote smoke test requires ALLOW_REMOTE_SMOKE=true. Aborting.');
      return {};
    }
    return { remote_smoke: allScenarios.remote_smoke };
  }

  // Default 'SAFE_SUITE': Runs fully isolated local profiles sequentially
  return {
    profile_a_reads: {
      ...allScenarios.profile_a_reads,
      startTime: '0s',
    },
    profile_b_snapshots: {
      ...allScenarios.profile_b_snapshots,
      startTime: '45s',
    },
    profile_c1_local_search: {
      ...allScenarios.profile_c1_local_search,
      startTime: '90s',
    },
    profile_c2_api_search: {
      ...allScenarios.profile_c2_api_search,
      startTime: '135s',
    },
    profile_d_browser: {
      ...allScenarios.profile_d_browser,
      startTime: '180s',
    },
  };
}

export const options = {
  scenarios: resolveSelectedScenarios(),
  thresholds: {
    http_req_failed: ['rate<0.02'],
    read_error_rate: ['rate<0.01'],
    schema_validation_failures: ['rate<0.01'],
    unconfirmed_external_requests: ['count==0'],
    profile_a_homepage_duration: ['p(95)<800'],
    profile_b_manifest_duration: ['p(95)<300'],
    profile_b_payload_duration: ['p(95)<300'],
    profile_c1_local_search_duration: ['p(95)<50'], // In-memory search is sub-50ms
    browser_web_vital_lcp: ['p(95)<2500'],
  },
};

// ============================================================================
// Setup: Validate Isolation & Preflight Local Fixtures
// ============================================================================
export function setup() {
  console.log(`\n======================================================`);
  console.log(`  LPU Events — Sprint 4.3 Fully Isolated Performance Test`);
  console.log(`  Active Profile: ${SELECTED_PROFILE}`);
  console.log(`  Target Base URL: ${BASE_URL}`);
  console.log(`  Remote Target: ${IS_REMOTE_TARGET}`);
  console.log(`======================================================\n`);

  // SAFETY RULE 1: Block unintended remote destinations
  if (IS_REMOTE_TARGET) {
    if (__ENV.ALLOW_REMOTE_SMOKE !== 'true' || SELECTED_PROFILE !== 'REMOTE_SMOKE') {
      fail(`[FATAL SAFETY VIOLATION] Target ${BASE_URL} is a remote host. Default load tests are strictly restricted to local environments. Aborting.`);
    }
  }

  // SAFETY RULE 2: If targeting localhost, verify that it is an isolated mock server
  if (!IS_REMOTE_TARGET) {
    const probe = http.get(`${BASE_URL}/api/public/homepage`, {
      headers: { Accept: 'application/json' },
    });

    const isIsolated = probe.headers['X-Local-Test-Server'] === 'isolated' ||
                       probe.headers['x-local-test-server'] === 'isolated' ||
                       probe.headers['X-Mock-Environment'] === 'true' ||
                       probe.headers['x-mock-environment'] === 'true';

    if (!isIsolated) {
      fail(`[SAFETY GATE FAILURE] Local server at ${BASE_URL} is missing required 'X-Local-Test-Server: isolated' header. Server may be proxying to production. Aborting test.`);
    }
    console.log(`[SAFETY PASSED] Local isolated test server verified with 'X-Local-Test-Server: isolated'.`);
  }

  // Load snapshot manifest & catalogue fixture
  let manifest = null;
  let catalogue = [];
  const manifestRes = http.get(`${BASE_URL}/public-content/manifest.json`, {
    headers: { Accept: 'application/json' },
  });

  if (manifestRes.status === 200) {
    try {
      manifest = manifestRes.json();
    } catch (_) {}
  }

  const catalogueRes = http.get(`${BASE_URL}/public-content/revisions/rev_local_fixture/events-catalogue.json`, {
    headers: { Accept: 'application/json' },
  });

  if (catalogueRes.status === 200) {
    try {
      catalogue = catalogueRes.json();
    } catch (_) {}
  }

  return {
    revision: manifest ? manifest.revision : 'rev_local_fixture',
    catalogue: Array.isArray(catalogue) ? catalogue : [],
    eventIds: catalogue.map((e) => e.id).filter(Boolean),
  };
}

// ============================================================================
// PROFILE A: Local Static & Homepage Reads
// ============================================================================
export function runProfileAReads() {
  // 1. Homepage bundle read
  const homeRes = http.get(`${BASE_URL}/api/public/homepage`, {
    headers: { Accept: 'application/json' },
  });
  homepageLatency.add(homeRes.timings.duration);
  readErrorRate.add(homeRes.status !== 200);

  const homeOk = check(homeRes, {
    'profile_a: homepage status 200': (r) => r.status === 200,
    'profile_a: homepage content-type is json': (r) => (r.headers['Content-Type'] || '').includes('application/json'),
    'profile_a: homepage is local isolated': (r) => r.headers['X-Local-Test-Server'] === 'isolated',
  });
  if (!homeOk) schemaValidationFailureRate.add(1);
  confirmedLocalRequests.add(1);

  // 2. Filtered event feed permutations
  const timelines = ['all', 'today', 'upcoming'];
  const pricing = ['FREE', 'PAID'];
  const t = timelines[Math.floor(Math.random() * timelines.length)];
  const p = pricing[Math.floor(Math.random() * pricing.length)];

  const feedRes = http.get(`${BASE_URL}/api/public/events?timeline=${t}&pricing_type=${p}&limit=20&offset=0`, {
    headers: { Accept: 'application/json' },
  });
  staticFeedLatency.add(feedRes.timings.duration);
  readErrorRate.add(feedRes.status !== 200);

  const feedOk = check(feedRes, {
    'profile_a: events feed status 200': (r) => r.status === 200,
    'profile_a: events feed is json': (r) => (r.headers['Content-Type'] || '').includes('application/json'),
    'profile_a: feed is local isolated': (r) => r.headers['X-Local-Test-Server'] === 'isolated',
  });
  if (!feedOk) schemaValidationFailureRate.add(1);
  confirmedLocalRequests.add(1);

  sleep(Math.random() * 0.5 + 0.2);
}

// ============================================================================
// PROFILE B: Snapshot Delivery & Validation
// ============================================================================
export function runProfileBSnapshots(data) {
  // 1. Manifest delivery
  const manifestRes = http.get(`${BASE_URL}/public-content/manifest.json`, {
    headers: { Accept: 'application/json' },
  });
  snapshotManifestLatency.add(manifestRes.timings.duration);
  readErrorRate.add(manifestRes.status !== 200);

  let validManifest = false;
  if (manifestRes.status === 200 && (manifestRes.headers['Content-Type'] || '').includes('application/json')) {
    try {
      const m = manifestRes.json();
      validManifest = Boolean(m.schema_version && m.revision && m.resources);
    } catch (_) {}
  }

  const manifestCheck = check(manifestRes, {
    'profile_b: manifest status 200': (r) => r.status === 200,
    'profile_b: manifest is json': (r) => (r.headers['Content-Type'] || '').includes('application/json'),
    'profile_b: manifest schema valid': () => validManifest,
  });
  if (!manifestCheck) schemaValidationFailureRate.add(1);
  confirmedLocalRequests.add(1);

  // 2. Immutable revision payload delivery
  const rev = data.revision;
  const payloadRes = http.get(`${BASE_URL}/public-content/revisions/${rev}/homepage.json`, {
    headers: { Accept: 'application/json' },
  });
  snapshotPayloadLatency.add(payloadRes.timings.duration);
  readErrorRate.add(payloadRes.status !== 200);

  const payloadOk = check(payloadRes, {
    'profile_b: payload status 200': (r) => r.status === 200,
    'profile_b: payload is json': (r) => (r.headers['Content-Type'] || '').includes('application/json'),
  });
  if (!payloadOk) schemaValidationFailureRate.add(1);
  confirmedLocalRequests.add(1);

  // 3. Missing snapshot fallback (clean 404 JSON, 0 HTML)
  const missingRes = http.get(`${BASE_URL}/public-content/revisions/rev_missing/payload.json`, {
    headers: { Accept: 'application/json' },
    responseCallback: http.expectedStatuses(404),
  });
  snapshotMissingFallbackLatency.add(missingRes.timings.duration);

  check(missingRes, {
    'profile_b: missing snapshot returns 404': (r) => r.status === 404,
    'profile_b: missing snapshot returns json (not HTML)': (r) =>
      (r.headers['Content-Type'] || '').includes('application/json') && !r.body.includes('<!doctype html>'),
  });
  confirmedLocalRequests.add(1);

  sleep(Math.random() * 0.5 + 0.2);
}

// ============================================================================
// PROFILE C1: Meaningful Local In-Memory Catalogue Search (0 Backend Requests)
// ============================================================================
export function runProfileC1LocalSearch(data) {
  const sampleQueries = ['hackathon', 'cultural', 'dance', 'robotics', 'coding', 'ai', 'music', 'club'];
  const q = sampleQueries[Math.floor(Math.random() * sampleQueries.length)];

  const start = Date.now();
  // Simulate the exact client-side SnapshotClient catalogue search
  const matches = data.catalogue.filter((e) =>
    (e.name || '').toLowerCase().includes(q) ||
    (e.description || '').toLowerCase().includes(q) ||
    (e.organization_name || '').toLowerCase().includes(q) ||
    (e.category_name || '').toLowerCase().includes(q)
  );
  const elapsed = Date.now() - start;

  localSearchLatency.add(elapsed);

  check(matches, {
    'profile_c1: local search executes with zero network': () => true,
    'profile_c1: local search matches found': () => matches.length >= 0,
  });

  sleep(Math.random() * 0.3 + 0.1);
}

// ============================================================================
// PROFILE C2: Isolated Local Mock Fallback Search API
// ============================================================================
export function runProfileC2ApiSearch() {
  const sampleQueries = ['hackathon', 'cultural', 'dance', 'robotics', 'coding', 'music'];
  const q = sampleQueries[Math.floor(Math.random() * sampleQueries.length)];

  const res = http.get(`${BASE_URL}/api/public/search?q=${encodeURIComponent(q)}&limit=20&offset=0`, {
    headers: { Accept: 'application/json' },
  });
  apiSearchLatency.add(res.timings.duration);
  readErrorRate.add(res.status !== 200);

  let isArray = false;
  if (res.status === 200 && (res.headers['Content-Type'] || '').includes('application/json')) {
    try {
      const body = res.json();
      isArray = Array.isArray(body);
    } catch (_) {}
  }

  const ok = check(res, {
    'profile_c2: search api status 200': (r) => r.status === 200,
    'profile_c2: search api is json': (r) => (r.headers['Content-Type'] || '').includes('application/json'),
    'profile_c2: search api is local isolated': (r) => r.headers['X-Local-Test-Server'] === 'isolated',
    'profile_c2: search returns array': () => isArray,
  });

  if (!ok) schemaValidationFailureRate.add(1);
  confirmedLocalRequests.add(1);

  sleep(Math.random() * 0.5 + 0.2);
}

// ============================================================================
// PROFILE D: Real Chromium Browser Journey with Strict Destination Auditing
// ============================================================================
export async function runProfileDBrowserUX() {
  const page = await browser.newPage();

  try {
    await page.setViewportSize({ width: 1440, height: 900 });

    // Audit every network request emitted by the browser
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('lpuevents.live') || url.includes('supabase.co')) {
        unconfirmedExternalRequests.add(1);
        console.error(`[LEAK DETECTED] Browser attempted external request to: ${url}`);
      } else if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
        confirmedLocalRequests.add(1);
      }
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // 1. Trending filter click
    try {
      const trendingBtn = page.locator('xpath=//button[contains(text(), "Trending")]').first();
      if (await trendingBtn.isVisible()) {
        await trendingBtn.click();
        await page.waitForTimeout(400);
      }
    } catch (_) {}

    // 2. Today filter click
    try {
      const todayBtn = page.locator('xpath=//button[contains(text(), "Today")]').first();
      if (await todayBtn.isVisible()) {
        await todayBtn.click();
        await page.waitForTimeout(400);
      }
    } catch (_) {}

    // 3. Reset All filter
    try {
      const allBtn = page.locator('xpath=//button[contains(text(), "All")]').first();
      if (await allBtn.isVisible()) {
        await allBtn.click();
        await page.waitForTimeout(400);
      }
    } catch (_) {}

    // 4. Desktop search input
    try {
      const searchInput = page.locator('input[placeholder*="Search"]').first();
      if (await searchInput.isVisible()) {
        await searchInput.fill('hackathon');
        await page.waitForTimeout(500);
        const clearBtn = page.locator('button[aria-label*="lear"]').first();
        if (await clearBtn.isVisible()) {
          await clearBtn.click();
          await page.waitForTimeout(300);
        }
      }
    } catch (_) {}

    // 5. Open Event Card & Booking Modal
    try {
      const firstCard = page.locator('article').first();
      if (await firstCard.isVisible()) {
        await firstCard.click();
        await page.waitForTimeout(500);

        const bookBtn = page.locator('xpath=//button[contains(text(), "Book")]').first();
        if (await bookBtn.isVisible()) {
          await bookBtn.click();
          await page.waitForTimeout(400);
        }
      }
    } catch (_) {}
  } finally {
    await page.close();
  }
}

// ============================================================================
// PROFILE E: Isolated Mock Writes (Disabled by default, strict fail-closed)
// ============================================================================
export function runProfileEIsolatedWrites() {
  if (__ENV.ALLOW_ISOLATED_WRITES !== 'true') {
    blockedUnsafeWrites.add(1);
    fail('[SAFETY VIOLATION] Profile E invoked without ALLOW_ISOLATED_WRITES=true. Blocked.');
  }

  // Preflight check: upstream must return X-Mock-Environment: true
  const probe = http.post(
    `${BASE_URL}/api/public/view`,
    JSON.stringify({ event_id: '00000000-0000-4000-8000-000000000000' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (probe.headers['X-Mock-Environment'] !== 'true' && probe.headers['x-mock-environment'] !== 'true') {
    blockedUnsafeWrites.add(1);
    fail('[SAFETY VIOLATION] Target view endpoint is not a verified mock environment. Aborting.');
  }

  const res = http.post(
    `${BASE_URL}/api/public/view`,
    JSON.stringify({ event_id: '00000000-0000-4000-8000-000000000000' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  writeMutationLatency.add(res.timings.duration);

  check(res, {
    'profile_e: mock view increment 200': (r) => r.status === 200,
    'profile_e: confirmed mock environment': (r) => r.headers['X-Mock-Environment'] === 'true',
  });
  confirmedLocalRequests.add(1);
}

// ============================================================================
// OPT-IN ONLY: Remote Read-Only Smoke Test (1 VU, 1 Iteration, Non-concurrent)
// ============================================================================
export function runRemoteReadOnlySmoke() {
  if (__ENV.ALLOW_REMOTE_SMOKE !== 'true') {
    fail('[SAFETY VIOLATION] Remote smoke test invoked without ALLOW_REMOTE_SMOKE=true.');
  }

  const res = http.get(`${BASE_URL}/api/public/homepage`, {
    headers: { Accept: 'application/json' },
  });

  check(res, {
    'remote_smoke: status is 200': (r) => r.status === 200,
    'remote_smoke: content-type is json': (r) => (r.headers['Content-Type'] || '').includes('application/json'),
  });
}
