'use server'

import { revalidatePath } from 'next/cache'
import { createAdminSupabase, createServerSupabase } from '@/lib/supabase/server'
import { requireManager } from '@/lib/auth'
import { today } from '@/lib/date'
import { fail, ok, type ActionResult } from './types'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* -------------------------------------------------------------------------- */
/* Sauces                                                                     */
/* -------------------------------------------------------------------------- */

export async function upsertSauce(input: {
  id?: string
  name: string
  active?: boolean
  sealedShelfLifeDays?: number
  openedShelfLifeDays?: number
}): Promise<ActionResult<{ id: string }>> {
  try {
    await requireManager()

    const name = input.name.trim()
    if (name.length < 2) return fail(new Error('Give the sauce a name.'))

    if (input.sealedShelfLifeDays !== undefined) {
      if (!Number.isInteger(input.sealedShelfLifeDays) || input.sealedShelfLifeDays < 1) {
        return fail(new Error('Sealed shelf life must be a whole number of at least 1 day.'))
      }
    }
    if (input.openedShelfLifeDays !== undefined) {
      if (!Number.isInteger(input.openedShelfLifeDays) || input.openedShelfLifeDays < 1) {
        return fail(new Error('Opened shelf life must be a whole number of at least 1 day.'))
      }
    }

    const supabase = createServerSupabase()

    if (input.id) {
      const patch: Record<string, unknown> = { name, active: input.active ?? true }
      if (input.sealedShelfLifeDays !== undefined) patch.sealed_shelf_life_days = input.sealedShelfLifeDays
      if (input.openedShelfLifeDays !== undefined) patch.opened_shelf_life_days = input.openedShelfLifeDays

      const { error } = await supabase.from('sauces').update(patch).eq('id', input.id)
      if (error) throw new Error(error.message)

      revalidatePath('/settings')
      return ok({ id: input.id })
    }

    // A new sauce is introduced today, so the forecast engine averages its
    // usage over the days it has actually existed. Shelf life defaults to the
    // house-wide 5/2 days when not given.
    const { data, error } = await supabase
      .from('sauces')
      .insert({
        name,
        slug: slugify(name),
        active: true,
        introduced_on: today(),
        ...(input.sealedShelfLifeDays !== undefined
          ? { sealed_shelf_life_days: input.sealedShelfLifeDays }
          : {}),
        ...(input.openedShelfLifeDays !== undefined
          ? { opened_shelf_life_days: input.openedShelfLifeDays }
          : {}),
      })
      .select('id')
      .single<{ id: string }>()
    if (error) {
      throw new Error(
        /duplicate/i.test(error.message) ? 'A sauce with that name already exists.' : error.message,
      )
    }

    // Every sauce exists at both sites — create the par rows straight away.
    const { data: sites } = await supabase.from('sites').select('id').returns<Array<{ id: string }>>()
    if (sites?.length) {
      await supabase.from('par_levels').upsert(
        sites.map((site) => ({ sauce_id: data.id, site_id: site.id, target_ml: 0 })),
        { onConflict: 'sauce_id,site_id' },
      )
    }

    revalidatePath('/settings')
    revalidatePath('/planner')
    return ok({ id: data.id })
  } catch (error) {
    return fail(error, 'Could not save the sauce.')
  }
}

/** Deactivates rather than deletes — historical batches must stay readable. */
export async function setSauceActive(input: {
  sauceId: string
  active: boolean
}): Promise<ActionResult> {
  try {
    await requireManager()
    const supabase = createServerSupabase()

    const { error } = await supabase
      .from('sauces')
      .update({ active: input.active })
      .eq('id', input.sauceId)
    if (error) throw new Error(error.message)

    revalidatePath('/settings')
    revalidatePath('/planner')
    return ok()
  } catch (error) {
    return fail(error, 'Could not update the sauce.')
  }
}

/* -------------------------------------------------------------------------- */
/* Par levels                                                                 */
/* -------------------------------------------------------------------------- */

export async function setParLevel(input: {
  sauceId: string
  siteId: string
  targetMl: number
}): Promise<ActionResult> {
  try {
    await requireManager()

    if (!Number.isInteger(input.targetMl) || input.targetMl < 0 || input.targetMl > 100_000) {
      return fail(new Error('Par level must be between 0 and 100,000 ml.'))
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.from('par_levels').upsert(
      { sauce_id: input.sauceId, site_id: input.siteId, target_ml: input.targetMl },
      { onConflict: 'sauce_id,site_id' },
    )
    if (error) throw new Error(error.message)

    revalidatePath('/settings')
    revalidatePath('/planner')
    return ok()
  } catch (error) {
    return fail(error, 'Could not save the par level.')
  }
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Creates a new account. Uses the service-role client because creating auth
 * users is an admin operation — the caller is checked to be a manager first.
 */
export async function createStaffAccount(input: {
  email: string
  fullName: string
  role: 'manager' | 'staff'
  siteId: string | null
  password: string
}): Promise<ActionResult<{ id: string }>> {
  try {
    await requireManager()

    const email = input.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail(new Error('Enter a valid email address.'))
    }
    if (input.password.length < 8) {
      return fail(new Error('Password must be at least 8 characters.'))
    }
    if (input.role === 'staff' && !input.siteId) {
      return fail(new Error('Kitchen staff must be assigned to a site.'))
    }

    const admin = createAdminSupabase()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName.trim(),
        role: input.role,
        site_id: input.role === 'manager' ? null : input.siteId,
      },
    })
    if (error) {
      throw new Error(
        /already/i.test(error.message) ? 'That email already has an account.' : error.message,
      )
    }

    // The handle_new_user trigger has created the profile; make sure the role
    // and site match exactly what was asked for.
    await admin.from('profiles').upsert(
      {
        id: data.user!.id,
        email,
        full_name: input.fullName.trim(),
        role: input.role,
        site_id: input.role === 'manager' ? null : input.siteId,
        active: true,
      },
      { onConflict: 'id' },
    )

    revalidatePath('/settings')
    return ok({ id: data.user!.id })
  } catch (error) {
    return fail(error, 'Could not create the account.')
  }
}

export async function updateStaffAccount(input: {
  profileId: string
  fullName?: string
  role?: 'manager' | 'staff'
  siteId?: string | null
  active?: boolean
}): Promise<ActionResult> {
  try {
    const context = await requireManager()

    if (input.profileId === context.profile.id && input.active === false) {
      return fail(new Error('You cannot deactivate your own account.'))
    }
    if (input.role === 'staff' && input.siteId === null) {
      return fail(new Error('Kitchen staff must be assigned to a site.'))
    }

    const patch: Record<string, unknown> = {}
    if (input.fullName !== undefined) patch.full_name = input.fullName.trim()
    if (input.role !== undefined) patch.role = input.role
    if (input.siteId !== undefined) {
      patch.site_id = input.role === 'manager' ? null : input.siteId
    }
    if (input.active !== undefined) patch.active = input.active

    const supabase = createServerSupabase()
    const { error } = await supabase.from('profiles').update(patch).eq('id', input.profileId)
    if (error) throw new Error(error.message)

    revalidatePath('/settings')
    return ok()
  } catch (error) {
    return fail(error, 'Could not update the account.')
  }
}

export async function resetStaffPassword(input: {
  profileId: string
  password: string
}): Promise<ActionResult> {
  try {
    await requireManager()
    if (input.password.length < 8) {
      return fail(new Error('Password must be at least 8 characters.'))
    }

    const admin = createAdminSupabase()
    const { error } = await admin.auth.admin.updateUserById(input.profileId, {
      password: input.password,
    })
    if (error) throw new Error(error.message)

    return ok()
  } catch (error) {
    return fail(error, 'Could not reset the password.')
  }
}

/* -------------------------------------------------------------------------- */
/* App settings                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Chooses which restaurant prepares sauce.
 *
 * Exactly one site cooks — everywhere else receives deliveries — so this
 * clears the flag elsewhere rather than adding another prep kitchen.
 */
export async function setPrepSite(siteId: string): Promise<ActionResult> {
  try {
    await requireManager()
    const supabase = createServerSupabase()

    const { error: clearError } = await supabase
      .from('sites')
      .update({ is_prep_site: false })
      .neq('id', siteId)
    if (clearError) throw new Error(clearError.message)

    const { error } = await supabase
      .from('sites')
      .update({ is_prep_site: true })
      .eq('id', siteId)
    if (error) throw new Error(error.message)

    revalidatePath('/', 'layout')
    return ok()
  } catch (error) {
    return fail(error, 'Could not change the prep kitchen.')
  }
}

export async function updateAppSettings(input: {
  timezone?: string
  digestHour?: number
  digestRecipients?: string[]
  lowStockAlertsEnabled?: boolean
  forecastBuffer?: number
  forecastWindowDays?: number
  bagSizesMl?: number[]
  prepWeekdays?: number[]
}): Promise<ActionResult> {
  try {
    await requireManager()

    const patch: Record<string, unknown> = {}
    if (input.timezone) patch.timezone = input.timezone
    if (input.digestHour !== undefined) {
      if (input.digestHour < 0 || input.digestHour > 23) {
        return fail(new Error('Digest hour must be between 0 and 23.'))
      }
      patch.digest_hour = input.digestHour
    }
    if (input.digestRecipients) {
      const invalid = input.digestRecipients.find(
        (email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email),
      )
      if (invalid) return fail(new Error(`"${invalid}" is not a valid email address.`))
      patch.digest_recipients = input.digestRecipients
    }
    if (input.lowStockAlertsEnabled !== undefined) {
      patch.low_stock_alerts_enabled = input.lowStockAlertsEnabled
    }
    if (input.forecastBuffer !== undefined) {
      if (input.forecastBuffer < 1 || input.forecastBuffer > 2) {
        return fail(new Error('Buffer must be between 1.0 and 2.0.'))
      }
      patch.forecast_buffer = input.forecastBuffer
    }
    if (input.forecastWindowDays !== undefined) {
      if (input.forecastWindowDays < 7 || input.forecastWindowDays > 90) {
        return fail(new Error('Window must be between 7 and 90 days.'))
      }
      patch.forecast_window_days = input.forecastWindowDays
    }
    if (input.bagSizesMl !== undefined) {
      const sizes = [...new Set(input.bagSizesMl)].sort((a, b) => a - b)
      const valid =
        sizes.length > 0 &&
        sizes.every((size) => Number.isInteger(size) && size > 0 && size % 100 === 0)
      if (!valid) {
        return fail(new Error('Bag sizes must be positive, whole multiples of 100ml.'))
      }
      patch.bag_sizes_ml = sizes
    }
    if (input.prepWeekdays !== undefined) {
      const days = [...new Set(input.prepWeekdays)].sort((a, b) => a - b)
      const valid =
        days.length > 0 &&
        days.length <= 7 &&
        days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      if (!valid) {
        return fail(new Error('Choose at least one prep day.'))
      }
      patch.prep_weekdays = days
    }

    const supabase = createServerSupabase()
    const { error } = await supabase.from('app_settings').update(patch).eq('id', true)
    if (error) throw new Error(error.message)

    // Prep days change what every screen calls "today's plan", so the whole
    // app is revalidated rather than just this page.
    revalidatePath('/', 'layout')
    return ok()
  } catch (error) {
    return fail(error, 'Could not save settings.')
  }
}
