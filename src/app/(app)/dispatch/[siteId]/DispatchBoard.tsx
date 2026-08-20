'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  Stepper,
  Table,
  useToast,
} from '@/components/ui'
import { sendAllStock, sendStock } from '@/lib/actions/dispatch'
import { formatInstant, formatRelativeDay } from '@/lib/date'
import { motion as motionTokens } from '@/lib/design/tokens'
import { formatMl } from '@/lib/utils/volume'
import type { DispatchBoard as DispatchBoardData, TransferEntry } from '@/lib/queries/dispatch'

export interface DispatchBoardProps {
  board: DispatchBoardData
  fromSiteName: string
  destination: { id: string; name: string }
  transfers: TransferEntry[]
}

export function DispatchBoard({
  board,
  fromSiteName,
  destination,
  transfers,
}: DispatchBoardProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [busy, startTransition] = React.useTransition()
  const [pending, setPending] = React.useState<string | null>(null)
  const [amounts, setAmounts] = React.useState<Record<string, number>>({})

  const outstanding = board.lines.filter((line) => line.remainingMl > 0)

  const amountFor = (sauceId: string, fallback: number) => amounts[sauceId] ?? fallback

  const sendOne = (sauceId: string, sauceName: string, ml: number) => {
    setPending(sauceId)
    startTransition(async () => {
      const result = await sendStock({ sauceId, toSiteId: destination.id, ml })
      setPending(null)

      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not send', description: result.error })
        return
      }

      const { moved_ml, moved_bags, shortfall_ml } = result.data!
      toast({
        tone: shortfall_ml > 0 ? 'warning' : 'success',
        title: `${sauceName} sent to ${destination.name}`,
        description:
          shortfall_ml > 0
            ? `Only ${formatMl(moved_ml)} was available — ${formatMl(shortfall_ml)} short. Make more or send it next run.`
            : `${formatMl(moved_ml)} in ${moved_bags} bag${moved_bags === 1 ? '' : 's'}.`,
      })
      setAmounts((current) => ({ ...current, [sauceId]: 0 }))
      router.refresh()
    })
  }

  const sendEverything = () => {
    startTransition(async () => {
      const result = await sendAllStock({
        toSiteId: destination.id,
        lines: outstanding.map((line) => ({
          sauceId: line.sauceId,
          ml: amountFor(line.sauceId, line.remainingMl),
        })),
      })

      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not send the delivery', description: result.error })
        return
      }

      const { sauces, movedMl, shortfalls } = result.data!
      toast({
        tone: shortfalls > 0 ? 'warning' : 'success',
        title: `${formatMl(movedMl)} sent to ${destination.name}`,
        description:
          shortfalls > 0
            ? `${sauces} sauces sent, but ${shortfalls} came up short of what was needed.`
            : `${sauces} sauce${sauces === 1 ? '' : 's'} moved across.`,
      })
      setAmounts({})
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* The run                                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral" icon="calendar">
                {formatRelativeDay(board.date)}
              </Badge>
              {board.totalSentMl > 0 ? (
                <Badge tone="success" icon="check-circle">
                  {formatMl(board.totalSentMl)} already sent
                </Badge>
              ) : null}
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums text-ink">
              {formatMl(board.totalRemainingMl)}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
              still to go across to {destination.name}
              {outstanding.length > 0
                ? ` · ${outstanding.length} sauce${outstanding.length === 1 ? '' : 's'}`
                : ''}
            </p>
          </div>

          {outstanding.length > 0 ? (
            <Button size="xl" leadingIcon="truck" loading={busy && !pending} onClick={sendEverything}>
              Send everything
            </Button>
          ) : null}
        </div>
      </Card>

      {board.complete ? (
        <Callout tone="success" title={`${destination.name} has everything`}>
          The whole delivery has been recorded. Their stock and expiry dates are already updated.
        </Callout>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Per sauce                                                          */}
      {/* ------------------------------------------------------------------ */}
      {board.lines.length === 0 ? (
        <Card>
          <EmptyState
            icon="truck"
            title="Nothing to send"
            description={`Once a plan exists for the prep day and the sauce has been made at ${fromSiteName}, it will be listed here with the amount ${destination.name} needs.`}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {board.lines.map((line, index) => {
            const settled = line.remainingMl === 0
            const value = amountFor(line.sauceId, line.remainingMl)

            return (
              <motion.li
                key={line.sauceId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: Math.min(index * 0.03, 0.25),
                  duration: motionTokens.duration.slow,
                  ease: motionTokens.ease.out,
                }}
              >
                <Card
                  padded={false}
                  className={settled && line.sentMl > 0 ? 'border-success/35 bg-success-soft/25' : undefined}
                >
                  <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{line.sauceName}</span>
                        {line.sentMl > 0 ? (
                          <Badge tone="success" size="sm" icon="check">
                            {formatMl(line.sentMl)} sent
                          </Badge>
                        ) : null}
                        {line.neededMl > 0 && line.availableMl < line.remainingMl ? (
                          <Badge tone="warning" size="sm" icon="alert-circle">
                            not enough made
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm text-ink-muted">
                        {destination.name} needs {formatMl(line.neededMl)} ·{' '}
                        {formatMl(line.availableMl)} sealed at {fromSiteName}
                      </p>
                    </div>

                    {settled ? (
                      <Badge tone="neutral" size="md" dot>
                        {line.sentMl > 0 ? 'Delivered' : 'Nothing to send'}
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-2.5 sm:shrink-0">
                        <Stepper
                          value={value}
                          onChange={(next) =>
                            setAmounts((current) => ({ ...current, [line.sauceId]: next }))
                          }
                          min={0}
                          max={Math.max(line.availableMl, 1)}
                          step={100}
                          unit="ml"
                        />
                        <Button
                          size="lg"
                          leadingIcon="truck"
                          disabled={value < 1}
                          loading={busy && pending === line.sauceId}
                          onClick={() => sendOne(line.sauceId, line.sauceName, value)}
                        >
                          Send
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.li>
            )
          })}
        </ul>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-subtle">
        <Icon name="info" size={13} />
        Whole bags move across, so the amount sent can land slightly above what was asked for.
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* What has gone across                                               */}
      {/* ------------------------------------------------------------------ */}
      {transfers.length > 0 ? (
        <Card padded={false}>
          <div className="border-b border-border p-5">
            <CardHeader className="mb-0" eyebrow="History" title="Recent deliveries" />
          </div>
          <Table
            rows={transfers}
            rowKey={(row) => row.id}
            className="rounded-none border-0"
            stickyHeader={false}
            columns={[
              {
                key: 'when',
                header: 'When',
                cell: (row) => (
                  <div>
                    <span className="font-medium text-ink">
                      {formatRelativeDay(row.transfer_date)}
                    </span>
                    <span className="block text-2xs text-ink-subtle">
                      {formatInstant(row.created_at, 'HH:mm')}
                    </span>
                  </div>
                ),
              },
              {
                key: 'sauce',
                header: 'Sauce',
                cell: (row) => <span className="font-medium text-ink">{row.sauceName}</span>,
              },
              {
                key: 'route',
                header: 'Route',
                hideOnMobile: true,
                cell: (row) => (
                  <span className="text-ink-muted">
                    {row.fromSiteName} → {row.toSiteName}
                  </span>
                ),
              },
              {
                key: 'amount',
                header: 'Sent',
                align: 'right',
                cell: (row) => (
                  <div className="text-right">
                    <span className="font-semibold text-ink">{formatMl(row.ml)}</span>
                    <span className="block text-2xs text-ink-subtle">
                      {row.bags} bag{row.bags === 1 ? '' : 's'}
                    </span>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      ) : null}
    </div>
  )
}
