'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabase } from '@/lib/supabase/server'
import { requireManager, requireWriteSite } from '@/lib/auth'
import { buildForecast } from '@/lib/queries/planning'
import { type DateOnly, isPrepDay, upcomingPrepDay } from '@/lib/date'
import { fail, ok, type ActionResult } from './types'

/**
 * Builds (or rebuilds) the forecast plan for a prep day at one site.
 *
 * Re-running replaces the suggested quantities but preserves any manager
 * overrides — re-forecasting shouldn't quietly undo a deliberate decision.
 */
export async function generatePlan(input: {
  siteId: string
  prepDate: DateOnly
}): Promise<ActionResult<{ planId: string; items: number }>> {
  try {
    const context = await requireManager()
    const siteId = requireWriteSite(context, input.siteId)

    if (!isPrepDay(input.prepDate)) {
      return fail(new Error('Prep only happens on Tuesdays and Fridays.'))
    }

    const prepDay = upcomingPrepDay(input.prepDate)
    const supabase = createServerSupabase()

    const { data: plan, error: planError } = await supabase
      .from('prep_plans')
      .upsert(
        {
          site_id: siteId,
          prep_date: prepDay.date,
          prep_type: prepDay.type,
          covers_days: prepDay.coversDays,
          created_by: context.profile.id,
        },
        { onConflict: 'site_id,prep_date' },
      )
      .select('id')
      .single<{ id: string }>()
    if (planError) throw new Error(planError.message)

    const { forecasts } = await buildForecast({
      siteId,
      prepDate: prepDay.date,
      windowDays: context.settings.forecast_window_days,
      bufferMultiplier: Number(context.settings.forecast_buffer),
    })

    // Keep existing overrides across a regenerate.
    const { data: existing } = await supabase
      .from('prep_plan_items')
      .select('sauce_id, override_bags')
      .eq('plan_id', plan.id)
      .returns<Array<{ sauce_id: string; override_bags: number | null }>>()

    const overrides = new Map(
      (existing ?? []).map((item) => [item.sauce_id, item.override_bags]),
    )

    const { error: itemsError } = await supabase.from('prep_plan_items').upsert(
      forecasts.map((forecast) => ({
        plan_id: plan.id,
        sauce_id: forecast.sauceId,
        suggested_bags: forecast.suggestedBags,
        override_bags: overrides.get(forecast.sauceId) ?? null,
        reasoning: forecast.reasoning,
      })),
      { onConflict: 'plan_id,sauce_id' },
    )
    if (itemsError) throw new Error(itemsError.message)

    revalidatePath('/planner')
    revalidatePath('/dashboard')
    return ok({ planId: plan.id, items: forecasts.length })
  } catch (error) {
    return fail(error, 'Could not build the plan.')
  }
}

/** Manager override for a single sauce. Pass `null` to fall back to the suggestion. */
export async function setPlanItemOverride(input: {
  itemId: string
  overrideBags: number | null
}): Promise<ActionResult> {
  try {
    await requireManager()

    if (input.overrideBags !== null && (input.overrideBags < 0 || input.overrideBags > 999)) {
      return fail(new Error('Enter between 0 and 999 bags.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase
      .from('prep_plan_items')
      .update({ override_bags: input.overrideBags })
      .eq('id', input.itemId)
    if (error) throw new Error(error.message)

    revalidatePath('/planner')
    return ok()
  } catch (error) {
    return fail(error, 'Could not save the override.')
  }
}

/** Locks the plan so the kitchen sees a finalised checklist. */
export async function setPlanStatus(input: {
  planId: string
  status: 'draft' | 'confirmed' | 'completed' | 'cancelled'
}): Promise<ActionResult> {
  try {
    await requireManager()
    const supabase = createServerSupabase()

    const { error } = await supabase
      .from('prep_plans')
      .update({ status: input.status })
      .eq('id', input.planId)
    if (error) throw new Error(error.message)

    revalidatePath('/planner')
    revalidatePath('/prep')
    return ok()
  } catch (error) {
    return fail(error, 'Could not update the plan.')
  }
}

/** Clears every override on a plan, reverting to the engine's numbers. */
export async function resetPlanOverrides(planId: string): Promise<ActionResult> {
  try {
    await requireManager()
    const supabase = createServerSupabase()

    const { error } = await supabase
      .from('prep_plan_items')
      .update({ override_bags: null })
      .eq('plan_id', planId)
    if (error) throw new Error(error.message)

    revalidatePath('/planner')
    return ok()
  } catch (error) {
    return fail(error, 'Could not reset overrides.')
  }
}
