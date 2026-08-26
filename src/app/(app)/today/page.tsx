import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { requireSession } from '@/lib/auth'
import { getLiveStock, getTrackedBags, summariseExpiry } from '@/lib/queries/stock'
import { getPrepBoard } from '@/lib/queries/planning'
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
import { formatMl } from '@/lib/utils/volume'

export const metadata: Metadata = { title: 'Today' }

/** "Hitchin", "Hitchin and Letchworth", "Hitchin, Letchworth and Baldock". */
function listSiteNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The kitchen's home screen. One question it must answer instantly:
 * "what do I do right now?"
 *
 * That answer differs by restaurant: the prep kitchen may have a batch to
 * make, while a receiving restaurant only ever logs what it used.
 */
export default async function TodayPage() {
  const context = await requireSession()
  const siteId = context.profile.site_id ?? context.sites[0]?.id ?? null
  const asOf = today()

  if (!siteId) {
    return (
      <EmptyState
        icon="map-pin"
        title="No restaurant assigned"
        description="Your account isn't linked to a restaurant yet. Ask your manager to set this up in Settings → Staff."
      />
    )
  }

  const isPrepToday = context.canPrep && isPrepDay(asOf, context.prepWeekdays)
  const prepDay = upcomingPrepDay(asOf, context.prepWeekdays)
  const nextRestock = nextPrepDayAfter(asOf, context.prepWeekdays)

  const [bags, stock, loggedToday, prepBoard] = await Promise.all([
    getTrackedBags({ siteId }),
    getLiveStock(siteId),
    getUsageForDate(siteId, asOf),
    context.canPrep && context.prepSite
      ? getPrepBoard({
          siteId: context.prepSite.id,
          prepDate: prepDay.date,
          coversDays: prepDay.coversDays,
          bagSizesMl: context.settings.bag_sizes_ml,
        })
      : Promise.resolve(null),
  ])

  const expiry = summariseExpiry(bags)
  const useToday = bags.filter((bag) => bag.daysRemaining <= 2)
  const loggedMl = Array.from(loggedToday.values()).reduce((sum, value) => sum + value, 0)
  const belowPar = stock.filter((row) => row.par_level_ml > 0 && row.usable_ml < row.par_level_ml)

  const siteName = context.sites.find((site) => site.id === siteId)?.name ?? 'your restaurant'
  const daysToRestock = daysUntilNextPrep(asOf, context.prepWeekdays)

  const done = prepBoard?.completedCount ?? 0
  const total = prepBoard?.lines.length ?? 0
  const prepFinished = total > 0 && done === total

  return (
    <>
      <PageHeader
        eyebrow={formatRelativeDay(asOf)}
        title={`Good day, ${context.profile.full_name.split(' ')[0]}`}
        description={`${siteName} · ${
          isPrepToday
            ? `prep day — this batch has to last ${prepDay.coversDays} days`
            : `${context.canPrep ? 'Next prep' : 'Next delivery'} ${formatRelativeDay(nextRestock.date)}`
        }`}
        actions={
          <>
            <LinkButton
              href="/usage"
              variant={isPrepToday ? 'secondary' : 'primary'}
              size="lg"
              leadingIcon="clipboard-list"
            >
              Log usage
            </LinkButton>
            {isPrepToday ? (
              <LinkButton href="/prep" size="lg" leadingIcon="chef-hat">
                {done > 0 ? 'Continue prep' : 'Start prep'}
              </LinkButton>
            ) : null}
          </>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* The one thing that matters                                         */}
      {/* ------------------------------------------------------------------ */}
      {isPrepToday && prepBoard ? (
        <Callout
          tone={prepFinished ? 'success' : total === 0 ? 'warning' : 'info'}
          title={
            total === 0
              ? 'No plan for today yet'
              : prepFinished
                ? 'Everything has been made'
                : `${done} of ${total} sauces made`
          }
          className="mb-6"
        >
          {total === 0
            ? 'Your manager builds the quantities in the planner. You can still record anything you make on the prep screen.'
            : prepFinished
              ? context.dispatchDestinations.length > 0
                ? `Don't forget to send ${listSiteNames(context.dispatchDestinations.map((site) => site.name))} their share, and to finish your shift so your hours are recorded.`
                : 'Finish your shift so your hours are recorded.'
              : `${formatMl(prepBoard.totalPlannedMl - prepBoard.totalMadeMl)} still to make. Record each one as you finish it.`}
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
          value={formatMl(loggedMl)}
          icon="clipboard-list"
          tone="brand"
          hint={`${loggedToday.size} sauce${loggedToday.size === 1 ? '' : 's'}`}
        />
        <StatCard
          label={context.canPrep ? 'Days to next prep' : 'Days to next delivery'}
          value={daysToRestock}
          unit={daysToRestock === 1 ? 'day' : 'days'}
          icon={context.canPrep ? 'chef-hat' : 'truck'}
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
                      <BagSizeBadge sizeMl={bag.sizeMl} />
                    </div>
                    <p className="mt-1 text-xs text-ink-muted">
                      {bag.status === 'opened'
                        ? `Opened · ${formatMl(bag.remainingMl)} left`
                        : `Made on ${formatShort(bag.prepDate)}`}
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
            title={belowPar.length === 0 ? 'Everything topped up' : `${belowPar.length} running low`}
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
              description="Every sauce is at or above its minimum."
            />
          ) : (
            <ul className="space-y-3.5">
              {belowPar
                .sort((a, b) => a.usable_ml / a.par_level_ml - b.usable_ml / b.par_level_ml)
                .slice(0, 8)
                .map((row) => (
                  <li key={`${row.sauce_id}:${row.site_id}`}>
                    <ProgressBar
                      size="sm"
                      label={row.sauce_name}
                      valueLabel={`${formatMl(row.usable_ml)} / ${formatMl(row.par_level_ml)}`}
                      value={row.usable_ml}
                      max={row.par_level_ml}
                      tone={
                        row.usable_ml === 0
                          ? 'danger'
                          : row.usable_ml < row.par_level_ml * 0.5
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

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-ink-subtle">
        <Icon name="info" size={13} />
        Each sauce has its own shelf life — opening a bag never extends it beyond the sealed date.
      </p>
    </>
  )
}
