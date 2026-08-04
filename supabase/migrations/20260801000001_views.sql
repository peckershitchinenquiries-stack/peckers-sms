-- ===========================================================================
-- Derived views
-- ===========================================================================
-- All views are `security_invoker` so they inherit the caller's RLS instead of
-- running as the view owner. Without this, staff would see both sites.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Effective expiry per bag
-- ---------------------------------------------------------------------------
-- A bag's real expiry is its opened expiry once opened, otherwise the sealed
-- one. `days_remaining` is relative to the app timezone's "today".

create or replace view public.bag_expiry
with (security_invoker = on)
as
select
  b.id,
  b.sauce_id,
  b.site_id,
  b.prep_session_id,
  b.bag_size,
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

-- ---------------------------------------------------------------------------
-- Live stock per sauce per site
-- ---------------------------------------------------------------------------
-- "Usable" stock is everything not yet used or discarded — sealed and opened
-- bags both count toward what the kitchen can actually reach for.

create or replace view public.live_stock
with (security_invoker = on)
as
select
  sc.id                                   as sauce_id,
  st.id                                   as site_id,
  sc.name                                 as sauce_name,
  sc.bag_size,
  st.name                                 as site_name,
  coalesce(pl.target_bags, 0)             as par_level,
  count(b.id) filter (where b.status = 'sealed')                  as sealed_bags,
  count(b.id) filter (where b.status = 'opened')                  as opened_bags,
  count(b.id) filter (where b.status in ('sealed', 'opened'))     as usable_bags,
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
group by sc.id, st.id, sc.name, sc.bag_size, st.name, pl.target_bags;

-- ---------------------------------------------------------------------------
-- Overtime — derived from prep sessions
-- ---------------------------------------------------------------------------
-- Prep runs 7–11am on Tuesdays and Fridays and is paid as overtime, so every
-- completed session is an overtime record.

create or replace view public.overtime_logs
with (security_invoker = on)
as
select
  ps.id             as session_id,
  ps.staff_id,
  p.full_name       as staff_name,
  ps.site_id,
  s.name            as site_name,
  ps.prep_date,
  ps.started_at,
  ps.ended_at,
  to_char(ps.prep_date, 'YYYY-MM') as month,
  case
    when ps.ended_at is null then 0
    else round(extract(epoch from (ps.ended_at - ps.started_at)) / 3600.0, 2)
  end               as hours_worked
from public.prep_sessions ps
join public.profiles p on p.id = ps.staff_id
join public.sites s on s.id = ps.site_id;

-- ---------------------------------------------------------------------------
-- Prep vs plan
-- ---------------------------------------------------------------------------
-- Planned bags (override wins over suggestion) against the bags actually made.

create or replace view public.prep_vs_plan
with (security_invoker = on)
as
select
  pp.id                                     as plan_id,
  pp.site_id,
  pp.prep_date,
  pp.prep_type,
  pp.status,
  ppi.sauce_id,
  sc.name                                   as sauce_name,
  sc.bag_size,
  coalesce(ppi.override_bags, ppi.suggested_bags) as planned_bags,
  ppi.suggested_bags,
  ppi.override_bags,
  coalesce(actual.bags_made, 0)             as actual_bags,
  coalesce(actual.bags_made, 0) - coalesce(ppi.override_bags, ppi.suggested_bags) as variance
from public.prep_plans pp
join public.prep_plan_items ppi on ppi.plan_id = pp.id
join public.sauces sc on sc.id = ppi.sauce_id
left join lateral (
  select count(*) as bags_made
  from public.bags b
  where b.site_id = pp.site_id
    and b.sauce_id = ppi.sauce_id
    and b.prep_date = pp.prep_date
) actual on true;

-- ---------------------------------------------------------------------------
-- Daily usage with weekday, for the forecast engine
-- ---------------------------------------------------------------------------

create or replace view public.usage_by_weekday
with (security_invoker = on)
as
select
  ul.site_id,
  ul.sauce_id,
  ul.usage_date,
  extract(dow from ul.usage_date)::int as weekday,
  ul.bags_opened
from public.usage_logs ul;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Supabase's default privileges usually cover these, but granting explicitly
-- means the app doesn't depend on that default being in place. The views are
-- `security_invoker`, so RLS on the underlying tables still applies.

grant select on public.bag_expiry      to authenticated;
grant select on public.live_stock      to authenticated;
grant select on public.overtime_logs   to authenticated;
grant select on public.prep_vs_plan    to authenticated;
grant select on public.usage_by_weekday to authenticated;
