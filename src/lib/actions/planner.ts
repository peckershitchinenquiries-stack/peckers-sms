'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requirePrepAccess } from '@/lib/auth'
import { buildCombinedForecast } from '@/lib/queries/planning'
import { type DateOnly, isPrepDay, upcomingPrepDay } from '@/lib/date'
import { fail, ok, type ActionResult } from './types'

/**
 * Builds (or rebuilds) the plan for one prep day.
 *
 * There is only ever one plan per prep day: sauce is cooked once, at the prep
 * kitchen, and delivered out. Each line's total is the sum of what every
 * restaurant needs, and that per-restaurant split is saved alongside it so the
 * dispatch screen knows how much to send where.
 *
 * Re-running replaces the suggested quantities but preserves any manager
 * overrides — re-forecasting shouldn't quietly undo a deliberate decision.
 */
export async function generatePlan(input: {
  prepDate: DateOnly
}): Promise<ActionResult<{ planId: string; items: number }>> {
  try {
    // Prep access, not manager: the people who cook the sauce are the people
    // who plan it. `requirePrepAccess` already shuts out a receiving store.
    const context = await requirePrepAccess()

    if (!isPrepDay(input.prepDate, context.prepWeekdays)) {
      return fail(new Error('That date is not a prep day.'))
    }

    const prepDay = upcomingPrepDay(input.prepDate, context.prepWeekdays)
    const supabase = createServerSupabase()

    const { data: plan, error: planError } = await supabase
      .from('prep_plans')
      .upsert(
        {
          site_id: context.prepSite.id,
          prep_date: prepDay.date,
          covers_days: prepDay.coversDays,
          created_by: context.profile.id,
        },
        { onConflict: 'site_id,prep_date' },
      )
      .select('id')
      .single<{ id: string }>()
    if (planError) throw new Error(planError.message)

    // Every restaurant this batch feeds, not just the kitchen that cooks it.
    const { forecasts } = await buildCombinedForecast({
      sites: context.allSites.map((site) => ({ id: site.id, name: site.name })),
      prepDate: prepDay.date,
      windowDays: context.settings.forecast_window_days,
      bufferMultiplier: Number(context.settings.forecast_buffer),
      bagSizesMl: context.settings.bag_sizes_ml,
      prepWeekdays: context.prepWeekdays,
    })

    // Keep existing overrides across a regenerate.
    const { data: existing } = await supabase
      .from('prep_plan_items')
      .select('sauce_id, override_ml')
      .eq('plan_id', plan.id)
      .returns<Array<{ sauce_id: string; override_ml: number | null }>>()

    const overrides = new Map((existing ?? []).map((item) => [item.sauce_id, item.override_ml]))

    const { data: items, error: itemsError } = await supabase
      .from('prep_plan_items')
      .upsert(
        forecasts.map((forecast) => ({
          plan_id: plan.id,
          sauce_id: forecast.sauceId,
          suggested_ml: forecast.suggestedMl,
          override_ml: overrides.get(forecast.sauceId) ?? null,
          reasoning: forecast.reasoning,
        })),
        { onConflict: 'plan_id,sauce_id' },
      )
      .select('id, sauce_id')
      .returns<Array<{ id: string; sauce_id: string }>>()
    if (itemsError) throw new Error(itemsError.message)

    const itemBySauce = new Map((items ?? []).map((item) => [item.sauce_id, item.id]))

    const allocations = forecasts.flatMap((forecast) => {
      const itemId = itemBySauce.get(forecast.sauceId)
      if (!itemId) return []
      return forecast.bySite.map((entry) => ({
        item_id: itemId,
        site_id: entry.siteId,
        suggested_ml: entry.ml,
      }))
    })

    if (allocations.length > 0) {
      const { error: allocationError } = await supabase
        .from('prep_plan_allocations')
        .upsert(allocations, { onConflict: 'item_id,site_id' })
      if (allocationError) throw new Error(allocationError.message)
    }

    revalidatePath('/planner')
    revalidatePath('/prep')
    revalidatePath('/dispatch', 'layout')
    revalidatePath('/dashboard')
    revalidatePath('/today')
    return ok({ planId: plan.id, items: forecasts.length })
  } catch (error) {
    return fail(error, 'Could not build the plan.')
  }
}

/** Manual override for a single sauce. Pass `null` to fall back to the suggestion. */
export async function setPlanItemOverride(input: {
  itemId: string
  overrideMl: number | null
}): Promise<ActionResult> {
  try {
    await requirePrepAccess()

    if (input.overrideMl !== null && (input.overrideMl < 0 || input.overrideMl > 100_000)) {
      return fail(new Error('Enter between 0 and 100,000 ml.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('prep_plan_items')
      .update({ override_ml: input.overrideMl })
      .eq('id', input.itemId)
    if (error) throw new Error(error.message)

    revalidatePath('/planner')
    revalidatePath('/prep')
    revalidatePath('/dispatch', 'layout')
    return ok()
  } catch (error) {
    return fail(error, 'Could not save the change.')
  }
}

/**
 * Pins how much of one sauce a single restaurant gets.
 *
 * Hitchin is consistently sent less than Stevenage whatever the forecast says,
 * so its share needs to be settable by hand. Pinning does not change how much
 * is cooked — the batch total stays put and the other restaurants absorb the
 * difference (see `resolveAllocations`). Pass `null` to unpin.
 */
export async function setAllocationOverride(input: {
  itemId: string
  siteId: string
  overrideMl: number | null
}): Promise<ActionResult> {
  try {
    const context = await requirePrepAccess()

    if (input.overrideMl !== null && (input.overrideMl < 0 || input.overrideMl > 100_000)) {
      return fail(new Error('Enter between 0 and 100,000 ml.'))
    }
    // Checked against every store rather than the caller's own scope: a prep
    // cook is scoped to the kitchen alone, yet splitting the batch across the
    // restaurants it feeds is exactly their job.
    if (!context.allSites.some((site) => site.id === input.siteId)) {
      return fail(new Error('That restaurant is not on the system.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('prep_plan_allocations')
      .update({ override_ml: input.overrideMl })
      .eq('item_id', input.itemId)
      .eq('site_id', input.siteId)
    if (error) throw new Error(error.message)

    revalidatePath('/planner')
    revalidatePath('/prep')
    revalidatePath('/dispatch', 'layout')
    return ok()
  } catch (error) {
    return fail(error, 'Could not save that restaurant’s share.')
  }
}

/** Sends the plan to the kitchen — this is what staff see on the prep screen. */
export async function setPlanStatus(input: {
  planId: string
  status: 'draft' | 'confirmed' | 'completed' | 'cancelled'
}): Promise<ActionResult> {
  try {
    await requirePrepAccess()

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('prep_plans')
      .update({ status: input.status })
      .eq('id', input.planId)
    if (error) throw new Error(error.message)

    revalidatePath('/planner')
    revalidatePath('/prep')
    revalidatePath('/today')
    return ok()
  } catch (error) {
    return fail(error, 'Could not update the plan.')
  }
}

/** Clears every manual change on a plan, reverting to the forecast's numbers. */
export async function resetPlanOverrides(planId: string): Promise<ActionResult> {
  try {
    await requirePrepAccess()

    const supabase = createServerSupabase()
    const { data: items, error } = await supabase
      .from('prep_plan_items')
      .update({ override_ml: null })
      .eq('plan_id', planId)
      .select('id')
      .returns<Array<{ id: string }>>()
    if (error) throw new Error(error.message)

    // "Undo my changes" has to mean all of them — a per-restaurant pin left
    // behind would keep bending a plan the manager thinks they just reset.
    const itemIds = (items ?? []).map((item) => item.id)
    if (itemIds.length > 0) {
      const { error: allocationError } = await supabase
        .from('prep_plan_allocations')
        .update({ override_ml: null })
        .in('item_id', itemIds)
      if (allocationError) throw new Error(allocationError.message)
    }

    revalidatePath('/planner')
    revalidatePath('/prep')
    revalidatePath('/dispatch', 'layout')
    return ok()
  } catch (error) {
    return fail(error, 'Could not reset the quantities.')
  }
}
