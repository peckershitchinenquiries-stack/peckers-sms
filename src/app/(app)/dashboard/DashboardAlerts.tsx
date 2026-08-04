'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  LinkButton,
  useToast,
  type IconName,
} from '@/components/ui'
import { resolveAlert, scanForAlerts } from '@/lib/actions/alerts'
import { motion as motionTokens } from '@/lib/design/tokens'
import type { AlertView } from '@/lib/queries/activity'
import type { AlertType } from '@/lib/types/database'

const typeIcon: Record<AlertType, IconName> = {
  expiry: 'clock',
  low_stock: 'trending-down',
  pattern: 'activity',
}

/** Compact alerts panel for the dashboard — the full centre lives at /alerts. */
export function DashboardAlerts({ alerts }: { alerts: AlertView[] }) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()

  return (
    <Card>
      <CardHeader
        eyebrow="Alerts centre"
        title={
          alerts.length === 0
            ? 'All clear'
            : `${alerts.length} open alert${alerts.length === 1 ? '' : 's'}`
        }
        description={
          alerts.length === 0
            ? undefined
            : 'Expiry, stock-out risk and repeating patterns.'
        }
        actions={
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            leadingIcon="refresh-cw"
            aria-label="Run alert scan"
            loading={busy}
            onClick={() =>
              startTransition(async () => {
                const result = await scanForAlerts()
                toast(
                  result.ok
                    ? {
                        tone: result.data?.created ? 'warning' : 'success',
                        title: result.data?.created
                          ? `${result.data.created} new alert${result.data.created === 1 ? '' : 's'}`
                          : 'Nothing new to flag',
                      }
                    : { tone: 'danger', title: 'Scan failed', description: result.error },
                )
                router.refresh()
              })
            }
          />
        }
      />

      {alerts.length === 0 ? (
        <EmptyState
          icon="shield-check"
          tone="success"
          size="sm"
          title="Nothing needs attention"
          description="No stock-out risks and nothing expiring in the next two days."
        />
      ) : (
        <>
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {alerts.map((alert) => (
                <motion.li
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: motionTokens.duration.base, ease: motionTokens.ease.out }}
                  className={`rounded-lg border p-3.5 ${
                    alert.severity === 'critical'
                      ? 'border-danger/25 bg-danger-soft'
                      : alert.severity === 'warning'
                        ? 'border-warning/25 bg-warning-soft'
                        : 'border-border bg-surface-sunken'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon
                      name={typeIcon[alert.type]}
                      size={15}
                      className={
                        alert.severity === 'critical'
                          ? 'mt-0.5 text-danger'
                          : alert.severity === 'warning'
                            ? 'mt-0.5 text-warning'
                            : 'mt-0.5 text-ink-muted'
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-ink">{alert.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                        {alert.message}
                      </p>
                      {alert.suggested_actions.length > 0 ? (
                        <p className="mt-2 flex flex-wrap gap-1.5">
                          {alert.suggested_actions.slice(0, 2).map((action) => (
                            <Badge key={action.key} tone="neutral" size="sm">
                              {action.label}
                            </Badge>
                          ))}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      leadingIcon="check"
                      aria-label={`Resolve: ${alert.title}`}
                      loading={busy}
                      onClick={() =>
                        startTransition(async () => {
                          await resolveAlert(alert.id)
                          router.refresh()
                        })
                      }
                    />
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          <LinkButton
            href="/alerts"
            variant="secondary"
            size="md"
            fullWidth
            className="mt-4"
            trailingIcon="arrow-right"
          >
            Open the alerts centre
          </LinkButton>
        </>
      )}
    </Card>
  )
}
