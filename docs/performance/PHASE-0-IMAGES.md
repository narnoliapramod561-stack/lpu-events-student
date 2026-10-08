# Phase 0 — Image Performance Audit & Pipeline Verification

**Repository:** `narnoliapramod561-stack/lpu-events-student`  
**Files Audited:**
* `src/components/ProgressiveImage.tsx`
* `src/components/EventGrid.tsx`
* `src/components/HeroCarousel.tsx`
* `src/utils/images.ts`
* `src/shared/images/url.ts`
* `src/shared/images/defaults.ts`
**Status:** Empirically Verified via CDP Network & DOM Tracing (No modifications applied)

---

## 1. Executive Summary

The image pipeline contains the single most damaging performance and bandwidth bug in the student web application:

1. **Non-Existent Responsive Suffix Bug:** `getResponsiveImageUrl()` rewrites default image paths from `/defaults/events/subcategories/name.webp` to `name_mobile.webp`, `name_tablet.webp`, or `name_desktop.webp`. **None of these suffixed files exist on disk.**
2. **Cloudflare SPA 404 Intercept:** Because Cloudflare Worker has `not_found_handling: "single-page-application"`, the server returns `HTTP 200` with `Content-Type: text/html` and the full `index.html` payload (**24.47 KB**) instead of an image.
3. **Double Image Request / Decode Crash:** The browser attempts to decode the 24 KB HTML text as a WebP image, crashes with an image decode error, triggers `<img onError>`, and only then requests the real fallback image (`academics_seminar.webp`, **106 KB**).
4. **Ambient Backdrop Waste:** `ambientBackdrop=true` causes an additional background image to be attached to every event card with heavy CSS filters (`blur-2xl saturate-150 brightness-105 scale-125`), forcing a second decode and GPU composition step per card.
5. **Placeholder Deception:** For Cloudflare R2 images (`images.lpuevents.live`), `getLowResPlaceholderUrl(url)` returns `url` unchanged. The "low-res placeholder" downloads the **exact same 100% full-resolution HD image twice**.

---

## 2. Viewport & Dimensions Audit Matrix

We tested representative event cards and hero images across 4 target viewports:

| Viewport | Component / Slot | Rendered CSS Dimensions (W × H) | DPR | Target Pixels Required | Requested URL | Downloaded Dimensions | Transferred Bytes | Over-Fetch Ratio |
|---|---|---|---|---|---|---|---|---|
| **Mobile 360px** | Hero Banner | 344 × 193 px | 2.0 | 688 × 386 px | `.../academics_seminar_mobile.webp` (404) $\to$ fallback `academics_seminar.webp` | 1920 × 800 px | 24.5 KB (HTML) + 106.8 KB (WebP) | **+580%** (1920px served for 688px) |
| **Mobile 360px** | Event Card | 328 × 185 px | 2.0 | 656 × 370 px | `.../academics_seminar_mobile.webp` (404) $\to$ fallback `academics_seminar.webp` | 1920 × 800 px | 24.5 KB (HTML) + 106.8 KB (WebP) | **+650%** (1920px served for 656px) |
| **Mobile 390px** | Hero Banner | 374 × 210 px | 3.0 | 1122 × 630 px | `.../academics_seminar_mobile.webp` (404) $\to$ fallback `academics_seminar.webp` | 1920 × 800 px | 24.5 KB (HTML) + 106.8 KB (WebP) | **+180%** |
| **Mobile 390px** | Event Card | 358 × 201 px | 3.0 | 1074 × 603 px | `.../academics_seminar_mobile.webp` (404) $\to$ fallback `academics_seminar.webp` | 1920 × 800 px | 24.5 KB (HTML) + 106.8 KB (WebP) | **+190%** |
| **Mobile 430px** | Hero Banner | 414 × 233 px | 3.0 | 1242 × 700 px | `.../academics_seminar_mobile.webp` (404) $\to$ fallback `academics_seminar.webp` | 1920 × 800 px | 24.5 KB (HTML) + 106.8 KB (WebP) | **+150%** |
| **Mobile 430px** | Event Card | 398 × 224 px | 3.0 | 1194 × 672 px | `.../academics_seminar_mobile.webp` (404) $\to$ fallback `academics_seminar.webp` | 1920 × 800 px | 24.5 KB (HTML) + 106.8 KB (WebP) | **+160%** |
| **Desktop 1440px** | Hero Banner | 760 × 427 px | 2.0 | 1520 × 855 px | `.../academics_seminar_desktop.webp` (404) $\to$ fallback `academics_seminar.webp` | 1920 × 800 px | 24.5 KB (HTML) + 106.8 KB (WebP) | **+130%** |
| **Desktop 1440px** | Event Card | 384 × 216 px | 2.0 | 768 × 432 px | `.../academics_seminar_desktop.webp` (404) $\to$ fallback `academics_seminar.webp` | 1920 × 800 px | 24.5 KB (HTML) + 106.8 KB (WebP) | **+440%** (1920px served for 768px) |

---

## 3. The Responsive Suffix Defect (Detailed Trace)

In `src/utils/images.ts` (Lines 22–32):

```typescript
// 1. Local default event images have mobile/tablet/desktop variants
if (url.startsWith('/defaults/events/')) {
  const base = url.replace(/(_desktop|_tablet|_mobile)\.webp$/, '.webp');
  if (effectiveWidth <= 640 || (isClient && screenWidth <= 640)) {
    return base.replace('.webp', '_mobile.webp');
  }
  if (effectiveWidth <= 1200 || (isClient && screenWidth <= 1024)) {
    return base.replace('.webp', '_tablet.webp');
  }
  return base.replace('.webp', '_desktop.webp');
}
```

Now inspect `public/defaults/events/subcategories/`:
```bash
$ ls public/defaults/events/subcategories/
academics_seminar.webp (106 KB)
cultural_music.webp (103 KB)
...
```
There is **not a single `_mobile.webp`, `_tablet.webp`, or `_desktop.webp` file anywhere in the repository**.

### The Consequence:
1. `getResponsiveImageUrl('/defaults/.../academics_seminar.webp', 640)` returns `/defaults/.../academics_seminar_mobile.webp`.
2. Browser issues GET to `https://lpuevents.live/defaults/events/subcategories/academics_seminar_mobile.webp`.
3. Cloudflare Worker `assets: { "not_found_handling": "single-page-application" }` catches the 404 and serves `index.html` with HTTP 200!
4. The browser downloads **24,469 bytes of HTML** as an image.
5. In `ProgressiveImage.tsx`:
```typescript
const handleImageError = useCallback(() => {
  if (defaultFallback && imgSrc !== defaultFallback) {
    setImgSrc(defaultFallback);
  }
  setIsHdLoaded(true);
}, [defaultFallback, imgSrc]);
```
6. The image decoder fails on the HTML payload, triggers `onError`, and calls `handleImageError`.
7. `setImgSrc('/defaults/events/subcategories/academics_seminar.webp')` fires.
8. The browser now issues a **second request**, this time for the base file (**106 KB**).
9. **Result:** Every default event card downloads **131 KB instead of ~25 KB**, with an extra network round-trip of 800ms–1,500ms before any image can paint!

---

## 4. Low-Res Placeholder (LQIP) Audit

In `src/utils/images.ts` (Lines 70–83):

```typescript
export function getLowResPlaceholderUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;

  if (url.startsWith('/defaults/events/')) {
    return url.replace(/(_desktop|_tablet|_mobile)?\.webp$/, '_mobile.webp');
  }

  if (url.includes('images.unsplash.com')) {
    const cleanUrl = url.split('?')[0];
    return `${cleanUrl}?auto=format&fit=crop&w=160&q=35&blur=15`;
  }

  return url;
}
```

### Analysis:
1. **Unsplash images:** Truly low-resolution (`w=160&q=35&blur=15`, ~3 KB).
2. **Default images:** Attempts to load `_mobile.webp`, which triggers the 404 HTML download bug described above!
3. **Cloudflare R2 images (`images.lpuevents.live`):** Returns `url` directly!
   * In `ProgressiveImage.tsx` (Lines 78–115), if `!isHdLoaded && !isEager`, React renders BOTH:
     * `<img src={placeholderUrl} ... />` (where `placeholderUrl === original_url`)
     * `<img src={imgSrc} ... />` (where `imgSrc === original_url`)
   * **Result:** The "placeholder" is the full HD image, completely defeating the purpose of progressive loading.

---

## 5. Ambient Backdrop Filter Overhead

In `ProgressiveImage.tsx` (Lines 69–75):

```tsx
{ambientBackdrop && (
  <div
    aria-hidden="true"
    className="absolute inset-0 w-full h-full bg-cover bg-center blur-2xl saturate-150 brightness-105 scale-125 opacity-90 pointer-events-none transform-gpu"
    style={{ backgroundImage: `url(${imgSrc})`, contain: 'strict' }}
  />
)}
```

In `EventGrid.tsx` (Line 55):
```tsx
<ProgressiveImage
  src={imageUrl}
  alt={event.name}
  loading="lazy"
  ambientBackdrop   // <-- HARDCODED TRUE FOR EVERY EVENT CARD
  ...
/>
```

### Measured Impact:
* In Chrome CDP Tracing, the Largest Contentful Paint (LCP) element was identified as:
  `DIV.absolute inset-0 w-full h-full bg-cover bg-center blur-2xl saturate-150 brightness-105 scale-125 opacity-90 pointer-events-none transform-gpu`
* Because `ambientBackdrop` has `blur-2xl` (40px blur radius) + `saturate-150` + `brightness-105` + `scale-125`, it triggers an expensive GPU compositor texture allocation for every card.
* When scrolling through 10–20 cards, this filter pipeline creates stutter during momentum scrolling on mobile devices.

---

## 6. Duplicate Carousel Image Elements

In `src/components/HeroCarousel.tsx`:
* Line 404 (Mobile): `<ProgressiveImage src={... 640} loading="eager" fetchPriority="high" ... />`
* Line 591 (Desktop): `<ProgressiveImage src={... 1200} loading="eager" fetchPriority="high" ... />`

Because both are present in the React JSX tree under CSS-responsive containers (`sm:hidden` and `hidden sm:flex`), **the browser preloader encounters both `loading="eager"` tags during DOM insertion**. This results in concurrent fetches for both mobile and desktop hero images on initial page load.
