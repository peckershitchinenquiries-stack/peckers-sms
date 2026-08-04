-- ===========================================================================
-- Application RPCs
-- ===========================================================================
-- These run as the CALLING user (security invoker), so RLS still decides which
-- rows are visible. They exist to make multi-row operations atomic — opening
-- bags in first-expiry-first-out order in particular must not race between two
-- tablets in the same kitchen.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- open_bags — flip N sealed bags to `opened`, oldest expiry first (FEFO)
-- ---------------------------------------------------------------------------

create or replace function public.open_bags(
  p_site_id   uuid,
  p_sauce_id  uuid,
  p_count     integer
)
returns jsonb
language plpgsql
volatile
as $$
declare
  opened_count integer;
begin
  if p_count <= 0 then
    return jsonb_build_object('requested', p_count, 'opened', 0, 'shortfall', 0);
  end if;

  with candidates as (
    select id
    from public.bags
    where site_id = p_site_id
      and sauce_id = p_sauce_id
      and status = 'sealed'
    -- Use the bag closest to expiry first so nothing quietly rots at the back.
    order by sealed_expiry asc, prep_date asc, id asc
    limit p_count
    for update skip locked
  ),
  updated as (
    update public.bags b
    set status = 'opened', opened_at = now()
    from candidates c
    where b.id = c.id
    returning b.id
  )
  select count(*) into opened_count from updated;

  return jsonb_build_object(
    'requested', p_count,
    'opened', opened_count,
    -- A shortfall means the kitchen used more than the system thought existed.
    'shortfall', greatest(p_count - opened_count, 0)
  );
end;
$$;

grant execute on function public.open_bags(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- record_usage — log the day's usage AND open the matching bags
-- ---------------------------------------------------------------------------
-- Re-logging the same sauce on the same day adds to the running total rather
-- than overwriting it (staff log as they go through a shift).

create or replace function public.record_usage(
  p_site_id     uuid,
  p_sauce_id    uuid,
  p_usage_date  date,
  p_bags        integer,
  p_notes       text default null
)
returns jsonb
language plpgsql
volatile
as $$
declare
  open_result jsonb;
  running_total integer;
begin
  if p_bags <= 0 then
    raise exception 'bags_opened must be greater than zero';
  end if;

  insert into public.usage_logs (site_id, sauce_id, usage_date, bags_opened, notes, logged_by)
  values (p_site_id, p_sauce_id, p_usage_date, p_bags, p_notes, auth.uid())
  on conflict (site_id, sauce_id, usage_date)
  -- Additive, not destructive: staff log as they go through a shift, so a
  -- second entry for the same sauce adds to the day's running total.
  do update set
    bags_opened = usage_logs.bags_opened + excluded.bags_opened,
    notes = coalesce(excluded.notes, usage_logs.notes),
    logged_by = excluded.logged_by
  returning usage_logs.bags_opened into running_total;

  open_result := public.open_bags(p_site_id, p_sauce_id, p_bags);

  return open_result || jsonb_build_object('usage_total', running_total);
end;
$$;

grant execute on function public.record_usage(uuid, uuid, date, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_batch_bags — one row per physical bag after a prep session
-- ---------------------------------------------------------------------------

create or replace function public.create_batch_bags(
  p_site_id     uuid,
  p_sauce_id    uuid,
  p_session_id  uuid,
  p_prep_date   date,
  p_quantity    integer
)
returns integer
language plpgsql
volatile
as $$
declare
  v_bag_size public.bag_size;
begin
  if p_quantity <= 0 then
    return 0;
  end if;

  -- Bag size is a property of the sauce, never chosen at log time.
  select bag_size into v_bag_size from public.sauces where id = p_sauce_id;

  if v_bag_size is null then
    raise exception 'Unknown sauce %', p_sauce_id;
  end if;

  insert into public.bags (
    sauce_id, site_id, prep_session_id, bag_size, prep_date, sealed_expiry, status, created_by
  )
  select
    p_sauce_id,
    p_site_id,
    p_session_id,
    v_bag_size,
    p_prep_date,
    p_prep_date + 5,  -- recomputed by the shelf-life trigger; kept for NOT NULL
    'sealed',
    auth.uid()
  from generate_series(1, p_quantity);

  return p_quantity;
end;
$$;

grant execute on function public.create_batch_bags(uuid, uuid, uuid, date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- consume_bags — mark opened/sealed bags as used or discarded (FEFO)
-- ---------------------------------------------------------------------------

create or replace function public.consume_bags(
  p_site_id   uuid,
  p_sauce_id  uuid,
  p_count     integer,
  p_status    public.bag_status,
  p_reason    text default null
)
returns integer
language plpgsql
volatile
as $$
declare
  affected integer;
begin
  if p_status not in ('used', 'discarded') then
    raise exception 'consume_bags only supports used or discarded';
  end if;

  with candidates as (
    select id
    from public.bags
    where site_id = p_site_id
      and sauce_id = p_sauce_id
      and status in ('sealed', 'opened')
    -- Opened bags go first (they expire soonest), then by expiry date.
    order by (status = 'opened') desc, coalesce(opened_expiry, sealed_expiry) asc, id asc
    limit p_count
    for update skip locked
  )
  update public.bags b
  set
    status = p_status,
    used_at = case when p_status = 'used' then now() else b.used_at end,
    discarded_at = case when p_status = 'discarded' then now() else b.discarded_at end,
    discard_reason = case when p_status = 'discarded' then p_reason else b.discard_reason end
  from candidates c
  where b.id = c.id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.consume_bags(uuid, uuid, integer, public.bag_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- resolve_alert
-- ---------------------------------------------------------------------------

create or replace function public.resolve_alert(p_alert_id uuid)
returns void
language sql
volatile
as $$
  update public.alerts
  set resolved = true, resolved_at = now(), resolved_by = auth.uid()
  where id = p_alert_id;
$$;

grant execute on function public.resolve_alert(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- forecast_inputs — everything the engine needs, in one round trip
-- ---------------------------------------------------------------------------
-- Returns per sauce/site: the usage rows inside the rolling window, current
-- usable stock, the par level, and when the sauce was introduced. The maths
-- itself lives in TypeScript (src/lib/forecast) so it can be unit tested and
-- so the UI can explain its reasoning.

create or replace function public.forecast_inputs(
  p_site_id     uuid,
  p_window_days integer default 28,
  p_as_of       date default current_date
)
returns table (
  sauce_id          uuid,
  sauce_name        text,
  bag_size          public.bag_size,
  introduced_on     date,
  par_level         integer,
  usable_bags       bigint,
  sealed_bags       bigint,
  opened_bags       bigint,
  usage             jsonb
)
language sql
stable
as $$
  select
    sc.id,
    sc.name,
    sc.bag_size,
    sc.introduced_on,
    coalesce(pl.target_bags, 0),
    coalesce(stock.usable_bags, 0),
    coalesce(stock.sealed_bags, 0),
    coalesce(stock.opened_bags, 0),
    coalesce(usage_agg.rows, '[]'::jsonb)
  from public.sauces sc
  left join public.par_levels pl
    on pl.sauce_id = sc.id and pl.site_id = p_site_id
  left join lateral (
    select
      count(*) filter (where b.status in ('sealed', 'opened')) as usable_bags,
      count(*) filter (where b.status = 'sealed')              as sealed_bags,
      count(*) filter (where b.status = 'opened')              as opened_bags
    from public.bags b
    where b.sauce_id = sc.id and b.site_id = p_site_id
  ) stock on true
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('date', ul.usage_date, 'bags', ul.bags_opened)
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
