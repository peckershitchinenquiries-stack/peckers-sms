import type { Metadata } from 'next'
import { PageHeader } from '@/components/app/PageHeader'
import { requireManager, resolveSiteScope } from '@/lib/auth'
import { getLiveStock, getTrackedBags, summariseExpiry } from '@/lib/queries/stock'
import { buildForecast, getPrepVsPlan } from '@/lib/queries/planning'
import { getAlerts, getDailyUsageTotals } from '@/lib/queries/activity'
import {
  addDaysTo,
  daysUntilNextPrep,
  formatRelativeDay,
  formatShort,
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
import { UsageSparkline } from './UsageSparkline'
import { DashboardAlerts } from './DashboardAlerts'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { site?: string }
}) {
  const context = await requireManager()
  const siteId = resolveSiteScope(context, searchParams.site)
  const asOf = today()

  const prepDay = upcomingPrepDay(asOf)
  const nextRestock = nextPrepDayAfter(asOf)
  const lastPrep = lastPrepDayOnOrBefore(asOf)

  const [stock, bags, alerts, usageTotals, comparison] = await Promise.all([
    getLiveStock(siteId),
    getTrackedBags({ siteId }),
    getAlerts({ siteId, limit: 5 }),
    getDailyUsageTotals(siteId, 14),
    getPrepVsPlan({ siteId, from: addDaysTo(asOf, -7), to: asOf }),
  ])

  // Forecast the upcoming batch for every site in scope.
  const forecastSites = siteId
    ? context.sites.filter((site) => site.id === siteId)
    : context.sites

  const forecasts = await Promise.all(
    forecastSites.map(async (site) => ({
      site,
      ...(await buildForecast({
        siteId: site.id,
        prepDate: prepDay.date,
        windowDays: context.settings.forecast_window_days,
        bufferMultiplier: Number(context.settings.forecast_buffer),
      })),
    })),
  )

  const expiry = summariseExpiry(bags)
  const totalStock = stock.reduce((sum, row) => sum + row.usable_bags, 0)
  const belowPar = stock.filter((row) => row.par_level > 0 && row.usable_bags < row.par_level)
  const suggestedTotal = forecasts.reduce(
    (sum, entry) => sum + entry.forecasts.reduce((n, f) => n + f.suggestedBags, 0),
    0,
  )
  const lowStockSauces = forecasts.flatMap((entry) =>
    entry.forecasts
      .filter((forecast) => forecast.lowStock)
      .map((forecast) => ({ site: entry.site.name, forecast })),
  )

  const attention = bags.filter((bag) => bag.daysRemaining <= 2).slice(0, 8)

  const weekVariance = comparison.reduce((sum, row) => sum + row.variance, 0)

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
      {/* Snapshot                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Today's snapshot" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Bags in stock"
          value={totalStock}
          unit="bags"
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
          value={daysUntilNextPrep(asOf)}
          unit={daysUntilNextPrep(asOf) === 1 ? 'day' : 'days'}
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
            eyebrow={`${prepDay.type === 'tuesday' ? 'Tuesday' : 'Friday'} batch · ${prepDay.coversDays}-day cover`}
            title={`Forecast for ${formatShort(prepDay.date)}`}
            description={`${suggestedTotal} bags suggested across ${forecastSites.length === 1 ? 'this kitchen' : 'both kitchens'}, based on a ${context.settings.forecast_window_days}-day rolling window.`}
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
                  .sort((a, b) => b.suggestedBags - a.suggestedBags)
                  .slice(0, 6)
                const peak = Math.max(...top.map((f) => f.suggestedBags), 1)
                const siteTotal = entry.forecasts.reduce((sum, f) => sum + f.suggestedBags, 0)

                return (
                  <div key={entry.site.id}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                        <Icon name="map-pin" size={14} className="text-ink-muted" />
                        {entry.site.name}
                      </p>
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        {siteTotal} bags
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
                            valueLabel={`${forecast.suggestedBags} bags · ${forecast.usableStock} in stock`}
                            value={forecast.suggestedBags}
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
              description="Every bag at both sites has 3 or more days of life left."
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
                      <span>{bag.bagSize}</span>
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
                : weekVariance === 0
                  ? 'Production matched the plan exactly.'
                  : weekVariance > 0
                    ? `${weekVariance} bags more were made than planned.`
                    : `${Math.abs(weekVariance)} bags fewer were made than planned.`
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
                .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
                .slice(0, 6)
                .map((row) => (
                  <li
                    key={`${row.plan_id}:${row.sauce_id}`}
                    className="flex items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{row.sauce_name}</p>
                      <p className="text-2xs text-ink-subtle">
                        {formatShort(row.prep_date)} · planned {row.planned_bags}, made{' '}
                        {row.actual_bags}
                      </p>
                    </div>
                    <Badge
                      size="sm"
                      tone={
                        row.variance === 0
                          ? 'success'
                          : Math.abs(row.variance) >= 5
                            ? 'danger'
                            : 'warning'
                      }
                      icon={
                        row.variance === 0
                          ? 'check'
                          : row.variance > 0
                            ? 'trending-up'
                            : 'trending-down'
                      }
                    >
                      {row.variance > 0 ? `+${row.variance}` : row.variance}
                    </Badge>
                  </li>
                ))}
            </ul>
          )}

          <div className="mt-5 border-t border-border pt-5">
            <p className="eyebrow mb-2">Last prep day</p>
            <p className="text-sm text-ink-muted">
              {formatShort(lastPrep.date)} · {lastPrep.type === 'tuesday' ? 'Tuesday' : 'Friday'}{' '}
              batch covering {lastPrep.coversDays} days
            </p>
          </div>
        </Card>
      </div>

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
        <UsageSparkline data={usageTotals} />
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
                  {site} · {forecast.usableStock} left, using{' '}
                  {forecast.reasoning.burnRatePerDay}/day
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  )
}
