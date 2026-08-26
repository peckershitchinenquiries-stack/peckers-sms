-- ===========================================================================
-- FIFO consumption and waste tracking
-- ===========================================================================
-- Until now a bag was all-or-nothing: `record_usage` flipped it sealed ->
-- opened and nothing ever marked it consumed, so a bag counted as full stock
-- forever and a batch that expired with sauce left in it was never written
-- off. The kitchen thinks in litres — "we made 5L on Tuesday, used 4L by
-- Saturday, chucked the last 1L Saturday night" — and none of that last
-- sentence was representable.
--
-- Four changes:
--
--  1. `bags.remaining_ml` — how much is actually left in each bag.
--  2. `consume_stock()` draws that down FIFO, so usage empties the oldest
--     bags first and a bag becomes 'used' when it hits zero.
--  3. `waste_logs` records every discard, in millilitres, with the reason.
--  4. `expire_stock()` sweeps anything past its date into 'discarded', which
--     the trigger below turns into a waste_logs row automatically.
--
-- Stock views move from summing `size_ml` to summing `remaining_ml`, so a
-- half-empty bag stops being counted as a full one.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Views recreated at the end, dropped here so the column work isn't blocked.
-- ---------------------------------------------------------------------------

drop view if exists public.live_stock;
drop view if exists public.bag_expiry;

-- ---------------------------------------------------------------------------
-- 1. bags.remaining_ml
-- ---------------------------------------------------------------------------

alter table public.bags
  add column if not exists remaining_ml integer not null default 0
    constraint bags_remaining_ml_valid check (remaining_ml >= 0);

-- Everything still usable starts full; anything already used or discarded is
-- empty. This is the best reading available for rows that predate the column.
update public.bags
set remaining_ml = case when status in ('sealed', 'opened') then size_ml else 0 end;

create index if not exists bags_remaining_idx
  on public.bags (site_id, sauce_id)
  where status in ('sealed', 'opened');

-- ---------------------------------------------------------------------------
-- 2. Shelf-life trigger, extended to own remaining_ml
-- ---------------------------------------------------------------------------
-- This function already owns every other derived column on a bag, so the fill
-- and drain rules belong here too rather than in a second trigger that would
-- have to be ordered against it.

create or replace function public.apply_bag_shelf_life()
returns trigger
language plpgsql
as $$
declare
  two_day_expiry date;
  app_tz text;
  sealed_days integer;
  opened_days integer;
begin
  select sealed_shelf_life_days, opened_shelf_life_days
    into sealed_days, opened_days
    from public.sauces
    where id = new.sauce_id;

  new.sealed_expiry := new.prep_date + coalesce(sealed_days, 5);

  if new.status = 'opened' then
    if new.opened_at is null then
      new.opened_at := now();
    end if;

    -- "The day it was opened" is a wall-clock question, so resolve it in the
    -- configured business timezone rather than UTC.
    select timezone into app_tz from public.app_settings where id;
    two_day_expiry := (new.opened_at at time zone coalesce(app_tz, 'Europe/London'))::date
      + coalesce(opened_days, 2);

    -- Opening a bag can only shorten its life, never extend it past the
    -- original sealed cap.
    new.opened_expiry := least(two_day_expiry, new.sealed_expiry);
  elsif new.status = 'sealed' then
    new.opened_at := null;
    new.opened_expiry := null;
  end if;

  if new.status = 'used' and new.used_at is null then
    new.used_at := now();
  end if;

  if new.status = 'discarded' and new.discarded_at is null then
    new.discarded_at := now();
  end if;

  -- A new bag arrives full. On update `remaining_ml` is whatever the caller
  -- set it to — only consume_stock() moves it — but a bag that has left
  -- circulation holds nothing, whichever route took it there.
  if tg_op = 'INSERT' then
    new.remaining_ml := least(coalesce(nullif(new.remaining_ml, 0), new.size_ml), new.size_ml);
  end if;

  if new.status in ('used', 'discarded') then
    new.remaining_ml := 0;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. waste_logs — the ledger the dashboard reads
-- ---------------------------------------------------------------------------

create table if not exists public.waste_logs (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  sauce_id    uuid not null references public.sauces (id) on delete cascade,
  -- Kept nullable so purging old bags never destroys the waste history.
  bag_id      uuid references public.bags (id) on delete set null,
  waste_date  date not null,
  ml          integer not null check (ml > 0),
  reason      text,
  source      text not null default 'manual' check (source in ('expired', 'manual')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists waste_logs_site_date_idx
  on public.waste_logs (site_id, waste_date desc);
create index if not exists waste_logs_sauce_date_idx
  on public.waste_logs (sauce_id, waste_date desc);

alter table public.waste_logs enable row level security;

drop policy if exists "waste readable within site" on public.waste_logs;
create policy "waste readable within site"
  on public.waste_logs for select
  to authenticated
  using (public.can_access_site(site_id));

drop policy if exists "waste writable within site" on public.waste_logs;
create policy "waste writable within site"
  on public.waste_logs for all
  to authenticated
  using (public.can_access_site(site_id))
  with check (public.can_access_site(site_id));

-- ---------------------------------------------------------------------------
-- 4. Every discard becomes a waste log
-- ---------------------------------------------------------------------------
-- A trigger rather than application code, so the manual "Discard" button, the
-- bulk write-off and the nightly sweep all record waste the same way and none
-- of them can forget. `security definer` because the sweep runs unattended.

create or replace function public.log_bag_waste()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the transition into 'discarded' counts. Re-saving a bag that was
  -- already discarded must not log the same waste twice.
  if new.status = 'discarded' and old.status is distinct from 'discarded'
     and old.remaining_ml > 0 then
    insert into public.waste_logs
      (site_id, sauce_id, bag_id, waste_date, ml, reason, source, created_by)
    values (
      new.site_id,
      new.sauce_id,
      new.id,
      coalesce(new.discarded_at, now())::date,
      old.remaining_ml,
      new.discard_reason,
      case when new.discard_reason like 'Expired%' then 'expired' else 'manual' end,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists bags_log_waste on public.bags;
create trigger bags_log_waste
  after update on public.bags
  for each row execute function public.log_bag_waste();

-- ---------------------------------------------------------------------------
-- 5. consume_stock — draw sauce down FIFO
-- ---------------------------------------------------------------------------
-- Ordered by effective expiry so the batch that has to go first goes first,
-- which is exactly the kitchen's rule: Saturday you finish Tuesday's sauce
-- before opening Friday's.
--
-- Unlike open_stock() this does not deal in whole bags. Sauce is poured out of
-- a bag over a service, so a bag can sit part-used, and that leftover volume
-- is what eventually shows up as waste.

create or replace function public.consume_stock(
  p_site_id   uuid,
  p_sauce_id  uuid,
  p_ml        integer
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_bag         record;
  v_outstanding integer := p_ml;
  v_take        integer;
  v_consumed    integer := 0;
  v_opened      integer := 0;
  v_emptied     integer := 0;
begin
  if p_ml <= 0 then
    return jsonb_build_object(
      'requested_ml', 0, 'consumed_ml', 0,
      'bags_opened', 0, 'bags_emptied', 0, 'shortfall_ml', 0
    );
  end if;

  for v_bag in
    select id, status, remaining_ml
    from public.bags
    where site_id = p_site_id
      and sauce_id = p_sauce_id
      and status in ('sealed', 'opened')
      and remaining_ml > 0
    order by coalesce(opened_expiry, sealed_expiry) asc, prep_date asc, id asc
    for update skip locked
  loop
    exit when v_outstanding <= 0;

    v_take := least(v_bag.remaining_ml, v_outstanding);

    update public.bags
    set remaining_ml = v_bag.remaining_ml - v_take,
        -- Emptying a bag retires it; touching a sealed one starts its opened
        -- clock, which the shelf-life trigger picks up from `status`.
        status = case
                   when v_bag.remaining_ml - v_take = 0 then 'used'
                   else 'opened'
                 end::public.bag_status
    where id = v_bag.id;

    if v_bag.status = 'sealed' then
      v_opened := v_opened + 1;
    end if;
    if v_bag.remaining_ml - v_take = 0 then
      v_emptied := v_emptied + 1;
    end if;

    v_consumed := v_consumed + v_take;
    v_outstanding := v_outstanding - v_take;
  end loop;

  return jsonb_build_object(
    'requested_ml', p_ml,
    'consumed_ml', v_consumed,
    'bags_opened', v_opened,
    'bags_emptied', v_emptied,
    -- A shortfall means the kitchen used more than the system thought existed.
    'shortfall_ml', greatest(p_ml - v_consumed, 0)
  );
end;
$$;

grant execute on function public.consume_stock(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. record_usage — now draws stock down instead of merely opening it
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
  consume_result jsonb;
  running_total  integer;
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

  consume_result := public.consume_stock(p_site_id, p_sauce_id, p_ml);

  return consume_result || jsonb_build_object('usage_total_ml', running_total);
end;
$$;

grant execute on function public.record_usage(uuid, uuid, date, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. expire_stock — the end-of-day sweep
-- ---------------------------------------------------------------------------
-- Anything whose last usable day has passed is written off. `< p_as_of` rather
-- than `<=`: a bag expiring today is still good for today's service, which is
-- the whole point of the Saturday-night chuck.
--
-- security definer so the nightly cron can run it without a user session; the
-- waste rows it produces are attributed to no one, which is honest — nobody
-- pressed a button.

create or replace function public.expire_stock(
  p_as_of date default current_date,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bags integer;
  v_ml    integer;
begin
  -- Totalled up front: the shelf-life trigger zeroes `remaining_ml` on the way
  -- into 'discarded', so a RETURNING clause would report nothing but zeroes.
  select count(*), coalesce(sum(remaining_ml), 0) into v_bags, v_ml
  from public.bags
  where status in ('sealed', 'opened')
    and coalesce(opened_expiry, sealed_expiry) < p_as_of
    and (p_site_id is null or site_id = p_site_id);

  update public.bags
  set status = 'discarded',
      discard_reason = coalesce(discard_reason, 'Expired — past shelf life')
  where status in ('sealed', 'opened')
    and coalesce(opened_expiry, sealed_expiry) < p_as_of
    and (p_site_id is null or site_id = p_site_id);

  return jsonb_build_object('bags', v_bags, 'ml', v_ml);
end;
$$;

grant execute on function public.expire_stock(date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Per-restaurant volume overrides on a plan
-- ---------------------------------------------------------------------------
-- Hitchin consistently takes less sauce than Stevenage, so the forecast's
-- pro-rata split needs a manual pin. The total stays where the manager put it;
-- pinning one restaurant's share moves the difference to the others.

alter table public.prep_plan_allocations
  add column if not exists override_ml integer
    constraint prep_plan_allocations_override_ml_valid check (override_ml >= 0);

-- Kitchen staff at the prep site now build plans themselves, so allocations
-- follow the same site-scoped rule as prep_plans and prep_plan_items rather
-- than being manager-only.
drop policy if exists "plan allocations writable by managers" on public.prep_plan_allocations;
drop policy if exists "plan allocations writable within site" on public.prep_plan_allocations;
create policy "plan allocations writable within site"
  on public.prep_plan_allocations for all
  to authenticated
  using (
    exists (
      select 1
      from public.prep_plan_items ppi
      join public.prep_plans pp on pp.id = ppi.plan_id
      where ppi.id = item_id and public.can_access_site(pp.site_id)
    )
  )
  with check (
    exists (
      select 1
      from public.prep_plan_items ppi
      join public.prep_plans pp on pp.id = ppi.plan_id
      where ppi.id = item_id and public.can_access_site(pp.site_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Views — stock is what's left in the bags, not what they once held
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
  b.remaining_ml,
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
  -- Volumes are what is left in each bag. A 2L bag with 300ml in it is 300ml
  -- of stock, and pretending otherwise is what let waste hide.
  coalesce(sum(b.remaining_ml) filter (where b.status = 'sealed'), 0)              as sealed_ml,
  coalesce(sum(b.remaining_ml) filter (where b.status = 'opened'), 0)              as opened_ml,
  coalesce(sum(b.remaining_ml) filter (where b.status in ('sealed', 'opened')), 0) as usable_ml,
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

create or replace view public.waste_daily
with (security_invoker = on)
as
select
  w.site_id,
  w.sauce_id,
  w.waste_date,
  w.source,
  sum(w.ml)   as ml,
  count(*)    as entries
from public.waste_logs w
group by w.site_id, w.sauce_id, w.waste_date, w.source;

grant select on public.bag_expiry  to authenticated;
grant select on public.live_stock  to authenticated;
grant select on public.waste_daily to authenticated;

-- ---------------------------------------------------------------------------
-- 10. forecast_inputs — same move from size_ml to remaining_ml
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
      coalesce(sum(b.remaining_ml) filter (where b.status in ('sealed', 'opened')), 0) as usable_ml,
      coalesce(sum(b.remaining_ml) filter (where b.status = 'sealed'), 0)              as sealed_ml,
      coalesce(sum(b.remaining_ml) filter (where b.status = 'opened'), 0)              as opened_ml
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

-- ---------------------------------------------------------------------------
-- 11. transfer_stock — carry remaining_ml across, not size_ml
-- ---------------------------------------------------------------------------
-- Transfers move whole bags by rewriting site_id, so remaining_ml travels with
-- the row untouched. The only fix needed is the ledger: it recorded `size_ml`,
-- which overstates a delivery containing a part-used bag.

create or replace function public.transfer_stock(
  p_sauce_id   uuid,
  p_from_site  uuid,
  p_to_site    uuid,
  p_ml         integer,
  p_date       date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  moved_count integer;
  moved_ml    integer;
begin
  if p_ml <= 0 then
    return jsonb_build_object('requested_ml', 0, 'moved_ml', 0, 'moved_bags', 0, 'shortfall_ml', 0);
  end if;
  if p_from_site = p_to_site then
    raise exception 'Cannot transfer stock to the same site';
  end if;
  if not public.can_access_site(p_from_site) then
    raise exception 'You do not have access to that site';
  end if;

  with candidates as (
    -- Freshest first, deliberately: a receiving restaurant shouldn't be sent
    -- sauce that expires the day it arrives. Each store then consumes its own
    -- shelf FIFO.
    select id, remaining_ml, sealed_expiry, prep_date
    from public.bags
    where site_id = p_from_site
      and sauce_id = p_sauce_id
      and status = 'sealed'
      and remaining_ml > 0
    order by sealed_expiry desc, prep_date desc, id asc
    for update skip locked
  ),
  ranked as (
    select id, remaining_ml,
           sum(remaining_ml) over (
             order by sealed_expiry desc, prep_date desc, id asc
           ) as running_total
    from candidates
  ),
  to_move as (
    select id, remaining_ml from ranked where running_total - remaining_ml < p_ml
  ),
  updated as (
    update public.bags b
    set site_id = p_to_site
    from to_move t
    where b.id = t.id
    returning b.remaining_ml
  )
  select count(*), coalesce(sum(remaining_ml), 0) into moved_count, moved_ml from updated;

  if moved_count > 0 then
    insert into public.stock_transfers
      (sauce_id, from_site_id, to_site_id, transfer_date, ml, bags, created_by)
    values
      (p_sauce_id, p_from_site, p_to_site, p_date, moved_ml, moved_count, auth.uid());
  end if;

  return jsonb_build_object(
    'requested_ml', p_ml,
    'moved_ml', moved_ml,
    'moved_bags', moved_count,
    'shortfall_ml', greatest(p_ml - moved_ml, 0)
  );
end;
$$;

grant execute on function public.transfer_stock(uuid, uuid, uuid, integer, date) to authenticated;
