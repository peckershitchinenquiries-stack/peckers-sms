-- ===========================================================================
-- Simplify the prep flow
-- ===========================================================================
-- Four changes, all driven by how the kitchen actually works:
--
--  1. Sauce is prepared at ONE site (Stevenage) and delivered to the others.
--     `sites.is_prep_site` marks it, so Hitchin never sees a prep checklist.
--
--  2. Prep days are configurable (`app_settings.prep_weekdays`). They are
--     Tuesday and Friday today; the manager can change them without a deploy.
--     This kills the `prep_type` enum and the 3/4-day coverage constraint —
--     coverage is now simply "days until the next prep day".
--
--  3. Prep is ONE step, not three. Cold sauces never see a blast chiller, so
--     cooked -> blast chilled -> vacuum packed made no sense for half the
--     range. A line is either done or not done, with the volume actually made.
--
--  4. The checklist is keyed by (site, prep_date, sauce) instead of hanging off
--     a prep session. A plan built AFTER staff clocked in used to be invisible
--     to them; now the checklist is reconciled from the plan on every load and
--     cannot drift.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Views that depend on the columns below. Recreated at the end.
-- ---------------------------------------------------------------------------

drop view if exists public.prep_vs_plan;

-- ---------------------------------------------------------------------------
-- 1. Sites — which kitchen actually prepares sauce
-- ---------------------------------------------------------------------------

alter table public.sites
  add column if not exists is_prep_site boolean not null default false;

-- Stevenage prepares; everywhere else receives. Falls back to the first site
-- alphabetically so a fresh database is never left with no prep kitchen.
update public.sites set is_prep_site = true where slug = 'stevenage';

update public.sites set is_prep_site = true
where not exists (select 1 from public.sites where is_prep_site)
  and id = (select id from public.sites order by name limit 1);

-- ---------------------------------------------------------------------------
-- 2. Configurable prep days
-- ---------------------------------------------------------------------------
-- Postgres `extract(dow)` convention: 0 = Sunday … 6 = Saturday.

alter table public.app_settings
  add column if not exists prep_weekdays smallint[] not null default '{2,5}';

alter table public.app_settings
  drop constraint if exists prep_weekdays_valid;

alter table public.app_settings
  add constraint prep_weekdays_valid check (
    array_length(prep_weekdays, 1) between 1 and 7
    and prep_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  );

-- Blast chill is gone from the flow, so its hold time is no longer a rule.
alter table public.prep_plans drop constraint if exists coverage_matches_prep_type;
alter table public.prep_plans drop constraint if exists prep_plans_covers_days_check;
alter table public.prep_plans add constraint prep_plans_covers_days_check
  check (covers_days between 1 and 7);

alter table public.prep_plans drop column if exists prep_type;

drop type if exists public.prep_type;

-- ---------------------------------------------------------------------------
-- 3. Per-restaurant demand behind each planned quantity
-- ---------------------------------------------------------------------------
-- A plan line says "make 6000ml of Peri Peri Mayo". The allocations say that
-- 3500 of it is Stevenage's demand and 2500 is Hitchin's — which is exactly
-- what the dispatch screen suggests sending across.

create table if not exists public.prep_plan_allocations (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references public.prep_plan_items (id) on delete cascade,
  site_id       uuid not null references public.sites (id) on delete cascade,
  suggested_ml  integer not null default 0 check (suggested_ml >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (item_id, site_id)
);

create index if not exists prep_plan_allocations_item_idx
  on public.prep_plan_allocations (item_id);

drop trigger if exists prep_plan_allocations_set_updated_at on public.prep_plan_allocations;
create trigger prep_plan_allocations_set_updated_at
  before update on public.prep_plan_allocations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Checklist — one step, keyed by (site, date, sauce)
-- ---------------------------------------------------------------------------

alter table public.prep_checklist
  add column if not exists site_id   uuid references public.sites (id) on delete cascade,
  add column if not exists prep_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists actual_ml integer not null default 0 check (actual_ml >= 0);

-- Backfill from the owning session before the columns become mandatory.
update public.prep_checklist c
set site_id = s.site_id,
    prep_date = s.prep_date
from public.prep_sessions s
where s.id = c.session_id
  and (c.site_id is null or c.prep_date is null);

-- The old three-step flow collapses to "done at the moment it was packed".
update public.prep_checklist
set completed_at = vacuum_packed_at
where completed_at is null and vacuum_packed_at is not null;

delete from public.prep_checklist where site_id is null or prep_date is null;

alter table public.prep_checklist alter column site_id   set not null;
alter table public.prep_checklist alter column prep_date set not null;

-- A session is now optional: the checklist exists for the day whether or not
-- anyone has clocked in, which is what stopped it appearing in the first place.
alter table public.prep_checklist alter column session_id drop not null;
alter table public.prep_checklist
  drop constraint if exists prep_checklist_session_id_sauce_id_key;

-- Deduplicate before the new key goes on (two sessions in one day could each
-- have carried a row for the same sauce).
delete from public.prep_checklist a
using public.prep_checklist b
where a.site_id = b.site_id
  and a.prep_date = b.prep_date
  and a.sauce_id = b.sauce_id
  and a.ctid > b.ctid;

alter table public.prep_checklist
  drop constraint if exists prep_checklist_site_date_sauce_key;
alter table public.prep_checklist
  add constraint prep_checklist_site_date_sauce_key unique (site_id, prep_date, sauce_id);

create index if not exists prep_checklist_site_date_idx
  on public.prep_checklist (site_id, prep_date desc);

alter table public.prep_checklist
  drop column if exists cooked_at,
  drop column if exists blast_chilled_at,
  drop column if exists vacuum_packed_at;

-- ---------------------------------------------------------------------------
-- 5. Stock transfers — the Stevenage -> Hitchin delivery record
-- ---------------------------------------------------------------------------

create table if not exists public.stock_transfers (
  id             uuid primary key default gen_random_uuid(),
  sauce_id       uuid not null references public.sauces (id) on delete cascade,
  from_site_id   uuid not null references public.sites (id) on delete cascade,
  to_site_id     uuid not null references public.sites (id) on delete cascade,
  transfer_date  date not null,
  ml             integer not null check (ml > 0),
  bags           integer not null check (bags > 0),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint transfer_between_different_sites check (from_site_id <> to_site_id)
);

create index if not exists stock_transfers_date_idx
  on public.stock_transfers (transfer_date desc);
create index if not exists stock_transfers_to_site_idx
  on public.stock_transfers (to_site_id, transfer_date desc);

-- Moves whole sealed bags (sauce is never decanted between bags), freshest
-- first, until the running total first reaches the requested volume. Records
-- the movement so "what went to Hitchin on Friday" is answerable.
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
-- 6. Row level security for the new tables
-- ---------------------------------------------------------------------------

alter table public.prep_plan_allocations enable row level security;
alter table public.stock_transfers       enable row level security;

drop policy if exists "plan allocations readable within site" on public.prep_plan_allocations;
create policy "plan allocations readable within site"
  on public.prep_plan_allocations for select
  to authenticated
  using (true);

drop policy if exists "plan allocations writable by managers" on public.prep_plan_allocations;
create policy "plan allocations writable by managers"
  on public.prep_plan_allocations for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- Both ends of a transfer need to see it: Stevenage sent it, Hitchin received it.
drop policy if exists "transfers readable at either end" on public.stock_transfers;
create policy "transfers readable at either end"
  on public.stock_transfers for select
  to authenticated
  using (public.can_access_site(from_site_id) or public.can_access_site(to_site_id));

drop policy if exists "transfers writable from own site" on public.stock_transfers;
create policy "transfers writable from own site"
  on public.stock_transfers for all
  to authenticated
  using (public.can_access_site(from_site_id))
  with check (public.can_access_site(from_site_id));

-- The checklist now carries its own site_id, so the policy no longer has to
-- reach through prep_sessions.
drop policy if exists "prep checklist readable within site" on public.prep_checklist;
drop policy if exists "prep checklist writable within site" on public.prep_checklist;

create policy "prep checklist readable within site"
  on public.prep_checklist for select
  to authenticated
  using (public.can_access_site(site_id));

create policy "prep checklist writable within site"
  on public.prep_checklist for all
  to authenticated
  using (public.can_access_site(site_id))
  with check (public.can_access_site(site_id));

-- ---------------------------------------------------------------------------
-- 7. Views rebuilt without prep_type
-- ---------------------------------------------------------------------------

create or replace view public.prep_vs_plan
with (security_invoker = on)
as
select
  pp.id                                        as plan_id,
  pp.site_id,
  pp.prep_date,
  pp.covers_days,
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
  where b.sauce_id = ppi.sauce_id
    and b.prep_date = pp.prep_date
    and b.prep_session_id in (
      select id from public.prep_sessions where site_id = pp.site_id and prep_date = pp.prep_date
    )
) actual on true;

grant select on public.prep_vs_plan to authenticated;
