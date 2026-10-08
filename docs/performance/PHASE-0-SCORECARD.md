# Phase 0 — Performance Engineering Scorecard

**Repository:** `narnoliapramod561-stack/lpu-events-student`  
**Evaluation Standard:** Core Web Vitals (CWV) & Architectural Efficiency Targets  
**Date:** October 2026

---

## 1. Executive Performance Scorecard

| Metric | Measured Baseline (Production) | Engineering Target | Status | Architectural Root Cause |
|---|---|---|---|---|
| **FCP (Cold Desktop)** | **1,940 ms** (max 3,616 ms) | `< 1,800 ms` | ⚠️ **AT RISK** | Dependent on edge worker cold start & HTML transfer latency. |
| **FCP (Warm Desktop)** | **80 ms** | `< 1,800 ms` | ✅ **PASS** | Inline HTML startup shell paints on frame 1. |
| **LCP (Cold Desktop)** | **2,604 ms** (max 5,360 ms) | `< 2,500 ms` | ❌ **FAIL** | Startup shell holds screen for >3.2s; default image 404 double-fetch. |
| **LCP (Cold Mobile)** | **3,452 ms** (max 3,592 ms) | `< 2,500 ms` | ❌ **FAIL** | Shell logo handoff delay + mobile network round-trips for HTML error fallback. |
| **LCP (Warm Mobile)** | **816 ms** (max 1,632 ms) | `< 2,500 ms` | ✅ **PASS** | Cached asset paint occurs immediately upon shell dismissal. |
| **CLS (Cumulative Layout Shift)** | **0.000** | `< 0.100` | ✅ **EXCELLENT** | Strict container aspect ratios (`16/9`, fixed hero heights). |
| **INP (Interaction to Next Paint)** | **< 45 ms** | `< 200 ms` | ✅ **PASS** | Passive event listeners and smooth transitions. |
| **TTFB (Production Cold)** | **827 ms** (max 2,607 ms) | `< 600 ms` | ❌ **FAIL** | Edge worker initialization + PostgREST cold query latency. |
| **TTFB (Production Warm)** | **1.5 ms** (browser) / **438 ms** (edge) | `< 200 ms` | ✅ **PASS** | Browser HTTP disk cache & Cloudflare CDN hit. |
| **Initial JS Transfer Size** | **144.86 KB gzip** (523.64 KB raw) | `< 120 KB gzip` | ⚠️ **MARGINAL** | Framer Motion (41.6 KB gzip) + React (51.8 KB gzip) + App (51.4 KB gzip). |
| **Initial API Request Count** | **1 request** (`/api/public/homepage`) | `<= 1 request` | ✅ **PASS** | Aggregated homepage bundle combines categories, ads, events. |
| **Homepage API Payload Size** | **12.44 KB** (13,664 bytes raw) | `< 25 KB` | ✅ **PASS** | Minimal SQL projection keeps initial bundle compact. |
| **First Viewport Image Bytes** | **131.28 KB per card** (24.5 KB HTML + 106.8 KB WebP) | `< 40 KB per card` | ❌ **FAIL** | Missing responsive suffix causes 24 KB HTML download before 106 KB WebP. |
| **Main-Thread Long Tasks (>50ms)** | **0 during initial paint**; 1 during category filter switch | `<= 1 task` | ✅ **PASS** | Telemetry is deferred; initial parse chunks split across vendor files. |
| **Supabase Queries per Cache Miss** | **7 parallel queries** | `<= 2 queries` | ❌ **FAIL** | Worker fans out to 7 separate PostgREST endpoints per cache miss. |

---

## 2. Metric Analysis & Key Bottlenecks

### 1. Largest Contentful Paint (LCP) is Dominated by the Startup Shell
On cold loads, the application's actual content is ready around ~1,800ms. However, the startup shell's coordinator forcibly holds the screen behind an opaque blur until **3,272ms – 5,230ms**, artificially dragging LCP past the 2.5-second threshold.

### 2. The 131 KB Image Transfer Anomaly
Every card using default subcategory artwork wastes **24,469 bytes of network transfer downloading `index.html`** because `getResponsiveImageUrl()` requests non-existent `_mobile.webp` or `_desktop.webp` files. This adds an unnecessary round-trip and inflates first-viewport image weight by over 300%.

### 3. Edge Origin Fan-Out
When `/api/public/homepage` misses edge cache, the Worker fires 7 parallel HTTPS queries to Supabase. If any one query stutters (such as `categories` at 1.32s or `featured_events` at 1.19s), the entire response is delayed, resulting in TTFBs exceeding 2.0s.
