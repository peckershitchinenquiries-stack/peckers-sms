-- ===========================================================================
-- Peckers Sauce Management System — core schema
-- ===========================================================================
-- Two sites (Stevenage, Hitchin), 15 house sauces, prep every Tuesday and
-- Friday, and one row per physical vacuum-sealed bag from prep to disposal.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('manager', 'staff');
create type public.bag_size as enum ('1L', '2L');
create type public.prep_type as enum ('tuesday', 'friday');
create type public.plan_status as enum ('draft', 'confirmed', 'completed', 'cancelled');
create type public.bag_status as enum ('sealed', 'opened', 'used', 'discarded');
create type public.alert_type as enum ('expiry', 'low_stock', 'pattern');
create type public.alert_severity as enum ('info', 'warning', 'critical');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sites
-- ---------------------------------------------------------------------------

create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  address     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
-- site_id is NULL for managers — they see and act across both sites.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.user_role not null default 'staff',
  site_id     uuid references public.sites (id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Kitchen staff must always be tied to exactly one site.
  constraint staff_requires_site check (role <> 'staff' or site_id is not null)
);

create index profiles_site_id_idx on public.profiles (site_id);
create index profiles_role_idx on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- New auth users get a profile automatically. Role/site/name come from the
-- metadata passed at sign-up (the seed script and the admin "invite staff"
-- flow both set these).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role public.user_role;
  meta_site uuid;
begin
  meta_role := coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'staff');

  begin
    meta_site := nullif(new.raw_user_meta_data ->> 'site_id', '')::uuid;
  exception when others then
    meta_site := null;
  end;

  -- A staff account with no site would violate staff_requires_site; park them
  -- on the first site rather than failing the whole sign-up.
  if meta_role = 'staff' and meta_site is null then
    select id into meta_site from public.sites order by name limit 1;
  end if;

  insert into public.profiles (id, email, full_name, role, site_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    meta_role,
    case when meta_role = 'manager' then null else meta_site end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Sauces
-- ---------------------------------------------------------------------------

create table public.sauces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  bag_size    public.bag_size not null,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  -- Set when a sauce is introduced, so the forecast engine doesn't divide a
  -- brand-new sauce's usage across a full 28-day window.
  introduced_on date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index sauces_active_idx on public.sauces (active);

create trigger sauces_set_updated_at
  before update on public.sauces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Par levels (target stock per sauce per site)
-- ---------------------------------------------------------------------------

create table public.par_levels (
  id           uuid primary key default gen_random_uuid(),
  sauce_id     uuid not null references public.sauces (id) on delete cascade,
  site_id      uuid not null references public.sites (id) on delete cascade,
  target_bags  integer not null default 0 check (target_bags >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sauce_id, site_id)
);

create index par_levels_site_idx on public.par_levels (site_id);

create trigger par_levels_set_updated_at
  before update on public.par_levels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Prep plans (the forecast for one prep day at one site)
-- ---------------------------------------------------------------------------

create table public.prep_plans (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites (id) on delete cascade,
  prep_date    date not null,
  prep_type    public.prep_type not null,
  -- Tuesday covers Tue/Wed/Thu (3); Friday covers Fri/Sat/Sun/Mon (4).
  covers_days  integer not null check (covers_days in (3, 4)),
  status       public.plan_status not null default 'draft',
  created_by   uuid references public.profiles (id) on delete set null,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (site_id, prep_date),

  constraint coverage_matches_prep_type check (
    (prep_type = 'tuesday' and covers_days = 3) or
    (prep_type = 'friday' and covers_days = 4)
  )
);

create index prep_plans_site_date_idx on public.prep_plans (site_id, prep_date desc);
create index prep_plans_status_idx on public.prep_plans (status);

create trigger prep_plans_set_updated_at
  before update on public.prep_plans
  for each row execute function public.set_updated_at();

create table public.prep_plan_items (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.prep_plans (id) on delete cascade,
  sauce_id        uuid not null references public.sauces (id) on delete cascade,
  suggested_bags  integer not null default 0 check (suggested_bags >= 0),
  -- Manager's override. NULL means "use the suggestion".
  override_bags   integer check (override_bags >= 0),
  -- The forecast engine's full working, so the number is never a black box.
  reasoning       jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (plan_id, sauce_id)
);

create index prep_plan_items_plan_idx on public.prep_plan_items (plan_id);
create index prep_plan_items_sauce_idx on public.prep_plan_items (sauce_id);

create trigger prep_plan_items_set_updated_at
  before update on public.prep_plan_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Prep sessions (the actual 7–11am prep event; also the overtime record)
-- ---------------------------------------------------------------------------

create table public.prep_sessions (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  plan_id     uuid references public.prep_plans (id) on delete set null,
  staff_id    uuid not null references public.profiles (id) on delete cascade,
  prep_date   date not null,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint session_ends_after_start check (ended_at is null or ended_at > started_at)
);

create index prep_sessions_site_date_idx on public.prep_sessions (site_id, prep_date desc);
create index prep_sessions_staff_idx on public.prep_sessions (staff_id, prep_date desc);

create trigger prep_sessions_set_updated_at
  before update on public.prep_sessions
  for each row execute function public.set_updated_at();

-- 3-step prep flow: Cooked -> Blast Chilled (1.5h) -> Vacuum Packed.
create table public.prep_checklist (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.prep_sessions (id) on delete cascade,
  sauce_id          uuid not null references public.sauces (id) on delete cascade,
  planned_bags      integer not null default 0 check (planned_bags >= 0),
  cooked_at         timestamptz,
  blast_chilled_at  timestamptz,
  vacuum_packed_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (session_id, sauce_id)
);

create index prep_checklist_session_idx on public.prep_checklist (session_id);

create trigger prep_checklist_set_updated_at
  before update on public.prep_checklist
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Bags — one row per physical vacuum-sealed bag
-- ---------------------------------------------------------------------------

create table public.bags (
  id               uuid primary key default gen_random_uuid(),
  sauce_id         uuid not null references public.sauces (id) on delete restrict,
  site_id          uuid not null references public.sites (id) on delete cascade,
  prep_session_id  uuid references public.prep_sessions (id) on delete set null,
  bag_size         public.bag_size not null,
  prep_date        date not null,
  -- Sealed life: prep_date + 5 days (set by trigger).
  sealed_expiry    date not null,
  status           public.bag_status not null default 'sealed',
  opened_at        timestamptz,
  -- Opened life: min(sealed_expiry, opened date + 2 days) (set by trigger).
  opened_expiry    date,
  used_at          timestamptz,
  discarded_at     timestamptz,
  discard_reason   text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint opened_bag_has_timestamps check (
    status <> 'opened' or (opened_at is not null and opened_expiry is not null)
  )
);

-- The expiry tracker and stock views read these constantly.
create index bags_site_status_idx on public.bags (site_id, status);
create index bags_sauce_site_status_idx on public.bags (sauce_id, site_id, status);
create index bags_sealed_expiry_idx on public.bags (sealed_expiry) where status = 'sealed';
create index bags_opened_expiry_idx on public.bags (opened_expiry) where status = 'opened';
create index bags_prep_date_idx on public.bags (prep_date desc);
create index bags_session_idx on public.bags (prep_session_id);

create trigger bags_set_updated_at
  before update on public.bags
  for each row execute function public.set_updated_at();

-- Shelf-life rules live in the database so they hold no matter which client
-- writes the row.
create or replace function public.apply_bag_shelf_life()
returns trigger
language plpgsql
as $$
declare
  two_day_expiry date;
  app_tz text;
begin
  -- Sealed life is always 5 days from the prep date.
  new.sealed_expiry := new.prep_date + 5;

  if new.status = 'opened' then
    if new.opened_at is null then
      new.opened_at := now();
    end if;

    -- "The day it was opened" is a wall-clock question, so resolve it in the
    -- configured business timezone rather than UTC.
    select timezone into app_tz from public.app_settings where id;
    two_day_expiry := (new.opened_at at time zone coalesce(app_tz, 'Europe/London'))::date + 2;

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

  return new;
end;
$$;

create trigger bags_apply_shelf_life
  before insert or update on public.bags
  for each row execute function public.apply_bag_shelf_life();

-- ---------------------------------------------------------------------------
-- Daily usage
-- ---------------------------------------------------------------------------

create table public.usage_logs (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references public.sites (id) on delete cascade,
  sauce_id     uuid not null references public.sauces (id) on delete cascade,
  usage_date   date not null,
  bags_opened  integer not null default 0 check (bags_opened >= 0),
  notes        text,
  logged_by    uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One row per sauce per site per day; repeat logging adds to the total.
  unique (site_id, sauce_id, usage_date)
);

create index usage_logs_site_date_idx on public.usage_logs (site_id, usage_date desc);
create index usage_logs_sauce_date_idx on public.usage_logs (sauce_id, usage_date desc);

create trigger usage_logs_set_updated_at
  before update on public.usage_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------

create table public.alerts (
  id                 uuid primary key default gen_random_uuid(),
  type               public.alert_type not null,
  severity           public.alert_severity not null default 'warning',
  site_id            uuid references public.sites (id) on delete cascade,
  sauce_id           uuid references public.sauces (id) on delete cascade,
  title              text not null,
  message            text not null,
  -- Array of { key, label, description } — the 3 suggested actions.
  suggested_actions  jsonb not null default '[]'::jsonb,
  metadata           jsonb not null default '{}'::jsonb,
  -- Stops the cron job raising the same alert twice in one day.
  dedupe_key         text,
  resolved           boolean not null default false,
  resolved_at        timestamptz,
  resolved_by        uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);

create index alerts_site_resolved_idx on public.alerts (site_id, resolved, created_at desc);
create index alerts_type_idx on public.alerts (type);
-- Plain (not partial) unique index: PostgREST's `on_conflict=dedupe_key` emits
-- `ON CONFLICT (dedupe_key)` with no predicate, which cannot match a partial
-- index. NULLs are distinct in Postgres, so un-keyed alerts still insert freely.
create unique index alerts_dedupe_idx on public.alerts (dedupe_key);

-- ---------------------------------------------------------------------------
-- App settings (singleton)
-- ---------------------------------------------------------------------------

create table public.app_settings (
  id                    boolean primary key default true check (id),
  timezone              text not null default 'Europe/London',
  digest_hour           integer not null default 8 check (digest_hour between 0 and 23),
  digest_recipients     text[] not null default '{}',
  low_stock_alerts_enabled boolean not null default true,
  -- Safety buffer applied to every forecast (1.1 = +10%).
  forecast_buffer       numeric(4, 2) not null default 1.10 check (forecast_buffer >= 1),
  -- Rolling window the burn rate is measured over.
  forecast_window_days  integer not null default 28 check (forecast_window_days between 7 and 90),
  updated_at            timestamptz not null default now()
);

insert into public.app_settings (id) values (true);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();
