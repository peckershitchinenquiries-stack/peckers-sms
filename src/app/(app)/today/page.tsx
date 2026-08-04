import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { requireSession } from '@/lib/auth'
import { getLiveStock, getTrackedBags, summariseExpiry } from '@/lib/queries/stock'
import { getPlan, getSessionForDate } from '@/lib/queries/planning'
import { getUsageForDate } from '@/lib/queries/activity'
import {
  daysUntilNextPrep,
  formatRelativeDay,
  formatShort,
  isPrepDay,
  nextPrepDayAfter,
  today,
  upcomingPrepDay,
} from '@/lib/date'
import {
  Badge,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  LinkButton,
  ProgressBar,
  StatCard,
} from '@/components/ui'
import { BagSizeBadge, ExpiryBadge } from '@/components/app/StatusPills'

export const metadata: Metadata = { title: 'Today' }

/**
 * The kitchen's home screen. One question it must answer instantly:
 * "what do I do right now?"
 */
export default async function TodayPage() {
  const context = await requireSession()
  const siteId = context.profile.site_id ?? context.sites[0]?.id ?? null
  const asOf = today()

  if (!siteId) {
    return (
      <EmptyState
        icon="map-pin"
        title="No kitchen assigned"
        description="Your account isn't linked to a site yet. Ask your manager to set this up in Settings → Staff."
      />
    )
  }

  const isPrepToday = isPrepDay(asOf)
  const prepDay = upcomingPrepDay(asOf)
  const nextRestock = nextPrepDayAfter(asOf)

  const [bags, stock, session, plan, loggedToday] = await Promise.all([
    getTrackedBags({ siteId }),
    getLiveStock(siteId),
    isPrepToday ? getSessionForDate(siteId, asOf) : Promise.resolve(null),
    getPlan(siteId, prepDay.date),
    getUsageForDate(siteId, asOf),
  ])

  const expiry = summariseExpiry(bags)
  const useToday = bags.filter((bag) => bag.daysRemaining <= 2)
  const loggedBags = Array.from(loggedToday.values()).reduce((sum, value) => sum + value, 0)
  const belowPar = stock.filter((row) => row.par_level > 0 && row.usable_bags < row.par_level)

  const packed = session?.entries.filter((entry) => entry.vacuum_packed_at).length ?? 0
  const totalOnChecklist = session?.entries.length ?? 0

  const siteName = context.sites.find((site) => site.id === siteId)?.name ?? 'your kitchen'

  return (
    <>
      <PageHeader
        eyebrow={formatRelativeDay(asOf)}
        title={`Good day, ${context.profile.full_name.split(' ')[0]}`}
        description={`${siteName} · ${
          isPrepToday
            ? `${prepDay.type === 'tuesday' ? 'Tuesday' : 'Friday'} prep day, covering ${prepDay.coversDays} days`
            : `Next prep is ${formatRelativeDay(nextRestock.date)}`
        }`}
        actions={
          <>
            <LinkButton href="/usage" variant="secondary" size="lg" leadingIcon="clipboard-list">
              Log usage
            </LinkButton>
            {isPrepToday ? (
              <LinkButton href="/prep" size="lg" leadingIcon="chef-hat">
                {session ? 'Continue prep' : 'Start prep'}
              </LinkButton>
            ) : null}
          </>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* The one thing that matters                                         */}
      {/* ------------------------------------------------------------------ */}
      {isPrepToday ? (
        <Callout
          tone={session ? (packed === totalOnChecklist && totalOnChecklist > 0 ? 'success' : 'info') : 'warning'}
          title={
            !session
              ? 'Prep has not been started yet'
              : packed === totalOnChecklist && totalOnChecklist > 0
                ? 'Prep is done for today'
                : `Prep in progress — ${packed} of ${totalOnChecklist} sauces packed`
          }
          className="mb-6"
        >
          {!session
            ? `Today's batch needs to cover ${prepDay.coversDays} days${plan ? ` — ${plan.totalBags} bags planned.` : '.'} Start the session to clock in and load the checklist.`
            : packed === totalOnChecklist && totalOnChecklist > 0
              ? 'Everything on the checklist has been cooked, chilled and packed. Remember to finish the session so your hours are recorded.'
              : 'Work down the checklist: cook, blast chill for 1.5 hours, then vacuum pack.'}
        </Callout>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      <section aria-label="Snapshot" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Needs using today"
          value={expiry.today + expiry.expired}
          unit="bags"
          icon="alert-triangle"
          tone={expiry.today + expiry.expired > 0 ? 'danger' : 'success'}
          hint={expiry.expired > 0 ? `${expiry.expired} already past date` : 'Use before close'}
        />
        <StatCard
          label="1–2 days left"
          value={expiry.soon}
          unit="bags"
          icon="alert-circle"
          tone={expiry.soon > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          label="Logged today"
          value={loggedBags}
          unit="bags"
          icon="clipboard-list"
          tone="brand"
          hint={`${loggedToday.size} sauce${loggedToday.size === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Days to next prep"
          value={daysUntilNextPrep(asOf)}
          unit={daysUntilNextPrep(asOf) === 1 ? 'day' : 'days'}
          icon="chef-hat"
          tone="neutral"
          hint={formatShort(nextRestock.date)}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* ---------------------------------------------------------------- */}
        {/* Use it up                                                        */}
        {/* ---------------------------------------------------------------- */}
        <Card className="lg:col-span-2" padded={false}>
          <div className="border-b border-border p-5 sm:p-6">
            <CardHeader
              className="mb-0"
              eyebrow="Use it or lose it"
              title="What needs using today"
              description="Work from the top. These bags expire soonest."
              actions={
                <LinkButton href="/expiry" variant="ghost" size="sm" trailingIcon="arrow-right">
                  All stock
                </LinkButton>
              }
            />
          </div>

          {useToday.length === 0 ? (
            <EmptyState
              icon="check-circle"
              tone="success"
              title="Nothing expiring yet"
              description="Every bag in your fridge has 3 or more days of life left. Keep logging usage as you go."
              action={
                <LinkButton href="/usage" variant="secondary" leadingIcon="clipboard-list">
                  Log today&apos;s usage
                </LinkButton>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {useToday.slice(0, 12).map((bag) => (
                <li
                  key={bag.id}
                  className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-medium text-ink">{bag.sauceName}</p>
                      <BagSizeBadge size={bag.bagSize} />
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {bag.status === 'opened'
                        ? 'Opened — 2 day life'
                        : `Sealed on ${formatShort(bag.prepDate)}`}
                    </p>
                  </div>
                  <ExpiryBadge level={bag.level} label={bag.label} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Running low                                                      */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader
            eyebrow="Stock"
            title={
              belowPar.length === 0 ? 'Everything at par' : `${belowPar.length} below par level`
            }
            description={
              belowPar.length === 0
                ? 'Stock levels look healthy across the board.'
                : 'Flag these to your manager if they look wrong.'
            }
          />

          {belowPar.length === 0 ? (
            <EmptyState
              icon="check-circle"
              tone="success"
              size="sm"
              title="No gaps"
              description="Every sauce is at or above its target."
            />
          ) : (
            <ul className="space-y-3.5">
              {belowPar
                .sort((a, b) => a.usable_bags / a.par_level - b.usable_bags / b.par_level)
                .slice(0, 8)
                .map((row) => (
                  <li key={`${row.sauce_id}:${row.site_id}`}>
                    <ProgressBar
                      size="sm"
                      label={row.sauce_name}
                      valueLabel={`${row.usable_bags} / ${row.par_level}`}
                      value={row.usable_bags}
                      max={row.par_level}
                      tone={
                        row.usable_bags === 0
                          ? 'danger'
                          : row.usable_bags < row.par_level * 0.5
                            ? 'warning'
                            : 'success'
                      }
                    />
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Next prep preview                                                  */}
      {/* ------------------------------------------------------------------ */}
      {!isPrepToday && plan ? (
        <Card className="mt-6">
          <CardHeader
            eyebrow={`${prepDay.type === 'tuesday' ? 'Tuesday' : 'Friday'} · ${prepDay.coversDays}-day cover`}
            title={`Coming up: prep on ${formatShort(prepDay.date)}`}
            description={`${plan.totalBags} bags planned across ${plan.items.filter((item) => item.finalBags > 0).length} sauces. Prep runs 7–11am.`}
            actions={
              <LinkButton href="/prep" variant="secondary" size="sm" trailingIcon="arrow-right">
                See the checklist
              </LinkButton>
            }
          />
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plan.items
              .filter((item) => item.finalBags > 0)
              .slice(0, 9)
              .map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3.5 py-2.5"
                >
                  <span className="truncate text-sm font-medium text-ink">{item.sauceName}</span>
                  <Badge tone="neutral" size="sm">
                    {item.finalBags}
                  </Badge>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      {!isPrepToday && !plan ? (
        <Card className="mt-6">
          <EmptyState
            icon="calendar"
            size="sm"
            title={`No plan yet for ${formatShort(prepDay.date)}`}
            description="Your manager builds the forecast in the planner. It will show up here once it's ready."
          />
        </Card>
      ) : null}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-subtle">
        <Icon name="info" size={13} />
        Sealed bags last 5 days. Once opened, 2 days — never beyond the sealed date.
      </p>
    </>
  )
}
