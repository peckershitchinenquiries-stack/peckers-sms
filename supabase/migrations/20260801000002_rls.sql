-- ===========================================================================
-- Row Level Security
-- ===========================================================================
-- Rule of the house:
--   * Kitchen staff read and write only rows belonging to THEIR site.
--   * Managers read and write everything, across both sites.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helper predicates
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so that reading `profiles` inside a `profiles` policy does
-- not recurse. STABLE so Postgres can cache them per statement.

create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role_name() = 'manager', false)
$$;

create or replace function public.current_site_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select site_id from public.profiles where id = auth.uid() and active
$$;

-- True when the caller may touch rows belonging to `target_site`.
create or replace function public.can_access_site(target_site uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_manager()
    or (target_site is not null and target_site = public.current_site_id())
$$;

grant execute on function public.is_manager() to authenticated;
grant execute on function public.current_site_id() to authenticated;
grant execute on function public.can_access_site(uuid) to authenticated;
grant execute on function public.current_role_name() to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.sites            enable row level security;
alter table public.profiles         enable row level security;
alter table public.sauces           enable row level security;
alter table public.par_levels       enable row level security;
alter table public.prep_plans       enable row level security;
alter table public.prep_plan_items  enable row level security;
alter table public.prep_sessions    enable row level security;
alter table public.prep_checklist   enable row level security;
alter table public.bags             enable row level security;
alter table public.usage_logs       enable row level security;
alter table public.alerts           enable row level security;
alter table public.app_settings     enable row level security;

-- ---------------------------------------------------------------------------
-- Sites — everyone reads (staff need site names); managers write.
-- ---------------------------------------------------------------------------

create policy "sites readable by authenticated"
  on public.sites for select
  to authenticated
  using (true);

create policy "sites writable by managers"
  on public.sites for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Profiles — you always see yourself; managers see and manage everyone.
-- ---------------------------------------------------------------------------

create policy "profiles readable by self or manager"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_manager());

create policy "profiles updatable by self"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  -- Staff may edit their own name but never promote themselves.
  with check (id = auth.uid() and role = public.current_role_name());

create policy "profiles manageable by managers"
  on public.profiles for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Sauces & par levels — global reference data; managers write.
-- ---------------------------------------------------------------------------

create policy "sauces readable by authenticated"
  on public.sauces for select
  to authenticated
  using (true);

create policy "sauces writable by managers"
  on public.sauces for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy "par levels readable by authenticated"
  on public.par_levels for select
  to authenticated
  using (true);

create policy "par levels writable by managers"
  on public.par_levels for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ---------------------------------------------------------------------------
-- Prep plans — site scoped.
-- ---------------------------------------------------------------------------

create policy "prep plans readable within site"
  on public.prep_plans for select
  to authenticated
  using (public.can_access_site(site_id));

create policy "prep plans writable within site"
  on public.prep_plans for all
  to authenticated
  using (public.can_access_site(site_id))
  with check (public.can_access_site(site_id));

create policy "prep plan items readable within site"
  on public.prep_plan_items for select
  to authenticated
  using (
    exists (
      select 1 from public.prep_plans pp
      where pp.id = plan_id and public.can_access_site(pp.site_id)
    )
  );

create policy "prep plan items writable within site"
  on public.prep_plan_items for all
  to authenticated
  using (
    exists (
      select 1 from public.prep_plans pp
      where pp.id = plan_id and public.can_access_site(pp.site_id)
    )
  )
  with check (
    exists (
      select 1 from public.prep_plans pp
      where pp.id = plan_id and public.can_access_site(pp.site_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Prep sessions & checklist — site scoped.
-- ---------------------------------------------------------------------------

create policy "prep sessions readable within site"
  on public.prep_sessions for select
  to authenticated
  using (public.can_access_site(site_id));

create policy "prep sessions writable within site"
  on public.prep_sessions for all
  to authenticated
  using (public.can_access_site(site_id))
  with check (public.can_access_site(site_id));

create policy "prep checklist readable within site"
  on public.prep_checklist for select
  to authenticated
  using (
    exists (
      select 1 from public.prep_sessions ps
      where ps.id = session_id and public.can_access_site(ps.site_id)
    )
  );

create policy "prep checklist writable within site"
  on public.prep_checklist for all
  to authenticated
  using (
    exists (
      select 1 from public.prep_sessions ps
      where ps.id = session_id and public.can_access_site(ps.site_id)
    )
  )
  with check (
    exists (
      select 1 from public.prep_sessions ps
      where ps.id = session_id and public.can_access_site(ps.site_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Bags — site scoped.
-- ---------------------------------------------------------------------------

create policy "bags readable within site"
  on public.bags for select
  to authenticated
  using (public.can_access_site(site_id));

create policy "bags writable within site"
  on public.bags for all
  to authenticated
  using (public.can_access_site(site_id))
  with check (public.can_access_site(site_id));

-- ---------------------------------------------------------------------------
-- Usage logs — site scoped.
-- ---------------------------------------------------------------------------

create policy "usage logs readable within site"
  on public.usage_logs for select
  to authenticated
  using (public.can_access_site(site_id));

create policy "usage logs writable within site"
  on public.usage_logs for all
  to authenticated
  using (public.can_access_site(site_id))
  with check (public.can_access_site(site_id));

-- ---------------------------------------------------------------------------
-- Alerts — site scoped; global alerts (site_id null) are manager-only.
-- ---------------------------------------------------------------------------

create policy "alerts readable within site"
  on public.alerts for select
  to authenticated
  using (
    case when site_id is null then public.is_manager() else public.can_access_site(site_id) end
  );

create policy "alerts resolvable within site"
  on public.alerts for update
  to authenticated
  using (
    case when site_id is null then public.is_manager() else public.can_access_site(site_id) end
  )
  with check (
    case when site_id is null then public.is_manager() else public.can_access_site(site_id) end
  );

create policy "alerts insertable by managers"
  on public.alerts for insert
  to authenticated
  with check (public.is_manager());

create policy "alerts deletable by managers"
  on public.alerts for delete
  to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------------------
-- App settings — everyone reads (timezone drives the UI); managers write.
-- ---------------------------------------------------------------------------

create policy "settings readable by authenticated"
  on public.app_settings for select
  to authenticated
  using (true);

create policy "settings writable by managers"
  on public.app_settings for all
  to authenticated
  using (public.is_manager())
  with check (public.is_manager());
