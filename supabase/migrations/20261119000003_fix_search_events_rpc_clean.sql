-- Migration: 20261119000002_fix_search_events_rpc.sql
-- Description: Fix runtime column errors in search_events RPC (remove deleted_at and o.logo_media_id)

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
  v_tsquery tsquery;
  v_limit integer;
  v_offset integer;
  v_token_count integer;
  v_is_authenticated boolean;
begin
  v_is_authenticated := (auth.uid() is not null);
  v_limit := least(greatest(coalesce(limit_count, 20), 1), 100);
  v_offset := greatest(coalesce(offset_count, 0), 0);
  v_raw := trim(coalesce(query_text, ''));

  if v_raw <> '' then
    v_clean := lower(regexp_replace(v_raw, '[^a-zA-Z0-9\s]', ' ', 'g'));
    v_tokens := string_to_array(trim(regexp_replace(v_clean, '\s+', ' ', 'g')), ' ');
    v_token_count := cardinality(v_tokens);

    if v_token_count > 0 then
      begin
        select to_tsquery('english', string_agg(quote_literal(token) || ':*', ' & '))
        into v_tsquery
        from unnest(v_tokens) as token
        where length(token) > 0;
      exception when others then
        v_tsquery := null;
      end;
    end if;
  else
    v_clean := '';
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
      jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'logo_media_id', null
      ) as organizations,
      case when c.id is not null then
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'key', c.key
        )
      else null end as categories,
      case when s.id is not null then
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'key', s.key
        )
      else null end as subcategories,
      case 
        when v_token_count = 0 then 0
        else (
          case when lower(e.name) = lower(v_clean) then 100 else 0 end +
          case when lower(e.name) like v_clean || '%' then 40 else 0 end +
          case when lower(e.name) like '%' || v_clean || '%' then 25 else 0 end +
          case when not p_event_name_only and lower(e.description) like '%' || v_clean || '%' then 10 else 0 end +
          case when lower(c.name) like '%' || v_clean || '%' or lower(c.key) like '%' || v_clean || '%' then 15 else 0 end +
          case when s.id is not null and (lower(s.name) like '%' || v_clean || '%' or lower(s.key) like '%' || v_clean || '%') then 15 else 0 end +
          case when lower(o.name) like '%' || v_clean || '%' then 15 else 0 end +
          case when v_tsquery is not null and (e.search_vector @@ v_tsquery or to_tsvector('english', coalesce(e.name, '') || ' ' || coalesce(e.description, '')) @@ v_tsquery) then 20 else 0 end
        )
      end as score
    from public.events e
    left join public.organizations o on o.id = e.organization_id
    left join public.categories c on c.id = e.category_id
    left join public.subcategories s on s.id = e.subcategory_id
    where (
        case 
          when p_show_past then e.status in ('PUBLISHED', 'COMPLETED')
          else e.status = 'PUBLISHED' and e.end_at >= now()
        end
      )
      and (p_category_id is null or e.category_id = p_category_id)
      and (p_subcategory_id is null or e.subcategory_id = p_subcategory_id)
      and (p_pricing_type is null or e.pricing_type = p_pricing_type)
      and (
        p_target_date is null 
        or (e.start_at::date <= p_target_date and e.end_at::date >= p_target_date)
      )
      and (
        p_timeline is null
        or (p_timeline = 'today' and e.start_at::date <= current_date and e.end_at::date >= current_date)
        or (p_timeline = 'this_weekend' and e.start_at::date <= (current_date + ((6 - extract(dow from current_date)::integer) % 7 + 1)) and e.end_at::date >= (current_date + ((6 - extract(dow from current_date)::integer) % 7)))
        or (p_timeline = 'this_month' and e.start_at::date <= (date_trunc('month', current_date) + interval '1 month - 1 day')::date and e.end_at::date >= date_trunc('month', current_date)::date)
      )
      and (
        v_token_count = 0
        or (v_tsquery is not null and (e.search_vector @@ v_tsquery or to_tsvector('english', coalesce(e.name, '') || ' ' || coalesce(e.description, '')) @@ v_tsquery))
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
    case when v_is_authenticated then s.created_by else null end as created_by,
    case when v_is_authenticated then s.updated_by else null end as updated_by,
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

revoke all on function public.search_events(text, integer, integer, uuid, uuid, public.event_pricing_type, text, date, boolean, boolean) from public;
grant execute on function public.search_events(text, integer, integer, uuid, uuid, public.event_pricing_type, text, date, boolean, boolean) to anon, authenticated, service_role;
