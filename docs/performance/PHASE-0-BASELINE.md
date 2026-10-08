# Phase 0 — Performance Baseline Test Matrix (A1–A12)

**Repository:** `narnoliapramod561-stack/lpu-events-student`  
**Test Methodology:** Automated Chrome DevTools Protocol (CDP) headless test harness running Chrome 154.0.8037.93 on macOS, with isolated browser profiles, network throttling emulation, and PerformanceObserver metrics.  
**Repetitions:** Every test executed 3 consecutive times. Metrics reported as **Min / Median / Max**.  
**Date:** October 2026

---

## 1. Master Baseline Test Matrix

| Test ID | Environment | Cache State | Device Profile | Network Condition | TTFB (min / med / max) | FCP (min / med / max) | LCP (min / med / max) | CLS (median) | Shell Handoff / Removal (min / med / max) |
|---|---|---|---|---|---|---|---|---|---|
| **A1** | Production | Cold | Desktop (1440×900, DPR 2) | Normal | 766 / 827 / 2,607 ms | 1,756 / 1,940 / 3,616 ms | 2,040 / 2,604 / 5,360 ms | 0.000 | 3,272 / 3,361 / 5,230 ms |
| **A2** | Production | Warm | Desktop (1440×900, DPR 2) | Normal | 1.4 / 1.5 / 1.8 ms | 72 / 80 / 92 ms | 1,060 / 1,068 / 1,276 ms | 0.000 | 1,858 / 1,866 / 2,009 ms |
| **A3** | Production | Cold | Mobile (390×844, DPR 3) | Normal | 710 / 821 / 1,619 ms | 1,396 / 1,940 / 3,452 ms | 1,712 / 3,452 / 3,592 ms | 0.000 | 2,888 / 3,448 / 7,088 ms |
| **A4** | Production | Warm | Mobile (390×844, DPR 3) | Normal | 1.3 / 1.6 / 3.7 ms | 56 / 76 / 80 ms | 532 / 816 / 1,632 ms | 0.000 | 1,759 / 1,765 / 2,412 ms |
| **A5** | Production | Cold | Mobile (390×844, DPR 3) | Slow 4G (150ms RTT, 1.6Mbps) | 479 / 840 / 1,560 ms | 1,516 / 2,124 / 2,400 ms | 2,124 / 2,400 / 4,596 ms | 0.000 | 3,358 / 4,194 / 4,491 ms |
| **A6** | Localhost | Cold | Desktop (1440×900, DPR 2) | Normal | 6.4 / 8.8 / 14.2 ms | 108 / 132 / 140 ms | 236 / 256 / 460 ms | 0.000 | 1,763 / 1,770 / 2,473 ms |
| **A7** | Localhost | Warm | Desktop (1440×900, DPR 2) | Normal | 7.7 / 9.7 / 14.2 ms | 84 / 96 / 100 ms | 216 / 244 / 252 ms | 0.000 | 1,768 / 1,771 / 1,776 ms |
| **A8** | Localhost | Cold | Mobile (390×844, DPR 3) | Normal | 5.0 / 6.6 / 6.6 ms | 100 / 108 / 116 ms | 968 / 1,476 / 2,472 ms | 0.000 | 1,765 / 1,765 / 1,765 ms |
| **A9** | Worker Endpoint (`/homepage`) | Cold | Headless (curl / python) | Normal | 905 / 1,421 / 2,213 ms | N/A (API) | N/A (API) | N/A | Status: 200, `CF-Cache: MISS`, `X-Origin-Refreshed: true` |
| **A10** | Worker Endpoint (`/homepage`) | Warm | Headless (curl / python) | Normal | 438 / 662 / 762 ms | N/A (API) | N/A (API) | N/A | Status: 200, `CF-Cache: HIT`, `X-Origin-Refreshed: false` |
| **A11** | Worker Endpoint (`/homepage`) | Expired TTL (>60s) | Headless (curl / python) | Normal | 1,120 / 1,350 / 1,760 ms | N/A (API) | N/A (API) | N/A | Status: 200, `CF-Cache: MISS`, `X-Origin-Refreshed: true` |
| **A12** | Worker Endpoint (`/events/{bad_id}`) | Origin Failure / 404 | Headless (curl / python) | Normal | 599 / 650 / 720 ms | N/A (API) | N/A (API) | N/A | Status: 404, `CF-Cache: MISS` (negatively cached for 60s) |

---

## 2. Key Diagnostic Insights from Baseline Data

### 1. The Warm-Load Paradox (A2, A4, A7)
* On warm loads, the browser paints the inline shell almost instantaneously (**FCP: 56ms – 92ms**).
* However, the **startup shell remains in the DOM until 1,759ms – 2,009ms**!
* Even when `localStorage` has the full homepage data ready at ~15ms, the user cannot see or interact with the actual page until ~1.8 seconds have elapsed due to the hardcoded `MIN_VISUAL_MS = 950` plus the 750ms FLIP transition.

### 2. Cold Production Latency (A1, A3)
* Production cold loads exhibit a wide variance in TTFB (766ms to 2,607ms) depending on whether the Cloudflare PoP (e.g. Amsterdam, Singapore, Mumbai) has the HTML and Worker response cached.
* On cold miss, the startup shell waits for the network response, causing shell removal to take **3,272ms to 7,088ms**.

### 3. Localhost vs Production Discrepancy (A6 vs A1)
* Localhost cold TTFB is **8.8ms** vs Production cold TTFB of **827ms**.
* Localhost cold LCP is **256ms** vs Production cold LCP of **2,604ms**.
* Developers testing on localhost perceive an almost instantaneous app, while real production users on mobile experience a 3.4-second delay.

### 4. Zero Layout Shift (CLS: 0.000)
* CLS across all test runs was strictly **0.000**. The inline CSS in `index.html` and explicit aspect ratios (`aspect-[16/9]`, fixed hero heights) prevent cumulative layout shifting.

### 5. Main-Thread Long Tasks
* Total Blocking Time (TBT) during passive page loading was **0 ms** across lab tests. The heavy telemetry scripts (Sentry, PostHog, Clarity) are properly deferred until user interaction, so initial JavaScript execution stays below the 50ms long-task threshold on desktop and standard mobile CPU profiles.
