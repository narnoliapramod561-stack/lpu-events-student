-- Migration: Add hero carousel customization columns to carousel_items
-- This enables per-slide display duration, custom overlay text, and CTA customization

-- 1. Add display_duration_ms (how long each slide stays visible, in milliseconds)
alter table public.carousel_items
  add column if not exists display_duration_ms integer not null default 5000
    check (display_duration_ms >= 1000 and display_duration_ms <= 30000);

-- 2. Add custom overlay title (optional override for the slide title)
alter table public.carousel_items
  add column if not exists custom_title text;

-- 3. Add custom subtitle / description overlay
alter table public.carousel_items
  add column if not exists custom_subtitle text;

-- 4. Add custom CTA button text (e.g., "View Details", "Register Now", "Explore")
alter table public.carousel_items
  add column if not exists custom_cta_text text;

-- 5. Add custom CTA link (optional external redirect for MEDIA / custom slides)
alter table public.carousel_items
  add column if not exists custom_cta_url text;

-- 6. Add a label/badge text for each slide (e.g., "Featured", "Sponsored", "Throwback")
alter table public.carousel_items
  add column if not exists badge_text text;

comment on column public.carousel_items.display_duration_ms is 'How long this slide stays visible before auto-advancing (1000-30000ms)';
comment on column public.carousel_items.custom_title is 'Optional override title shown on the slide overlay';
comment on column public.carousel_items.custom_subtitle is 'Optional override subtitle/description shown on the slide';
comment on column public.carousel_items.custom_cta_text is 'Custom CTA button label (e.g. View Details, Register Now)';
comment on column public.carousel_items.custom_cta_url is 'Optional external redirect URL for the CTA button';
comment on column public.carousel_items.badge_text is 'Slide badge/label text (e.g. Featured, Sponsored, Throwback)';
