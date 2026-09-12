-- Migration: 20260912000001_performance_indexing_and_search_optimization.sql
-- Description: Performance indexing and search query optimization for LPU Events.
-- 1. Trigram index on events.description for partial/keyword substring matches.
-- 2. GIN full-text search index on (name || ' ' || description) for accelerated English text matching.
-- 3. Composite event-feed index (start_at ASC, end_at) for PUBLISHED events to eliminate runtime sorting.
-- 4. Optimized search_events RPC with pre-filtered search CTE and description relevance scoring.

-- 1. Trigram index on events.description
create index if not exists events_description_trgm_idx on public.events using gin (description gin_trgm_ops);

-- 2. Full-text search index on combined name and description
create index if not exists events_name_description_fts_idx on public.events using gin (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));

-- 3. Composite partial index for default and paginated event feed
create index if not exists idx_events_feed_published_start on public.events (start_at asc, end_at) where status = 'PUBLISHED';

-- 4. Optimized search_events RPC
create or replace function public.search_events(
  query_text text,
  limit_count integer default 20,
  offset_count integer default 0,
  p_category_id uuid default null,
  p_subcategory_id uuid default null,
  p_pricing_type public.event_pricing_type default null,
  p_timeline text default null,
  p_target_date date default null,
  p_show_past boolean default false,
  p_event_name_only boolean default false
)
returns table (
  id uuid,
  organization_id uuid,
  created_by uuid,
  updated_by uuid,
  name text,
  description text,
  category_id uuid,
  subcategory_id uuid,
  banner_media_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  venue_name text,
  registration_mode public.registration_mode,
  external_registration_url text,
  pricing_type public.event_pricing_type,
  registration_format text,
  capacity_limit integer,
  price_amount numeric,
  status public.event_status,
  view_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  organizations jsonb,
  categories jsonb,
  subcategories jsonb,
  relevance_score integer
) language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_raw text;
  v_clean text;
  v_tokens text[];
  v_token_count integer;
  v_limit integer;
  v_offset integer;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'UTC')::date;
  v_tomorrow date := ((now() + interval '1 day') at time zone 'UTC')::date;
  v_next_week date := ((now() + interval '7 days') at time zone 'UTC')::date;
  v_tsquery tsquery;
begin
  v_limit := coalesce(limit_count, 20);
  if v_limit <= 0 then v_limit := 20; end if;
  if v_limit > 100 then v_limit := 100; end if;

  v_offset := coalesce(offset_count, 0);
  if v_offset < 0 then v_offset := 0; end if;

  v_raw := trim(coalesce(query_text, ''));

  if length(v_raw) > 0 then
    v_clean := regexp_replace(v_raw, '[^a-zA-Z0-9\s]+', ' ', 'g');
    v_clean := lower(trim(regexp_replace(v_clean, '\s+', ' ', 'g')));
    
    select array_agg(t) into v_tokens
    from (
      select distinct word as t
      from regexp_split_to_table(v_clean, '\s+') as word
      where length(word) >= 2
    ) s;

    v_token_count := coalesce(cardinality(v_tokens), 0);
    begin
      v_tsquery := plainto_tsquery('english', v_raw);
    exception when others then
      v_tsquery := null;
    end;
  else
    v_tokens := array[]::text[];
    v_token_count := 0;
    v_tsquery := null;
  end if;

  return query
  with scored_events as (
    select
      e.id,
      e.organization_id,
      e.created_by,
      e.updated_by,
      e.name,
      e.description,
      e.category_id,
      e.subcategory_id,
      e.banner_media_id,
      e.start_at,
      e.end_at,
      e.venue_name,
      e.registration_mode,
      e.external_registration_url,
      e.pricing_type,
      e.registration_format,
      e.capacity_limit,
      e.price_amount,
      e.status,
      e.view_count,
      e.created_at,
      e.updated_at,
      jsonb_build_object('name', o.name) as organizations,
      jsonb_build_object('id', c.id, 'name', c.name, 'key', c.key) as categories,
      case when s.id is not null 
        then jsonb_build_object('id', s.id, 'name', s.name, 'key', s.key)
        else null 
      end as subcategories,
      (
        case 
          when v_token_count = 0 then 100
          else coalesce((
            select sum(
              (case 
                when lower(trim(e.name)) = v_clean then 500
                when (' ' || lower(regexp_replace(e.name, '[^a-zA-Z0-9]+', ' ', 'g')) || ' ') like '% ' || t || ' %' then 250
                when lower(e.name) like '%' || t || '%' then 150
                when not p_event_name_only and lower(coalesce(e.description, '')) like '%' || t || '%' then 80
                else 0
              end)
              +
              (case 
                when p_event_name_only then 0
                when lower(trim(c.name)) = t or lower(trim(c.key)) = t then 80
                when lower(c.name) like '%' || t || '%' or lower(c.key) like '%' || t || '%' then 50
                else 0
              end)
              +
              (case 
                when p_event_name_only then 0
                when s.id is not null and (lower(trim(s.name)) = t or lower(trim(s.key)) = t) then 60
                when s.id is not null and (lower(s.name) like '%' || t || '%' or lower(s.key) like '%' || t || '%') then 40
                else 0
              end)
              +
              (case 
                when p_event_name_only then 0
                when lower(trim(o.name)) = t then 30
                when lower(o.name) like '%' || t || '%' then 15
                else 0
              end)
            )
            from unnest(v_tokens) t
            where length(t) >= 2
          ), 0)
        end
      )::integer as score
    from public.events e
    join public.organizations o on e.organization_id = o.id
    join public.categories c on e.category_id = c.id
    left join public.subcategories s on e.subcategory_id = s.id
    where 
      (
        case 
          when p_show_past then (e.status = 'COMPLETED' or e.end_at < v_now)
          else (e.status = 'PUBLISHED' and e.end_at >= v_now)
        end
      )
      and (p_category_id is null or e.category_id = p_category_id)
      and (p_subcategory_id is null or e.subcategory_id = p_subcategory_id)
      and (p_pricing_type is null or e.pricing_type = p_pricing_type)
      and (
        p_target_date is null 
        or (p_target_date >= (e.start_at at time zone 'UTC')::date and p_target_date <= (e.end_at at time zone 'UTC')::date)
      )
      and (
        p_timeline is null 
        or p_timeline = 'all'
        or (p_timeline = 'today' and v_today >= (e.start_at at time zone 'UTC')::date and v_today <= (e.end_at at time zone 'UTC')::date)
        or (p_timeline = 'tomorrow' and v_tomorrow >= (e.start_at at time zone 'UTC')::date and v_tomorrow <= (e.end_at at time zone 'UTC')::date)
        or (p_timeline = 'this_week' and (e.start_at at time zone 'UTC')::date >= v_today and (e.start_at at time zone 'UTC')::date <= v_next_week)
        or (p_timeline = 'upcoming' and (e.start_at at time zone 'UTC')::date > v_today)
      )
      and (
        v_token_count = 0
        or (v_tsquery is not null and to_tsvector('english', coalesce(e.name, '') || ' ' || coalesce(e.description, '')) @@ v_tsquery)
        or e.name ilike '%' || v_clean || '%'
        or (not p_event_name_only and e.description ilike '%' || v_clean || '%')
        or lower(c.name) like '%' || v_clean || '%' or lower(c.key) like '%' || v_clean || '%'
        or (s.id is not null and (lower(s.name) like '%' || v_clean || '%' or lower(s.key) like '%' || v_clean || '%'))
        or lower(o.name) like '%' || v_clean || '%'
      )
  )
  select 
    s.id,
    s.organization_id,
    s.created_by,
    s.updated_by,
    s.name,
    s.description,
    s.category_id,
    s.subcategory_id,
    s.banner_media_id,
    s.start_at,
    s.end_at,
    s.venue_name,
    s.registration_mode,
    s.external_registration_url,
    s.pricing_type,
    s.registration_format,
    s.capacity_limit,
    s.price_amount,
    s.status,
    s.view_count,
    s.created_at,
    s.updated_at,
    s.organizations,
    s.categories,
    s.subcategories,
    s.score as relevance_score
  from scored_events s
  where (v_token_count = 0 or s.score > 0)
  order by 
    case when v_token_count > 0 then s.score else 0 end desc,
    s.start_at asc,
    s.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

-- Revoke from public and grant to anon, authenticated, service_role
revoke all on function public.search_events(text, integer, integer, uuid, uuid, public.event_pricing_type, text, date, boolean, boolean) from public;
grant execute on function public.search_events(text, integer, integer, uuid, uuid, public.event_pricing_type, text, date, boolean, boolean) to anon, authenticated, service_role;
