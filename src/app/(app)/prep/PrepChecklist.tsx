'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Icon,
  LinkButton,
  Modal,
  ProgressBar,
  Select,
  Stepper,
  useToast,
} from '@/components/ui'
import {
  addPrepLine,
  completePrepLine,
  endPrepSession,
  startPrepSession,
  undoPrepLine,
} from '@/lib/actions/prep'
import { formatShort, formatTimeOfDay, hoursBetween, sealedExpiryFor } from '@/lib/date'
import { motion as motionTokens } from '@/lib/design/tokens'
import { packVolume } from '@/lib/forecast/packing'
import { formatMl } from '@/lib/utils/volume'
import type { PrepBoard, PrepLine } from '@/lib/queries/planning'

export interface PrepChecklistProps {
  board: PrepBoard
  isToday: boolean
  siteName: string
  sauces: Array<{ id: string; name: string }>
  bagSizesMl: number[]
  isManager: boolean
}

export function PrepChecklist({
  board,
  isToday,
  siteName,
  sauces,
  bagSizesMl,
  isManager,
}: PrepChecklistProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [busy, startTransition] = React.useTransition()
  const [addOpen, setAddOpen] = React.useState(false)
  const [newSauceId, setNewSauceId] = React.useState<string | null>(null)
  const [newQuantity, setNewQuantity] = React.useState(2000)

  const { lines, session, completedCount } = board
  const running = Boolean(session && !session.ended_at)
  const allDone = lines.length > 0 && completedCount === lines.length

  const clockIn = () => {
    startTransition(async () => {
      const result = await startPrepSession({ prepDate: board.prepDate })
      if (result.ok) {
        toast({ tone: 'success', title: 'Prep started', description: 'Your hours are now being recorded.' })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not start', description: result.error })
      }
    })
  }

  const clockOut = () => {
    if (!session) return
    startTransition(async () => {
      const result = await endPrepSession(session.id)
      if (result.ok) {
        toast({ tone: 'success', title: 'Prep finished', description: 'Your hours have been logged.' })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not finish', description: result.error })
      }
    })
  }

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/* Where things stand                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                <Icon name="map-pin" size={15} className="text-ink-muted" />
                {siteName}
              </span>
              {session ? (
                <Badge tone={running ? 'success' : 'neutral'} icon="clock">
                  {running
                    ? `Started ${formatTimeOfDay(session.started_at)}`
                    : `${hoursBetween(session.started_at, session.ended_at!)} hrs logged`}
                </Badge>
              ) : null}
            </div>

            <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">
              {lines.length === 0
                ? 'Nothing to make yet'
                : `${completedCount} of ${lines.length} sauces done`}
            </p>

            {lines.length > 0 ? (
              <>
                <ProgressBar
                  className="mt-3 max-w-md"
                  value={completedCount}
                  max={lines.length}
                  tone={allDone ? 'success' : 'brand'}
                />
                <p className="mt-2 text-sm text-ink-muted">
                  {formatMl(board.totalMadeMl)} made of {formatMl(board.totalPlannedMl)} planned
                  {board.totalMadeMl > 0
                    ? ` · everything dated ${formatShort(sealedExpiryFor(board.prepDate))}`
                    : ''}
                </p>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button variant="secondary" size="lg" leadingIcon="plus" onClick={() => setAddOpen(true)}>
              Add a sauce
            </Button>
            {running ? (
              <Button size="lg" leadingIcon="check" loading={busy} onClick={clockOut}>
                Finish prep
              </Button>
            ) : session ? null : (
              <Button size="lg" variant="secondary" leadingIcon="play" loading={busy} onClick={clockIn}>
                Start my shift
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Anything the kitchen needs to know before starting                 */}
      {/* ------------------------------------------------------------------ */}
      {allDone && running ? (
        <Callout tone="success" title="All sauces made">
          Press <strong>Finish prep</strong> to clock out and record your hours.
        </Callout>
      ) : null}

      {!board.hasPlan ? (
        <Callout tone="warning" title="No plan for this day yet">
          {isManager ? (
            <>
              Build the forecast on the{' '}
              <LinkButton href="/planner" variant="ghost" size="sm">
                Prep planner
              </LinkButton>{' '}
              and the quantities will appear here straight away.
            </>
          ) : (
            'Your manager builds the quantities in the planner. You can still add sauces below and record what you make.'
          )}
        </Callout>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* The list                                                           */}
      {/* ------------------------------------------------------------------ */}
      {lines.length === 0 ? (
        <Card>
          <EmptyState
            icon="clipboard-list"
            title="Nothing on the list"
            description={
              board.hasPlan
                ? 'The plan for this day has no quantities above zero. Add a sauce if you are making something anyway.'
                : 'Once a plan exists the sauces and quantities show up here automatically.'
            }
            action={
              <Button leadingIcon="plus" onClick={() => setAddOpen(true)}>
                Add a sauce
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {lines.map((line, index) => (
            <PrepRow
              key={line.sauceId}
              line={line}
              index={index}
              prepDate={board.prepDate}
              bagSizesMl={bagSizesMl}
              locked={!isToday && !isManager}
            />
          ))}
        </ul>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Add a sauce                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a sauce"
        description="For anything you're making today that wasn't in the plan."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!newSauceId}
              onClick={() => {
                if (!newSauceId) return
                startTransition(async () => {
                  const result = await addPrepLine({
                    sauceId: newSauceId,
                    prepDate: board.prepDate,
                    plannedMl: newQuantity,
                  })
                  if (result.ok) {
                    toast({ tone: 'success', title: 'Added to the list' })
                    setAddOpen(false)
                    setNewSauceId(null)
                    router.refresh()
                  } else {
                    toast({ tone: 'danger', title: 'Could not add', description: result.error })
                  }
                })
              }}
            >
              Add
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Select
            label="Sauce"
            value={newSauceId}
            onChange={setNewSauceId}
            placeholder="Choose a sauce"
            options={sauces
              .filter((sauce) => !lines.some((line) => line.sauceId === sauce.id))
              .map((sauce) => ({ value: sauce.id, label: sauce.name }))}
          />
          <Stepper
            label="How much are you making?"
            value={newQuantity}
            onChange={setNewQuantity}
            min={0}
            max={100_000}
            step={100}
            unit="ml"
          />
        </div>
      </Modal>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* One sauce — one step                                                       */
/* -------------------------------------------------------------------------- */

function PrepRow({
  line,
  index,
  prepDate,
  bagSizesMl,
  locked,
}: {
  line: PrepLine
  index: number
  prepDate: string
  bagSizesMl: number[]
  locked: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()

  // Pre-filled with the least-wasteful way to hit the planned volume, so the
  // common case ("we made exactly what was asked") is a single tap.
  const [pack, setPack] = React.useState<Record<number, number>>(() =>
    line.plannedMl > 0 ? packVolume(line.plannedMl, bagSizesMl).counts : {},
  )

  const done = Boolean(line.completedAt)
  const totalMl = bagSizesMl.reduce((sum, size) => sum + size * (pack[size] ?? 0), 0)
  const totalBags = bagSizesMl.reduce((sum, size) => sum + (pack[size] ?? 0), 0)
  const difference = totalMl - line.plannedMl

  const setCount = (size: number, count: number) => {
    setPack((current) => ({ ...current, [size]: Math.max(0, count) }))
  }

  const markMade = () => {
    startTransition(async () => {
      const result = await completePrepLine({ sauceId: line.sauceId, prepDate, pack })
      if (result.ok) {
        toast({
          tone: 'success',
          title: `${line.sauceName} done`,
          description: `${formatMl(result.data!.madeMl)} in ${result.data!.bags} bag${
            result.data!.bags === 1 ? '' : 's'
          } — use by ${formatShort(result.data!.sealedExpiry)}.`,
        })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not save', description: result.error })
      }
    })
  }

  const undo = () => {
    startTransition(async () => {
      const result = await undoPrepLine({ sauceId: line.sauceId, prepDate })
      if (result.ok) {
        toast({ tone: 'info', title: `${line.sauceName} reopened` })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not undo', description: result.error })
      }
    })
  }

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index * 0.03, 0.25),
        duration: motionTokens.duration.slow,
        ease: motionTokens.ease.out,
      }}
    >
      <Card className={done ? 'border-success/35 bg-success-soft/25' : undefined} padded={false}>
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:gap-6">
          {/* Which sauce, and how much ---------------------------------- */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              aria-hidden="true"
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                done ? 'bg-success text-raw-neutral-0' : 'bg-surface-sunken text-ink-muted'
              }`}
            >
              <Icon name={done ? 'check' : 'chef-hat'} size={20} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-semibold text-ink">{line.sauceName}</h3>
                {line.unplanned ? (
                  <Badge tone="neutral" size="sm" dot>
                    extra
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-ink-muted">
                {done
                  ? `${formatMl(line.actualMl)} in ${line.bagsMade} bag${line.bagsMade === 1 ? '' : 's'} · ${formatTimeOfDay(line.completedAt!)}`
                  : line.plannedMl > 0
                    ? `Make ${formatMl(line.plannedMl)}`
                    : 'No planned amount'}
              </p>
            </div>
          </div>

          {/* Bags, then done -------------------------------------------- */}
          {done ? (
            <Button
              variant="ghost"
              size="md"
              leadingIcon="refresh-cw"
              loading={busy}
              disabled={locked}
              onClick={undo}
            >
              Undo
            </Button>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:shrink-0">
              <div className="flex flex-wrap items-center gap-1.5">
                {bagSizesMl.map((size) => {
                  const count = pack[size] ?? 0
                  return (
                    <div
                      key={size}
                      className={`flex items-center overflow-hidden rounded-lg border bg-surface ${
                        count > 0 ? 'border-brand/45' : 'border-border'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={count <= 0 || locked}
                        onClick={() => setCount(size, count - 1)}
                        aria-label={`One fewer ${formatMl(size)} bag of ${line.sauceName}`}
                        className="grid h-10 w-7 place-items-center text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35"
                      >
                        <Icon name="minus" size={13} />
                      </button>
                      <span className="w-[4.25rem] text-center text-sm font-medium tabular-nums text-ink">
                        {count} × {formatMl(size)}
                      </span>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setCount(size, count + 1)}
                        aria-label={`One more ${formatMl(size)} bag of ${line.sauceName}`}
                        className="grid h-10 w-7 place-items-center text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-35"
                      >
                        <Icon name="plus" size={13} />
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="flex items-center gap-3">
                <span className="whitespace-nowrap text-sm tabular-nums text-ink-muted">
                  {formatMl(totalMl)}
                  {line.plannedMl > 0 && difference !== 0 ? (
                    <span className={difference > 0 ? 'text-warning' : 'text-danger'}>
                      {' '}
                      ({difference > 0 ? '+' : ''}
                      {formatMl(difference)})
                    </span>
                  ) : null}
                </span>
                <Button
                  size="lg"
                  leadingIcon="check"
                  loading={busy}
                  disabled={totalBags < 1 || locked}
                  onClick={markMade}
                >
                  Made it
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </motion.li>
  )
}
