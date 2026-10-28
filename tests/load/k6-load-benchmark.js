import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ============================================================================
// LPU Events — Latency Under Load Benchmark Suite (k6)
// Measures latency percentiles (p50, p90, p95, p99), TTFB, throughput (RPS),
// and error rates under progressive concurrency (10 -> 25 -> 50 -> 100 VUs).
// ============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const QUICK_RUN = __ENV.QUICK_RUN === 'true';

// Latency Trends per Endpoint Class
const latencyHomepage = new Trend('latency_homepage_api', true);
const latencyFeed = new Trend('latency_events_feed_api', true);
const latencySearch = new Trend('latency_search_api', true);
const latencyCategories = new Trend('latency_categories_api', true);
const latencyAppShell = new Trend('latency_app_shell', true);
const ttfbTrend = new Trend('ttfb_all_endpoints', true);

// Failure Rates & Counters
const failureRate = new Rate('benchmark_error_rate');
const requestCount = new Counter('total_benchmark_requests');

export const options = {
  scenarios: {
    progressive_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: QUICK_RUN
        ? [
            { duration: '5s', target: 10 },
            { duration: '10s', target: 25 },
            { duration: '15s', target: 50 },
            { duration: '5s', target: 0 },
          ]
        : [
            { duration: '10s', target: 10 },   // Tier 1: Baseline load (10 VUs)
            { duration: '15s', target: 25 },   // Tier 2: Mild load (25 VUs)
            { duration: '20s', target: 50 },   // Tier 3: Moderate load (50 VUs)
            { duration: '20s', target: 100 },  // Tier 4: Peak load (100 VUs)
            { duration: '10s', target: 0 },    // Cooldown
          ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],                 // Error rate < 5%
    http_req_duration: ['p(95)<1500', 'p(99)<2500'], // 95% of requests under 1.5s
    latency_homepage_api: ['p(95)<1200'],
    benchmark_error_rate: ['rate<0.05'],
  },
};

export default function () {
  requestCount.add(1);

  // Realistic Student User Traffic Distribution:
  // 35% Homepage API
  // 25% Events Feed API (timeline & filter variants)
  // 15% Search API (common queries)
  // 15% Categories Taxonomy
  // 10% HTML SPA App Shell
  const rand = Math.random() * 100;

  if (rand < 35) {
    // 1. Homepage API
    const res = http.get(`${BASE_URL}/api/public/homepage`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'k6-load-benchmark/1.0',
      },
      tags: { endpoint: 'homepage' },
    });

    latencyHomepage.add(res.timings.duration);
    ttfbTrend.add(res.timings.waiting);
    const ok = check(res, {
      'homepage: status 200': (r) => r.status === 200,
      'homepage: has valid body': (r) => r.body && r.body.length > 50,
    });
    failureRate.add(!ok);

  } else if (rand < 60) {
    // 2. Events Feed API
    const timelines = ['all', 'today', 'upcoming'];
    const timeline = timelines[Math.floor(Math.random() * timelines.length)];
    const res = http.get(`${BASE_URL}/api/public/events?limit=20&offset=0&timeline=${timeline}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'k6-load-benchmark/1.0',
      },
      tags: { endpoint: 'events_feed' },
    });

    latencyFeed.add(res.timings.duration);
    ttfbTrend.add(res.timings.waiting);
    const ok = check(res, {
      'feed: status 200': (r) => r.status === 200,
    });
    failureRate.add(!ok);

  } else if (rand < 75) {
    // 3. Search API
    const queries = ['workshop', 'hackathon', 'cultural', 'dance', 'ai', 'tech', 'music'];
    const q = queries[Math.floor(Math.random() * queries.length)];
    const res = http.get(`${BASE_URL}/api/public/search?q=${encodeURIComponent(q)}&limit=20&offset=0`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'k6-load-benchmark/1.0',
      },
      tags: { endpoint: 'search' },
    });

    latencySearch.add(res.timings.duration);
    ttfbTrend.add(res.timings.waiting);
    const ok = check(res, {
      'search: status 200': (r) => r.status === 200,
    });
    failureRate.add(!ok);

  } else if (rand < 90) {
    // 4. Categories Taxonomy
    const res = http.get(`${BASE_URL}/api/public/categories`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'k6-load-benchmark/1.0',
      },
      tags: { endpoint: 'categories' },
    });

    latencyCategories.add(res.timings.duration);
    ttfbTrend.add(res.timings.waiting);
    const ok = check(res, {
      'categories: status 200': (r) => r.status === 200,
    });
    failureRate.add(!ok);

  } else {
    // 5. App Shell HTML
    const res = http.get(`${BASE_URL}/`, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'k6-load-benchmark/1.0',
      },
      tags: { endpoint: 'app_shell' },
    });

    latencyAppShell.add(res.timings.duration);
    ttfbTrend.add(res.timings.waiting);
    const ok = check(res, {
      'shell: status 200': (r) => r.status === 200,
    });
    failureRate.add(!ok);
  }

  // Realistic student think time (100ms - 300ms)
  sleep(Math.random() * 0.2 + 0.1);
}
