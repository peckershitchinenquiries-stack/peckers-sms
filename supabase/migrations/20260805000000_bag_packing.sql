-- ===========================================================================
-- Bag packing — move the unit of measure from fixed-size bags to volume (ml)
-- ===========================================================================
-- Bag size stops being a fixed property of a sauce. Every batch is instead
-- produced as an optimal mix of a small, configurable set of bag sizes
-- (app_settings.bag_sizes_ml), chosen to minimise wastage — see
-- src/lib/forecast/packing.ts for the packing algorithm. This lets the same
-- kitchen pack "6400ml of House Mayo" as 3×2000ml + 1×300ml + 1×100ml... i.e.
-- whatever combination wastes the least, instead of always sealing 2L bags.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Drop the views and RPCs that depend on the columns being changed below, so
-- the schema changes aren't blocked by dependent objects. All are recreated
-- further down.
-- ---------------------------------------------------------------------------

drop view if exists public.prep_vs_plan;
drop view if exists public.live_stock;
drop view if exists public.bag_expiry;
drop view if exists public.usage_by_weekday;

drop function if exists public.forecast_inputs(uuid, integer, date);
drop function if exists public.create_batch_bags(uuid, uuid, uuid, date, integer);
drop function if exists public.record_usage(uuid, uuid, date, integer, text);
drop function if exists public.open_bags(uuid, uuid, integer);

-- ---------------------------------------------------------------------------
-- app_settings — the configurable set of bag sizes
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column bag_sizes_ml integer[] not null default '{300,500,1000,2000}';

-- ---------------------------------------------------------------------------
-- bags — replace the fixed bag_size enum with a volume in ml
-- ---------------------------------------------------------------------------

alter table public.bags add column size_ml integer;

update public.bags set size_ml = case bag_size when '1L' then 1000 when '2L' then 2000 end;

alter table public.bags alter column size_ml set not null;

-- Sizes are validated against app_settings.bag_sizes_ml at insert time (in
-- create_batch_bags) rather than a fixed CHECK, so the set of sizes can grow
-- without another migration — only "must be a positive volume" holds here.
alter table public.bags add constraint bags_size_ml_positive check (size_ml > 0);

alter table public.bags drop column bag_size;

-- ---------------------------------------------------------------------------
-- sauces — bag size is no longer a fixed per-sauce property
-- ---------------------------------------------------------------------------

alter table public.sauces drop column bag_size;

drop type public.bag_size;

-- ---------------------------------------------------------------------------
-- usage_logs — volume used, not a bag count
-- ---------------------------------------------------------------------------

alter table public.usage_logs rename column bags_opened to ml_used;

-- ---------------------------------------------------------------------------
-- par_levels — target volume, not a bag count
-- ---------------------------------------------------------------------------

alter table public.par_levels rename column target_bags to target_ml;

-- ---------------------------------------------------------------------------
-- prep_plan_items — suggested/override volume
-- ---------------------------------------------------------------------------

alter table public.prep_plan_items rename column suggested_bags to suggested_ml;
alter table public.prep_plan_items rename column override_bags to override_ml;

-- ---------------------------------------------------------------------------
-- prep_checklist — planned volume (the pack breakdown is derived client-side
-- from planned_ml via packVolume(), the same "derive, don't persist" pattern
-- already used for plan overrides — see src/lib/queries/planning.ts)
-- ---------------------------------------------------------------------------

alter table public.prep_checklist rename column planned_bags to planned_ml;

-- ---------------------------------------------------------------------------
-- Views, recreated against the new columns
-- ---------------------------------------------------------------------------

create or replace view public.bag_expiry
with (security_invoker = on)
as
select
  b.id,
  b.sauce_id,
  b.site_id,
  b.prep_session_id,
  b.size_ml,
  b.prep_date,
  b.status,
  b.sealed_expiry,
  b.opened_at,
  b.opened_expiry,
  b.used_at,
  b.discarded_at,
  coalesce(b.opened_expiry, b.sealed_expiry) as effective_expiry,
  coalesce(b.opened_expiry, b.sealed_expiry)
    - (now() at time zone coalesce(s.timezone, 'Europe/London'))::date as days_remaining
from public.bags b
cross join (select timezone from public.app_settings where id) s;

create or replace view public.live_stock
with (security_invoker = on)
as
select
  sc.id                                   as sauce_id,
  st.id                                   as site_id,
  sc.name                                 as sauce_name,
  st.name                                 as site_name,
  coalesce(pl.target_ml, 0)               as par_level_ml,
  count(b.id) filter (where b.status = 'sealed')                  as sealed_bags,
  count(b.id) filter (where b.status = 'opened')                  as opened_bags,
  count(b.id) filter (where b.status in ('sealed', 'opened'))     as usable_bags,
  coalesce(sum(b.size_ml) filter (where b.status = 'sealed'), 0)              as sealed_ml,
  coalesce(sum(b.size_ml) filter (where b.status = 'opened'), 0)              as opened_ml,
  coalesce(sum(b.size_ml) filter (where b.status in ('sealed', 'opened')), 0) as usable_ml,
  count(b.id) filter (
    where b.status in ('sealed', 'opened')
      and coalesce(b.opened_expiry, b.sealed_expiry) <= current_date
  )                                                               as expiring_today,
  count(b.id) filter (
    where b.status in ('sealed', 'opened')
      and coalesce(b.opened_expiry, b.sealed_expiry) between current_date + 1 and current_date + 2
  )                                                               as expiring_soon
from public.sauces sc
cross join public.sites st
left join public.par_levels pl
  on pl.sauce_id = sc.id and pl.site_id = st.id
left join public.bags b
  on b.sauce_id = sc.id and b.site_id = st.id and b.status in ('sealed', 'opened')
where sc.active
group by sc.id, st.id, sc.name, st.name, pl.target_ml;

create or replace view public.prep_vs_plan
with (security_invoker = on)
as
select
  pp.id                                        as plan_id,
  pp.site_id,
  pp.prep_date,
  pp.prep_type,
  pp.status,
  ppi.sauce_id,
  sc.name                                      as sauce_name,
  coalesce(ppi.override_ml, ppi.suggested_ml)  as planned_ml,
  ppi.suggested_ml,
  ppi.override_ml,
  coalesce(actual.actual_bags, 0)              as actual_bags,
  coalesce(actual.actual_ml, 0)                as actual_ml,
  coalesce(actual.actual_ml, 0) - coalesce(ppi.override_ml, ppi.suggested_ml) as variance_ml
from public.prep_plans pp
join public.prep_plan_items ppi on ppi.plan_id = pp.id
join public.sauces sc on sc.id = ppi.sauce_id
left join lateral (
  select count(*) as actual_bags, coalesce(sum(size_ml), 0) as actual_ml
  from public.bags b
  where b.site_id = pp.site_id
    and b.sauce_id = ppi.sauce_id
    and b.prep_date = pp.prep_date
) actual on true;

create or replace view public.usage_by_weekday
with (security_invoker = on)
as
select
  ul.site_id,
  ul.sauce_id,
  ul.usage_date,
  extract(dow from ul.usage_date)::int as weekday,
  ul.ml_used
from public.usage_logs ul;

grant select on public.bag_expiry       to authenticated;
grant select on public.live_stock       to authenticated;
grant select on public.prep_vs_plan     to authenticated;
grant select on public.usage_by_weekday to authenticated;

-- ---------------------------------------------------------------------------
-- open_stock — open sealed bags FEFO until cumulative volume >= requested ml
-- ---------------------------------------------------------------------------
-- Replaces open_bags(p_count). A kitchen doesn't decant sauce between bags, so
-- this opens whole bags, oldest expiry first, stopping as soon as the running
-- total first reaches or passes the requested volume (may overshoot on the
-- last bag — that overshoot is real spare stock, not wastage).

create or replace function public.open_stock(
  p_site_id   uuid,
  p_sauce_id  uuid,
  p_ml        integer
)
returns jsonb
language plpgsql
volatile
as $$
declare
  opened_count integer;
  opened_ml    integer;
begin
  if p_ml <= 0 then
    return jsonb_build_object('requested_ml', 0, 'opened_ml', 0, 'opened_bags', 0, 'shortfall_ml', 0);
  end if;

  with candidates as (
    select id, size_ml, sealed_expiry, prep_date
    from public.bags
    where site_id = p_site_id
      and sauce_id = p_sauce_id
      and status = 'sealed'
    order by sealed_expiry asc, prep_date asc, id asc
    for update skip locked
  ),
  ranked as (
    select id, size_ml,
           sum(size_ml) over (
             order by sealed_expiry asc, prep_date asc, id asc
           ) as running_total
    from candidates
  ),
  to_open as (
    select id, size_ml from ranked where running_total - size_ml < p_ml
  ),
  updated as (
    update public.bags b
    set status = 'opened', opened_at = now()
    from to_open t
    where b.id = t.id
    returning b.size_ml
  )
  select count(*), coalesce(sum(size_ml), 0) into opened_count, opened_ml from updated;

  return jsonb_build_object(
    'requested_ml', p_ml,
    'opened_ml', opened_ml,
    'opened_bags', opened_count,
    -- A shortfall means the kitchen used more than the system thought existed.
    'shortfall_ml', greatest(p_ml - opened_ml, 0)
  );
end;
$$;

grant execute on function public.open_stock(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- record_usage — log the day's usage (ml) AND open the matching stock
-- ---------------------------------------------------------------------------

create or replace function public.record_usage(
  p_site_id     uuid,
  p_sauce_id    uuid,
  p_usage_date  date,
  p_ml          integer,
  p_notes       text default null
)
returns jsonb
language plpgsql
volatile
as $$
declare
  open_result   jsonb;
  running_total integer;
begin
  if p_ml <= 0 then
    raise exception 'ml_used must be greater than zero';
  end if;

  insert into public.usage_logs (site_id, sauce_id, usage_date, ml_used, notes, logged_by)
  values (p_site_id, p_sauce_id, p_usage_date, p_ml, p_notes, auth.uid())
  on conflict (site_id, sauce_id, usage_date)
  -- Additive, not destructive: staff log as they go through a shift, so a
  -- second entry for the same sauce adds to the day's running total.
  do update set
    ml_used = usage_logs.ml_used + excluded.ml_used,
    notes = coalesce(excluded.notes, usage_logs.notes),
    logged_by = excluded.logged_by
  returning usage_logs.ml_used into running_total;

  open_result := public.open_stock(p_site_id, p_sauce_id, p_ml);

  return open_result || jsonb_build_object('usage_total_ml', running_total);
end;
$$;

grant execute on function public.record_usage(uuid, uuid, date, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_batch_bags — one row per physical bag, across a mix of sizes
-- ---------------------------------------------------------------------------
-- p_pack is a jsonb object of { "<size_ml>": <count> }, e.g. {"2000":2,"500":1}
-- — the output of packVolume() in src/lib/forecast/packing.ts, possibly
-- hand-adjusted by staff before packing.

create or replace function public.create_batch_bags(
  p_site_id     uuid,
  p_sauce_id    uuid,
  p_session_id  uuid,
  p_prep_date   date,
  p_pack        jsonb
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_allowed_sizes integer[];
  v_entry         record;
  v_size          integer;
  v_count         integer;
  v_total_bags    integer := 0;
  v_total_ml      integer := 0;
begin
  select bag_sizes_ml into v_allowed_sizes from public.app_settings where id;

  for v_entry in select * from jsonb_each_text(coalesce(p_pack, '{}'::jsonb))
  loop
    v_size := v_entry.key::integer;
    v_count := v_entry.value::integer;

    if v_count <= 0 then
      continue;
    end if;
    if not (v_size = any(v_allowed_sizes)) then
      raise exception 'Unsupported bag size % ml', v_size;
    end if;

    insert into public.bags (
      sauce_id, site_id, prep_session_id, size_ml, prep_date, sealed_expiry, status, created_by
    )
    select p_sauce_id, p_site_id, p_session_id, v_size, p_prep_date, p_prep_date + 5, 'sealed', auth.uid()
    from generate_series(1, v_count);

    v_total_bags := v_total_bags + v_count;
    v_total_ml := v_total_ml + (v_count * v_size);
  end loop;

  return jsonb_build_object('bags', v_total_bags, 'ml', v_total_ml);
end;
$$;

grant execute on function public.create_batch_bags(uuid, uuid, uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- forecast_inputs — everything the engine needs, in one round trip
-- ---------------------------------------------------------------------------

create or replace function public.forecast_inputs(
  p_site_id     uuid,
  p_window_days integer default 28,
  p_as_of       date default current_date
)
returns table (
  sauce_id       uuid,
  sauce_name     text,
  introduced_on  date,
  par_level_ml   integer,
  usable_bags    bigint,
  sealed_bags    bigint,
  opened_bags    bigint,
  usable_ml      bigint,
  sealed_ml      bigint,
  opened_ml      bigint,
  usage          jsonb
)
language sql
stable
as $$
  select
    sc.id,
    sc.name,
    sc.introduced_on,
    coalesce(pl.target_ml, 0),
    coalesce(stock.usable_bags, 0),
    coalesce(stock.sealed_bags, 0),
    coalesce(stock.opened_bags, 0),
    coalesce(stock.usable_ml, 0),
    coalesce(stock.sealed_ml, 0),
    coalesce(stock.opened_ml, 0),
    coalesce(usage_agg.rows, '[]'::jsonb)
  from public.sauces sc
  left join public.par_levels pl
    on pl.sauce_id = sc.id and pl.site_id = p_site_id
  left join lateral (
    select
      count(*) filter (where b.status in ('sealed', 'opened')) as usable_bags,
      count(*) filter (where b.status = 'sealed')              as sealed_bags,
      count(*) filter (where b.status = 'opened')              as opened_bags,
      coalesce(sum(b.size_ml) filter (where b.status in ('sealed', 'opened')), 0) as usable_ml,
      coalesce(sum(b.size_ml) filter (where b.status = 'sealed'), 0)              as sealed_ml,
      coalesce(sum(b.size_ml) filter (where b.status = 'opened'), 0)              as opened_ml
    from public.bags b
    where b.sauce_id = sc.id and b.site_id = p_site_id
  ) stock on true
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('date', ul.usage_date, 'ml', ul.ml_used)
             order by ul.usage_date
           ) as rows
    from public.usage_logs ul
    where ul.sauce_id = sc.id
      and ul.site_id = p_site_id
      and ul.usage_date > p_as_of - p_window_days
      and ul.usage_date <= p_as_of
  ) usage_agg on true
  where sc.active
  order by sc.sort_order, sc.name;
$$;

grant execute on function public.forecast_inputs(uuid, integer, date) to authenticated;
