-- Migration: 20261119000005_auto_enqueue_ad_placement_configs.sql
-- Description: Automatically enqueues snapshot publication on ad_placement_configs mutations

drop trigger if exists trg_auto_enqueue_snapshot_ad_placements on public.ad_placement_configs;
create trigger trg_auto_enqueue_snapshot_ad_placements
  after insert or update or delete on public.ad_placement_configs
  for each statement execute function public.trg_auto_enqueue_snapshot();
