-- ===========================================================================
-- Undo a usage log
-- ===========================================================================
-- record_usage() draws stock down FIFO but never records which bags a given
-- entry came from, so an undo can't reverse the exact bags — only the total
-- volume. This puts that volume back on the shelf LIFO (most recently touched
-- bags first), which is the best available guess and is exact for the common
-- case: undoing a log within minutes of making it.
--
-- Bags that have since been discarded (expired, thrown away) are left alone —
-- that stock is genuinely gone, not silently un-wasted. The shortfall is
-- reported back as `ml_unrecoverable` rather than hidden.
--
-- Runs as the caller (security invoker), same as record_usage/consume_stock,
-- so the existing "usage logs/bags writable within site" RLS policies are
-- what actually gate who can touch which rows. Who is *allowed* to press
-- Undo (yourself, recently, vs. a manager any time) is a business rule, not a
-- data-access rule, and is enforced in the app layer instead — see
-- undoUsageLog() in src/lib/actions/usage.ts, matching correctUsageLog()'s
-- existing manager check.
-- ---------------------------------------------------------------------------

create or replace function public.undo_usage_log(p_usage_log_id uuid)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_log         record;
  v_bag         record;
  v_outstanding integer;
  v_restored    integer := 0;
  v_take        integer;
begin
  select id, site_id, sauce_id, ml_used
    into v_log
  from public.usage_logs
  where id = p_usage_log_id
  for update;

  if not found then
    raise exception 'Usage log not found';
  end if;

  v_outstanding := v_log.ml_used;

  for v_bag in
    select id, size_ml, remaining_ml
    from public.bags
    where site_id = v_log.site_id
      and sauce_id = v_log.sauce_id
      and status in ('opened', 'used')
      and remaining_ml < size_ml
    order by updated_at desc, id desc
    for update skip locked
  loop
    exit when v_outstanding <= 0;

    v_take := least(v_bag.size_ml - v_bag.remaining_ml, v_outstanding);

    update public.bags b
    set remaining_ml = v_bag.remaining_ml + v_take,
        status = case
                   when v_bag.remaining_ml + v_take >= v_bag.size_ml then 'sealed'
                   else 'opened'
                 end::public.bag_status
    where b.id = v_bag.id;

    v_restored := v_restored + v_take;
    v_outstanding := v_outstanding - v_take;
  end loop;

  delete from public.usage_logs where id = p_usage_log_id;

  return jsonb_build_object(
    'ml_undone', v_log.ml_used,
    'ml_restored_to_stock', v_restored,
    -- Positive when the bags this entry drew from have since expired and been
    -- discarded — that stock can't honestly come back.
    'ml_unrecoverable', v_outstanding
  );
end;
$$;

grant execute on function public.undo_usage_log(uuid) to authenticated;
