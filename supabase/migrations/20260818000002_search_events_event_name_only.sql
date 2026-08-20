-- 20260818000002_search_events_event_name_only.sql
-- Add backward-compatible event-name-only search mode to search_events RPC

-- Drop the previous 9-parameter overload to prevent function signature ambiguity
DROP FUNCTION IF EXISTS public.search_events(text, integer, integer, uuid, uuid, public.event_pricing_type, text, date, boolean);

CREATE OR REPLACE FUNCTION public.search_events(
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
RETURNS TABLE (
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
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  pricing_type public.event_pricing_type,
  registration_format text,
  capacity_limit integer,
  capacity_counts_by text,
  team_pricing_mode text,
  price_amount numeric,
  status public.event_status,
  view_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  organizations jsonb,
  categories jsonb,
  subcategories jsonb,
  relevance_score integer
) SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_raw text;
  v_lower text;
  v_clean text;
  v_tokens text[];
  v_token_count integer;
  v_limit integer;
  v_offset integer;
  v_now timestamptz := now();
  v_today date := (now() at time zone 'UTC')::date;
  v_tomorrow date := ((now() + interval '1 day') at time zone 'UTC')::date;
  v_next_week date := ((now() + interval '7 days') at time zone 'UTC')::date;
BEGIN
  v_raw := coalesce(trim(query_text), '');
  v_limit := least(greatest(coalesce(limit_count, 20), 1), 50);
  v_offset := greatest(coalesce(offset_count, 0), 0);

  -- Minimum 2 characters required for search; return empty immediately
  IF length(v_raw) < 2 THEN
    RETURN;
  END IF;

  v_lower := lower(v_raw);
  v_clean := trim(regexp_replace(v_lower, '[^a-zA-Z0-9]+', ' ', 'g'));
  v_tokens := string_to_array(v_clean, ' ');
  v_token_count := coalesce(array_length(v_tokens, 1), 0);

  RETURN QUERY
  WITH scored AS (
    SELECT 
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
      e.registration_opens_at,
      e.registration_closes_at,
      e.pricing_type,
      e.registration_format,
      e.capacity_limit,
      e.capacity_counts_by,
      e.team_pricing_mode,
      e.price_amount,
      e.status,
      e.view_count,
      e.created_at,
      e.updated_at,
      e.completed_at,
      jsonb_build_object('name', o.name) AS organizations,
      jsonb_build_object('name', c.name, 'key', c.key) AS categories,
      CASE 
        WHEN s.id IS NOT NULL THEN jsonb_build_object('name', s.name, 'key', s.key)
        ELSE NULL
      END AS subcategories,
      (
        -- Priority 1: Event Name (1000 / 800 / 600 / 450)
        (CASE 
          WHEN lower(trim(e.name)) = v_lower THEN 1000
          WHEN lower(e.name) LIKE v_lower || '%' THEN 800
          WHEN length(v_clean) > 0 AND (' ' || lower(regexp_replace(e.name, '[^a-zA-Z0-9]+', ' ', 'g')) || ' ') LIKE '% ' || v_clean || ' %' THEN 600
          WHEN lower(e.name) LIKE '%' || v_lower || '%' THEN 450
          ELSE 0
        END)
        +
        -- Priority 2: Category (200 / 150) (Disabled when p_event_name_only is true)
        (CASE 
          WHEN p_event_name_only THEN 0
          WHEN lower(trim(c.name)) = v_lower OR lower(trim(c.key)) = v_lower THEN 200
          WHEN lower(c.name) LIKE '%' || v_lower || '%' OR lower(c.key) LIKE '%' || v_lower || '%' THEN 150
          ELSE 0
        END)
        +
        -- Priority 3: Subcategory (100 / 75) (Disabled when p_event_name_only is true)
        (CASE 
          WHEN p_event_name_only THEN 0
          WHEN s.id IS NOT NULL AND (lower(trim(s.name)) = v_lower OR lower(trim(s.key)) = v_lower) THEN 100
          WHEN s.id IS NOT NULL AND (lower(s.name) LIKE '%' || v_lower || '%' OR lower(s.key) LIKE '%' || v_lower || '%') THEN 75
          ELSE 0
        END)
        +
        -- Priority 4: Club / Organizer (50 / 30) (Disabled when p_event_name_only is true)
        (CASE 
          WHEN p_event_name_only THEN 0
          WHEN lower(trim(o.name)) = v_lower THEN 50
          WHEN lower(o.name) LIKE '%' || v_lower || '%' THEN 30
          ELSE 0
        END)
        +
        -- Multi-word token relevance boost (only when more than 1 token)
        CASE 
          WHEN v_token_count > 1 THEN
            COALESCE((
              SELECT SUM(
                -- Token in Event Name (Always evaluated)
                (CASE 
                  WHEN lower(trim(e.name)) = t THEN 400
                  WHEN lower(e.name) LIKE t || '%' THEN 300
                  WHEN (' ' || lower(regexp_replace(e.name, '[^a-zA-Z0-9]+', ' ', 'g')) || ' ') LIKE '% ' || t || ' %' THEN 250
                  WHEN lower(e.name) LIKE '%' || t || '%' THEN 150
                  ELSE 0
                END)
                +
                -- Token in Category (Disabled when p_event_name_only is true)
                (CASE 
                  WHEN p_event_name_only THEN 0
                  WHEN lower(trim(c.name)) = t OR lower(trim(c.key)) = t THEN 80
                  WHEN lower(c.name) LIKE '%' || t || '%' OR lower(c.key) LIKE '%' || t || '%' THEN 50
                  ELSE 0
                END)
                +
                -- Token in Subcategory (Disabled when p_event_name_only is true)
                (CASE 
                  WHEN p_event_name_only THEN 0
                  WHEN s.id IS NOT NULL AND (lower(trim(s.name)) = t OR lower(trim(s.key)) = t) THEN 60
                  WHEN s.id IS NOT NULL AND (lower(s.name) LIKE '%' || t || '%' OR lower(s.key) LIKE '%' || t || '%') THEN 40
                  ELSE 0
                END)
                +
                -- Token in Organizer (Disabled when p_event_name_only is true)
                (CASE 
                  WHEN p_event_name_only THEN 0
                  WHEN lower(trim(o.name)) = t THEN 30
                  WHEN lower(o.name) LIKE '%' || t || '%' THEN 15
                  ELSE 0
                END)
              )
              FROM unnest(v_tokens) t
              WHERE length(t) >= 2
            ), 0)
          ELSE 0
        END
      ) AS score
    FROM public.events e
    JOIN public.organizations o ON e.organization_id = o.id
    JOIN public.categories c ON e.category_id = c.id
    LEFT JOIN public.subcategories s ON e.subcategory_id = s.id
    WHERE 
      -- Past vs Upcoming filter
      (
        CASE 
          WHEN p_show_past THEN (e.status = 'COMPLETED' OR e.end_at < v_now)
          ELSE (e.status = 'PUBLISHED' AND e.end_at >= v_now)
        END
      )
      -- Category filter
      AND (p_category_id IS NULL OR e.category_id = p_category_id)
      -- Subcategory filter
      AND (p_subcategory_id IS NULL OR e.subcategory_id = p_subcategory_id)
      -- Pricing filter
      AND (p_pricing_type IS NULL OR e.pricing_type = p_pricing_type)
      -- Specific Date filter
      AND (
        p_target_date IS NULL 
        OR (p_target_date >= (e.start_at at time zone 'UTC')::date AND p_target_date <= (e.end_at at time zone 'UTC')::date)
      )
      -- Timeline filter
      AND (
        p_timeline IS NULL 
        OR p_timeline = 'all'
        OR (p_timeline = 'today' AND v_today >= (e.start_at at time zone 'UTC')::date AND v_today <= (e.end_at at time zone 'UTC')::date)
        OR (p_timeline = 'tomorrow' AND v_tomorrow >= (e.start_at at time zone 'UTC')::date AND v_tomorrow <= (e.end_at at time zone 'UTC')::date)
        OR (p_timeline = 'this_week' AND (e.start_at at time zone 'UTC')::date >= v_today AND (e.start_at at time zone 'UTC')::date <= v_next_week)
        OR (p_timeline = 'upcoming' AND (e.start_at at time zone 'UTC')::date > v_today)
      )
  )
  SELECT 
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
    s.registration_opens_at,
    s.registration_closes_at,
    s.pricing_type,
    s.registration_format,
    s.capacity_limit,
    s.capacity_counts_by,
    s.team_pricing_mode,
    s.price_amount,
    s.status,
    s.view_count,
    s.created_at,
    s.updated_at,
    s.completed_at,
    s.organizations,
    s.categories,
    s.subcategories,
    s.score::integer AS relevance_score
  FROM scored s
  WHERE s.score > 0
  ORDER BY 
    s.score DESC,
    CASE WHEN p_show_past THEN -extract(epoch from s.end_at) ELSE extract(epoch from s.start_at) END ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.search_events(text, integer, integer, uuid, uuid, public.event_pricing_type, text, date, boolean, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
