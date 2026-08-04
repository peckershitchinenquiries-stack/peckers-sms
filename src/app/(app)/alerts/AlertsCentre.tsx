'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Modal,
  SegmentedControl,
  StatCard,
  Stepper,
  Select,
  Tabs,
  useToast,
  type IconName,
} from '@/components/ui'
import { resolveAlert, resolveAllAlerts, scanForAlerts } from '@/lib/actions/alerts'
import { transferBags } from '@/lib/actions/batches'
import { formatInstant } from '@/lib/date'
import { motion as motionTokens } from '@/lib/design/tokens'
import type { AlertView } from '@/lib/queries/activity'
import type { AlertSeverity, AlertType, Site } from '@/lib/types/database'

const typeConfig: Record<AlertType, { label: string; icon: IconName }> = {
  expiry: { label: 'Expiry', icon: 'clock' },
  low_stock: { label: 'Low stock', icon: 'trending-down' },
  pattern: { label: 'Pattern', icon: 'activity' },
}

const severityConfig: Record<
  AlertSeverity,
  { tone: 'danger' | 'warning' | 'brand'; label: string }
> = {
  critical: { tone: 'danger', label: 'Critical' },
  warning: { tone: 'warning', label: 'Warning' },
  info: { tone: 'brand', label: 'Insight' },
}

export interface AlertsCentreProps {
  open: AlertView[]
  history: AlertView[]
  sites: Site[]
  siteId: string | null
  isManager: boolean
}

export function AlertsCentre({ open, history, sites, siteId, isManager }: AlertsCentreProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [tab, setTab] = React.useState<'open' | 'resolved'>('open')
  const [typeFilter, setTypeFilter] = React.useState<'all' | AlertType>('all')
  const [busy, startTransition] = React.useTransition()
  const [transferFor, setTransferFor] = React.useState<AlertView | null>(null)

  const filtered = React.useMemo(() => {
    const rows = tab === 'open' ? open : history
    return typeFilter === 'all' ? rows : rows.filter((alert) => alert.type === typeFilter)
  }, [tab, typeFilter, open, history])

  const counts = React.useMemo(
    () => ({
      critical: open.filter((alert) => alert.severity === 'critical').length,
      warning: open.filter((alert) => alert.severity === 'warning').length,
      info: open.filter((alert) => alert.severity === 'info').length,
    }),
    [open],
  )

  const runScan = () => {
    startTransition(async () => {
      const result = await scanForAlerts()
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Scan failed', description: result.error })
        return
      }
      toast({
        tone: result.data?.created ? 'warning' : 'success',
        title: result.data?.created
          ? `${result.data.created} new alert${result.data.created === 1 ? '' : 's'}`
          : 'Nothing new to flag',
        description: result.data?.skipped
          ? `${result.data.skipped} already raised today.`
          : 'Stock and expiry both look healthy.',
      })
      router.refresh()
    })
  }

  const dismiss = (alert: AlertView) => {
    startTransition(async () => {
      const result = await resolveAlert(alert.id)
      if (result.ok) {
        toast({ tone: 'success', title: 'Alert resolved' })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not resolve', description: result.error })
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Critical"
          value={counts.critical}
          icon="alert-triangle"
          tone={counts.critical > 0 ? 'danger' : 'success'}
          hint="Act today"
        />
        <StatCard
          label="Warnings"
          value={counts.warning}
          icon="alert-circle"
          tone={counts.warning > 0 ? 'warning' : 'neutral'}
          hint="Plan around these"
        />
        <StatCard label="Insights" value={counts.info} icon="activity" tone="brand" hint="Patterns worth knowing" />
        <StatCard label="Resolved" value={history.length} icon="check-circle" tone="neutral" hint="Recently cleared" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          aria-label="Alert status"
          value={tab}
          onChange={(value) => setTab(value as 'open' | 'resolved')}
          items={[
            { value: 'open', label: 'Open', icon: 'bell', count: open.length },
            { value: 'resolved', label: 'Resolved', icon: 'check-circle', count: history.length },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <SegmentedControl
            aria-label="Filter by type"
            size="sm"
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as 'all' | AlertType)}
            options={[
              { value: 'all', label: 'All' },
              { value: 'expiry', label: 'Expiry', icon: 'clock' },
              { value: 'low_stock', label: 'Stock', icon: 'trending-down' },
              { value: 'pattern', label: 'Patterns', icon: 'activity' },
            ]}
          />
          {isManager ? (
            <>
              <Button variant="secondary" size="md" leadingIcon="refresh-cw" loading={busy} onClick={runScan}>
                Run scan
              </Button>
              {tab === 'open' && open.length > 0 ? (
                <Button
                  variant="ghost"
                  size="md"
                  leadingIcon="check"
                  loading={busy}
                  onClick={() =>
                    startTransition(async () => {
                      await resolveAllAlerts(siteId)
                      toast({ tone: 'success', title: 'All alerts cleared' })
                      router.refresh()
                    })
                  }
                >
                  Clear all
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={tab === 'open' ? 'check-circle' : 'history'}
            tone={tab === 'open' ? 'success' : 'neutral'}
            title={tab === 'open' ? 'Nothing needs your attention' : 'No resolved alerts yet'}
            description={
              tab === 'open'
                ? 'No stock-out risks, nothing expiring in the next two days, and no unusual patterns.'
                : 'Alerts you resolve will be kept here for reference.'
            }
            action={
              isManager && tab === 'open' ? (
                <Button variant="secondary" leadingIcon="refresh-cw" loading={busy} onClick={runScan}>
                  Run a scan now
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {filtered.map((alert, index) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                index={index}
                busy={busy}
                canAct={isManager}
                onDismiss={() => dismiss(alert)}
                onTransfer={() => setTransferFor(alert)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <TransferModal
        alert={transferFor}
        sites={sites}
        onClose={() => setTransferFor(null)}
        onDone={() => {
          setTransferFor(null)
          router.refresh()
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function AlertCard({
  alert,
  index,
  busy,
  canAct,
  onDismiss,
  onTransfer,
}: {
  alert: AlertView
  index: number
  busy: boolean
  canAct: boolean
  onDismiss: () => void
  onTransfer: () => void
}) {
  const severity = severityConfig[alert.severity]
  const type = typeConfig[alert.type]

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{
        delay: Math.min(index * 0.03, 0.24),
        duration: motionTokens.duration.slow,
        ease: motionTokens.ease.out,
      }}
    >
      <Card
        className={
          alert.severity === 'critical'
            ? 'border-danger/30'
            : alert.severity === 'warning'
              ? 'border-warning/30'
              : undefined
        }
      >
        <div className="flex gap-4">
          <span
            aria-hidden="true"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
              alert.severity === 'critical'
                ? 'bg-danger-soft text-danger'
                : alert.severity === 'warning'
                  ? 'bg-warning-soft text-warning'
                  : 'bg-brand-soft text-brand'
            }`}
          >
            <Icon name={type.icon} size={19} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-ink">{alert.title}</h3>
              <Badge tone={severity.tone} size="sm">
                {severity.label}
              </Badge>
              <Badge tone="neutral" size="sm">
                {type.label}
              </Badge>
              {alert.resolved ? (
                <Badge tone="success" size="sm" icon="check">
                  Resolved
                </Badge>
              ) : null}
            </div>

            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{alert.message}</p>

            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-subtle">
              {alert.siteName ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="map-pin" size={11} />
                  {alert.siteName}
                </span>
              ) : null}
              <span>{formatInstant(alert.created_at, 'd MMM, HH:mm')}</span>
            </p>

            {!alert.resolved && alert.suggested_actions.length > 0 ? (
              <div className="mt-4">
                <p className="eyebrow mb-2">Suggested actions</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {alert.suggested_actions.map((action) => (
                    <div
                      key={action.key}
                      className="rounded-lg border border-border bg-surface-sunken p-3"
                    >
                      <p className="text-sm font-medium text-ink">{action.label}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                        {action.description}
                      </p>
                      {action.key === 'pull_from_other_site' && canAct ? (
                        <Button
                          variant="soft"
                          size="sm"
                          className="mt-2.5"
                          leadingIcon="arrow-left-right"
                          onClick={onTransfer}
                        >
                          Move stock
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {!alert.resolved ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              leadingIcon="check"
              aria-label="Resolve alert"
              loading={busy}
              onClick={onDismiss}
            />
          ) : null}
        </div>
      </Card>
    </motion.li>
  )
}

/* -------------------------------------------------------------------------- */

function TransferModal({
  alert,
  sites,
  onClose,
  onDone,
}: {
  alert: AlertView | null
  sites: Site[]
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()
  const [quantity, setQuantity] = React.useState(4)
  const [fromSiteId, setFromSiteId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!alert) return
    const other = sites.find((site) => site.id !== alert.site_id)
    setFromSiteId(other?.id ?? null)
    setQuantity(Math.max(1, Number(alert.metadata?.shortfall ?? 4)))
  }, [alert, sites])

  const toSite = sites.find((site) => site.id === alert?.site_id)

  return (
    <Modal
      open={Boolean(alert)}
      onClose={onClose}
      title="Move stock between sites"
      description={
        toSite ? `Sealed bags will be transferred into ${toSite.name}.` : 'Choose where to move from.'
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={!fromSiteId || !alert?.sauce_id || !alert?.site_id}
            onClick={() => {
              if (!alert?.sauce_id || !alert.site_id || !fromSiteId) return
              startTransition(async () => {
                const result = await transferBags({
                  sauceId: alert.sauce_id!,
                  fromSiteId,
                  toSiteId: alert.site_id!,
                  quantity,
                })
                if (result.ok) {
                  toast({
                    tone: 'success',
                    title: `${result.data?.moved} bags moved`,
                    description: `Now showing in ${toSite?.name ?? 'the receiving site'}.`,
                  })
                  onDone()
                } else {
                  toast({ tone: 'danger', title: 'Could not move stock', description: result.error })
                }
              })
            }}
          >
            Move {quantity} bags
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Select
          label="Take from"
          value={fromSiteId}
          onChange={setFromSiteId}
          options={sites
            .filter((site) => site.id !== alert?.site_id)
            .map((site) => ({ value: site.id, label: site.name, icon: 'map-pin' as const }))}
        />
        <Stepper
          label="Bags to move"
          value={quantity}
          onChange={setQuantity}
          min={1}
          max={100}
          unit="bags"
          hint="Only sealed bags can be moved, freshest first."
        />
      </div>
    </Modal>
  )
}
