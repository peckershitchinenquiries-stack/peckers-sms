-- ===========================================================================
-- Any number of stores
-- ===========================================================================
-- The system started as two restaurants with the second one hard-wired into
-- the UI. A manager can now add stores from Settings, so the rules that were
-- previously implicit have to be enforced properly:
--
--   1. Exactly one store prepares sauce — guaranteed by an index, not by
--      convention.
--   2. Prep-kitchen staff (not just managers) can send stock to any of the
--      receiving stores. Moving a bag rewrites `bags.site_id` to a site the
--      sender has no RLS access to, so the transfer has to run as the owner
--      with its own authorisation check.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Exactly one prep kitchen
-- ---------------------------------------------------------------------------
-- Partial unique index: at most one row may have is_prep_site = true. Adding a
-- store defaults it to false, so a new store never steals the flag.

-- Repair any database that somehow ended up with two before locking it down.
update public.sites
set is_prep_site = false
where is_prep_site
  and id <> (select id from public.sites where is_prep_site order by name limit 1);

create unique index if not exists sites_one_prep_site_idx
  on public.sites (is_prep_site)
  where is_prep_site;

-- ---------------------------------------------------------------------------
-- 2. transfer_stock runs as owner, with its own authorisation check
-- ---------------------------------------------------------------------------
-- Previously this ran as the caller. The final `update public.bags set
-- site_id = p_to_site` then had to satisfy the bags WITH CHECK for the
-- *destination* site — which only a manager passes. Kitchen staff at the prep
-- site got "new row violates row-level security policy" the moment they
-- pressed Send, which is exactly the delivery run they are meant to do.
--
-- SECURITY DEFINER lifts that, so the permission question is answered here
-- instead: you may send stock out of a store you have access to.

create or replace function public.transfer_stock(
  p_sauce_id   uuid,
  p_from_site  uuid,
  p_to_site    uuid,
  p_ml         integer,
  p_date       date default current_date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  moved_count integer;
  moved_ml    integer;
begin
  if p_from_site = p_to_site then
    raise exception 'Cannot transfer stock to the same site';
  end if;

  -- The caller must work at (or manage) the store the sauce is leaving.
  if not public.can_access_site(p_from_site) then
    raise exception 'You are not allowed to send stock from that restaurant';
  end if;

  if not exists (select 1 from public.sites where id = p_to_site) then
    raise exception 'That restaurant no longer exists';
  end if;

  if p_ml <= 0 then
    return jsonb_build_object('requested_ml', 0, 'moved_ml', 0, 'moved_bags', 0, 'shortfall_ml', 0);
  end if;

  with candidates as (
    select id, size_ml, sealed_expiry, prep_date
    from public.bags
    where site_id = p_from_site
      and sauce_id = p_sauce_id
      and status = 'sealed'
    order by sealed_expiry desc, prep_date desc, id asc
    for update skip locked
  ),
  ranked as (
    select id, size_ml,
           sum(size_ml) over (
             order by sealed_expiry desc, prep_date desc, id asc
           ) as running_total
    from candidates
  ),
  to_move as (
    select id, size_ml from ranked where running_total - size_ml < p_ml
  ),
  updated as (
    update public.bags b
    set site_id = p_to_site
    from to_move t
    where b.id = t.id
    returning b.size_ml
  )
  select count(*), coalesce(sum(size_ml), 0) into moved_count, moved_ml from updated;

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

-- ---------------------------------------------------------------------------
-- 3. A new store starts with a par level for every sauce
-- ---------------------------------------------------------------------------
-- The planner reads par_levels per (sauce, site). Adding a store from
-- Settings would otherwise leave it with no rows at all, so it would forecast
-- against a missing minimum until someone visited the Minimum stock tab.

create or replace function public.seed_par_levels_for_site()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.par_levels (sauce_id, site_id, target_ml)
  select s.id, new.id, 0
  from public.sauces s
  on conflict (sauce_id, site_id) do nothing;
  return new;
end;
$$;

drop trigger if exists sites_seed_par_levels on public.sites;
create trigger sites_seed_par_levels
  after insert on public.sites
  for each row execute function public.seed_par_levels_for_site();

-- Backfill anything already missing.
insert into public.par_levels (sauce_id, site_id, target_ml)
select s.id, si.id, 0
from public.sauces s
cross join public.sites si
on conflict (sauce_id, site_id) do nothing;
