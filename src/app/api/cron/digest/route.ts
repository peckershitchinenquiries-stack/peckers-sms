import { NextResponse, type NextRequest } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/server'
import { runAlertScan } from '@/lib/alerts/engine'
import { sendEmail } from '@/lib/email/resend'
import { renderDigestEmail, type DigestSiteSection } from '@/lib/email/templates'
import {
  addDaysTo,
  formatDateOnly,
  formatShort,
  nextPrepDayAfter,
  today,
} from '@/lib/date'
import type { AppSettings, Site } from '@/lib/types/database'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Daily 8am expiry digest.
 *
 * Triggered by a Supabase scheduled Edge Function (see
 * supabase/functions/daily-digest) which authenticates with CRON_SECRET.
 * Uses the service-role client because there is no signed-in user on a cron
 * run — the bearer token is the only gate, so it must be a real secret.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  try {
    const supabase = createAdminSupabase()
    const asOf = today()
    const horizon = addDaysTo(asOf, 2)

    const [{ data: sites }, { data: settings }] = await Promise.all([
      supabase.from('sites').select('*').order('name').returns<Site[]>(),
      supabase.from('app_settings').select('*').eq('id', true).single<AppSettings>(),
    ])

    const siteList = sites ?? []
    if (siteList.length === 0) {
      return NextResponse.json({ ok: true, message: 'No sites configured.' })
    }

    // Refresh alerts first so the digest and the in-app alert centre agree.
    const scan = await runAlertScan(supabase, {
      sites: siteList.map((site) => ({ id: site.id, name: site.name })),
      windowDays: settings?.forecast_window_days ?? 28,
      asOf,
    })

    const sections: DigestSiteSection[] = []

    for (const site of siteList) {
      const { data: bags } = await supabase
        .from('bags')
        .select('sauce_id, status, sealed_expiry, opened_expiry, sauces(name)')
        .eq('site_id', site.id)
        .in('status', ['sealed', 'opened'])
        .returns<
          Array<{
            sauce_id: string
            status: string
            sealed_expiry: string
            opened_expiry: string | null
            sauces: { name: string } | null
          }>
        >()

      const todayMap = new Map<string, number>()
      const soonMap = new Map<string, { bags: number; days: number }>()

      for (const bag of bags ?? []) {
        const expiry = bag.opened_expiry ?? bag.sealed_expiry
        if (expiry > horizon) continue

        const name = bag.sauces?.name ?? 'Unknown sauce'

        if (expiry <= asOf) {
          todayMap.set(name, (todayMap.get(name) ?? 0) + 1)
        } else {
          const days = Math.round(
            (new Date(`${expiry}T00:00:00`).getTime() -
              new Date(`${asOf}T00:00:00`).getTime()) /
              86_400_000,
          )
          const entry = soonMap.get(name) ?? { bags: 0, days }
          entry.bags += 1
          entry.days = Math.min(entry.days, days)
          soonMap.set(name, entry)
        }
      }

      const lowStock = scan.drafts
        .filter((draft) => draft.type === 'low_stock' && draft.siteId === site.id)
        .map((draft) => ({
          sauceName: String(draft.title).replace(/ will run out.*$/, ''),
          usableMl: Number(draft.metadata.usableMl ?? 0),
          burnRateMl: Number(draft.metadata.burnRateMl ?? 0),
        }))

      sections.push({
        siteName: site.name,
        expiringToday: Array.from(todayMap.entries())
          .map(([sauceName, bags]) => ({ sauceName, bags }))
          .sort((a, b) => b.bags - a.bags),
        expiringSoon: Array.from(soonMap.entries())
          .map(([sauceName, entry]) => ({ sauceName, bags: entry.bags, days: entry.days }))
          .sort((a, b) => a.days - b.days || b.bags - a.bags),
        lowStock,
      })
    }

    const nextPrep = nextPrepDayAfter(asOf)
    const email = renderDigestEmail({
      date: asOf,
      dateLabel: formatDateOnly(asOf, 'EEEE d MMMM yyyy'),
      nextPrepLabel: formatShort(nextPrep.date),
      sections,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    })

    const recipients = settings?.digest_recipients ?? []
    const delivery = await sendEmail({
      to: recipients,
      subject: email.subject,
      html: email.html,
      text: email.text,
    })

    return NextResponse.json({
      ok: true,
      date: asOf,
      alertsCreated: scan.created,
      alertsSkipped: scan.skipped,
      email: delivery,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Digest failed'
    console.error('[cron/digest]', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

/** Convenience for manually firing the job from a browser during setup. */
export async function GET(request: NextRequest) {
  return POST(request)
}
