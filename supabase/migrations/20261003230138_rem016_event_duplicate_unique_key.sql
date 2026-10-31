create unique index if not exists events_natural_key_unique_idx
on public.events (organization_id, lower(btrim(name)), start_at);
