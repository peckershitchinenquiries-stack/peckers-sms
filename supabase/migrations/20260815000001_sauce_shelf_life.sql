-- Shelf life was a fixed 5 days sealed / 2 days opened for every sauce.
-- Each sauce now carries its own shelf life, editable by a manager, defaulting
-- to the old fixed values.

alter table public.sauces
  add column sealed_shelf_life_days integer not null default 5
    constraint sauces_sealed_shelf_life_days_positive check (sealed_shelf_life_days > 0),
  add column opened_shelf_life_days integer not null default 2
    constraint sauces_opened_shelf_life_days_positive check (opened_shelf_life_days > 0);

-- Shelf-life rules live in the database so they hold no matter which client
-- writes the row — now reading each sauce's own days instead of a fixed 5/2.
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

  return new;
end;
$$;
