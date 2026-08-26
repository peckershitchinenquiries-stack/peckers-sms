import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { requireManager, resolveSiteScope } from '@/lib/auth'
import { getLiveStock, getTrackedBags, summariseExpiry } from '@/lib/queries/stock'
import { buildForecast, getPrepVsPlan } from '@/lib/queries/planning'
import { getAlerts, getDailyUsageTotals, getTodayFlow } from '@/lib/queries/activity'
import { getWasteSummary } from '@/lib/queries/waste'
import { getGrossSales, latestSalesDate } from '@/lib/vitamojo/sales'
import {
  addDaysTo,
  daysUntilNextPrep,
  formatRelativeDay,
  formatShort,
  isPrepDay,
  lastPrepDayOnOrBefore,
  nextPrepDayAfter,
  today,
  upcomingPrepDay,
} from '@/lib/date'
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  LinkButton,
  ProgressBar,
  StatCard,
} from '@/components/ui'
import { ExpiryBadge } from '@/components/app/StatusPills'
import { formatMl } from '@/lib/utils/volume'
import { UsageSparkline } from './UsageSparkline'
import { DashboardAlerts } from './DashboardAlerts'

export const metadata: Metadata = { title: 'Dashboard' }

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { site?: string }
}) {
  const context = await requireManager()
  const siteId = resolveSiteScope(context, searchParams.site)
  const asOf = today()

  const sitesInScope = siteId
    ? context.sites.filter((site) => site.id === siteId)
    : context.sites

  const prepDay = upcomingPrepDay(asOf, context.prepWeekdays)
  const nextRestock = nextPrepDayAfter(asOf, context.prepWeekdays)
  const lastPrep = lastPrepDayOnOrBefore(asOf, context.prepWeekdays)

  // Vitamojo is scraped overnight after close, so the newest complete day of
  // gross sales is always yesterday's.
  const salesDate = latestSalesDate(asOf)

  const [stock, bags, alerts, usageTotals, comparison, sales, todayFlow, waste] =
    await Promise.all([
      getLiveStock(siteId),
      getTrackedBags({ siteId }),
      getAlerts({ siteId, limit: 5 }),
      getDailyUsageTotals(siteId, 14),
      getPrepVsPlan({ siteId, from: addDaysTo(asOf, -7), to: asOf }),
      getGrossSales(
        salesDate,
        context.allSites.map((site) => site.slug),
      ),
      // Prep and deliveries always belong to the kitchen that cooks, whatever
      // store the dashboard is scoped to.
      context.prepSite
        ? getTodayFlow({ prepSiteId: context.prepSite.id, date: asOf })
        : Promise.resolve(null),
      getWasteSummary({ siteId, from: addDaysTo(asOf, -27), to: asOf }),
    ])

  // Forecast the upcoming batch for every site in scope.
  const forecastSites = sitesInScope

  const forecasts = await Promise.all(
    forecastSites.map(async (site) => ({
      site,
      ...(await buildForecast({
        siteId: site.id,
        prepDate: prepDay.date,
        windowDays: context.settings.forecast_window_days,
        bufferMultiplier: Number(context.settings.forecast_buffer),
        bagSizesMl: context.settings.bag_sizes_ml,
      })),
    })),
  )

  const expiry = summariseExpiry(bags)
  const totalStockMl = stock.reduce((sum, row) => sum + row.usable_ml, 0)
  const belowPar = stock.filter((row) => row.par_level_ml > 0 && row.usable_ml < row.par_level_ml)
  const suggestedTotalMl = forecasts.reduce(
    (sum, entry) => sum + entry.forecasts.reduce((n, f) => n + f.suggestedMl, 0),
    0,
  )
  const lowStockSauces = forecasts.flatMap((entry) =>
    entry.forecasts
      .filter((forecast) => forecast.lowStock)
      .map((forecast) => ({ site: entry.site.name, forecast })),
  )

  const attention = bags.filter((bag) => bag.daysRemaining <= 2).slice(0, 8)

  const weekVarianceMl = comparison.reduce((sum, row) => sum + row.variance_ml, 0)

  // What is still sitting at the prep kitchen — the "how much is left at
  // Stevenage" question, which is about the kitchen specifically and so is
  // read from the unscoped stock rather than whatever site is selected.
  const leftAtPrepSiteMl = context.prepSite
    ? stock
        .filter((row) => row.site_id === context.prepSite!.id)
        .reduce((sum, row) => sum + row.usable_ml, 0)
    : 0

  const wasteTone = waste.todayMl > 0 ? 'warning' : waste.weekMl > 0 ? 'neutral' : 'success'

  return (
    <>
      <PageHeader
        eyebrow={formatRelativeDay(asOf)}
        title="Today at Peckers"
        description={
          siteId
            ? `${context.sites.find((site) => site.id === siteId)?.name} · next prep ${formatRelativeDay(nextRestock.date)}`
            : `Both kitchens · next prep ${formatRelativeDay(nextRestock.date)}, covering ${nextRestock.coversDays} days`
        }
        actions={
          <>
            <LinkButton href="/expiry" variant="secondary" size="md" leadingIcon="clock">
              Expiry tracker
            </LinkButton>
            <LinkButton href="/planner" size="md" leadingIcon="sparkles">
              Open the planner
            </LinkButton>
          </>
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Gross sales (scraped from Vitamojo overnight)                      */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-label="Gross sales"
        className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {sitesInScope.map((site) => {
          const amount = sales.get(site.slug)
          return (
            <StatCard
              key={site.id}
              label={`${site.name} · gross sales`}
              value={amount === undefined ? '—' : gbp.format(amount)}
              icon="trending-up"
              tone={amount === undefined ? 'neutral' : 'brand'}
              hint={
                amount === undefined
                  ? `No figures for ${formatShort(salesDate)} yet`
                  : formatRelativeDay(salesDate)
              }
            />
          )
        })}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Today's run — made here, sent there, left over, thrown away         */}
      {/* ------------------------------------------------------------------ */}
      <section
        aria-label="Today's prep and deliveries"
        className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          label="Prepped today"
          value={formatMl(todayFlow?.preparedMl ?? 0)}
          icon="chef-hat"
          tone={todayFlow && todayFlow.preparedMl > 0 ? 'brand' : 'neutral'}
          hint={
            todayFlow && todayFlow.preparedBags > 0
              ? `${todayFlow.preparedBags} bag${todayFlow.preparedBags === 1 ? '' : 's'} at ${context.prepSite?.name ?? 'the kitchen'}`
              : isPrepDay(asOf, context.prepWeekdays)
                ? 'Nothing made yet today'
                : `Not a prep day · next ${formatShort(nextRestock.date)}`
          }
        />

        {/* One card per restaurant the kitchen delivers to. */}
        {context.dispatchDestinations.length > 0
          ? context.dispatchDestinations.map((destination) => {
              const sent = todayFlow?.sent.find((entry) => entry.siteId === destination.id)
              return (
                <StatCard
                  key={destination.id}
                  label={`Sent to ${destination.name}`}
                  value={formatMl(sent?.ml ?? 0)}
                  icon="truck"
                  tone={sent ? 'brand' : 'neutral'}
                  hint={
                    sent
                      ? `${sent.bags} bag${sent.bags === 1 ? '' : 's'} today`
                      : 'Nothing sent today'
                  }
                />
              )
            })
          : null}

        {context.prepSite && (siteId === null || siteId === context.prepSite.id) ? (
          <StatCard
            label={`Left at ${context.prepSite.name}`}
            value={formatMl(leftAtPrepSiteMl)}
            icon="package"
            tone="neutral"
            hint="Still on the shelf right now"
          />
        ) : null}

        <StatCard
          label="Wasted today"
          value={formatMl(waste.todayMl)}
          icon="trash"
          tone={wasteTone}
          hint={
            waste.weekMl > 0
              ? `${formatMl(waste.weekMl)} over the last 7 days`
              : 'Nothing wasted this week'
          }
        />
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Snapshot                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Today's snapshot" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Volume in stock"
          value={formatMl(totalStockMl)}
          icon="package"
          tone="brand"
          hint={`${belowPar.length} sauce${belowPar.length === 1 ? '' : 's'} below par`}
        />
        <StatCard
          label="Expiring today"
          value={expiry.today + expiry.expired}
          unit="bags"
          icon="alert-triangle"
          tone={expiry.today + expiry.expired > 0 ? 'danger' : 'success'}
          hint={
            expiry.expired > 0
              ? `${expiry.expired} already past date`
              : expiry.today > 0
                ? 'Use before close'
                : 'Nothing overdue'
          }
        />
        <StatCard
          label="Expiring in 1–2 days"
          value={expiry.soon}
          unit="bags"
          icon="alert-circle"
          tone={expiry.soon > 0 ? 'warning' : 'neutral'}
          hint="Plan these into service"
        />
        <StatCard
          label="Next prep"
          value={daysUntilNextPrep(asOf, context.prepWeekdays)}
          unit={daysUntilNextPrep(asOf, context.prepWeekdays) === 1 ? 'day' : 'days'}
          icon="chef-hat"
          tone="neutral"
          hint={`${formatShort(nextRestock.date)} · ${nextRestock.coversDays}-day cover`}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* ---------------------------------------------------------------- */}
        {/* Forecast panel                                                   */}
        {/* ---------------------------------------------------------------- */}
        <Card className="xl:col-span-2">
          <CardHeader
            eyebrow={`Next batch · has to last ${prepDay.coversDays} days`}
            title={`Forecast for ${formatShort(prepDay.date)}`}
            description={`${formatMl(suggestedTotalMl)} suggested across ${forecastSites.length === 1 ? 'this kitchen' : 'both kitchens'}, based on a ${context.settings.forecast_window_days}-day rolling window.`}
            actions={
              <LinkButton href="/planner" variant="ghost" size="sm" trailingIcon="arrow-right">
                Plan it
              </LinkButton>
            }
          />

          {forecasts.every((entry) => entry.forecasts.length === 0) ? (
            <EmptyState
              icon="sparkles"
              title="Nothing to forecast"
              description="Add sauces in Settings and the engine will start suggesting quantities."
            />
          ) : (
            <div className="space-y-6">
              {forecasts.map((entry) => {
                const top = [...entry.forecasts]
                  .sort((a, b) => b.suggestedMl - a.suggestedMl)
                  .slice(0, 6)
                const peak = Math.max(...top.map((f) => f.suggestedMl), 1)
                const siteTotal = entry.forecasts.reduce((sum, f) => sum + f.suggestedMl, 0)

                return (
                  <div key={entry.site.id}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                        <Icon name="map-pin" size={14} className="text-ink-muted" />
                        {entry.site.name}
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {formatMl(siteTotal)}
                      </p>
                    </div>

                    <ul className="space-y-2.5">
                      {top.map((forecast) => (
                        <li key={forecast.sauceId}>
                          <ProgressBar
                            label={
                              <span className="inline-flex items-center gap-2">
                                {forecast.sauceName}
                                {forecast.lowStock ? (
                                  <Badge tone="danger" size="sm" icon="trending-down">
                                    low
                                  </Badge>
                                ) : null}
                                {forecast.reasoning.confidence === 'low' ? (
                                  <Badge tone="warning" size="sm" icon="info">
                                    par-based
                                  </Badge>
                                ) : null}
                              </span>
                            }
                            valueLabel={`${formatMl(forecast.suggestedMl)} · ${formatMl(forecast.usableStockMl)} in stock`}
                            value={forecast.suggestedMl}
                            max={peak}
                            tone={forecast.lowStock ? 'danger' : 'brand'}
                            size="sm"
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Alerts                                                           */}
        {/* ---------------------------------------------------------------- */}
        <DashboardAlerts alerts={alerts} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {/* ---------------------------------------------------------------- */}
        {/* Needs using                                                      */}
        {/* ---------------------------------------------------------------- */}
        <Card className="xl:col-span-2" padded={false}>
          <div className="border-b border-border p-5 sm:p-6">
            <CardHeader
              className="mb-0"
              eyebrow="Use it or lose it"
              title="Bags needing attention"
              description="Everything within two days of its expiry, soonest first."
              actions={
                <LinkButton href="/expiry" variant="ghost" size="sm" trailingIcon="arrow-right">
                  See all
                </LinkButton>
              }
            />
          </div>

          {attention.length === 0 ? (
            <EmptyState
              icon="check-circle"
              tone="success"
              size="sm"
              title="Nothing expiring soon"
              description="Every bag across every store has 3 or more days of life left."
            />
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((bag) => (
                <li key={bag.id} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{bag.sauceName}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-2xs text-ink-subtle">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="map-pin" size={11} />
                        {bag.siteName}
                      </span>
                      <span>·</span>
                      <span className="capitalize">{bag.status}</span>
                      <span>·</span>
                      {/* What's left, not what the bag holds — that's the
                          volume that becomes waste if nobody uses it. */}
                      <span>{formatMl(bag.remainingMl)} left</span>
                    </p>
                  </div>
                  <ExpiryBadge level={bag.level} label={bag.label} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* This week                                                        */}
        {/* ---------------------------------------------------------------- */}
        <Card>
          <CardHeader
            eyebrow="Last 7 days"
            title="Prep vs plan"
            description={
              comparison.length === 0
                ? 'No plans in the last week to compare against.'
                : weekVarianceMl === 0
                  ? 'Production matched the plan exactly.'
                  : weekVarianceMl > 0
                    ? `${formatMl(weekVarianceMl)} more were made than planned.`
                    : `${formatMl(Math.abs(weekVarianceMl))} fewer were made than planned.`
            }
          />

          {comparison.length === 0 ? (
            <EmptyState
              icon="scale"
              size="sm"
              title="Nothing to compare"
              description="Build a plan in the planner, then log the batch it produced."
            />
          ) : (
            <ul className="space-y-2.5">
              {[...comparison]
                .sort((a, b) => Math.abs(b.variance_ml) - Math.abs(a.variance_ml))
                .slice(0, 6)
                .map((row) => (
                  <li
                    key={`${row.plan_id}:${row.sauce_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{row.sauce_name}</p>
                      <p className="text-2xs text-ink-subtle">
                        {formatShort(row.prep_date)} · planned {formatMl(row.planned_ml)}, made{' '}
                        {formatMl(row.actual_ml)}
                      </p>
                    </div>
                    <Badge
                      size="sm"
                      tone={
                        row.variance_ml === 0
                          ? 'success'
                          : Math.abs(row.variance_ml) >= 500
                            ? 'danger'
                            : 'warning'
                      }
                      icon={
                        row.variance_ml === 0
                          ? 'check'
                          : row.variance_ml > 0
                            ? 'trending-up'
                            : 'trending-down'
                      }
                    >
                      {row.variance_ml > 0 ? `+${formatMl(row.variance_ml)}` : formatMl(row.variance_ml)}
                    </Badge>
                  </li>
                ))}
            </ul>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <p className="eyebrow mb-2">Last prep day</p>
            <p className="text-sm text-ink-muted">
              {formatShort(lastPrep.date)} · batch covering {lastPrep.coversDays} days
            </p>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Where the waste is                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-6">
        <CardHeader
          eyebrow="Last 28 days"
          title="Wastage by sauce"
          description={
            waste.totalMl === 0
              ? 'Nothing has been binned or written off in the last four weeks.'
              : `${formatMl(waste.totalMl)} thrown away — the volume left in each bag when it went, not the size of the bag.`
          }
          actions={
            <LinkButton href="/waste" variant="ghost" size="sm" trailingIcon="arrow-right">
              Full report
            </LinkButton>
          }
        />

        {waste.bySauce.length === 0 ? (
          <EmptyState
            icon="check"
            size="sm"
            title="No waste recorded"
            description="Every batch has been used within its shelf life."
          />
        ) : (
          <ul className="space-y-2.5">
            {waste.bySauce.slice(0, 6).map((sauce, index) => (
              <li key={sauce.sauceId}>
                <ProgressBar
                  label={
                    <span className="inline-flex items-center gap-2">
                      {sauce.sauceName}
                      {sauce.expiredMl === sauce.ml ? (
                        <Badge tone="warning" size="sm" icon="clock">
                          out of date
                        </Badge>
                      ) : null}
                    </span>
                  }
                  valueLabel={`${formatMl(sauce.ml)} · ${sauce.entries} bag${sauce.entries === 1 ? '' : 's'}`}
                  value={sauce.ml}
                  max={Math.max(...waste.bySauce.map((row) => row.ml), 1)}
                  tone={index === 0 ? 'danger' : 'warning'}
                  size="sm"
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Usage trend                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card className="mt-6">
        <CardHeader
          eyebrow="Last 14 days"
          title="Bags opened per day"
          description="The demand curve the forecast is built on. Taller bars are the weekday spikes the engine weights for."
          actions={
            <LinkButton href="/usage" variant="ghost" size="sm" trailingIcon="arrow-right">
              Log usage
            </LinkButton>
          }
        />
        <UsageSparkline data={usageTotals} prepWeekdays={context.prepWeekdays} />
      </Card>

      {lowStockSauces.length > 0 ? (
        <Card className="mt-6">
          <CardHeader
            eyebrow="Stock-out risk"
            title={`${lowStockSauces.length} sauce${lowStockSauces.length === 1 ? '' : 's'} won't reach the next prep`}
            description="Based on current stock against the measured burn rate."
            actions={
              <LinkButton href="/alerts" variant="ghost" size="sm" trailingIcon="arrow-right">
                Alerts centre
              </LinkButton>
            }
          />
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {lowStockSauces.slice(0, 9).map(({ site, forecast }) => (
              <li
                key={`${site}:${forecast.sauceId}`}
                className="rounded-lg border border-danger/25 bg-danger-soft p-3.5"
              >
                <p className="text-sm font-semibold text-danger-on-soft">{forecast.sauceName}</p>
                <p className="mt-1 text-xs text-danger-on-soft/85">
                  {site} · {formatMl(forecast.usableStockMl)} left, using{' '}
                  {formatMl(forecast.reasoning.burnRatePerDay)}/day
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  )
}
