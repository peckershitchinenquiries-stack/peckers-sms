'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Badge,
  BlastChillTimer,
  Button,
  Callout,
  Card,
  CardHeader,
  EmptyState,
  Icon,
  Modal,
  Select,
  StatCard,
  Stepper,
  useToast,
} from '@/components/ui'
import { PackBadge } from '@/components/app/StatusPills'
import {
  addChecklistSauce,
  endPrepSession,
  setChecklistQuantity,
  setChecklistStep,
  startPrepSession,
} from '@/lib/actions/prep'
import { completeVacuumPack } from '@/lib/actions/batches'
import {
  BLAST_CHILL_MINUTES,
  formatTimeOfDay,
  hoursBetween,
  sealedExpiryFor,
  formatShort,
  type DateOnly,
} from '@/lib/date'
import { motion as motionTokens } from '@/lib/design/tokens'
import { packVolume } from '@/lib/forecast/packing'
import { formatMl } from '@/lib/utils/volume'
import type { ChecklistEntry, PlanView, SessionView } from '@/lib/queries/planning'
import type { Site } from '@/lib/types/database'

export interface PrepChecklistProps {
  siteId: string | null
  siteName: string
  sites: Site[]
  prepDate: DateOnly
  coversDays: number
  isToday: boolean
  session: SessionView | null
  plan: PlanView | null
  sauces: Array<{ id: string; name: string }>
  canManageSite: boolean
  bagSizesMl: number[]
}

export function PrepChecklist({
  siteId,
  siteName,
  sites,
  prepDate,
  coversDays,
  isToday,
  session,
  plan,
  sauces,
  canManageSite,
  bagSizesMl,
}: PrepChecklistProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [busy, startTransition] = React.useTransition()
  const [addOpen, setAddOpen] = React.useState(false)
  const [newSauceId, setNewSauceId] = React.useState<string | null>(null)
  const [newQuantity, setNewQuantity] = React.useState(2000)

  // Memoised so the progress useMemo below has a stable dependency.
  const entries = React.useMemo(() => session?.entries ?? [], [session])

  const progress = React.useMemo(() => {
    const total = entries.length
    const packed = entries.filter((entry) => entry.vacuum_packed_at).length
    const chilled = entries.filter((entry) => entry.blast_chilled_at).length
    const cooked = entries.filter((entry) => entry.cooked_at).length
    const bags = entries.reduce((sum, entry) => sum + entry.bagsCreated, 0)
    const ml = entries.reduce((sum, entry) => sum + entry.mlCreated, 0)
    return { total, packed, chilled, cooked, bags, ml }
  }, [entries])

  const changeSite = (nextSiteId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('site', nextSiteId)
    router.push(`/prep?${params.toString()}`)
  }

  const begin = () => {
    startTransition(async () => {
      const result = await startPrepSession({ siteId: siteId ?? undefined, prepDate })
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not start prep', description: result.error })
        return
      }
      toast({
        tone: 'success',
        title: 'Prep session started',
        description: 'Your clock-in time has been recorded for overtime.',
      })
      router.refresh()
    })
  }

  const finish = () => {
    if (!session) return
    startTransition(async () => {
      const result = await endPrepSession(session.session.id)
      if (result.ok) {
        toast({
          tone: 'success',
          title: 'Prep session finished',
          description: 'Hours worked have been added to the overtime log.',
        })
        router.refresh()
      } else {
        toast({ tone: 'danger', title: 'Could not finish', description: result.error })
      }
    })
  }

  if (!siteId) {
    return (
      <EmptyState
        icon="map-pin"
        title="No site assigned"
        description="Your account isn't linked to a kitchen yet. Ask a manager to set this in Settings → Staff."
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Session bar                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            {canManageSite && sites.length > 1 ? (
              <Select
                value={siteId}
                onChange={changeSite}
                size="sm"
                className="min-w-[9.5rem]"
                options={sites.map((site) => ({
                  value: site.id,
                  label: site.name,
                  icon: 'map-pin' as const,
                }))}
              />
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                <Icon name="map-pin" size={15} className="text-ink-muted" />
                {siteName}
              </span>
            )}

            {session ? (
              <>
                <Badge tone={session.session.ended_at ? 'neutral' : 'success'} icon="clock">
                  {session.session.ended_at ? 'Finished' : 'In progress'}
                </Badge>
                <span className="text-sm text-ink-muted">
                  {formatTimeOfDay(session.session.started_at)}
                  {session.session.ended_at
                    ? ` – ${formatTimeOfDay(session.session.ended_at)} · ${hoursBetween(
                        session.session.started_at,
                        session.session.ended_at,
                      )} hrs`
                    : ' · running'}
                </span>
              </>
            ) : (
              <Badge tone="neutral" icon="clock">
                Not started
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            {session ? (
              <>
                <Button
                  variant="secondary"
                  size="lg"
                  leadingIcon="plus"
                  onClick={() => setAddOpen(true)}
                >
                  Add sauce
                </Button>
                {!session.session.ended_at ? (
                  <Button size="lg" leadingIcon="check" loading={busy} onClick={finish}>
                    Finish prep
                  </Button>
                ) : null}
              </>
            ) : (
              <Button size="xl" leadingIcon="play" loading={busy} onClick={begin}>
                Start prep session
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Progress                                                           */}
      {/* ------------------------------------------------------------------ */}
      {session ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Sauces done"
            value={`${progress.packed}/${progress.total}`}
            icon="check-circle"
            tone={progress.packed === progress.total ? 'success' : 'brand'}
            hint="Vacuum packed"
          />
          <StatCard label="Cooked" value={progress.cooked} unit={`of ${progress.total}`} icon="flame" tone="warning" />
          <StatCard label="Chilled" value={progress.chilled} unit={`of ${progress.total}`} icon="snowflake" tone="brand" />
          <StatCard
            label="Volume packed"
            value={formatMl(progress.ml)}
            icon="package"
            tone="success"
            hint={`${progress.bags} bags · expire ${formatShort(sealedExpiryFor(prepDate))}`}
          />
        </div>
      ) : null}

      {!session && plan ? (
        <Callout tone="info" title={`${formatMl(plan.totalMl)} planned for this prep day`}>
          Press <strong>Start prep session</strong> to clock in and load the checklist. Your start
          time is what the overtime log is built from.
        </Callout>
      ) : null}

      {!session && !plan ? (
        <Callout tone="warning" title="No plan for this prep day yet">
          A manager needs to build the forecast in the Prep planner first. You can still start a
          session and add sauces manually.
        </Callout>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* The checklist                                                      */}
      {/* ------------------------------------------------------------------ */}
      {session ? (
        entries.length === 0 ? (
          <Card>
            <EmptyState
              icon="clipboard-list"
              title="Nothing on the checklist"
              description="This session has no sauces yet. Add the first one to get going."
              action={
                <Button leadingIcon="plus" onClick={() => setAddOpen(true)}>
                  Add a sauce
                </Button>
              }
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {entries.map((entry, index) => (
                <ChecklistCard
                  key={entry.id}
                  entry={entry}
                  index={index}
                  sessionId={session.session.id}
                  siteId={siteId}
                  prepDate={prepDate}
                  bagSizesMl={bagSizesMl}
                  disabled={Boolean(session.session.ended_at)}
                />
              ))}
            </AnimatePresence>
          </ul>
        )
      ) : (
        <Card padded={false}>
          <div className="border-b border-border p-5">
            <CardHeader
              className="mb-0"
              eyebrow="Planned"
              title="What this batch needs to cover"
              description={`${coversDays} days of demand. Quantities come from the forecast and any manager overrides.`}
            />
          </div>
          {plan && plan.items.length > 0 ? (
            <ul className="divide-y divide-border">
              {plan.items
                .filter((item) => item.finalMl > 0)
                .map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-ink">{item.sauceName}</span>
                      {item.overrideMl !== null && item.overrideMl !== item.suggestedMl ? (
                        <Badge tone="brand" size="sm" icon="edit">
                          overridden
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <PackBadge counts={item.pack.counts} />
                      <span className="text-sm font-semibold tabular-nums text-ink">
                        {formatMl(item.finalMl)}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <EmptyState
              icon="sparkles"
              title="No plan yet"
              description="Build the forecast in the Prep planner and it will appear here."
            />
          )}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Add sauce                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a sauce to this session"
        description="For anything being made today that wasn't in the plan."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!newSauceId}
              onClick={() => {
                if (!session || !newSauceId) return
                startTransition(async () => {
                  const result = await addChecklistSauce({
                    sessionId: session.session.id,
                    sauceId: newSauceId,
                    plannedMl: newQuantity,
                  })
                  if (result.ok) {
                    toast({ tone: 'success', title: 'Added to the checklist' })
                    setAddOpen(false)
                    setNewSauceId(null)
                    router.refresh()
                  } else {
                    toast({ tone: 'danger', title: 'Could not add', description: result.error })
                  }
                })
              }}
            >
              Add to checklist
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
              .filter((sauce) => !entries.some((entry) => entry.sauce_id === sauce.id))
              .map((sauce) => ({ value: sauce.id, label: sauce.name }))}
          />
          <Stepper
            label="Volume needed"
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
/* One sauce                                                                  */
/* -------------------------------------------------------------------------- */

function ChecklistCard({
  entry,
  index,
  sessionId,
  siteId,
  prepDate,
  bagSizesMl,
  disabled,
}: {
  entry: ChecklistEntry
  index: number
  sessionId: string
  siteId: string
  prepDate: DateOnly
  bagSizesMl: number[]
  disabled: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [busy, startTransition] = React.useTransition()
  const [quantity, setQuantity] = React.useState(entry.planned_ml)
  const [packOpen, setPackOpen] = React.useState(false)

  const cooked = Boolean(entry.cooked_at)
  const chilling = Boolean(entry.blast_chilled_at)
  const packed = Boolean(entry.vacuum_packed_at)
  const suggestedPack = React.useMemo(() => packVolume(quantity, bagSizesMl), [quantity, bagSizesMl])

  const toggle = (step: 'cooked_at' | 'blast_chilled_at', done: boolean) => {
    startTransition(async () => {
      const result = await setChecklistStep({ checklistId: entry.id, step, done })
      if (!result.ok) {
        toast({ tone: 'danger', title: 'Could not update', description: result.error })
        return
      }
      if (step === 'blast_chilled_at' && done) {
        toast({
          tone: 'info',
          title: `${entry.sauceName} in the blast chiller`,
          description: `${BLAST_CHILL_MINUTES} minute hold — the timer keeps running if you close this.`,
        })
      }
      router.refresh()
    })
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{
        delay: index * 0.03,
        duration: motionTokens.duration.slow,
        ease: motionTokens.ease.out,
      }}
    >
      <Card
        className={packed ? 'border-success/35 bg-success-soft/30' : undefined}
        padded={false}
      >
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center">
          {/* Identity ---------------------------------------------------- */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              aria-hidden="true"
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                packed ? 'bg-success text-raw-neutral-0' : 'bg-surface-sunken text-ink-muted'
              }`}
            >
              <Icon name={packed ? 'check' : 'chef-hat'} size={20} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-ink">{entry.sauceName}</h3>
              <p className="mt-0.5 text-xs text-ink-muted">
                {packed
                  ? `${formatMl(entry.mlCreated)} (${entry.bagsCreated} bags) packed at ${formatTimeOfDay(entry.vacuum_packed_at!)}`
                  : `${formatMl(entry.planned_ml)} planned`}
              </p>
            </div>
          </div>

          {/* Steps ------------------------------------------------------- */}
          <div className="flex flex-wrap items-center gap-2.5">
            <StepButton
              label="Cooked"
              icon="flame"
              done={cooked}
              disabled={disabled || packed || busy}
              onClick={() => toggle('cooked_at', !cooked)}
              timestamp={entry.cooked_at}
            />

            <Icon name="chevron-right" size={16} className="hidden text-ink-subtle sm:block" />

            <StepButton
              label="Blast chilled"
              icon="snowflake"
              done={chilling}
              disabled={disabled || !cooked || packed || busy}
              onClick={() => toggle('blast_chilled_at', !chilling)}
              timestamp={entry.blast_chilled_at}
            />

            <Icon name="chevron-right" size={16} className="hidden text-ink-subtle sm:block" />

            {packed ? (
              <span className="inline-flex h-tap items-center gap-2 rounded-lg bg-success-soft px-4 text-sm font-semibold text-success-on-soft">
                <Icon name="package" size={17} />
                Vacuum packed
              </span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Stepper
                  size="sm"
                  value={quantity}
                  onChange={(value) => {
                    setQuantity(value)
                    startTransition(async () => {
                      await setChecklistQuantity({ checklistId: entry.id, plannedMl: value })
                    })
                  }}
                  min={0}
                  max={100_000}
                  step={100}
                  unit="ml"
                  disabled={disabled}
                />
                <Button
                  size="lg"
                  leadingIcon="package"
                  disabled={disabled || !chilling || quantity < 1}
                  onClick={() => setPackOpen(true)}
                >
                  Pack {suggestedPack.totalBags} bag{suggestedPack.totalBags === 1 ? '' : 's'}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Blast-chill timer --------------------------------------------- */}
        <AnimatePresence>
          {chilling && !packed ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: motionTokens.duration.slow, ease: motionTokens.ease.out }}
              className="overflow-hidden border-t border-border"
            >
              <div className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:justify-between">
                <div className="max-w-sm text-center sm:text-left">
                  <p className="text-sm font-semibold text-ink">Blast chilling</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    Hold for {BLAST_CHILL_MINUTES} minutes before vacuum packing. The countdown runs
                    from the timestamp, so it survives a refresh or a different tablet.
                  </p>
                </div>
                <BlastChillTimer startedAt={entry.blast_chilled_at} />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </Card>

      <PackModal
        open={packOpen}
        onClose={() => setPackOpen(false)}
        sauceName={entry.sauceName}
        targetMl={quantity}
        bagSizesMl={bagSizesMl}
        onConfirm={(pack) => {
          startTransition(async () => {
            const result = await completeVacuumPack({
              checklistId: entry.id,
              sessionId,
              sauceId: entry.sauce_id,
              siteId,
              prepDate,
              pack,
            })
            if (result.ok) {
              toast({
                tone: 'success',
                title: `${entry.sauceName} packed`,
                description: `${formatMl(result.data!.createdMl)} sealed — each bag expires ${formatShort(sealedExpiryFor(prepDate))}.`,
              })
              setPackOpen(false)
              router.refresh()
            } else {
              toast({ tone: 'danger', title: 'Could not pack', description: result.error })
            }
          })
        }}
        busy={busy}
      />
    </motion.li>
  )
}

function StepButton({
  label,
  icon,
  done,
  disabled,
  onClick,
  timestamp,
}: {
  label: string
  icon: 'flame' | 'snowflake'
  done: boolean
  disabled: boolean
  onClick: () => void
  timestamp: string | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={done}
      className={`inline-flex h-tap min-w-[8.5rem] items-center gap-2.5 rounded-lg border-2 px-3.5 text-sm font-medium transition-colors duration-fast focus-ring disabled:cursor-not-allowed disabled:opacity-45 ${
        done
          ? 'border-success bg-success-soft text-success-on-soft'
          : 'border-border bg-surface text-ink hover:border-brand'
      }`}
    >
      <Icon name={done ? 'check' : icon} size={17} />
      <span className="text-left">
        <span className="block leading-tight">{label}</span>
        {timestamp ? (
          <span className="block text-2xs font-normal opacity-75">
            {formatTimeOfDay(timestamp)}
          </span>
        ) : null}
      </span>
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Pack modal — confirm (or hand-adjust) the bag-size breakdown               */
/* -------------------------------------------------------------------------- */

function PackModal({
  open,
  onClose,
  sauceName,
  targetMl,
  bagSizesMl,
  onConfirm,
  busy,
}: {
  open: boolean
  onClose: () => void
  sauceName: string
  targetMl: number
  bagSizesMl: number[]
  onConfirm: (pack: Record<number, number>) => void
  busy: boolean
}) {
  const [pack, setPack] = React.useState<Record<number, number>>({})

  // Re-seed with the least-wasteful suggestion each time the modal opens.
  React.useEffect(() => {
    if (open) setPack(packVolume(targetMl, bagSizesMl).counts)
  }, [open, targetMl, bagSizesMl])

  const totalMl = Object.entries(pack).reduce((sum, [size, count]) => sum + Number(size) * count, 0)
  const totalBags = Object.values(pack).reduce((sum, count) => sum + count, 0)
  const wasteMl = totalMl - targetMl

  const setCount = (size: number, count: number) => {
    setPack((current) => ({ ...current, [size]: Math.max(0, count) }))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pack ${sauceName}`}
      description={`Needs ${formatMl(targetMl)}. Adjust the mix below if you're short on a size today.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={totalBags < 1} onClick={() => onConfirm(pack)}>
            Confirm {totalBags} bag{totalBags === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {bagSizesMl.map((size) => {
            const count = pack[size] ?? 0
            return (
              <div
                key={size}
                className="flex items-center overflow-hidden rounded-lg border border-border bg-surface"
              >
                <button
                  type="button"
                  disabled={count <= 0}
                  onClick={() => setCount(size, count - 1)}
                  aria-label={`Fewer ${size}ml bags`}
                  className="grid h-10 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                >
                  <Icon name="minus" size={13} />
                </button>
                <span className="w-16 text-center text-sm font-medium tabular-nums text-ink">
                  {count} × {size}ml
                </span>
                <button
                  type="button"
                  onClick={() => setCount(size, count + 1)}
                  aria-label={`More ${size}ml bags`}
                  className="grid h-10 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  <Icon name="plus" size={13} />
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface-sunken px-3.5 py-2.5 text-sm">
          <span className="text-ink-muted">Total</span>
          <span className="font-semibold tabular-nums text-ink">
            {formatMl(totalMl)}
            {wasteMl !== 0 ? (
              <span className={wasteMl > 0 ? 'text-warning' : 'text-danger'}>
                {' '}
                ({wasteMl > 0 ? '+' : ''}
                {formatMl(wasteMl)})
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </Modal>
  )
}
